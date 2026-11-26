/* MUSICLAB · signal — scope, pitch, spectrum, spectrogram, phase, level. Every pixel is measured audio. */
(() => {
  "use strict";
  const { clamp } = App, UI = App.UI, { h, btn } = UI;
  const FMIN = 20, FMAX = 20000, DBMIN = -96, N = 4096;

  App.Sg = (() => {
    const L = new Float32Array(N), Rr = new Float32Array(N), mono = new Float32Array(N);
    let spec = null, peakHold = null, ysF = null, col = null, lut = null;
    let cvS, cvF, cvG, cvP, cvM, xS, xF, xG, xP, xM, srcB = {}, monB, holdB, ptN, ptC, ptH, ptM, fRd;
    let frozen = null, inputRequest = 0;
    let mode = "out", hold = false, mon = false, tick = 0, cur = null, D = 1, binOf = null, lastHz = 0;
    const lvl = { pk: [0, 0], rms: [0, 0], hold: [0, 0], holdT: [0, 0] };

    const fx = (f, w) => (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * w;
    const xf = (x, w) => FMIN * (FMAX / FMIN) ** (x / w);
    const font = (k = 0.95) => `500 ${Math.round(App.rem * D * k)}px ${App.FONT}`;

    function build() {
      const el = document.getElementById("sg");
      el.innerHTML = "";
      for (const [k, t, tip] of [["out", "OUT", "ANALYSE THE MASTER OUTPUT"], ["trk", "TRACK", "ANALYSE THE SELECTED TRACK ALONE"], ["in", "INPUT", "ANALYSE MIC / LINE INPUT · ASKS FOR PERMISSION"]])
        srcB[k] = btn(t, tip, () => setMode(k));
      monB = btn("MON", "MONITOR · HEAR THE INPUT THROUGH THE MASTER · USE HEADPHONES", () => { mon = !mon; App.E && App.E.monitor(mon && mode === "in"); sync(); }, "tog");
      holdB = btn("HOLD", "FREEZE ALL DISPLAYS", () => {
        hold = !hold;
        frozen = hold ? [cvS, cvF, cvG, cvP, cvM].map(canvas => {
          const copy = document.createElement("canvas");
          copy.width = canvas.width; copy.height = canvas.height;
          copy.getContext("2d").drawImage(canvas, 0, 0);
          return copy;
        }) : null;
        sync();
      }, "tog");
      const pane = (cls, tip) => { const c = h("canvas"), w = h("div.sp-p" + (cls ? "." + cls : ""), { tip }, c); return [w, c, c.getContext("2d")]; };
      let wS, wF, wG, wP, wM;
      [wS, cvS, xS] = pane("", "SCOPE · WAVEFORM OVER TIME · TRIGGERED SO A STEADY TONE STANDS STILL");
      [wF, cvF, xF] = pane("", "SPECTRUM");
      [wG, cvG, xG] = pane("", "SPECTROGRAM");
      [wP, cvP, xP] = pane("", "PHASE · STEREO IMAGE · VERTICAL = MONO · WIDE CLOUD = WIDE · BAR = L/R CORRELATION (-1 CANCELS IN MONO)");
      [wM, cvM, xM] = pane("", "LEVEL dBFS · SOLID = PEAK · INNER = RMS · LINE = PEAK HOLD");
      ptN = h("b", { text: "--" }); ptM = h("u"); ptC = h("span.pc", { text: "" }); ptH = h("span.ph", { text: "" });
      // the spectrogram scrolls by copying itself, so its label and readout live outside the canvas
      fRd = h("span.ov.r");
      wG.append(h("span.ov", { text: "SPECTROGRAM" }), fRd);
      el.append(
        h("div.hd", null, h("span.tg", { text: "SIGNAL" }), h("span.grp", null, srcB.out, srcB.trk, srcB.in), monB, h("span.sp"), btn("BENCH…","Measure the transfer, distortion and delay of an insert path",() => App.SignalBench.open()),holdB),
        wS,
        h("div.pt", { tip: "PITCH · DETECTED NOTE, CENTS OFF AND FREQUENCY · WORKS AS A TUNER ON INPUT" }, h("span.tg", { text: "PITCH" }), ptN, h("span.cb", null, ptM), ptC, ptH),
        wF, wG, h("div.sg-bt", null, wP, wM),
      );
      const track = (cv, kind) => {
        cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); cur = { kind, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; overlaySpectrogram(); if (hold || !App.E) redrawStatic(); });
        cv.addEventListener("pointerleave", () => { cur = null; UI.hint(null); overlaySpectrogram(); if (hold || !App.E) redrawStatic(); });
      };
      track(cvF, "f"); track(cvG, "g");
      lut = new Uint8ClampedArray(256 * 3);
      for (let i = 0; i < 256; i++) {
        // black → deep green → phosphor → near white: one hue, so brightness alone reads as energy
        const v = i / 255, a = Math.min(1, v / 0.6), b = Math.max(0, (v - 0.6) / 0.4);
        lut[i * 3] = Math.round(20 * a * a + 215 * b);
        lut[i * 3 + 1] = Math.round(255 * Math.pow(a, 1.25));
        lut[i * 3 + 2] = Math.round(70 * a * a + 170 * b);
      }
      sync();
      resize();
    }

    async function setMode(k) {
      const request = ++inputRequest;
      const E = App.audio();
      if (!E) return;
      if (k === "in" && !E.input) {
        try { await E.openInput(); } catch (e) { if (request !== inputRequest) return; UI.msg("INPUT REFUSED · ALLOW THE MICROPHONE FOR THIS PAGE"); return; }
      }
      if (request !== inputRequest) return;
      mode = k;
      source();
      sync();
    }
    function source() {
      const E = App.E;
      if (!E) return;
      E.source(mode, App.P.sel.t);
      E.monitor(mon && mode === "in");
    }
    function sync() {
      for (const k in srcB) srcB[k].classList.toggle("on", k === mode);
      monB.classList.toggle("on", mon && mode === "in"); // lit only while the input is really heard
      monB.disabled = mode !== "in"; monB.dataset.why = "MONITORING NEEDS INPUT AS THE SOURCE · CLICK INPUT";
      holdB.classList.toggle("on", hold);
    }

    function resize() {
      if (!cvS || !cvS.clientWidth) return;
      for (const c of [cvS, cvF, cvG, cvP, cvM]) D = UI.fit(c);
      binOf = null; col = null;
      if (hold && frozen) { redrawStatic(); return; }
      xG.fillStyle = "#000"; xG.fillRect(0, 0, cvG.width, cvG.height);
      xP.fillStyle = App.C.pn; xP.fillRect(0, 0, cvP.width, cvP.height);
      redrawStatic();
    }
    // What the displays look like with no signal: graticules only.
    function redrawStatic(force = false) {
      if (hold && frozen) {
        [xS, xF, xG, xP, xM].forEach((g, i) => g.drawImage(frozen[i], 0, 0, g.canvas.width, g.canvas.height));
        if (cur?.kind === "f") {
          const w = cvF.width, hh = cvF.height, x = cur.x * w, y = cur.y * hh;
          xF.fillStyle = App.C.am; xF.fillRect(x, 0, Math.max(1,D), hh); xF.fillRect(0, y, w, Math.max(1,D));
          const hz = xf(x, w), bin = spec && Math.min(spec.length - 1, Math.round(hz * 2 / App.E.ctx.sampleRate * spec.length));
          UI.hint("SPECTRUM    " + App.fHz(hz) + " HZ" + (spec ? "    SIGNAL HERE " + Math.round(clamp(spec[bin], -200, 0)) + " DB" : ""));
        }
        return;
      }
      if (!force && App.E && !hold) return;
      if (App.E && spec) { drawSpectrum(App.E.ctx.sampleRate); return; }
      const C = App.C;
      xS.fillStyle = C.pn; xS.fillRect(0, 0, cvS.width, cvS.height);
      gridScope();
      label(xS, "SCOPE");
      xF.fillStyle = C.pn; xF.fillRect(0, 0, cvF.width, cvF.height);
      gridSpectrum();
      label(xF, "SPECTRUM");
      gridPhase(true);
      drawLevel();
    }
    const label = (x, t, right) => {
      x.font = font(); x.textBaseline = "top"; x.textAlign = "left"; x.fillStyle = App.C.t3;
      x.fillText(t, 0.7 * App.rem * D, 0.55 * App.rem * D);
      if (right) { x.textAlign = "right"; x.fillStyle = App.C.t1; x.fillText(right, x.canvas.width - 0.7 * App.rem * D, 0.55 * App.rem * D); }
    };
    const gridScope = () => {
      const W = cvS.width, H = cvS.height, C = App.C, l = Math.max(1, Math.round(D));
      xS.fillStyle = C.ln;
      for (const f of [0.25, 0.75]) xS.fillRect(0, Math.round(H * f), W, l);
      for (let i = 1; i < 8; i++) xS.fillRect(Math.round((W * i) / 8), 0, l, H);
      xS.fillStyle = C.ln2; xS.fillRect(0, Math.round(H / 2), W, l);
    };
    const gridSpectrum = () => {
      const W = cvF.width, H = cvF.height, C = App.C, l = Math.max(1, Math.round(D));
      xF.font = font(0.85); xF.textBaseline = "bottom";
      for (const f of [30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
        const dec = f === 100 || f === 1000 || f === 10000, x = Math.round(fx(f, W));
        xF.fillStyle = dec ? C.ln2 : C.ln; xF.fillRect(x, 0, l, H);
        if (dec) { xF.fillStyle = C.t3; xF.textAlign = "left"; xF.fillText(f >= 1000 ? f / 1000 + "k" : String(f), x + 0.4 * App.rem * D, H - 0.3 * App.rem * D); }
      }
      xF.textAlign = "right"; xF.textBaseline = "middle";
      for (let db = -12; db > DBMIN; db -= 12) {
        const y = Math.round((db / DBMIN) * H);
        xF.fillStyle = db % 24 ? C.ln : C.ln2; xF.fillRect(0, y, W, l);
        if (db % 24 === 0) { xF.fillStyle = C.t3; xF.fillText(String(db), W - 0.5 * App.rem * D, y - 0.7 * App.rem * D); }
      }
    };
    const gridPhase = (clear) => {
      const W = cvP.width, H = cvP.height, C = App.C, l = Math.max(1, Math.round(D)), bar = Math.round(1.6 * App.rem * D), s = Math.min(W, H - bar) / 2 - Math.round(0.8 * App.rem * D), cxp = W / 2, cyp = (H - bar) / 2;
      if (clear) { xP.fillStyle = C.pn; xP.fillRect(0, 0, W, H); }
      xP.strokeStyle = C.ln2; xP.lineWidth = l;
      xP.beginPath(); xP.moveTo(cxp, cyp - s); xP.lineTo(cxp + s, cyp); xP.lineTo(cxp, cyp + s); xP.lineTo(cxp - s, cyp); xP.closePath();
      xP.moveTo(cxp, cyp - s); xP.lineTo(cxp, cyp + s); xP.moveTo(cxp - s, cyp); xP.lineTo(cxp + s, cyp);
      xP.stroke();
      xP.font = font(0.85); xP.fillStyle = C.t3; xP.textBaseline = "top";
      xP.textAlign = "left"; xP.fillText("L", cxp - s * 0.56 - App.rem * D, cyp - s * 0.56 - App.rem * D);
      xP.textAlign = "right"; xP.fillText("R", cxp + s * 0.56 + App.rem * D, cyp - s * 0.56 - App.rem * D);
      label(xP, "PHASE");
      return { s, cxp, cyp, bar };
    };

    // Normalised square difference (McLeod): robust fundamental for single notes, 40 Hz – 2 kHz (measured).
    // Coarse search on a 4× decimated copy, then the winning lag is refined at the full rate: cents-accurate at a fraction of the cost.
    const DEC = 4, dec = new Float32Array(N / DEC), nsdf = new Float32Array(N / DEC);
    const nsd = (buf, lag, win, hop) => {
      let ac = 0, m = 0;
      for (let i = 0; i < win; i += hop) { const a = buf[i], b = buf[i + lag]; ac += a * b; m += a * a + b * b; }
      return m > 0 ? (2 * ac) / m : 0;
    };
    function pitch(buf, sr) {
      let e = 0;
      for (let i = 0, j = 0; i < N; i += DEC, j++) { const x = (buf[i] + buf[i + 1] + buf[i + 2] + buf[i + 3]) * 0.25; dec[j] = x; e += x * x; }
      if (e / dec.length < 1e-5) return 0;
      const hi = Math.min(Math.floor(sr / DEC / 40), dec.length / 2), win = dec.length - hi - 2;
      for (let lag = 1; lag <= hi + 1; lag++) nsdf[lag] = nsd(dec, lag, win, 1);
      let best = 0, i = 1;
      while (i < hi && nsdf[i] > 0) i++; // skip the zero-lag lobe
      const peaks = [];
      for (; i < hi; i++) if (nsdf[i] > 0 && nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) { peaks.push(i); if (nsdf[i] > best) best = nsdf[i]; }
      if (best < 0.8) return 0;
      const coarse = peaks.find((k) => nsdf[k] >= best * 0.93) * DEC, span = N - coarse - DEC - 4;
      let p = coarse, top = -1;
      for (let lag = coarse - DEC; lag <= coarse + DEC; lag++) { const v = nsd(buf, lag, span, 2); if (v > top) { top = v; p = lag; } }
      const a = nsd(buf, p - 1, span, 2), c = nsd(buf, p + 1, span, 2), d = a - 2 * top + c;
      return sr / (p + (d ? (0.5 * (a - c)) / d : 0));
    }

    function drawSpectrum(sr) {
      const W = cvF.width, H = cvF.height, C = App.C, l = Math.max(1, Math.round(D)), nb = spec.length;
      if (!binOf || binOf.length !== W + 1) {
        binOf = new Float32Array(W + 1);
        for (let x = 0; x <= W; x++) binOf[x] = (xf(x, W) / (sr / 2)) * nb;
        peakHold = new Float32Array(W).fill(DBMIN);
      }
      xF.fillStyle = C.pn; xF.fillRect(0, 0, W, H);
      gridSpectrum();
      if (!ysF || ysF.length !== W) ysF = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const b0 = binOf[x], b1 = binOf[x + 1];
        let v;
        if (b1 - b0 < 1) { const i = Math.min(nb - 2, Math.floor(b0)), fr = b0 - i; v = spec[i] + (spec[i + 1] - spec[i]) * fr; } // between bins: interpolate
        else { v = -200; for (let i = Math.floor(b0); i < b1 && i < nb; i++) if (spec[i] > v) v = spec[i]; } // many bins per pixel: keep the loudest
        v = v > DBMIN ? Math.min(v, 0) : DBMIN; // silent bins are -Infinity and interpolate to NaN: both become the floor
        if (!hold) peakHold[x] = Math.max(v, peakHold[x] - 0.35);
        ysF[x] = (v / DBMIN) * H;
      }
      xF.beginPath();
      xF.moveTo(0, H);
      for (let x = 0; x < W; x++) xF.lineTo(x + 0.5, ysF[x]);
      xF.lineTo(W, H);
      xF.fillStyle = C.fill; xF.fill();
      xF.beginPath();
      for (let x = 0; x < W; x++) x ? xF.lineTo(x + 0.5, ysF[x]) : xF.moveTo(0.5, ysF[0]);
      xF.strokeStyle = C.t1; xF.lineWidth = Math.max(1, D); xF.lineJoin = "round"; xF.stroke();
      xF.fillStyle = C.t3;
      for (let x = 0; x < W; x += 2) xF.fillRect(x, Math.round((peakHold[x] / DBMIN) * H), 1, l);
      let rd = "";
      if (cur && cur.kind === "f") {
        const x = Math.round(cur.x * W), y = Math.round(cur.y * H), f = xf(x, W), n = App.InstrumentLab.nearest(f).note;
        xF.fillStyle = C.am; xF.fillRect(x, 0, l, H); xF.fillRect(0, y, W, l);
        rd = App.fHz(f) + " HZ  " + App.noteName(n) + "  " + Math.round(cur.y * DBMIN) + " DB";
        UI.hint("SPECTRUM    " + rd + "    SIGNAL HERE " + Math.round(clamp(spec[Math.min(nb - 1, Math.round(binOf[clamp(x, 0, W)]))], -200, 0)) + " DB");
      }
      label(xF, "SPECTRUM", rd);
    }

    function drawSpectrogram(sr) {
      const W = cvG.width, H = cvG.height, nb = spec.length, step = Math.max(1, Math.round(D));
      if (!col || col.height !== H) col = xG.createImageData(step, H);
      xG.drawImage(cvG, -step, 0);
      const d = col.data;
      for (let y = 0; y < H; y++) {
        const b0 = (xf(H - 1 - y, H) / (sr / 2)) * nb, b1 = (xf(H - y, H) / (sr / 2)) * nb;
        let v;
        if (b1 - b0 < 1) { const i = Math.min(nb - 2, Math.floor(b0)); v = spec[i] + (spec[i + 1] - spec[i]) * (b0 - i); }
        else { v = -200; for (let i = Math.floor(b0); i < b1 && i < nb; i++) if (spec[i] > v) v = spec[i]; }
        const k = Math.round((v > -92 ? Math.min(1, (v + 92) / 80) : 0) * 255) * 3;
        for (let s = 0; s < step; s++) { const o = (y * step + s) * 4; d[o] = lut[k]; d[o + 1] = lut[k + 1]; d[o + 2] = lut[k + 2]; d[o + 3] = 255; }
      }
      xG.putImageData(col, W - step, 0);
    }
    const overlaySpectrogram = () => {
      if (cur && cur.kind === "g") {
        const f = xf((1 - cur.y) * cvG.height, cvG.height), n = App.InstrumentLab.nearest(f).note;
        const t = App.fHz(f) + " HZ  " + App.noteName(n);
        fRd.textContent = t;
        UI.hint("SPECTROGRAM · TIME RUNS LEFT, PITCH RUNS UP, BRIGHTNESS = LEVEL    " + t);
      } else if (fRd.textContent) fRd.textContent = "";
    };

    function drawLevel() {
      const W = cvM.width, H = cvM.height, C = App.C, l = Math.max(1, Math.round(D)), rem = App.rem * D;
      const top = Math.round(2 * rem), bot = H - Math.round(3.4 * rem), hh = bot - top, FLOOR = -60;
      const y = (db) => top + Math.round((clamp(db, FLOOR, 0) / FLOOR) * hh), dbv = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -200);
      xM.fillStyle = C.pn; xM.fillRect(0, 0, W, H);
      label(xM, "LEVEL", mode === "out" ? "OUT" : mode === "trk" ? "TRACK" : "INPUT");
      xM.font = font(0.85); xM.textAlign = "right"; xM.textBaseline = "middle";
      const sx = Math.round(3.6 * rem), bw = Math.max(4, Math.round((W - sx - 2.2 * rem) / 2 - 0.5 * rem));
      for (let db = 0; db >= FLOOR; db -= 6) {
        xM.fillStyle = db % 12 ? C.ln : C.ln2; xM.fillRect(sx, y(db), W - sx - Math.round(rem), l);
        if (db % 12 === 0) { xM.fillStyle = C.t3; xM.fillText(String(db), sx - 0.5 * rem, y(db)); }
      }
      for (let k = 0; k < 2; k++) {
        const x = sx + Math.round(0.6 * rem) + k * (bw + Math.round(0.6 * rem)), pk = dbv(lvl.pk[k]), rms = dbv(lvl.rms[k]), hd = dbv(lvl.hold[k]);
        xM.fillStyle = C.fill; xM.fillRect(x, y(pk), bw, bot - y(pk));
        xM.fillStyle = C.t2; xM.fillRect(x + Math.round(bw * 0.25), y(rms), bw - 2 * Math.round(bw * 0.25), bot - y(rms));
        xM.fillStyle = hd > -0.2 ? C.rd : C.t1; xM.fillRect(x, y(hd), bw, 2 * l);
        xM.textAlign = "center"; xM.textBaseline = "top"; xM.fillStyle = C.t3;
        xM.fillText(k ? "R" : "L", x + bw / 2, bot + 0.4 * rem);
        xM.fillStyle = hd > -0.2 ? C.rd : C.t1;
        xM.fillText(hd < -99 ? "-INF" : hd.toFixed(1), x + bw / 2, bot + 1.7 * rem);
      }
    }

    function frame() {
      const E = App.E;
      if (!E || hold || !cvS || !cvS.clientWidth) return;
      tick++;
      const sr = E.ctx.sampleRate, C = App.C, l = Math.max(1, Math.round(D));
      E.anL.getFloatTimeDomainData(L); E.anR.getFloatTimeDomainData(Rr);
      if (!spec) spec = new Float32Array(E.anF.frequencyBinCount);
      E.anF.getFloatFrequencyData(spec);

      // level + correlation over the newest 2048 samples
      let sl = 0, srr = 0, slr = 0, pl = 0, pr = 0;
      for (let i = 0; i < N; i++) {
        const a = L[i], b = Rr[i];
        mono[i] = (a + b) * 0.5;
        if (i >= N - 2048) { sl += a * a; srr += b * b; slr += a * b; const aa = a < 0 ? -a : a, bb = b < 0 ? -b : b; if (aa > pl) pl = aa; if (bb > pr) pr = bb; }
      }
      const now = performance.now();
      [[pl, sl], [pr, srr]].forEach(([p, s], k) => {
        lvl.pk[k] = Math.max(p, lvl.pk[k] * 0.9);
        lvl.rms[k] = Math.sqrt(s / 2048);
        if (p >= lvl.hold[k] || now - lvl.holdT[k] > 2500) { lvl.hold[k] = p; lvl.holdT[k] = now; }
      });
      const corr = sl > 1e-9 && srr > 1e-9 ? slr / Math.sqrt(sl * srr) : 0;

      // scope: start at a rising zero crossing
      {
        const W = cvS.width, H = cvS.height, span = 1536;
        let t0 = 0;
        for (let i = 1; i < N - span - 1; i++) if (mono[i - 1] <= 0 && mono[i] > 0) { t0 = i; break; }
        xS.fillStyle = C.pn; xS.fillRect(0, 0, W, H);
        gridScope();
        xS.strokeStyle = C.t1; xS.lineWidth = Math.max(1, D * 1.1); xS.lineJoin = "round";
        xS.beginPath();
        for (let x = 0; x <= W; x += 1) {
          const y = (0.5 - clamp(mono[t0 + Math.floor((x / W) * span)], -1, 1) * 0.47) * H;
          x ? xS.lineTo(x, y) : xS.moveTo(x, y);
        }
        xS.stroke();
        label(xS, "SCOPE", ((span / sr) * 1000).toFixed(0) + " MS");
      }

      if (tick % 4 === 0) {
        const hz = pitch(mono, sr);
        if (hz) {
          const pitch = App.InstrumentLab.nearest(hz), n = pitch.note, ct = Math.round(pitch.cents);
          ptN.textContent = App.noteName(n);
          ptC.textContent = (ct > 0 ? "+" : "") + ct + " C";
          ptH.textContent = hz.toFixed(1) + " HZ";
          ptM.style.left = clamp(50 + ct,0,100) + "%"; ptM.style.display = "block";
          ptM.classList.toggle("ok", Math.abs(ct) <= 5);
        } else if (lastHz) { ptN.textContent = "--"; ptC.textContent = ""; ptH.textContent = ""; ptM.style.display = "none"; }
        lastHz = hz;
      }

      drawSpectrum(sr);
      if (tick % 2 === 0) drawSpectrogram(sr);
      overlaySpectrogram();

      // phase: each sample pair is a dot; older frames fade like phosphor
      {
        const W = cvP.width, H = cvP.height;
        xP.fillStyle = C.fade; xP.fillRect(0, 0, W, H);
        const g = gridPhase(false), k = g.s * 0.7071;
        xP.fillStyle = C.t1;
        for (let i = N - 1536; i < N; i += 2) {
          const x = g.cxp + (Rr[i] - L[i]) * k, y = g.cyp - (L[i] + Rr[i]) * k;
          xP.fillRect(x, y, l, l);
        }
        const by = H - g.bar + Math.round(0.3 * App.rem * D), bh = Math.round(0.5 * App.rem * D), m = Math.round(0.8 * App.rem * D), bw = W - 2 * m;
        xP.fillStyle = C.pn; xP.fillRect(0, H - g.bar, W, g.bar);
        xP.fillStyle = C.ln2; xP.fillRect(m, by, bw, bh);
        xP.fillStyle = corr < 0 ? C.rd : C.t1;
        xP.fillRect(m + bw / 2 + Math.min(0, corr) * (bw / 2), by, Math.max(l, Math.abs(corr) * (bw / 2)), bh);
        xP.fillStyle = C.t3; xP.fillRect(m + Math.round(bw / 2), by - l, l, bh + 2 * l);
        xP.font = font(0.85); xP.textBaseline = "top"; xP.textAlign = "right"; xP.fillStyle = corr < 0 ? C.rd : C.t1;
        xP.fillText((corr >= 0 ? "+" : "") + corr.toFixed(2), W - 0.7 * App.rem * D, 0.55 * App.rem * D);
      }
      drawLevel();
    }

    function reset() {
      inputRequest++;
      mode = "out"; hold = mon = false; frozen = cur = spec = peakHold = binOf = null;
      tick = lastHz = 0;
      for (const pair of Object.values(lvl)) pair.fill(0);
      if (App.E) source();
      if (!cvS) return;
      ptN.textContent = "--"; ptC.textContent = ptH.textContent = fRd.textContent = "";
      ptM.style.display = "none";
      xG.fillStyle = "#000"; xG.fillRect(0, 0, cvG.width, cvG.height);
      redrawStatic(true); sync();
    }

    return { build, frame, resize, source, sync, reset, mode: () => mode };
  })();
})();
