/* MUSICLAB · editor — one note grid for every instrument (keys, drum pads, sample slices) */
(() => {
  "use strict";
  const { clamp, pad2, PATS } = App, UI = App.UI, { h, btn } = UI;
  const ROWS = 24;

  App.Ed = (() => {
    let cv, cx, ph, rd, hd = {}, W = 0, H = 0, D = 1, R = [], G = {}, hov = null, act = null, raf = 0, wheel = 0;
    let lane = "v", chord = 1, lastLen = 1, lastVel = 0.8, rowNote = null;
    let lit = new Set(), litStep = -2; // rows sounding under the playhead
    const live = new Set(); // rows held from the keyboard or MIDI
    const eu = { k: 4, n: 16, r: 0 };

    const ctx = () => {
      const P = App.P, ti = P.sel.t, pi = P.sel.p, T = P.tracks[ti];
      return { P, ti, pi, T, clip: T.clips[pi] };
    };
    const isKeys = (T) => T.kind === "syn" || (T.kind === "smp" && T.smp.mode === 0);

    // Rows top to bottom. Pads and slices sit on MIDI notes 36+, so clips survive a change of instrument.
    const rowList = () => {
      const { P, T } = ctx();
      if (T.kind === "kit") return T.kit.pads.map((p, i) => ({ n: 36 + i, label: p.name, pad: i }));
      if (T.kind === "smp" && T.smp.mode === 1) return Array.from({ length: T.smp.slices }, (_, i) => ({ n: 36 + i, label: "SLICE " + pad2(i + 1), slice: 1 }));
      const out = [];
      if (P.fold && P.scale !== 0) { for (let m = T.lo; out.length < ROWS && m < 128; m++) if (App.inScale(P, m)) out.push(m); }
      else for (let k = 0; k < ROWS && T.lo + k < 128; k++) out.push(T.lo + k);
      return out.reverse().map((n) => ({ n, label: App.noteName(n), black: [1, 3, 6, 8, 10].includes(n % 12), out: !App.inScale(P, n), root: App.pc(n - P.key) === 0 }));
    };

    function build() {
      const el = document.getElementById("ed");
      el.innerHTML = "";
      hd.title = h("span.ti");
      hd.bars = [1, 2, 3, 4].map((n) => btn(String(n), "PATTERN LENGTH · " + n + " BAR", () => edit((c) => { c.P.pats[c.pi].bars = n; })));
      hd.dn = btn("↓", "TRANSPOSE CLIP DOWN · SHIFT = OCTAVE", (e) => transpose(e.shiftKey ? -12 : -1));
      hd.up = btn("↑", "TRANSPOSE CLIP UP · SHIFT = OCTAVE", (e) => transpose(e.shiftKey ? 12 : 1));
      hd.x2 = btn("×2", "DOUBLE · REPEAT THE CLIP INTO TWICE THE LENGTH", double);
      hd.ch = [1, 3, 4].map((n) => btn(String(n), "NOTES PER CLICK · " + (n === 1 ? "SINGLE NOTE" : n === 3 ? "TRIAD IN SCALE" : "SEVENTH CHORD IN SCALE"), () => { chord = n; sync(); }));
      hd.fold = btn("FOLD", "SHOW ONLY NOTES OF THE SCALE", () => { App.P.fold ^= 1; App.touch(); sync(); });
      hd.od = btn("-", "VIEW ONE OCTAVE DOWN · WHEEL OVER GRID = SCROLL PITCH", () => view(-12));
      hd.ou = btn("+", "VIEW ONE OCTAVE UP · WHEEL OVER GRID = SCROLL PITCH", () => view(12));
      hd.lv = btn("VEL", "LANE SHOWS NOTE VELOCITY", () => { lane = "v"; sync(); });
      hd.lp = btn("PROB", "LANE SHOWS NOTE PROBABILITY · BELOW 100% A NOTE PLAYS BY CHANCE", () => { lane = "p"; sync(); });
      hd.euc = btn("EUCLID", "SPREAD N HITS EVENLY OVER A CYCLE ON THE LAST TOUCHED ROW", () => euclid());
      rd = h("span.rd");
      el.append(h("div.hd", null,
        h("span.tg", { text: "EDIT" }), hd.title,
        h("span.grp", null, h("span.tg", { text: "BARS" }), hd.bars),
        h("span.grp", null, h("span.tg", { text: "CLIP" }),
          btn("<", "SHIFT CLIP ONE STEP EARLIER", () => rotate(-1)), btn(">", "SHIFT CLIP ONE STEP LATER", () => rotate(1)), hd.dn, hd.up, hd.x2, hd.euc,
          btn("CLEAR", "DELETE ALL NOTES OF THIS CLIP", () => edit((c) => { c.clip.length = 0; }))),
        h("span.grp", null, h("span.tg", { text: "CHORD" }), hd.ch),
        h("span.grp", null, h("span.tg", { text: "VIEW" }), hd.od, hd.ou, hd.fold),
        h("span.grp", null, h("span.tg", { text: "LANE" }), hd.lv, hd.lp),
        h("span.sp"), rd));
      cv = h("canvas"); ph = h("div.ed-ph");
      const body = h("div.ed-b", null, cv, ph);
      el.append(body);
      cx = cv.getContext("2d");
      const tgt = (e) => {
        const c = ctx(), m = at(e);
        return c.T.kind === "kit" ? { ti: c.ti, pad: m.zone === "lane" ? c.P.sel.pad : R[m.row].pad } : { ti: c.ti };
      };
      UI.drop(body, { file: (f, e) => App.dropFiles(f, tgt(e)), take: (d, e) => App.dropTake(tgt(e)) });
      cv.addEventListener("pointerdown", down);
      cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", up);
      cv.addEventListener("pointerleave", () => { if (act) return; hov = null; rd.textContent = ""; UI.hint(null); later(); });
      cv.addEventListener("dblclick", rename);
      cv.addEventListener("wheel", (e) => {
        e.preventDefault();
        const { T } = ctx();
        if (!isKeys(T)) return;
        wheel += e.deltaY || e.deltaX; // with SHIFT held, browsers report the wheel on the X axis
        if (Math.abs(wheel) < 40) return;
        view((wheel < 0 ? 1 : -1) * (e.shiftKey ? 12 : 2));
        wheel = 0;
      }, { passive: false });
    }

    /* ── clip operations ── */
    const edit = (fn) => { const c = ctx(); fn(c); c.clip.sort((a, b) => a.s - b.s || a.n - b.n); App.commit(); sync(); App.Mx.sync(); };
    const view = (d) => { const { T } = ctx(); T.lo = clamp(T.lo + d, 0, 127 - ROWS + 1); App.touch(); draw(); };
    const rotate = (d) => edit((c) => { const n = App.patSteps(c.P, c.pi); for (const nt of c.clip) if (nt.s < n) nt.s = (nt.s + d + n) % n; });
    const transpose = (d) => {
      const c = ctx();
      if (!isKeys(c.T) || !c.clip.length) return;
      if (c.clip.some((nt) => nt.n + d < 0 || nt.n + d > 127)) return;
      edit((x) => { for (const nt of x.clip) nt.n += d; });
      if (!c.clip.every((nt) => nt.n >= c.T.lo && nt.n < c.T.lo + ROWS)) view(d);
    };
    function double() {
      const c = ctx(), bars = Math.min(c.P.pats[c.pi].bars, App.maxBars(c.P));
      if (bars * 2 > App.maxBars(c.P)) { UI.msg("PATTERN IS AT MAX LENGTH"); return; }
      edit((x) => {
        const n = App.patSteps(x.P, x.pi);
        for (let i = x.clip.length - 1; i >= 0; i--) if (x.clip[i].s >= n) x.clip.splice(i, 1); // notes hidden past the old end would collide with the copy
        for (const nt of x.clip.slice()) x.clip.push({ ...nt, s: nt.s + n });
        x.P.pats[x.pi].bars = bars * 2;
      });
    }
    function euclid() {
      const row = () => R.find((o) => o.n === rowNote) || R[R.length - 1];
      const dk = (k, l, name, min, max) => App.N(k, l, name, min, max, eu[k], { int: 1 });
      const go = btn("", "WRITE THE RHYTHM · REPLACES THIS ROW", () => {
        UI.closeMenu();
        const o = row();
        edit((c) => {
          const n = App.patSteps(c.P, c.pi), N = Math.max(1, eu.n), K = Math.min(eu.k, N);
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
      G = { rem, gx: Math.round(7.4 * rem), ry: Math.round(1.8 * rem), lh: Math.round(5.6 * rem), L: Math.max(1, Math.round(D)) };
      G.gw = W - G.gx; G.ly = H - G.lh; G.gh = G.ly - G.ry;
    }

    function draw() {
      if (!cx) return;
      geo();
      const { P, T, clip, pi } = ctx(), C = App.C, L = G.L, rem = G.rem;
      const steps = App.patSteps(P, pi), SPB = App.spb(P), BS = App.beatSteps(P);
      R = rowList();
      const nr = R.length, cw = (G.cw = G.gw / steps), rh = (G.rh = G.gh / nr), keys = isKeys(T);
      G.steps = steps;
      const X = (s) => G.gx + Math.round(s * cw), Y = (r) => G.ry + Math.round(r * rh);
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
      for (let s = 0; s <= steps; s++) {
        cx.fillStyle = s % SPB === 0 ? C.ln3 : s % BS === 0 ? C.ln2 : C.ln;
        cx.fillRect(Math.min(W - L, X(s)), G.ry, L, H - G.ry);
      }

      // ruler
      cx.textBaseline = "middle"; cx.textAlign = "left";
      cx.font = `500 ${Math.round(rem)}px ${App.FONT}`;
      for (let s = 0; s < steps; s += BS) {
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
        if (nt.s >= steps) continue;
        const val = lane === "v" ? nt.v : nt.p;
        if (!(laneV.get(nt.s) >= val)) laneV.set(nt.s, val);
        const r = idx.get(nt.n), x = X(nt.s) + L, w = Math.max(edge + L, X(Math.min(steps, nt.s + nt.l)) - X(nt.s) - L);
        if (r == null) { // outside the visible rows: a tick on the edge it lies beyond
          cx.fillStyle = C.am;
          cx.fillRect(x, (keys ? nt.n > top : nt.n < top) ? G.ry + L : G.ly - 3 * L, w, 2 * L);
          continue;
        }
        const rowH = Y(r + 1) - Y(r) - L, hh = keys ? rowH : Math.min(rowH, Math.round(1.7 * rem)); // pad rows are tall, a hit is not
        const y = Y(r) + L + Math.round((rowH - hh) / 2), moving = act && act.grp && act.grp.includes(nt);
        cx.globalAlpha = (0.3 + 0.7 * nt.v) * (nt.p < 1 ? 0.45 : 1);
        cx.fillStyle = moving ? C.am : C.t2;
        cx.fillRect(x, y, w, hh);
        cx.globalAlpha = 1;
        cx.fillStyle = moving ? C.am : C.t1;
        cx.fillRect(x, y, edge, hh); // bright leading edge marks where the note starts
        if (nt.p < 1) { cx.fillRect(x, y, w, L); cx.fillRect(x, y + hh - L, w, L); }
      }

      // lane
      cx.fillStyle = C.t3;
      cx.font = `500 ${Math.round(rem)}px ${App.FONT}`;
      cx.fillText(lane === "v" ? "VELOCITY" : "PROBABILITY", 0.7 * rem, G.ly + G.lh / 2);
      const span = G.lh - 4 * L;
      for (const [s, val] of laneV) {
        const x = X(s) + L, w = Math.max(2 * L, Math.min(X(s + 1) - X(s) - L, Math.round(1.6 * rem))), hh = Math.max(L, Math.round(span * val));
        cx.globalAlpha = 0.4; cx.fillStyle = C.t2; cx.fillRect(x, H - hh, w, hh);
        cx.globalAlpha = 1; cx.fillStyle = C.t1; cx.fillRect(x, H - hh, w, 2 * L);
      }
    }
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    function sync() {
      const { P, ti, pi, T } = ctx(), mb = App.maxBars(P), bars = Math.min(P.pats[pi].bars, mb), keys = isKeys(T);
      hd.title.textContent = pad2(ti + 1) + " " + T.name + " / " + PATS[pi];
      hd.bars.forEach((b, i) => { b.classList.toggle("on", i + 1 === bars); b.disabled = i + 1 > mb; });
      hd.ch.forEach((b, i) => { b.classList.toggle("on", [1, 3, 4][i] === chord); b.disabled = !keys; });
      hd.fold.classList.toggle("on", !!P.fold);
      for (const b of [hd.fold, hd.od, hd.ou, hd.dn, hd.up]) b.disabled = !keys;
      hd.x2.disabled = bars * 2 > mb;
      hd.lv.classList.toggle("on", lane === "v"); hd.lp.classList.toggle("on", lane === "p");
      litStep = -2;
      draw();
    }

    /* ── pointer ── */
    const at = (e) => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
      return {
        x, y,
        step: clamp(Math.floor((x - G.gx) / G.cw), 0, G.steps - 1),
        row: clamp(Math.floor((y - G.ry) / G.rh), 0, R.length - 1),
        zone: y >= G.ly ? (x >= G.gx ? "lane" : "") : y < G.ry ? "" : x < G.gx ? "gut" : "grid",
        val: clamp(1 - (y - G.ly - 2 * G.L) / (G.lh - 4 * G.L), 0, 1),
      };
    };
    const find = (clip, n, s) => clip.find((nt) => nt.n === n && nt.s <= s && s < nt.s + nt.l);
    // The placed note wins: same-pitch notes it covers are removed, one it lands inside is shortened.
    const carve = (clip, nt) => {
      for (let i = clip.length - 1; i >= 0; i--) {
        const x = clip[i];
        if (x === nt || x.n !== nt.n) continue;
        if (x.s >= nt.s && x.s < nt.s + nt.l) clip.splice(i, 1);
        else if (x.s < nt.s && x.s + x.l > nt.s) x.l = nt.s - x.s;
      }
    };
    const hear = (n, v) => { const E = App.audio(); E && E.play(App.P.sel.t, n, v, 0, 0.22); };
    const pickPad = (o) => {
      const P = App.P;
      rowNote = o.n;
      if (o.pad != null && P.sel.pad !== o.pad) { P.sel.pad = o.pad; App.touch(); App.Dv.build(); }
    };
    const setLane = (m) => {
      const { clip } = ctx();
      for (const nt of clip) {
        if (nt.s !== m.step) continue;
        if (lane === "v") { const v = Math.max(0.02, Math.round(m.val * 100) / 100); if (nt.v !== v) { nt.v = v; act.ch = true; } lastVel = v; }
        else { const v = Math.round(m.val * 20) / 20; if (nt.p !== v) { nt.p = v; act.ch = true; } }
      }
    };

    function down(e) {
      const m = at(e), { P, ti, T, clip } = ctx(), E = App.audio();
      UI.closeMenu();
      if (!m.zone) return;
      cv.setPointerCapture(e.pointerId);
      if (m.zone === "lane") { act = { mode: "lane", ch: false }; setLane(m); draw(); return; }
      const o = R[m.row];
      pickPad(o);
      if (m.zone === "gut") { if (e.button === 0) { E && E.noteOn(ti, o.n, 0.85); act = { mode: "key", n: o.n, ti }; key(o.n, true); } draw(); return; }
      const hit = find(clip, o.n, m.step);
      if (e.button === 2) { act = { mode: "erase", ch: false }; if (hit) { clip.splice(clip.indexOf(hit), 1); act.ch = true; } draw(); return; }
      if (e.button !== 0) return;
      if (hit) {
        const grab = Math.max(4 * D, Math.min(G.cw * 0.4, 9 * D));
        const size = m.x >= G.gx + (hit.s + hit.l) * G.cw - grab;
        act = { mode: size ? "size" : "move", note: hit, grp: [hit], s0: hit.s, st0: m.step, r0: m.row, row0: R.findIndex((x) => x.n === hit.n), last: m.step, ch: false };
        lastLen = hit.l; lastVel = hit.v;
        hear(hit.n, hit.v);
      } else {
        const ns = App.chordNotes(P, o.n, isKeys(T) ? chord : 1).filter((n) => n <= 127)
          .map((n) => ({ s: m.step, n, l: Math.max(1, Math.min(lastLen, G.steps - m.step)), v: lastVel, p: 1 }));
        for (const nt of ns) { carve(clip, nt); clip.push(nt); hear(nt.n, nt.v); }
        act = { mode: "size", note: ns[0], grp: ns, last: m.step, ch: true };
      }
      draw();
    }

    function move(e) {
      const m = at(e), { clip } = ctx();
      if (!act) { hover(m); return; }
      if (act.mode === "lane") { setLane(m); draw(); return; }
      if (act.mode === "erase") { const hit = find(clip, R[m.row].n, m.step); if (hit) { clip.splice(clip.indexOf(hit), 1); act.ch = true; draw(); } return; }
      if (act.mode === "size") {
        if (m.step === act.last) return; // length follows the pointer only once it leaves its starting cell
        act.last = m.step;
        const l = clamp(m.step - act.note.s + 1, 1, G.steps - act.note.s);
        if (l !== act.note.l) { for (const nt of act.grp) nt.l = l; act.ch = true; draw(); }
        return;
      }
      if (act.mode === "move") {
        const row = clamp(act.row0 + m.row - act.r0, 0, R.length - 1), n = R[row].n, s = clamp(act.s0 + m.step - act.st0, 0, G.steps - 1);
        if (n === act.note.n && s === act.note.s) return;
        if (n !== act.note.n) hear(n, act.note.v);
        act.note.n = n; act.note.s = s; act.ch = true;
        draw();
      }
    }

    function up(e) {
      if (!act) return;
      const a = act, { ti, clip } = ctx();
      act = null;
      if (a.mode === "key") { App.E && App.E.noteOff(a.ti, a.n); key(a.n, false); } // the track it was pressed on, even if selection moved
      if (a.grp) { for (const nt of a.grp) carve(clip, nt); lastLen = a.note.l; }
      if (a.ch) { clip.sort((x, y) => x.s - y.s || x.n - y.n); App.commit(); App.Mx.draw(); }
      hover(at(e));
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
        const v = lane === "v" ? "VELOCITY" : "PROBABILITY";
        rd.textContent = where + "   " + Math.round(m.val * 100) + "%";
        UI.hint(v + " OF NOTES AT STEP " + where + "    DRAG = SET");
      } else {
        rd.textContent = where + "   " + o.label + (chordTxt ? "   " + chordTxt : "");
        UI.hint("STEP " + where + "  " + o.label + "    CLICK = NOTE · DRAG RIGHT = LENGTH · DRAG NOTE = MOVE · NOTE END = RESIZE · RIGHT-CLICK = DELETE");
      }
      later();
    }

    function rename(e) {
      const m = at(e), o = R[m.row], { T } = ctx();
      if (m.zone !== "gut" || o.pad == null) return;
      const r = cv.getBoundingClientRect(), pd = T.kit.pads[o.pad];
      UI.edit({ left: r.left, top: r.top + (G.ry + m.row * G.rh) / D, width: G.gx / D, height: G.rh / D }, pd.name, (s) => {
        pd.name = s.toUpperCase().slice(0, 8);
        App.commit();
        draw(); App.Dv.build();
      }, 8);
    }

    const lamps = () => { const all = new Set(lit); for (const n of live) all.add(n); App.Dv.hit(all); later(); };
    // A key or MIDI note went down or up on the selected track.
    const key = (n, on) => { if (on) live.add(n); else live.delete(n); lamps(); };

    function frame(c) {
      const { pi, clip } = ctx(), step = c && c.pat === pi ? c.step : -1;
      if (step !== litStep) {
        litStep = step;
        const next = new Set();
        if (step >= 0) for (const nt of clip) if (nt.s <= step && step < nt.s + nt.l) next.add(nt.n);
        if (next.size || lit.size) { lit = next; lamps(); }
      }
      if (!c || c.pat !== pi || !G.cw) { if (ph.style.display !== "none") ph.style.display = "none"; return; }
      const f = c.step + clamp((App.E.ctx.currentTime - c.t) / c.sd, 0, 1);
      ph.style.display = "block";
      ph.style.transform = `translateX(${(G.gx + Math.min(f, G.steps) * G.cw) / D}px)`;
    }

    return { build, sync, draw, frame, key };
  })();
})();
