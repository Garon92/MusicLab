(() => {
  "use strict";

  const steps = 16;
  const emptyRow = "0".repeat(steps);
  const tracks = ["drums", "bass", "lead"];
  const pitches = [12, 11, 9, 7, 5, 4, 2, 0];
  const syllables = ["C", "H", "A", "G", "F", "E", "D", "C"];
  const drumNames = ["Kick", "Snare", "Hi-hat", "Clap"];
  const colors = ["#bbf57b", "#80dea4", "#66d0ae", "#6ad8d3"];
  const symbols = {
    drums: '<ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v9c0 4 16 4 16 0V7M7 10l2 6 3-5 3 5 2-6"/>',
    bass: '<path d="M2 12h3l3-6 4 13 4-15 3 8h3"/>',
    lead: '<path d="M2 15h4V7h5v10h5V9h6"/>',
    play: '<path d="m8 5 10 7-10 7z" fill="currentColor" stroke="none"/>'
  };

  const factory = [
    {
      drums: [[0, 7, 8, 10], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [12]],
      bass: [[0, 0], [6, 7], [8, 0], [14, 4]],
      lead: [[2, 4], [5, 7], [10, 9], [13, 7]]
    },
    {
      drums: [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14], [4, 12, 15]],
      bass: [[0, 0], [3, 0], [6, 4], [8, 7], [11, 4], [14, 2]],
      lead: [[2, 0], [2, 4], [2, 7], [10, 2], [10, 7], [10, 11]]
    },
    {
      drums: [[0, 6, 10], [4, 12], [0, 2, 3, 6, 8, 10, 14], [7, 12]],
      bass: [[0, 5], [5, 0], [8, 5], [14, 7]],
      lead: [[1, 5], [4, 9], [7, 7], [10, 5], [14, 9]]
    },
    {
      drums: [[0, 8, 14], [4, 11, 12], [0, 2, 4, 6, 8, 10, 12, 14, 15], [4, 12]],
      bass: [[0, 7], [4, 2], [8, 7], [10, 9], [12, 7], [15, 2]],
      lead: [[0, 2], [0, 7], [0, 11], [6, 9], [10, 7], [14, 2]]
    }
  ];

  function replaceStep(row, step, on) {
    return row.slice(0, step) + (on ? "1" : "0") + row.slice(step + 1);
  }

  function melodicRows(events) {
    const rows = pitches.map(() => emptyRow);
    events.forEach(([step, pitch]) => {
      const row = pitches.indexOf(pitch);
      rows[row] = replaceStep(rows[row], step, true);
    });
    return rows;
  }

  function defaults() {
    return {
      banks: factory.map(pattern => ({
        drums: pattern.drums.map(hits => Array.from({ length: steps }, (_, step) => hits.includes(step) ? "1" : "0").join("")),
        bass: melodicRows(pattern.bass),
        lead: melodicRows(pattern.lead)
      }))
    };
  }

  function validTrack(rows, track) {
    const count = track === "drums" ? drumNames.length : pitches.length;
    if (!Array.isArray(rows) || rows.length !== count ||
        !rows.every(row => typeof row === "string" && /^[01]{16}$/.test(row))) return false;
    if (track === "bass") {
      for (let i = 0; i < steps; i++) {
        if (rows.filter(row => row[i] === "1").length > 1) return false;
      }
    }
    return true;
  }

  function validate(data) {
    return !!data && Array.isArray(data.banks) && data.banks.length === factory.length &&
      data.banks.every(bank => bank && tracks.every(track => validTrack(bank[track], track)));
  }

  function clone(data) {
    return { banks: data.banks.map(bank => ({
      drums: bank.drums.slice(), bass: bank.bass.slice(), lead: bank.lead.slice()
    })) };
  }

  let data = defaults();
  let selectedTrack = "drums";
  let selectedBank = 0;
  let playhead = -1;
  let ui = null;
  let paint = null;
  let focused = [0, 0];
  const history = new Map();

  function rows() { return data.banks[selectedBank][selectedTrack]; }
  function undoKey() { return selectedBank + "-" + selectedTrack; }

  function remember() {
    const key = undoKey();
    if (!history.has(key)) history.set(key, []);
    const list = history.get(key);
    list.push(rows().slice());
    if (list.length > 40) list.shift();
  }

  function emitChange() {
    refreshCells();
    ui?.ctx.changed?.();
  }

  function canUndo() {
    return Boolean(history.get(undoKey())?.length);
  }

  function undo() {
    if (!canUndo()) return false;
    paint = null;
    data.banks[selectedBank][selectedTrack] = history.get(undoKey()).pop();
    emitChange();
    return true;
  }

  function clear() {
    paint = null;
    if (rows().every(row => row === emptyRow)) return false;
    remember();
    data.banks[selectedBank][selectedTrack] = rows().map(() => emptyRow);
    emitChange();
    return true;
  }

  function replaceDrumRow(row, bits) {
    if (!Number.isInteger(row) || row < 0 || row >= drumNames.length) return false;
    if (Array.isArray(bits) && bits.length === steps && bits.every(value => [0, 1, false, true].includes(value))) {
      bits = bits.map(value => value ? "1" : "0").join("");
    }
    if (typeof bits !== "string" || bits.length !== steps || /[^01]/.test(bits)) return false;
    paint = null;
    setTrack("drums");
    if (rows()[row] === bits) return false;
    remember();
    rows()[row] = bits;
    emitChange();
    return true;
  }

  function pick(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function variation() {
    if (selectedTrack === "drums") {
      const pulses = [
        pick([[0, 8, 10], [0, 7, 8], [0, 6, 10], [0, 4, 8, 12]]),
        pick([[4, 12], [4, 12, 15], [4, 11, 12]]),
        pick([[0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14], [0, 2, 6, 8, 10, 14, 15]]),
        pick([[12], [4, 12], [7, 12], [4, 14]])
      ];
      return pulses.map(hits => Array.from({ length: steps }, (_, step) => hits.includes(step) ? "1" : "0").join(""));
    }
    const roots = [0, 0, 5, 7];
    const scale = selectedTrack === "bass" ? [0, 2, 4, 5, 7, 9] : [0, 2, 4, 7, 9, 12];
    const rhythm = selectedTrack === "bass"
      ? pick([[0, 6, 8, 14], [0, 3, 6, 8, 12], [0, 4, 8, 11, 14]])
      : pick([[1, 4, 7, 10, 14], [2, 5, 10, 13], [0, 3, 6, 10, 12, 14]]);
    return melodicRows(rhythm.map((step, i) => [step, i === 0 ? roots[selectedBank] : pick(scale)]));
  }

  function randomize() {
    paint = null;
    const next = variation();
    if (next.every((row, i) => row === rows()[i])) {
      // Keep a generated variation audible even when the draw matches the current pattern.
      const row = next.length - 1;
      if (selectedTrack === "bass") next.forEach((line, i) => { next[i] = replaceStep(line, 15, false); });
      next[row] = replaceStep(next[row], 15, next[row][15] !== "1");
    }
    remember();
    data.banks[selectedBank][selectedTrack] = next;
    emitChange();
    return true;
  }

  function loadData(value) {
    if (!validate(value)) return false;
    data = clone(value);
    paint = null;
    history.clear();
    refreshCells();
    return true;
  }

  function setBank(index) {
    if (!Number.isInteger(index) || index < 0 || index >= data.banks.length) return false;
    paint = null;
    selectedBank = index;
    refreshCells();
    return true;
  }

  function setTrack(track) {
    if (!tracks.includes(track)) return false;
    if (selectedTrack !== track) {
      paint = null;
      selectedTrack = track;
      focused = [0, 0];
      renderGrid();
      ui?.ctx.trackChanged?.(track);
    }
    return true;
  }

  function midi(track, row) { return (track === "bass" ? 36 : 60) + pitches[row]; }

  function preview(row) {
    if (selectedTrack === "drums") ui.ctx.previewDrum?.(row);
    else ui.ctx.previewNote?.(selectedTrack, midi(selectedTrack, row));
  }

  function edit(row, step, on) {
    const lines = rows();
    if ((lines[row][step] === "1") === on) return;
    if (selectedTrack === "bass" && on) {
      lines.forEach((line, i) => { lines[i] = replaceStep(line, step, false); });
    }
    lines[row] = replaceStep(lines[row], step, on);
    if (on && !ui.ctx.getPlaying?.()) preview(row);
    emitChange();
  }

  function tick(step, time, stepDuration) {
    const engine = ui?.ctx.Engine || window.Engine;
    if (!engine || !Number.isInteger(step) || step < 0 || step >= steps) return;
    const bank = data.banks[selectedBank];
    const unit = Number.isFinite(stepDuration) && stepDuration > 0 ? stepDuration : 0.125;
    bank.drums.forEach((line, row) => {
      if (line[step] !== "1") return;
      const weight = row === 2 ? (step % 4 === 0 ? 0.78 : step % 2 === 0 ? 0.61 : 0.46) : (step % 4 === 0 ? 0.96 : 0.78);
      engine.drum(row, time, weight);
    });
    for (const track of ["bass", "lead"]) {
      const grid = bank[track];
      let length = 1;
      while (length < (track === "bass" ? 3 : 2) && step + length < steps &&
             grid.every(line => line[step + length] !== "1")) length++;
      grid.forEach((line, row) => {
        if (line[step] === "1") engine.note(track, midi(track, row), time, unit * (length - 0.12), track === "bass" ? 0.82 : 0.65);
      });
    }
  }

  function htmlElement(tag, cls, text) {
    const el = document.createElement(tag);
    el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function icon(name) {
    const wrap = htmlElement("span", "pat-icon");
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + symbols[name] + "</svg>";
    return wrap;
  }

  function rowLabel(row) {
    if (selectedTrack === "drums") return drumNames[row];
    return syllables[row] + (selectedTrack === "bass" ? (row ? 2 : 3) : (row ? 4 : 5));
  }

  function renderGrid() {
    if (!ui) return;
    const { grid, tabs } = ui;
    tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(tracks[i] === selectedTrack)));
    grid.classList.toggle("pat-tonal", selectedTrack !== "drums");
    grid.replaceChildren();
    ui.heads = [];
    ui.pads = [];
    grid.append(htmlElement("span", "pat-gutter"));
    for (let step = 0; step < steps; step++) {
      const head = htmlElement("span", "pat-count", String(step + 1).padStart(2, "0"));
      head.setAttribute("aria-hidden", "true");
      head.dataset.step = String(step);
      ui.heads.push(head);
      grid.append(head);
    }
    rows().forEach((_, row) => {
      const name = rowLabel(row);
      const label = htmlElement("button", "pat-row");
      label.type = "button";
      label.title = "Poslechnout " + name;
      label.setAttribute("aria-label", label.title);
      const stripe = htmlElement("span", "pat-stripe");
      const color = selectedTrack === "drums" ? colors[row] : selectedTrack === "bass" ? colors[1] : colors[3];
      stripe.style.background = color;
      label.append(stripe, htmlElement("span", "", name), icon("play"));
      label.addEventListener("click", () => preview(row));
      grid.append(label);
      const cells = [];
      for (let step = 0; step < steps; step++) {
        const cell = htmlElement("button", "pat-pad");
        cell.type = "button";
        cell.dataset.step = String(step);
        cell.dataset.row = String(row);
        cell.style.setProperty("--pat-voice", color);
        cell.setAttribute("aria-label", name + ", krok " + (step + 1));
        cell.tabIndex = focused[0] === row && focused[1] === step ? 0 : -1;
        cells.push(cell);
        grid.append(cell);
      }
      ui.pads.push(cells);
    });
    refreshCells();
    applyHighlight(playhead, true);
  }

  function refreshCells() {
    if (!ui) return;
    const lines = rows();
    ui.pads.forEach((pads, row) => pads.forEach((pad, step) => {
      const state = String(lines[row][step] === "1");
      if (pad.getAttribute("aria-pressed") !== state) pad.setAttribute("aria-pressed", state);
    }));
  }

  function applyHighlight(step, lit) {
    if (!ui || step < 0) return;
    ui.heads[step]?.classList.toggle("pat-now", lit);
    ui.pads.forEach(row => row[step]?.classList.toggle("pat-now", lit));
  }

  function highlight(step) {
    const next = Number.isInteger(step) && step >= 0 && step < steps ? step : -1;
    if (playhead === next) return;
    applyHighlight(playhead, false);
    playhead = next;
    applyHighlight(playhead, true);
  }

  function keyNav(event) {
    const cell = event.target.closest(".pat-pad");
    if (!cell) return;
    let [row, step] = focused;
    switch (event.key) {
      case "ArrowLeft": step = Math.max(0, step - 1); break;
      case "ArrowRight": step = Math.min(steps - 1, step + 1); break;
      case "ArrowUp": row = Math.max(0, row - 1); break;
      case "ArrowDown": row = Math.min(ui.pads.length - 1, row + 1); break;
      case "Home": step = 0; break;
      case "End": step = steps - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    ui.pads[row][step].focus();
  }

  function mount(host, ctx) {
    ui?.controller.abort();
    paint = null;
    const controller = new AbortController();
    const { signal } = controller;
    const panel = htmlElement("div", "pat");
    const toolbar = htmlElement("div", "pat-tools");
    const selector = htmlElement("div", "pat-tracks");
    selector.setAttribute("role", "group");
    selector.setAttribute("aria-label", "Upravovaná stopa");
    const tabs = tracks.map(track => {
      const btn = htmlElement("button", "pat-track");
      btn.type = "button";
      btn.append(icon(track), htmlElement("span", "", track.toUpperCase()));
      btn.addEventListener("click", () => setTrack(track));
      selector.append(btn);
      return btn;
    });
    toolbar.append(selector);
    const overflow = htmlElement("div", "pat-scroll");
    const grid = htmlElement("div", "pat-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Krokový sekvencer");
    overflow.append(grid);
    panel.append(toolbar, overflow);
    host.replaceChildren(panel);
    ui = { ctx, grid, tabs, pads: [], heads: [], controller };
    renderGrid();
    grid.addEventListener("focusin", event => {
      const cell = event.target.closest(".pat-pad");
      if (!cell) return;
      ui.pads[focused[0]][focused[1]].tabIndex = -1;
      focused = [Number(cell.dataset.row), Number(cell.dataset.step)];
      cell.tabIndex = 0;
    });
    grid.addEventListener("keydown", keyNav);
    grid.addEventListener("pointerdown", event => {
      const cell = event.target.closest(".pat-pad");
      if (!cell || !event.isPrimary || event.button !== 0) return;
      const row = Number(cell.dataset.row);
      const step = Number(cell.dataset.step);
      paint = { id: event.pointerId, on: rows()[row][step] !== "1" };
      cell.focus({ preventScroll: true });
      remember();
      edit(row, step, paint.on);
    });
    grid.addEventListener("pointerover", event => {
      const cell = event.target.closest(".pat-pad");
      if (!cell || !paint || paint.id !== event.pointerId || !(event.buttons & 1)) return;
      edit(Number(cell.dataset.row), Number(cell.dataset.step), paint.on);
    });
    const release = event => { if (paint?.id === event.pointerId) paint = null; };
    window.addEventListener("pointerup", release, { signal });
    window.addEventListener("pointercancel", release, { signal });
    window.addEventListener("blur", () => { paint = null; }, { signal });
    grid.addEventListener("click", event => {
      const cell = event.target.closest(".pat-pad");
      if (!cell || event.detail !== 0) return;
      const row = Number(cell.dataset.row);
      const step = Number(cell.dataset.step);
      remember();
      edit(row, step, rows()[row][step] !== "1");
    });
  }

  window.Patterns = {
    mount, setTrack, setBank, tick, highlight, getData: () => clone(data), loadData,
    defaults, validate, randomize, clear, undo, canUndo, replaceDrumRow,
    getTrack: () => selectedTrack, getBank: () => selectedBank
  };
})();
