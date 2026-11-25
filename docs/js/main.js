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
    App.Top.sync(); App.Mx.sync(); App.Ed.sync(); App.Dv.build(); App.Fx.sync(); App.Sg.source();
    App.restoreSamples().then((n) => { if (n) App.Dv.build(); }); // the sample name and waveform appear once decoded
  };
  App.doUndo = d => {
    App.releaseAll();
    if (d < 0 ? App.undo() : App.redo()) {
      session++; App.E?.panic(true); App.refresh();
      UI.msg(d < 0 ? "UNDONE" : "REDONE");
    } else UI.msg(d < 0 ? "NOTHING TO UNDO" : "NOTHING TO REDO");
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
  App.songDel = i => {
    App.P.chain.splice(i,1);
    if (!App.P.chain.length) { App.P.song = 0; Seq.startAt(0); }
    else if (Seq.start() >= App.P.chain.length) Seq.startAt(App.P.chain.length-1);
    App.commit(); App.Mx.sync(); App.Top.sync();
  };
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
        App.take = take;
        UI.msg("TAKE READY · CLICK IT = SAVE WAV · DRAG IT ONTO A TRACK OR PAD = SAMPLE");
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
      App.Dv.build();
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
    } catch { UI.msg("RECORDING COULD NOT BE SAVED"); }
    finally { App.Dv.build(); }
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
  const projectStats = p => [[noteCount(p),"note"],[App.sampleIds(p).size,"sample"],[p.chain.length,"song slot"]]
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

  async function saveProject() {
    const out = clone(App.P);
    out.samples = [];
    for (const id of App.sampleIds(out)) {
      const blob = await App.sampleBlob(id);
      if (!blob) throw Error("SAMPLE MISSING · RELOAD IT BEFORE SAVING");
      out.samples.push({id, name:App.samples.get(id)?.name || id, type:blob.type || "audio/wav", data:await b64(blob)});
    }
    download(new Blob([JSON.stringify(out)],{type:"application/json"}),out.name + ".musiclab.json");
    UI.msg("PROJECT SAVED · " + out.samples.length + " SAMPLES INCLUDED");
  }

  async function finishRecordings() {
    if (App.recTo) await App.recStop();
    if (App.taping) await App.tape();
  }

  function installProject(project, take = null) {
    session++;
    App.releaseAll(); Seq.stop(); Seq.startAt(0);
    App.E?.panic(true); App.Sg.reset(); App.E?.closeInput();
    App.recArm = false; App.take = take; octave = 4;
    App.Ed.reset?.();
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
    installProject(App.newProject());
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
    await finishRecordings(); App.commit(); installProject(clone(prev),backupTake);
    UI.msg("RESTORED " + prev.name);
  }

  async function importSamples(project, entries) {
    const packed = new Map();
    let stored = true;
    for (const item of Array.isArray(entries) ? entries : []) {
      if (item && typeof item.id === "string" && typeof item.data === "string") packed.set(item.id,item);
    }
    for (const id of App.sampleIds(project)) {
      const item = packed.get(id);
      const existing = await App.sampleBlob(id).catch(()=>null);
      if (!item) {
        if (!existing) throw Error("PROJECT REFERENCES A MISSING SAMPLE");
        continue;
      }
      let blob;
      try { blob = unb64(item.data,item.type); } catch { throw Error("INVALID SAMPLE DATA"); }
      if (existing && existing.size === blob.size && (await b64(existing)) === item.data) continue;
      const dest = existing ? App.uid() : id;
      try { if (!await App.importSample(dest,String(item.name || "SAMPLE").slice(0,40),blob)) stored = false; }
      catch { throw Error("CANNOT DECODE THE EMBEDDED SAMPLE"); }
      if (dest !== id) for (const t of project.tracks) {
        if (t.smp.id === id) t.smp.id = dest;
        for (const pad of t.kit.pads) if (pad.id === id) pad.id = dest;
      }
    }
    return stored;
  }

  async function openFile(file, isMidi) {
    const request = ++fileRequest;
    const current = () => request === fileRequest;
    try {
      let project, entries, summary;
      if (isMidi) {
        const result = App.MidiImport.read(await file.arrayBuffer(),file.name);
        project = result.project; summary = result.summary;
      } else {
        const raw = JSON.parse(await file.text());
        project = raw?.app === "MUSICLAB" && raw.v === 3 ? App.sanitize(raw) : null;
        if (!project) throw Error("UNSUPPORTED PROJECT FORMAT");
        entries = raw.samples;
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
      App.commit();installProject(project);
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
      if (v === "new") return await resetProject();
      if (v === "restore") return await restoreReset();
      if (v === "open") App.pickFile(".json,application/json", f=>openFile(f[0],false),false);
      else if (v === "import-midi") App.pickFile(".mid,.midi,audio/midi", f=>openFile(f[0],true),false);
      else if (v === "save") await saveProject();
      else if (v === "mid") download(Seq.midi(),name + ".mid");
      else if (v === "wav") {
        UI.msg("RENDERING");
        const buf = await Seq.bounce();
        download(App.wav(buf),name + ".wav");
        UI.msg("WAV EXPORTED · " + buf.duration.toFixed(1) + " S · 24 BIT " + buf.sampleRate/1000 + " KHZ");
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
    const same = [...held.values()].find(key => key.ti === ti && key.note === note);
    if (same) { held.set(id, same); return; }
    if (T.kind === "kit" && note >= 36 && note < 44 && P.sel.pad !== note - 36) { P.sel.pad = note - 36; App.Dv.build(); App.Ed.draw(); }
    E.noteOn(ti, note, vel);
    App.Ed.key(note, true);
    held.set(id, { ti, note, rec: recNote(ti, note, vel) });
  };
  App.noteOff = (id) => {
    const d = held.get(id);
    if (!d) return;
    held.delete(id);
    if ([...held.values()].includes(d)) return;
    App.Ed.key(d.note, false);
    App.E && App.E.noteOff(d.ti, d.note);
    if (d.rec) {
      d.rec.nt.l = clamp(Math.round((App.E.ctx.currentTime - d.rec.t0) / d.rec.sd), 1, 64);
      d.rec.clip.sort((a, b) => a.s - b.s || a.n - b.n);
      App.commit();
      App.Ed.draw(); App.Mx.draw();
    }
  };

  App.silence = () => { releaseAll(); Seq.stop(); App.E?.panic(true); UI.msg("TRANSPORT STOPPED · ALL SOUND OFF"); };
  App.playToggle = () => {
    if (!Seq.playing) {
      const P = App.P, bank = Seq.songOn() ? P.chain : [P.sel.p];
      if (!bank.some(p => P.tracks.some(t => t.clips[p].length)) && !P.click)
        UI.msg("EMPTY " + (Seq.songOn() ? "SONG" : "PATTERN") + " · CLICK THE NOTE GRID OR ARM REC AND PLAY");
    }
    Seq.toggle();
  };
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || document.querySelector("dialog[open],[role=dialog]") ||
        e.target.closest?.("input,textarea,select,[contenteditable=true]")) return;
    if (UI.menuOpen() || document.querySelector(".pop,.mn")) {
      if (e.key === "Escape") { e.preventDefault(); UI.closeMenu(true); }
      return;
    }
    if (((e.ctrlKey || e.metaKey) && e.code === "KeyK") || e.key === "?") {
      e.preventDefault(); if (!e.repeat) App.Workspace.commands(); return;
    }
    if (e.target.closest?.("button,[role=slider],[role=switch]") && ["Enter"," "].includes(e.key)) return;
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
    const key = "m:" + e.currentTarget.id + ":" + (st & 15) + ":" + d1;
    if (c === 0x90 && d2 > 0 && !document.querySelector("dialog[open]")) App.noteOn(d1, d2 / 127, key);
    else if (c === 0x80 || c === 0x90) App.noteOff(key);
  };
  App.midi = async () => {
    if (!navigator.requestMIDIAccess) { UI.msg("THIS BROWSER HAS NO WEB MIDI"); return; }
    try {
      const acc = await navigator.requestMIDIAccess();
      const hook = () => {
        let n = 0;
        for (const inp of acc.inputs.values()) { inp.onmidimessage = onMidi; n++; }
        const ports = [...acc.inputs.keys()].map(id => "m:" + id + ":");
        for (const key of [...held.keys()]) {
          if (key.startsWith("m:") && !ports.some(prefix => key.startsWith(prefix))) App.noteOff(key);
        }
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
    App.Workspace.init();
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
