(() => {
  "use strict";

  const steps = 16;
  const voices = ["Kick", "Snare", "Hi-hat", "Clap"];
  const integer = (x, low, high) => Number.isInteger(x) && x >= low && x <= high;
  const defaults = () => ({ mode: "euclid", pulses: 5, rotation: 0, seed: 44257, inverted: false, voice: 0 });
  let state = defaults();
  let ui = null;

  function validate(value) {
    return !!value && ["euclid", "lfsr"].includes(value.mode) && integer(value.pulses, 0, steps) &&
      integer(value.rotation, 0, steps - 1) && integer(value.seed, 1, 65535) &&
      typeof value.inverted === "boolean" && integer(value.voice, 0, voices.length - 1);
  }

  function loadData(value) {
    if (!validate(value)) return false;
    state = { mode: value.mode, pulses: value.pulses, rotation: value.rotation,
      seed: value.seed, inverted: value.inverted, voice: value.voice };
    render();
    return true;
  }

  function rhythm() {
    let pattern;
    if (state.mode === "euclid") {
      // Successive multiples of k distribute k pulses over the sixteen possible residues.
      pattern = Array.from({ length: steps }, (_, i) => i * state.pulses % steps < state.pulses);
    } else {
      // A 16-bit maximal-period Galois LFSR ranks positions. Picking k preserves the pulse count.
      let register = state.seed;
      const ranked = Array.from({ length: steps }, (_, index) => {
        for (let i = 0; i < 8; i++) register = (register >>> 1) ^ ((register & 1) ? 0xb400 : 0);
        return { index, rank: register };
      }).sort((a, b) => a.rank - b.rank);
      pattern = Array(steps).fill(false);
      ranked.slice(0, state.pulses).forEach(({ index }) => { pattern[index] = true; });
    }
    return pattern.map((_, i) => pattern[(steps + i - state.rotation) % steps] !== state.inverted);
  }

  function output() {
    render();
    ui?.ctx.changed();
  }

  function newSeed() {
    const values = new Uint16Array(1);
    do { crypto.getRandomValues(values); } while (!values[0] || values[0] === state.seed);
    state.seed = values[0];
    output();
  }

  function ring() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 200 168");
    svg.setAttribute("role", "img");
    function draw(tag, attrs, text) {
      const node = document.createElementNS(svg.namespaceURI, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      if (text !== undefined) node.textContent = text;
      svg.append(node);
      return node;
    }
    const point = (i, radius) => {
      const angle = Math.PI * i / 8 - Math.PI / 2;
      return [100 + Math.cos(angle) * radius, 84 + Math.sin(angle) * radius];
    };
    for (const r of [34, 60]) draw("circle", { cx: 100, cy: 84, r, class: "gn-ring-guide" });
    for (let i = 0; i < steps; i++) {
      const [x1, y1] = point(i, i % 4 ? 52 : 39);
      const [x2, y2] = point(i, 65);
      draw("line", { x1, y1, x2, y2, class: "gn-spoke" });
      if (i % 4 === 0) {
        const [x, y] = point(i, 75);
        draw("text", { x, y, class: "gn-ring-number", "text-anchor": "middle", "dominant-baseline": "central" }, String(i + 1).padStart(2, "0"));
      }
    }
    const polygon = draw("polygon", { class: "gn-polygon" });
    const points = [], dots = [];
    for (let i = 0; i < steps; i++) {
      const [cx, cy] = point(i, 60);
      points.push(cx + "," + cy);
      dots.push(draw("circle", { cx, cy, r: 4.3, class: "gn-dot" }));
    }
    return { svg, polygon, points, dots };
  }

  function refresh() {
    if (!ui) return;
    const bank = ui.ctx.getBank();
    ui.transfer.textContent = "Přenést do banky " + "ABCD"[bank];
    ui.undo.disabled = !(window.Patterns.getBank() === bank && window.Patterns.getTrack() === "drums" && window.Patterns.canUndo());
  }

  function render() {
    if (!ui) return;
    const pattern = rhythm();
    const count = pattern.filter(Boolean).length;
    const { svg, dots, polygon, points } = ui.ring;
    svg.setAttribute("aria-label", "Aktivní kroky " +
      (pattern.map((hit, i) => hit ? i + 1 : 0).filter(Boolean).join(", ") || "žádné"));
    dots.forEach((dot, i) => dot.classList.toggle("gn-on", pattern[i]));
    polygon.setAttribute("points", points.filter((_, i) => pattern[i]).join(" "));
    ui.total.textContent = count + " / 16";
    ui.pulses.value = String(state.pulses); ui.pulseValue.textContent = String(state.pulses);
    ui.rotation.value = String(state.rotation); ui.rotValue.textContent = String(state.rotation);
    ui.seed.value = String(state.seed);
    ui.seed.disabled = ui.dice.disabled = state.mode !== "lfsr";
    ui.euclid.setAttribute("aria-pressed", String(state.mode === "euclid"));
    ui.lfsr.setAttribute("aria-pressed", String(state.mode === "lfsr"));
    ui.invert.setAttribute("aria-pressed", String(state.inverted));
    ui.voice.value = String(state.voice);
    refresh();
  }

  function mount(host, ctx) {
    const panel = document.createElement("div");
    panel.className = "gn-lab";
    panel.innerHTML = `
      <div class="gn-display"><div class="gn-orbit"></div><div class="gn-readout"><span>Aktivní kroky</span><strong></strong></div></div>
      <div class="gn-params">
        <div class="gn-mode" role="group" aria-label="Algoritmus"><button type="button" data-euclid>Eukleidovský</button><button type="button" data-lfsr>LFSR 16 bit</button></div>
        <label class="gn-slider"><span>Počet pulzů</span><output data-pulse-value></output><input type="range" min="0" max="16" step="1" data-pulses></label>
        <label class="gn-slider"><span>Rotace</span><output data-rot-value></output><input type="range" min="0" max="15" step="1" data-rotation></label>
        <div class="gn-seed-line"><label>Seed <input type="number" data-seed min="1" max="65535" step="1"></label><button type="button" data-dice>Nový seed</button><button type="button" data-invert>Inverze</button></div>
      </div>
      <div class="gn-actions"><label>Bicí stopa <select data-voice></select></label><button class="btn" type="button" data-transfer></button><button class="btn" type="button" data-undo>Zpět</button></div>`;
    const one = name => panel.querySelector(name);
    const chart = ring();
    one(".gn-orbit").append(chart.svg);
    ui = { ctx, ring: chart, total: one(".gn-readout strong"), pulses: one("[data-pulses]"), rotation: one("[data-rotation]"),
      pulseValue: one("[data-pulse-value]"), rotValue: one("[data-rot-value]"), seed: one("[data-seed]"), dice: one("[data-dice]"),
      euclid: one("[data-euclid]"), lfsr: one("[data-lfsr]"), invert: one("[data-invert]"), voice: one("[data-voice]"),
      transfer: one("[data-transfer]"), undo: one("[data-undo]") };
    voices.forEach((label, value) => ui.voice.add(new Option(label, String(value))));
    for (const key of ["euclid", "lfsr"]) ui[key].addEventListener("click", () => { state.mode = key; output(); });
    for (const key of ["pulses", "rotation"]) ui[key].addEventListener("input", () => {
      state[key] = ui[key].valueAsNumber; output();
    });
    ui.seed.addEventListener("change", () => {
      if (integer(ui.seed.valueAsNumber, 1, 65535)) { state.seed = ui.seed.valueAsNumber; output(); }
      else ui.seed.value = String(state.seed);
    });
    ui.dice.addEventListener("click", newSeed);
    ui.invert.addEventListener("click", () => { state.inverted = !state.inverted; output(); });
    ui.voice.addEventListener("change", () => { state.voice = Number(ui.voice.value); output(); });
    ui.transfer.addEventListener("click", () => {
      const bank = ctx.getBank();
      window.Patterns.setBank(bank);
      const changed = window.Patterns.replaceDrumRow(state.voice, rhythm());
      ctx.notify(changed ? voices[state.voice] + " v bance " + "ABCD"[bank] + " má nový rytmus." : "Stopa už má tento rytmus.");
      refresh();
    });
    ui.undo.title = "Vrátit poslední úpravu bicích ve vybrané bance";
    ui.undo.addEventListener("click", () => {
      if (window.Patterns.getTrack() === "drums" && window.Patterns.getBank() === ctx.getBank()) window.Patterns.undo();
      refresh();
    });
    host.replaceChildren(panel);
    render();
  }

  window.Generator = { mount, defaults, getData: () => ({ ...state }), validate, loadData, refresh };
})();
