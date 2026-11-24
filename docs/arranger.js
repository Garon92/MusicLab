(() => {
  "use strict";

  const banks = ["A", "B", "C", "D"];
  const limit = 32;
  const glyphs = {
    play: '<path d="m6 4 12 8-12 8z" fill="currentColor" stroke="none"/>',
    up: '<path d="m5 14 7-7 7 7"/>',
    down: '<path d="m5 10 7 7 7-7"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1"/>',
    remove: '<path d="M3 6h18M9 6V3h6v3m-9 0 1 14h10l1-14M10 10v6m4-6v6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    undo: '<path d="m8 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/>'
  };

  function defaults() { return banks.map((_, bank) => ({ bank, repeats: 2 })); }
  function copy(rows) { return rows.map(({ bank, repeats }) => ({ bank, repeats })); }
  function validate(value) {
    return Array.isArray(value) && value.length >= 1 && value.length <= limit &&
      value.every(row => row && Number.isInteger(row.bank) && row.bank >= 0 && row.bank < banks.length &&
        Number.isInteger(row.repeats) && row.repeats >= 1 && row.repeats <= 16);
  }

  let sections = defaults();
  let ui = null;
  let position = { index: -1, repeat: 0, step: 0 };
  const undo = [];
  function loadData(value) {
    if (!validate(value)) return false;
    sections = copy(value);
    undo.length = 0;
    position.index = -1;
    render();
    return true;
  }

  function element(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(key) {
    const wrapper = element("span", "arr-icon");
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' + glyphs[key] + "</svg>";
    return wrapper;
  }

  function button(cls, label, glyph, visibleLabel = false) {
    const control = element("button", cls);
    control.type = "button";
    control.title = label;
    control.setAttribute("aria-label", label);
    if (glyph) control.append(icon(glyph));
    if (visibleLabel) control.append(element("span", "", label));
    return control;
  }

  function bankSelect(label, value) {
    const control = element("select", "arr-bank");
    control.setAttribute("aria-label", label);
    banks.forEach((name, index) => control.add(new Option("Pattern " + name, String(index))));
    control.value = String(value);
    return control;
  }

  function setFocus(index, action) {
    const target = ui?.rows.children[index]?.querySelector('[data-action="' + action + '"]');
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }

  function commit(next, focusIndex, focusAction) {
    if (!validate(next)) return;
    undo.push(sections);
    if (undo.length > 40) undo.shift();
    sections = next;
    position.index = -1;
    render();
    setFocus(focusIndex, focusAction);
    ui.ctx.changed();
  }

  function operate(action, index) {
    const next = copy(sections);
    switch (action) {
      case "up":
      case "down": {
        const destination = index + (action === "up" ? -1 : 1);
        if (destination < 0 || destination >= next.length) return;
        [next[index], next[destination]] = [next[destination], next[index]];
        commit(next, destination, "cue");
        break;
      }
      case "copy":
        if (next.length === limit) return;
        next.splice(index + 1, 0, { ...next[index] });
        commit(next, index + 1, "cue");
        break;
      case "remove":
        if (next.length === 1) return;
        next.splice(index, 1);
        commit(next, Math.min(index, next.length - 1), "cue");
        break;
    }
  }

  function timeText(seconds) {
    const whole = Math.max(0, Math.floor(seconds + 0.00001));
    return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
  }

  function totalBars() {
    return sections.reduce((sum, section) => sum + section.repeats, 0);
  }

  function barsBefore(index) {
    return sections.slice(0, index).reduce((sum, section) => sum + section.repeats, 0);
  }

  function refresh() {
    if (!ui) return;
    const { index, repeat, step } = position;
    const total = totalBars();
    const tempo = Number(ui.ctx.getTempo());
    const secondsPerBar = Number.isFinite(tempo) && tempo > 0 ? 240 / tempo : 0;
    const active = index >= 0 && index < sections.length;
    const bar = active ? barsBefore(index) + repeat : 0;
    const fraction = bar + (active ? step / 16 : 0);
    ui.length.textContent = total + (total === 1 ? " takt" : total < 5 ? " takty" : " taktů") +
      " · " + timeText(total * secondsPerBar);
    ui.location.textContent = active
      ? "Takt " + (bar + 1) + " / " + total + " · doba " + (Math.floor(step / 4) + 1) + " · " + timeText(fraction * secondsPerBar)
      : "Začátek · 0:00";
    ui.marker.hidden = !active;
    ui.marker.style.left = (fraction / total * 100) + "%";
    ui.rows.childNodes.forEach((row, i) => {
      row.classList.toggle("current", active && i === index);
      if (active && i === index) row.setAttribute("aria-current", "step");
      else row.removeAttribute("aria-current");
    });
    ui.timeline.querySelectorAll(".arr-segment").forEach((segment, i) => {
      segment.classList.toggle("arr-active", active && i === index);
    });
  }

  function highlight(index, repeat = 0, step = 0) {
    const valid = Number.isInteger(index) && index >= 0 && index < sections.length;
    const normalized = valid ? index : -1;
    const loops = valid && Number.isInteger(repeat) ? Math.max(0, Math.min(sections[index].repeats - 1, repeat)) : 0;
    const beat = valid && Number.isInteger(step) ? Math.max(0, Math.min(15, step)) : 0;
    if (position.index === normalized && position.repeat === loops && position.step === beat) return;
    position = { index: normalized, repeat: loops, step: beat };
    refresh();
  }

  function render() {
    if (!ui) return;
    ui.rows.replaceChildren();
    ui.timeline.replaceChildren();
    let first = 1;
    sections.forEach((section, index) => {
      const number = index + 1;
      const letter = banks[section.bank];
      const last = first + section.repeats - 1;
      const range = first === last ? "Takt " + first : "Takty " + first + "–" + last;
      const cueLabel = "Hrát od sekce " + number + ", pattern " + letter;
      const segment = button("arr-segment", cueLabel + ". " + range);
      segment.dataset.bank = String(section.bank);
      segment.style.flex = String(section.repeats) + " 1 0";
      segment.textContent = letter;
      segment.addEventListener("click", () => ui.ctx.playFrom(index));
      ui.timeline.append(segment);

      const row = element("div", "arr-row");
      const cue = button("arr-cue", cueLabel, "play");
      cue.dataset.action = "cue";
      cue.append(element("span", "arr-num", String(number).padStart(2, "0")));
      cue.addEventListener("click", () => ui.ctx.playFrom(index));

      const bank = bankSelect("Pattern sekce " + number, section.bank);
      bank.dataset.action = "bank";
      bank.addEventListener("change", () => {
        const next = copy(sections);
        next[index].bank = Number(bank.value);
        commit(next, index, "bank");
      });

      const repeatLabel = element("label", "arr-repeat");
      repeatLabel.append(element("span", "arr-times", "×"));
      const repeat = element("input", "arr-count");
      repeat.type = "number";
      repeat.min = "1"; repeat.max = "16"; repeat.step = "1";
      repeat.value = String(section.repeats);
      repeat.dataset.action = "repeats";
      repeat.setAttribute("aria-label", "Počet opakování sekce " + number);
      repeat.title = "Počet opakování patternu (1–16)";
      repeat.addEventListener("change", () => {
        const n = repeat.valueAsNumber;
        if (!Number.isInteger(n) || n < 1 || n > 16 || n === sections[index].repeats) {
          repeat.value = String(sections[index].repeats);
          return;
        }
        const next = copy(sections);
        next[index].repeats = n;
        commit(next, index, "repeats");
      });
      repeatLabel.append(repeat);

      const ops = element("div", "order-ops");
      for (const [action, label, disabled] of [
        ["up", "Posunout sekci " + number + " nahoru", index === 0],
        ["down", "Posunout sekci " + number + " dolů", index === sections.length - 1],
        ["copy", "Duplikovat sekci " + number, sections.length === limit],
        ["remove", "Odebrat sekci " + number, sections.length === 1]
      ]) {
        const control = button("icon-btn", label, action);
        control.dataset.action = action;
        control.disabled = disabled;
        control.addEventListener("click", () => operate(action, index));
        ops.append(control);
      }
      row.append(cue, bank, repeatLabel, element("small", "arr-range", range), ops);
      row.addEventListener("click", event => {
        if (!event.target.closest("button, input, select, label")) ui.ctx.playFrom(index);
      });
      ui.rows.append(row);
      first = last + 1;
    });
    ui.timeline.append(ui.marker);
    ui.add.disabled = sections.length >= limit;
    ui.addBank.disabled = ui.add.disabled;
    ui.undo.disabled = !undo.length;
    refresh();
  }

  function mount(host, ctx) {
    const panel = element("div", "arr-widget");
    const stats = element("div", "arr-stats");
    const location = element("span", "arr-location");
    const length = element("strong", "arr-length");
    stats.append(location, length);
    const timeline = element("div", "arr-timeline");
    timeline.setAttribute("role", "group");
    timeline.setAttribute("aria-label", "Časová osa skladby");
    const marker = element("span", "arr-marker");
    marker.setAttribute("aria-hidden", "true");
    const rows = element("div", "arr-rows");
    const footer = element("div", "arr-add");
    const addBank = bankSelect("Pattern nové sekce", 0);
    const add = button("btn", "Přidat sekci", "plus", true);
    add.addEventListener("click", () => {
      if (sections.length < limit) commit([...copy(sections), { bank: Number(addBank.value), repeats: 1 }], sections.length, "cue");
    });
    const undoButton = button("btn arr-undo", "Zpět", "undo", true);
    undoButton.setAttribute("aria-label", "Vrátit poslední úpravu aranžmá");
    undoButton.addEventListener("click", () => {
      if (!undo.length) return;
      sections = undo.pop();
      position.index = -1;
      render();
      ctx.changed();
    });
    footer.append(addBank, add, undoButton);
    panel.append(stats, timeline, rows, footer);
    host.replaceChildren(panel);
    ui = { ctx, location, length, timeline, marker, rows, addBank, add, undo: undoButton };
    render();
  }

  window.Arranger = { mount, getData: () => copy(sections), loadData, validate, defaults, highlight, refresh };
})();
