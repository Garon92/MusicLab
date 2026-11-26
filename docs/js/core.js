/* MUSICLAB · core — constants, parameter schema, project model, storage */
(() => {
  "use strict";
  const App = (window.App = {});

  /* ── math / music ─────────────────────────────────────────────── */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const pc = (m) => ((m % 12) + 12) % 12;
  const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  // Semitones from each scale's root up to its parent major key (by SCALES index); that key decides sharps or flats,
  // so C minor reads Eb Ab Bb and E major reads F# G# C# D#.
  const PARENT = [null, 0, 3, 10, 8, 7, 5, 1, 3, 3, 0, 3, 3, null];
  const names = () => {
    const P = App.P, o = P ? PARENT[P.scale] : null;
    return o != null && [5, 10, 3, 8, 1, 6].includes(pc(P.key + o)) ? FLATS : NOTES;
  };
  const noteName = (m) => names()[pc(m)] + (Math.floor(m / 12) - 1);
  const mtof = (m, P = App.P) => App.InstrumentLab ? App.InstrumentLab.frequency(m, P) : 440 * 2 ** ((m - 69) / 12);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad2 = (n) => String(n).padStart(2, "0");

  const SCALES = [
    ["CHROMATIC", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    ["MAJOR", [0, 2, 4, 5, 7, 9, 11]],
    ["MINOR", [0, 2, 3, 5, 7, 8, 10]],
    ["DORIAN", [0, 2, 3, 5, 7, 9, 10]],
    ["PHRYGIAN", [0, 1, 3, 5, 7, 8, 10]],
    ["LYDIAN", [0, 2, 4, 6, 7, 9, 11]],
    ["MIXOLYDIAN", [0, 2, 4, 5, 7, 9, 10]],
    ["LOCRIAN", [0, 1, 3, 5, 6, 8, 10]],
    ["HARMONIC MIN", [0, 2, 3, 5, 7, 8, 11]],
    ["MELODIC MIN", [0, 2, 3, 5, 7, 9, 11]],
    ["PENTA MAJOR", [0, 2, 4, 7, 9]],
    ["PENTA MINOR", [0, 3, 5, 7, 10]],
    ["BLUES", [0, 3, 5, 6, 7, 10]],
    ["WHOLE TONE", [0, 2, 4, 6, 8, 10]],
  ];
  const SIGS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 8], [6, 8], [7, 8], [9, 8], [12, 8]];
  const PATS = "ABCDEFGH";
  const MAX_STEPS = 256, MAX_BARS = 16;

  // One step is always a 16th note. Signature only decides how steps group into beats and bars.
  const spb = (P) => SIGS[P.sig][0] * (SIGS[P.sig][1] === 8 ? 2 : 4);
  const beatSteps = (P) => (SIGS[P.sig][1] === 4 ? 4 : SIGS[P.sig][0] % 3 === 0 ? 6 : 2);
  const maxBars = (P) => Math.min(MAX_BARS, Math.floor(MAX_STEPS / spb(P)));
  const patSteps = (P, pi) => Math.min(P.pats[pi].bars, maxBars(P)) * spb(P);
  // The patterns a song really plays. A slot of empty bars is stored as pattern A with a rest flag and belongs to none.
  const songPatterns = (P) => [...new Set(P.chain.filter((_, i) => !P.arrangement?.slots?.[i]?.rest))];
  const inScale = (P, m) => SCALES[P.scale][1].includes(pc(m - P.key));

  // Stack diatonic thirds on a note; out-of-scale roots and the chromatic scale fall back to a dominant shape.
  const chordNotes = (P, n, count) => {
    if (count <= 1) return [n];
    const sc = SCALES[P.scale][1], d = sc.indexOf(pc(n - P.key));
    if (sc.length === 12 || d < 0) return [0, 4, 7, 10].slice(0, count).map((x) => n + x);
    const base = n - pc(n - P.key);
    return Array.from({ length: count }, (_, k) => base + sc[(d + 2 * k) % sc.length] + 12 * Math.floor((d + 2 * k) / sc.length));
  };

  const CHORDS = [
    ["", [0, 4, 7]], ["m", [0, 3, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]], ["sus2", [0, 2, 7]], ["sus4", [0, 5, 7]],
    ["maj7", [0, 4, 7, 11]], ["7", [0, 4, 7, 10]], ["m7", [0, 3, 7, 10]], ["mMaj7", [0, 3, 7, 11]], ["dim7", [0, 3, 6, 9]],
    ["m7b5", [0, 3, 6, 10]], ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]], ["5", [0, 7]],
  ];
  const chordName = (notes) => {
    const set = [...new Set(notes.map(pc))].sort((a, b) => a - b);
    if (set.length < 2) return "";
    const bass = pc(Math.min(...notes));
    for (const root of [bass, ...set.filter((x) => x !== bass)]) {
      const iv = set.map((x) => pc(x - root)).sort((a, b) => a - b).join();
      const hit = CHORDS.find((c) => c[1].join() === iv);
      if (hit) return names()[root] + hit[0] + (root !== bass ? "/" + names()[bass] : "");
    }
    return "";
  };

  /* ── value formatting ─────────────────────────────────────────── */
  const fHz = (v) => (v >= 10000 ? (v / 1000).toFixed(1) + "k" : v >= 1000 ? (v / 1000).toFixed(2) + "k" : v >= 100 ? v.toFixed(0) : v.toFixed(1));
  const fTime = (v) => (v >= 1 ? v.toFixed(2) + "s" : v >= 0.01 ? Math.round(v * 1000) + "ms" : (v * 1000).toFixed(1) + "ms");
  const fDb = (g) => (g <= 0.00001 ? "-INF" : (20 * Math.log10(g)).toFixed(1));
  const sign = (v, s) => (v > 0 ? "+" : "") + s;

  const fmt = (d, v) => {
    if (d.f) return d.f(v);
    if (d.opts) return d.opts[v];
    if (d.bool) return v ? "ON" : "OFF";
    switch (d.u) {
      case "hz": return fHz(v);
      case "t": return fTime(v);
      case "pc": return Math.round(v * 100) + "%";
      case "pc1": return (v * 100).toFixed(1) + "%";
      case "st": return sign(v, String(v));
      case "ct": return sign(v, Math.round(v) + "c");
      case "db": return sign(v, v.toFixed(1));
      case "oct": return sign(v, v.toFixed(2));
      case "gain": return fDb(v * v);
      case "pan": return Math.abs(v) < 0.005 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100);
      case "note": return noteName(v);
      case "bpm": return v.toFixed(1);
      default: return d.int ? String(v) : v.toFixed(d.dp ?? 2);
    }
  };
  const UNIT = { hz: " Hz", gain: " dB", db: " dB", oct: " OCT", st: " ST", bpm: " BPM" };

  // `shown` is the value on display: a bare number is read in its unit (3 typed over "2.20S" is three seconds).
  const parse = (d, s, shown) => {
    s = String(s).trim().toUpperCase().replace(",", ".");
    const x = parseFloat(s);
    switch (d.u) {
      case "hz": return /K/.test(s) ? x * 1000 : x;
      case "t": return /MS/.test(s) ? x / 1000 : /S/.test(s) || shown >= 1 ? x : x / 1000;
      case "pc": case "pc1": return x / 100;
      case "gain": return /INF/.test(s) ? 0 : Math.sqrt(10 ** (x / 20));
      case "pan": return s[0] === "C" ? 0 : s[0] === "L" ? -parseFloat(s.slice(1)) / 100 : s[0] === "R" ? parseFloat(s.slice(1)) / 100 : x / 100;
      case "note": { // C#3, Eb3 or a MIDI number
        const m = /^([A-G])(#|B)?(-?\d)$/.exec(s);
        return m ? "C D EF G A B".indexOf(m[1]) + (m[2] === "#" ? 1 : m[2] ? -1 : 0) + 12 * (+m[3] + 1) : x;
      }
      default: return x;
    }
  };

  const toN = (d, v) =>
    d.c === "exp" ? Math.log(v / d.min) / Math.log(d.max / d.min) : d.c === "sq" ? Math.sqrt((v - d.min) / (d.max - d.min)) : (v - d.min) / (d.max - d.min);
  const fromN = (d, x, fine) => {
    x = clamp(x, 0, 1);
    let v = d.c === "exp" ? d.min * (d.max / d.min) ** x : d.c === "sq" ? d.min + (d.max - d.min) * x * x : d.min + (d.max - d.min) * x;
    if (d.int || d.opts || d.bool) return Math.round(v);
    if (d.step) { const q = fine && d.fine ? d.fine : d.step; return clamp(Math.round(v / q) * q, d.min, d.max); }
    return +v.toPrecision(4);
  };

  // The grid a value is shown on. A value is kept on it, so what a control shows is what is set, and the wheel can
  // reach every value the display can show (a step of 1.2% used to land on 14 and 16 and never on 15).
  const res = (d, v) => {
    switch (d.u) {
      case "pc": case "pan": case "oct": return 0.01;
      case "pc1": return 0.001;
      case "ct": return 1;
      case "db": case "bpm": return 0.1;
      case "hz": return v >= 10000 ? 100 : v >= 1000 ? 10 : v >= 100 ? 1 : 0.1;
      case "t": return v >= 1 ? 0.01 : v >= 0.01 ? 0.001 : 0.0001;
      default: return d.int ? 1 : 10 ** -(d.dp ?? 2);
    }
  };
  const snap = (d, v) => {
    if (d.opts || d.bool || d.int || d.step || d.f || !Number.isFinite(v)) return v; // these keep their own steps
    let out;
    if (d.u === "gain") out = v <= 0.00001 ? v : Math.sqrt(10 ** (Math.round(20 * Math.log10(v * v) * 10) / 200)); // level sits on tenths of a dB
    else { const q = res(d, Math.abs(v)); out = +(Math.round(v / q) * q).toPrecision(12); }
    out = clamp(out, d.min, d.max);
    return fmt(d, out) === fmt(d, d.def) ? d.def : out; // what reads as the default is the default
  };
  // One notch of the wheel or one press of an arrow. A linear value moves by whole units of its display (a hundred
  // notches across its range, one unit with SHIFT); a level moves by half a dB, a tenth with SHIFT.
  const nudge = (d, v, dir, fine) => {
    if (d.u === "gain") {
      const db = v > 0.00001 ? Math.round(200 * Math.log10(v * v)) / 10 : -60.5 - (dir < 0 ? 100 : 0);
      // Coarse lands on the next half dB (-3.9 goes to -4.0, then -4.5), fine moves a tenth.
      const to = fine ? Math.round((db + dir * 0.1) * 10) / 10 : dir > 0 ? Math.floor(db * 2 + 1 + 1e-6) / 2 : Math.ceil(db * 2 - 1 - 1e-6) / 2;
      return snap(d, to < -60 ? d.min : Math.sqrt(10 ** (to / 20)));
    }
    if (!d.c) { const q = res(d, Math.abs(v)), k = fine ? 1 : Math.max(1, Math.round((d.max - d.min) / q / 100)); return snap(d, clamp(v + dir * k * q, d.min, d.max)); }
    const to = snap(d, fromN(d, toN(d, v) + dir * (fine ? 0.002 : 0.012), fine));
    return to !== v ? to : snap(d, clamp(v + dir * res(d, Math.abs(v)), d.min, d.max));
  };

  /* ── parameter schema ─────────────────────────────────────────── */
  const N = (k, l, name, min, max, def, o) => ({ k, l, name, min, max, def, ...o });
  const EN = (k, l, name, opts, def = 0) => ({ k, l, name, opts, min: 0, max: opts.length - 1, def });
  const BO = (k, l, name, def = 0) => ({ k, l, name, bool: 1, min: 0, max: 1, def });
  const dict = (a) => Object.fromEntries(a.map((d) => [d.k, d]));
  const WAVES = ["SINE", "TRI", "SAW", "SQUARE"];

  const env = (x, nm, a, d, s, r) => [
    N(x + "a", "ATTACK", nm + " ATTACK", 0.001, 8, a, { c: "exp", u: "t" }),
    N(x + "d", "DECAY", nm + " DECAY", 0.005, 8, d, { c: "exp", u: "t" }),
    N(x + "s", "SUSTAIN", nm + " SUSTAIN", 0, 1, s, { u: "pc" }),
    N(x + "r", "RELEASE", nm + " RELEASE", 0.005, 8, r, { c: "exp", u: "t" }),
  ];
  const filt = (cut) => [
    EN("ftype", "TYPE", "FILTER TYPE", ["LP 12", "LP 24", "HP 12", "BP 12"]),
    N("cut", "CUTOFF", "FILTER CUTOFF", 20, 20000, cut, { c: "exp", u: "hz" }),
    N("res", "RES", "FILTER RESONANCE", 0, 24, 1, { dp: 1 }),
    N("fenv", "ENV", "FILTER ENVELOPE DEPTH", -5, 5, 0, { u: "oct", bi: 1 }),
    N("ftrk", "KEY", "FILTER KEY TRACKING", 0, 1, 0, { u: "pc" }),
  ];
  const lfo = [
    EN("lw", "WAVE", "LFO WAVEFORM", WAVES),
    N("lrate", "RATE", "LFO RATE", 0.02, 40, 4, { c: "exp", u: "hz" }),
    EN("ldiv", "RATE", "LFO RATE (TEMPO SYNC)", ["8 BAR", "4 BAR", "2 BAR", "1 BAR", "1/2", "1/4", "1/8", "1/16"], 3),
    BO("lsync", "SYNC", "LFO TEMPO SYNC"),
    EN("ldest", "DEST", "LFO DESTINATION", ["OFF", "PITCH", "CUTOFF", "AMP", "PAN"]),
    N("ldep", "DEPTH", "LFO DEPTH", 0, 1, 0.3, { u: "pc" }),
  ];

  const DEF = {
    top: dict([
      N("bpm", "BPM", "TEMPO", 40, 300, 120, { u: "bpm", sens: 520, step: 1, fine: 0.1 }),
      N("swing", "SWING", "SWING · DELAYS EVERY 2ND 16TH · 66 = TRIPLET", 0, 100, 0, { int: 1, sens: 260 }),
      EN("sig", "SIG", "TIME SIGNATURE", SIGS.map((s) => s.join("/")), 2),
      { ...EN("key", "KEY", "KEY ROOT", ["C", "C# / Db", "D", "D# / Eb", "E", "F", "F# / Gb", "G", "G# / Ab", "A", "A# / Bb", "B"], 0), f: (v) => names()[v] },
      EN("scale", "SCALE", "SCALE · MARKS EDITOR ROWS · FEEDS CHORD + FOLD", SCALES.map((s) => s[0]), 2),
    ]),
    trk: dict([
      N("vol", "LEVEL", "TRACK LEVEL", 0, 1, 0.8, { u: "gain" }),
      N("pan", "PAN", "TRACK PAN", -1, 1, 0, { u: "pan", bi: 1 }),
      BO("mute", "M", "MUTE"),
      BO("solo", "S", "SOLO"),
      N("drive", "DRIVE", "TRACK SATURATION", 0, 1, 0, { u: "pc" }),
      N("dly", "DELAY", "DELAY SEND", 0, 1, 0, { u: "pc" }),
      N("rev", "REVERB", "REVERB SEND", 0, 1, 0, { u: "pc" }),
    ]),
    arp: dict([
      EN("mode", "MODE", "ARPEGGIATOR · PLAYS HELD SEQUENCE NOTES ONE BY ONE", ["OFF", "UP", "DOWN", "UP-DN", "RANDOM"]),
      EN("rate", "RATE", "ARPEGGIATOR RATE", ["1/8", "1/16", "1/32"], 1),
      N("oct", "RANGE", "ARPEGGIATOR OCTAVE RANGE", 1, 3, 1, { int: 1 }),
      N("gate", "GATE", "ARPEGGIATOR NOTE LENGTH", 0.05, 1, 0.5, { u: "pc" }),
    ]),
    syn: dict([
      EN("design", "ENGINE", "SYNTH ENGINE", ["CLASSIC", "MODULAR", "WAVETABLE"]),
      N("scan", "SCAN", "WAVETABLE FRAME POSITION", 0, 1, 0, { u:"pc1" }),
      EN("w1", "WAVE", "OSC 1 WAVEFORM", WAVES, 2),
      N("oct1", "OCTAVE", "OSC 1 OCTAVE", -3, 3, 0, { int: 1, u: "st", bi: 1 }),
      N("lv1", "LEVEL", "OSC 1 LEVEL", 0, 1, 0.8, { u: "pc" }),
      EN("w2", "WAVE", "OSC 2 WAVEFORM", WAVES, 2),
      N("semi2", "SEMI", "OSC 2 TRANSPOSE", -24, 24, 0, { int: 1, u: "st", bi: 1 }),
      N("fine2", "FINE", "OSC 2 DETUNE (CENTS)", -50, 50, 0, { int: 1, u: "ct", bi: 1 }),
      N("lv2", "LEVEL", "OSC 2 LEVEL", 0, 1, 0, { u: "pc" }),
      N("sub", "SUB", "SUB OSCILLATOR LEVEL · SINE ONE OCTAVE DOWN", 0, 1, 0, { u: "pc" }),
      N("noise", "NOISE", "NOISE LEVEL", 0, 1, 0, { u: "pc" }),
      N("fm", "FM", "FM DEPTH · OSC 2 MODULATES OSC 1", 0, 1, 0, { u: "pc" }),
      ...filt(2400),
      ...env("f", "FILTER ENV", 0.002, 0.25, 0.3, 0.2),
      ...env("a", "AMP ENV", 0.003, 0.2, 0.7, 0.15),
      ...lfo,
      EN("mode", "MODE", "VOICE MODE", ["POLY", "MONO"]),
      N("glide", "GLIDE", "GLIDE TIME (MONO)", 0, 2, 0, { c: "sq", u: "t" }),
    ]),
    smp: dict([
      EN("mode", "MODE", "SAMPLER MODE · PITCHED SAMPLE, SLICES, GRANULAR CLOUD OR KEY AND VELOCITY ZONES", ["PITCH", "SLICE", "GRAIN", "ZONES"]),
      N("gpos","POSITION","GRAIN CENTER IN THE TRIMMED SAMPLE",0,1,.3,{u:"pc1"}),
      N("gsize","SIZE","GRAIN DURATION",.012,.36,.09,{u:"t",c:"exp"}),
      N("gdens","DENSITY","GRAINS PER SECOND",2,80,26,{int:1}),
      N("gspray","SPRAY","RANDOM SPREAD AROUND THE GRAIN CENTER",0,1,.08,{u:"pc1"}),
      N("slices", "SLICES", "SLICE COUNT", 2, 16, 8, { int: 1 }),
      N("root", "ROOT", "ROOT NOTE · KEY THAT PLAYS ORIGINAL PITCH", 24, 96, 60, { int: 1, u: "note" }),
      N("tune", "TUNE", "SAMPLE TRANSPOSE", -24, 24, 0, { int: 1, u: "st", bi: 1 }),
      N("st", "START", "SAMPLE START", 0, 1, 0, { u: "pc1" }),
      N("en", "END", "SAMPLE END", 0, 1, 1, { u: "pc1" }),
      BO("shot", "1-SHOT", "ONE-SHOT · IGNORE NOTE LENGTH, PLAY TO END", 1),
      BO("loop", "LOOP", "LOOP REGION WHILE NOTE IS HELD"),
      BO("rev", "REVERSE", "PLAY REVERSED"),
      ...filt(20000),
      ...env("f", "FILTER ENV", 0.002, 0.25, 0.3, 0.2),
      ...env("a", "AMP ENV", 0.001, 0.1, 1, 0.05),
      ...lfo,
    ]),
    pad: dict([
      EN("src", "SOURCE", "PAD SOURCE", ["SYNTH", "SAMPLE"]),
      EN("wave", "WAVE", "TONE WAVEFORM", WAVES),
      N("tune", "TUNE", "TONE PITCH", 20, 4000, 100, { c: "exp", u: "hz" }),
      N("sweep", "SWEEP", "PITCH SWEEP DOWN FROM", 0, 60, 0, { int: 1, u: "st" }),
      N("swt", "TIME", "PITCH SWEEP TIME", 0.002, 0.5, 0.04, { c: "exp", u: "t" }),
      N("dec", "DECAY", "DECAY TIME", 0.01, 4, 0.3, { c: "exp", u: "t" }),
      N("tone", "LEVEL", "TONE LEVEL", 0, 1, 1, { u: "pc" }),
      N("nz", "LEVEL", "NOISE LEVEL", 0, 1, 0, { u: "pc" }),
      N("col", "COLOR", "NOISE COLOR · THE BAND STARTS HERE AND SPANS TO 5× THIS", 100, 14000, 3000, { c: "exp", u: "hz" }),
      N("ndec", "DECAY", "NOISE DECAY", 0.005, 3, 0.1, { c: "exp", u: "t" }),
      N("burst", "BURST", "NOISE RETRIGGERS · 3 = CLAP", 1, 4, 1, { int: 1 }),
      N("st", "START", "SAMPLE START", 0, 1, 0, { u: "pc1" }),
      N("en", "END", "SAMPLE END", 0, 1, 1, { u: "pc1" }),
      N("pit", "PITCH", "SAMPLE PITCH", -24, 24, 0, { int: 1, u: "st", bi: 1 }),
      BO("rev", "REVERSE", "PLAY REVERSED"),
      N("drive", "DRIVE", "PAD SATURATION", 0, 1, 0, { u: "pc" }),
      N("lvl", "LEVEL", "PAD LEVEL", 0, 1, 0.8, { u: "gain" }),
      N("pan", "PAN", "PAD PAN", -1, 1, 0, { u: "pan", bi: 1 }),
      N("chk", "CHOKE", "CHOKE GROUP · PADS IN ONE GROUP CUT EACH OTHER · 0 = NONE", 0, 3, 0, { int: 1 }),
    ]),
    fx: dict([
      EN("dtime", "TIME", "DELAY TIME (TEMPO SYNC)", ["1/32", "1/16T", "1/16", "1/8T", "1/16D", "1/8", "1/4T", "1/8D", "1/4", "1/2"], 7),
      N("dfb", "FEEDBACK", "DELAY FEEDBACK", 0, 0.95, 0.4, { u: "pc" }),
      N("dtone", "TONE", "DELAY FEEDBACK LOW-PASS", 200, 16000, 4500, { c: "exp", u: "hz" }),
      N("dwid", "WIDTH", "DELAY PING-PONG WIDTH", 0, 1, 0.7, { u: "pc" }),
      N("mixDelay", "ALL DLY", "SEND THE WHOLE DRY MIX TO THE DELAY RETURN", 0, 1, 0, { u: "gain" }),
      N("mixReverb", "ALL REV", "SEND THE WHOLE DRY MIX TO THE REVERB RETURN", 0, 1, 0, { u: "gain" }),
      N("rsize", "DECAY", "REVERB DECAY TIME", 0.2, 10, 2.2, { c: "exp", u: "t" }),
      N("rdamp", "DAMP", "REVERB HIGH DAMPING", 0, 1, 0.5, { u: "pc" }),
      N("low", "LOW", "MASTER EQ · LOW SHELF 120 Hz", -12, 12, 0, { u: "db", bi: 1 }),
      N("mid", "MID", "MASTER EQ · MID 1 kHz", -12, 12, 0, { u: "db", bi: 1 }),
      N("high", "HIGH", "MASTER EQ · HIGH SHELF 6.5 kHz", -12, 12, 0, { u: "db", bi: 1 }),
      N("comp", "COMP", "MASTER COMPRESSION AMOUNT", 0, 1, 0.2, { u: "pc" }),
      N("vol", "VOLUME", "MASTER VOLUME", 0, 1, 0.9, { u: "gain" }),
    ]),
  };
  const defs = (d) => Object.fromEntries(Object.values(d).map((x) => [x.k, x.def]));

  // A lane belongs to one clip. Values are normalized fader positions; points
  // include the end boundary so a fade can reach its target on the final beat.
  const automationKeys = ["vol", "pan", "filter", "dly", "rev", "cutoff", "macro1", "macro2", "macro3", "macro4"];
  function curveBase(T,key,P=App.P) {
    if (key.startsWith("macro")) return P?.rack?.strips[P.tracks.indexOf(T)]?.macros[Number(key.slice(5))-1] ?? 0;
    if (key==="cutoff") return T.kind==="kit" ? 1 : toN(DEF[T.kind].cut,T[T.kind].cut);
    if (key==="filter") return 1;
    return key==="pan" ? (T.pan+1)/2 : T[key];
  }
  const pointAt = (points, step) => {
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].s <= step) lo = mid + 1; else hi = mid;
    }
    return lo - 1;
  };
  const curveShape = (lane, step) => {
    const p = lane?.points || [];
    return p[pointAt(p, step)]?.shape || lane?.mode || "linear";
  };
  function curveValue(lane, step, fallback = 0, side = "right") {
    const p = lane?.points;
    if (!p?.length) return fallback;
    const i = pointAt(p, step);
    if (i < 0) return p[0].in ?? p[0].v;
    const a = p[i], b = p[i + 1];
    if (step === a.s) {
      if (side !== "left") return a.v;
      if (i && (p[i-1].shape || lane.mode) === "step") return p[i-1].v;
      return a.in ?? a.v;
    }
    if (!b || (a.shape || lane.mode) === "step") return a.v;
    return a.v + ((b.in ?? b.v) - a.v) * (step - a.s) / (b.s - a.s);
  }

  /* ── project ──────────────────────────────────────────────────── */
  // Init sounds only. No notes ship with a new project.
  const KIT = [
    { name: "KICK", wave: 0, tune: 50, sweep: 30, swt: 0.05, dec: 0.45, tone: 1, nz: 0.14, col: 1800, ndec: 0.014 },
    { name: "SNARE", wave: 1, tune: 185, sweep: 9, swt: 0.03, dec: 0.14, tone: 0.55, nz: 0.8, col: 1700, ndec: 0.2 },
    { name: "CLAP", tone: 0, nz: 0.9, col: 1000, ndec: 0.28, burst: 3 },
    { name: "HAT", tone: 0, nz: 0.6, col: 8000, ndec: 0.05, chk: 1 },
    { name: "OPEN", tone: 0, nz: 0.55, col: 7000, ndec: 0.4, chk: 1 },
    { name: "TOM", wave: 0, tune: 105, sweep: 10, swt: 0.08, dec: 0.34, tone: 0.9, nz: 0.04, col: 1500, ndec: 0.03 },
    { name: "RIM", wave: 1, tune: 420, sweep: 4, swt: 0.01, dec: 0.05, tone: 0.7, nz: 0.3, col: 3500, ndec: 0.02 },
    { name: "BLIP", wave: 3, tune: 587, sweep: 0, dec: 0.25, tone: 0.9, nz: 0 },
  ];
  const INIT = [
    ["DRUMS", "kit", 48, {}, {}],
    ["BASS", "syn", 36, { sub: 0.25, cut: 600, res: 4, fenv: 2.2, fd: 0.22, fs: 0.35, fr: 0.1, aa: 0.002, ad: 0.25, ar: 0.06, mode: 1, ftrk: 0.5 }, {}],
    ["LEAD", "syn", 60, { w2: 3, lv2: 0.5, fine2: 9, cut: 3400, res: 3, fenv: 1.2, fd: 0.3, fs: 0.4, aa: 0.004, ad: 0.3, as: 0.6, ar: 0.18, mode: 1, glide: 0.04, ftrk: 0.5 }, { dly: 0.3 }],
    ["KEYS", "syn", 48, { w1: 1, w2: 0, semi2: 12, lv2: 0.25, cut: 3800, res: 0.5, fenv: 1.5, fd: 0.5, fs: 0.2, aa: 0.002, ad: 0.9, as: 0.25, ar: 0.35, ftrk: 0.5 }, { rev: 0.25 }],
    ["PAD", "syn", 48, { lv2: 0.8, fine2: 12, cut: 1100, fenv: 1, fa: 0.6, fd: 1.5, fs: 0.6, fr: 1.2, aa: 0.45, ad: 1, as: 0.85, ar: 1.1, lrate: 0.25, ldest: 2, ldep: 0.2 }, { rev: 0.45 }],
    ["SYNTH", "syn", 48, {}, {}],
    ["SAMPLE A", "smp", 48, {}, {}],
    ["SAMPLE B", "smp", 48, {}, {}],
  ];

  const extraPads = [
    {name:"HI BONGO",tune:335,dec:.11}, {name:"LO BONGO",tune:230,dec:.14},
    {name:"MT CONGA",tune:280,dec:.055}, {name:"HI CONGA",tune:244,dec:.22},
    {name:"LO CONGA",tune:169,dec:.29}, {name:"HI TIMB",tune:310,nz:.26,dec:.2},
    {name:"LO TIMB",tune:207,nz:.32,dec:.26}, {name:"CABASA",tone:0,nz:.85,col:4900,ndec:.11,burst:2}
  ];
  const drumMap = [36,38,39,42,46,45,37,56,60,61,62,63,64,65,66,69];
  const newPad = i => ({...defs(DEF.pad),...(KIT[i] || extraPads[i-8]),id:null});
  const newKit = (count=8) => ({pads:Array.from({length:count>8?16:8},(_,i)=>newPad(i))});
  const extensions = [];
  App.extendProject = extension => extensions.push(extension);
  function extend(P, raw) {
    for (const extension of extensions) extension.load?.(P, raw);
    return P;
  }
  const newProject = () => extend(baseProject(), {});
  const baseProject = () => ({
    app: "MUSICLAB", v: 3, name: "UNTITLED",
    bpm: 120, swing: 0, sig: 2, key: 0, scale: 2, click: 0, song: 0, fold: 0,
    chain: [],
    pats: Array.from({ length: 8 }, () => ({ bars: 1 })),
    tracks: INIT.map(([name, kind, lo, syn, trk]) => ({
      name, kind, ...defs(DEF.trk), ...trk, lo,
      arp: defs(DEF.arp),
      syn: { ...defs(DEF.syn), ...syn },
      smp: { ...defs(DEF.smp), id: null },
      kit: newKit(),
      clips: Array.from({ length: 8 }, () => []),
      automation: Array.from({ length: 8 }, () => ({})),
    })),
    fx: defs(DEF.fx),
    sel: { t: 0, p: 0, pad: 0 },
  });

  /* ── load / sanitize ──────────────────────────────────────────── */
  const num = (v, a, b, d, int) => {
    if (typeof v === "boolean") v = +v;
    if (typeof v !== "number" || !isFinite(v)) return d;
    v = clamp(v, a, b);
    return int ? Math.round(v) : v;
  };
  const str = (v, d, n) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase().slice(0, n) : d);
  const sid = (v) => (typeof v === "string" && /^[a-z0-9]{6,24}$/.test(v) ? v : null);
  const fit = (dc, src, base) => {
    const o = {};
    for (const k in dc) o[k] = num(src?.[k], dc[k].min, dc[k].max, base ? base[k] : dc[k].def, dc[k].int || dc[k].opts || dc[k].bool);
    return o;
  };
  const notes = (a) =>
    Array.isArray(a)
      ? a.filter((n) => n && Number.isInteger(n.s) && Number.isInteger(n.n)).slice(0, 4000)
          .map((n) => ({ s: clamp(n.s, 0, MAX_STEPS - 1), n: clamp(n.n, 0, 127), ...App.Rules?.fields(n), l: num(n.l, 1, MAX_STEPS, 1, 1), v: num(n.v, Number.isFinite(n.fixed?.gate) ? 0 : 0.02, 1, 0.8), p: num(n.p, 0, 1, 1), ...(Number.isFinite(n.off) && n.off ? {off:clamp(n.off,-0.49,0.49)} : {}), ...(n.r > 1 ? { r: num(n.r, 1, 8, 1, 1) } : {}) }))
      : [];

  function loadCurves(src) {
    const out = {};
    for (const k of automationKeys) {
      const lane = src?.[k];
      if (!Array.isArray(lane?.points)) continue;
      const mode = lane.mode === "step" ? "step" : "linear", byStep = new Map();
      for (const pt of lane.points.slice(0, 1024)) {
        if (!pt || !Number.isInteger(pt.s) || pt.s < 0 || pt.s > MAX_STEPS || !Number.isFinite(pt.v)) continue;
        const p = {s:pt.s, v:clamp(pt.v, 0, 1)};
        if (Number.isFinite(pt.in) && pt.in !== p.v) p.in = clamp(pt.in, 0, 1);
        if (["step","linear"].includes(pt.shape) && pt.shape !== mode) p.shape = pt.shape;
        byStep.set(p.s, p);
      }
      if (byStep.size) out[k] = {mode, points:[...byStep.values()].sort((a,b) => a.s - b.s)};
    }
    return out;
  }

  const sanitize = (src) => {
    const P = baseProject();
    if (!src || typeof src !== "object" || !Array.isArray(src.tracks)) return null;
    P.name = str(src.name, P.name, 28);
    Object.assign(P, fit(DEF.top, src));
    for (const k of ["click", "song", "fold"]) P[k] = num(src[k], 0, 1, 0, 1);
    P.chain = Array.isArray(src.chain) ? src.chain.filter((x) => Number.isInteger(x) && x >= 0 && x < 8).slice(0, 32) : [];
    P.pats = P.pats.map((_, i) => ({ bars: num(src.pats?.[i]?.bars, 1, MAX_BARS, 1, 1) }));
    P.tracks = P.tracks.map((d, i) => {
      const s = src.tracks[i];
      if (!s || typeof s !== "object") return d;
      return {
        name: str(s.name, d.name, 10), kind: ["syn", "kit", "smp"].includes(s.kind) ? s.kind : d.kind,
        ...fit(DEF.trk, s), lo: num(s.lo, 0, 116, d.lo, 1),
        arp: fit(DEF.arp, s.arp), syn: fit(DEF.syn, s.syn, d.syn),
        smp: { ...fit(DEF.smp, s.smp), id: sid(s.smp?.id) },
        kit: { pads: (Array.isArray(s.kit?.pads) && s.kit.pads.length>8 ? newKit(16) : d.kit).pads.map((pd, k) => ({ ...fit(DEF.pad, s.kit?.pads?.[k], pd), name: str(s.kit?.pads?.[k]?.name, pd.name, 8), id: sid(s.kit?.pads?.[k]?.id) })) },
        clips: d.clips.map((_, k) => notes(s.clips?.[k])),
        automation: d.automation.map((_, k) => loadCurves(s.automation?.[k])),
      };
    });
    P.fx = fit(DEF.fx, src.fx);
    P.sel = { t: num(src.sel?.t, 0, 7, 0, 1), p: num(src.sel?.p, 0, 7, 0, 1), pad: 0 };
    P.sel.pad = num(src.sel?.pad,0,P.tracks[P.sel.t].kit.pads.length-1,0,1);
    return extend(P,src);
  };

  /* ── history + local storage ──────────────────────────────────── */
  const KEY = "musiclab.v3";
  const makeHistory = (store = null) => ({ st: [], i: -1, store });
  let hist = makeHistory();
  let saveT = 0, lastConsoleWrite;
  const save = (s) => {
    if (hist.store) return hist.store.write(s);
    // A tab returning from its songbook must not save an unchanged, parked
    // project over music somebody has since edited in another console tab.
    if (s === lastConsoleWrite) return true;
    try { localStorage.setItem(KEY, s); lastConsoleWrite = s; return true; } catch (e) { App.UI?.msg("LOCAL SAVE FAILED · USE FILE > SAVE"); return false; }
  };
  // A workspace keeps its history and draft writer together. Finish the outgoing
  // deferred view write before exposing the new project to either writer.
  App.makeHistory = makeHistory;
  App.swapHistory = (next) => {
    if (saveT) App.flush();
    const parked = hist;
    hist = next;
    return parked;
  };
  // What is on screen is not an edit. The selection, the scale fold and each track's pitch view are saved with the
  // project, but they never make an undo step and an undo never takes them back.
  const noView = function (k, v) { return ((k === "sel" || k === "fold") && this.tracks) || (k === "lo" && this.clips) ? undefined : v; };
  const content = (P) => JSON.stringify(P, noView);
  // Checkpoint: one undo step per finished gesture.
  App.commit = (projectChange = false) => {
    const s = JSON.stringify(App.P), key = content(App.P), destination = hist.store?.destination();
    clearTimeout(saveT); saveT = 0;
    const durable = save(s);
    if (key === hist.key && destination === hist.st[hist.i]?.destination) return durable;
    hist.st.length = hist.i + 1;
    hist.st.push({ data: s, projectChange, destination });
    if (hist.st.length > 160) hist.st.shift();
    hist.i = hist.st.length - 1;
    hist.key = key;
    App.Top?.history?.();
    App.lamps?.();
    return durable;
  };
  // Save without a checkpoint (selection, view position, mid-drag values).
  App.touch = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => { saveT = 0; save(JSON.stringify(App.P)); }, 400);
  };
  App.flush = () => { clearTimeout(saveT); saveT = 0; return save(JSON.stringify(App.P)); };
  const step = (d) => {
    const i = hist.i + d;
    if (i < 0 || i >= hist.st.length) return false;
    const sel = App.P.sel, fold = App.P.fold, lows = App.P.tracks.map((t) => t.lo);
    const boundary = hist.st[d < 0 ? hist.i : i], crossesProject = boundary.projectChange;
    const project = JSON.parse(hist.st[i].data);
    if (!crossesProject) { project.sel = sel; project.fold = fold; project.tracks.forEach((t, k) => (t.lo = lows[k])); }
    if (hist.store && !hist.store.restore(JSON.stringify(project), hist.st[i].destination)) return false;
    App.historyCrossedProject=!!crossesProject;
    hist.i = i;
    App.P = project;
    hist.key = content(App.P);
    clearTimeout(saveT); saveT = 0;
    if (!hist.store) save(JSON.stringify(App.P)); // workspace restore also restores its shelf and slot
    App.Top?.history?.();
    return true;
  };
  // What the next undo or redo would bring, without taking the step.
  App.undoPeek = (d) => { const i = hist.i + d; if (i < 0 || i >= hist.st.length) return null; return { project: JSON.parse(hist.st[i].data), projectChange: hist.st[d < 0 ? hist.i : i].projectChange }; };
  App.canUndo = () => hist.i > 0;
  App.canRedo = () => hist.i < hist.st.length - 1;
  App.undo = () => step(-1);
  App.redo = () => step(1);
  App.stored = () => {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return null; }
  };

  /* ── sample store (decoded buffers in memory, encoded bytes in IndexedDB) ── */
  const idb = (() => {
    let db, useBytes=false;
    const open = () =>
      db || (db = new Promise((res, rej) => {
        const r = indexedDB.open("musiclab3", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("smp", { keyPath: "id" });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      }));
    const tx = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction("smp", mode), q = fn(t.objectStore("smp"));
        t.oncomplete = () => res(q.result);
        q.onerror = () => rej(q.error);
        t.onabort = () => rej(t.error || Error("Sample storage transaction aborted"));
      });
    };
    return {
      async put(record) {
        if (!useBytes) {
          try { return await tx("readwrite", store => store.put(record)); }
          catch (e) {
            // Some WebKit stores accept IndexedDB but cannot persist Blob values.
            if (!["UnknownError","DataCloneError","NotSupportedError"].includes(e?.name)) throw e;
          }
        }
        const {id,name,blob}=record, bytes=await blob.arrayBuffer();
        const key=await tx("readwrite",store=>store.put({id,name,type:blob.type,bytes}));
        useBytes=true;
        return key;
      },
      async get(id) {
        const record=await tx("readonly", store => store.get(id));
        if (record?.bytes && !record.blob) record.blob=new Blob([record.bytes],{type:record.type || "audio/wav"});
        return record;
      },
      drop: (ids) => tx("readwrite", (s) => { let q; for (const id of ids) q = s.delete(id); return q; }),
      keys: () => tx("readonly", (s) => s.getAllKeys()),
    };
  })();

  const peaks = (buf, n = 1200) => {
    const d = buf.getChannelData(0), out = new Float32Array(n * 2), w = d.length / n;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * w), b = Math.max(a + 1, Math.min(d.length, Math.ceil((i + 1) * w))), q = Math.max(1, (b - a) >> 8);
      let lo = 1, hi = -1;
      for (let j = a; j < b; j += q) { const x = d[j]; if (x < lo) lo = x; if (x > hi) hi = x; }
      out[i * 2] = lo; out[i * 2 + 1] = hi;
    }
    return out;
  };

  const wav = (buf, firstSample = 0, floating = false) => {
    const ch = floating ? buf.numberOfChannels : Math.min(2, buf.numberOfChannels), n = buf.length - firstSample;
    const width = floating ? 4 : 3, size = n * ch * width;
    const header = floating ? 56 : 44, ab = new ArrayBuffer(header + size), dv = new DataView(ab), u8 = new Uint8Array(ab);
    const tag = (o, s) => { for (let i = 0; i < 4; i++) u8[o + i] = s.charCodeAt(i); };
    tag(0, "RIFF"); dv.setUint32(4, header - 8 + size, true); tag(8, "WAVE"); tag(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, floating ? 3 : 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * ch * width, true);
    dv.setUint16(32, ch * width, true); dv.setUint16(34, 8 * width, true);
    if (floating) { tag(36,"fact"); dv.setUint32(40,4,true); dv.setUint32(44,n,true); }
    tag(header-8, "data"); dv.setUint32(header-4, size, true);
    const c = []; for (let k = 0; k < ch; k++) c.push(buf.getChannelData(k));
    let o = header;
    for (let i = firstSample; i < buf.length; i++) for (let k = 0; k < ch; k++) {
      if (floating) { dv.setFloat32(o, c[k][i], true); o += 4; continue; }
      const x = Math.round(clamp(c[k][i], -1, 1) * 8388607);
      u8[o++] = x & 255; u8[o++] = (x >> 8) & 255; u8[o++] = (x >> 16) & 255;
    }
    return new Blob([ab], { type: "audio/wav" });
  };

  App.samples = new Map();
  const decode = (bytes) => {
    const ctx = App.E ? App.E.ctx : new OfflineAudioContext(2, 1, 48000);
    return ctx.decodeAudioData(bytes.slice(0));
  };
  const register = (id, name, buffer, blob = null) => {
    const pk = peaks(buffer);
    let peak = 0;
    for (let i = 0; i < pk.length; i++) { const a = Math.abs(pk[i]); if (a > peak) peak = a; }
    const s = { id, name, buffer, blob, peaks: pk, peak, rev: null };
    App.samples.set(id, s);
    return s;
  };
  // Encoded file → sample. Keeps the original bytes so saved projects stay small.
  App.addSample = async (name, blob) => {
    const buffer = await decode(await blob.arrayBuffer());
    const id = uid();
    register(id, name, buffer, blob);
    idb.put({ id, name, blob }).catch(() => App.UI.msg("SAMPLE NOT STORED LOCALLY · USE FILE > SAVE"));
    return id;
  };
  App.addBuffer = (name, buffer, {floating=false}={}) => {
    const id = uid(), blob = wav(buffer,0,floating);
    register(id, name, buffer, floating ? blob : null);
    idb.put({ id, name, blob }).catch(() => App.UI.msg("SAMPLE NOT STORED LOCALLY · USE FILE > SAVE"));
    return id;
  };
  App.storeBuffer = async (name, buffer) => {
    const id = uid(), blob = wav(buffer);
    await idb.put({ id, name, blob });
    register(id, name, buffer, blob);
    return id;
  };
  App.sampleIds = (P) => {
    const ids = new Set();
    for (const T of P.tracks) { if (T.smp.id) ids.add(T.smp.id); for (const p of T.kit.pads) if (p.id) ids.add(p.id); }
    for (const extension of extensions) extension.sampleIds?.(P, ids);
    return ids;
  };
  App.remapSample = (P, from, to) => {
    for (const T of P.tracks) {
      if (T.smp.id === from) T.smp.id = to;
      for (const pad of T.kit.pads) if (pad.id === from) pad.id = to;
    }
    for (const extension of extensions) extension.remapSample?.(P, from, to);
  };
  // An installed instrument may supply a local asset for one of its reserved IDs.
  // Keep the bytes in IndexedDB too, so an already played kit survives offline.
  const bundledRecord = id => {
    for (const e of extensions) {
      const asset = e.bundledSample?.(id);
      if (asset) return asset;
    }
    return null;
  };
  async function sampleRecord(id) {
    const asset = bundledRecord(id);
    let saved;
    try { saved = await idb.get(id); } catch (error) { if (!asset) throw error; }
    // A kept copy of a bundled sound stands until the sound itself is replaced (its version changes).
    if (!asset || (saved && (!asset.version || saved.version === asset.version))) return saved;
    let response;
    try { response = await fetch(asset.url); } catch (error) { if (saved) return saved; throw error; }
    if (!response.ok) { if (saved) return saved; throw Error("CANNOT LOAD " + asset.name.toUpperCase()); }
    return {id,name:asset.name,blob:await response.blob(),bundled:true,version:asset.version};
  }
  const restoring = new Map();
  App.restoreSample = id => {
    if (App.samples.has(id)) return Promise.resolve(false);
    if (restoring.has(id)) return restoring.get(id);
    const loading = sampleRecord(id).then(async record => {
      if (!record) return false;
      const buf = await decode(await record.blob.arrayBuffer());
      if (record.bundled) {
        // Cache only decodable audio. A broken response can be retried on the next hit.
        try { await idb.put({id,name:record.name,blob:record.blob,version:record.version}); } catch { /* The installed asset remains available. */ }
      }
      register(id,record.name,buf,record.blob);
      return true;
    }).finally(()=>restoring.delete(id));
    restoring.set(id,loading);
    return loading;
  };
  App.restoreSamples = async (project = App.P) => {
    let n = 0;
    for (const id of App.sampleIds(project)) {
      try { if (await App.restoreSample(id)) n++; }
      catch { /* Missing audio shows as an empty sampler. */ }
    }
    return n;
  };
  App.sampleBlob = async (id) => {
    const sample = App.samples.get(id);
    if (sample?.blob) return sample.blob;
    if (sample) return wav(sample.buffer);
    if (bundledRecord(id)) {
      await App.restoreSample(id);
      return App.samples.get(id)?.blob || null;
    }
    return (await idb.get(id))?.blob || null;
  };
  App.importSample = async (id, name, blob) => {
    register(id, name, await decode(await blob.arrayBuffer()), blob);
    try { await idb.put({ id, name, blob }); return true; } catch { return false; }
  };

  /* Recordings nothing can reach any more leave the browser's store at start-up. Three things keep that safe:
     only a tab that is open alone cleans (another tab's undo history may still hold a sample), it keeps all that
     this tab has decoded or can undo to, and a build older than the one that last saved cleans nothing, because a
     later build may keep sample ids where this one does not look. Raise REFS with every such new place. */
  const REFS = 4, REFS_KEY = KEY + ".refs", TABS = "musiclab.tabs";
  App.tidySamples = async (projects) => {
    const locks = navigator.locks;
    let known = 0, removed = 0;
    try { known = +localStorage.getItem(REFS_KEY) || 0; if (known < REFS) localStorage.setItem(REFS_KEY, REFS); } catch { known = Infinity; }
    if (!locks) return 0;
    if (projects && known <= REFS) {
      // A reload asks while the page it replaces still holds its place for a moment, so wait for it briefly.
      const stop = new AbortController(), timer = setTimeout(() => stop.abort(), 2500);
      await locks.request(TABS, { signal: stop.signal }, async () => {
        clearTimeout(timer);
        const keys = await idb.keys(), keep = new Set(App.samples.keys());
        const states = [...projects, App.P, ...hist.st.map((entry) => JSON.parse(entry.data))];
        // Shelves are additional project roots. Their recordings belong to the
        // saved songs, independent of which project is currently exported.
        for (const extension of extensions) if (extension.storedProjects) states.push(...extension.storedProjects());
        for (const P of states) if (P) for (const id of App.sampleIds(P)) keep.add(id);
        const unused = keys.filter((id) => !keep.has(id));
        if (unused.length) { await idb.drop(unused); removed = unused.length; }
      }).catch(() => {});
      clearTimeout(timer);
    }
    locks.request(TABS, { mode: "shared" }, () => new Promise(() => {})).catch(() => {}); // held until the tab closes
    return removed;
  };

  Object.assign(App, {
    clamp, NOTES, PATS, SCALES, SIGS, DEF, pc, noteName, mtof, uid, pad2, spb, beatSteps, maxBars, patSteps, inScale,
    chordNotes, chordName, fmt, parse, toN, fromN, UNIT, fHz, fTime, fDb, defs, newProject, newKit, newPad, drumMap, sanitize, wav, peaks, N,
    automationKeys, curveBase, curveValue, curveShape, MAX_STEPS, MAX_BARS, songPatterns, snap, nudge,
  });
})();
