(() => {
  'use strict';

  const defaults = () => ({ octave: 4, velocity: 0.8 });
  const shortcuts = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Z/Y', 'H', 'U', 'J', 'K'];
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'H'];
  const pcNotes = new Map(Object.entries({ KeyA:0, KeyW:1, KeyS:2, KeyE:3, KeyD:4, KeyF:5, KeyT:6, KeyG:7, KeyY:8, KeyZ:8, KeyH:9, KeyU:10, KeyJ:11, KeyK:12 }));
  const drumNames = ['Kopák', 'Virbl', 'Hi-hat', 'Tlesk'];
  const families = {
    pluck: { label: 'Drnknutí', waves: ['triangle','square','sawtooth'], cutoff:[1100,7600], resonance:[.5,3.6], attack:[.002,.018], release:[.06,.45] },
    pad: { label: 'Plocha', waves:['triangle','sawtooth'], cutoff:[650,4200], resonance:[.5,2.6], attack:[.16,.8], release:[.38,1.8] },
    lead: { label: 'Sólo', waves:['square','sawtooth','triangle'], cutoff:[1200,8800], resonance:[.6,4], attack:[.004,.07], release:[.05,.5] },
    glass: { label: 'Sklo', waves:['sine','triangle'], cutoff:[2200,12500], resonance:[.4,3], attack:[.0015,.026], release:[.25,1.35] }
  };
  let data = defaults();
  let host, ctx, ui, listeners;
  let previousPatch = null;
  let generation = 0;
  let serial = 0;
  const presses = new Map();
  const voiceHolds = new Map();
  const outputHolds = new Map();
  const physical = new Map();
  const pointers = new Map();
  const timers = new Set();
  const padTimers = new Map();

  const validNote = midi => Number.isInteger(midi) && midi >= 0 && midi <= 127;
  const isMidi = source => source === 'midi' || source.startsWith('midi:');
  const nameOf = midi => names[midi % 12] + (Math.floor(midi / 12) - 1);
  const base = () => 12 * (data.octave + 1);
  function validate(value) {
    return !!value && Number.isInteger(value.octave) && value.octave >= 0 && value.octave <= 8 &&
      Number.isFinite(value.velocity) && value.velocity >= .05 && value.velocity <= 1;
  }
  function loadData(value) {
    if (!validate(value)) return false;
    releaseAll();
    data = { octave: value.octave, velocity: value.velocity };
    previousPatch = null;
    sync();
    return true;
  }

  function updateLights() {
    if (!ui) return;
    for (const key of ui.keys) {
      const note = base() + Number(key.dataset.semitone);
      const down = voiceHolds.has(note) || [...presses.values()].some(press => press.midi === note);
      key.classList.toggle('active', down);
      key.setAttribute('aria-pressed', String(down));
    }
  }

  function sync() {
    if (!ui) return;
    ui.octave.value = String(data.octave);
    ui.velocity.value = String(Math.round(data.velocity * 100));
    ui.velocityValue.textContent = ui.velocity.value + ' %';
    ui.undo.disabled = !previousPatch;
    for (const key of ui.keys) {
      const step = Number(key.dataset.semitone);
      const note = base() + step;
      key.setAttribute('aria-label', nameOf(note) + ', klávesa ' + shortcuts[step]);
      key.title = nameOf(note) + ' · ' + shortcuts[step];
      key.firstElementChild.textContent = note % 12 === 0 ? nameOf(note) : names[note % 12];
    }
    updateLights();
  }

  function preview(action, onError) {
    const owner = ctx;
    const ticket = generation;
    if (!owner) return;
    const ready = () => { if (owner === ctx && ticket === generation) action(); };
    const fail = () => {
      if (owner !== ctx || ticket !== generation) return;
      onError?.();
      owner.notify?.('Zvuk se nepodařilo spustit.');
    };
    try { Promise.resolve(owner.preview(ready)).catch(fail); }
    catch { fail(); }
  }

  function hold(counts, note, start) {
    const count = counts.get(note) || 0;
    counts.set(note, count + 1);
    if (count === 0) start();
  }

  function release(counts, note, stop) {
    const count = counts.get(note);
    if (count > 1) counts.set(note, count - 1);
    else if (count === 1) { counts.delete(note); stop(); }
  }

  function on(midi, velocity = 1, source = 'midi') {
    if (!ctx || !validNote(midi) || typeof source !== 'string' || !Number.isFinite(velocity)) return;
    if (velocity <= 0) { off(midi, source); return; }
    const key = source + '/' + midi;
    if (presses.has(key)) return;
    const press = { midi, source, notes: [], velocity: Math.min(velocity, 1) };
    presses.set(key, press);
    const sound = () => {
      if (presses.get(key) !== press) return;
      const notes = window.Harmony?.liveNotes(midi) || [midi];
      press.notes = [...new Set(notes.filter(validNote))];
      for (const note of press.notes) {
        hold(voiceHolds, note, () => ctx.engine.keyOn(note, press.velocity));
        if (!isMidi(source)) hold(outputHolds, note, () => ctx.sendKey?.(true, note, press.velocity));
      }
      updateLights();
    };
    if (isMidi(source)) sound();
    else preview(sound, () => off(midi, source));
    updateLights();
  }

  function off(midi, source = 'midi') {
    const key = source + '/' + midi;
    const press = presses.get(key);
    if (!press || !ctx) return;
    presses.delete(key);
    for (const note of press.notes) {
      release(voiceHolds, note, () => ctx.engine.keyOff(note));
      if (!isMidi(source)) release(outputHolds, note, () => ctx.sendKey?.(false, note, 0));
    }
    updateLights();
  }

  function releaseAll() {
    generation++;
    for (const press of [...presses.values()]) off(press.midi, press.source);
    physical.clear(); pointers.clear();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const timer of padTimers.values()) clearTimeout(timer);
    padTimers.clear();
    ui?.pads.forEach(pad => pad.classList.remove('is-hit'));
  }

  function triggerDrum(index) {
    preview(() => {
      ctx.engine.drum(index, ctx.engine.now(), data.velocity);
      ctx.sendDrum?.(index, data.velocity);
      const pad = ui.pads[index];
      pad.classList.add('is-hit');
      if (padTimers.has(index)) clearTimeout(padTimers.get(index));
      padTimers.set(index, setTimeout(() => { pad.classList.remove('is-hit'); padTimers.delete(index); }, 125));
    });
  }

  function randomPatch() {
    const candidates = Object.keys(families);
    const family = families[ui.family.value === 'all' ? candidates[Math.floor(Math.random() * candidates.length)] : ui.family.value];
    const patch = { wave: family.waves[Math.floor(Math.random() * family.waves.length)] };
    for (const key of ['cutoff','resonance','attack','release']) {
      const [lo, hi] = family[key];
      const v = lo * (hi / lo) ** Math.random();
      patch[key] = key === 'cutoff' ? Math.round(v) : +v.toPrecision(3);
    }
    previousPatch = window.Signal.getSynth();
    window.Signal.setSynth(patch);
    ui.undo.disabled = false;
    ctx.changed();
    ctx.notify?.('Nový zvuk · ' + family.label);
  }

  function canPlay(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || document.hidden || !host?.isConnected || !host.getClientRects().length) return false;
    if (document.querySelector('dialog[open]')) return false;
    for (const dialog of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) if (dialog.getClientRects().length) return false;
    return !event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="combobox"]');
  }

  function attachKeys() {
    const options = { signal: listeners.signal };
    document.addEventListener('keydown', event => {
      if (!canPlay(event)) return;
      let semitone = pcNotes.get(event.code);
      const focused = event.target.closest?.('.pkey[data-semitone]');
      if ((event.code === 'Enter' || event.code === 'Space') && focused && host.contains(focused)) semitone = Number(focused.dataset.semitone);
      if (semitone !== undefined) {
        event.preventDefault();
        if (event.repeat || physical.has(event.code)) return;
        const note = base() + semitone;
        physical.set(event.code, note);
        on(note, data.velocity, 'pc:' + event.code);
      } else if (/^Digit[1-4]$/.test(event.code)) {
        event.preventDefault();
        if (!event.repeat) triggerDrum(Number(event.code.slice(-1)) - 1);
      }
    }, options);
    document.addEventListener('keyup', event => {
      const note = physical.get(event.code);
      if (note === undefined) return;
      event.preventDefault();
      physical.delete(event.code);
      off(note, 'pc:' + event.code);
    }, options);

    const piano = ui.piano;
    const getKey = el => {
      const key = el?.closest?.('[data-semitone]');
      return key && piano.contains(key) ? base() + Number(key.dataset.semitone) : null;
    };
    piano.addEventListener('pointerdown', event => {
      const note = getKey(event.target);
      if (event.button !== 0 || note === null) return;
      event.preventDefault();
      piano.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, note);
      on(note, data.velocity, 'pointer:' + event.pointerId);
    }, options);
    piano.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      const previous = pointers.get(event.pointerId);
      const note = getKey(document.elementFromPoint(event.clientX, event.clientY));
      if (note === previous) return;
      const source = 'pointer:' + event.pointerId;
      if (previous !== null) off(previous, source);
      pointers.set(event.pointerId, note);
      if (note !== null) on(note, data.velocity, source);
    }, options);
    const lift = event => {
      if (!pointers.has(event.pointerId)) return;
      const note = pointers.get(event.pointerId);
      if (note !== null) off(note, 'pointer:' + event.pointerId);
      pointers.delete(event.pointerId);
      if (piano.hasPointerCapture(event.pointerId)) piano.releasePointerCapture(event.pointerId);
    };
    for (const event of ['pointerup','pointercancel','lostpointercapture']) piano.addEventListener(event, lift, options);
    piano.addEventListener('click', event => {
      if (event.detail !== 0) return;
      const note = getKey(event.target);
      if (note === null) return;
      const source = 'activation:' + serial++;
      on(note, data.velocity, source);
      const timer = setTimeout(() => { timers.delete(timer); off(note, source); }, 300);
      timers.add(timer);
    }, options);
    for (const [index, pad] of ui.pads.entries()) {
      pad.addEventListener('pointerdown', event => {
        if (event.button === 0) triggerDrum(index);
      }, options);
      pad.addEventListener('click', event => { if (event.detail === 0) triggerDrum(index); }, options);
    }
    window.addEventListener('blur', releaseAll, options);
    window.addEventListener('pagehide', releaseAll, options);
    window.addEventListener('hashchange', releaseAll, options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); }, options);
  }

  function mount(target, context) {
    releaseAll();
    listeners?.abort();
    if (host && host !== target) host.replaceChildren();
    host = target; ctx = context; listeners = new AbortController();
    let whites = 0;
    const keys = shortcuts.map((shortcut, step) => {
      const black = names[step % 12].endsWith('♯');
      const left = black ? ' style="left:' + (whites * 100 / 8) + '%"' : '';
      if (!black) whites++;
      return '<button type="button" class="pkey ' + (black ? 'black' : 'white') + '" data-semitone="' + step + '"' + left + '><span></span><kbd>' + shortcut + '</kbd></button>';
    }).join('');
    const octaves = Array.from({ length: 9 }, (_, i) => '<option value="' + i + '">C' + i + '–C' + (i + 1) + '</option>').join('');
    const pads = drumNames.map((name, i) => '<button type="button" aria-label="' + name + ', klávesa ' + (i+1) + '"><kbd>' + (i+1) + '</kbd>' + name + '</button>').join('');
    const options = Object.entries(families).map(([value, family]) => '<option value="' + value + '">' + family.label + '</option>').join('');
    host.innerHTML = `<div class="perf-layout">
      <div class="key-controls"><label>Oktáva <select data-octave>${octaves}</select></label><label class="perf-velocity">Úhoz <input type="range" min="5" max="100" step="1" data-velocity><output></output></label></div>
      <div class="keys" role="group" aria-label="Živá klaviatura">${keys}</div>
      <div class="drum-pads" role="group" aria-label="Bicí pady">${pads}</div>
      <div class="perf-patch"><div class="perf-patch-header"><h3>Generátor zvuku</h3><label>Charakter <select data-family><option value="all">Libovolný</option>${options}</select></label></div>
        <div class="perf-patch-controls"><button type="button" class="btn perf-new" data-new>Nový zvuk</button><button type="button" class="btn" data-hear>Poslech</button><button type="button" class="btn" data-undo disabled>Vrátit</button></div>
      </div></div>`;
    const find = selector => host.querySelector(selector);
    ui = { octave:find('[data-octave]'), velocity:find('[data-velocity]'), velocityValue:find('.perf-velocity output'), piano:find('.keys'),
      keys:[...host.querySelectorAll('.pkey')], pads:[...host.querySelectorAll('.drum-pads button')], family:find('[data-family]'), undo:find('[data-undo]') };
    const opt = { signal: listeners.signal };
    ui.octave.addEventListener('change', () => { releaseAll(); data.octave = Number(ui.octave.value); sync(); ctx.changed(); }, opt);
    ui.velocity.addEventListener('input', () => { data.velocity = Number(ui.velocity.value) / 100; sync(); ctx.changed(); }, opt);
    find('[data-new]').addEventListener('click', randomPatch, opt);
    find('[data-hear]').addEventListener('click', () => preview(() => ctx.engine.note('keys', base(), ctx.engine.now(), .72, data.velocity)), opt);
    ui.undo.addEventListener('click', () => {
      if (!previousPatch) return;
      window.Signal.setSynth(previousPatch); previousPatch = null; ui.undo.disabled = true; ctx.changed();
    }, opt);
    attachKeys(); sync();
  }

  window.LiveKeys = { mount, on, off, releaseAll, defaults, getData: () => ({ ...data }), loadData, validate };
})();
