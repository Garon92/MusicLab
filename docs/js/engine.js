/* MUSICLAB · audio engine — voices, 8 channel strips, sends, master, capture.
   Runs unchanged on a live AudioContext and on an OfflineAudioContext (export). */
(() => {
  "use strict";
  const { clamp, mtof } = App;
  const WAVE = ["sine", "triangle", "sawtooth", "square"];
  const TRIM = [1, 1, 0.5, 0.42]; // equal-loudness trim per waveform
  const FTYPE = ["lowpass", "lowpass", "highpass", "bandpass"];
  const DELAY_BEATS = [0.125, 1 / 6, 0.25, 1 / 3, 0.375, 0.5, 2 / 3, 0.75, 1, 2];
  const LFO_UNITS = [8, 4, 2, 1, 2, 1, 0.5, 0.25]; // first four in bars, rest in beats

  // The recorder says which frame its first sample is, so a take can be cut to the beat. It works that out again on
  // every block (the frame now, less what it has taken): the first block of the first processor on a page reads
  // frame 0 in WebKit and one block early in Chromium, whatever the time really is, and every later block is right.
  const REC_SRC =
    'class R extends AudioWorkletProcessor{constructor(){super();this.a=new Float32Array(4096);this.b=new Float32Array(4096);this.n=0;this.t=0;this.on=true;this.first=-1;' +
    "this.port.onmessage=()=>{this.on=false;this.flush();this.port.postMessage(0)}}" +
    "flush(){if(!this.n)return;this.port.postMessage([this.a.slice(0,this.n),this.b.slice(0,this.n),this.first]);this.n=0}" +
    "process(i){if(!this.on)return false;this.first=currentFrame-this.t;const c=i[0],l=c&&c[0],r=c&&c[1]||l,m=l?l.length:128;" +
    "for(let k=0;k<m;k++){this.a[this.n]=l?l[k]:0;this.b[this.n]=r?r[k]:0;if(++this.n===4096)this.flush()}this.t+=m;return true}}" +
    'registerProcessor("ml-rec",R)';

  // A DynamicsCompressorNode looks ahead (6 ms in today's engines). Whatever sums a compressed path with an
  // uncompressed one, or trims a render to its start, needs the real figure, so it is measured once: an impulse through
  // a compressor that does nothing. The compressor is fed a trace of signal first, because that is how it runs here
  // (every strip is kept awake) and because Firefox lets the first block through a compressor that was idle untouched,
  // which makes a cold one look as if it had no look-ahead at all. Seconds; 0 until it lands a moment after load.
  App.compLag = 0;
  App.compLagReady = (async () => {
    try {
      const sr = 48000, at = sr / 4, ctx = new OfflineAudioContext(1, sr / 2, sr), b = ctx.createBuffer(1, sr / 2, sr), x = b.getChannelData(0);
      x.fill(0.001); x[at] = 0.5;
      const src = ctx.createBufferSource(), c = ctx.createDynamicsCompressor();
      src.buffer = b; c.threshold.value = 0; c.ratio.value = 1;
      src.connect(c).connect(ctx.destination); src.start(0);
      const d = (await ctx.startRendering()).getChannelData(0);
      let k = 0;
      for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[k])) k = i;
      App.compLag = Math.abs(d[k]) > 0.05 && k >= at ? (k - at) / sr : 0;
    } catch (e) { App.compLag = 0; }
    return App.compLag;
  })();
  App.compLagFrames = (sr) => Math.floor(App.compLag * sr + 1e-6);

  const reverse = (buf) => {
    const out = new AudioBuffer({ length: buf.length, sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels });
    for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(Float32Array.from(buf.getChannelData(c)).reverse());
    return out;
  };

  App.Engine = (ctx, getP, opt = {}) => {
    const live = !opt.offline, sr = ctx.sampleRate;
    const E = { ctx, voices: [], load: 0, input: null };
    let hard = true; // until the first sync, write values directly instead of gliding to them
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
    const set = (p, v, tc = 0.015) => { if (hard || !live) p.value = v; else p.setTargetAtTime(v, ctx.currentTime, tc); };

    /* ── master: EQ → compressor → limiter → hard ceiling → volume ── */
    const mix = G(), returns = G();
    returns.connect(mix);
    const sub = BQ("highpass", 20, -3); // nothing below hearing reaches the compressor or eats headroom
    const low = BQ("lowshelf", 120), mid = BQ("peaking", 1000, 0.8), high = BQ("highshelf", 6500);
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 12; comp.attack.value = 0.01; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    const ceil = ctx.createWaveShaper();
    ceil.curve = new Float32Array([-1, 1]);
    const out = G(0.64);
    mix.connect(sub).connect(low).connect(mid).connect(high).connect(comp).connect(lim).connect(ceil).connect(out);
    if (!opt.stems?.length) out.connect(ctx.destination);
    E.out = out;

    /* ── sends: ping-pong delay, convolution reverb ── */
    const dIn = G(), rIn = G(), pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner();
    let dL, dR, dTone, dFb, conv;
    pL.connect(returns); pR.connect(returns);
    const buildReturns = () => {
      dL = ctx.createDelay(2.5); dR = ctx.createDelay(2.5);
      dTone = BQ("lowpass", 4500, -3); dFb = G(0.4);
      dIn.connect(dL).connect(dR).connect(dTone).connect(dFb).connect(dL);
      dL.connect(pL); dR.connect(pR);
      conv = ctx.createConvolver(); rIn.connect(conv).connect(returns);
    };
    buildReturns();
    let irSig = "", irT = 0;
    const makeIR = (sec, damp) => {
      const n = Math.floor(sr * clamp(sec, 0.1, 10)), pre = Math.floor(sr * 0.012);
      const b = new AudioBuffer({ length: n + pre, sampleRate: sr, numberOfChannels: 2 });
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const x = i / n;
          lp += (Math.random() * 2 - 1 - lp) * (1 - damp * Math.min(0.97, 0.35 + x * 0.8));
          d[pre + i] = lp * Math.exp(-6.9 * x) * Math.min(1, i / 96);
        }
      }
      return b;
    };

    const noise = new AudioBuffer({ length: sr * 2, sampleRate: sr, numberOfChannels: 1 });
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }

    /* ── channel strips ── */
    const tr = [];
    for (let i = 0; i < 8; i++) {
      const t = {
        instrument: G(), tin: G(), kick: G(), sh: ctx.createWaveShaper(), post: G(), gate: G(), filter: BQ("lowpass", sr / 2, -3),
        trem: G(), vol: G(0), pan: ctx.createStereoPanner(), sd: G(0), sr: G(0),
        pitch: G(), cut: G(), // modulation buses in cents, summed into every voice of the track
        lfo: null, lg: G(0), ldest: 0, drive: -1, lastHz: 0, an: null, lv: 0,
      };
      t.scan = G(); t.scanBase = ctx.createConstantSource(); t.scanBase.offset.value = 0; t.scanBase.connect(t.scan); t.scanBase.start();
      t.instrument.connect(t.tin);
      t.tin.connect(t.sh).connect(t.post).connect(t.filter);
      t.trem.connect(t.gate).connect(t.vol).connect(t.pan);
      t.sd.connect(dIn);
      t.sr.connect(rIn);
      if (live) { t.an = ctx.createAnalyser(); t.an.fftSize = 512; }
      t.cutHz = ctx.createConstantSource(); t.cutHz.offset.value = 20000; t.cutHz.start();
      t.params = {cutoff:t.cutHz.offset, vol:t.vol.gain, pan:t.pan.pan, filter:t.filter.frequency, dly:t.sd.gain, rev:t.sr.gain};
      t.written = new Set();
      t.releaseAt = {};
      tr.push(t);
    }
    E.tracks = tr;
    const rack = E.rack = App.makeRackGraph(ctx, getP, tr, mix, returns, opt.stems);
    // A parameter only follows its schedule while its node is being rendered, and a node that nothing audible passes
    // through is not. A silent source into every strip and a muted sink for the modulation buses keep them rendered
    // between notes: a control moved in silence is already there when the next note starts, an LFO runs at the rate
    // it shows, and the master's compressors are warm before the first sound instead of fading in underneath it
    // (Firefox starts that fade when signal first arrives).
    const awake = ctx.createConstantSource(), asleep = G(0);
    awake.offset.value = 0; awake.start(); asleep.connect(ctx.destination);
    for (const t of tr) { awake.connect(t.instrument); t.cutHz.connect(asleep); t.cut.connect(asleep); t.pitch.connect(asleep); }

    const devOf = (T) => (T.kind === "syn" ? T.syn : T.kind === "smp" ? T.smp : null);
    const qOf = (d) => (d.ftype === 3 ? 0.7 + d.res * 0.6 : d.res); // LP/HP take resonance in dB, BP takes Q

    const audioValue = (key, v) => {
      if (key === "pan") return 2 * v - 1;
      if (key === "cutoff") return App.fromN(App.DEF.syn.cut,v);
      if (key === "filter") return 20 * (sr / 40) ** v;
      return v * v;
    };
    const baseValue = (T,key) => key === "cutoff" ? (devOf(T)?.cut ?? 20000) : audioValue(key, App.curveBase(T,key));
    E.automate = (ti, T, lanes, step, start, end) => {
      const t = tr[ti];
      // Adjacent scheduler windows must agree on the sample at a loop boundary.
      start = Math.round(start * sr) / sr;
      end = Math.round(end * sr) / sr;
      rack.automate(ti, lanes, step, start, end);
      for (const key of Object.keys(t.params)) {
        const lane = lanes?.[key], param = t.params[key];
        if (!lane?.points.length) {
          if (t.written.delete(key)) {
            t.releaseAt[key] = start;
            param.setValueAtTime(baseValue(T,key), start);
          }
          continue;
        }
        t.written.add(key);
        const from = App.curveValue(lane, step), to = App.curveValue(lane, step + 1, from, "left");
        param.setValueAtTime(audioValue(key, from), start);
        if (to !== from && App.curveShape(lane, step) === "linear") {
          if (key === "filter" || key === "cutoff") param.exponentialRampToValueAtTime(audioValue(key, to), end);
          else {
            // Volume and sends use the squared fader law. Sample that curvature
            // between step boundaries; pan is already linear in its audio unit.
            const segments = key === "pan" ? 1 : 4;
            for (let j = 1; j <= segments; j++) {
              const x = j / segments;
              param.linearRampToValueAtTime(audioValue(key, from + (to - from) * x), start + (end - start) * x);
            }
          }
        }
        // A point at the clip's very end can be discontinuous or stepped. Its
        // value also controls the note releases after the last offline pattern.
        const edge = App.curveValue(lane, step + 1);
        if (edge !== to) param.setValueAtTime(audioValue(key, edge), end);
      }
    };
    E.stopAutomation = () => {
      rack.stop();
      const now = ctx.currentTime;
      tr.forEach((t, i) => {
        const keys = new Set([...t.written, ...Object.keys(t.releaseAt)]);
        for (const key of keys) {
          const T = getP().tracks[i], param = t.params[key];
          const base = baseValue(T,key);
          if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
          else param.cancelScheduledValues(now);
          param.setTargetAtTime(base, now, .007);
        }
        t.written.clear(); t.releaseAt = {};
      });
    };

    const syncLfo = (t, d, P) => {
      const dest = d ? d.ldest : 0;
      if (!dest) {
        if (t.lfo) { t.lg.disconnect(); try { t.lfo.stop(); } catch (e) {} t.lfo.disconnect(); t.lfo = null; }
        t.ldest = 0;
        set(t.trem.gain, 1);
        return;
      }
      const beats = LFO_UNITS[d.ldiv] * (d.ldiv < 4 ? App.spb(P) / 4 : 1), hz = d.lsync ? P.bpm / 60 / beats : d.lrate;
      // a new oscillator is born at 440 Hz: give it its rate before it runs, or the first moments modulate at audio rate
      if (!t.lfo) { t.lfo = ctx.createOscillator(); t.lfo.frequency.value = hz; t.lfo.connect(t.lg); t.lfo.start(); }
      else set(t.lfo.frequency, hz);
      t.lfoHz = hz; // the rate asked for; the param itself may still be gliding towards it
      t.lfo.type = WAVE[d.lw];
      if (t.ldest !== dest) {
        t.lg.disconnect();
        t.lg.connect([null, t.pitch, t.cut, t.trem.gain, t.pan.pan][dest]);
        t.ldest = dest;
      }
      set(t.lg.gain, [0, d.ldep * d.ldep * 1200, d.ldep * 3600, d.ldep * 0.5, d.ldep][dest]);
      set(t.trem.gain, dest === 3 ? 1 - d.ldep * 0.5 : 1);
    };

    E.syncTrack = (i) => {
      const P = getP(), T = P.tracks[i], t = tr[i], d = devOf(T);
      const solo = P.tracks.some((x) => x.solo);
      set(t.gate.gain, !T.mute && (!solo || T.solo) ? 1 : 0);
      for (const key of Object.keys(t.params)) {
        if (t.written.has(key)) continue;
        const base = baseValue(T,key);
        if (t.releaseAt[key] > ctx.currentTime) t.params[key].setValueAtTime(base, t.releaseAt[key]);
        else set(t.params[key], base);
      }
      if (t.drive !== T.drive) {
        t.drive = T.drive;
        if (T.drive < 0.005) { t.sh.curve = null; t.post.gain.value = 1; }
        else {
          const k = 1 + T.drive * T.drive * 50, c = new Float32Array(1024), nk = Math.tanh(k);
          for (let j = 0; j < 1024; j++) c[j] = Math.tanh(k * (j / 511.5 - 1)) / nk;
          t.sh.curve = c;
          t.post.gain.value = k ** -0.45; // keep loudness roughly level as drive rises
        }
      }
      set(t.scanBase.offset, T.syn.scan || 0);
      syncLfo(t, d, P);
      // cutoff and resonance follow the control while notes are sounding
      if (d) for (const v of E.voices) if (v.ti === i && v.f.length) {
        set(v.cutScale.gain, clamp(d.cut * v.kt, 20, 20000) / d.cut);
        set(v.f[0].Q, qOf(d));
        if (v.tuningCV && v.tunedHz !== mtof(v.note,P)) {
          v.tunedHz = mtof(v.note,P);
          set(v.tuningCV.offset,1200 * Math.log2(v.tunedHz / v.originalHz),.006);
        }
        if (v.cloud && d.mode===2) v.cloud.refresh(d,v.tEnd);
      }
    };

    E.syncFx = () => {
      const P = getP(), f = P.fx, dt = clamp((DELAY_BEATS[f.dtime] * 60) / P.bpm, 0.01, 2.4);
      set(dL.delayTime, dt, 0.06); set(dR.delayTime, dt, 0.06);
      set(dFb.gain, f.dfb); set(dTone.frequency, f.dtone);
      set(pL.pan, -f.dwid); set(pR.pan, f.dwid);
      const ir = App.SignalWorkshop?.impulse(P,sr);
      const sig = ir ? P.impulse.sample + "/" + sr : f.rsize.toFixed(3) + "/" + f.rdamp.toFixed(3);
      if (sig !== irSig) {
        irSig = sig;
        clearTimeout(irT);
        const apply = () => (conv.buffer = ir || makeIR(f.rsize, f.rdamp));
        if (hard || !live) apply(); else irT = setTimeout(apply, 140);
      }
      set(low.gain, f.low); set(mid.gain, f.mid); set(high.gain, f.high);
      set(comp.threshold, -30 * f.comp); set(comp.ratio, 1 + 9 * f.comp);
      set(out.gain, f.vol * f.vol);
    };

    E.stopTempo=()=>{
      const P=getP(),time=ctx.currentTime;
      if(!P.arrangement?.tempo.length && !P.arrangement?.meters.length)return;
      dL.delayTime.cancelScheduledValues(time);dR.delayTime.cancelScheduledValues(time);
      for(const x of tr)if(x.lfo)x.lfo.frequency.cancelScheduledValues(time);
      E.tempo(P.bpm,App.spb(P),time);
    };
    E.tempo=(bpm,barSteps,time)=>{
      const P=getP();
      if(!P.arrangement?.tempo.length && !P.arrangement?.meters.length)return;
      const dt=clamp(DELAY_BEATS[P.fx.dtime]*60/bpm,.01,2.4);
      dL.delayTime.setTargetAtTime(dt,time,.015);dR.delayTime.setTargetAtTime(dt,time,.015);
      tr.forEach((t,i)=>{
        const d=devOf(P.tracks[i]);
        if(t.lfo && d?.lsync){
          const beats=LFO_UNITS[d.ldiv]*(d.ldiv<4 ? barSteps/4 : 1);
          t.lfo.frequency.setValueAtTime(bpm/60/beats,time);
        }
      });
      rack.tempo?.(bpm,time);
    };
    const masterScene = () => ({vol:out.gain,low:low.gain,mid:mid.gain,high:high.gain,dfb:dFb.gain,dtone:dTone.frequency,
      comp:comp.threshold,dwid:pR.pan});
    const sceneWritten=new Set();
    E.sceneParam=(key,index,from,to,start,end)=>{
      const schedule=(p,a,b)=>{
        sceneWritten.add(p);
        p.setValueAtTime(a,start);
        if(a!==b)p.linearRampToValueAtTime(b,end);
      };
      if(index>=0){
        const t=tr[index], p=t.params[key];
        if(p)schedule(p,key==="cutoff" || key==="pan"?from:audioValue(key,from),key==="cutoff" || key==="pan"?to:audioValue(key,to));
        return;
      }
      const p=masterScene()[key];
      if(!p)return;
      const val=v=>key==="comp"?-30*v:key==="vol"?v*v:v;
      schedule(p,val(from),val(to));
      if(key==="comp")schedule(comp.ratio,1+9*from,1+9*to);
      if(key==="dwid")schedule(pL.pan,-from,-to);
    };
    // What a cue can carry of a device in time: the wavetable position, and the LFO's depth and free rate while it stays
    // on one destination. A cue that moves the LFO to another destination or wave takes effect when its scene is recalled.
    E.sceneDevice=(index,a,b,start,end)=>{
      const t=tr[index], da=a[a.kind], db=b[b.kind];
      const schedule=(p,x,y)=>{sceneWritten.add(p);p.setValueAtTime(x,start);if(x!==y)p.linearRampToValueAtTime(y,end);};
      if(a.kind==="syn" && b.kind==="syn")schedule(t.scanBase.offset,da.scan||0,db.scan||0);
      if(a.kind==="kit" || b.kind==="kit" || !t.lfo || !da.ldest || da.ldest!==db.ldest || da.ldest!==t.ldest)return;
      const depth=d=>[0,d.ldep*d.ldep*1200,d.ldep*3600,d.ldep*0.5,d.ldep][d.ldest];
      schedule(t.lg.gain,depth(da),depth(db));
      if(da.ldest===3)schedule(t.trem.gain,1-da.ldep*.5,1-db.ldep*.5);
      if(!da.lsync && !db.lsync)schedule(t.lfo.frequency,da.lrate,db.lrate);
    };
    E.endScenes=()=>{
      for(const p of sceneWritten)p.cancelScheduledValues(ctx.currentTime);
      sceneWritten.clear();rack.endScenes();delete E.sceneTrack;
    };

    E.syncAll = () => { rack.sync(); for (let i = 0; i < 8; i++) E.syncTrack(i); E.syncFx(); hard = false; };

    // Tempo-synced LFOs restart with the transport so a loop always modulates the same way.
    E.restartLfos = (t) => {
      rack.restart(t);
      for (const x of tr) if (x.lfo) {
        const old = x.lfo, o = ctx.createOscillator();
        o.type = old.type; o.frequency.value = x.lfoHz ?? old.frequency.value;
        o.connect(x.lg); o.start(t);
        try { old.stop(t); } catch (e) {}
        old.onended = () => old.disconnect();
        x.lfo = o;
      }
    };

    /* ── voices ── */
    const kill = (v) => {
      if (v.dead) return;
      v.dead = 1;
      const k = E.voices.indexOf(v);
      if (k >= 0) E.voices.splice(k, 1);
      v.cloud?.dispose();
      if(v.tuningCV)try { v.tuningCV.stop(); } catch {}
      for (const [a, b] of v.mods) { try { a.disconnect(b); } catch (e) {} }
      for (const n of v.nodes) { try { n.disconnect(); } catch (e) {} }
    };
    E.collectEnded = () => {
      for (const v of E.voices.slice()) if (v.tEnd <= ctx.currentTime) kill(v);
    };
    // Every voice is watched from birth: one whose sample runs out while its key is still held must be collected too.
    const watch = (v) => { E.voices.push(v); v.src[0].onended = () => kill(v); };
    const finish = (v, at) => {
      v.tEnd = at;
      v.cloud?.stop(at);
      if(v.tuningCV)try {v.tuningCV.stop(at);} catch {}
      for (const s of v.src) { try { s.stop(at); } catch (e) {} }
    };
    // Fast fade on the voice's own output gain, which carries no other automation.
    const cut = (v, t, tc = 0.005) => {
      if (v.dead || v.tEnd <= t) return;
      v.live = false;
      if (v.t0 >= t) { finish(v, t); return; }
      v.out.gain.setTargetAtTime(0, t, tc);
      finish(v, t + tc * 8 + 0.01);
    };
    // Envelopes use only setTargetAtTime: a later segment always starts from the value reached so far,
    // so a note-off at any moment never jumps.
    // A note played "now" reaches the audio thread a few ms late. If its attack has already ended by then,
    // the browser skips that segment and the decay would start from silence, so such a note holds its
    // attack for at least `late` seconds before decay begins.
    const late = live ? 0.02 + (ctx.baseLatency || 0.01) * 2 : 0;
    const adsr = (p, t, peak, a, d, s, tOff, r) => {
      const dAt = t + (t - ctx.currentTime < late ? Math.max(a, late) : a);
      p.setValueAtTime(0, t);
      p.setTargetAtTime(peak, t, a / 4);
      if (tOff == null || tOff > dAt) p.setTargetAtTime(peak * s, dAt, d / 4);
      if (tOff != null) p.setTargetAtTime(0, Math.max(tOff, t), r / 4);
    };
    // A new note takes over from what is sounding. A note the sequencer has already scheduled for later is not
    // touched: for a mono track the time it starts is returned, and the new note ends there instead.
    const limit = (i, t, mono) => {
      let n = 0, old = null, ahead = null;
      for (const v of E.voices.slice()) if (v.ti === i && v.tEnd > t) {
        if (v.t0 > t) { if (mono && (ahead == null || v.t0 < ahead)) ahead = v.t0; continue; }
        if (mono) cut(v, t, 0.006);
        else { n++; if (!old || v.t0 < old.t0) old = v; }
      }
      if (!mono && n >= 14 && old) cut(old, t, 0.01);
      return ahead;
    };

    const zoneCounters = new WeakMap();
    const pitched = (i, d, note, vel, t, dur, smp, poly) => {
      const t_ = tr[i];
      let S = null, zone = null;
      if (smp) {
        if (d.mode===3) zone=App.SamplerLab.pickZone(d,note,vel,zoneCounters);
        S=App.samples.get(d.mode===3 ? zone?.sample : d.id);
        if (!S) return null;
      }
      const ahead = limit(i, t, !poly && !smp && d.mode === 1);
      const v = { ti: i, note, t0: t, tEnd: Infinity, src: [], nodes: [], mods: [], f: [], live: dur == null, kt: 2 ** ((d.ftrk * (note - 60)) / 12) };
      const outG = (v.out = G()), amp = (v.amp = G(0));
      amp.connect(outG).connect(t_.instrument);
      v.nodes.push(outG, amp);
      let head = amp;
      // All active voices follow the absolute cutoff lane on the audio clock; each
      // retains its own key tracking, envelope and independent matrix modulation.
      v.cutScale = G(clamp(d.cut * v.kt, 20, 20000) / d.cut);
      t_.cutHz.connect(v.cutScale); v.mods.push([t_.cutHz,v.cutScale]); v.nodes.push(v.cutScale);
      for (let k = d.ftype === 1 ? 1 : 0; k >= 0; k--) {
        const f = BQ(FTYPE[d.ftype], 0, k === 0 ? qOf(d) : -3);
        v.cutScale.connect(f.frequency);
        f.connect(head); head = f;
        v.f.unshift(f); v.nodes.push(f);
        t_.cut.connect(f.detune); v.mods.push([t_.cut, f.detune]);
      }
      let tOff = dur == null ? null : t + dur, rel = d.ar, peak;
      const hz = mtof(note,getP());
      const glideFrom = !smp && d.design && !poly && d.mode === 1 && d.glide > .001 ? t_.lastHz : 0;
      const tuneVoice = param => {
        if (!v.tuningCV) {
          v.originalHz = v.tunedHz = hz;
          v.tuningCV = ctx.createConstantSource(); v.tuningCV.offset.value = 0;
          if(glideFrom) {
            v.tuningCV.offset.setValueAtTime(1200 * Math.log2(glideFrom / hz),t);
            v.tuningCV.offset.setTargetAtTime(0,t,d.glide / 4);
          }
          v.tuningCV.start(t); v.nodes.push(v.tuningCV);
        }
        v.tuningCV.connect(param);
        t_.pitch.connect(param); v.mods.push([t_.pitch,param]);
      };

      if (smp) {
        let a = Math.min(d.st, d.en), b = Math.max(d.st, d.en);
        if (d.mode === 1) {
          const k = note - 36;
          if (k < 0 || k >= d.slices) { kill(v); return null; }
          const edges = App.AudioDSP.sliceEdges(d);
          a = edges[k]; b = edges[k + 1];
        }
        if (b - a < 1e-5) { kill(v); return null; }
        if (d.rev) [a, b] = [1 - b, 1 - a];
        const pitchRatio = d.mode === 1 ? 1 : hz / App.InstrumentLab.standardHz(zone?.root ?? d.root);
        const rate = pitchRatio * 2 ** (d.tune / 12);
        if (d.mode===2) {
          const grainPitch = ctx.createConstantSource(); grainPitch.offset.value = 0; tuneVoice(grainPitch.offset);
          grainPitch.start(t); v.nodes.push(grainPitch);
          v.cloud=App.SamplerLab.grainVoice(ctx,t,head,grainPitch,S,d,note,pitchRatio);
          v.src.push(v.cloud.lifetime,grainPitch);
        } else {
          const buf = d.rev ? S.rev || (S.rev = reverse(S.buffer)) : S.buffer;
          const s = ctx.createBufferSource();
          s.buffer = buf; s.playbackRate.value = rate;
          if (s.detune) {
            if(d.mode !== 1)tuneVoice(s.detune);
            else { t_.pitch.connect(s.detune); v.mods.push([t_.pitch,s.detune]); }
          }
          const off = a * buf.duration, len = (b - a) * buf.duration, loop = d.loop && d.mode !== 1;
          if (loop) { s.loop = true; s.loopStart = off; s.loopEnd = off + len; s.start(t, off); } else s.start(t, off, len);
          s.connect(head);
          v.src.push(s); v.nodes.push(s);
          if (!loop && d.shot) { tOff = t + Math.max(0.004, len / rate - 0.006); rel = 0.008; v.live = false; }
        }
        peak = (0.25 + 0.75 * vel) * 0.7;
      } else if (d.design === 1 || d.design === 2) {
        t_.lastHz = hz;
        const options = {head,time:t,off:tOff,hz,tune:tuneVoice,noise,adsr,scan:t_.scan};
        if(d.design===1)App.InstrumentLab.modularVoice(ctx,v,d,options);
        else App.InstrumentLab.wavetableVoice(ctx,v,d,options);
        if (!v.src.length) { kill(v); return null; }
        peak = (.25 + .75 * vel) * .5;
      } else {
        const from = !poly && d.mode === 1 && d.glide > 0.001 && t_.lastHz ? t_.lastHz : 0;
        t_.lastHz = hz;
        const osc = (wave, ratio, level) => {
          const o = ctx.createOscillator(), g = G(level * TRIM[wave]);
          o.type = WAVE[wave];
          if (from) { o.frequency.setValueAtTime(from * ratio, t); o.frequency.setTargetAtTime(hz * ratio, t, d.glide / 4); }
          else o.frequency.value = hz * ratio;
          tuneVoice(o.detune);
          o.connect(g).connect(head);
          o.start(t);
          v.src.push(o); v.nodes.push(o, g);
          return o;
        };
        const r1 = 2 ** d.oct1, fm = d.fm > 0.001;
        const o1 = d.lv1 > 0.001 || fm ? osc(d.w1, r1, d.lv1) : null;
        const o2 = d.lv2 > 0.001 || fm ? osc(d.w2, 2 ** ((d.semi2 + d.fine2 / 100) / 12), d.lv2) : null;
        if (fm) { const fg = G(d.fm * d.fm * hz * r1 * 6); o2.connect(fg).connect(o1.frequency); v.nodes.push(fg); }
        if (d.sub > 0.001) osc(0, r1 / 2, d.sub);
        if (d.noise > 0.001) {
          const n = ctx.createBufferSource(), g = G(d.noise * 0.5);
          n.buffer = noise; n.loop = true;
          n.connect(g).connect(head);
          n.start(t, Math.random() * 1.5);
          v.src.push(n); v.nodes.push(n, g);
        }
        if (!v.src.length) { kill(v); return null; }
        peak = (0.25 + 0.75 * vel) * 0.5;
      }

      v.releaseCurve = rack.releaseVoice(i,v,amp,outG,rel);
      if (v.releaseCurve) {
        // The slow envelope remains continuous at note-off. The variable-speed
        // exponential multiplies it; at zero modulation their product is the original release.
        rel *= 4;
        if (tOff != null) v.releaseCurve(tOff);
      }
      adsr(amp.gain, t, peak, d.aa, d.ad, d.as, tOff, rel);
      if (Math.abs(d.fenv) > 0.01) for (const f of v.f) adsr(f.detune, t, d.fenv * 1200, d.fa, d.fd, d.fs, tOff, d.fr);
      v.rel = rel; v.frel = d.fr;
      watch(v);
      if (tOff != null) finish(v, tOff + rel * 1.5 + 0.03);
      if (ahead != null) cut(v, ahead, 0.006);
      return v;
    };

    const padCurves = new WeakMap();
    const drum = (i, T, k, vel, t) => {
      const p = T.kit.pads[k];
      if (!p) return null;
      const t_ = tr[i];
      // A choke group cuts what is sounding; a hit already scheduled for later chokes this one when it arrives.
      let choked = null;
      if (p.chk) for (const x of E.voices.slice()) if (x.ti === i && x.chk === p.chk) {
        if (x.t0 > t) { if (choked == null || x.t0 < choked) choked = x.t0; }
        else cut(x, t, 0.004);
      }
      const v = { ti: i, note: 36 + k, pad: k, chk: p.chk, t0: t, tEnd: 0, src: [], nodes: [], mods: [], f: [], live: false };
      const outG = (v.out = G()), pn = ctx.createStereoPanner();
      pn.pan.value = p.pan;
      if (p.drive > 0) {
        const sh = ctx.createWaveShaper();
        let cached = padCurves.get(p);
        if (cached?.drive !== p.drive) {
          const strength = 1 + 16*p.drive, norm = Math.tanh(strength);
          cached = {drive:p.drive,curve:Float32Array.from({length:513},(_,j) => Math.tanh(strength*(j/256-1))/norm)};
          padCurves.set(p,cached);
        }
        sh.curve = cached.curve;
        outG.connect(sh).connect(pn); v.nodes.push(sh);
      } else outG.connect(pn);
      pn.connect(t_.instrument);
      if (k === 0) pn.connect(t_.kick);
      v.nodes.push(outG, pn);
      const lv = p.lvl * p.lvl * (0.3 + 0.7 * vel);
      let end = t;

      if (p.src === 1) {
        const S = App.samples.get(p.id);
        let a = Math.min(p.st, p.en), b = Math.max(p.st, p.en);
        if (!S || b - a < 1e-5) { kill(v); return null; }
        const buf = p.rev ? S.rev || (S.rev = reverse(S.buffer)) : S.buffer;
        if (p.rev) [a, b] = [1 - b, 1 - a];
        const rate = 2 ** (p.pit / 12), s = ctx.createBufferSource(), g = G(0), len = (b - a) * buf.duration;
        s.buffer = buf; s.playbackRate.value = rate;
        t_.pitch.connect(s.detune); v.mods.push([t_.pitch, s.detune]);
        g.gain.setValueAtTime(lv, t);
        if (p.dec < 3.9) g.gain.setTargetAtTime(0, t + 0.002, p.dec / 6.9);
        end = t + Math.min(len / rate, p.dec < 3.9 ? p.dec * 1.3 : 1e9);
        g.gain.setTargetAtTime(0, Math.max(t, end - 0.006), 0.002);
        s.connect(g).connect(outG);
        s.start(t, a * buf.duration, len);
        v.src.push(s); v.nodes.push(s, g);
      } else {
        if (p.tone > 0.001) {
          const o = ctx.createOscillator(), g = G(0);
          o.type = WAVE[p.wave];
          t_.pitch.connect(o.detune); v.mods.push([t_.pitch, o.detune]);
          if (p.sweep > 0) { o.frequency.setValueAtTime(p.tune * 2 ** (p.sweep / 12), t); o.frequency.exponentialRampToValueAtTime(p.tune, t + p.swt); }
          else o.frequency.value = p.tune;
          g.gain.setValueAtTime(p.tone * TRIM[p.wave] * lv * 0.8, t);
          g.gain.setTargetAtTime(0, t + 0.002, p.dec / 6.9);
          o.connect(g).connect(outG);
          o.start(t);
          v.src.push(o); v.nodes.push(o, g);
          end = t + p.dec;
        }
        if (p.nz > 0.001) {
          // Noise is band-limited to COLOR … 5 × COLOR: a clap or snare is a band of noise, not all the hiss above a corner.
          // The narrower the band, the less power it carries, so its level is made up accordingly.
          const top = clamp(p.col * 5, 3000, 16000), band = Math.max(1000, top - p.col);
          const n = ctx.createBufferSource(), hp = BQ("highpass", p.col, -3), lp = BQ("lowpass", top, -3), g = G(0);
          const a = p.nz * lv * 0.6 * Math.min(2.5, Math.sqrt(24000 / band));
          n.buffer = noise; n.loop = true;
          // BURST fires the noise several times 11 ms apart: the hand-clap gesture
          for (let b = 0; b < p.burst; b++) {
            const tb = t + b * 0.011, last = b === p.burst - 1;
            g.gain.setValueAtTime(a, tb);
            g.gain.setTargetAtTime(last ? 0 : a * 0.2, tb + 0.001, last ? p.ndec / 6.9 : 0.004);
          }
          n.connect(hp).connect(lp).connect(g).connect(outG);
          n.start(t, Math.random() * 1.5);
          v.src.push(n); v.nodes.push(n, hp, lp, g);
          end = Math.max(end, t + (p.burst - 1) * 0.011 + p.ndec);
        }
        if (!v.src.length) { kill(v); return null; }
      }
      watch(v);
      finish(v, end + 0.04);
      if (choked != null) cut(v, choked, 0.004);
      return v;
    };

    const start = (i, note, vel, t, dur, poly=false) => {
      const T = E.manualSceneTrack?.(i,t) || E.sceneTrack?.(i,t) || getP().tracks[i];
      rack.velocity(i, vel, t);
      if (T.kind === "kit") return drum(i, T, note - 36, vel, t);
      return pitched(i, T.kind === "smp" ? T.smp : T.syn, note, vel, t, dur, T.kind === "smp",poly);
    };
    // The browser's compressor fades in over its first ~150 ms of life (measured), which would soften
    // the first sound of a session. Nothing is allowed to start before it has settled.
    const WARM = 0.15;
    // "Now" reaches the audio thread a few milliseconds late, and an envelope that began in the past has lost its
    // first part: a short drum hit came out up to 14 dB too quiet at random. A played note therefore starts a
    // hair ahead of the clock, where every segment of its envelope is still to come.
    const LEAD = live ? Math.max(ctx.baseLatency || 0, 0.006) : 0;
    const soon = (t) => Math.max(t || 0, ctx.currentTime + LEAD, live ? WARM : 0);
    // Sequenced note with a known length.
    E.play = (i, note, vel, t, dur, poly=false) => {
      const voice=start(i,note,clamp(vel,0,1),soon(t),dur,poly);
      if(voice)voice.sequenced=true;
      return voice;
    };
    // One track falls silent (its device is being replaced); everything else keeps playing.
    E.cutTrack = (i) => { const t = ctx.currentTime; for (const v of E.voices.slice()) if (v.ti === i) cut(v, t, 0.008); };
    // A note that is deleted stops sounding: a one-shot does not ring on after the thing that started it is gone.
    E.cutNote = (i, note) => { const t = ctx.currentTime; for (const v of E.voices.slice()) if (v.ti === i && v.note === note && v.t0 <= t + 0.02) cut(v, t, 0.012); };
    E.releaseClip = (i,time) => {
      for(const voice of E.voices) if(voice.ti===i && voice.sequenced)cut(voice,time,.004);
    };

    // Played note: sounds until noteOff.
    const held = new Map();
    E.noteOn = (i, note, vel = 0.8, poly = false) => {
      const key = i + ":" + note;
      if (held.has(key)) return;
      const v = start(i, note, vel, soon(0), null, poly);
      if (v && v.live) held.set(key, v);
    };
    E.noteOff = (i, note) => {
      const key = i + ":" + note, v = held.get(key);
      if (!v) return;
      held.delete(key);
      if (v.dead || !v.live) return;
      // never release before the note has begun, or cancelling would erase its attack and a quick tap would be silent
      const t = Math.max(ctx.currentTime, v.t0 + 0.012);
      v.live = false;
      v.releaseCurve?.(t);
      v.releaseModules?.(t);
      v.amp.gain.cancelScheduledValues(t);
      v.amp.gain.setTargetAtTime(0, t, v.rel / 4);
      for (const f of v.f) { f.detune.cancelScheduledValues(t); f.detune.setTargetAtTime(0, t, v.frel / 4); }
      finish(v, t + v.rel * 1.5 + 0.03);
    };
    const clicks = new Set();
    E.panic = (clearReturns = false) => {
      App.AudioStudio?.stopSources(E);
      const t = ctx.currentTime;
      held.clear();
      for (const [o, g] of clicks) { o.stop(); g.disconnect(); }
      clicks.clear();
      for (const v of E.voices.slice()) {
        if (clearReturns) { finish(v, t); kill(v); }
        else cut(v, t, 0.008);
      }
      if (clearReturns) {
        E.stopAutomation();
        const impulse = conv.buffer;
        for (const node of [dIn, dL, dR, dTone, dFb, rIn, conv]) node.disconnect();
        buildReturns();
        conv.buffer = impulse;
        const fx = getP().fx;
        dL.delayTime.value = dR.delayTime.value = clamp(DELAY_BEATS[fx.dtime] * 60 / getP().bpm, 0.01, 2.4);
        dFb.gain.value = fx.dfb; dTone.frequency.value = fx.dtone;
        tr.forEach(t => { t.lastHz = 0; });
      }
    };

    // Metronome goes straight to the speakers: never through the master, never onto tape.
    E.click = (t, accent) => {
      const o = ctx.createOscillator(), g = G(0);
      o.frequency.value = accent ? 1760 : 1175;
      g.gain.setValueAtTime(0.3, t);
      g.gain.setTargetAtTime(0, t + 0.004, 0.012);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.1);
      const pair = [o, g]; clicks.add(pair);
      o.onended = () => { clicks.delete(pair); o.disconnect(); g.disconnect(); };
    };

    if (!live) return E;

    /* ── live only: analysis taps, input, capture ── */
    // dB, 0 or negative. The node's own meter reads about -30 dB at birth and takes seconds to recover, so it is ignored until then.
    E.reduction = () => (ctx.currentTime < 3 ? 0 : comp.reduction + lim.reduction);
    E.limiting = () => ctx.currentTime >= 3 && lim.reduction < -0.5; // the mix is hitting the ceiling
    const AN = (n) => { const a = ctx.createAnalyser(); a.fftSize = n; a.smoothingTimeConstant = 0; return a; };
    const tap = (E.tap = G());
    tap.channelCount = 2; tap.channelCountMode = "explicit"; // mono sources still fill both scope channels
    const sp = ctx.createChannelSplitter(2);
    tap.connect(sp);
    E.anL = AN(4096); E.anR = AN(4096);
    sp.connect(E.anL, 0); sp.connect(E.anR, 1);
    E.anF = AN(8192);
    E.anF.smoothingTimeConstant = 0.55; E.anF.minDecibels = -110; E.anF.maxDecibels = 0;
    tap.connect(E.anF);
    const msp = ctx.createChannelSplitter(2);
    out.connect(msp);
    E.mL = AN(1024); E.mR = AN(1024);
    msp.connect(E.mL, 0); msp.connect(E.mR, 1);

    let srcNode = null;
    E.source = (mode, ti) => {
      if (srcNode) { try { srcNode.disconnect(tap); } catch (e) {} }
      srcNode = mode === "trk" ? rack.tap(ti) : mode === "in" ? E.input : out;
      if (srcNode) srcNode.connect(tap);
    };
    E.source("out");

    let mon = null, inputStream = null, inputNode = null, opening = null, inputVersion = 0;
    E.openInput = () => {
      if (E.input) return Promise.resolve(E.input);
      if (opening) return opening;
      const version = inputVersion;
      opening = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(stream => {
          if (version !== inputVersion) {
            stream.getTracks().forEach(t => t.stop());
            throw new Error("INPUT CLOSED");
          }
          inputStream = stream;
          E.input = G(); inputNode = ctx.createMediaStreamSource(stream);
          inputNode.connect(E.input); E.input.connect(rack.mic); mon = G(0);
          E.input.connect(mon).connect(mix);
          return E.input;
        }).finally(() => { if (version === inputVersion) opening = null; });
      return opening;
    };
    E.closeInput = () => {
      inputVersion++; opening = null;
      if (srcNode && srcNode === E.input) E.source("out");
      if (inputStream) inputStream.getTracks().forEach(t => t.stop());
      for (const node of [inputNode, E.input, mon]) if (node) node.disconnect();
      inputStream = inputNode = E.input = mon = null;
    };
    E.monitor = (on) => mon && set(mon.gain, on ? 1 : 0);
    // What is played is heard later by the way out, and what a microphone hears arrives later again by the way in.
    // This is their sum as far as the browser reports it: a take played to the beat is late by this much.
    E.inputLag = () => (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + (inputStream?.getAudioTracks()[0]?.getSettings?.().latency || 0);

    let worklet = null;
    const loadWorklet = () => {
      if (!ctx.audioWorklet || !window.AudioWorkletNode) return Promise.resolve(false);
      if (!worklet) {
        // A page opened straight from disk cannot load a blob: module, a data: URL works there.
        const file = location.protocol === "file:";
        const url = file ? "data:text/javascript;charset=utf-8," + encodeURIComponent(REC_SRC) : URL.createObjectURL(new Blob([REC_SRC], { type: "text/javascript" }));
        worklet = ctx.audioWorklet.addModule(url).then(() => true, () => false).finally(() => { if (!file) URL.revokeObjectURL(url); });
      }
      return worklet;
    };
    // Capture any node to an AudioBuffer. Returns { stop(), seconds() }.
    E.record = async (node) => {
      const L = [], R = [];
      let frames = 0, firstTime = null, end, sink;
      const done = new Promise((r) => (end = r));
      if (await loadWorklet()) {
        const made = ctx.currentTime; // a first sample cannot be older than its recorder, whatever a stopped-at-once pass reports
        sink = new AudioWorkletNode(ctx, "ml-rec", { channelCount: 2, channelCountMode: "explicit" });
        sink.port.onmessage = (e) => { if (!e.data) return end(); firstTime ??= Math.max(e.data[2] / sr, made - 0.01); L.push(e.data[0]); R.push(e.data[1]); frames += e.data[0].length; };
      } else {
        sink = ctx.createScriptProcessor(4096, 2, 2);
        sink.onaudioprocess = (e) => { firstTime ??= Math.max(0, e.playbackTime - 4096 / sr); L.push(e.inputBuffer.getChannelData(0).slice()); R.push(e.inputBuffer.getChannelData(1).slice()); frames += 4096; };
      }
      node.connect(sink);
      sink.connect(ctx.destination); // outputs silence; the connection only keeps the node running
      return {
        seconds: () => frames / sr,
        firstTime: () => firstTime,
        stop: async () => {
          if (sink.port) { sink.port.postMessage(0); await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]); }
          else sink.onaudioprocess = null;
          try { node.disconnect(sink); } catch (e) {}
          sink.disconnect();
          const buf = new AudioBuffer({ length: Math.max(1, frames), sampleRate: sr, numberOfChannels: 2 });
          let o = 0;
          for (let k = 0; k < L.length; k++) { buf.getChannelData(0).set(L[k], o); buf.getChannelData(1).set(R[k], o); o += L[k].length; }
          return buf;
        },
      };
    };

    if (ctx.renderCapacity) {
      try {
        ctx.renderCapacity.start({ updateInterval: 1 });
        ctx.renderCapacity.addEventListener("update", (e) => (E.load = e.averageLoad));
      } catch (e) {}
    }
    return E;
  };
})();
