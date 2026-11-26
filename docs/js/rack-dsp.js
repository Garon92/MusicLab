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
    const graph = () => ({input:gain(), splitInput:gain(), output:gain(), detector:[], key:"", bus:null});
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
      if (fx.type === "room") {
        // A repeatable mono impulse preserves M/S encoding and stereo independence.
        const reverb=ctx.createConvolver(), length=Math.ceil(ctx.sampleRate*.75);
        const ir=ctx.createBuffer(1,length,ctx.sampleRate), data=ir.getChannelData(0);
        let seed=11621, energy=0;
        for(let i=Math.floor(ctx.sampleRate*.008);i<length;i++) {
          seed=(Math.imul(seed,1664525)+1013904223)>>>0;
          const tap=(seed/2147483648-1)*Math.exp(-7*i/length);
          data[i]=tap; energy+=tap*tap;
        }
        const scale=v/Math.sqrt(energy);
        for(let i=1;i<length;i++)data[i]*=scale;
        data[0]=1-v; reverb.normalize=false; reverb.buffer=ir;
        return reverb;
      }
      // Drive without a jump in level: a signal at -12 dBFS leaves at the level it came in, whatever the amount. Without
      // this the insert at its default was 15 dB louder than bypassed, since quiet signals sit on the steep part.
      if (fx.type === "saturate") { const k = 1 + 18 * v, ref = 0.25, unit = Math.tanh(k), g = ref / (Math.tanh(k * ref) / unit); return shape(curve(x => g * Math.tanh(k * x) / unit)); }
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
    // The crossover outputs are complementary at each sample (low + high = input).
    // Splitting the first high band again produces three bands that sum at unity.
    function buildSplit(source, output, cfg, own) {
      if (!cfg || cfg.mode === "off") { source.connect(output); return; }
      const level = value => own(gain(value));
      const crossover = (input, hz) => {
        const k = Math.tan(Math.PI * Math.min(hz,ctx.sampleRate*.48) / ctx.sampleRate);
        const b = 1 / (1+k), a = [1,(k-1)*b];
        const low = own(ctx.createIIRFilter([k*b,k*b],a)), high = own(ctx.createIIRFilter([b,-b],a));
        input.connect(low); input.connect(high); return [low,high];
      };
      let inputs, merger;
      if (cfg.mode === "bands") {
        const [low,upper] = crossover(source,cfg.low);
        inputs = [low,...crossover(upper,cfg.high)];
      } else if (cfg.mode === "ms") {
        const stereo = level(1), split = own(ctx.createChannelSplitter(2));
        stereo.channelCount=2; stereo.channelCountMode="explicit";
        source.connect(stereo).connect(split);
        const mid=level(.5), side=level(.5), negative=level(-1);
        split.connect(mid,0); split.connect(mid,1);
        split.connect(side,0); split.connect(negative,1); negative.connect(side);
        inputs=[mid,side]; merger=own(ctx.createChannelMerger(2)); merger.connect(output);
      } else inputs = [source,source];
      const solo = inputs.some((_,i) => cfg.paths[i].solo);
      // Branches are summed, so they must arrive together: each waits for the look-ahead of the compressors in the slowest one.
      const lag = App.compLagFrames(ctx.sampleRate) / ctx.sampleRate;
      const late = i => solo && !cfg.paths[i].solo ? 0 : cfg.paths[i].chain.filter(fx => fx.on && fx.type === "compress").length;
      const worst = lag ? Math.max(0,...inputs.map((_,i) => late(i))) : 0;
      inputs.forEach((input,i) => {
        const path=cfg.paths[i];
        if (solo && !path.solo) return;
        let last=input;
        for (const fx of path.chain) if (fx.on) last=last.connect(own(makeEffect(fx)));
        if (worst > late(i)) {
          const wait=own(ctx.createDelay(1)); wait.delayTime.value=(worst-late(i))*lag;
          last=last.connect(wait);
        }
        const branch=level(10 ** (path.db/20) * (cfg.mode === "parallel" ? .5 : 1));
        last.connect(branch);
        if (merger) {
          branch.connect(merger,0,0);
          (i===1 ? branch.connect(level(-1)) : branch).connect(merger,0,1);
        } else branch.connect(output);
      });
    }
    function buildSerial(source,output,chain,own) {
      let last=source;
      for (const fx of chain) if (fx.on) last=last.connect(own(makeEffect(fx)));
      last.connect(output);
    }
    // Two independently crossfaded banks keep serial inserts and split routing
    // editable as separate scene properties. Each completed path owns its wires.
    function pathBank(input,output,build) {
      const paths=new Map();
      let baseId,sceneActive=false;
      function path(id,config) {
        if (!paths.has(id)) {
          const inlet=gain(), fader=gain(0), nodes=[inlet,fader];
          const own=node=>{nodes.push(node);return node;};
          input.connect(inlet);build(inlet,fader,config,own);fader.connect(output);
          paths.set(id,{fader,retire:0,dispose(){
            input.disconnect(inlet);for(const node of nodes)node.disconnect();
          }});
        }
        const current=paths.get(id);current.retire++;return current;
      }
      function base(config,reset=false) {
        const id=JSON.stringify(config), first=baseId===undefined;
        if (id===baseId && !(reset && sceneActive))return;
        baseId=id;sceneActive=false;path(id,config);
        const now=ctx.currentTime, fade=first || now===0?0:.032;
        // Main-thread currentTime can trail the render thread by several quanta.
        // Schedule both sides together in the future so neither ramp starts late.
        const start=fade?now+.020:now;
        for (const [key,current] of paths) {
          const p=current.fader.gain, target=key===id?1:0;
          if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(start);
          else p.cancelScheduledValues(start);
          // Matched exponential gains sum to unity and start from their current
          // values even when a second edit interrupts a still-running fade.
          if(fade)p.setTargetAtTime(target,start,.003);else p.setValueAtTime(target,start);
          if(key===id)continue;
          const mark=++current.retire;
          const remove=()=>{if(current.retire===mark){current.dispose();paths.delete(key);}};
          // Dispose after the AUDIO clock crosses the end of the fade, including
          // suspended contexts. A revived scene invalidates this retirement.
          if(!fade)remove();else {
            const clock=ctx.createConstantSource();clock.onended=remove;clock.start();clock.stop(start+fade);
          }
        }
      }
      function scene(from,to,start,end) {
        sceneActive=true;
        const weights=new Map();
        for(const [index,bank] of [from,to].entries())for(const item of bank){
          const id=JSON.stringify(item.chain);
          if(!weights.has(id)){weights.set(id,[0,0]);path(id,item.chain);}
          weights.get(id)[index]=item.weight;
        }
        for(const [id,current] of paths){
          const [a,b]=weights.get(id)||[0,0], p=current.fader.gain;
          p.setValueAtTime(a,start);if(a!==b)p.linearRampToValueAtTime(b,end);
        }
      }
      return {base,scene};
    }
    const syncChain = (g, cfg) => {
      g.serialBank ||= pathBank(g.input,g.splitInput,buildSerial);
      g.splitBank ||= pathBank(g.splitInput,g.eq?.input || g.output,buildSplit);
      g.serialBank.base(cfg.chain);g.splitBank.base(cfg.split);
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
      g.targets = {release:[releaseCV,1],scan:[t.scan,1],pitch:[t.pitch, 2400], cutoff:[t.cut, 6000], tone:[t.filter.detune,6000],
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
    const pickTap = (type,index,point="post") => {
      if (type === "track") return point === "pre" ? tracks[index].tin : point === "rack-in" ? strips[index].input : strips[index].output;
      if (type === "group") return point === "pre" || point === "rack-in" ? buses[index].input : buses[index].fader;
      return returns;
    };
    if (stems?.length) {
      const included=stems.find(s=>s.type==="returns")?.onlyTracks;
      if (Array.isArray(included)) strips.forEach((s,i)=>{
        if (!included.includes(i)) {s.output.disconnect(tracks[i].sd); s.output.disconnect(tracks[i].sr);}
      });
      const merger = ctx.createChannelMerger(stems.length * 2); merger.connect(ctx.destination);
      stems.forEach(({type,index,point}, i) => {
        const tap = pickTap(type,index,point);
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
    const sceneStrip=i=>i<8?strips[i]:buses[i-8];
    const sceneChain=(i,from,to,start,end)=>sceneStrip(i).serialBank.scene(from,to,start,end);
    const sceneSplit=(i,from,to,start,end)=>sceneStrip(i).splitBank.scene(from,to,start,end);
    function endScenes() {
      const now=ctx.currentTime;
      for(const [i,g] of [...strips,...buses].entries()) {
        const cfg=i<8?getP().rack.strips[i]:getP().rack.groups[i-8];
        g.serialBank?.base(cfg.chain,true);g.splitBank?.base(cfg.split,true);
        if(i>=8)continue;
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
    return {sync, automate, stop, macro, mic, restart, tempo, sceneMacro, sceneChain, sceneSplit, endScenes, releaseVoice, eq:i=>strips[i].eq, pickTap, tap:i => strips[i].output,
      velocity:(i,v,t) => strips[i].velocity.offset.setValueAtTime(v,t)};
  };
})();
