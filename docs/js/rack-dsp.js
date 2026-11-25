/* Track inserts, group buses and sample-clock modulation for both audio contexts. */
(() => {
  "use strict";
  const curve = fn => Float32Array.from({length:1025}, (_, i) => fn(i / 512 - 1));
  const rectifier = curve(Math.abs), clipPositive = new Float32Array([0, 0, 1]);
  const saturate = curve(x => Math.tanh(5 * x) / Math.tanh(5));

  App.makeRackGraph = (ctx, getP, tracks, mix, returns, stems) => {
    const gain = (value = 1) => { const n = ctx.createGain(); n.gain.value = value; return n; };
    const shape = c => { const n = ctx.createWaveShaper(); n.curve = c; return n; };
    const constant = value => {
      const n = ctx.createConstantSource(); n.offset.value = value; n.start(); return n;
    };
    const clear = wires => {
      for (const [from, to] of wires) from.disconnect(to);
      wires.length = 0;
    };
    const connect = (wires, from, to) => { from.connect(to); wires.push([from, to]); };
    const graph = () => ({input:gain(), output:gain(), wires:[], sig:"", detector:[], key:"", bus:null});
    const buses = Array.from({length:4}, graph);
    const strips = tracks.map(graph);
    const mic = gain(), followers = new Map();

    const envelope = (input, time) => {
      const rectify = shape(rectifier), smooth = ctx.createBiquadFilter(), delay = ctx.createDelay(.1);
      smooth.type = "lowpass"; smooth.Q.value = -6;
      smooth.frequency.value = Math.min(100, .6 / time);
      // A follower may control its own sound source. Break that feedback cycle explicitly.
      delay.delayTime.value = 128 / ctx.sampleRate;
      input.connect(rectify).connect(smooth).connect(delay);
      return {node:delay, dispose:() => { input.disconnect(rectify); rectify.disconnect(); smooth.disconnect(); delay.disconnect(); }};
    };
    const sourceTap = id => id === "mic" ? mic : /^kick/.test(id) ? tracks[+id.slice(4)].kick : tracks[+id.slice(5)].tin;
    const follower = id => {
      if (!followers.has(id)) {
        const env = envelope(sourceTap(id), .032), boost = gain(3), clamp = shape(clipPositive);
        env.node.connect(boost).connect(clamp);
        followers.set(id, clamp);
      }
      return followers.get(id);
    };
    const makeEffect = fx => {
      const v = fx.value;
      if (fx.type === "saturate") return shape(curve(x => Math.tanh((1 + 18 * v) * x) / Math.tanh(1 + 18 * v)));
      if (fx.type === "compress") {
        const n = ctx.createDynamicsCompressor(); n.threshold.value = -48 * v;
        n.ratio.value = 1 + 15 * v; n.attack.value = .005; n.release.value = .12; return n;
      }
      const n = ctx.createBiquadFilter(); n.type = fx.type;
      if (fx.type === "highshelf" || fx.type === "lowshelf") {
        n.frequency.value = fx.type === "lowshelf" ? 180 : 4000; n.gain.value = v * 30 - 15;
      } else { n.frequency.value = Math.min(ctx.sampleRate / 2, 30 * 600 ** v); n.Q.value = -3; }
      return n;
    };
    const syncChain = (g, cfg) => {
      const sig = JSON.stringify(cfg.chain);
      if (sig !== g.sig) {
        clear(g.wires);
        let last = g.input;
        for (const fx of cfg.chain) if (fx.on) {
          const node = makeEffect(fx); connect(g.wires, last, node); last = node;
        }
        connect(g.wires, last, g.basePath || g.output); g.sig = sig;
      }
      const key = [cfg.key,cfg.depth,cfg.release,cfg.threshold,cfg.ratio].join("/");
      if (key !== g.key) {
        if (g.env) { clear(g.detector); g.env.dispose(); g.env = null; }
        if (cfg.key !== "off" && cfg.depth > 0) {
          g.env = envelope(sourceTap(cfg.key), cfg.release);
          const threshold = 10 ** (cfg.threshold / 20), exponent = 1 - 1 / cfg.ratio;
          const reduction = shape(curve(x => x <= threshold ? 0 : (threshold / x) ** exponent - 1));
          const amount = gain(cfg.depth);
          connect(g.detector, g.env.node, reduction); connect(g.detector, reduction, amount);
          connect(g.detector, amount, g.output.gain);
        }
        g.key = key;
      }
    };
    for (const bus of buses) { bus.fader = gain(); bus.output.connect(bus.fader).connect(mix); }
    strips.forEach((g, i) => {
      const t = tracks[i];
      g.eq = App.ParametricEQ.graph(ctx,g.output);
      g.basePath=gain();g.basePath.connect(g.eq.input);g.alternates=new Map();
      // Modulated distortion adds wet-minus-dry signal to a parallel dry path.
      g.modFx = gain(); t.filter.connect(g.modFx).connect(t.trem);
      g.wet = null; g.level = gain(); t.pan.connect(g.level).connect(g.input);
      g.output.connect(t.sd); g.output.connect(t.sr);
      if (t.an) g.output.connect(t.an);
      g.macros = Array.from({length:4}, () => constant(0));
      g.velocity = constant(0); g.routeWires = []; g.automated = new Set(); g.releaseAt = [];
      const levelOffset = shape(new Float32Array([-1,1])); levelOffset.connect(g.level.gain);
      const releaseCV = shape(new Float32Array([-1,1])); g.releaseRate = gain(-4800);
      releaseCV.connect(g.releaseRate);
      g.targets = {release:[releaseCV,1],pitch:[t.pitch, 2400], cutoff:[t.cut, 6000], tone:[t.filter.detune,6000],
        pan:[t.pan.pan,1], level:[levelOffset,1]};
      // Clamp the sum of static send and bipolar modulation to a usable send level.
      for (const [name, send] of [["dly",t.sd],["rev",t.sr]]) {
        const amount = constant(0), limiter = shape(clipPositive);
        amount.connect(limiter).connect(send.gain); send.gain.value = 0;
        t.params[name] = amount.offset; g.targets[name] = [limiter,1];
      }
    });
    const addDrive = (g, i) => {
      const t = tracks[i], sh = shape(saturate), diff = gain(), inverted = gain(-1), wet = gain(0), amount = shape(clipPositive);
      t.filter.connect(sh).connect(diff); t.filter.connect(inverted).connect(diff);
      diff.connect(wet).connect(g.modFx); amount.connect(wet.gain);
      g.wet = {sh, inverted, diff, wet, amount}; g.targets.drive = [amount,1];
    };
    const oscillator = (g, cfg, time) => {
      const node = ctx.createOscillator(); node.type = cfg.lfoWave;
      node.frequency.value = cfg.lfoBeats ? getP().bpm / (60 * cfg.lfoBeats) : cfg.lfoRate;
      node.connect(g.lfoOut); node.start(time); return node;
    };
    const syncRoutes = (g, cfg, i) => {
      if (cfg.routes.some(r => r.source === "lfo")) {
        g.lfoOut ||= gain(); g.lfo ||= oscillator(g,cfg,ctx.currentTime);
        g.lfo.type = cfg.lfoWave;
        g.lfo.frequency.value = cfg.lfoBeats ? getP().bpm / (60 * cfg.lfoBeats) : cfg.lfoRate;
      } else if (g.lfo) {
        g.lfo.stop(); g.lfo.disconnect(); g.lfo = null;
      }
      const sig = JSON.stringify(cfg.routes);
      if (sig === g.routeSig) return;
      clear(g.routeWires);
      if (g.bias) { g.bias.stop(); g.bias.disconnect(); g.bias = null; }
      for (const r of cfg.routes) {
        if (r.target === "drive" && !g.wet) addDrive(g, i);
        const [dest, unit] = g.targets[r.target], bipolar = r.source === "lfo";
        const min = r.low, max = r.high, span = (max - min) * (bipolar ? .5 : 1);
        const bias = min + (bipolar ? span : 0);
        const source = bipolar ? g.lfoOut : r.source === "velocity" ? g.velocity
          : /^macro/.test(r.source) ? g.macros[+r.source.slice(5) - 1] : follower(r.source);
        if (span) {
          const amount = gain(span * unit); connect(g.routeWires, source, amount); connect(g.routeWires, amount, dest);
        }
        if (bias) {
          g.bias ||= constant(1);
          const offset = gain(bias * unit); connect(g.routeWires, g.bias, offset); connect(g.routeWires, offset, dest);
        }
      }
      g.routeSig = sig;
    };
    const sync = () => {
      const rack = getP().rack;
      buses.forEach((b, j) => { const cfg = rack.groups[j]; syncChain(b, cfg); b.fader.gain.value = cfg.level ** 2; });
      strips.forEach((g, i) => {
        const cfg = rack.strips[i]; syncChain(g, cfg); g.eq.sync(cfg.eq); syncRoutes(g, cfg, i);
        const dest = buses[cfg.bus]?.input || mix;
        if (g.bus !== dest) { if (g.bus) g.output.disconnect(g.bus); g.output.connect(dest); g.bus = dest; }
        cfg.macros.forEach((v,j) => {
          if (g.automated.has(j)) return;
          const param = g.macros[j].offset;
          if (g.releaseAt[j] > ctx.currentTime) param.setValueAtTime(v,g.releaseAt[j]);
          else if (g.base?.[j] !== v) {
            param.cancelScheduledValues(ctx.currentTime); param.setValueAtTime(v,ctx.currentTime);
          }
        });
        g.base = cfg.macros.slice();
      });
    };
    if (stems?.length) {
      const merger = ctx.createChannelMerger(stems.length * 2); merger.connect(ctx.destination);
      stems.forEach(({type,index}, i) => {
        const tap = type === "track" ? strips[index].output : type === "group" ? buses[index].fader : returns;
        const stereo = gain(), split = ctx.createChannelSplitter(2);
        stereo.channelCount = 2; stereo.channelCountMode = "explicit";
        tap.connect(stereo).connect(split); split.connect(merger,0,i*2); split.connect(merger,1,i*2+1);
      });
    }
    const automate = (i, lanes, step, start, end) => {
      const g = strips[i];
      g.macros.forEach((macro, j) => {
        const lane = lanes?.["macro" + (j + 1)], p = macro.offset;
        if (!lane?.points.length) {
          if (g.automated.delete(j)) {
            p.setValueAtTime(getP().rack.strips[i].macros[j],start); g.releaseAt[j] = start;
          }
          return;
        }
        g.automated.add(j);
        const from = App.curveValue(lane,step), to = App.curveValue(lane,step+1,from,"left");
        p.setValueAtTime(from,start);
        if (to !== from && App.curveShape(lane,step) === "linear") p.linearRampToValueAtTime(to,end);
        const edge = App.curveValue(lane,step+1);
        if (edge !== to) p.setValueAtTime(edge,end);
      });
    };
    const stop = () => strips.forEach((g,i) => {
      for (let j = 0; j < 4; j++) {
        const p = g.macros[j].offset; p.cancelScheduledValues(ctx.currentTime);
        p.setValueAtTime(getP().rack.strips[i].macros[j],ctx.currentTime);
      }
      g.automated.clear(); g.releaseAt = [];
    });
    const macro = (i,j,v) => {
      const g = strips[i], p = g.macros[j].offset;
      p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(v,ctx.currentTime,.008); g.automated.delete(j); g.releaseAt[j] = 0;
    };
    let tailCurve;
    const releaseVoice = (i,v,amp,out,seconds) => {
      if (!getP().rack.strips[i].routes.some(r => r.target === "release")) return null;
      if (!tailCurve) {
        // A sampled exponential can change speed continuously via its detune input.
        tailCurve = ctx.createBuffer(1,32000,8000);
        const data = tailCurve.getChannelData(0);
        for (let k=0;k<data.length;k++) data[k] = Math.expm1(-3*k/8000);
      }
      const gainStage = gain(), env = ctx.createBufferSource();
      env.buffer = tailCurve; env.loop = true; env.loopStart = 3.99; env.loopEnd = 4;
      env.playbackRate.value = 1/seconds;
      strips[i].releaseRate.connect(env.detune); v.mods.push([strips[i].releaseRate,env.detune]);
      env.connect(gainStage.gain); amp.disconnect(out); amp.connect(gainStage).connect(out);
      v.nodes.push(env,gainStage);
      return at => { env.start(at); v.src.push(env); };
    };
    const restart = time => strips.forEach((g,i) => {
      const cfg = getP().rack.strips[i];
      if (!g.lfo || !cfg.lfoBeats) return;
      const old = g.lfo; old.stop(time); old.onended = () => old.disconnect();
      g.lfo = oscillator(g,cfg,time);
    });
    // A cue crossfades complete insert chains. Every parallel path receives the
    // same input, so tails are retained and neutral processors stay at unity.
    const sceneChain = (i,from,to,start,end) => {
      const g=strips[i], weights=new Map();
      for(const [index,bank] of [from,to].entries()) for(const item of bank) {
        const id=JSON.stringify(item.chain);
        if(!weights.has(id))weights.set(id,{chain:item.chain,level:[0,0]});
        weights.get(id).level[index]=item.weight;
      }
      for(const [id,item] of weights) {
        if(id===g.sig || g.alternates.has(id))continue;
        let last=g.input;const wires=[];
        for(const fx of item.chain)if(fx.on){const node=makeEffect(fx);connect(wires,last,node);last=node;}
        const fader=gain(0);connect(wires,last,fader);connect(wires,fader,g.eq.input);
        g.alternates.set(id,{fader,wires});
      }
      const volume=(fader,id)=>{
        const [a,b]=weights.get(id)?.level || [0,0];
        fader.gain.setValueAtTime(a,start);if(a!==b)fader.gain.linearRampToValueAtTime(b,end);
      };
      volume(g.basePath,g.sig);
      for(const [id,path] of g.alternates)volume(path.fader,id);
    };
    function endScenes() {
      const now=ctx.currentTime;
      for(const [i,g] of strips.entries()) {
        for(const path of g.alternates.values())clear(path.wires);
        g.alternates.clear();g.basePath.gain.cancelScheduledValues(now);g.basePath.gain.setValueAtTime(1,now);
        g.eq.cancel(now);
        g.macros.forEach((macro,j)=>{macro.offset.cancelScheduledValues(now);macro.offset.setValueAtTime(getP().rack.strips[i].macros[j],now);});
      }
    }
    const sceneMacro=(ti,j,a,b,start,end)=>{
      const p=strips[ti].macros[j].offset;
      p.setValueAtTime(a,start);if(a!==b)p.linearRampToValueAtTime(b,end);
    };
    const tempo = (bpm,time) => strips.forEach((g,i) => {
      const beats=getP().rack.strips[i].lfoBeats;
      if (beats && g.lfo) g.lfo.frequency.setValueAtTime(bpm/(60*beats),time);
    });
    return {sync, automate, stop, macro, mic, restart, tempo, sceneMacro, sceneChain, endScenes, releaseVoice, eq:i=>strips[i].eq, tap:i => strips[i].output,
      velocity:(i,v,t) => strips[i].velocity.offset.setValueAtTime(v,t)};
  };
})();
