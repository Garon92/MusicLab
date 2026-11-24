(() => {
  "use strict";

  const modes = {
    major: { name: "Dur", notes: [0, 2, 4, 5, 7, 9, 11] },
    minor: { name: "Přirozená moll", notes: [0, 2, 3, 5, 7, 8, 10] },
    dorian: { name: "Dórská", notes: [0, 2, 3, 5, 7, 9, 10] },
    mixolydian: { name: "Mixolydická", notes: [0, 2, 4, 5, 7, 9, 10] },
    harmonic: { name: "Harmonická moll", notes: [0, 2, 3, 5, 7, 8, 11] }
  };
  const letters = ["C", "D", "E", "F", "G", "A", "H"];
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const rootLetters = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII"];
  const generators = { manual: "Ručně", chords: "Akordy", arp: "Arpeggio" };
  const directions = { up: "Nahoru", down: "Dolů", both: "Nahoru a dolů" };
  const inversionNames = ["Základní tvar", "1. obrat", "2. obrat", "3. obrat"];
  const byValue = (...values) => values.map(value => [value, String(value)]);
  const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

  function defaults() {
    return {
      root: 0, scale: "major", octave: 3, degree: 0, seventh: false, inversion: 0, slot: 0,
      progression: [0, 4, 5, 3].map(degree => ({ degree, seventh: false, inversion: 0 })),
      generator: "manual", direction: "up", span: 8, rate: 2, harmonize: false
    };
  }

  function validChord(chord) {
    return chord && integer(chord.degree, 0, 6) && typeof chord.seventh === "boolean" &&
      integer(chord.inversion, 0, chord.seventh ? 3 : 2);
  }

  function validate(value) {
    return !!value && integer(value.root, 0, 11) && Object.hasOwn(modes, value.scale) &&
      integer(value.octave, 2, 5) && validChord(value) && Array.isArray(value.progression) &&
      integer(value.progression.length, 4, 8) && value.progression.every(validChord) &&
      integer(value.slot, 0, value.progression.length - 1) && Object.hasOwn(generators, value.generator) &&
      Object.hasOwn(directions, value.direction) && [4, 8, 16].includes(value.span) && [1, 2, 4].includes(value.rate) &&
      (value.harmonize === undefined || typeof value.harmonize === "boolean");
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  let state = defaults();
  let ui = null;
  let lastStep = -1;
  let cycle = 0;
  let marked = -1;
  const scheduled = Array(16).fill(-1);

  function loadData(value) {
    if (!validate(value)) return false;
    state = { ...defaults(), ...copy(value) };
    resetPlayback();
    sync();
    return true;
  }

  function writtenNote(pitchClass, letter) {
    const diff = (pitchClass - natural[letter] + 18) % 12 - 6;
    if (letter === 6 && diff === -1) return "B";
    return letters[letter] + (diff < 0 ? "♭".repeat(-diff) : "♯".repeat(diff));
  }

  function tone(degree) {
    const index = degree % 7;
    const relative = state.root + modes[state.scale].notes[index] + Math.floor(degree / 7) * 12;
    const midi = (state.octave + 1) * 12 + relative;
    const letter = (rootLetters[state.root] + index) % 7;
    const octave = state.octave + Math.floor((rootLetters[state.root] + degree) / 7);
    return { midi, name: writtenNote(relative % 12, letter), octave };
  }

  function chordInfo(chord) {
    const notes = (chord.seventh ? [0, 2, 4, 6] : [0, 2, 4]).map(offset => tone(chord.degree + offset));
    const root = notes[0];
    const third = notes[1].midi - root.midi;
    const fifth = notes[2].midi - root.midi;
    const minor = third === 3;
    let symbol = minor ? "m" : "";
    let roman = minor ? romans[chord.degree].toLowerCase() : romans[chord.degree];
    if (fifth === 6) { symbol = "dim"; roman += "°"; }
    if (fifth === 8) { symbol = "+"; roman += "+"; }
    if (chord.seventh) {
      const seventh = notes[3].midi - root.midi;
      if (fifth === 6 && seventh === 10) symbol = "m7♭5";
      else symbol += seventh === 11 ? "maj7" : "7";
    }
    for (let i = 0; i < chord.inversion; i++) {
      const bass = notes.shift();
      notes.push({ ...bass, midi: bass.midi + 12, octave: bass.octave + 1 });
    }
    return { name: root.name + symbol, roman, notes, bass: chord.inversion ? "/" + notes[0].name : "" };
  }

  function hear(chord) {
    if (!ui) return;
    const { engine, preview } = ui.ctx;
    const voices = chordInfo(chord).notes;
    const play = () => {
      const time = engine.now();
      voices.forEach(note => engine.note("keys", note.midi, time, 0.72, 0.65));
    };
    if (preview) preview(play);
    else play();
  }

  function currentChord() {
    const { degree, seventh, inversion } = state;
    return { degree, seventh, inversion };
  }

  function liveNotes(midi) {
    if (!integer(midi, 0, 127)) return [];
    if (!state.harmonize) return [midi];
    const degree = modes[state.scale].notes.indexOf((midi - state.root + 132) % 12);
    if (degree < 0) return [midi];
    const offset = midi - tone(degree).midi;
    const result = chordInfo({ ...currentChord(), degree }).notes
      .map(note => note.midi + offset).filter(value => integer(value, 0, 127));
    return result.length ? result : [midi];
  }

  function changed() { sync(); ui?.ctx.changed?.(); }

  function tick(step, time, duration, bar) {
    const engine = ui?.ctx.engine || window.Engine;
    if (!engine || !integer(step, 0, 15) || !Number.isFinite(duration) || duration <= 0) return;
    if (lastStep >= 0 && step < lastStep) cycle++;
    lastStep = step;
    const position = (Number.isSafeInteger(bar) && bar >= 0 ? bar : cycle) * 16 + step;
    const index = Math.floor(position / state.span) % state.progression.length;
    scheduled[step] = state.generator === "manual" ? -1 : index;
    if (state.generator === "manual") return;
    const inside = position % state.span;
    if (state.generator === "chords") {
      if (inside !== 0) return;
      chordInfo(state.progression[index]).notes.forEach(note => {
        engine.note("keys", note.midi, time, duration * state.span * 0.89, 0.54);
      });
    } else if (inside % state.rate === 0) {
      const notes = chordInfo(state.progression[index]).notes;
      const n = inside / state.rate;
      let voice = n % notes.length;
      if (state.direction === "down") voice = notes.length - 1 - voice;
      if (state.direction === "both") {
        const travel = notes.length * 2 - 2;
        voice = Math.min(n % travel, travel - n % travel);
      }
      engine.note("keys", notes[voice].midi, time, duration * state.rate * 0.79, 0.67);
    }
  }

  function mark(index) {
    if (marked === index) return;
    marked = index;
    ui?.slots.forEach((btn, i) => btn.classList.toggle("hr-playing", i === index));
  }

  function highlight(step) { mark(integer(step, 0, 15) ? scheduled[step] : -1); }

  function resetPlayback() {
    lastStep = -1;
    cycle = 0;
    scheduled.fill(-1);
    mark(-1);
  }

  function el(type, cls, text) {
    const node = document.createElement(type);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function btn(cls, text) {
    const node = el("button", cls, text);
    node.type = "button";
    return node;
  }

  function select(label, key, options, action) {
    const field = el("label", "hr-field");
    const name = el("span", "hr-label", label);
    const wrap = el("span", "hr-select-wrap");
    const choice = el("select", "hr-select");
    options.forEach(([value, title]) => choice.add(new Option(title, String(value))));
    choice.addEventListener("change", () => { action(choice.value); changed(); });
    wrap.append(choice);
    field.append(name, wrap);
    ui.inputs[key] = choice;
    return field;
  }

  function update(key, value) { state[key] = value; }

  function makeKeyControls() {
    const fields = el("div", "hr-key");
    fields.append(
      select("Základní tón", "root", rootLetters.map((letter, i) => [i, writtenNote(i, letter)]), value => update("root", Number(value))),
      select("Stupnice", "scale", Object.entries(modes).map(([id, mode]) => [id, mode.name]), value => update("scale", value)),
      select("Oktáva", "octave", byValue(2, 3, 4, 5), value => update("octave", Number(value))),
      select("Obrat", "inversion", inversionNames.map((title, i) => [i, title]), value => update("inversion", Number(value)))
    );
    const seventh = btn("hr-seventh", "Septakord");
    seventh.setAttribute("aria-label", "Přidat septimu");
    seventh.addEventListener("click", () => {
      state.seventh = !state.seventh;
      if (!state.seventh) state.inversion = Math.min(state.inversion, 2);
      changed();
      hear(currentChord());
    });
    const harmonize = btn("hr-seventh", "Harmonizovat klaviaturu");
    harmonize.title = "Ke každému tónu stupnice na klaviatuře přidá akord";
    harmonize.addEventListener("click", () => {
      state.harmonize = !state.harmonize;
      changed();
    });
    fields.append(seventh, harmonize);
    ui.seventh = seventh;
    ui.harmonize = harmonize;
    return fields;
  }

  function makeChordPads() {
    const pads = el("div", "hr-pads");
    pads.setAttribute("role", "group");
    pads.setAttribute("aria-label", "Akordy ve stupnici");
    ui.pads = romans.map((_, degree) => {
      const node = btn("hr-chord-pad");
      const roman = el("span", "hr-roman");
      const name = el("strong", "hr-pad-name");
      node.append(roman, name);
      node.addEventListener("click", () => {
        state.degree = degree;
        changed();
        hear(currentChord());
      });
      pads.append(node);
      return { node, roman, name };
    });
    return pads;
  }

  function makeReadout() {
    const readout = el("div", "hr-readout");
    const current = el("div", "hr-voicing");
    ui.chordName = el("strong", "hr-current-name");
    ui.notes = el("span", "hr-notes");
    current.append(ui.chordName, ui.notes);
    const actions = el("div", "hr-live-actions");
    const play = btn("hr-button hr-play", "Zahrát akord");
    play.addEventListener("click", () => hear(currentChord()));
    ui.write = btn("hr-button hr-write");
    ui.write.addEventListener("click", () => {
      state.progression[state.slot] = currentChord();
      changed();
    });
    actions.append(play, ui.write);
    readout.append(current, actions);
    return readout;
  }

  function makeProgression() {
    const section = el("div", "hr-progress");
    const header = el("div", "hr-progress-head");
    header.append(el("h3", "hr-title", "Akordová progrese"));
    const count = select("Kroky", "length", byValue(4, 5, 6, 7, 8), value => {
      const length = Number(value);
      while (state.progression.length < length) {
        const template = state.progression[state.progression.length % 4];
        state.progression.push({ ...template });
      }
      state.progression.length = length;
      state.slot = Math.min(length - 1, state.slot);
      mark(-1);
    });
    header.append(count);
    const slots = el("div", "hr-slots");
    slots.setAttribute("role", "group");
    slots.setAttribute("aria-label", "Kroky akordové progrese");
    ui.slots = Array.from({ length: 8 }, (_, index) => {
      const node = btn("hr-slot");
      const number = el("small", "", String(index + 1).padStart(2, "0"));
      const name = el("b", "");
      node.append(number, name);
      node.addEventListener("click", () => {
        state.slot = index;
        Object.assign(state, state.progression[index]);
        changed();
        hear(currentChord());
      });
      slots.append(node);
      return node;
    });
    section.append(header, slots);
    return section;
  }

  function makeGenerator() {
    const group = el("div", "hr-generator");
    const segment = el("div", "hr-mode");
    segment.setAttribute("role", "group");
    segment.setAttribute("aria-label", "Režim generátoru");
    ui.modes = Object.entries(generators).map(([id, label]) => {
      const node = btn("hr-mode-button", label);
      node.addEventListener("click", () => {
        state.generator = id;
        if (id === "manual") mark(-1);
        changed();
      });
      segment.append(node);
      return { id, node };
    });
    const modesField = el("div", "hr-field");
    modesField.append(el("span", "hr-label", "S hlavním přehrávačem"), segment);
    group.append(modesField,
      select("Délka akordu", "span", [[4, "1 doba"], [8, "2 doby"], [16, "4 doby"]], value => update("span", Number(value))),
      select("Směr arpeggia", "direction", Object.entries(directions), value => update("direction", value)),
      select("Krok arpeggia", "rate", [[1, "1/16"], [2, "1/8"], [4, "1/4"]], value => update("rate", Number(value)))
    );
    return group;
  }

  function sync() {
    if (!ui) return;
    for (const [key, control] of Object.entries(ui.inputs)) {
      control.value = String(key === "length" ? state.progression.length : state[key]);
    }
    ui.inputs.inversion.options[3].disabled = !state.seventh;
    ui.inputs.rate.disabled = ui.inputs.direction.disabled = state.generator !== "arp";
    ui.inputs.span.disabled = state.generator === "manual";
    ui.seventh.setAttribute("aria-pressed", String(state.seventh));
    ui.harmonize.setAttribute("aria-pressed", String(state.harmonize));
    ui.pads.forEach(({ node, roman, name }, degree) => {
      const info = chordInfo({ degree, seventh: state.seventh, inversion: 0 });
      roman.textContent = info.roman;
      name.textContent = info.name;
      node.setAttribute("aria-pressed", String(degree === state.degree));
      node.setAttribute("aria-label", (degree + 1) + ". stupeň, " + info.name);
    });
    const info = chordInfo(currentChord());
    ui.chordName.textContent = info.name + info.bass;
    ui.notes.textContent = info.notes.map(note => note.name + note.octave).join(" · ");
    ui.write.textContent = "Zapsat do kroku " + (state.slot + 1);
    ui.slots.forEach((node, index) => {
      node.hidden = index >= state.progression.length;
      if (node.hidden) return;
      const value = chordInfo(state.progression[index]);
      node.lastElementChild.textContent = value.name + value.bass;
      node.setAttribute("aria-label", "Krok " + (index + 1) + ", " + value.name + value.bass);
      node.setAttribute("aria-pressed", String(index === state.slot));
      node.classList.toggle("hr-playing", index === marked);
    });
    ui.modes.forEach(({ id, node }) => node.setAttribute("aria-pressed", String(id === state.generator)));
  }

  function mount(host, ctx) {
    ui = { ctx, inputs: {}, pads: [], slots: [], modes: [] };
    const panel = el("div", "hr-lab");
    panel.append(makeKeyControls(), makeChordPads(), makeReadout(), makeProgression(), makeGenerator());
    host.replaceChildren(panel);
    sync();
  }

  window.Harmony = { mount, tick, highlight, liveNotes, getData: () => copy(state), loadData, defaults, validate, resetPlayback };
})();
