/* MUSICLAB · main — boot, selection, clip + song actions, samples, keys, MIDI, files, frame loop */
(() => {
  "use strict";
  const { clamp, pad2 } = App, UI = App.UI, Seq = App.Seq;
  let session = 0;
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
    if (App.E) { if (App.E.ctx.state !== "running") App.E.ctx.resume().catch(() => UI.msg("AUDIO SUSPENDED · CLICK PLAY TO RESUME")); return App.E; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { UI.msg("THIS BROWSER HAS NO WEB AUDIO"); return null; }
    try { App.E = App.Engine(new AC({ latencyHint: "interactive" }), () => App.P); } catch (e) { UI.msg("AUDIO OUTPUT FAILED TO START"); return null; }
    App.E.syncAll();
    App.Sg.source();
    return App.E;
  };

  App.refresh = () => {
    App.E && App.E.syncAll();
    App.Top.sync(); App.Mx.sync(); App.Ed.sync(); App.Dv.build(); App.Fx.build(); App.Sg.source();
    App.AudioStudio?.sync();
    App.restoreSamples().then((n) => { if (n) { App.Dv.build(); if(App.P.impulse?.sample){ App.E?.syncFx(); App.Fx.build(); } } }); // the sample name and waveform appear once decoded
  };
  App.doUndo = d => {
    App.releaseAll();
    App.recClose?.(); App.Ed.settle?.(); // a recording pass or a move still in progress becomes its own step first
    if (!(d<0 ? App.canUndo() : App.canRedo())) { UI.msg(d<0 ? "NOTHING TO UNDO" : "NOTHING TO REDO");return; }
    const running=Seq.playing, slot=Seq.frame()?.si, before=App.P, shape=running && Seq.shape(before);
    // A step that leaves the song's structure alone (a level, a note, a sound) does not interrupt what is playing.
    const peek = d<0 ? App.undoPeek?.(-1) : App.undoPeek?.(1);
    const keep = running && peek && !peek.projectChange && Seq.shape(peek.project) === shape;
    if (running && !keep) Seq.stop();
    if (d<0 ? App.undo() : App.redo()) {
      session++; resetTools(!App.historyCrossedProject);
      if (keep) Seq.rebind(); else App.E?.panic(true);
      App.Ed.keep(); // a selection follows the notes this step changed
      App.refresh();
      if (running && !keep) Seq.play(slot);
      UI.msg((d < 0 ? "UNDONE" : "REDONE") + whatChanged(before, App.P));
    }
  };
  // What an undo or redo touched, read off the two projects, so the status line can say where to look.
  const whatChanged = (a, b) => {
    const skip = (path, k) => (!path.length && (k === "sel" || k === "fold")) || (path.length === 2 && path[0] === "tracks" && k === "lo");
    const diff = (x, y, path) => {
      if (x === y) return null;
      if (!x || !y || typeof x !== "object" || typeof y !== "object" || Array.isArray(x) !== Array.isArray(y)) return path;
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { if (skip(path, k)) continue; const hit = diff(x[k], y[k], [...path, k]); if (hit) return hit; }
      return null;
    };
    const p = diff(a, b, []);
    if (!p || !p.length) return "";
    const [top, i, part, q] = p, T = top === "tracks" ? b.tracks[i] || a.tracks[i] : null, tn = T ? pad2(+i + 1) + " " + T.name : "";
    const names = { bpm: "TEMPO", swing: "SWING", sig: "SIGNATURE", key: "KEY", scale: "SCALE", click: "CLICK", fx: "MASTER EFFECTS", rack: "ROUTING, MODULATION OR EQ", harmony: "CHORDS", audio: "AUDIO TIMELINE",
      scenes: "SCENES", performance: "LIVE", tuning: "TUNING", name: "PROJECT NAME", groove: "GROOVE", rules: "NOTE RULES", songCurves: "SONG AUTOMATION", chain: "SONG", song: "SONG MODE", arrangement: "ARRANGEMENT", impulse: "REVERB IMPULSE" };
    const what = top === "tracks" ? (part === "clips" ? "NOTES " + pad2(+i + 1) + "/" + App.PATS[q] : part === "automation" ? "AUTOMATION " + pad2(+i + 1) + "/" + App.PATS[q]
        : ["syn", "smp", "kit", "arp", "kind"].includes(part) ? "DEVICE OF " + tn : part === "name" ? "TRACK NAME " + pad2(+i + 1) : "MIXER STRIP " + tn)
      : top === "pats" ? "LENGTH OF PATTERN " + App.PATS[i] : names[top] || String(top).toUpperCase();
    return " · " + what;
  };

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
    // Launched clips and a take do not follow the selection: say what plays and how to get the pattern back.
    if (cp && Seq.playing && App.P.performance.source !== "arrangement")
      UI.msg((App.P.performance.source === "take" ? "THE RECORDED TAKE" : "THE LAUNCHED CLIPS") + " KEEP PLAYING · CLICK " + (App.P.performance.source === "take" ? "TAKE" : "LIVE") + " IN THE SONG ROW TO PLAY PATTERN " + App.PATS[p]);
    App.Mx.sync(); App.Ed.sync(); App.Top.pos(Seq.pos);
    if (ct) { App.Dv.build(); App.Sg.source(); }
  };

  /* ── clips, patterns, song ── */
  const redraw = () => { App.Mx.sync(); App.Ed.sync(); };
  function copyMaterial(source, from, target, to) {
    const loops = App.P.performance?.loops;
    if (loops) loops[App.P.tracks.indexOf(target)][to] = loops[App.P.tracks.indexOf(source)][from];
    target.clips[to] = clone(source.clips[from]);
    target.automation[to] = clone(source.automation[from]);
  }
  App.copyClip = (a, b) => {
    if (a.t === b.t && a.p === b.p) return;
    const P = App.P;
    if (P.tracks[b.t].clips[b.p].length || Object.keys(P.tracks[b.t].automation[b.p]).length) {
      App.select(b.t,b.p);
      App.Phrases.open("clip",{op:"overlay",track:a.t,pattern:a.p});
      return;
    }
    copyMaterial(P.tracks[a.t], a.p, P.tracks[b.t], b.p);
    const grew = P.pats[b.p].bars < P.pats[a.p].bars;
    if (grew) P.pats[b.p].bars = P.pats[a.p].bars;
    App.commit();
    redraw();
    App.select(b.t, b.p);
    const at = (x) => pad2(x.t + 1) + "/" + App.PATS[x.p];
    UI.msg("CLIP " + at(a) + " COPIED TO " + at(b) + (grew ? " · PATTERN " + App.PATS[b.p] + " IS NOW " + P.pats[b.p].bars + " BARS ON EVERY TRACK" : "") + " · UNDO REVERTS");
  };
  App.copyPattern = (a, b) => {
    if (a === b) return;
    const P = App.P;
    if (P.tracks.some(t => t.clips[b].length || Object.keys(t.automation[b]).length)) {
      App.select(P.sel.t,b);
      App.Phrases.open("pattern",{op:"overlay",pattern:a,track:P.sel.t});
      return;
    }
    for (const T of P.tracks) copyMaterial(T,a,T,b);
    P.pats[b].bars = P.pats[a].bars;
    App.commit();
    redraw();
    App.select(P.sel.t, b);
    UI.msg("PATTERN " + App.PATS[a] + " COPIED TO " + App.PATS[b] + " · EVERY TRACK · UNDO REVERTS");
  };
  // Clearing removes what the cell plays: its notes, its curves and its own loop length.
  const filled = (T, p) => T.clips[p].length > 0 || Object.keys(T.automation[p]).length > 0;
  const wipe = (ti, p) => {
    const P = App.P, T = P.tracks[ti];
    T.clips[p] = []; T.automation[p] = {};
    if (P.performance?.loops) P.performance.loops[ti][p] = 0;
  };
  const cleared = (what) => { App.commit(); redraw(); UI.msg(what + " CLEARED · UNDO BRINGS IT BACK"); };
  App.filled = (t, p) => filled(App.P.tracks[t], p);
  App.clearClip = (t, p) => { if (!filled(App.P.tracks[t], p)) return; wipe(t, p); cleared("CLIP " + pad2(t + 1) + "/" + App.PATS[p]); };
  App.clearPattern = (p) => {
    const P = App.P;
    if (!P.tracks.some((T) => filled(T, p))) return;
    for (let t = 0; t < 8; t++) wipe(t, p);
    cleared("PATTERN " + App.PATS[p]);
  };
  App.clearTrack = (t) => {
    const T = App.P.tracks[t];
    if (!T.clips.some((_, p) => filled(T, p))) return;
    for (let p = 0; p < 8; p++) wipe(t, p);
    cleared("TRACK " + pad2(t + 1) + " " + T.name);
  };
  // The first pattern after this one that the target has nothing in, so a copy never lands on material.
  const nextFree = (p, test) => { for (let k = 1; k < 8; k++) { const q = (p + k) % 8; if (!test(q)) return q; } return -1; };
  App.duplicateClip = (t, p) => {
    const q = nextFree(p, (k) => filled(App.P.tracks[t], k));
    if (q < 0) { UI.msg("NO EMPTY CELL ON THIS TRACK"); return; }
    App.copyClip({ t, p }, { t, p: q });
  };
  App.duplicatePattern = (p) => {
    const P = App.P, q = nextFree(p, (k) => P.tracks.some((T) => filled(T, k)));
    if (q < 0) { UI.msg("NO EMPTY PATTERN"); return; }
    App.copyPattern(p, q);
  };
  // One instrument on another track: the device and its samples, not the notes or the mixer strip.
  App.copyDevice = (a, b) => {
    if (a === b) return;
    const P = App.P, A = P.tracks[a], B = P.tracks[b];
    releaseAll();
    App.E?.panic();
    B.kind = A.kind; B.syn = clone(A.syn); B.smp = clone(A.smp); B.kit = clone(A.kit); B.arp = clone(A.arp);
    // MODULATION… is part of the device: its routes, macros and LFO go along. Inserts, sends and the EQ are the strip's.
    const from = P.rack?.strips?.[a], to = P.rack?.strips?.[b];
    if (from && to) for (const k of ["routes", "macros", "macroNames", "lfoRate", "lfoBeats", "lfoWave"]) to[k] = clone(from[k]);
    App.commit();
    App.E?.syncTrack(b);
    if (P.sel.t === b) { App.Dv.build(); App.Sg.source(); }
    redraw();
    App.select(b);
    UI.msg("DEVICE OF " + pad2(a + 1) + " " + A.name + " COPIED TO " + pad2(b + 1) + " " + B.name + " WITH ITS MODULATION · UNDO REVERTS");
  };
  App.copyPad = (ti, a, b, swap) => {
    if (a === b) return;
    const P = App.P, pads = P.tracks[ti].kit.pads, from = clone(pads[a]), to = clone(pads[b]);
    pads[b] = from;
    if (swap) pads[a] = to;
    P.sel.pad = b;
    App.commit();
    App.E?.syncTrack(ti);
    App.Dv.build(); App.Ed.sync();
    UI.msg("PAD " + (a + 1) + (swap ? " AND " + (b + 1) + " SWAPPED" : " COPIED TO PAD " + (b + 1)) + " · UNDO REVERTS");
  };
  App.resetPad = (ti, i) => {
    const P = App.P, fresh = App.newKit().pads[i];
    P.tracks[ti].kit.pads[i] = fresh;
    App.commit();
    App.E?.syncTrack(ti);
    App.Dv.build(); App.Ed.sync();
    UI.msg("PAD " + (i + 1) + " BACK TO " + fresh.name + " · UNDO REVERTS");
  };

  /* ── samples ── */
  const AUDIO = /\.(wav|mp3|ogg|oga|flac|m4a|aac|aif|aiff|webm|opus)$/i;
  const assign = (tg, id) => {
    const T = App.P.tracks[tg.ti], S = App.samples.get(id);
    if (tg.pad != null) Object.assign(T.kit.pads[tg.pad], { src: 1, id, st: 0, en: 1, dec: 4, pit: 0, rev: 0, name: S.name.replace(/[^A-Z0-9 #+-]/g, "").trim().slice(0, 8) || "SAMPLE" });
    else {
      if (T.kind !== "smp") { T.kind = "smp"; UI.msg("TRACK " + pad2(tg.ti + 1) + " IS NOW A SAMPLER · UNDO REVERTS"); }
      Object.assign(T.smp, { id, st:0, en:1, markers:[], warpSource:"", warpSpec:{from:App.P.bpm,to:App.P.bpm,anchors:[]} });
    }
  };
  const landed = (tg) => {
    App.commit();
    App.E && App.E.syncTrack(tg.ti);
    if (tg.pad != null && tg.ti === App.P.sel.t) App.P.sel.pad = tg.pad;
    App.Mx.sync(); App.Ed.sync(); App.Dv.build();
  };
  App.assignBufferToSampler = (ti,id) => {
    if(!App.P.tracks[ti] || !App.samples.has(id))throw Error("Sample or destination is unavailable.");
    assign({ti},id); App.P.tracks[ti].smp.mode=0; landed({ti});
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
    if (proj) { await openFile(proj,false); return; }
    const midi = files.find(f => /\.midi?$/i.test(f.name) || /^(audio\/(x-)?midi)$/i.test(f.type));
    if (midi) { await openFile(midi,true); return; }
    const generation = session;
    const audio = files.filter((f) => f.type.startsWith("audio/") || AUDIO.test(f.name));
    if (!audio.length) { UI.msg("NOT AN AUDIO FILE"); return; }
    tg = resolve(tg);
    let n = 0, last = tg;
    for (const f of audio) {
      if (tg.pad != null && tg.pad + n > 7) break;
      try {
        const id = await App.addSample(f.name.replace(/\.[^.]+$/, "").toUpperCase().slice(0, 40), f);
        if (generation !== session) return;
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
    const generation = session;
    try {
      if (App.taping) {
        const r = App.taping;
        App.taping = null;
        const take = await r.stop();
        if (generation !== session) return;
        if (App.take) App.takeBefore = App.take; // the one it replaces stays within reach (right-click the take or TAPE)
        App.take = take; App.takeKept = false;
        UI.msg("TAKE READY · CLICK IT = SAVE WAV · DRAG IT ONTO A TRACK OR PAD = SAMPLE" + (App.takeBefore ? " · RIGHT-CLICK = THE TAKE BEFORE" : ""));
      } else {
        const rec = await E.record(E.out);
        if (generation !== session) await rec.stop();
        else App.taping = rec;
      }
    } catch { UI.msg("TAPE RECORDING FAILED"); } finally { tapeBusy = false; App.Top.sync(); }
  };
  const download = (blob, name) => {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, "-");
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  App.download = download;
  App.saveTake = () => { if (App.take) { download(App.wav(App.take), App.P.name + " TAKE " + clock() + ".wav"); App.takeKept = true; UI.msg("TAKE SAVED AS WAV"); } };
  App.swapTake = () => { if (!App.takeBefore) return; [App.take, App.takeBefore] = [App.takeBefore, App.take]; App.takeKept = false; App.Top.sync(); UI.msg("THE TAKE BEFORE IS BACK · RIGHT-CLICK AGAIN SWAPS THEM"); };
  App.dropTake = (tg) => {
    if (!App.take) return;
    tg = resolve(tg);
    assign(tg, App.addBuffer("TAKE " + clock(), App.take));
    landed(tg); App.takeKept = true;
    UI.msg("TAKE IS NOW THE SAMPLE OF TRACK " + pad2(tg.ti + 1) + (tg.pad != null ? " PAD " + (tg.pad + 1) : "") + " · UNDO REVERTS");
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
  let recPending = false;
  App.recStart = async (tg,src) => {
    const E = App.audio(), generation = session;
    if (!E || App.recTo || recPending) return;
    recPending = true;
    try {
      const node = src === "in" ? await E.openInput() : E.out;
      if (generation !== session) return;
      const capture = await E.record(node);
      if (generation !== session) { await capture.stop(); return; }
      App.recTo = {ti:tg.ti,pad:tg.pad,src,rec:capture};
      App.Dv.build(); App.Top.sync();
      UI.msg("RECORDING " + (src === "in" ? "THE INPUT" : "THE OUTPUT") + " INTO TRACK " + pad2(tg.ti + 1) + " · STOP ON THE DEVICE OR ON REC IN THE TOP BAR");
    } catch { if (generation === session) UI.msg("RECORDING UNAVAILABLE · CHECK INPUT AND PERMISSIONS"); }
    finally { recPending = false; }
  };
  App.recStop = async () => {
    const r = App.recTo, generation = session;
    if (!r) return;
    App.recTo = null;
    try {
      const buf = trim(await r.rec.stop());
      if (generation !== session) return;
      if (buf.length < 64) { UI.msg("NOTHING RECORDED"); return; }
      assign(r,App.addBuffer((r.src === "in" ? "INPUT " : "RESAMPLE ") + clock(),buf)); landed(r);
      UI.msg(buf.duration.toFixed(2) + " S RECORDED INTO TRACK " + pad2(r.ti + 1) + (r.pad != null ? " PAD " + (r.pad + 1) : "") + " · UNDO REVERTS");
    } catch { UI.msg("RECORDING COULD NOT BE SAVED"); }
    finally { App.Dv.build(); App.Top.sync(); }
  };

  /* ── projects, recovery and interchange ─────────────────────── */
  const backupKey = "musiclab.v3.before-reset";
  let backup = null, backupTake = null, backupStored = true, fileRequest = 0;
  const b64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const unb64 = (data, type) => {
    const binary = atob(data), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || "audio/wav" });
  };
  const noteCount = p => p.tracks.reduce((n,t) => n+t.clips.reduce((k,c)=>k+c.length,0),0);
  const projectStats = p => [[noteCount(p),"note"],[p.tracks.reduce((n,t) => n + t.automation.reduce((sum,lanes) => sum + Object.keys(lanes).length,0),0),"curve"],[App.sampleIds(p).size,"sample"],[p.chain.length,"song slot"]]
    .map(([n,label]) => n + " " + label + (n === 1 ? "" : "s")).join(" · ");

  function lastReset() {
    if (!backup) {
      try { backup = App.sanitize(JSON.parse(localStorage.getItem(backupKey))); } catch { /* Storage is optional. */ }
    }
    return backup;
  }
  App.hasRecovery = () => !!lastReset();

  function rememberReset() {
    const previous = clone(App.P);
    const blank = App.sanitize(App.newProject());
    blank.sel = previous.sel;
    if (JSON.stringify(App.sanitize(previous)) === JSON.stringify(blank) && lastReset() && !App.take) return false;
    backup = previous; backupTake = App.take || null;
    return true;
  }
  function persistRecovery() {
    try { localStorage.setItem(backupKey,JSON.stringify(backup)); backupStored = true; }
    catch {
      backupStored = false;
      try { localStorage.removeItem(backupKey); } catch { /* Storage is unavailable. */ }
    }
  }

  async function packProject(project) {
    const out = clone(project);
    out.samples = [];
    for (const id of App.sampleIds(out)) {
      const blob = await App.sampleBlob(id);
      if (!blob) throw Error("SAMPLE MISSING · RELOAD IT BEFORE SAVING");
      out.samples.push({id, name:App.samples.get(id)?.name || id, type:blob.type || "audio/wav", data:await b64(blob)});
    }
    return out;
  }
  // A project file is written and read in pieces, so its size is not bound by the longest string a browser allows.
  // The pieces are whole triplets of bytes going out and whole quartets of characters coming in, so they join cleanly.
  const TRIPLETS = 3 << 20, QUARTETS = 4 << 20;
  async function projectBlob(project) {
    const out = clone(project);
    delete out.samples;
    const parts = [JSON.stringify(out).slice(0,-1) + ',"samples":['];
    let count = 0;
    for (const id of App.sampleIds(out)) {
      const blob = await App.sampleBlob(id);
      if (!blob) throw Error("SAMPLE MISSING · RELOAD IT BEFORE SAVING");
      parts.push((count++ ? "," : "") + JSON.stringify({id, name:App.samples.get(id)?.name || id, type:blob.type || "audio/wav"}).slice(0,-1) + ',"data":"');
      for (let at = 0; at < blob.size; at += TRIPLETS) parts.push(await b64(blob.slice(at,at + TRIPLETS)));
      parts.push('"}');
    }
    parts.push("]}");
    return {blob:new Blob(parts,{type:"application/json"}), count};
  }
  async function saveProject() {
    const name = App.P.name, {blob,count} = await projectBlob(App.P);
    download(blob,name + ".musiclab.json");
    UI.msg("PROJECT SAVED · " + count + " SAMPLE" + (count === 1 ? "" : "S") + " INCLUDED");
  }
  async function fromBase64(text, type) {
    const parts = [];
    for (let at = 0; at < text.size; at += QUARTETS) {
      const binary = atob(await text.slice(at,at + QUARTETS).text()), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      parts.push(bytes);
    }
    return new Blob(parts,{type:type || "audio/wav"});
  }
  const sameBytes = async (a, b) => {
    if (a.size !== b.size) return false;
    for (let at = 0; at < a.size; at += TRIPLETS) if (await b64(a.slice(at,at + TRIPLETS)) !== await b64(b.slice(at,at + TRIPLETS))) return false;
    return true;
  };
  // A large file is never held as one string. One pass over its bytes finds the top-level "samples" list and where
  // each sample's audio lies; the project around the list parses as usual and the audio is decoded from its place.
  async function readProject(file) {
    if (file.size < App.ProjectFiles.streamFrom) { const raw = JSON.parse(await file.text()); return {raw, entries:raw?.samples}; }
    const entries = [], STEP = 8 << 20;
    let depth = 0, inString = false, escaped = false, text = "", last = "", key = "", list = null, entry = null, audio = false;
    for (let base = 0; base < file.size; base += STEP) {
      const bytes = new Uint8Array(await file.slice(base,base + STEP).arrayBuffer());
      for (let i = 0; i < bytes.length; i++) {
        if (audio) { // base64 has no quotes or escapes: jump to where the audio ends
          const end = bytes.indexOf(34,i);
          if (end < 0) break;
          i = end; entry.to = base + i; audio = inString = false; last = null; continue;
        }
        const c = bytes[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === 92) escaped = true;
          else if (c === 34) { inString = false; last = text; }
          else if (text !== null) text = text.length < 8 ? text + String.fromCharCode(c) : null; // only short keys matter
        } else if (c === 34) {
          inString = true; escaped = false; text = "";
          if (entry && depth === 3 && key === "data" && entry.from == null) { entry.from = base + i + 1; audio = true; }
        } else if (c === 58) key = last;
        else if (c === 44) key = "";
        else if (c === 123 || c === 91) {
          depth++;
          if (c === 91 && depth === 2 && key === "samples" && !list) list = {start:base + i};
          else if (c === 123 && depth === 3 && list && list.end == null) entry = {start:base + i};
          key = "";
        } else if (c === 125 || c === 93) {
          if (c === 125 && depth === 3 && entry) { entry.end = base + i + 1; entries.push(entry); entry = null; }
          else if (c === 93 && depth === 2 && list && list.end == null) list.end = base + i + 1;
          depth--;
        }
      }
    }
    if (!list || list.end == null) throw SyntaxError("No sample list");
    const raw = JSON.parse(await new Blob([file.slice(0,list.start),"[]",file.slice(list.end)]).text());
    const read = [];
    for (const e of entries) {
      const whole = e.from == null || e.to == null;
      const item = JSON.parse(await (whole ? file.slice(e.start,e.end) : new Blob([file.slice(e.start,e.from),file.slice(e.to,e.end)])).text());
      if (!whole) item.base64 = file.slice(e.from,e.to);
      read.push(item);
    }
    return {raw, entries:read};
  }

  async function finishRecordings() {
    if (App.recTo) await App.recStop();
    if (App.taping) await App.tape();
  }

  function resetTools(keepRecent=false) {
    App.AudioStudio?.reset(); App.Live?.reset(); App.Groove?.reset(); App.MidiIO?.reset(); App.Library?.stop(); App.Rules?.reset(); if(keepRecent)App.Retrospective?.rebind();else App.Retrospective?.reset(); App.Scenes?.reset?.();
  }
  function installProject(project, take = null) {
    session++;
    App.releaseAll(); Seq.stop(); Seq.startAt(0);
    App.E?.panic(true); App.Sg.reset(); App.E?.closeInput();
    App.recArm = false; App.take = take; octave = 4;
    resetTools(); App.Ed.reset?.();
    if (project.performance?.source === "live") project.performance.source = "arrangement"; // a launcher session ends with the transport
    App.P = project;
    App.commit(true); App.refresh(); App.Workspace.focus("");
  }

  async function resetProject() {
    const response = await App.Workspace.decide({
      title:"Reset project?", rows:[
        ["Project",App.P.name],["Current contents",projectStats(App.P)],
        ["Reset to","Empty clips · default instruments, mixer and transport"],
        ["Recovery","Undo · File › Restore last reset"],
        ...(App.taping || App.recTo || App.take ? [["Tape / input","Recordings stop · last tape kept in this tab"]] : [])
      ], actions:[{label:"Save a copy",id:"save"},{label:"Reset project",id:"reset",primary:true}]
    });
    if (response === "save") return saveProject();
    if (response !== "reset") return;
    ++fileRequest;
    await finishRecordings();
    App.commit();
    const changed = rememberReset();
    installProject(App.newProject(), App.take); // the dialog says the tape is kept: it is, where it was
    if (changed) persistRecovery();
    UI.msg(backupStored ? "BLANK PROJECT · UNDO OR FILE › RESTORE LAST RESET" : "BLANK PROJECT · RECOVERY AVAILABLE IN THIS TAB ONLY");
  }

  async function restoreReset() {
    const prev = lastReset();
    if (!prev) { UI.msg("NO RESET TO RESTORE"); return; }
    const choice = await App.Workspace.decide({title:"Restore last reset?",rows:[
      ["Restore",prev.name],["Contents",projectStats(prev)],["Replaces",App.P.name],
      ["Recovery","Undo returns to the current project"]
    ],actions:[{id:"restore",label:"Restore project",primary:true}]});
    if (choice !== "restore") return;
    ++fileRequest;
    await finishRecordings(); App.commit(); installProject(clone(prev),App.take || backupTake);
    UI.msg("RESTORED " + prev.name);
  }

  async function importSamples(project, entries) {
    const packed = new Map();
    let stored = true;
    for (const item of Array.isArray(entries) ? entries : []) {
      if (item && typeof item.id === "string" && (item.base64 instanceof Blob || typeof item.data === "string")) packed.set(item.id,item);
    }
    for (const id of App.sampleIds(project)) {
      const item = packed.get(id);
      const existing = await App.sampleBlob(id).catch(()=>null);
      if (!item) {
        if (!existing) throw Error("PROJECT REFERENCES A MISSING SAMPLE");
        continue;
      }
      let blob;
      try { blob = item.base64 instanceof Blob ? await fromBase64(item.base64,item.type) : unb64(item.data,item.type); } catch { throw Error("INVALID SAMPLE DATA"); }
      if (existing && await sameBytes(existing,blob)) continue;
      const dest = existing ? App.uid() : id;
      try { if (!await App.importSample(dest,String(item.name || "SAMPLE").slice(0,40),blob)) stored = false; }
      catch { throw Error("CANNOT DECODE THE EMBEDDED SAMPLE"); }
      if (dest !== id) App.remapSample(project,id,dest);
    }
    return stored;
  }

  App.ProjectFiles = {pack:packProject, importSamples, blob:projectBlob, read:readProject, streamFrom:64 << 20};

  async function openFile(file, isMidi) {
    const request = ++fileRequest;
    const current = () => request === fileRequest;
    try {
      let project, entries, summary;
      if (isMidi) {
        const result = App.MidiImport.read(await file.arrayBuffer(),file.name);
        project = result.project; summary = result.summary;
      } else {
        const read = await readProject(file), raw = read.raw;
        project = raw?.app === "MUSICLAB" && raw.v === 3 ? App.sanitize(raw) : null;
        if (!project) throw Error("UNSUPPORTED PROJECT FORMAT");
        entries = read.entries;
      }
      if (!current()) return;
      const rows = [["File",file.name],["Project",project.name],["Contents",projectStats(project)]];
      if (summary) rows.push(["MIDI mapping",summary]);
      rows.push(["Replaces",App.P.name+" · Undo available"]);
      const choice = await App.Workspace.decide({title:isMidi?"Import MIDI?":"Open project?",rows,
        actions:[{id:"open",label:isMidi?"Import MIDI":"Open project",primary:true}]});
      if (!current() || choice !== "open") return;
      const samplesStored = isMidi || await importSamples(project,entries);
      if (!current()) return;
      await finishRecordings();
      if (!current()) return;
      App.commit();installProject(project,App.take); // the take is a recording of what was heard, not part of the project it replaces
      UI.msg((isMidi?"MIDI IMPORTED · ":"OPENED ") + project.name + (samplesStored ? "" : " · SAMPLES IN THIS TAB ONLY · SAVE A PROJECT COPY"));
    } catch (e) {
      if (current()) UI.msg(e instanceof SyntaxError ? "INVALID PROJECT JSON" : e.message || "IMPORT FAILED");
    }
  }
  App.pickFile = (accept, cb, multiple = true) => {
    const inp = document.getElementById("file");
    inp.accept = accept; inp.multiple = multiple; inp.value = "";
    inp.onchange = () => { if (inp.files.length) cb([...inp.files]); };
    inp.click();
  };
  App.file = async (v) => {
    const name = App.P.name;
    try {
      if (v === "stems") return await App.Rack.stems();
      if (v === "library") return await App.Library.open();
      if (v === "new") return await resetProject();
      if (v === "restore") return await restoreReset();
      if (v === "open") App.pickFile(".json,application/json", f=>openFile(f[0],false),false);
      else if (v === "import-midi") App.pickFile(".mid,.midi,audio/midi", f=>openFile(f[0],true),false);
      else if (v === "save") await saveProject();
      else if (v === "mid" || v === "wav") {
        // An export says what it took: the song, one pattern, launched clips or a take. An empty source is not exported.
        const P = App.P, src = P.performance.source, song = Seq.songOn(), bank = song ? App.songPatterns(P) : [P.sel.p];
        const what = src === "live" ? "LAUNCHED CLIPS · " + P.performance.bars + " BARS" : src === "take" ? "RECORDED TAKE" : song ? "SONG · " + P.chain.length + " SLOTS" : "PATTERN " + App.PATS[P.sel.p];
        const empty = src === "arrangement" && !bank.some(p => P.tracks.some(t => t.clips[p].length)) && !(v === "wav" && App.AudioStudio.durationSteps(P));
        if (empty) { UI.msg("NOTHING TO EXPORT · " + (song ? "THE SONG'S PATTERNS ARE" : "PATTERN " + App.PATS[P.sel.p] + " IS") + " EMPTY"); return; }
        if (v === "mid") { download(Seq.midi(),name + ".mid"); UI.msg("MIDI EXPORTED · " + what); return; }
        UI.msg("RENDERING " + what);
        const {blob,duration,sampleRate} = await Seq.bounceWav();
        const music = src === "live" ? 0 : App.Conductor.time(P, Seq.rangeSteps());
        download(blob,name + ".wav");
        UI.msg("WAV EXPORTED · " + what + " · " + (music && duration > music + 0.05 ? music.toFixed(1) + " S + " + (duration - music).toFixed(1) + " S TAIL" : duration.toFixed(1) + " S") + " · 24 BIT " + sampleRate/1000 + " KHZ");
      }
    } catch (e) { UI.msg(e.message || "FILE OPERATION FAILED"); }
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
    const c = App.recArm && Seq.playing ? Seq.now(ti) : null;
    if (!c) return null;
    const P = App.P, n = c.n || App.Live.length(P,ti,c.pat), near = Math.round(c.step), s = near % n, clip = P.tracks[ti].clips[c.pat];
    for (let i = clip.length - 1; i >= 0; i--) if (clip[i].n === note && clip[i].s === s) clip.splice(i, 1);
    const nt = { s, n: note, l: 1, v: Math.round(vel * 100) / 100, p: 1 };
    const offset = App.Groove.recordOffset(c);
    if (offset) nt.off = offset;
    clip.push(nt);
    // Snapped forward, the playhead reaches this note in a moment: it was just heard, so skip that one trigger.
    if (near > c.step) Seq.skip.set(nt, App.E.ctx.currentTime + c.sd);
    App.Ed.draw(); App.Mx.draw();
    return { nt, clip, t0: App.E.ctx.currentTime, sd: c.sd, n };
  };
  // A pass of recording is one undo step, however many notes it holds: it is closed when the playing pauses,
  // when the transport stops and before an undo.
  let recOpen = false, recT = 0;
  const recClose = (App.recClose = () => { clearTimeout(recT); if (recOpen) { recOpen = false; App.commit(); } });
  App.noteOn = (note, vel, id) => {
    const E = App.audio();
    if (held.has(id)) return;
    App.Groove.tap(vel);
    if (!E) return;
    const P = App.P, ti = P.sel.t, T = P.tracks[ti];
    const same = [...held.values()].find(key => key.ti === ti && key.note === note);
    if (same) { held.set(id, same); return; }
    if (T.kind === "kit" && note >= 36 && note < 44 && P.sel.pad !== note - 36) { P.sel.pad = note - 36; App.Dv.build(); App.Ed.draw(); }
    E.noteOn(ti, note, vel);
    if (App.recArm && !Seq.playing) UI.msg("REC IS ARMED BUT THE TRANSPORT IS STOPPED · PRESS PLAY TO RECORD WHAT YOU PLAY");
    if (!id.startsWith("m:")) App.MidiIO.live(ti,note,vel);
    App.Ed.key(note, true);
    held.set(id, { ti, note, rec: recNote(ti, note, vel), recent: App.Retrospective.start(ti,note,vel) });
  };
  App.noteOff = (id) => {
    const d = held.get(id);
    if (!d) return;
    held.delete(id);
    if ([...held.values()].includes(d)) return;
    if (!id.startsWith("m:")) App.MidiIO.live(d.ti,d.note,0);
    App.Retrospective.end(d.recent);
    App.Ed.key(d.note, false);
    App.E && App.E.noteOff(d.ti, d.note);
    if (d.rec) {
      // Held past the end of the clip, the note stops at the end: a longer one could not be seen or shortened.
      d.rec.nt.l = clamp(Math.round((App.E.ctx.currentTime - d.rec.t0) / d.rec.sd), 1, Math.max(1, d.rec.n - d.rec.nt.s));
      d.rec.clip.sort((a, b) => a.s - b.s || a.n - b.n);
      recOpen = true; App.touch();
      clearTimeout(recT); recT = setTimeout(recClose, 2000);
      App.Ed.draw(); App.Mx.draw();
    }
  };

  App.silence = () => { releaseAll(); App.recClose(); Seq.stop(); App.Live.rest(); App.E?.panic(true); UI.msg("TRANSPORT STOPPED · ALL SOUND OFF"); };
  App.playToggle = () => {
    if (!Seq.playing) {
      const P = App.P, bank = Seq.songOn() ? App.songPatterns(P) : [P.sel.p];
      if (!bank.some(p => P.tracks.some(t => t.clips[p].length)) && !P.click && !App.AudioStudio.durationSteps(P) && P.performance.source === "arrangement")
        UI.msg(App.recArm ? "RECORDING INTO PATTERN " + App.PATS[P.sel.p] + " · PLAY THE KEYS" : "EMPTY " + (Seq.songOn() ? "SONG" : "PATTERN") + " · CLICK THE NOTE GRID OR ARM REC AND PLAY");
      // The launcher and a recorded take replace the song as what PLAY plays. Say so, since nothing else on the console does.
      else if (P.performance.source === "take") UI.msg("PLAYING THE RECORDED TAKE · CLICK TAKE IN THE SONG ROW TO PLAY PATTERNS AGAIN");
    }
    if (Seq.playing) App.recClose(); // stopping closes the recording pass
    if (Seq.toggle() === "rested") UI.msg("LIVE ENDED · PLAY IS " + (Seq.songOn() ? "THE SONG" : "PATTERN " + App.PATS[App.P.sel.p]) + " AGAIN");
  };
  window.addEventListener("keydown", (e) => {
    if (!e.defaultPrevented && e.target.closest?.("dialog[data-instrument-keys]") && !e.target.closest?.("input,textarea,select,[contenteditable=true]") && !(e.ctrlKey || e.metaKey || e.altKey)) {
      const n=noteFor(e.code);
      if (n!=null) {e.preventDefault();if(!e.repeat)App.noteOn(n,.8,e.code);}
      return;
    }
    if (e.defaultPrevented || document.querySelector("dialog[open],[role=dialog]") ||
        e.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
    if (UI.menuOpen() || document.querySelector(".pop,.mn")) {
      if (e.key === "Escape") { e.preventDefault(); UI.closeMenu(true); }
      return;
    }
    // SPACE is the transport wherever the last click was. A button keeps the focus after its dialog or menu closes,
    // and would otherwise take the key and open it again; ENTER still presses a focused button.
    const onButton = e.target.closest?.("button");
    if (e.code === "Space" && onButton && !(e.ctrlKey || e.metaKey || e.altKey)) onButton.blur();
    else if (e.target.closest?.("button,[role=slider],[role=switch]") && ["Enter"," "].includes(e.key)) return;
    // Notes shown as selected answer the editor's keys wherever the focus is (Delete, arrows, Ctrl/Cmd A and D, Escape).
    if (!e.target.closest?.("#ed") && App.Ed.keys(e)) return;
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
      case "Space": e.preventDefault(); if (!e.repeat) App.playToggle(); return;
      case "Escape": if (App.Workspace.focused()) App.Workspace.focus(""); else App.silence(); return;
      case "Delete": case "Backspace": UI.msg("NO NOTES SELECTED · CTRL/CMD A SELECTS ALL · A WHOLE CLIP: RIGHT-CLICK IT › CLEAR"); return;
      case "ArrowLeft": e.preventDefault(); App.select(s.t, (s.p + 7) % 8); UI.msg("PATTERN " + App.PATS[App.P.sel.p]); return;
      case "ArrowRight": e.preventDefault(); App.select(s.t, (s.p + 1) % 8); UI.msg("PATTERN " + App.PATS[App.P.sel.p]); return;
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
  App.midi = () => App.MidiIO.open();
  App.releaseMidi = ids => {
    for (const key of [...held.keys()]) if (key.startsWith("m:") && !ids.some(id => key.startsWith("m:"+id+":"))) App.noteOff(key);
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
    const stored = App.stored();
    App.P = stored || App.newProject();
    if (App.P.performance.source === "live") App.P.performance.source = "arrangement"; // a launcher session ends with the transport
    UI.init();
    App.Top.build(); App.Mx.build(); App.Ed.build(); App.Dv.build(); App.Fx.build(); App.Sg.build();
    App.Workspace.init();
    App.commit();
    App.refresh();
    // Only a project that was read back says which recordings are still in use.
    App.tidySamples(stored ? [stored, lastReset()] : null).then((n) => { if (n) UI.msg("STORAGE · " + n + " UNUSED SAMPLE" + (n === 1 ? "" : "S") + " CLEARED"); }).catch(() => {});
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
