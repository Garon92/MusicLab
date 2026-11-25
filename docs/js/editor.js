/* MUSICLAB · editor — one note grid for every instrument (keys, drum pads, sample slices) */
(() => {
  "use strict";
  const { clamp, pad2, PATS } = App, UI = App.UI, { h, btn } = UI;
  const ROWS = 24;

  App.Ed = (() => {
    let cv, cx, ph, rd, hd = {}, W = 0, H = 0, D = 1, R = [], G = {}, hov = null, act = null, raf = 0, wheel = 0;
    let lane = "v", chord = 1, lastLen = 1, lastVel = 0.8, rowNote = null;
    let page = 0, pagePattern = -1, followTransport = true;
    let tool = "draw", selection = new Set(), selectionClip = null, selectionShape = "";
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
      const pitches = Array.from({ length: 128 }, (_, n) => n).filter(n => !P.fold || App.inScale(P, n));
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
      hd.bars = h("span.ed-page", {title:"Visible bars / pattern length", tip:"VISIBLE BARS / PATTERN LENGTH · SET LENGTH IN PHRASE"});
      hd.dn = btn("↓", "TRANSPOSE CLIP DOWN · SHIFT = OCTAVE", (e) => transpose(e.shiftKey ? -12 : -1));
      hd.up = btn("↑", "TRANSPOSE CLIP UP · SHIFT = OCTAVE", (e) => transpose(e.shiftKey ? 12 : 1));
      hd.ch = [1, 3, 4].map((n) => btn(String(n), "NOTES PER CLICK · " + (n === 1 ? "SINGLE NOTE" : n === 3 ? "TRIAD IN SCALE" : "SEVENTH CHORD IN SCALE"), () => { chord = n; sync(); }));
      hd.fold = btn("FOLD", "SHOW ONLY NOTES OF THE SCALE", () => { App.P.fold ^= 1; App.touch(); sync(); });
      hd.od = btn("-", "VIEW ONE OCTAVE DOWN · WHEEL OVER GRID = SCROLL PITCH", () => view(-12));
      hd.ou = btn("+", "VIEW ONE OCTAVE UP · WHEEL OVER GRID = SCROLL PITCH", () => view(12));
      hd.draw = btn("DRAW", "CLICK TO DRAW · SHIFT-CLICK TO SELECT NOTES", () => chooseTool("draw"));
      hd.select = btn("SELECT", "CLICK NOTES OR DRAG A BOX IN EMPTY SPACE · SHIFT ADDS TO THE SELECTION", () => chooseTool("select"));
      hd.auto = btn("AUTOMATION", "EDIT PARAMETER AUTOMATION FOR THIS CLIP", () => {
        cancelGesture();
        App.Automation.open();
        updateSelection();
      });
      hd.count = h("span.ed-count", { "aria-live": "polite" });
      hd.remove = btn("DEL", "DELETE SELECTED NOTES · DELETE OR BACKSPACE", removeSelection);
      hd.dup = btn("DUP", "DUPLICATE SELECTED NOTES AFTER THE SELECTION · CTRL/CMD D", duplicate);
      hd.nudge = [
        btn("←", "MOVE SELECTED NOTES ONE STEP EARLIER · LEFT", () => nudge(-1, 0)),
        btn("→", "MOVE SELECTED NOTES ONE STEP LATER · RIGHT", () => nudge(1, 0)),
        btn("↓", "MOVE SELECTED NOTES ONE ROW DOWN · SHIFT = OCTAVE", (e) => nudge(0, 1, e.shiftKey)),
        btn("↑", "MOVE SELECTED NOTES ONE ROW UP · SHIFT = OCTAVE", (e) => nudge(0, -1, e.shiftKey))
      ];
      hd.lr = btn("RPT", "REPEATS PER STEP · 1–8 HITS", () => { lane = "r"; sync(); });
      hd.lv = btn("VEL", "LANE SHOWS NOTE VELOCITY", () => { lane = "v"; sync(); });
      hd.lp = btn("PROB", "LANE SHOWS NOTE PROBABILITY · BELOW 100% A NOTE PLAYS BY CHANCE", () => { lane = "p"; sync(); });
      hd.euc = btn("EUCLID", "SPREAD N HITS EVENLY OVER A CYCLE ON THE LAST TOUCHED ROW", () => euclid());
      rd = h("span.rd");
      el.append(h("div.hd.ed-tools", null,
        h("span.tg", { text: "EDIT" }), hd.title,
        h("span.grp", { role: "group", "aria-label": "Editing tool" }, hd.draw, hd.select, hd.auto),
        h("span.grp.ed-pages", {role:"group", "aria-label":"Visible bars"}, h("span.tg", {text:"BARS"}), hd.prev, hd.bars, hd.next),
        h("span.grp", null, h("span.tg", { text: "CHORD" }), hd.ch),
        h("span.grp", null, h("span.tg", { text: "VIEW" }), hd.od, hd.ou, hd.fold),
        h("span.grp", null, h("span.tg", { text: "LANE" }), hd.lv, hd.lp, hd.lr), h("span.sp"), rd),
      h("div.hd.ed-actions", null,
        h("span.grp", null, h("span.tg", { text: "NOTES" }), hd.count, hd.nudge, hd.dup, hd.remove),
        h("span.grp", null, h("span.tg", { text: "CLIP" }),
          btn("<", "SHIFT CLIP ONE STEP EARLIER", () => rotate(-1)), btn(">", "SHIFT CLIP ONE STEP LATER", () => rotate(1)), hd.dn, hd.up, hd.euc,btn("CYCLES","INDEPENDENT PITCH, ACCENT AND GATE CLOCKS · AUDITION AND PRINT",()=>App.Cycles.open()),btn("GROOVE","GROOVE TEMPLATE · NOTE TIMING · RECORD QUANTIZATION",()=>App.Groove.open()),btn("RULES","NOTE CONDITIONS, RANDOM SEED AND PRINTING A PLAYED PASS",()=>App.Rules.open()),App.Rules.fillButton())));
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
        const { T } = ctx();
        if (!isKeys(T) || act) return;
        wheel += e.deltaY || e.deltaX; // with SHIFT held, browsers report the wheel on the X axis
        if (Math.abs(wheel) < 40) return;
        view((wheel < 0 ? 1 : -1) * (e.shiftKey ? 12 : 2));
        wheel = 0;
      }, { passive: false });
    }

    /* ── clip operations ── */
    const edit = (fn) => { const c = ctx(); fn(c); c.clip.sort((a, b) => a.s - b.s || a.n - b.n); App.commit(); sync(); App.Mx.sync(); };
    const view = (d) => {
      const { T } = ctx(), visible = rowList();
      T.lo = clamp(visible[visible.length - 1].n + d, 0, 128 - (G.rows || ROWS));
      hov = null; App.touch(); draw();
    };
    const rotate = (d) => edit((c) => { const n = App.Live.length(c.P,c.ti,c.pi); for (const nt of c.clip) if (nt.s < n) nt.s = (nt.s + d + n) % n; });
    const transpose = (d) => {
      const c = ctx();
      if (!isKeys(c.T) || !c.clip.length) return;
      if (c.clip.some((nt) => nt.n + d < 0 || nt.n + d > 127)) return;
      edit((x) => { for (const nt of x.clip) nt.n += d; });
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
      if (App.Seq.playing) followTransport = false;
      page += delta; hov = null; rd.textContent = ""; sync();
    }
    function euclid() {
      const row = () => R.find((o) => o.n === rowNote) || R[R.length - 1];
      const dk = (k, l, name, min, max) => App.N(k, l, name, min, max, eu[k], { int: 1 });
      const go = btn("", "WRITE THE RHYTHM · REPLACES THIS ROW", () => {
        UI.closeMenu();
        const o = row();
        edit((c) => {
          const n = App.Live.length(c.P,c.ti,c.pi), N = Math.max(1, eu.n), K = Math.min(eu.k, N);
          for (let i = c.clip.length - 1; i >= 0; i--) if (c.clip[i].n === o.n && c.clip[i].s < n) c.clip.splice(i, 1);
          for (let s = 0; s < n; s++) if ((((s % N) + eu.r) % N * K) % N < K) c.clip.push({ s, n: o.n, l: 1, v: lastVel, p: 1 });
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
        const r = idx.get(nt.n), x = X(Math.max(start, nt.s)) + L, w = Math.max(edge + L, X(Math.min(end, nt.s + nt.l)) - x);
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
      const span = G.lh - 4 * L;
      for (const [s, val] of laneV) {
        const x = X(s) + L, w = Math.max(2 * L, Math.min(X(s + 1) - X(s) - L, Math.round(1.6 * rem))), hh = Math.max(L, Math.round(span * val));
        cx.globalAlpha = 0.4; cx.fillStyle = C.t2; cx.fillRect(x, H - hh, w, hh);
        cx.globalAlpha = 1; cx.fillStyle = C.t1; cx.fillRect(x, H - hh, w, 2 * L);
      }
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
      const { P, ti, pi, T } = ctx(), total=App.Live.length(P,ti,pi), bars=Math.ceil(total/App.spb(P)), keys=isKeys(T);
      const shape = T.kind + ":" + (T.kind === "smp" ? [T.smp.mode, T.smp.slices].join(":") : "");
      if (selectionClip !== T.clips[pi] || selectionShape !== shape) {
        if (act) cancelGesture(false);
        selection.clear(); hov = null; rowNote = null;
        selectionClip = T.clips[pi]; selectionShape = shape;
      } else {
        const existing = new Set(selectionClip), steps = App.Live.length(P,P.sel.t,pi);
        selection = new Set([...selection].filter(nt => existing.has(nt) && nt.s < steps));
      }
      updateSelection();
      hd.title.textContent = pad2(ti + 1) + " " + T.name + " / " + PATS[pi];
      const {start, end} = range(), barSteps = App.spb(P);
      hd.bars.textContent = bars <= 4 ? String(bars) : (1 + start / barSteps) + "–" + Math.ceil(end / barSteps) + "/" + bars;
      hd.bars.title=total+" steps · "+barSteps+" steps per bar";
      hd.prev.hidden = hd.next.hidden = bars <= 4;
      hd.prev.disabled = start === 0;
      hd.next.disabled = end === App.Live.length(P,P.sel.t,pi);
      hd.ch.forEach((b, i) => { b.classList.toggle("on", [1, 3, 4][i] === chord); b.disabled = !keys; });
      hd.fold.classList.toggle("on", !!P.fold);
      for (const b of [hd.fold, hd.od, hd.ou, hd.dn, hd.up]) b.disabled = !keys;
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
    function updateSelection() {
      hd.count.textContent = selection.size;
      hd.count.title = selection.size + " selected";
      for (const b of [...hd.nudge, hd.dup, hd.remove]) b.disabled = !selection.size;
      const activeTool = App.Automation.active() ? "auto" : tool;
      for (const [b, value] of [[hd.draw, "draw"], [hd.select, "select"], [hd.auto, "auto"]]) {
        b.classList.toggle("on", value === activeTool);
        b.setAttribute("aria-pressed", String(value === activeTool));
      }
      cv.dataset.tool = tool;
    }
    function removeSelection() {
      if (!selection.size) return;
      edit(({ clip }) => {
        for (let i = clip.length - 1; i >= 0; i--) if (selection.has(clip[i])) clip.splice(i, 1);
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
      const span = end - start, last = end + span, bars = Math.ceil(last / App.spb(c.P));
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
        else P.pats[pi].bars = Math.max(P.pats[pi].bars, bars);
        carve(clip, copies); clip.push(...copies);
        selection = new Set(copies);
        revealSelection();
      });
    }
    function pitchRows() {
      const { P, T } = ctx();
      if (!isKeys(T)) return rowList().map(row => row.n);
      return Array.from({ length: 128 }, (_, i) => 127 - i).filter(n => !P.fold || App.inScale(P, n));
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
      edit(({ clip, T }) => {
        carve(clip, selection);
        if (ds) revealSelection();
        if (!dr || !isKeys(T)) return;
        const ordered = rowList(), pitches = [...selection].map(nt => nt.n);
        const above = Math.min(...pitches) - ordered[0].n;
        const below = Math.max(...pitches) - ordered[ordered.length - 1].n;
        if (above > 0 || below < 0) T.lo = clamp(ordered[ordered.length - 1].n + (above > 0 ? above : below), 0, 128 - (G.rows || ROWS));
      });
    }
    function shortcuts(e) {
      if (App.Automation.active() || e.target.closest("input, select, textarea, [contenteditable], [role=dialog], dialog") ||
          document.querySelector(".mn, .pop, dialog[open], [role=dialog]:not([hidden])") || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      let command;
      if (!act && mod && e.code === "KeyA") command = () => {
        const { clip, P, pi } = ctx();
        const eligible = new Set(pitchRows());
        selection = new Set(clip.filter(nt => nt.s < App.Live.length(P,P.sel.t,pi) && eligible.has(nt.n)));
        chooseTool("select");
      };
      if (!act && mod && e.code === "KeyD" && selection.size) command = duplicate;
      if (!mod && e.key === "Escape" && (act || selection.size)) command = () => {
        if (act) cancelGesture();
        else { selection.clear(); updateSelection(); draw(); }
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
    }

    const laneTitle = () => lane === "v" ? "VELOCITY" : lane === "p" ? "PROBABILITY" : "REPEATS";
    const laneValue = nt => lane === "r" ? (nt.r || 1) / 8 : nt[lane];
    function setLane(m) {
      for (const nt of act.clip) {
        if ((!act.all && nt.s !== m.step) || (selection.size && !selection.has(nt))) continue;
        const v = lane === "r" ? clamp(Math.ceil(m.val * 8), 1, 8)
          : lane === "p" ? Math.round(m.val * 20) / 20 : Math.max(0.02, Math.round(m.val * 100) / 100);
        if ((nt[lane] ?? 1) === v) continue;
        if (!act.old.has(nt)) act.old.set(nt, { ...nt });
        nt[lane] = v;
        if (lane === "v") lastVel = v;
        act.ch = true;
      }
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
      const m = at(e), { P, ti, T, clip } = ctx();
      UI.closeMenu();
      if (!m.zone) return;
      e.preventDefault(); cv.focus({ preventScroll: true });
      if (m.zone === "lane") {
        if (e.button === 0) { begin(e, "lane", { all: e.shiftKey && selection.size > 0 }); setLane(m); draw(); }
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
        const resize = hit.s + hit.l <= G.end && m.x >= G.gx + (hit.s + hit.l - G.start) * G.cw - grab;
        const group = selection.has(hit) ? [...selection] : [hit];
        begin(e, resize ? "size" : "move", { note: hit, grp: group, old: originals(group), st0: m.step, r0: m.row });
        selection = new Set(group); lastLen = hit.l; lastVel = hit.v;
        hear(hit.n, hit.v);
      } else {
        const group = App.chordNotes(P, o.n, isKeys(T) ? chord : 1).filter(n => n <= 127)
          .map(n => ({ s: m.step, n, l: Math.min(lastLen, G.steps - m.step), v: lastVel, p: 1, r: 1 }));
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
          carve(a.clip, a.grp.filter(nt => available.has(nt))); lastLen = a.note.l;
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
        const v = laneTitle();
        rd.textContent = where + "   " + (lane === "r" ? clamp(Math.ceil(m.val * 8), 1, 8) + " HITS" : Math.round(m.val * 100) + "%");
        UI.hint(v + " AT STEP " + where + (selection.size ? "    DRAG = SET SELECTED NOTES HERE · SHIFT-DRAG = SET ENTIRE SELECTION" : "    DRAG = SET"));
      } else {
        const rule=clip.find(nt=>nt.n===o.n && nt.s<=s && s<nt.s+nt.l && nt.when)?.when;
        const label=rule ? "   "+(rule.every>1?"PASS "+rule.phase+"/"+rule.every:"")+(rule.fill===1?" FILL":rule.fill===-1?" NO FILL":""):"";
        rd.textContent = where + "   " + o.label + (chordTxt ? "   " + chordTxt : "")+label;
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
      if (!c) followTransport = true;
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
      tool = "draw"; lane = "v"; chord = 1; lastLen = 1; lastVel = 0.8;
      rowNote = null; wheel = 0; hov = null;
      eu.k = 4; eu.n = 16; eu.r = 0;
      live.clear(); lit.clear(); litStep = -2;
      App.Dv.hit(lit);
      if (ph) ph.style.display = "none";
      if (rd) rd.textContent = "";
      UI.hint(null);
      if (cv) sync();
    }

    return { build, sync, draw, frame, key, reset, range, selected: () => new Set(selection),
      cancel() { cancelGesture(); App.Automation.cancel(); } };
  })();
})();
