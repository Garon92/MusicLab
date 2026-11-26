/* MUSICLAB · panels — top bar, track/pattern matrix + song, device, master */
(() => {
  "use strict";
  const { DEF, PATS, pad2, clamp } = App, UI = App.UI, { h, btn } = UI;
  const $ = (id) => document.getElementById(id);
  const P = () => App.P;
  const KIND = { syn: "SYN", kit: "DRM", smp: "SMP" };
  const instruments = {syn:"Synth", kit:"Drums", smp:"Sampler"};
  function changeKind(ti, kind) {
    const track = P().tracks[ti];
    if (track.kind === kind) return;
    App.releaseAll();
    App.E?.cutTrack(ti);
    track.kind = kind;
    App.commit();
    App.E?.syncTrack(ti);
    App.Dv.build(); App.Mx.sync(); App.Ed.sync();
  }
  const dbN = (x, floor) => (x < 0.0005 ? 0 : clamp((20 * Math.log10(x) + floor) / floor, 0, 1));
  const mmss = (s) => pad2(Math.floor(s / 60)) + ":" + pad2(Math.floor(s % 60));
  const span = (e, key) => { const m = new RegExp(key + ":span (\\d+)").exec(e.getAttribute("style") || ""); return m ? +m[1] : 1; };
  // A module is a titled block of cells, always 3 rows tall. Unused cells are filled so the hairline grid stays closed.
  const mod = (title, cols, kids, extra, cls) => {
    const rows = cls === "pads" ? 2 : 3;
    let used = 0;
    for (const k of kids) used += span(k, "grid-column") * span(k, "grid-row");
    for (; used < cols * rows; used++) kids.push(h("div.fl"));
    // A module is an object like any other: its name answers a right-click, here with a reset of everything in it.
    const name = h("span", { text: title, tip: title + " · RIGHT-CLICK = RESET THIS MODULE'S VALUES · BRIGHT = SOMETHING IN IT IS CHANGED" });
    const el = h("div.md" + (cls ? "." + cls : ""), { style: `grid-column:span ${cols};--c:${cols}` }, h("div.md-t", null, name, extra), h("div.md-g", null, kids));
    name.oncontextmenu = () => {
      const values = [...el.querySelectorAll(".pm")].filter((p) => p.reset), changed = values.filter((p) => !p.classList.contains("df")).length;
      if (!values.length) return;
      UI.menu(name, [{ label: changed ? "Reset " + changed + (changed === 1 ? " value" : " values") + " to default" : "Nothing changed here", value: "reset", disabled: !changed }], () => {
        let any = false;
        for (const p of values) if (p.reset()) any = true;
        if (any) { App.commit(); App.refresh(); UI.msg(title + " BACK TO DEFAULT · UNDO REVERTS"); }
      }, { label: title });
    };
    return el;
  };
  // The same for a whole device and for a mixer strip. A device goes back to how a new project has it on that kind
  // of track; what is loaded into a sampler or a pad stays, only the settings go back.
  function resetDevice(ti) {
    const T = P().tracks[ti], fresh = App.newProject().tracks[ti];
    App.releaseAll(); App.E?.cutTrack(ti);
    if (T.kind === "syn") { T.syn = App.defs(App.DEF.syn); T.arp = App.defs(App.DEF.arp); }
    else if (T.kind === "smp") { const { id, st, en, root, markers, warpSource, warpSpec, zones, mode, slices } = T.smp; T.smp = { ...fresh.smp, ...App.defs(App.DEF.smp), id, st, en, root, markers, warpSource, warpSpec, zones, mode, slices }; }
    else T.kit.pads = T.kit.pads.map((pad, i) => ({ ...App.newKit().pads[i], id: pad.id, src: pad.src, st: pad.st, en: pad.en, name: pad.name }));
    App.commit(); App.E?.syncTrack(ti); App.refresh();
    UI.msg(T.name + " DEVICE BACK TO DEFAULT · UNDO REVERTS");
  }
  function resetStrip(ti) {
    const T = P().tracks[ti];
    for (const d of Object.values(App.DEF.trk)) T[d.k] = d.def;
    App.commit(); App.refresh();
    UI.msg(T.name + " LEVEL, PAN, SENDS, MUTE AND SOLO BACK TO DEFAULT · UNDO REVERTS");
  }

  /* ═════ TOP BAR ═════ */
  App.Top = (() => {
    const ICON = { play: '<svg viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>', stop: '<svg viewBox="0 0 10 10"><path d="M2 2h6v6H2z"/></svg>' };
    const buf = new Float32Array(1024), pk = [0, 0];
    let undoB, redoB, nameEl, playB, recB, tapeB, posEl, clickB, takeEl, midiB, om, omL, omR, omT, pms = [], lastPos = "", hold = 0, taps = [];

    const tempo = () => { App.E && App.E.syncAll(); App.touch(); };
    const tap = () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      if (taps.length > 6) taps.shift();
      if (taps.length < 2) return;
      const bpm = clamp(Math.round((60000 * (taps.length - 1)) / (now - taps[0])), 40, 300);
      if (bpm !== P().bpm) { P().bpm = bpm; pms[0].paint(); tempo(); App.commit(); }
    };

    function build() {
      const el = $("top");
      el.innerHTML = "";
      nameEl = h("button.tc.nm", { type: "button", tip: "PROJECT NAME · CLICK TO RENAME", "aria-label": "Rename project" });
      nameEl.onclick = (e) => UI.edit(nameEl, P().name, (s) => { P().name = s.toUpperCase().slice(0, 28); App.commit(); sync(); }, 28, e.detail === 0);
      playB = h("button.bt.ic", { html: ICON.play, tip: "PLAY / STOP · SPACE", type: "button" });
      playB.onclick = () => App.playToggle();
      recB = btn("REC", "RECORD NOTES AND MAPPED CONTROLLERS INTO PLAYING CLIPS", () => { App.recArm = !App.recArm; sync(); }, "rec.tog");
      tapeB = btn("TAPE", "AUDIO RECORD · CAPTURES THE OUTPUT · STOP = TAKE", () => App.tape(), "rec.tog");
      posEl = h("div.tc.pos", { tip: "POSITION · PATTERN  BAR . BEAT . STEP" });
      const redraw = () => { App.Ed.sync(); App.Mx.sync(); };
      const tonal = { cls: "in", done: () => App.Dv.build() }; // note names (Eb or D#) follow key + scale everywhere
      pms = [
        UI.param(DEF.top.bpm, P, tempo, { cls: "in" }),
        UI.param(DEF.top.swing, P, null, { cls: "in" }),
        UI.param(DEF.top.sig, P, () => { redraw(); tempo(); }, { cls: "in" }),
        UI.param(DEF.top.key, P, redraw, tonal),
        UI.param(DEF.top.scale, P, () => { redraw(); pms[3].paint(); }, tonal),
      ];
      clickB = btn("CLICK", "METRONOME · NOT RECORDED", () => { P().click ^= 1; App.commit(); sync(); }, "tog");
      takeEl = h("div.tc.take.dg", { tip: "LAST TAPE TAKE · CLICK = SAVE WAV · DRAG ONTO A TRACK OR PAD = USE AS SAMPLE · RIGHT-CLICK = MENU" });
      takeEl.onpointerdown = (e) => { if (e.button === 0) UI.drag(e, { type: "take", data: 0, label: "TAKE", hint: "DROP ON A TRACK, A PAD OR THE SAMPLE VIEW = USE THE TAKE AS A SAMPLE", click: () => App.saveTake() }); };
      takeEl.oncontextmenu = () => UI.menu(takeEl, [{ label: "Save WAV", value: "save", key: "24-BIT" }, { label: "Discard take", value: "drop" }], (v) => { if (v === "save") App.saveTake(); else { App.take = null; sync(); } });
      omL = h("i"); omR = h("i"); omT = h("span.omv", { text: "-INF" });
      om = h("div.tc.om", { tip: "OUTPUT PEAK dBFS · LEFT OVER RIGHT · RED = LIMITER IS HOLDING THE MIX DOWN, LOWER SOMETHING" }, h("span.l", { text: "OUT" }), h("span.omb", null, omL, omR), omT);
      midiB = btn("MIDI…", "MIDI DEVICES · CONTROLLER LEARN · CLOCK", () => App.midi());
      const fileB = btn("FILE", "OPEN, SAVE, IMPORT AND EXPORT · LIBRARY · TUNING · RESET", () =>
        UI.menu(fileB, [
          { label: "Open project…", value: "open", key: ".JSON" }, { label: "Save project", value: "save", key: "CTRL/CMD S" },
          "-",
          { label: "Import MIDI…", value: "import-midi", key: ".MID" }, { label: "Export MIDI", value: "mid", key: ".MID" },
          { label: "Export audio", value: "wav", key: "24-BIT WAV" }, { label:"Export stems…", value:"stems", key:"WAV / ZIP" }, "-", {label:"Material library…",value:"library"}, "-",
          { label: "Project tuning…", value: "tuning", key:"SCALA" }, { label: "Reset project…", value: "new" }, { label: "Restore last reset…", value: "restore", disabled: !App.hasRecovery() }
        ], v => v === "tuning" ? App.InstrumentLab.tuning() : App.file(v)), "mnu");
      fileB.setAttribute("aria-label", "File"); fileB.setAttribute("aria-haspopup", "menu");
      undoB = btn("UNDO", "UNDO · CTRL Z", () => App.doUndo(-1));
      redoB = btn("REDO", "REDO · CTRL SHIFT Z", () => App.doUndo(1));
      el.append(
        h("div.tc.logo", { text: "MUSICLAB" }), nameEl,
        h("div.tc.grp", null, playB, recB, btn("CAPTURE…","RETRIEVE WHAT WAS JUST PLAYED ON THE KEYS OR MIDI · NO RECORDING NEEDED",()=>App.Retrospective.open()), tapeB), posEl,
        pms[0], h("div.tc", null, btn("TAP", "TAP TEMPO", tap)), pms[1], pms[2], pms[3], pms[4], h("div.tc", null, clickB),
        h("div.sp"), takeEl, om,
        h("div.tc.grp", null, midiB, undoB, redoB, fileB),
      );
    }

    function history() {
      if (undoB) undoB.disabled = !App.canUndo();
      if (redoB) redoB.disabled = !App.canRedo();
    }
    function sync() {
      history();
      nameEl.textContent = P().name;
      playB.innerHTML = (App.Seq.playing ? ICON.stop : ICON.play) + (App.Seq.playing ? "STOP" : "PLAY");
      playB.setAttribute("aria-label", App.Seq.playing ? "Stop playback" : "Play pattern or song");
      for (const [b,on] of [[recB, App.recArm],[tapeB, App.taping],[clickB, P().click]]) b.setAttribute("aria-pressed", String(!!on));
      playB.classList.toggle("on", App.Seq.playing);
      recB.classList.toggle("on", !!App.recArm);
      tapeB.classList.toggle("on", !!App.taping);
      if (!App.taping) tapeB.textContent = "TAPE";
      clickB.classList.toggle("on", !!P().click);
      takeEl.hidden = !App.take;
      if (App.take) takeEl.textContent = "TAKE " + mmss(App.take.duration);
      midiB.classList.toggle("on", App.midiN > 0);
      midiB.textContent = (App.midiN > 0 ? "MIDI " + App.midiN : "MIDI") + "…";
      midiB.setAttribute("aria-label", App.midiN > 0 ? "MIDI " + App.midiN : "MIDI");
      pms.forEach((p) => p.paint());
      pos(App.Seq.pos);
    }

    function pos(c) {
      const p = P(), BS = c?.beatSteps || App.beatSteps(p), s = c?.inside ?? 0;
      // The letter is the pattern that plays. Launched clips and a recorded take play no one pattern, and say so here.
      const src = p.performance.source, what = src === "live" ? "LIVE" : src === "take" ? "TAKE" : PATS[c ? c.pat : p.sel.p];
      const t = what + " " + String((c ? c.bar : 0) + 1).padStart(3, "0") + "." + (Math.floor(s / BS) + 1) + "." + ((s % BS) + 1);
      if (t !== lastPos) posEl.textContent = lastPos = t;
    }

    function frame() {
      const E = App.E;
      if (!E) return;
      [E.mL, E.mR].forEach((an, k) => {
        an.getFloatTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < 1024; i++) { const a = buf[i] < 0 ? -buf[i] : buf[i]; if (a > m) m = a; }
        pk[k] = Math.max(m, pk[k] * 0.9);
        (k ? omR : omL).style.transform = "scaleX(" + dbN(pk[k], 60).toFixed(3) + ")";
      });
      hold = Math.max(pk[0], pk[1], hold * 0.99);
      const t = App.fDb(hold);
      if (omT.textContent !== t) omT.textContent = t;
      om.classList.toggle("hot", E.limiting());
      if (App.taping) { const s = "TAPE " + mmss(App.taping.seconds()); if (tapeB.textContent !== s) tapeB.textContent = s; }
    }

    return { build, sync, pos, frame, history };
  })();

  /* ═════ MATRIX: tracks × patterns, mixer in the row header, song chain below ═════ */
  App.Mx = (() => {
    const heads = [], rows = [], cells = [], slots = [], lv = new Float32Array(8), shown = new Float32Array(8), mbuf = new Float32Array(512);
    const barsDef = { k: "bars", l: "BARS", name: "PATTERN LENGTH IN BARS · NOTES PAST THE END ARE KEPT BUT NOT PLAYED", min: 1, max: 16, def: 1, int: 1, f: (v) => v + " BAR" };
    let contextEl, grid, cv, cx, ph, songEl, songB, liveB, lenEl, phOn = false, runPat = -1, runSlot = -1;

    function build() {
      const el = $("mx");
      el.innerHTML = "";
      heads.length = rows.length = cells.length = slots.length = 0;
      grid = h("div.mx-g");
      for (const [t, tip] of [
        ["TRACK", "TRACK · CLICK = SELECT · DOUBLE-CLICK = RENAME · DROP AUDIO = LOAD"], ["TYPE", "INSTRUMENT TYPE · CHANGE IN DEVICE"],
        ["M", "MUTE"], ["S", "SOLO"], ["LEVEL", "TRACK LEVEL · BAR BEHIND = LIVE SIGNAL"], ["PAN", "TRACK PAN"],
      ]) grid.append(h("div.mx-h", { text: t, tip }));
      for (let p = 0; p < 8; p++) {
        // The length is a value like any other: drag, wheel or type it. Shown capped to what the signature allows.
        const len = { get bars() { return Math.min(P().pats[p].bars, App.maxBars(P())); }, set bars(v) { P().pats[p].bars = v; } };
        const bars = UI.param(barsDef, () => len, () => { App.Ed.sync(); sync(); }, { cls: "c" });
        const e = h("div.mx-p.dg", { tip: "PATTERN " + PATS[p] + " · CLICK = SELECT · DRAG ONTO THE SONG ROW = ADD · DRAG ONTO ANOTHER PATTERN = COPY · RIGHT-CLICK = MENU" }, h("b", { text: PATS[p] }), bars);
        e.onpointerdown = (ev) => {
          if (ev.button !== 0 || ev.target.closest(".pm")) return;
          UI.drag(ev, { type: "pat", data: p, label: "PATTERN " + PATS[p], hint: "DROP ON THE SONG ROW = ADD TO THE SONG · ON ANOTHER PATTERN = COPY EVERY TRACK", click: () => App.select(P().sel.t, p) });
        };
        e.oncontextmenu = (ev) => { if (!ev.target.closest(".pm")) patMenu(e, p); };
        UI.drop(e, { pat: (src) => App.copyPattern(src, p), material:data=>App.Library.drop(data,{p}) });
        e.bars = bars;
        heads.push(e);
        grid.append(e);
      }
      for (let t = 0; t < 8; t++) {
        const T = () => P().tracks[t];
        const push = () => { App.E && App.E.syncTrack(t); App.touch(); };
        const drops = { file: (f) => App.dropFiles(f, { ti: t }), take: () => App.dropTake({ ti: t }) };
        const nm = h("div.mx-n.dg", { tip: "TRACK " + (t + 1) + " · CLICK = SELECT · DOUBLE-CLICK = RENAME · DRAG ONTO ANOTHER TRACK = COPY THE DEVICE · DROP AUDIO = LOAD · RIGHT-CLICK = MENU" }, h("i", { text: pad2(t + 1) }), h("span"));
        const rename = () => UI.edit(nm, T().name, (s) => { T().name = s.toUpperCase().slice(0, 10); App.commit(); sync(); App.Dv.build(); App.Ed.sync(); }, 10);
        nm.onpointerdown = (ev) => {
          if (ev.button === 0) UI.drag(ev, { type: "track", data: t, label: "DEVICE " + pad2(t + 1) + " " + T().name, hint: "DROP ON ANOTHER TRACK = COPY THIS INSTRUMENT THERE · NOTES AND MIXER STAY", click: () => App.select(t) });
        };
        nm.ondblclick = rename;
        nm.oncontextmenu = () => trackMenu(nm, t, rename);
        UI.drop(nm, {...drops, track: (src) => App.copyDevice(src, t), material:data=>App.Library.drop(data,{ti:t})});
        const kd = h("div.mx-k", {tip:"INSTRUMENT TYPE · CHANGE IN DEVICE"});
        kd.onclick = () => App.select(t);
        const mB = h("button.mx-b.m", { text: "M", tip: "MUTE · ALT-CLICK = MUTE ALL THE OTHERS, AGAIN = NONE", type: "button" }), sB = h("button.mx-b.s", { text: "S", tip: "SOLO · ALT-CLICK = SOLO ONLY THIS ONE, AGAIN = NONE", type: "button" });
        // ALT makes the switch exclusive; a second ALT-click on the same row clears the whole column.
        const flip = (key, only) => (ev) => {
          const all = P().tracks;
          if (!ev.altKey) all[t][key] ^= 1;
          else {
            const alone = all.every((x, i) => !!x[key] === (only ? i === t : i !== t));
            all.forEach((x, i) => (x[key] = alone ? 0 : +(only ? i === t : i !== t)));
          }
          App.commit(); App.E && App.E.syncAll(); sync();
        };
        mB.onclick = flip("mute", false);
        sB.onclick = flip("solo", true);
        const vol = UI.param(DEF.trk.vol, T, push, { cls: "c", meter: true }), pan = UI.param(DEF.trk.pan, T, push, { cls: "c" });
        grid.append(nm, kd, mB, sB, vol, pan);
        const row = { nm, kd, mB, sB, vol, pan, cl: [] };
        for (let p = 0; p < 8; p++) {
          const c = h("div.cl", { tip: "CLIP " + pad2(t + 1) + "/" + PATS[p] + " · CLICK = EDIT · DRAG = COPY TO ANOTHER CELL · RIGHT-CLICK = MENU" });
          c.onpointerdown = (ev) => {
            if (ev.button !== 0) return;
            if (App.filled(t, p)) UI.drag(ev, { type: "clip", data: { t, p }, label: "CLIP " + pad2(t + 1) + "/" + PATS[p], hint: "DROP ON A CELL = COPY · ON A FILLED CELL = CHOOSE HOW TO COMBINE", click: () => App.select(t, p) });
            else App.select(t, p);
          };
          c.oncontextmenu = () => clipMenu(c, t, p);
          UI.drop(c, { clip: (src) => App.copyClip(src, { t, p }), ...drops, material:data=>App.Library.drop(data,{ti:t,p}) });
          row.cl.push(c); cells.push(c);
          grid.append(c);
        }
        rows.push(row);
      }
      cv = h("canvas.mx-cv"); ph = h("div.mx-ph");
      grid.append(cv, ph);
      cx = cv.getContext("2d");

      // What the transport follows is always readable here: SONG (lit = the chain, unlit = the selected pattern), or
      // LIVE / TAKE while launched clips or a recorded take have taken it over. One click gives it back.
      songB = btn("SONG", "", () => {
        const p = P();
        if (p.performance.source !== "arrangement") {
          App.Live.source("arrangement");
          UI.msg("TRANSPORT PLAYS " + (App.Seq.songOn() ? "THE SONG" : "PATTERN " + PATS[p.sel.p]) + " AGAIN · LIVE… LAUNCHES CLIPS");
          sync(); App.Top.sync(); return;
        }
        if (!p.chain.length) { App.Song.open(); return; }
        p.song ^= 1;
        App.commit();
        if (App.Seq.playing) App.Seq.play();
        sync(); App.Top.sync();
      }, "sgb.tog");
      const arrange = btn("ARRANGE…", "EDIT SONG ORDER, REPEAT SECTIONS OR MAKE AN INDEPENDENT VARIATION", () => App.Song.open());
      songEl = h("div.mx-s", null, songB, arrange, btn("CHORDS…","SONG CHORD TRACK", () => App.Harmony.open()), btn("AUDIO…","AUDIO TIMELINE, TAKES AND LOOPER", () => App.AudioStudio.open()));
      for (let i = 0; i < 32; i++) {
        const s = h("div.sl", { tip: "SONG SLOT · CLICK = START HERE · DRAG = MOVE · DROP A PATTERN TO INSERT" });
        s.onpointerdown = (ev) => {
          const ch = P().chain;
          if (ev.button !== 0) return;
          if (i >= ch.length) return;
          const rest = !!P().arrangement?.slots?.[i]?.rest; // empty bars: stored as pattern A, but they are no pattern
          UI.drag(ev, { type: "song", data: i, label: "SLOT " + (i + 1) + " · " + (rest ? "EMPTY BARS" : PATS[ch[i]]), hint: "DROP ON ANOTHER SLOT = MOVE IT THERE", click: () => { App.Seq.startAt(i); if (!rest) App.select(P().sel.t, ch[i]); sync(); } });
        };
        s.oncontextmenu = () => { if (i < P().chain.length) slotMenu(s, i); };
        UI.drop(s, { pat: (p) => App.Song.insert(i, p), song: (j) => App.Song.move(j, i) });
        slots.push(s);
        songEl.append(s);
      }
      lenEl = h("div.mx-len", { tip: "SONG LENGTH" });
      songEl.append(lenEl);
      contextEl = h("span.ti");
      const process = btn("BATCH EDIT…", "BATCH EDIT NOTES, AUTOMATION, MIX OR INSTRUMENT SETTINGS", () => App.Operations.open());
      const phrase = btn("PHRASE…", "SET LENGTH, REPEAT, STRETCH OR COMBINE CLIPS AND PATTERNS", () => App.Phrases.open("clip"));
      liveB = btn("LIVE…", "", () => App.Live.open(), "tog");
      el.append(h("div.hd.matrix-head", null, h("span.tg", {text:"CLIP MATRIX"}), contextEl, h("span.sp"), liveB, process, phrase), grid, songEl);
    }

    /* ── every object answers a right-click with the things that can be done to it ── */
    const pick = (el, items, run, label) => UI.menu(el, items, (v) => run[v] && run[v](), { label });
    const clipMenu = (el, t, p) => {
      const has = App.filled(t, p);
      App.select(t, p);
      pick(el, [
        { label: "Duplicate to next free cell", value: "dup", disabled: !has },
        { label: "Clear", value: "clear", disabled: !has },
        "-",
        { label: "Length, repeat, stretch…", value: "phrase" },
        { label: "Batch edit…", value: "batch" },
        { label: "Save to library…", value: "lib", disabled: !has },
      ], { dup: () => App.duplicateClip(t, p), clear: () => App.clearClip(t, p), phrase: () => App.Phrases.open("clip"), batch: () => App.Operations.open(), lib: () => App.Library.open() },
      "Clip " + pad2(t + 1) + "/" + PATS[p]);
    };
    const patMenu = (el, p) => {
      const has = P().tracks.some((_, t) => App.filled(t, p));
      App.select(P().sel.t, p);
      pick(el, [
        { label: "Add to song", value: "song", disabled: P().chain.length >= 32 },
        { label: "Duplicate to next free pattern", value: "dup", disabled: !has },
        { label: "Clear all tracks", value: "clear", disabled: !has },
        "-",
        { label: "Length, repeat, stretch…", value: "phrase" },
        { label: "Save to library…", value: "lib", disabled: !has },
      ], { song: () => App.Song.insert(P().chain.length, p), dup: () => App.duplicatePattern(p), clear: () => App.clearPattern(p), phrase: () => App.Phrases.open("pattern"), lib: () => App.Library.open() },
      "Pattern " + PATS[p]);
    };
    const trackMenu = (el, t, rename) => {
      const T = P().tracks[t];
      App.select(t);
      pick(el, [
        { label: "Rename", value: "rename" },
        "-",
        ...Object.entries(instruments).map(([k, name]) => ({ label: name, value: k, on: T.kind === k, key: "DEVICE" })),
        "-",
        { label: "Patch…", value: "patch" }, { label: "Modulation…", value: "mod" }, { label: "Routing…", value: "mix" }, { label: "Parametric EQ…", value: "eq" },
        "-",
        { label: "Reset device to default", value: "device" }, { label: "Reset level, pan and sends", value: "strip" },
        { label: "Clear all clips", value: "clear", disabled: !T.clips.some((_, k) => App.filled(t, k)) },
      ], { rename, syn: () => changeKind(t, "syn"), kit: () => changeKind(t, "kit"), smp: () => changeKind(t, "smp"), patch: () => App.Patches.open(), mod: () => App.Rack.modulate(),
        mix: () => App.Rack.mixer(t), eq: () => App.ParametricEQ.open(t), device: () => resetDevice(t), strip: () => resetStrip(t), clear: () => App.clearTrack(t) },
      "Track " + pad2(t + 1) + " " + T.name);
    };
    const slotMenu = (el, i) => {
      const pat = P().chain[i], rest = !!P().arrangement?.slots?.[i]?.rest;
      pick(el, [
        { label: "Start here", value: "start" }, { label: rest ? "Empty bars" : "Edit pattern " + PATS[pat], value: "edit", disabled: rest }, { label: "Remove from song", value: "remove" },
        "-", { label: "Arrange…", value: "arr" },
      ], { start: () => { App.Seq.startAt(i); sync(); }, edit: () => App.select(P().sel.t, pat), remove: () => App.Song.remove(i), arr: () => App.Song.open() },
      "Song slot " + pad2(i + 1));
    };

    function sync() {
      const p = P(), s = p.sel, any = p.tracks.some((x) => x.solo), cue = App.Seq.queued();
      barsDef.max = App.maxBars(p);
      contextEl.textContent = p.tracks[s.t].name + " / " + PATS[s.p];
      heads.forEach((e, k) => {
        e.classList.toggle("sel", k === s.p);
        e.classList.toggle("cue", cue === k);
        e.bars.paint();
      });
      rows.forEach((r, t) => {
        const T = p.tracks[t], on = t === s.t;
        r.nm.lastChild.textContent = T.name;
        r.kd.textContent = KIND[T.kind];

        r.nm.classList.toggle("sel", on); r.kd.classList.toggle("sel", on);
        r.nm.classList.toggle("off", !!T.mute || (any && !T.solo));
        r.mB.setAttribute("aria-label", "Mute " + T.name); r.mB.setAttribute("aria-pressed", String(!!T.mute));
        r.sB.setAttribute("aria-label", "Solo " + T.name); r.sB.setAttribute("aria-pressed", String(!!T.solo));
        r.mB.classList.toggle("on", !!T.mute); r.sB.classList.toggle("on", !!T.solo);
        r.vol.paint(); r.pan.paint();
        r.cl.forEach((c, k) => { c.classList.toggle("sel", on && k === s.p); c.classList.toggle("dg", T.clips[k].length > 0 || Object.keys(T.automation[k]).length > 0); });
      });
      // Lit only while the transport really follows the song; launched clips or a take have taken it over otherwise.
      const src = p.performance.source, arranged = src === "arrangement", other = src === "take" ? "A RECORDED TAKE" : "CLIPS LAUNCHED IN LIVE…";
      songB.textContent = arranged ? "SONG" : src === "take" ? "TAKE" : "LIVE";
      songB.classList.toggle("on", !arranged || (!!p.song && p.chain.length > 0));
      songB.classList.toggle("over", !arranged);
      songB.setAttribute("aria-label", arranged ? "Song mode" : "Transport source: " + src + ". Back to patterns");
      songB.dataset.tip = arranged ? (p.chain.length ? "SONG MODE · ON = PLAY THE CHAIN · OFF = LOOP THE SELECTED PATTERN" : "NO SONG YET · DROP PATTERN LETTERS ON THE SLOTS · THE SELECTED PATTERN LOOPS")
        : "THE TRANSPORT PLAYS " + other + ", NOT THE SELECTED PATTERN · CLICK = BACK TO PATTERN AND SONG";
      liveB.classList.toggle("on", !arranged); liveB.classList.toggle("over", !arranged); liveB.setAttribute("aria-pressed", String(!arranged));
      liveB.dataset.tip = arranged ? "LAUNCH CLIPS PER TRACK AND RECORD A PERFORMANCE · TAKES OVER THE TRANSPORT UNTIL YOU CLICK LIVE IN THE SONG ROW"
        : "THE TRANSPORT PLAYS " + other + " · OPEN THE LAUNCHER · LIVE IN THE SONG ROW = BACK TO PATTERNS";
      songEl.classList.toggle("off", !p.song || !arranged);
      const spans=App.Conductor.layout(p,p.chain);
      slots.forEach((e, i) => {
        const has = i < p.chain.length;
        e.textContent = has ? spans[i].rest?"—":PATS[p.chain[i]] : "";
        e.dataset.tip = has ? "SLOT " + pad2(i+1) + " · CLICK = START HERE · DRAG = MOVE · RIGHT-CLICK = MENU" : "DROP A PATTERN HERE TO ADD IT TO THE SONG";
        e.classList.toggle("e", !has);
        e.classList.toggle("dg", has);
        e.classList.toggle("at", has && !!p.song && i === App.Seq.start());
      });
      const end=spans.at(-1)?.end||0,m=App.Conductor.position(p,end);
      lenEl.textContent = p.chain.length ? (m.bar+Number(m.inside>0))+" BAR" : "";
      draw();
    }

    // Clip thumbnails: one canvas laid over the 8×8 cell block.
    function draw() {
      if (!cv || cells.length < 64) return;
      const a = cells[0], b = cells[63], left = a.offsetLeft, top = a.offsetTop;
      if (!a.offsetWidth) return;
      cv.style.left = left + "px"; cv.style.top = top + "px";
      cv.style.width = b.offsetLeft + b.offsetWidth - left + "px"; cv.style.height = b.offsetTop + b.offsetHeight - top + "px";
      const D = UI.fit(cv), C = App.C, p = P(), any = p.tracks.some((x) => x.solo), m = Math.round(2.5 * D);
      cx.clearRect(0, 0, cv.width, cv.height);
      for (let t = 0; t < 8; t++) {
        const T = p.tracks[t], rowsUp = T.kind === "kit" || (T.kind === "smp" && T.smp.mode === 1);
        cx.fillStyle = T.mute || (any && !T.solo) ? C.t3 : t === p.sel.t ? C.t1 : C.t2;
        for (let k = 0; k < 8; k++) {
          const clip = T.clips[k];
          const curves = Object.values(T.automation[k]);
          if (!clip.length && !curves.length) continue;
          const c = cells[t * 8 + k], n = App.Live.length(p,t,k);
          const x0 = (c.offsetLeft - left) * D + m, y0 = (c.offsetTop - top) * D + m, w = c.offsetWidth * D - 2 * m, hh = c.offsetHeight * D - 2 * m;
          if (curves.length) {
            const lane = curves[0], y = value => y0 + hh * (1-value);
            cx.save();
            cx.strokeStyle = C.am; cx.globalAlpha = 0.7; cx.beginPath();
            cx.moveTo(x0,y(App.curveValue(lane,0)));
            for (const point of lane.points) {
              if (point.s > n) break;
              const x = x0+w*point.s/n;
              cx.lineTo(x,y(App.curveValue(lane,point.s,point.v,"left"))); cx.lineTo(x,y(point.v));
            }
            cx.lineTo(x0+w,y(App.curveValue(lane,n)));
            cx.stroke(); cx.restore();
          }
          let lo = 127, hi = 0;
          for (const nt of clip) { if (nt.n < lo) lo = nt.n; if (nt.n > hi) hi = nt.n; }
          if (rowsUp) { lo = Math.min(lo, 36); hi = Math.max(hi, 43); }
          const span = Math.max(11, hi - lo), nh = clamp(hh / (span + 1), 1.5 * D, 4 * D);
          for (const nt of clip) {
            if (nt.s >= n) continue;
            const f = (nt.n - lo) / span;
            cx.globalAlpha = 0.35 + 0.65 * nt.v;
            cx.fillRect(Math.round(x0 + (w * nt.s) / n), Math.round(y0 + (hh - nh) * (rowsUp ? f : 1 - f)), Math.max(1, Math.round((w * Math.min(nt.l, n - nt.s)) / n - D)), Math.round(nh));
          }
        }
      }
      cx.globalAlpha = 1;
    }

    function frame(c) {
      const E = App.E;
      if (E) for (let t = 0; t < 8; t++) {
        E.tracks[t].an.getFloatTimeDomainData(mbuf);
        let m = 0;
        for (let i = 0; i < 512; i++) { const a = mbuf[i] < 0 ? -mbuf[i] : mbuf[i]; if (a > m) m = a; }
        lv[t] = Math.max(m, lv[t] * 0.86);
        const w = dbN(lv[t], 54);
        if (w !== shown[t]) { shown[t] = w; rows[t].vol.meter.style.transform = "scaleX(" + w.toFixed(3) + ")"; }
      }
      const independent = c && (P().performance.source !== "arrangement" || c.lanes?.some(l => l && l.n !== App.patSteps(P(),c.pat)));
      for (let ti=0;ti<8;ti++) {
        const row=rows[ti], lane=independent && c.lanes?.[ti];
        if (row.playCell && (!lane || row.playCell!==row.cl[lane.p])) {row.playCell.classList.remove("running-clip");row.playCell=null;}
        if (lane && lane.p>=0) {
          row.playCell=row.cl[lane.p];row.playCell.classList.add("running-clip");
          row.playCell.style.setProperty("--clip-phase",100*(lane.s+clamp((E.ctx.currentTime-c.t)/c.span,0,1))/lane.n+"%");
        }
      }
      const pat = c && !independent ? c.pat : -1, slot = c && App.Seq.songOn() ? c.si : -1;
      if (pat !== runPat) { heads[runPat] && heads[runPat].classList.remove("run"); heads[pat] && heads[pat].classList.add("run"); runPat = pat; sync(); }
      if (slot !== runSlot) { slots[runSlot] && slots[runSlot].classList.remove("now"); slots[slot] && slots[slot].classList.add("now"); runSlot = slot; }
      if (!c || independent) { if (phOn) { ph.style.display = "none"; phOn = false; } return; }
      const cell = cells[c.pat], f = (c.step + clamp((E.ctx.currentTime - c.t) / c.sd, 0, 1)) / App.patSteps(P(), c.pat);
      const bottom = cells[56].offsetTop + cells[56].offsetHeight;
      if (!phOn) { ph.style.display = "block"; phOn = true; }
      ph.style.height = bottom - cells[0].offsetTop + "px";
      ph.style.transform = `translate(${cell.offsetLeft + cell.offsetWidth * Math.min(f, 0.999)}px,${cells[0].offsetTop}px)`;
    }

    return { build, sync, draw, frame, barsDef };
  })();

  /* ═════ DEVICE: the selected track's instrument ═════ */
  App.Dv = (() => {
    let waves = [], padEls = [];
    // Pads whose note is sounding (sequence or keys) get a lamp.
    const hit = (notes) => padEls.forEach((e, i) => e.classList.toggle("hit", notes.has(36 + i)));

    // Envelope shape. Time axis is compressed so both a 2 ms click and an 8 s swell stay readable.
    const envView = (get) => {
      const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), pl = document.createElementNS(NS, "polyline");
      svg.setAttribute("viewBox", "0 0 100 30");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.append(pl);
      const wrap = h("div.ev", { style: "grid-column:span 2", tip: "ENVELOPE SHAPE" }, svg);
      wrap.paint = () => {
        const [a, d, s, r] = get(), k = (t) => Math.log10(1 + t * 60), xa = k(a), xd = k(d), xr = k(r), tot = xa + xd + xr + 0.7, X = (v) => (v / tot) * 100, ys = 3 + 24 * (1 - s);
        pl.setAttribute("points", [[0, 27], [X(xa), 3], [X(xa + xd), ys], [X(xa + xd + 0.7), ys], [100, 27]].map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" "));
      };
      wrap.paint();
      return wrap;
    };

    const waveView = (cols, getId, obj, o) => {
      const cv = h("canvas"), wrap = h("div.wv", { style: `grid-column:span ${cols};grid-row:span 2`, tip: "SAMPLE · DRAG A MARKER = START / END · CLICK = PLAY · DROP AUDIO FILE = LOAD · HEIGHT IS SCALED TO THE SAMPLE'S PEAK" }, cv);
      const cx = cv.getContext("2d");
      const paint = (wrap.paint = () => {
        if (!wrap.isConnected) return;
        const D = UI.fit(cv), W = cv.width, H = cv.height, C = App.C, S = App.samples.get(getId()), L = Math.max(1, Math.round(D));
        cx.fillStyle = C.r0; cx.fillRect(0, 0, W, H);
        if (!S) {
          cx.font = `500 ${Math.round(App.rem * D)}px ${App.FONT}`; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = C.t3;
          cx.fillText(getId() ? "AUDIO MISSING · DROP FILE" : "DROP AUDIO FILE", W / 2, H / 2);
          return;
        }
        const pk = S.peaks, n = pk.length / 2, lo = Math.min(obj.st, obj.en), hi = Math.max(obj.st, obj.en), gain = 0.47 / Math.max(S.peak, 0.001);
        for (let x = 0; x < W; x++) {
          const i0 = Math.floor((x / W) * n), i1 = Math.min(n, Math.max(i0 + 1, Math.floor(((x + 1) / W) * n)));
          let a = 1, b = -1;
          for (let i = i0; i < i1; i++) { if (pk[i * 2] < a) a = pk[i * 2]; if (pk[i * 2 + 1] > b) b = pk[i * 2 + 1]; }
          const y0 = Math.floor((0.5 - b * gain) * H), y1 = Math.ceil((0.5 - a * gain) * H), f = x / W;
          cx.fillStyle = f >= lo && f <= hi ? C.t2 : C.ln2;
          cx.fillRect(x, y0, 1, Math.max(L, y1 - y0));
        }
        const k = o.slices ? o.slices() : 0;
        cx.fillStyle = C.t3;
        if (k) for (const f of App.AudioDSP.sliceEdges(obj).slice(1,-1)) cx.fillRect(Math.round(f * W), 0, L, H);
        if (o.grain && obj.mode===2) {
          const pos=lo+obj.gpos*(hi-lo);
          cx.fillStyle=C.t1;cx.fillRect(Math.round(pos*W),0,2*L,H);
        }
        cx.fillStyle = C.am;
        for (const f of [obj.st, obj.en]) cx.fillRect(Math.min(W - L, Math.round(f * W)), 0, L, H);
      });
      wrap.onpointerdown = (e) => {
        if (e.button !== 0 || !App.samples.get(getId())) return;
        const r = wrap.getBoundingClientRect(), fx = (ev) => clamp((ev.clientX - r.left) / r.width, 0, 1), f0 = fx(e);
        const ds = Math.abs(f0 - obj.st) * r.width, de = Math.abs(f0 - obj.en) * r.width;
        if (Math.min(ds,de)>9 && o.grain && obj.mode===2) {
          const move=ev=>{const a=Math.min(obj.st,obj.en),b=Math.max(obj.st,obj.en);
            obj.gpos=clamp((fx(ev)-a)/Math.max(.00001,b-a),0,1);paint();o.grain();};
          const end=()=>{wrap.removeEventListener("pointermove",move);wrap.removeEventListener("pointerup",end);wrap.removeEventListener("pointercancel",end);App.commit();};
          wrap.setPointerCapture(e.pointerId);move(e);o.audition();wrap.addEventListener("pointermove",move);wrap.addEventListener("pointerup",end);wrap.addEventListener("pointercancel",end);return;
        }
        if (Math.min(ds, de) > 9) { o.audition(); return; }
        const key = ds <= de ? "st" : "en";
        let ch = false;
        wrap.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          const v = +fx(ev).toFixed(4);
          if (v === obj[key]) return; // markers may cross: the engine plays the span between them either way
          obj[key] = v; ch = true;
          paint(); o.change();
        };
        const up = () => { wrap.removeEventListener("pointermove", mv); wrap.removeEventListener("pointerup", up); wrap.removeEventListener("pointercancel", up); if (ch) App.commit(); };
        wrap.addEventListener("pointermove", mv); wrap.addEventListener("pointerup", up); wrap.addEventListener("pointercancel", up);
      };
      UI.drop(wrap, { file: (f) => App.dropFiles(f, o.tg), take: () => App.dropTake(o.tg) });
      waves.push(wrap);
      return wrap;
    };

    const smpTools = (tg, id) => {
      const S = App.samples.get(id), r = App.recTo, on = !!r && r.ti === tg.ti && r.pad === tg.pad;
      return [
        h("span.sn", { text: S ? S.name + " · " + S.buffer.duration.toFixed(2) + " S · PEAK " + App.fDb(S.peak) + " DB" : "" }), h("span.sp"),
        btn("LOAD", "LOAD AN AUDIO FILE", () => App.pickFile("audio/*", (f) => App.dropFiles(f, tg))),
        on
          ? btn("STOP", "STOP RECORDING", () => App.recStop(), "rec.on")
          : btn("REC", "RECORD INTO THIS SAMPLER · INPUT = MIC / LINE · OUTPUT = RESAMPLE THE MIX", (e) =>
              UI.menu(e.currentTarget, [{ label: "INPUT", value: "in", key: "MIC / LINE" }, { label: "OUTPUT", value: "out", key: "RESAMPLE" }], (src) => App.recStart(tg, src)), "rec"),
      ];
    };

    function build() {
      const el = $("dv"), p = P(), ti = p.sel.t, T = p.tracks[ti];
      el.innerHTML = "";
      waves = []; padEls = [];
      const push = () => { App.E && App.E.syncTrack(ti); App.touch(); };
      const kinds = Object.entries(instruments).map(([k,name]) =>
        btn(name.toUpperCase(), "INSTRUMENT TYPE · NOTES STAY · EACH TYPE KEEPS ITS OWN SETTINGS",
          () => changeKind(ti, k), T.kind === k ? "on" : ""));
      const patch = btn("PATCH…", "LOAD AN INSTRUMENT SOUND OR COPY THE SOUND OF ANOTHER TRACK", () => App.Patches.open());
      el.append(h("div.hd", null, h("span.tg", {text:"DEVICE"}), h("span.ti", {text:pad2(ti+1) + " " + T.name}), h("span.grp", null, kinds), h("span.sp"), btn("MODULATION…", "ROUTE LFOS, MACROS, VELOCITY AND ENVELOPES TO THIS DEVICE AND ITS MIXER STRIP", () => App.Rack.modulate()), patch));

      const body = h("div.dv-b");
      const tp = (k) => UI.param(DEF.trk[k], T, push);
      const outMod = () => mod("FX", 1, [tp("drive"), tp("dly"), tp("rev")]);
      const filler = (n) => (n > 0 ? h("div.md.fl", { style: `grid-column:span ${n}` }) : null);
      // FILTER / ENV / LFO blocks are identical for synth and sampler
      const shared = (d, dc) => {
        const fe = envView(() => [d.fa, d.fd, d.fs, d.fr]), ae = envView(() => [d.aa, d.ad, d.as, d.ar]);
        const q = (k, cb, o) => UI.param(dc[k], d, () => { push(); cb && cb(); }, o);
        return [
          mod("FILTER", 2, [q("ftype"), q("cut"), q("res"), q("fenv"), q("ftrk")]),
          mod("FILTER ENV", 2, [q("fa", fe.paint), q("fd", fe.paint), q("fs", fe.paint), q("fr", fe.paint), fe]),
          mod("AMP ENV", 2, [q("aa", ae.paint), q("ad", ae.paint), q("as", ae.paint), q("ar", ae.paint), ae]),
          mod("LFO", 2, [q("lw"), d.lsync ? q("ldiv") : q("lrate"), q("lsync", null, { done: build }), q("ldest"), q("ldep")]),
        ];
      };

      if (T.kind === "syn") {
        const d = T.syn, q = (k,o) => UI.param(DEF.syn[k], d, push,o), a = (k) => UI.param(DEF.arp[k], T.arp, () => App.touch());
        body.append(
          ...(d.design === 0 ? [
            mod("OSC 1", 1, [q("w1"), q("oct1"), q("lv1")]),
            mod("OSC 2", 2, [q("w2"), q("lv2"), q("semi2"), q("fine2")]),
            mod("MIX", 1, [q("sub"), q("noise"), q("fm")])
          ] : [mod(d.design === 1 ? "PATCH GRAPH" : "WAVETABLE", 4,
            [h("div.inst-overview",{style:"grid-column:span 4;grid-row:span 2",text:d.design === 1 ? d.graph.nodes.length+" MODULES / "+d.graph.cables.length+" CABLES" : d.frames.length+" FRAMES / "+App.InstrumentLab.PARTIALS+" PARTIALS"}),
              ...(d.design===2?[q("scan")]:[])],
            [btn(d.design===1?"WIRE…":"EDIT…",d.design===1?"WIRE AND EDIT THE SYNTH MODULES":"BUILD FRAMES FROM HARMONICS OR AUDIO",()=>App.InstrumentLab.open(d.design===1?"graph":"table",ti))])]),
          ...shared(d, DEF.syn),
          mod("VOICE", 1, [q("mode"), q("glide")]),
          mod("ARP", 2, [a("mode"), a("rate"), a("oct"), a("gate")]),
          mod("SOURCE", 1, [q("design",{done:build})]), outMod(),
        );
      } else if (T.kind === "smp") {
        const d = T.smp, tg = { ti };
        let st, en, position;
        const wv = waveView(4, () => d.id, d, {
          tg, grain:()=>{position?.paint();push();}, slices: () => (d.mode === 1 ? d.slices : 0), change: () => { st.paint(); en.paint(); },
          audition: () => { const E = App.audio(); E && E.play(ti, d.mode === 1 ? 36 : d.root, 0.9, 0, 4); },
        });
        const q = (k, o) => UI.param(DEF.smp[k], d, (key) => { push(); if (key === "st" || key === "en" || key === "slices") wv.paint(); if (key === "slices") { d.markers = []; App.Ed.sync(); } }, o);
        st = q("st"); en = q("en");
        const mode=q("mode",{done:()=>{build();App.Ed.sync();App.Mx.draw();}});
        const zoning=d.mode===3, grain=d.mode===2;
        if(grain){
          position=UI.param(DEF.smp.gpos,d,()=>{push();wv.paint();});
          wv.dataset.tip="GRAIN POSITION · DRAG THROUGH THE WAVEFORM · DRAG END MARKERS TO TRIM";
        }
        const summary=zoning?h("div.zone-summary",{style:"grid-column:span 4;grid-row:span 2","data-tip":"EACH KEY AND VELOCITY PLAYS THE SAMPLE MAPPED TO IT · UNMAPPED KEYS ARE SILENT · ZONES… EDITS THE MAP",
          text:d.zones.length+" ZONES · "+new Set(d.zones.map(z=>z.sample)).size+" SAMPLES"}):null;
        body.append(
          zoning ? mod("KEYMAP",4,[summary,st,en,q("tune"),q("rev")],[btn("ZONES…","ASSIGN KEYS, VELOCITIES AND ROUND ROBIN SAMPLES",()=>App.SamplerLab.zones(ti))])
            : mod("SAMPLE",4,[wv,st,en,q("root"),q("tune")],smpTools(tg,d.id)),
          mod(grain?"GRAINS":"PLAY",2,grain?[mode,position,q("gsize"),q("gdens"),q("gspray"),q("rev")]:
            zoning?[mode,q("shot"),q("loop")]:[mode,q("slices"),q("shot"),q("loop"),q("rev")],
            zoning?[]:[btn("EDIT…","TRANSIENT SLICES · WARP TEMPO · EDIT ANCHORS",()=>App.AudioStudio.editSample(ti))]),
          ...shared(d, DEF.smp),
          filler(2), outMod(),
        );
      } else {
        const k = p.sel.pad, pd = T.kit.pads[k], tg = { ti, pad: k };
        const pads = T.kit.pads.map((x, i) => {
          const e = h("div.pd.dg" + (i === k ? ".on" : ""), { tip: "PAD " + (i + 1) + " · CLICK = SELECT + PLAY · DRAG ONTO ANOTHER PAD = COPY THE SOUND, ALT = SWAP · DROP AUDIO = LOAD · RIGHT-CLICK = MENU" }, h("i", { text: i + 1 }), h("span", { text: x.name }), x.src ? h("u", { text: "SMP" }) : null);
          e.onpointerdown = (ev) => {
            if (ev.button !== 0) return;
            const E = App.audio();
            E && E.play(ti, 36 + i, 0.9);
            UI.drag(ev, { type: "pad", data: i, label: "PAD " + (i + 1) + " " + x.name, hint: "DROP ON ANOTHER PAD = COPY THIS SOUND THERE · HOLD ALT = SWAP THE TWO" });
            if (p.sel.pad !== i) { p.sel.pad = i; App.touch(); build(); App.Ed.draw(); }
          };
          e.oncontextmenu = () => UI.menu(e, [{ label: "Rename", value: "rename" }, { label: "Load audio…", value: "load" }, { label: "Back to init sound", value: "reset" }], (v) => {
            if (v === "rename") UI.edit(e, x.name, (s) => { x.name = s.toUpperCase().slice(0, 8); App.commit(); build(); App.Ed.sync(); }, 8);
            else if (v === "load") App.pickFile("audio/*", (f) => App.dropFiles(f, { ti, pad: i }));
            else App.resetPad(ti, i);
          }, { label: "Pad " + (i + 1) + " " + x.name });
          UI.drop(e, { file: (f) => App.dropFiles(f, { ti, pad: i }), take: () => App.dropTake({ ti, pad: i }), pad: (src, ev) => App.copyPad(ti, src, i, ev.altKey) });
          return e;
        });
        padEls = pads;
        const pp = (key, cb, o) => UI.param(DEF.pad[key], pd, () => { App.touch(); cb && cb(); }, o);
        const levels = T.kit.pads.map(pad => UI.param(DEF.pad.lvl, pad, () => App.touch(), {label:pad.name}));
        body.append(mod("PADS", 4, pads, null, "pads"));
        if (pd.src) {
          let st, en;
          const wv = waveView(5, () => pd.id, pd, { tg, change: () => { st.paint(); en.paint(); }, audition: () => { const E = App.audio(); E && E.play(ti, 36 + k, 0.9); } });
          st = pp("st", wv.paint); en = pp("en", wv.paint);
          body.append(mod("SAMPLE", 5, [wv, st, en, pp("pit"), pp("dec"), pp("rev")], smpTools(tg, pd.id)));
        } else {
          body.append(
            mod("TONE", 3, [pp("wave"), pp("tune"), pp("tone"), pp("sweep"), pp("swt"), pp("dec")]),
            mod("NOISE", 2, [pp("nz"), pp("col"), pp("ndec"), pp("burst")]),
          );
        }
        body.append(mod("PAD " + (k + 1) + " · " + pd.name, 2, [pp("src", null, { done: () => { build(); App.Ed.draw(); } }), pp("chk"), pp("pan"), pp("drive")]), mod("KIT LEVELS", 4, levels, null, "pads"), filler(1), outMod());
      }
      el.append(body);
      requestAnimationFrame(paint);
    }

    function paint() { waves.forEach((w) => w.paint()); }
    return { build, paint, hit };
  })();

  /* ═════ MASTER: send effects + output chain ═════ */
  App.Fx = (() => {
    let pms = [], grV, grB;
    function build() {
      const el = $("fx"), F = () => P().fx, push = () => { App.E && App.E.syncFx(); App.touch(); };
      el.innerHTML = "";
      pms = [];
      const q = (k) => { const e = UI.param(DEF.fx[k], F, push); pms.push(e); return e; };
      grV = h("span.v", { text: "0.0" }); grB = h("i");
      const gr = h("div.pm.ro", { tip: "GAIN REDUCTION · HOW MUCH COMPRESSOR + LIMITER PULL THE MIX DOWN (dB)" }, h("span.l", { text: "REDUCE" }), grV, h("span.b", null, grB));
      el.append(
        h("div.hd", null, h("span.tg", { text: "MASTER" }), h("span.sp"),
          btn("ROUTING…", "INSERT CHAINS, BUSES, PARALLEL AND BAND SPLITS, SIDECHAIN · PER TRACK AND BUS", () => App.Rack.mixer()),
          btn("EQ…", "PARAMETRIC EQ OF THE SELECTED TRACK · FOUR BANDS OVER ITS LIVE SPECTRUM", () => App.ParametricEQ.open(P().sel.t)),
          btn("SCENES…", "SNAPSHOTS OF MIX AND DEVICE SETTINGS · RECALL, MORPH AND SONG CUES", () => App.Scenes.open())),
        h("div.dv-b.f5", null,
          mod("DELAY", 2, [q("dtime"), q("dfb"), q("dtone"), q("dwid")]),
          mod("REVERB", 1, [...(P().impulse?.sample ? [h("div.inst-overview",{style:"grid-row:span 2",text:App.samples.get(P().impulse.sample)?.name || "CUSTOM IR",tip:"THE REVERB IS A RECORDED IMPULSE RESPONSE · IR… CHANGES OR REMOVES IT"})] : [q("rsize"), q("rdamp")]),
            btn("IR…","IMPULSE RESPONSE · USE A RECORDED SPACE INSTEAD OF THE GENERATED REVERB",()=>App.SignalWorkshop.openImpulse())]),
          mod("EQ", 1, [q("high"), q("mid"), q("low")]),
          mod("OUTPUT", 1, [q("comp"), gr, q("vol")])),
      );
    }
    function sync() { pms.forEach((p) => p.paint()); }
    function frame() {
      if (!App.E) return;
      const r = Math.min(0, App.E.reduction()), t = r > -0.05 ? "0.0" : r.toFixed(1);
      if (grV.textContent !== t) { grV.textContent = t; grB.style.width = clamp(-r / 20, 0, 1) * 100 + "%"; }
    }
    return { build, sync, frame };
  })();
})();
