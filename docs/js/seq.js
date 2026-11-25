/* MUSICLAB · sequencer — transport, step scheduling, arpeggiator, offline bounce, MIDI file */
(() => {
  "use strict";
  const { clamp } = App;
  const Seq = (App.Seq = { playing: false, pos: null, skip: new Map() });
  let nextT = 0, step = 0, pat = 0, si = 0, startSi = 0, bars = 0, queued = null, q = [], timer = 0, worker = null;

  const songOn = (P) => !!P.song && P.chain.length > 0;
  Seq.songOn = () => songOn(App.P);
  const swingOf = (P, s, sd) => (s & 1 ? (P.swing / 100) * 0.5 * sd : 0);

  // Swing moves the offbeat boundary; subdivisions interpolate between the adjacent
  // swung boundaries. This keeps repeats inside their note even at maximum swing.
  const gridTime = (P, pos, sd) => {
    const s = Math.floor(pos), fraction = pos - s;
    return pos * sd + (1 - fraction) * swingOf(P, s, sd) + fraction * swingOf(P, s + 1, sd);
  };
  const countOf = nt => clamp(Math.round(nt.r || 1), 1, 8);

  const emit = (E, P, pi, s, t, sd) => {
    const n = App.patSteps(P, pi);
    const base = t - gridTime(P, s, sd);
    const events = [];
    const add = (ti, note, nt, pos, length, gate) => {
      if (note > 127 || length <= 0 || (nt.p < 1 && Math.random() >= nt.p)) return;
      const from = gridTime(P, pos, sd);
      const span = gridTime(P, pos + length, sd) - from;
      const duration = gate == null ? span - Math.min(0.004, span * 0.12) : span * gate;
      events.push({ ti, note, velocity: nt.v, time: base + from, duration });
    };
    for (let ti = 0; ti < P.tracks.length; ti++) {
      const T = P.tracks[ti], clip = T.clips[pi];
      if (!clip.length) continue;
      if (T.kind !== "syn" || !T.arp.mode) {
        for (const nt of clip) {
          const length = Math.min(nt.l, n - nt.s);
          if (s < nt.s || s >= nt.s + length) continue;
          const count = countOf(nt);
          if (count === 1 && s !== nt.s) continue;
          const width = length / count;
          // Only schedule the repeats whose onset falls in this scheduler window.
          const first = Math.ceil((s - nt.s) * count / length);
          const last = Math.min(count, Math.ceil((s + 1 - nt.s) * count / length));
          for (let k = first; k < last; k++) {
            if (E === App.E && k === 0 && Seq.skip.has(nt)) {
              const until = Seq.skip.get(nt); Seq.skip.delete(nt);
              if (t < until) continue;
            }
            add(ti, nt.n, nt, nt.s + k * width, width);
          }
        }
        continue;
      }
      const held = clip.filter(nt => nt.s <= s && s < nt.s + nt.l);
      if (!held.length) continue;
      held.sort((a, b) => a.n - b.n);
      const A = T.arp, per = [2, 1, 0.5][A.rate];
      const L = held.length * A.oct, rel = s - Math.min(...held.map(nt => nt.s));
      // Each repeat divides its arpeggiator pulse and keeps the chosen gate ratio.
      const fire = (k, pos) => {
        let x;
        if (A.mode === 1) x = k % L;
        else if (A.mode === 2) x = L - 1 - (k % L);
        else if (A.mode === 3) { const cycle = Math.max(1, 2 * L - 2), m = k % cycle; x = m < L ? m : cycle - m; }
        else x = Math.floor(Math.random() * L);
        const nt = held[x % held.length];
        const length = Math.min(per, n - pos, nt.s + nt.l - pos);
        const count = countOf(nt), width = length / count;
        for (let j = 0; j < count; j++) add(ti, nt.n + 12 * Math.floor(x / held.length), nt, pos + j * width, width, A.gate);
      };
      if (per === 2) { if (rel % 2 === 0) fire(rel / 2, s); }
      else if (per === 1) fire(rel, s);
      else { fire(rel * 2, s); fire(rel * 2 + 1, s + 0.5); }
    }
    events.sort((a, b) => a.time - b.time);
    for (const e of events) E.play(e.ti, e.note, e.velocity, e.time, e.duration);
  };

  const tick = () => {
    const E = App.E;
    if (!E || !Seq.playing) return;
    const now = E.ctx.currentTime;
    while (q.length && q[0].t <= now) Seq.pos = q.shift();
    if (nextT < now - 0.25) nextT = now + 0.03; // tab was asleep: resume from now instead of replaying the gap
    while (nextT < now + 0.14) {
      const P = App.P, sd = 15 / P.bpm, n = App.patSteps(P, pat), SPB = App.spb(P);
      if (step >= n) step = 0;
      const t = nextT + swingOf(P, step, sd);
      emit(E, P, pat, step, t, sd);
      if (P.click && step % App.beatSteps(P) === 0) E.click(t, step % SPB === 0);
      q.push({ t, step, pat, si, bar: bars + Math.floor(step / SPB), sd, span: gridTime(P, step + 1, sd) - gridTime(P, step, sd) });
      nextT += sd;
      if (++step >= n) {
        step = 0;
        if (songOn(P)) {
          si++;
          if (si >= P.chain.length) { si = 0; bars = 0; } else bars += n / SPB;
          pat = P.chain[si];
        } else if (queued != null) { pat = queued; queued = null; }
      }
    }
  };

  // A worker clock keeps time when the tab is in the background; timers on the page itself get throttled there.
  try {
    worker = new Worker(URL.createObjectURL(new Blob(["let t;onmessage=e=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" })));
    worker.onmessage = tick;
    worker.onerror = () => { worker = null; if (Seq.playing) timer = setInterval(tick, 25); };
  } catch (e) { worker = null; }

  Seq.play = (from) => {
    const E = App.audio();
    if (!E) return;
    Seq.stop(true);
    const P = App.P;
    q = []; step = 0; queued = null; bars = 0;
    if (songOn(P)) {
      si = clamp(from ?? startSi, 0, P.chain.length - 1);
      pat = P.chain[si];
      for (let k = 0; k < si; k++) bars += App.patSteps(P, P.chain[k]) / App.spb(P);
    } else { si = 0; pat = P.sel.p; }
    nextT = Math.max(E.ctx.currentTime + 0.06, 0.16); // 0.16: the engine lets nothing sound in its first 150 ms
    E.restartLfos(nextT);
    Seq.playing = true;
    tick();
    if (worker) worker.postMessage(25); else timer = setInterval(tick, 25);
    App.Top.sync();
  };
  Seq.stop = (quiet) => {
    if (worker) worker.postMessage(0);
    clearInterval(timer);
    const was = Seq.playing;
    Seq.playing = false; Seq.pos = null; q = []; queued = null;
    Seq.skip.clear();
    if (was && App.E) App.E.panic();
    if (!quiet) App.Top.sync();
  };
  Seq.toggle = () => (Seq.playing ? Seq.stop() : Seq.play());
  // In pattern mode a new selection takes over at the next loop boundary.
  Seq.cue = (p) => { if (Seq.playing && !songOn(App.P)) queued = p === pat ? null : p; };
  Seq.queued = () => queued;
  Seq.pat = () => pat;
  Seq.startAt = (i) => { startSi = i; if (Seq.playing && songOn(App.P)) Seq.play(i); };
  Seq.start = () => startSi;
  Seq.frame = () => {
    if (!Seq.playing || !App.E) return null;
    const now = App.E.ctx.currentTime;
    while (q.length && q[0].t <= now) Seq.pos = q.shift();
    return Seq.pos;
  };
  // Fractional step under the playhead right now (for recording played notes).
  // Reads the audio clock itself, so it stays right while the tab is hidden and no frames are drawn.
  Seq.now = () => {
    const c = Seq.frame();
    return c ? { pat: c.pat, step: c.step + Math.min(1, (App.E.ctx.currentTime - c.t) / c.span), sd: c.sd } : null;
  };

  /* ── offline bounce: the song (or the selected pattern) rendered faster than real time ── */
  Seq.bounce = async () => {
    const P = JSON.parse(JSON.stringify(App.P));
    const list = songOn(P) ? P.chain : [P.sel.p], sd = 15 / P.bpm;
    let steps = 0;
    for (const pi of list) steps += App.patSteps(P, pi);
    const sr = App.E ? App.E.ctx.sampleRate : 48000, tail = Math.min(12, 1.5 + P.fx.rsize);
    if (steps * sd > 1200) throw Error("LONGER THAN 20 MIN");
    // The browser's compressor fades in during its first ~150 ms. Render a silent lead-in for it, then cut it off.
    const PRE = 0.3, ctx = new OfflineAudioContext(2, Math.ceil((PRE + steps * sd + tail) * sr), sr);
    const E = App.Engine(ctx, () => P, { offline: true });
    E.syncAll();
    E.restartLfos(PRE); // same alignment as live playback: LFOs begin with the first step
    let t = PRE;
    for (const pi of list) {
      const n = App.patSteps(P, pi);
      for (let s = 0; s < n; s++) { emit(E, P, pi, s, t + swingOf(P, s, sd), sd); t += sd; }
    }
    const full = await ctx.startRendering(), cut = Math.round(PRE * sr);
    const out = new AudioBuffer({ length: full.length - cut, sampleRate: sr, numberOfChannels: 2 });
    for (let c = 0; c < 2; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(cut));
    return out;
  };

  /* ── standard MIDI file, format 1, one track per console track ── */
  Seq.midi = () => {
    const P = App.P, list = songOn(P) ? P.chain : [P.sel.p], TPS = 240, sd = 15 / P.bpm, GM = [36, 38, 39, 42, 46, 45, 37, 56];
    const vlq = (n) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
    const be = (n, k) => Array.from({ length: k }, (_, i) => (n >>> (8 * (k - 1 - i))) & 255);
    const txt = (s) => [...s].map((c) => (c.charCodeAt(0) < 128 && c.length === 1 ? c.charCodeAt(0) : 63)); // non-ASCII → "?"
    const chunk = (id, d) => [...txt(id), ...be(d.length, 4), ...d];
    const track = (name, evs, endTick) => {
      evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const nb = txt(name).slice(0, 100), d = [0, 0xff, 3, nb.length, ...nb];
      let last = 0;
      for (const e of evs) { d.push(...vlq(e[0] - last), ...e.slice(1)); last = e[0]; }
      d.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0);
      return chunk("MTrk", d);
    };
    const [num, den] = App.SIGS[P.sig];
    const endTick = list.reduce((sum, pi) => sum + App.patSteps(P, pi) * TPS, 0);
    const conductor = [[0, 0xff, 0x51, 3, ...be(Math.round(6e7 / P.bpm), 3)], [0, 0xff, 0x58, 4, num, Math.log2(den), 24, 8]];
    let markerTick = 0;
    for (const pi of list) {
      const marker = txt("MusicLab Pattern " + String.fromCharCode(65 + pi));
      conductor.push([markerTick, 0xff, 0x06, marker.length, ...marker]);
      markerTick += App.patSteps(P, pi) * TPS;
    }
    const tracks = [track(P.name, conductor, endTick)];
    const events = P.tracks.map(() => []);
    let channel = 0;
    const channels = P.tracks.map(T => T.kind === "kit" ? 9 : channel++);
    const sink = { play(ti, pitch, velocity, time, duration) {
      const note = P.tracks[ti].kind === "kit" ? GM[pitch - 36] : pitch;
      if (note == null) return;
      const c = channels[ti], start = Math.round(time / sd * TPS);
      const stop = Math.max(start + 1, Math.round((time + duration) / sd * TPS));
      events[ti].push([start, 0x90 | c, note, Math.max(1, Math.round(velocity * 127))], [stop, 0x80 | c, note, 0]);
    } };
    let offset = 0;
    for (const pi of list) {
      const count = App.patSteps(P, pi);
      for (let s = 0; s < count; s++) emit(sink, P, pi, s, (offset + s) * sd + swingOf(P, s, sd), sd);
      offset += count;
    }
    P.tracks.forEach((T, ti) => { if (events[ti].length) tracks.push(track(T.name, events[ti], endTick)); });
    return new Blob([new Uint8Array([...chunk("MThd", [0, 1, ...be(tracks.length, 2), ...be(TPS * 4, 2)]), ...tracks.flat()])], { type: "audio/midi" });
  };

  Seq.emit = emit;
})();
