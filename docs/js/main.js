/* MUSICLAB · main — boot, selection, clip + song actions, samples, keys, MIDI, files, frame loop */
(() => {
  "use strict";
  const { clamp, pad2 } = App, UI = App.UI, Seq = App.Seq;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clock = () => { const d = new Date(); return pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };

  function theme() {
    const s = getComputedStyle(document.documentElement), v = (n) => s.getPropertyValue(n).trim();
    App.C = {
      pn: v("--pn"), ln: v("--ln"), ln2: v("--ln2"), ln3: v("--ln3"), t1: v("--t1"), t2: v("--t2"), t3: v("--t3"), am: v("--am"), rd: v("--rd"),
      r0: v("--r0"), r1: v("--r1"), r2: v("--r2"), r3: v("--r3"), hv: "rgba(255,180,0,0.075)", fill: "rgba(70,196,111,0.26)", fade: "rgba(6,11,8,0.3)",
    };
    App.FONT = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
    App.rem = parseFloat(s.fontSize) || 10;
  }

  /* ── audio starts on the first gesture; browsers refuse sound before one ── */
  App.audio = () => {
    if (App.E) { if (App.E.ctx.state !== "running") App.E.ctx.resume(); return App.E; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { UI.msg("THIS BROWSER HAS NO WEB AUDIO"); return null; }
    try { App.E = App.Engine(new AC({ latencyHint: "interactive" }), () => App.P); } catch (e) { UI.msg("AUDIO OUTPUT FAILED TO START"); return null; }
    App.E.syncAll();
    App.Sg.source();
    return App.E;
  };

  App.refresh = () => {
    App.E && App.E.syncAll();
    App.Top.sync(); App.Mx.sync(); App.Ed.sync(); App.Dv.build(); App.Fx.sync(); App.Sg.source();
    App.restoreSamples().then((n) => { if (n) App.Dv.build(); }); // the sample name and waveform appear once decoded
  };
  App.doUndo = (d) => { if (d < 0 ? App.undo() : App.redo()) App.refresh(); else UI.msg(d < 0 ? "NOTHING TO UNDO" : "NOTHING TO REDO"); };

  /* ── selection ── */
  const held = new Map(); // key or MIDI id → sounding note
  const releaseAll = (App.releaseAll = () => { for (const id of [...held.keys()]) App.noteOff(id); });
  App.select = (t, p) => {
    const s = App.P.sel;
    if (p == null) p = s.p;
    if (s.t === t && s.p === p) return;
    const ct = s.t !== t, cp = s.p !== p;
    if (ct) releaseAll();
    s.t = t; s.p = p;
    App.touch();
    if (cp) Seq.cue(p);
    App.Mx.sync(); App.Ed.sync(); App.Top.pos(Seq.pos);
    if (ct) { App.Dv.build(); App.Sg.source(); }
  };

  /* ── clips, patterns, song ── */
  const redraw = () => { App.Mx.sync(); App.Ed.sync(); };
  App.copyClip = (a, b) => {
    if (a.t === b.t && a.p === b.p) return;
    const P = App.P;
    P.tracks[b.t].clips[b.p] = clone(P.tracks[a.t].clips[a.p]);
    if (P.pats[b.p].bars < P.pats[a.p].bars) P.pats[b.p].bars = P.pats[a.p].bars;
    App.commit();
    redraw();
    App.select(b.t, b.p);
  };
  App.copyPattern = (a, b) => {
    if (a === b) return;
    const P = App.P;
    for (const T of P.tracks) T.clips[b] = clone(T.clips[a]);
    P.pats[b].bars = P.pats[a].bars;
    App.commit();
    redraw();
    App.select(P.sel.t, b);
  };
  App.clipDo = (t, p, v) => {
    if (v === "next") { App.copyClip({ t, p }, { t, p: (p + 1) % 8 }); return; }
    App.P.tracks[t].clips[p] = [];
    App.commit(); redraw();
  };
  App.patternDo = (p, v) => {
    if (v === "song") { App.songSet(App.P.chain.length, p); return; }
    if (v === "next") { App.copyPattern(p, (p + 1) % 8); return; }
    for (const T of App.P.tracks) T.clips[p] = [];
    App.commit(); redraw();
  };
  App.trackClear = (t) => { App.P.tracks[t].clips = App.P.tracks[t].clips.map(() => []); App.commit(); redraw(); };
  App.songSet = (i, p) => {
    const P = App.P;
    if (P.chain.length >= 32) { UI.msg("SONG IS FULL · 32 SLOTS"); return; }
    if (!P.chain.length) P.song = 1; // the first pattern in the chain switches song mode on
    P.chain.splice(Math.min(i, P.chain.length), 0, p);
    App.commit(); App.Mx.sync(); App.Top.sync();
  };
  App.songDel = (i) => { App.P.chain.splice(i, 1); App.commit(); App.Mx.sync(); };
  App.songMove = (j, i) => {
    const ch = App.P.chain;
    if (j === i || j >= ch.length) return;
    const [x] = ch.splice(j, 1);
    ch.splice(Math.min(i, ch.length), 0, x);
    App.commit(); App.Mx.sync();
  };

  /* ── samples ── */
  const AUDIO = /\.(wav|mp3|ogg|oga|flac|m4a|aac|aif|aiff|webm|opus)$/i;
  const assign = (tg, id) => {
    const T = App.P.tracks[tg.ti], S = App.samples.get(id);
    if (tg.pad != null) Object.assign(T.kit.pads[tg.pad], { src: 1, id, st: 0, en: 1, dec: 4, pit: 0, rev: 0, name: S.name.replace(/[^A-Z0-9 #+-]/g, "").trim().slice(0, 8) || "SAMPLE" });
    else {
      if (T.kind !== "smp") { T.kind = "smp"; UI.msg("TRACK " + pad2(tg.ti + 1) + " IS NOW A SAMPLER · UNDO REVERTS"); }
      Object.assign(T.smp, { id, st: 0, en: 1 });
    }
  };
  const landed = (tg) => {
    App.commit();
    App.E && App.E.syncTrack(tg.ti);
    if (tg.pad != null && tg.ti === App.P.sel.t) App.P.sel.pad = tg.pad;
    App.Mx.sync(); App.Ed.sync(); App.Dv.build();
  };
  // A drop on a drum track fills pads; several files fill consecutive pads.
  const resolve = (tg) => {
    const P = App.P;
    if (!tg) tg = { ti: P.sel.t };
    if (P.tracks[tg.ti].kind === "kit" && tg.pad == null) tg = { ti: tg.ti, pad: tg.ti === P.sel.t ? P.sel.pad : 0 };
    return tg;
  };
  App.dropFiles = async (files, tg) => {
    const proj = files.find((f) => /\.json$/i.test(f.name));
    if (proj) { openProject(proj); return; }
    const audio = files.filter((f) => f.type.startsWith("audio/") || AUDIO.test(f.name));
    if (!audio.length) { UI.msg("NOT AN AUDIO FILE"); return; }
    tg = resolve(tg);
    let n = 0, last = tg;
    for (const f of audio) {
      if (tg.pad != null && tg.pad + n > 7) break;
      try {
        const id = await App.addSample(f.name.replace(/\.[^.]+$/, "").toUpperCase().slice(0, 40), f);
        last = { ti: tg.ti, pad: tg.pad != null ? tg.pad + n : undefined };
        assign(last, id);
        n++;
      } catch (e) { UI.msg("CANNOT DECODE " + f.name.toUpperCase()); }
      if (tg.pad == null && n) break;
    }
    if (n) landed(last);
  };

  /* ── tape: the output as audio ── */
  let tapeBusy = false;
  App.tape = async () => {
    const E = App.audio();
    if (!E || tapeBusy) return;
    tapeBusy = true;
    try {
      if (App.taping) {
        const r = App.taping;
        App.taping = null;
        App.take = await r.stop();
        UI.msg("TAKE READY · CLICK IT = SAVE WAV · DRAG IT ONTO A TRACK OR PAD = SAMPLE");
      } else App.taping = await E.record(E.out);
    } finally { tapeBusy = false; App.Top.sync(); }
  };
  const download = (blob, name) => {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, "-");
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  App.saveTake = () => { if (App.take) download(App.wav(App.take), App.P.name + " TAKE " + clock() + ".wav"); };
  App.dropTake = (tg) => {
    if (!App.take) return;
    tg = resolve(tg);
    assign(tg, App.addBuffer("TAKE " + clock(), App.take));
    landed(tg);
  };

  // Record straight into a sampler or pad. Leading silence is cut so the sample starts on the sound.
  const trim = (buf) => {
    const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a;
    let i = 0;
    while (i < a.length && Math.abs(a[i]) < 0.004 && Math.abs(b[i]) < 0.004) i++;
    i = Math.max(0, i - Math.floor(buf.sampleRate * 0.004));
    if (i === 0 || a.length - i < 64) return buf;
    const out = new AudioBuffer({ length: a.length - i, sampleRate: buf.sampleRate, numberOfChannels: buf.numberOfChannels });
    for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(i));
    return out;
  };
  App.recStart = async (tg, src) => {
    const E = App.audio();
    if (!E || App.recTo) return;
    let node = E.out;
    if (src === "in") {
      try { node = await E.openInput(); } catch (e) { UI.msg("INPUT REFUSED · ALLOW THE MICROPHONE FOR THIS PAGE"); return; }
    }
    App.recTo = { ti: tg.ti, pad: tg.pad, src, rec: await E.record(node) };
    App.Dv.build();
  };
  App.recStop = async () => {
    const r = App.recTo;
    if (!r) return;
    App.recTo = null;
    const buf = trim(await r.rec.stop());
    if (buf.length < 64) { UI.msg("NOTHING RECORDED"); App.Dv.build(); return; }
    assign(r, App.addBuffer((r.src === "in" ? "INPUT " : "RESAMPLE ") + clock(), buf));
    landed(r);
  };

  /* ── project files ── */
  const b64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.slice(r.result.indexOf(",") + 1));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
  const unb64 = (s, type) => {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type });
  };
  async function saveProject() {
    const P = App.P, out = { ...P, samples: [] };
    for (const id of App.sampleIds(P)) {
      const blob = await App.sampleBlob(id);
      if (blob) out.samples.push({ id, name: App.samples.get(id)?.name || id, type: blob.type || "audio/wav", data: await b64(blob) });
    }
    download(new Blob([JSON.stringify(out)], { type: "application/json" }), P.name + ".musiclab.json");
  }
  async function openProject(file) {
    try {
      const raw = JSON.parse(await file.text()), P = raw && raw.app === "MUSICLAB" ? App.sanitize(raw) : null;
      if (!P) throw 0;
      for (const s of Array.isArray(raw.samples) ? raw.samples : []) {
        if (typeof s.id !== "string" || typeof s.data !== "string" || App.samples.has(s.id)) continue;
        try { await App.importSample(s.id, String(s.name || "SAMPLE").slice(0, 40), unb64(s.data, s.type || "audio/wav")); } catch (e) { /* that sampler stays empty */ }
      }
      Seq.stop();
      App.P = P;
      App.commit();
      App.refresh();
      UI.msg("OPENED " + P.name + " · UNDO RETURNS TO THE PREVIOUS PROJECT");
    } catch (e) { UI.msg("NOT A MUSICLAB PROJECT FILE"); }
  }
  App.pickFile = (accept, cb) => {
    const inp = document.getElementById("file");
    inp.accept = accept; inp.multiple = true; inp.value = "";
    inp.onchange = () => { if (inp.files.length) cb([...inp.files]); };
    inp.click();
  };
  App.file = async (v) => {
    const name = App.P.name;
    if (v === "new") { Seq.stop(); App.P = App.newProject(); App.commit(); App.refresh(); UI.msg("NEW PROJECT · UNDO RETURNS TO THE PREVIOUS ONE"); }
    else if (v === "open") App.pickFile(".json,application/json", (f) => openProject(f[0]));
    else if (v === "save") saveProject();
    else if (v === "mid") download(Seq.midi(), name + ".mid");
    else if (v === "wav") {
      UI.msg("RENDERING");
      try {
        const buf = await Seq.bounce();
        download(App.wav(buf), name + ".wav");
        UI.msg("WAV EXPORTED · " + buf.duration.toFixed(1) + " S · 24 BIT " + buf.sampleRate / 1000 + " KHZ");
      } catch (e) { UI.msg("EXPORT FAILED · " + (e.message || "")); }
    }
  };

  /* ── playing notes: computer keys + MIDI, optionally written into the running pattern ── */
  const KEYS = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL", "KeyP", "Semicolon"];
  const PADS = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"];
  let octave = 4;
  const rowCount = (T) => (T.kind === "kit" ? 8 : T.kind === "smp" && T.smp.mode === 1 ? T.smp.slices : 0);
  const noteFor = (code) => {
    const T = App.P.tracks[App.P.sel.t], rows = rowCount(T);
    if (rows) { const i = PADS.indexOf(code); return i >= 0 && i < rows ? 36 + i : null; }
    const i = KEYS.indexOf(code);
    return i < 0 ? null : clamp(12 * (octave + 1) + i, 0, 127);
  };
  const recNote = (ti, note, vel) => {
    const c = App.recArm && Seq.playing ? Seq.now() : null;
    if (!c) return null;
    const P = App.P, n = App.patSteps(P, c.pat), near = Math.round(c.step), s = near % n, clip = P.tracks[ti].clips[c.pat];
    for (let i = clip.length - 1; i >= 0; i--) if (clip[i].n === note && clip[i].s === s) clip.splice(i, 1);
    const nt = { s, n: note, l: 1, v: Math.round(vel * 100) / 100, p: 1 };
    clip.push(nt);
    // Snapped forward, the playhead reaches this note in a moment: it was just heard, so skip that one trigger.
    if (near > c.step) Seq.skip.set(nt, App.E.ctx.currentTime + c.sd);
    App.Ed.draw(); App.Mx.draw();
    return { nt, clip, t0: App.E.ctx.currentTime, sd: c.sd };
  };
  App.noteOn = (note, vel, id) => {
    const E = App.audio();
    if (!E || held.has(id)) return;
    const P = App.P, ti = P.sel.t, T = P.tracks[ti];
    if (T.kind === "kit" && note >= 36 && note < 44 && P.sel.pad !== note - 36) { P.sel.pad = note - 36; App.Dv.build(); App.Ed.draw(); }
    E.noteOn(ti, note, vel);
    App.Ed.key(note, true);
    held.set(id, { ti, note, rec: recNote(ti, note, vel) });
  };
  App.noteOff = (id) => {
    const d = held.get(id);
    if (!d) return;
    held.delete(id);
    App.Ed.key(d.note, false);
    App.E && App.E.noteOff(d.ti, d.note);
    if (d.rec) {
      d.rec.nt.l = clamp(Math.round((App.E.ctx.currentTime - d.rec.t0) / d.rec.sd), 1, 64);
      d.rec.clip.sort((a, b) => a.s - b.s || a.n - b.n);
      App.commit();
      App.Ed.draw(); App.Mx.draw();
    }
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input")) return;
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === "z") { e.preventDefault(); App.doUndo(e.shiftKey ? 1 : -1); }
      else if (k === "y") { e.preventDefault(); App.doUndo(1); }
      else if (k === "s") { e.preventDefault(); App.file("save"); }
      return;
    }
    if (e.altKey) return;
    const s = App.P.sel;
    switch (e.code) {
      case "Space": e.preventDefault(); if (!e.repeat) Seq.toggle(); return;
      case "Escape": UI.closeMenu(); held.clear(); App.E && App.E.panic(); return;
      case "ArrowLeft": e.preventDefault(); App.select(s.t, (s.p + 7) % 8); return;
      case "ArrowRight": e.preventDefault(); App.select(s.t, (s.p + 1) % 8); return;
      case "ArrowUp": e.preventDefault(); App.select(Math.max(0, s.t - 1)); return;
      case "ArrowDown": e.preventDefault(); App.select(Math.min(7, s.t + 1)); return;
    }
    if (/^Digit[1-8]$/.test(e.code)) { App.select(+e.code[5] - 1); return; }
    if (e.repeat) return;
    if (e.code === "KeyZ" || e.code === "KeyX") {
      octave = clamp(octave + (e.code === "KeyX" ? 1 : -1), 0, 8);
      UI.msg("KEYS START AT C" + octave);
      return;
    }
    const n = noteFor(e.code);
    if (n != null) { e.preventDefault(); App.noteOn(n, 0.8, e.code); }
  });
  window.addEventListener("keyup", (e) => App.noteOff(e.code));
  window.addEventListener("blur", releaseAll);

  App.midiN = 0;
  const onMidi = (e) => {
    const [st, d1, d2] = e.data, c = st & 0xf0;
    if (c === 0x90 && d2 > 0) App.noteOn(d1, d2 / 127, "m" + d1);
    else if (c === 0x80 || c === 0x90) App.noteOff("m" + d1);
  };
  App.midi = async () => {
    if (!navigator.requestMIDIAccess) { UI.msg("THIS BROWSER HAS NO WEB MIDI"); return; }
    try {
      const acc = await navigator.requestMIDIAccess();
      const hook = () => {
        let n = 0;
        for (const inp of acc.inputs.values()) { inp.onmidimessage = onMidi; n++; }
        App.midiN = n;
        App.Top.sync();
        UI.msg(n ? n + " MIDI INPUT" + (n > 1 ? "S" : "") + " · PLAYS THE SELECTED TRACK" : "NO MIDI DEVICE FOUND");
      };
      acc.onstatechange = hook;
      hook();
    } catch (e) { UI.msg("MIDI ACCESS REFUSED"); }
  };

  /* ── frame loop ── */
  let sysT = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const c = Seq.frame();
    App.Top.pos(c); App.Top.frame(); App.Mx.frame(c); App.Ed.frame(c); App.Fx.frame(); App.Sg.frame();
    if (ts - sysT < 500) return;
    sysT = ts;
    const E = App.E;
    if (!E) { UI.sys("AUDIO STARTS ON FIRST CLICK OR KEY"); return; }
    const lat = Math.round(((E.ctx.baseLatency || 0) + (E.ctx.outputLatency || 0)) * 1000);
    UI.sys((E.ctx.sampleRate / 1000).toFixed(1) + " KHZ · " + lat + " MS" + (E.ctx.renderCapacity ? " · DSP " + Math.round(E.load * 100) + "%" : "") + " · " + E.voices.length + " VOICES");
    // runaway guards: a forgotten recording must not eat the machine's memory
    if (App.recTo && App.recTo.rec.seconds() > 300) App.recStop();
    if (App.taping && App.taping.seconds() > 1800) App.tape();
  }

  function boot() {
    theme();
    App.P = App.stored() || App.newProject();
    UI.init();
    App.Top.build(); App.Mx.build(); App.Ed.build(); App.Dv.build(); App.Fx.build(); App.Sg.build();
    App.commit();
    App.refresh();
    const relayout = () => { theme(); App.Mx.draw(); App.Ed.draw(); App.Dv.paint(); App.Sg.resize(); };
    window.addEventListener("resize", relayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    window.addEventListener("pointerdown", () => App.audio(), true);
    window.addEventListener("pagehide", () => App.flush());
    document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseAll(); App.flush(); } });
    requestAnimationFrame(frame);
  }
  boot();
})();
