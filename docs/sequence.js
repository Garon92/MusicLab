(() => {
  "use strict";

  const STEPS = 8;
  const STORAGE_KEY = "musiclab.sequence.v1.";
  const modes = {
    rhythm: {
      label: "Nástroj",
      unit: "úder",
      tracks: [
        { name: "Kopák", description: "hluboký buben", icon: "kick", color: "#f58b60" },
        { name: "Virbl", description: "malý buben", icon: "snare", color: "#c4a6e5" },
        { name: "Hi-hat", description: "krátký činel", icon: "hat", color: "#efc34e" },
        { name: "Tlesknutí", description: "zvuk dlaní", icon: "clap", color: "#83c4aa" }
      ],
      presets: [
        { name: "První rytmus", rows: ["10001000", "00100010", "10101010", "00000010"] },
        { name: "Pochod", rows: ["10101010", "00100011", "10001000", "00000010"] },
        { name: "Rozjetý vlak", rows: ["10010100", "00100010", "11111111", "00000100"] }
      ]
    },
    melody: {
      label: "Tón",
      unit: "tón",
      tracks: [
        { name: "A", midi: 69, color: "#c4a6e5" },
        { name: "G", midi: 67, color: "#8abada" },
        { name: "E", midi: 64, color: "#83c4aa" },
        { name: "D", midi: 62, color: "#efc34e" },
        { name: "C", midi: 60, color: "#f58b60" }
      ],
      presets: [
        { name: "První melodie", rows: ["00000000", "00001000", "00100010", "01000000", "10000001"] },
        { name: "Schody", rows: ["00001000", "00010100", "00100010", "01000001", "10000000"] },
        { name: "Otázka a odpověď", rows: ["00000000", "00100000", "01001000", "00000100", "10000010"] }
      ]
    }
  };

  const sessions = new Map();
  let current = null;

  function empty(rows) {
    return Array.from({ length: rows }, () => Array(STEPS).fill(false));
  }

  function readPreset(preset) {
    return preset.rows.map(row => Array.from(row, cell => cell === "1"));
  }

  function validGrid(grid, mode) {
    return Array.isArray(grid) && grid.length === modes[mode].tracks.length &&
      grid.every(row => Array.isArray(row) && row.length === STEPS &&
        row.every(cell => typeof cell === "boolean")) &&
      (mode !== "melody" || grid[0].every((_, step) => grid.filter(row => row[step]).length < 2));
  }

  function openSession(mode) {
    if (sessions.has(mode)) return sessions.get(mode);
    let grid = readPreset(modes[mode].presets[0]);
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + mode));
      if (validGrid(saved, mode)) grid = saved;
    } catch {
      // The sequencer also works when the browser has disabled local storage.
    }
    const session = { grid, undo: [] };
    sessions.set(mode, session);
    return session;
  }

  function remember(grid) {
    const { state, mode } = current;
    state.undo.push(state.grid);
    if (state.undo.length > 32) state.undo.shift();
    state.grid = grid;
    save(mode, state);
  }

  function save(mode, state) {
    try {
      localStorage.setItem(STORAGE_KEY + mode, JSON.stringify(state.grid));
    } catch {
      // Keep the in-memory pattern for this visit.
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, label) {
    const node = el("button", className, label);
    node.type = "button";
    return node;
  }

  function icon(type) {
    const node = el("span", "sq-icon sq-icon-" + type);
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function sample(row) {
    if (current.mode === "rhythm") current.ctx.previewDrum(row);
    else current.ctx.previewNote(current.config.tracks[row].midi);
  }

  function editPad(row, step) {
    const next = current.state.grid.map(cells => cells.slice());
    const on = !next[row][step];
    if (current.mode === "melody" && on) next.forEach(cells => { cells[step] = false; });
    next[row][step] = on;
    remember(next);
    if (on && !current.ctx.isPlaying()) sample(row);
    refresh();
  }

  function navigatePad(event, row, step) {
    let nextRow = row;
    let nextStep = step;
    switch (event.key) {
      case "ArrowLeft": nextStep = Math.max(0, step - 1); break;
      case "ArrowRight": nextStep = Math.min(STEPS - 1, step + 1); break;
      case "ArrowUp": nextRow = Math.max(0, row - 1); break;
      case "ArrowDown": nextRow = Math.min(current.pads.length - 1, row + 1); break;
      case "Home": nextStep = 0; break;
      case "End": nextStep = STEPS - 1; break;
      default: return;
    }
    event.preventDefault();
    current.pads[nextRow][nextStep].focus();
  }

  function makeGrid() {
    const { mode, config, heads, pads } = current;
    const grid = el("div", "sq-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", mode === "rhythm" ? "Rytmická mřížka" : "Melodická mřížka");
    grid.append(el("span", "sq-caption", config.label));
    for (let step = 0; step < STEPS; step++) {
      const beat = step % 2 === 0;
      const head = el("span", "sq-head" + (beat ? " sq-beat" : ""), beat ? String(step / 2 + 1) : "+");
      head.setAttribute("aria-hidden", "true");
      heads.push(head);
      grid.append(head);
    }

    config.tracks.forEach((track, row) => {
      const preview = button("sq-preview");
      preview.style.setProperty("--track-color", track.color);
      const label = "Poslechni si " + (mode === "rhythm" ? track.description : "tón " + track.name);
      preview.title = label;
      preview.setAttribute("aria-label", track.name + ". " + label);
      preview.append(icon(track.icon || "note"), el("span", "sq-name", track.name));
      preview.addEventListener("click", () => sample(row));
      grid.append(preview);
      const cells = [];
      for (let step = 0; step < STEPS; step++) {
        const pad = button("sq-pad" + (step % 2 === 0 ? " sq-downbeat" : ""));
        pad.style.setProperty("--track-color", track.color);
        pad.tabIndex = row === 0 && step === 0 ? 0 : -1;
        const beat = Math.floor(step / 2) + 1;
        const position = step % 2 === 0 ? "doba " + beat : "mezi dobou " + beat + " a " + (beat % 4 + 1);
        pad.setAttribute("aria-label", track.name + ", krok " + (step + 1) + ", " + position);
        pad.addEventListener("click", () => editPad(row, step));
        pad.addEventListener("keydown", event => navigatePad(event, row, step));
        pad.addEventListener("focus", () => {
          current.focusedPad.tabIndex = -1;
          current.focusedPad = pad;
          pad.tabIndex = 0;
        });
        cells.push(pad);
        grid.append(pad);
      }
      pads.push(cells);
    });
    current.focusedPad = pads[0][0];
    return grid;
  }

  function makeTools() {
    const { config } = current;
    const tools = el("div", "sq-tools");
    const presets = el("label", "sq-presets");
    presets.append(el("span", "sq-tool-label", "Vzor"));
    const selectWrap = el("span", "sq-select-wrap");
    const select = el("select", "sq-select");
    config.presets.forEach((preset, index) => select.add(new Option(preset.name, String(index))));
    const custom = new Option("Vlastní vzor", "custom");
    custom.disabled = true;
    select.add(custom);
    select.addEventListener("change", () => {
      const preset = config.presets[Number(select.value)];
      if (!preset) return;
      remember(readPreset(preset));
      refresh();
    });
    selectWrap.append(select);
    presets.append(selectWrap);
    const actions = el("div", "sq-actions");
    const undo = button("sq-action sq-undo", "Zpět");
    undo.prepend(icon("undo"));
    undo.title = "Vrátit poslední úpravu";
    undo.setAttribute("aria-label", undo.title);
    undo.addEventListener("click", () => {
      if (!current.state.undo.length) return;
      current.state.grid = current.state.undo.pop();
      save(current.mode, current.state);
      refresh();
    });
    const clear = button("sq-action", "Vymazat");
    clear.prepend(icon("erase"));
    clear.title = "Vymazat všechna políčka";
    clear.addEventListener("click", () => {
      remember(empty(config.tracks.length));
      refresh();
      current.ctx.notify("Políčka jsou prázdná. Tlačítko Zpět vrátí poslední vzor.");
    });
    actions.append(undo, clear);
    tools.append(presets, actions);
    Object.assign(current, { undo, clear, select });
    return tools;
  }

  function refresh() {
    const { state, pads, config, select, undo, clear } = current;
    pads.forEach((row, index) => row.forEach((cell, step) => {
      cell.setAttribute("aria-pressed", String(state.grid[index][step]));
    }));
    const rows = state.grid.map(row => row.map(cell => cell ? "1" : "0").join(""));
    const presetIndex = config.presets.findIndex(preset => preset.rows.every((row, i) => rows[i] === row));
    select.value = presetIndex < 0 ? "custom" : String(presetIndex);
    undo.disabled = !state.undo.length;
    clear.disabled = !state.grid.some(row => row.includes(true));
  }

  function unmount() {
    if (!current) return;
    current.root.remove();
    current = null;
  }

  function mount(host, mode, ctx) {
    unmount();
    if (!modes[mode]) throw new Error("Neznámý režim sekvenceru");
    const root = el("div", "sq sq-" + mode);
    current = { mode, config: modes[mode], state: openSession(mode), ctx, root, heads: [], pads: [], step: -1 };
    root.append(makeGrid(), makeTools());
    host.replaceChildren(root);
    refresh();
  }

  function tick(step, time) {
    if (!current) return;
    const { state, mode, config, ctx } = current;
    state.grid.forEach((row, index) => {
      if (!row[step]) return;
      if (mode === "rhythm") ctx.playDrum(index, time);
      else ctx.playNote(config.tracks[index].midi, time);
    });
  }

  function highlight(step) {
    if (!current || current.step === step) return;
    const { heads, pads } = current;
    function mark(index, playing) {
      if (index < 0 || index >= STEPS) return;
      heads[index].classList.toggle("sq-current", playing);
      pads.forEach(row => row[index].classList.toggle("sq-current", playing));
    }
    mark(current.step, false);
    mark(step, true);
    current.step = step;
  }

  window.Sequencer = { mount, unmount, tick, highlight, resetPlayback: () => highlight(-1) };
})();
