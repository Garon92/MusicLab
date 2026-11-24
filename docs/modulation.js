(() => {
  "use strict";

  const waves = { sine: "Sinus", triangle: "Trojúhelník", square: "Obdélník", hold: "Sample & hold" };
  const targets = { cutoff: "Cutoff · synth", resonance: "Rezonance · synth", volume: "Hlasitost · synth", pan: "Pan · synth", wet: "Delay · wet" };
  // One bar has four beats. Values are beat lengths rather than wall-clock times.
  const cycles = { "1/16": 0.25, "1/8": 0.5, "1/4": 1, "1/2": 2, "1/1": 4, "2/1": 8, "4/1": 16 };
  const colors = ["#acf575", "#8dd8eb"];
  const defaults = () => ({ slots: [
    { enabled: false, wave: "sine", rate: "1/2", target: "cutoff", depth: 0.5 },
    { enabled: false, wave: "triangle", rate: "1/1", target: "pan", depth: 0.5 }
  ] });
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let state = defaults(), host, ctx, rows, visible = true;
  let segments = [], previousStep = null, totalSteps = 0, timer = null;
  let currentBeat = 0, lastDraw = -Infinity, applied = false;
  let intersection, resize;
  const active = () => state.slots.some(slot => slot.enabled && slot.depth > 0);

  function validate(data) {
    return !!data && Array.isArray(data.slots) && data.slots.length === 2 &&
      data.slots.every(slot => slot && typeof slot.enabled === "boolean" && owns(waves, slot.wave) &&
        owns(cycles, slot.rate) && owns(targets, slot.target) && Number.isFinite(slot.depth) && slot.depth >= 0 && slot.depth <= 1);
  }
  const clone = data => ({ slots: data.slots.map(slot => ({ ...slot })) });

  function valueAt(wave, cyclesElapsed, index) {
    const cycle = Math.floor(cyclesElapsed);
    const phase = cyclesElapsed - cycle;
    if (wave === "square") return phase < 0.5 ? 1 : -1;
    if (wave === "triangle") return 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5);
    if (wave === "hold") {
      // Integer hash creates a repeatable held value per cycle and per oscillator.
      let n = Math.imul(cycle + 67 * (index + 1), 0x45d9f3b);
      n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
      return ((n ^ (n >>> 16)) >>> 0) / 0x7fffffff - 1;
    }
    return Math.sin(phase * 2 * Math.PI);
  }

  function draw(animated = false) {
    if (!rows || !visible || document.hidden || !host.getClientRects().length) return;
    rows.forEach((row, index) => {
      const canvas = row.querySelector("canvas"), slot = state.slots[index];
      if (animated === true && (!slot.enabled || slot.depth === 0)) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      const g = canvas.getContext("2d");
      const span = slot.wave === "hold" ? 4 : 2;
      const elapsed = currentBeat / cycles[slot.rate];
      const start = Math.floor(elapsed / span) * span;
      const amplitude = height * 0.41 * slot.depth;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, width, height);
      g.strokeStyle = "#34483a"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, height / 2); g.lineTo(width, height / 2); g.stroke();
      g.strokeStyle = slot.enabled ? colors[index] : "#698072"; g.lineWidth = 1.7; g.beginPath();
      for (let x = 0; x <= width; x++) {
        const y = height / 2 - valueAt(slot.wave, start + x / width * span, index) * amplitude;
        if (!x) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      if (timer !== null && slot.enabled && slot.depth > 0) {
        const x = (elapsed - start) / span * width, y = height / 2 - valueAt(slot.wave, elapsed, index) * amplitude;
        g.fillStyle = "#f2f7c4"; g.fillRect(Math.round(x), 0, 1, height);
        g.beginPath(); g.arc(x, y, 2.7, 0, 2 * Math.PI); g.fill();
      }
    });
  }

  function audioFrame() {
    const now = ctx.engine.now();
    while (segments.length > 1 && segments[1].time <= now) segments.shift();
    const head = segments[0];
    if (!head || now < head.time) return;
    const fraction = Math.max(0, Math.min(1, (now - head.time) / head.duration));
    currentBeat = (head.step + fraction) / 4;
    const values = {};
    state.slots.forEach((slot, i) => {
      if (!slot.enabled || slot.depth === 0) return;
      const signal = valueAt(slot.wave, currentBeat / cycles[slot.rate], i) * slot.depth;
      values[slot.target] = (values[slot.target] || 0) + signal;
    });
    for (const target of Object.keys(values)) values[target] = Math.max(-1, Math.min(1, values[target]));
    ctx.engine.setModulation(values);
    applied = true;
    const stamp = performance.now();
    if (visible && !document.hidden && stamp - lastDraw > 40) { lastDraw = stamp; draw(true); }
  }

  function runClock() {
    if (ctx && segments.length && active()) {
      if (timer === null) timer = setInterval(audioFrame, 12);
      audioFrame();
    } else {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (applied) { ctx.engine.setModulation({}); applied = false; }
    }
  }

  // The scheduler anchors every sixteenth note to its actual audio time. This
  // also follows swing, tempo changes and a transport jump to another bar.
  function tick(step, time, duration, absoluteStep) {
    if (!Number.isInteger(step) || !Number.isFinite(time) || !(duration > 0)) return;
    if (Number.isFinite(absoluteStep)) totalSteps = absoluteStep;
    else if (previousStep === null) totalSteps = step;
    else totalSteps += (step - previousStep + 16) % 16;
    previousStep = step;
    segments.push({ step: totalSteps, time, duration });
    if (segments.length > 8) segments.shift();
    if (active()) runClock();
  }

  function resetPlayback() {
    segments = []; previousStep = null; totalSteps = currentBeat = 0;
    const redraw = timer !== null || applied;
    runClock();
    if (redraw) draw();
  }

  function render() {
    if (!rows) return;
    rows.forEach((row, i) => {
      const slot = state.slots[i];
      const power = row.querySelector(".mod-power");
      power.setAttribute("aria-pressed", String(slot.enabled));
      power.textContent = slot.enabled ? "Zapnuto" : "Bypass";
      row.classList.toggle("mod-on", slot.enabled);
      for (const key of ["wave", "target", "rate", "depth"]) row.querySelector('[data-prop="' + key + '"]').value = slot[key];
      const percent = Math.round(slot.depth * 100) + " %";
      row.querySelector("output").textContent = percent;
      row.querySelector('[data-prop="depth"]').setAttribute("aria-valuetext", percent);
    });
    draw();
  }

  function opts(dictionary) {
    return Object.entries(dictionary).map(([key, name]) => '<option value="' + key + '">' + name + '</option>').join("");
  }
  function mount(element, context) {
    intersection?.disconnect(); resize?.disconnect();
    host = element; ctx = context; visible = true;
    host.innerHTML = '<div class="mod-slots">' + state.slots.map((_, i) => `<section class="mod-slot" aria-label="LFO ${i + 1}" style="--lfo:${colors[i]}">
      <div class="mod-top"><strong>LFO ${i + 1}</strong><canvas role="img" aria-label="Průběh modulace LFO ${i+1}"></canvas>
      <button type="button" class="mod-power" aria-label="Zapnout LFO ${i + 1}"></button></div>
      <div class="mod-controls"><label>Vlna<select data-prop="wave">${opts(waves)}</select></label><label>Perioda<select data-prop="rate" title="Délka cyklu ve čtyřčtvrťových taktech">${opts(Object.fromEntries(Object.keys(cycles).map(key => [key,key])))}</select></label>
      <label>Cíl<select data-prop="target">${opts(targets)}</select></label>
      <label class="mod-depth"><span>Hloubka <output></output></span><input data-prop="depth" type="range" min="0" max="1" step=".01"></label></div>
      </section>`).join("") + "</div>";
    rows = [...host.querySelectorAll(".mod-slot")];
    rows.forEach((row, i) => {
      const edit = (key, value) => {
        state.slots[i][key] = value;
        runClock(); render(); ctx.changed();
      };
      row.querySelector(".mod-power").onclick = () => edit("enabled", !state.slots[i].enabled);
      row.querySelectorAll("select").forEach(sel => { sel.onchange = () => edit(sel.dataset.prop, sel.value); });
      row.querySelector("input").oninput = event => edit("depth", Number(event.target.value));
    });
    if (window.IntersectionObserver) {
      intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) draw(); });
      intersection.observe(host);
    }
    if (window.ResizeObserver) { resize = new ResizeObserver(draw); resize.observe(host); }
    render(); runClock();
  }

  function loadData(data) {
    const next = data ?? defaults();
    if (!validate(next)) throw new Error("Neplatné nastavení modulační matice.");
    state = clone(next); runClock(); render();
  }

  window.Modulation = { mount, tick, resetPlayback, defaults, getData: () => clone(state), loadData, validate };
})();
