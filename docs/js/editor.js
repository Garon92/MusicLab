/* MUSICLAB · editor — one note grid for every instrument (keys, drum pads, sample slices) */
(() => {
  "use strict";
  const { clamp, pad2, PATS } = App, UI = App.UI, { h, btn } = UI;
  const ROWS = 24;

  App.Ed = (() => {
    let cv, cx, ph, rd, hd = {}, W = 0, H = 0, D = 1, R = [], G = {}, hov = null, act = null, raf = 0, wheel = 0;
    let lane = "v", rowNote = null, laneT = 0;
    // The pen: what the next note drawn gets, and what a click draws (one note, a triad or a seventh chord).
    const pen = { v: 0.8, p: 1, r: 1, l: 1, chord: 0 };
    // The four values every note carries, as console values. With notes selected they show and set those notes; with
    // none they show and set the pen. A selection that disagrees reads as a range and takes the value it is given.
    const noteVal = (nt, k) => (k === "r" ? nt.r || 1 : nt[k]);
    const spread = (k, show) => (v) => {
      let lo = Infinity, hi = -Infinity;
      for (const nt of selection) { const x = noteVal(nt, k); if (x < lo) lo = x; if (x > hi) hi = x; }
      return selection.size > 1 && lo !== hi ? show(lo).replace("%", "") + "-" + show(hi) : show(v);
    };
    const pct = (v) => Math.round(v * 100) + "%";
    const NOTE = {
      v: App.N("v", "VEL", "VELOCITY · HOW HARD THE NOTE IS PLAYED", 0.02, 1, 0.8, { u: "pc", f: spread("v", pct) }),
      p: App.N("p", "PROB", "PROBABILITY · THE CHANCE THE NOTE SOUNDS ON EACH PASS", 0, 1, 1, { u: "pc", f: spread("p", pct) }),
      r: App.N("r", "RPT", "REPEATS · HITS SPREAD ACROSS THE NOTE'S LENGTH", 1, 8, 1, { int: 1, f: spread("r", String) }),
      l: App.N("l", "LEN", "LENGTH IN STEPS · STOPS AT THE NEXT NOTE ON THE ROW AND AT THE END OF THE CLIP", 1, 256, 1, { int: 1, f: spread("l", String) }),
    };
    const CHORD = { k: "chord", l: "CHORD", name: "WHAT A CLICK IN THE GRID DRAWS · ONE NOTE, A TRIAD OR A SEVENTH CHORD OF THE SCALE", opts: ["OFF", "TRIAD", "SEVENTH"], min: 0, max: 2, def: 0 };
    const chordSize = () => [1, 3, 4][pen.chord];
    let page = 0, pagePattern = -1, followTransport = true;
    let tool = "draw", selection = new Set(), selectionClip = null, selectionShape = "", selectionAt = "", carry = false;
    let lit = new Set(), litStep = -2; // rows sounding under the playhead
    const live = new Set(); // rows held from the keyboard or MIDI
    const eu = { k: 4, n: 16, r: 0 };

    const ctx = () => {
      const P = App.P, ti = P.sel.t, pi = P.sel.p, T = P.tracks[ti];
      return { P, ti, pi, T, clip: T.clips[pi] };
    };
    const isKeys = (T) => T.kind === "syn" || (T.kind === "smp" && T.smp.mode !== 1);

    // Rows top to bottom. Pads and slices sit on MIDI notes 36+, so clips survive a change of instrument.
    const rowList = () => {
      const { P, T } = ctx();
      if (T.kind === "kit") return T.kit.pads.map((p, i) => ({ n: 36 + i, label: p.name, pad: i }));
      if (T.kind === "smp" && T.smp.mode === 1) return Array.from({ length: T.smp.slices }, (_, i) => ({ n: 36 + i, label: "SLICE " + pad2(i + 1), slice: 1 }));
      const count = G.rows || ROWS;
      // Folded to the scale, a row that holds a note stays: nothing that sounds is hidden.
      const used = P.fold ? new Set(T.clips[P.sel.p].map((nt) => nt.n)) : null;
      const pitches = Array.from({ length: 128 }, (_, n) => n).filter(n => !P.fold || App.inScale(P, n) || used.has(n));
      const above = pitches.findIndex(n => n >= T.lo);
      const start = clamp(above < 0 ? pitches.length : above, 0, Math.max(0, pitches.length - count));
      const out = pitches.slice(start, start + count);
      return out.reverse().map((n) => ({ n, label: App.noteName(n), black: [1, 3, 6, 8, 10].includes(n % 12), out: !App.inScale(P, n), root: App.pc(n - P.key) === 0 }));
    };

    function build() {
      const el = document.getElementById("ed");
      el.innerHTML = "";
      hd.title = h("span.ti");
      hd.prev = btn("‹", "PREVIOUS FOUR BARS · MANUAL PAGING HOLDS THIS VIEW UNTIL THE NEXT PLAY", () => turnPage(-1));
      hd.next = btn("›", "NEXT FOUR BARS · MANUAL PAGING HOLDS THIS VIEW UNTIL THE NEXT PLAY", () => turnPage(1));
      hd.prev.setAttribute("aria-label", "Previous bars");
      hd.next.setAttribute("aria-label", "Next bars");
      hd.bars = h("span.ed-page", {tip:"THE BARS IN VIEW, OUT OF THE PATTERN'S LENGTH"});
      // The pattern's length where the pattern is edited: the same value as on its letter in the matrix.
      const lenFace = { get bars() { const P = App.P; return Math.min(P.pats[P.sel.p].bars, App.maxBars(P)); }, set bars(v) { App.P.pats[App.P.sel.p].bars = v; } };
      hd.len = UI.param(App.Mx.barsDef, lenFace, () => { App.Mx.sync(); sync(); }, { label: "LENGTH" });
      // A clip may loop on its own length, against the pattern. The launcher sets that too; here it is seen and reset.
      const loopFace = { get loop() { const P = App.P; return P.performance.loops[P.sel.t][P.sel.p]; }, set loop(v) { const P = App.P; P.performance.loops[P.sel.t][P.sel.p] = v; } };
      hd.loop = UI.param({ k: "loop", l: "LOOP", name: "THIS CLIP'S OWN LOOP IN STEPS · PATTERN = AS LONG AS THE PATTERN · ANOTHER LENGTH TURNS IT AGAINST THE OTHER TRACKS", min: 0, max: 256, def: 0, int: 1, f: (v) => (v ? v + " ST" : "PATTERN") },
        loopFace, () => { sync(); App.Mx.sync(); });
      hd.chord = UI.param(CHORD, pen, () => cv.focus({ preventScroll: true }));
      const face = {};
      for (const k of Object.keys(NOTE)) Object.defineProperty(face, k, { get: () => { let nt; for (nt of selection); return nt ? noteVal(nt, k) : pen[k]; }, set: (v) => setValue(k, v) });
      hd.vals = Object.values(NOTE).map((d) => UI.param(d, face, () => { draw(); }, { done: () => { App.Mx.draw(); cv.focus({ preventScroll: true }); } }));
      hd.sel = h("span.tg");
      hd.past = h("span.ed-past");
      hd.follow = btn("FOLLOW", "", () => { followTransport = !followTransport; sync(); }, "tog");
      hd.fold = btn("FOLD", "SHOW ONLY NOTES OF THE SCALE", () => { App.P.fold ^= 1; App.touch(); sync(); }, "tog");
      hd.od = btn("-", "VIEW ONE OCTAVE DOWN · WHEEL OVER GRID = SCROLL PITCH", () => view(-12));
      hd.ou = btn("+", "VIEW ONE OCTAVE UP · WHEEL OVER GRID = SCROLL PITCH", () => view(12));
      hd.draw = btn("DRAW", "CLICK TO DRAW · SHIFT-CLICK TO SELECT NOTES", () => chooseTool("draw"));
      hd.select = btn("SELECT", "CLICK NOTES OR DRAG A BOX IN EMPTY SPACE · SHIFT ADDS TO THE SELECTION", () => chooseTool("select"));
      hd.auto = btn("AUTOMATION", "DRAW CURVES THAT MOVE LEVEL, PAN, FILTER OR SENDS WHILE THIS CLIP PLAYS", () => {
        cancelGesture();
        App.Automation.open();
        updateSelection();
      });
      hd.auto.dataset.has = "auto";
      hd.count = h("span.ed-count", { "aria-live": "polite" });
      hd.remove = btn("DEL", "DELETE SELECTED NOTES · DELETE OR BACKSPACE", removeSelection);
      hd.dup = btn("DUP", "DUPLICATE SELECTED NOTES AFTER THE SELECTION · CTRL/CMD D", duplicate);
      // One set of arrows: they move the selected notes, or the whole clip when nothing is selected.
      const mover = (dir, name, dx, dy) => {
        const b = btn("", "MOVE " + name + " · THE SELECTED NOTES, OR THE WHOLE CLIP WHEN NOTHING IS SELECTED" + (dy ? " · SHIFT = OCTAVE" : " · WRAPS AROUND THE CLIP"), (e) => shiftNotes(dx, dy, e.shiftKey), "ar." + dir);
        b.setAttribute("aria-label", "Move " + name.toLowerCase());
        return b;
      };
      hd.move = [mover("l", "ONE STEP EARLIER", -1, 0), mover("r", "ONE STEP LATER", 1, 0), mover("d", "ONE ROW DOWN", 0, 1), mover("u", "ONE ROW UP", 0, -1)];
      hd.lr = btn("RPT", "THE LANE UNDER THE GRID SHOWS REPEATS · 1–8 HITS ACROSS A NOTE", () => { lane = "r"; sync(); });
      hd.lv = btn("VEL", "THE LANE UNDER THE GRID SHOWS VELOCITY", () => { lane = "v"; sync(); });
      hd.lp = btn("PROB", "THE LANE UNDER THE GRID SHOWS PROBABILITY · BELOW 100% A NOTE PLAYS BY CHANCE", () => { lane = "p"; sync(); });
      hd.euc = btn("EUCLID", "SPREAD N HITS EVENLY OVER A CYCLE ON THE LAST TOUCHED ROW", () => euclid(), "mnu");
      rd = h("span.rd");
      el.append(h("div.hd.ed-tools", null,
        h("span.tg", { text: "EDIT" }), hd.title,
        h("span.grp", { role: "group", "aria-label": "Editing tool" }, hd.draw, hd.select, hd.auto),
        h("span.grp.ed-pages", {role:"group", "aria-label":"Pattern length and visible bars"}, hd.len, hd.loop, hd.past, hd.prev, hd.bars, hd.next, hd.follow),
        h("span.grp", null, h("span.tg", { text: "LANE" }), hd.lv, hd.lp, hd.lr),
        // What only a pitched track has comes last, so nothing else moves when it is not there.
        (hd.pitched = [h("span.grp", null, hd.chord), h("span.grp", null, h("span.tg", { text: "VIEW" }), hd.od, hd.ou, hd.fold)]),
        h("span.sp"), rd),
      h("div.hd.ed-actions", null,
        h("span.grp.ed-note", { role: "group", "aria-label": "Note values" }, hd.sel, hd.count, hd.vals),
        h("span.grp", { role: "group", "aria-label": "Move notes" }, h("span.tg", { text: "MOVE" }), hd.move),
        h("span.grp", null, hd.dup, hd.remove),
        h("span.sp"),
        h("span.grp", { role: "group", "aria-label": "Note generators" }, h("span.tg", { text: "WRITE" }), hd.euc,
          btn("CYCLES…", "INDEPENDENT PITCH, ACCENT AND GATE CLOCKS · AUDITION AND PRINT", () => App.Cycles.open()),
          btn("GROOVE…", "GROOVE TEMPLATE · NOTE TIMING · RECORD QUANTIZATION", () => App.Groove.open()),
          btn("RULES…", "NOTE CONDITIONS, RANDOM SEED AND PRINTING A PLAYED PASS", () => App.Rules.open())),
        App.Rules.fillButton()));
      cv = h("canvas", { tabindex: "0", "aria-label": "Note editor. In Select mode drag a box or Shift-click notes. Use arrow keys to move a selection.", role: "application" }); ph = h("div.ed-ph");
      el.addEventListener("keydown", shortcuts);
      el.addEventListener("click", e => {
        if (e.target.closest("button") && !App.Automation.active()) queueMicrotask(() => {
          if (!document.querySelector(".mn, .pop, dialog[open], [role=dialog]:not([hidden])")) cv.focus({ preventScroll: true });
        });
      });
      const body = h("div.ed-b", null, cv, ph);
      el.append(body);
      cx = cv.getContext("2d");
      App.Automation.mount(el);
      const tgt = (e) => {
        const c = ctx(), m = at(e);
        return c.T.kind === "kit" ? { ti: c.ti, pad: m.zone === "lane" ? c.P.sel.pad : R[m.row].pad } : { ti: c.ti };
      };
      UI.drop(body, { file: (f, e) => App.dropFiles(f, tgt(e)), take: (d, e) => App.dropTake(tgt(e)) });
      cv.addEventListener("pointerdown", down);
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", cancelPointer);
      cv.addEventListener("lostpointercapture", cancelPointer);
      window.addEventListener("blur", () => { if (act) cancelGesture(); });
      cv.addEventListener("pointerleave", () => { if (act) return; hov = null; rd.textContent = ""; UI.hint(null); later(); });
      cv.addEventListener("dblclick", rename);
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        const { T } = ctx(), m = at(e);
        if (act || (m.zone !== "lane" && !isKeys(T))) return;
        wheel += e.deltaY || e.deltaX; // with SHIFT held, browsers report the wheel on the X axis
        if (Math.abs(wheel) < 40) return;
        if (m.zone === "lane") wheelLane(m, wheel < 0, e.shiftKey);
        else view((wheel < 0 ? 1 : -1) * (e.shiftKey ? 12 : 2));
        wheel = 0;
      }, { passive: false });
    }

    /* ── clip operations ── */
    // Moving a selection with the arrow keys is one edit however many steps it takes. While it travels, the notes
    // it passes over are left alone; what lies under it where it comes to rest is replaced, as when a drag is dropped.
    let travel = 0, travelClip = null;
    const land = () => {
      if (!travel) return;
      clearTimeout(travel); travel = 0;
      const clip = travelClip; travelClip = null;
      if (selection.size && [...selection].every((nt) => clip.includes(nt))) carve(clip, selection);
      clip.sort((a, b) => a.s - b.s || a.n - b.n);
      App.commit(); draw(); App.Mx.sync();
    };
    const edit = (fn) => { land(); const c = ctx(); fn(c); c.clip.sort((a, b) => a.s - b.s || a.n - b.n); App.commit(); sync(); App.Mx.sync(); };
    const view = (d) => {
      const { T, P } = ctx(), visible = rowList();
      let low = visible[visible.length - 1].n + d;
      // Folded to a scale, the view starts on the next scale note at or above `lo`: going down has to land on one,
      // or a gap wider than the step (pentatonic, blues, harmonic minor) rounds straight back up.
      if (P.fold && d < 0) while (low > 0 && !App.inScale(P, low)) low--;
      T.lo = clamp(low, 0, 128 - (G.rows || ROWS));
      hov = null; App.touch(); draw();
    };
    const shiftNotes = (dx, dy, big) => {
      if (selection.size) nudge(dx, dy, big);
      else if (dx) rotate(dx);
      else transpose(dy < 0 ? (big ? 12 : 1) : big ? -12 : -1);
    };
    const rotate = (d) => edit((c) => { const n = App.Live.length(c.P,c.ti,c.pi); for (const nt of c.clip) if (nt.s < n) nt.s = (nt.s + d + n) % n; });
    const transpose = (d) => {
      const c = ctx();
      if (!c.clip.length) return;
      if (!isKeys(c.T)) { UI.msg("PADS AND SLICES DO NOT TRANSPOSE · SELECT NOTES TO MOVE THEM BETWEEN ROWS"); return; }
      if (c.clip.some((nt) => nt.n + d < 0 || nt.n + d > 127)) { UI.msg("NO ROOM TO MOVE THE CLIP FURTHER"); return; }
      const steps = App.Live.length(c.P, c.ti, c.pi);
      edit((x) => { for (const nt of x.clip) if (nt.s < steps) nt.n += d; });
      if (!c.clip.every((nt) => nt.n >= c.T.lo && nt.n < c.T.lo + ROWS)) view(d);
    };
    function range() {
      const {P, pi} = ctx(), total = App.Live.length(P,P.sel.t,pi), width = 4 * App.spb(P);
      if (pagePattern !== pi) { pagePattern = pi; page = 0; }
      page = clamp(page, 0, Math.ceil(total / width) - 1);
      const start = page * width;
      return { start, end: Math.min(total, start + width) };
    }
    function turnPage(delta) {
      if (act) cancelGesture();
      App.Automation.cancel();
      if (App.Seq.playing && followTransport) { followTransport = false; UI.msg("VIEW HOLDS THIS PAGE · FOLLOW TURNS IT WITH THE PLAYHEAD AGAIN"); }
      page += delta; hov = null; rd.textContent = ""; sync();
    }
    function euclid() {
      const row = () => R.find((o) => o.n === rowNote) || R[R.length - 1];
      const dk = (k, l, name, min, max) => App.N(k, l, name, min, max, { k: 4, n: 16, r: 0 }[k], { int: 1 });
      const go = btn("", "WRITE THE RHYTHM · REPLACES THIS ROW", () => {
        UI.closeMenu();
        const o = row();
        edit((c) => {
          const n = App.Live.length(c.P,c.ti,c.pi), N = Math.max(1, eu.n), K = Math.min(eu.k, N);
          for (let i = c.clip.length - 1; i >= 0; i--) if (c.clip[i].n === o.n && c.clip[i].s < n) c.clip.splice(i, 1);
          for (let s = 0; s < n; s++) if ((((s % N) + eu.r) % N * K) % N < K) c.clip.push({ s, n: o.n, l: 1, v: pen.v, p: pen.p, ...(pen.r > 1 ? { r: pen.r } : {}) });
        });
      });
      const lab = () => (go.textContent = "WRITE ROW " + row().label);
      lab();
      UI.pop(hd.euc, h("div.eu", null,
        UI.param(dk("k", "HITS", "EUCLID · NUMBER OF HITS", 0, 64), eu), UI.param(dk("n", "STEPS", "EUCLID · CYCLE LENGTH IN STEPS", 1, 64), eu),
        UI.param(dk("r", "ROTATE", "EUCLID · ROTATION", 0, 63), eu), go));
    }

    /* ── geometry + drawing (device pixels, so every line lands on the pixel grid) ── */
    function geo() {
      D = UI.fit(cv); W = cv.width; H = cv.height;
      const rem = App.rem * D;
      const compactRow = parseFloat(getComputedStyle(cv).getPropertyValue("--pitch-row-height"));
      const laneHeight = compactRow ? Math.min(5.6 * rem, 38 * D) : 5.6 * rem;
      G = { rem, gx: Math.round(7.4 * rem), ry: Math.round(1.8 * rem), lh: Math.round(laneHeight), L: Math.max(1, Math.round(D)) };
      G.gw = W - G.gx; G.ly = H - G.lh; G.gh = G.ly - G.ry;
      G.rows = compactRow ? clamp(Math.floor(G.gh / (compactRow * D)), 12, ROWS) : ROWS;
    }

    function draw() {
      if (!cx || !cv.clientWidth || !cv.clientHeight) return;
      geo();
      const { P, T, clip, pi } = ctx(), C = App.C, L = G.L, rem = G.rem;
      if (selection.size && !act) {
        const available = new Set(clip), previous = selection.size;
        for (const nt of selection) if (!available.has(nt)) selection.delete(nt);
        if (previous !== selection.size) updateSelection();
      }
      const steps = App.Live.length(P,P.sel.t,pi), SPB = App.spb(P), BS = App.beatSteps(P);
      const { start, end } = range();
      R = rowList();
      const nr = R.length, cw = (G.cw = G.gw / (end - start)), rh = (G.rh = G.gh / nr), keys = isKeys(T);
      G.steps = steps; G.start = start; G.end = end;
      const X = (s) => G.gx + Math.round((s - start) * cw), Y = (r) => G.ry + Math.round(r * rh);
      cx.fillStyle = C.pn; cx.fillRect(0, 0, W, H);

      // row bands: scale membership is the only thing shading encodes
      for (let r = 0; r < nr; r++) {
        const o = R[r];
        cx.fillStyle = keys ? (o.root ? C.r3 : o.out ? C.r0 : o.black ? C.r1 : C.r2) : r % 2 ? C.r1 : C.r2;
        cx.fillRect(G.gx, Y(r), G.gw, Y(r + 1) - Y(r));
      }
      if (hov && (hov.zone === "grid" || hov.zone === "lane")) {
        cx.fillStyle = C.hv;
        cx.fillRect(X(hov.step), G.ry, X(hov.step + 1) - X(hov.step), H - G.ry);
        if (hov.zone === "grid") cx.fillRect(G.gx, Y(hov.row), G.gw, Y(hov.row + 1) - Y(hov.row));
      }
      for (let r = 1; r < nr; r++) {
        cx.fillStyle = keys && App.pc(R[r].n) === 11 ? C.ln2 : C.ln;
        cx.fillRect(G.gx, Y(r), G.gw, L);
      }
      for (let s = start; s <= end; s++) {
        cx.fillStyle = s % SPB === 0 ? C.ln3 : s % BS === 0 ? C.ln2 : C.ln;
        cx.fillRect(Math.min(W - L, X(s)), G.ry, L, H - G.ry);
      }

      // ruler
      cx.textBaseline = "middle"; cx.textAlign = "left";
      cx.font = `500 ${Math.round(rem)}px ${App.FONT}`;
      for (let s = start; s < end; s += BS) {
        const beat = (s % SPB) / BS;
        cx.fillStyle = beat ? C.t3 : C.t1;
        cx.fillText(beat ? "." + (beat + 1) : String(Math.floor(s / SPB) + 1), X(s) + 0.45 * rem, G.ry / 2 + L);
      }

      // gutter
      const fs = Math.round(Math.min(1.05 * rem, rh * 0.86)), every = rh >= 0.9 * rem, mark = Math.max(2 * L, Math.round(0.4 * rem));
      cx.font = `500 ${fs}px ${App.FONT}`;
      for (let r = 0; r < nr; r++) {
        const o = R[r], y = Y(r), hh = Y(r + 1) - y, pick = o.pad != null && o.pad === P.sel.pad, hot = hov && hov.row === r && hov.zone !== "lane";
        const on = lit.has(o.n) || live.has(o.n);
        if (pick || (keys && !o.black)) { cx.fillStyle = C.r3; cx.fillRect(0, y + L, G.gx - L, hh - L); }
        if (pick) { cx.fillStyle = C.am; cx.fillRect(0, y + L, mark, hh - L); } // selected pad: same amber edge as the selected track
        if (on) { cx.fillStyle = C.am; cx.fillRect(G.gx - L - mark, y + L, mark, hh - L); } // lamp: this row is sounding now
        if (!keys || every || on || o.root || App.pc(o.n) === 0) {
          cx.fillStyle = on || hot ? C.am : pick || o.root ? C.t1 : o.out ? C.ln3 : C.t2;
          cx.fillText(o.label, (keys ? 0.7 : 1.1) * rem, y + hh / 2 + L);
        }
      }
      cx.fillStyle = C.ln2;
      cx.fillRect(G.gx - L, 0, L, H); cx.fillRect(0, G.ry - L, W, L); cx.fillRect(0, G.ly, W, L);

      // notes
      const idx = new Map(R.map((o, r) => [o.n, r])), top = R[0].n, edge = Math.max(2, Math.round(2 * D));
      const laneV = new Map();
      for (const nt of clip) {
        if (nt.s >= end || nt.s + nt.l <= start) continue;
        const val = laneValue(nt);
        if (nt.s >= start && (!selection.size || selection.has(nt)) && !(laneV.get(nt.s) >= val)) laneV.set(nt.s, val);
        const r = idx.get(nt.n), x = X(Math.max(start, nt.s)) + L + (nt.s >= start ? Math.round((nt.off || 0) * cw) : 0), w = Math.max(edge + L, X(Math.min(end, nt.s + nt.l)) - X(Math.max(start, nt.s)) - L);
        if (r == null) { // outside the visible rows: a tick on the edge it lies beyond
          cx.fillStyle = C.am;
          cx.fillRect(x, (keys ? nt.n > top : nt.n < top) ? G.ry + L : G.ly - 3 * L, w, 2 * L);
          continue;
        }
        const rowH = Y(r + 1) - Y(r) - L, hh = keys ? rowH : Math.min(rowH, Math.round(1.7 * rem)); // pad rows are tall, a hit is not
        const y = Y(r) + L + Math.round((rowH - hh) / 2), moving = selection.has(nt);
        cx.globalAlpha = moving ? 0.95 : (0.3 + 0.7 * nt.v) * (nt.p < 1 ? 0.45 : 1);
        cx.fillStyle = moving ? C.am : C.t2;
        cx.fillRect(x, y, w, hh);
        cx.globalAlpha = 1;
        cx.fillStyle = moving ? C.pn : C.t1;
        if(nt.when){cx.fillStyle=C.am;cx.fillRect(x,y,w,Math.min(2*D,hh));cx.fillStyle=moving?C.pn:C.t1;}
        if (nt.s >= start) cx.fillRect(x, y, edge, hh); // bright leading edge marks where the note starts
        if (nt.p < 1) { cx.fillRect(x, y, w, L); cx.fillRect(x, y + hh - L, w, L); }
      }

      // lane
      cx.fillStyle = C.t3;
      cx.font = `500 ${Math.round(rem)}px ${App.FONT}`;
      cx.fillText(laneTitle(), 0.7 * rem, G.ly + G.lh / 2);
      // A bar at its default is dim and one that was changed is bright, like every value on the console.
      const span = G.lh - 4 * L, base = lane === "r" ? 1 / 8 : NOTE[lane].def, room = cw >= 2.4 * rem;
      cx.textAlign = "left"; cx.textBaseline = "alphabetic";
      for (const [s, val] of laneV) {
        const x = X(s) + L, w = Math.max(2 * L, Math.min(X(s + 1) - X(s) - L, Math.round(1.6 * rem))), hh = Math.max(L, Math.round(span * val)), moved = Math.abs(val - base) > 1e-6;
        cx.globalAlpha = moved ? 0.5 : 0.22; cx.fillStyle = C.t2; cx.fillRect(x, H - hh, w, hh);
        cx.globalAlpha = 1; cx.fillStyle = moved ? C.t1 : C.t2; cx.fillRect(x, H - hh, w, 2 * L);
        if (room) cx.fillText(lane === "r" ? String(Math.round(val * 8)) : String(Math.round(val * 100)), x + w + 0.3 * rem, Math.max(G.ly + 1.1 * rem, Math.min(H - 0.35 * rem, H - hh + 0.9 * rem)));
      }
      cx.textBaseline = "middle";
      if (act?.mode === "box") {
        const x = Math.min(act.x0, act.x1), y = Math.min(act.y0, act.y1);
        const w = Math.abs(act.x1 - act.x0), h = Math.abs(act.y1 - act.y0);
        cx.fillStyle = C.hv; cx.fillRect(x, y, w, h);
        cx.strokeStyle = C.am; cx.lineWidth = G.L; cx.setLineDash([4 * D, 3 * D]);
        cx.strokeRect(x, y, w, h); cx.setLineDash([]);
      }
    }
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    function sync() {
      land();
      const { P, ti, pi, T } = ctx(), total=App.Live.length(P,ti,pi), bars=Math.ceil(total/App.spb(P)), keys=isKeys(T);
      const shape = T.kind + ":" + (T.kind === "smp" ? [T.smp.mode, T.smp.slices].join(":") : "");
      if (selectionClip !== T.clips[pi] || selectionShape !== shape) {
        if (act) cancelGesture(false);
        // Undo and redo swap the project, so the same notes are new objects. A selection on the same clip goes to the
        // notes the step changed (what came back, moved back or got its value back), else to the same notes as before.
        const here = ti + ":" + pi, sig = (nt) => [nt.s, nt.n, nt.l, nt.v, nt.p, nt.r || 1].join(":");
        let next = [];
        if (carry && selection.size && selectionAt === here && selectionShape === shape && selectionClip) {
          const before = new Set(selectionClip.map(sig)), kept = new Set([...selection].map(sig));
          next = T.clips[pi].filter((nt) => !before.has(sig(nt)));
          if (!next.length) next = T.clips[pi].filter((nt) => kept.has(sig(nt)));
        }
        selection = new Set(next); hov = null; rowNote = null; carry = false;
        selectionClip = T.clips[pi]; selectionShape = shape; selectionAt = here;
      } else {
        const existing = new Set(selectionClip), steps = App.Live.length(P,P.sel.t,pi);
        selection = new Set([...selection].filter(nt => existing.has(nt) && nt.s < steps));
      }
      updateSelection();
      hd.title.textContent = pad2(ti + 1) + " " + T.name + " / " + PATS[pi];
      const {start, end} = range(), barSteps = App.spb(P);
      hd.bars.textContent = (1 + start / barSteps) + "–" + Math.ceil(end / barSteps) + "/" + bars;
      hd.bars.dataset.tip = "BARS IN VIEW / PATTERN LENGTH · " + total + " STEPS, " + barSteps + " PER BAR";
      hd.prev.hidden = hd.next.hidden = hd.bars.hidden = bars <= 4;
      hd.len.paint(); hd.chord.paint(); hd.loop.paint();
      hd.loop.hidden = !P.performance.loops[ti][pi]; // shown while the clip has a loop of its own: LIVE… sets one, a right-click here removes it
      // Notes past the end of a shortened pattern are kept and not played: the header counts them.
      const parked = T.clips[pi].filter((nt) => nt.s >= total).length;
      hd.past.hidden = !parked; hd.past.textContent = "+" + parked + " PAST";
      hd.past.dataset.tip = parked + (parked === 1 ? " NOTE LIES" : " NOTES LIE") + " PAST THE END OF THIS PATTERN · KEPT, NOT PLAYED · LENGTHEN THE PATTERN TO GET THEM BACK";
      // Following the playhead is the rule; the switch appears while the view is held on a page, to give it back.
      hd.follow.hidden = bars <= 4 || followTransport; hd.follow.classList.toggle("on", followTransport); hd.follow.setAttribute("aria-pressed", String(followTransport));
      hd.follow.dataset.tip = "THE VIEW IS HELD ON THIS PAGE · CLICK = FOLLOW THE PLAYHEAD AGAIN";
      NOTE.l.max = Math.max(1, total);
      hd.prev.disabled = start === 0; hd.prev.dataset.why = "THESE ARE THE FIRST BARS";
      hd.next.disabled = end === App.Live.length(P,P.sel.t,pi); hd.next.dataset.why = "THESE ARE THE LAST BARS";
      hd.fold.classList.toggle("on", !!P.fold);
      for (const g of hd.pitched) g.hidden = !keys; // chords, octaves and the scale fold mean nothing on pads and slices
      App.Automation.sync();
      hd.lv.classList.toggle("on", lane === "v"); hd.lp.classList.toggle("on", lane === "p"); hd.lr.classList.toggle("on", lane === "r");
      litStep = -2;
      draw();
    }

    /* ── pointer ── */
    const at = (e) => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
      return {
        x, y,
        step: clamp(G.start + Math.floor((x - G.gx) / G.cw), G.start, G.end - 1),
        row: clamp(Math.floor((y - G.ry) / G.rh), 0, R.length - 1),
        zone: y >= G.ly ? (x >= G.gx ? "lane" : "") : y < G.ry ? "" : x < G.gx ? "gut" : "grid",
        val: clamp(1 - (y - G.ly - 2 * G.L) / (G.lh - 4 * G.L), 0, 1),
      };
    };
    // In overlapping imported or recorded material, the latest onset is the top note.
    const find = (clip, n, s) => {
      let hit;
      for (const nt of clip) if (nt.n === n && nt.s <= s && s < nt.s + nt.l && (!hit || hit.s <= nt.s)) hit = nt;
      return hit;
    };
    function carve(clip, placed) {
      const protectedNotes = new Set(placed);
      const ranges = new Map();
      for (const nt of [...placed].sort((a, b) => a.s - b.s)) {
        if (!ranges.has(nt.n)) ranges.set(nt.n, []);
        const row = ranges.get(nt.n), last = row[row.length - 1], end = nt.s + nt.l;
        if (last && nt.s <= last.end) last.end = Math.max(last.end, end);
        else row.push({ start: nt.s, end });
      }
      for (let i = clip.length - 1; i >= 0; i--) {
        const nt = clip[i];
        if (protectedNotes.has(nt)) continue;
        const overlap = ranges.get(nt.n)?.find(range => range.end > nt.s);
        if (!overlap || overlap.start >= nt.s + nt.l) continue;
        if (overlap.start <= nt.s) clip.splice(i, 1);
        else nt.l = overlap.start - nt.s;
      }
    }
    const hear = (n, v) => { const E = App.audio(); E && E.play(App.P.sel.t, n, v, 0, 0.22); };
    const pickPad = (o) => {
      const P = App.P;
      rowNote = o.n;
      if (o.pad != null && P.sel.pad !== o.pad) { P.sel.pad = o.pad; App.touch(); App.Dv.build(); }
    };
    function chooseTool(value) {
      if (act) cancelGesture(false);
      App.Automation.close();
      tool = value;
      updateSelection();
      cv.focus({ preventScroll: true });
      draw();
    }
    // Sets a value on the selected notes, or on the pen when none is selected. A length stops where the resize handle
    // would: at the next note on the same row and at the end of the clip, so nothing underneath is cut.
    function setValue(k, v) {
      land();
      if (!selection.size) { pen[k] = v; return; }
      const { clip } = ctx();
      for (const nt of selection) {
        if (k !== "l") { nt[k] = v; continue; }
        let room = Math.max(1, G.steps - nt.s);
        for (const other of clip) if (other !== nt && other.n === nt.n && other.s > nt.s) room = Math.min(room, other.s - nt.s);
        nt.l = clamp(v, 1, room);
      }
      // The pen follows the note last touched, as it does when a note is clicked or resized.
      let lead; for (lead of selection);
      if (k === "v") pen.v = v; else if (k === "l") pen.l = lead.l;
    }
    const paintValues = () => { for (const p of hd.vals) p.paint(); };
    function updateSelection() {
      hd.sel.textContent = selection.size ? "SELECTED" : "NEXT NOTE";
      hd.sel.dataset.tip = selection.size ? "THESE VALUES ARE THE SELECTED NOTES' · DRAG, WHEEL, TYPE · RIGHT-CLICK = BACK TO DEFAULT" : "NO NOTE SELECTED · THESE VALUES GO TO THE NEXT NOTE YOU DRAW · CLICK A NOTE TO SEE AND SET ITS OWN";
      hd.count.textContent = selection.size || "";
      hd.count.hidden = !selection.size;
      paintValues();
      for (const b of [hd.dup, hd.remove]) { b.disabled = !selection.size; b.dataset.why = "SELECT NOTES FIRST · CLICK ONE, SHIFT-CLICK MORE, OR CTRL/CMD A"; }
      const activeTool = App.Automation.active() ? "auto" : tool;
      for (const [b, value] of [[hd.draw, "draw"], [hd.select, "select"], [hd.auto, "auto"]]) {
        b.classList.toggle("on", value === activeTool);
        b.setAttribute("aria-pressed", String(value === activeTool));
      }
      cv.dataset.tool = tool;
    }
    function removeSelection() {
      if (!selection.size) return;
      edit(({ clip, ti }) => {
        for (let i = clip.length - 1; i >= 0; i--) if (selection.has(clip[i])) { App.E?.cutNote(ti, clip[i].n); clip.splice(i, 1); }
        selection.clear();
      });
    }
    function revealSelection() {
      if (!selection.size) return;
      const visible = range(), group = [...selection];
      if (group.some(nt => nt.s < visible.end && nt.s + nt.l > visible.start)) return;
      page = Math.floor(Math.min(...group.map(nt => nt.s)) / (4 * App.spb(App.P)));
      if (App.Seq.playing) followTransport = false;
    }
    async function duplicate() {
      if (!selection.size) return;
      const c = ctx(), group = [...selection];
      const start = Math.min(...group.map(nt => nt.s)), end = Math.max(...group.map(nt => nt.s + nt.l));
      // Copies keep their place in the beat: the distance is the span of the selection rounded up to whole beats.
      const beat = App.beatSteps(c.P), span = Math.max(beat, Math.ceil((end - start) / beat) * beat), last = end + span, bars = Math.ceil(last / App.spb(c.P));
      if (last > (c.P.performance.loops[c.ti][c.pi] ? App.MAX_STEPS : App.maxBars(c.P)*App.spb(c.P))) { UI.msg("NO ROOM AFTER SELECTION · MOVE NOTES EARLIER"); return; }
      const copies = group.map(nt => ({ ...nt, s: nt.s + span }));
      if (c.clip.length + copies.length > 4000) { UI.msg("CLIP LIMIT · 4,000 NOTES"); return; }
      const overlaps = c.clip.filter(nt => copies.some(copy =>
        copy.n === nt.n && nt.s < copy.s + copy.l && nt.s + nt.l > copy.s));
      if (overlaps.length) {
        const answer = await App.Workspace.decide({title:"Replace overlapping notes?",
          rows:[["Copies", String(copies.length)], ["Existing notes affected", String(overlaps.length)]],
          actions:[{id:"replace",label:"Replace overlaps",primary:true}]});
        if (answer !== "replace" || c.clip !== ctx().clip) return;
      }
      edit(({ clip, P, pi }) => {
        if(P.performance.loops[c.ti][pi])P.performance.loops[c.ti][pi]=Math.max(P.performance.loops[c.ti][pi],last);
        else if (bars > P.pats[pi].bars) { P.pats[pi].bars = bars; UI.msg("PATTERN " + PATS[pi] + " IS NOW " + bars + " BARS ON EVERY TRACK · UNDO REVERTS"); }
        carve(clip, copies); clip.push(...copies);
        selection = new Set(copies);
        revealSelection();
      });
    }
    function pitchRows() {
      const { P, T } = ctx();
      if (!isKeys(T)) return rowList().map(row => row.n);
      const used = P.fold ? new Set(ctx().clip.map((nt) => nt.n)) : null;
      return Array.from({ length: 128 }, (_, i) => 127 - i).filter(n => !P.fold || App.inScale(P, n) || used.has(n));
    }
    const originals = group => new Map([...group].map(nt => [nt, { ...nt }]));
    function shiftGroup(before, ds, dr, octave = false) {
      const order = pitchRows(), steps = App.Live.length(App.P,App.P.sel.t,App.P.sel.p);
      const source = [...before.values()];
      const stepMin = -Math.min(...source.map(nt => nt.s));
      const stepMax = Math.max(0, steps - Math.max(...source.map(nt => nt.s + nt.l)));
      ds = clamp(ds, stepMin, stepMax);
      if (dr) {
        if (octave && isKeys(ctx().T)) {
          if (source.some(nt => nt.n - dr * 12 < 0 || nt.n - dr * 12 > 127)) dr = 0;
        } else {
          const indices = source.map(nt => order.indexOf(nt.n));
          dr = indices.includes(-1) ? 0 : clamp(dr, -Math.min(...indices), order.length - 1 - Math.max(...indices));
          octave = false;
        }
      }
      let changed = false;
      for (const [nt, old] of before) {
        const n = !dr ? old.n : octave ? old.n - dr * 12 : order[order.indexOf(old.n) + dr];
        if (nt.s !== old.s + ds || nt.n !== n) changed = true;
        nt.s = old.s + ds; nt.n = n;
      }
      return changed;
    }
    function nudge(ds, dr, octave) {
      if (!selection.size || !shiftGroup(originals(selection), ds, dr, octave)) return;
      const { clip, T } = ctx();
      if (ds) revealSelection();
      if (dr && isKeys(T)) {
        const ordered = rowList(), pitches = [...selection].map(nt => nt.n);
        const above = Math.min(...pitches) - ordered[0].n;
        const below = Math.max(...pitches) - ordered[ordered.length - 1].n;
        if (above > 0 || below < 0) T.lo = clamp(ordered[ordered.length - 1].n + (above > 0 ? above : below), 0, 128 - (G.rows || ROWS));
      }
      // Still travelling: nothing is replaced and no undo step is written until the keys rest (see land).
      travelClip = clip;
      clearTimeout(travel); travel = setTimeout(land, 350);
      App.touch(); draw(); App.Mx.draw();
    }
    function shortcuts(e) {
      if (App.Automation.active() || e.target.closest?.("input, select, textarea, [contenteditable], [role=dialog], dialog") ||
          document.querySelector(".mn, .pop, dialog[open], [role=dialog]:not([hidden])") || e.altKey) return false;
      const mod = e.ctrlKey || e.metaKey;
      let command;
      if (!act && mod && e.code === "KeyA") command = () => {
        const { clip, P, pi } = ctx();
        const eligible = new Set(pitchRows()), steps = App.Live.length(P,P.sel.t,pi);
        selection = new Set(clip.filter(nt => nt.s < steps));
        updateSelection(); draw(); // the tool stays what it was: a selection works in DRAW too
        const off = [...selection].filter(nt => !eligible.has(nt.n)).length, past = clip.length - selection.size;
        UI.msg(selection.size + (selection.size === 1 ? " NOTE" : " NOTES") + " SELECTED" + (off ? " · " + off + " OF THEM OUTSIDE THE ROWS (DELETE REMOVES THEM)" : "") + (past ? " · " + past + " MORE LIE PAST THE END OF THE PATTERN" : ""));
      };
      if (!act && mod && e.code === "KeyD" && selection.size) command = duplicate;
      if (!mod && e.key === "Escape" && (act || selection.size)) command = () => {
        if (act) cancelGesture();
        else { land(); selection.clear(); updateSelection(); draw(); }
      };
      if (!act && !mod && selection.size) {
        const actions = {
          Delete: removeSelection, Backspace: removeSelection,
          ArrowLeft: () => nudge(e.shiftKey ? -App.beatSteps(App.P) : -1, 0),
          ArrowRight: () => nudge(e.shiftKey ? App.beatSteps(App.P) : 1, 0),
          ArrowUp: () => nudge(0, -1, e.shiftKey), ArrowDown: () => nudge(0, 1, e.shiftKey)
        };
        if (actions[e.key]) command = actions[e.key];
      }
      if (command) { e.preventDefault(); e.stopPropagation(); command(); }
      return !!command;
    }

    const laneTitle = () => lane === "v" ? "VELOCITY" : lane === "p" ? "PROBABILITY" : "REPEATS";
    const laneValue = nt => lane === "r" ? (nt.r || 1) / 8 : nt[lane];
    const laneText = (v) => (lane === "r" ? v + (v === 1 ? " HIT" : " HITS") : pct(v));
    const laneAt = (m) => (lane === "r" ? clamp(Math.ceil(m.val * 8), 1, 8) : lane === "p" ? Math.round(m.val * 20) / 20 : Math.max(0.02, Math.round(m.val * 100) / 100));
    // The notes a lane gesture at this step touches: those on the step, or only the selected ones among them.
    const laneNotes = (clip, step, all) => clip.filter((nt) => (all || nt.s === step) && (!selection.size || selection.has(nt)));
    const stepName = (s) => { const P = App.P, SPB = App.spb(P), BS = App.beatSteps(P); return Math.floor(s / SPB) + 1 + "." + (Math.floor((s % SPB) / BS) + 1) + "." + ((s % SPB) % BS + 1); };
    // What the readout says in the lane: the value the notes on this step really have, not where the pointer is.
    function readLane(m, setting) {
      const notes = laneNotes(ctx().clip, m.step, act?.all), vals = [...new Set(notes.map((nt) => noteVal(nt, lane)))].sort((a, b) => a - b);
      const has = !vals.length ? "NO NOTE" : vals.length === 1 ? laneText(vals[0]) : laneText(vals[0]).replace("%", "") + "-" + laneText(vals[vals.length - 1]);
      rd.textContent = stepName(m.step) + "   " + laneTitle() + " " + has + (setting || !vals.length ? "" : "   CLICK = " + laneText(laneAt(m)));
    }
    function setLane(m) {
      for (const nt of laneNotes(act.clip, m.step, act.all)) {
        const v = act.reset ? NOTE[lane].def : laneAt(m);
        if (noteVal(nt, lane) === v) continue;
        if (!act.old.has(nt)) act.old.set(nt, { ...nt });
        nt[lane] = v;
        if (lane === "v") pen.v = v;
        act.ch = true;
      }
      readLane(m, true);
    }
    // The wheel nudges the notes under the pointer: one finished run of the wheel is one undo step.
    function wheelLane(m, up, fine) {
      const notes = laneNotes(ctx().clip, m.step, false), d = NOTE[lane];
      if (!notes.length || act) return;
      land();
      for (const nt of notes) nt[lane] = lane === "r" ? clamp(noteVal(nt, "r") + (up ? 1 : -1), 1, 8) : clamp(Math.round((nt[lane] + (up ? 1 : -1) * (fine ? 0.01 : 0.05)) * 100) / 100, d.min, d.max);
      clearTimeout(laneT); laneT = setTimeout(() => { laneT = 0; App.commit(); App.Mx.draw(); }, 350);
      readLane(m, true); draw();
    }
    function begin(e, mode, props) {
      act = { mode, id: e.pointerId, clip: ctx().clip, previous: new Set(selection), old: new Map(), ...props };
      if (mode === "size") {
        const byPitch = [...act.old.values()].sort((a, b) => a.n - b.n || a.s - b.s);
        act.shortest = -Infinity; act.longest = Infinity;
        byPitch.forEach((nt, i) => {
          const next = byPitch[i + 1];
          const end = next?.n === nt.n && next.s > nt.s ? next.s : G.steps;
          act.shortest = Math.max(act.shortest, 1 - nt.l);
          act.longest = Math.min(act.longest, Math.max(0, end - nt.s - nt.l));
        });
      }
      cv.setPointerCapture(e.pointerId);
    }
    function cancelGesture(paint = true) {
      land();
      const a = act;
      if (!a) return;
      act = null;
      if (a.mode === "key") { App.E?.noteOff(a.ti, a.n); key(a.n, false); }
      if (a.created) for (const nt of a.grp) { const i = a.clip.indexOf(nt); if (i >= 0) a.clip.splice(i, 1); }
      if (a.erased) for (const nt of a.erased) if (!a.clip.includes(nt)) a.clip.push(nt);
      for (const [nt, old] of a.old) {
        if (!("r" in old)) delete nt.r;
        Object.assign(nt, old);
      }
      if (a.erased?.size) a.clip.sort((x, y) => x.s - y.s || x.n - y.n);
      selection = a.previous;
      if (cv.hasPointerCapture(a.id)) cv.releasePointerCapture(a.id);
      if (paint) { updateSelection(); draw(); }
    }
    function cancelPointer(e) { if (act && e.pointerId === act.id) cancelGesture(); }
    function erase(m) {
      if (m.zone !== "grid") return;
      const nt = find(act.clip, R[m.row].n, m.step);
      if (!nt) return;
      act.clip.splice(act.clip.indexOf(nt), 1); act.erased.add(nt);
      App.E?.cutNote(App.P.sel.t, nt.n); // what it was sounding stops with it
      selection.delete(nt); act.ch = true;
    }
    function box(m) {
      act.x1 = clamp(m.x, G.gx, W); act.y1 = clamp(m.y, G.ry, G.ly);
      const left = G.start + (Math.min(act.x0, act.x1) - G.gx) / G.cw;
      const right = G.start + (Math.max(act.x0, act.x1) - G.gx) / G.cw;
      const low = Math.min(act.y0, act.y1), high = Math.max(act.y0, act.y1);
      const pitches = new Set(R.filter((_, row) => G.ry + row * G.rh < high && G.ry + (row + 1) * G.rh > low).map(o => o.n));
      selection = act.add ? new Set(act.previous) : new Set();
      for (const nt of act.clip) if (pitches.has(nt.n) && nt.s < right && nt.s + nt.l > left) selection.add(nt);
      updateSelection();
    }

    function down(e) {
      if (act || !e.isPrimary || (e.button !== 0 && e.button !== 2)) return;
      land();
      const m = at(e), { P, ti, T, clip } = ctx();
      UI.closeMenu();
      if (!m.zone) return;
      e.preventDefault(); cv.focus({ preventScroll: true });
      if (m.zone === "lane") { // left = set, right = back to the default; either can be dragged across steps
        begin(e, "lane", { all: e.shiftKey && selection.size > 0, reset: e.button === 2 }); setLane(m); draw();
        return;
      }
      const o = R[m.row];
      if (m.zone === "gut") {
        if (e.button === 0) {
          pickPad(o); begin(e, "key", { n: o.n, ti }); App.audio()?.noteOn(ti, o.n, 0.85); key(o.n, true); draw();
        }
        return;
      }
      const hit = find(clip, o.n, m.step);
      if (e.button === 2) { begin(e, "erase", { erased: new Set() }); erase(m); updateSelection(); draw(); return; }
      if (e.shiftKey && hit) {
        if (selection.has(hit)) selection.delete(hit); else selection.add(hit);
        updateSelection(); draw(); return;
      }
      if (!hit && (tool === "select" || e.shiftKey)) {
        begin(e, "box", { x0: m.x, x1: m.x, y0: m.y, y1: m.y, add: e.shiftKey });
        if (!e.shiftKey) selection.clear();
        updateSelection(); draw(); return;
      }
      pickPad(o);
      if (hit) {
        const grab = Math.min(G.cw * 0.34, 0.8 * G.rem);
        const tail = Math.min(hit.s + hit.l, G.steps); // a note that runs past the clip is grabbed where the clip ends
        const resize = tail <= G.end && m.x >= G.gx + (tail - G.start) * G.cw - grab;
        const group = selection.has(hit) ? [...selection] : [hit];
        begin(e, resize ? "size" : "move", { note: hit, grp: group, old: originals(group), st0: m.step, r0: m.row });
        selection = new Set(group); pen.l = hit.l; pen.v = hit.v;
        hear(hit.n, hit.v);
      } else {
        const group = App.chordNotes(P, o.n, isKeys(T) ? chordSize() : 1).filter(n => n <= 127)
          .map(n => ({ s: m.step, n, l: Math.min(pen.l, G.steps - m.step), v: pen.v, p: pen.p, r: pen.r }));
        begin(e, "size", { note: group[0], grp: group, old: originals(group), st0: m.step, created: true, ch: true });
        selection.clear();
        for (const nt of group) { clip.push(nt); hear(nt.n, nt.v); }
      }
      updateSelection(); draw();
    }
    function move(e) {
      const m = at(e);
      if (!act) { hover(m); return; }
      if (act.id !== e.pointerId) return;
      if (act.clip !== ctx().clip) { cancelGesture(); return; }
      if (act.mode === "lane") { if (m.zone === "lane") setLane(m); }
      else if (act.mode === "box") box(m);
      else if (act.mode === "erase") { erase(m); updateSelection(); }
      else if (act.mode === "size") {
        let delta = m.step - act.st0;
        if (act.created && delta) delta = Math.max(1, m.step - act.note.s + 1) - act.old.get(act.note).l;
        delta = clamp(delta, act.shortest, act.longest);
        for (const [nt, old] of act.old) nt.l = old.l + delta;
        act.ch = act.created || delta !== 0;
      } else if (act.mode === "move") {
        const previous = act.note.n;
        shiftGroup(act.old, m.step - act.st0, m.row - act.r0);
        if (act.note.n !== previous) hear(act.note.n, act.note.v);
        act.ch = act.grp.some(nt => nt.n !== act.old.get(nt).n || nt.s !== act.old.get(nt).s);
      }
      draw();
    }
    function up(e) {
      if (!act || act.id !== e.pointerId) return;
      const a = act;
      if (a.clip !== ctx().clip) { cancelGesture(); return; }
      act = null;
      if (a.mode === "key") { App.E?.noteOff(a.ti, a.n); key(a.n, false); }
      if (a.ch) {
        if (a.grp) {
          const available = new Set(a.clip);
          carve(a.clip, a.grp.filter(nt => available.has(nt))); pen.l = a.note.l;
        }
        a.clip.sort((x, y) => x.s - y.s || x.n - y.n);
        App.commit(); App.Mx.draw();
      }
      updateSelection(); hover(at(e));
    }

    function hover(m) {
      hov = m.zone ? m : null;
      if (!hov) { rd.textContent = ""; UI.hint(null); later(); return; }
      const { P, clip } = ctx(), SPB = App.spb(P), BS = App.beatSteps(P), s = m.step, o = R[m.row];
      const where = Math.floor(s / SPB) + 1 + "." + (Math.floor((s % SPB) / BS) + 1) + "." + ((s % SPB) % BS + 1);
      const sounding = clip.filter((nt) => nt.s <= s && s < nt.s + nt.l).map((nt) => nt.n);
      const chordTxt = o.pad == null && !o.slice ? App.chordName(sounding) : "";
      if (m.zone === "gut") { rd.textContent = o.label; UI.hint(o.label + "    CLICK = PLAY" + (o.pad != null ? " + SELECT PAD · DOUBLE-CLICK = RENAME · DROP AUDIO FILE = LOAD" : "")); }
      else if (m.zone === "lane") {
        readLane(m);
        UI.hint(laneTitle() + " AT STEP " + where + "    DRAG = SET · RIGHT-CLICK = BACK TO " + laneText(NOTE[lane].def) + " · WHEEL = NUDGE · SHIFT = FINE" + (selection.size ? " · SHIFT-DRAG = THE WHOLE SELECTION" : " · SELECT A NOTE TO TYPE ITS VALUES ABOVE"));
      } else {
        const rule=clip.find(nt=>nt.n===o.n && nt.s<=s && s<nt.s+nt.l && nt.when)?.when;
        const label=rule ? "   "+(rule.every>1?"PASS "+rule.phase+"/"+rule.every:"")+(rule.fill===1?" FILL":rule.fill===-1?" NO FILL":""):"";
        const under = clip.find(nt => nt.n === o.n && nt.s <= s && s < nt.s + nt.l), late = under?.off ? "   " + (under.off > 0 ? "+" : "") + Math.round(under.off * 15000 / P.bpm) + " MS OFF THE GRID" : "";
        rd.textContent = where + "   " + o.label + (chordTxt ? "   " + chordTxt : "")+label+late;
        UI.hint(tool === "select" ? "DRAG EMPTY SPACE = SELECT · SHIFT-CLICK = ADD / REMOVE · DRAG NOTES = MOVE · CTRL/CMD D = DUPLICATE" : "CLICK = NOTE · DRAG RIGHT = LENGTH · SHIFT-CLICK = SELECT · DRAG NOTE = MOVE · NOTE END = RESIZE · RIGHT-CLICK = DELETE");
      }
      later();
    }

    function rename(e) {
      const m = at(e), o = R[m.row], { T } = ctx();
      if (m.zone !== "gut" || o.pad == null) return;
      const r = cv.getBoundingClientRect(), pd = T.kit.pads[o.pad];
      UI.edit({ left: r.left, top: r.top + (G.ry + m.row * G.rh) * r.height / H, width: G.gx * r.width / W, height: G.rh * r.height / H }, pd.name, (s) => {
        pd.name = s.toUpperCase().slice(0, 8);
        App.commit();
        draw(); App.Dv.build();
      }, 8);
    }

    const lamps = () => { const all = new Set(lit); for (const n of live) all.add(n); App.Dv.hit(all); later(); };
    // A key or MIDI note went down or up on the selected track.
    const key = (n, on) => { if (on) live.add(n); else live.delete(n); lamps(); };

    function frame(c) {
      if (c?.lanes) {
        const lane = c.lanes[App.P.sel.t];
        c = lane ? {...c, pat:lane.p, step:lane.s} : null;
      }
      const { P, pi, clip } = ctx(), step = c && c.pat === pi ? c.step : -1;
      if (followTransport && !act && !App.Automation.active() && step >= 0 && (step < G.start || step >= G.end)) {
        const nextPage = Math.floor(step / (4 * App.spb(P)));
        if (page !== nextPage) { page = nextPage; hov = null; sync(); }
      }
      App.Automation.frame(c);
      if (step !== litStep) {
        litStep = step;
        const next = new Set();
        if (step >= 0) for (const nt of clip) if (nt.s <= step && step < nt.s + nt.l) next.add(nt.n);
        if (next.size || lit.size) { lit = next; lamps(); }
      }
      if (!c || c.pat !== pi || !G.cw || c.step < G.start || c.step >= G.end) { if (ph.style.display !== "none") ph.style.display = "none"; return; }
      const f = c.step + clamp((App.E.ctx.currentTime - c.t) / c.sd, 0, 1);
      ph.style.display = "block";
      ph.style.transform = `translateX(${(G.gx + (Math.min(f, G.end) - G.start) * G.cw) / D}px)`;
    }

    function reset() {
      cancelGesture(false); App.Automation.reset();
      page = 0; pagePattern = -1; followTransport = true;
      cancelAnimationFrame(raf); raf = 0;
      selection.clear(); selectionClip = null; selectionShape = "";
      tool = "draw"; lane = "v"; Object.assign(pen, { v: 0.8, p: 1, r: 1, l: 1, chord: 0 });
      rowNote = null; wheel = 0; hov = null;
      eu.k = 4; eu.n = 16; eu.r = 0;
      live.clear(); lit.clear(); litStep = -2;
      App.Dv.hit(lit);
      if (ph) ph.style.display = "none";
      if (rd) rd.textContent = "";
      UI.hint(null);
      if (cv) sync();
    }

    // A pitch that is played, recorded or captured outside the rows comes into view.
    function reveal(n) {
      const { T } = ctx();
      if (!isKeys(T) || act || R.some((o) => o.n === n)) return;
      T.lo = clamp(n - Math.floor((G.rows || ROWS) / 2), 0, 128 - (G.rows || ROWS));
      hov = null; App.touch(); draw();
    }
    // Where a cell of the grid is on screen (inside its left third, mid height), for tools and tests that click it.
    const cellAt = (step, row) => {
      const r = cv.getBoundingClientRect();
      return { x: r.left + ((G.gx + (step - G.start + 0.3) * G.cw) / W) * r.width, y: r.top + ((G.ry + (row + 0.5) * G.rh) / H) * r.height };
    };
    return { build, sync, draw, frame, key, reset, range, settle: land, cellAt, keys: shortcuts, reveal, keep() { carry = true; }, selected: () => new Set(selection),
      cancel() { cancelGesture(); App.Automation.cancel(); } };
  })();
})();
