(() => {
  "use strict";

  const factory = { id: "factory", name: "Circuit Break" };
  const defaults = () => ({
    version: 1, source: { ...factory }, start: 0, end: 1, rate: 1,
    reverse: false, selected: 0, pattern: Array(16).fill(-1)
  });
  let state = defaults();
  let ctx, host, ui, factoryBuffer, buffer, reversed, original, cachedBase64, peaks, observer;
  let loading = 0;
  let currentStep = -1;
  let litPad = -1;
  let releaseTimer;
  const stepTimers = new Set();

  function valid(data) {
    const num = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
    const slice = n => Number.isInteger(n) && n >= -1 && n <= 7;
    return data?.version === 1 && typeof data.source?.id === "string" && data.source.id.length > 0 &&
      typeof data.source.name === "string" && (!("audio" in data.source) ||
        (typeof data.source.audio === "string" && data.source.audio.length > 0 && data.source.audio.length % 4 === 0 &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(data.source.audio))) &&
      num(data.start, 0, 1) && num(data.end, 0, 1) && data.end > data.start &&
      num(data.rate, 0.25, 4) && typeof data.reverse === "boolean" &&
      slice(data.selected) && data.selected >= 0 && Array.isArray(data.pattern) &&
      data.pattern.length === 16 && data.pattern.every(slice);
  }

  function toBase64(data) {
    if (cachedBase64) return cachedBase64;
    const bytes = new Uint8Array(data);
    if (bytes.toBase64) return (cachedBase64 = bytes.toBase64());
    const parts = [];
    // Multiple of three keeps chunk boundaries on complete base64 groups.
    for (let i = 0; i < bytes.length; i += 24576) {
      parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24576))));
    }
    return (cachedBase64 = parts.join(""));
  }

  function fromBase64(data) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(data).buffer;
    const bytes = new Uint8Array(data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0));
    for (let i = 0, j = 0; i < data.length; i += 32768) {
      const part = atob(data.slice(i, i + 32768));
      for (let n = 0; n < part.length; n++) bytes[j++] = part.charCodeAt(n);
    }
    return bytes.buffer;
  }

  function getData(includeAudio = false) {
    const snapshot = { ...state, source: { ...state.source }, pattern: [...state.pattern] };
    if (includeAudio && original) snapshot.source.audio = toBase64(original);
    return snapshot;
  }

  function sampleStore(mode, task) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open("musiclab-sampler", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("audio");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("audio", mode);
        const request = task(tx.objectStore("audio"));
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }

  // An original eight-hit demo is always available, including before the first import.
  function getFactory() {
    if (factoryBuffer) return factoryBuffer;
    const sr = 24000, step = 0.32;
    factoryBuffer = new AudioBuffer({ numberOfChannels: 1, length: Math.round(sr * step * 8), sampleRate: sr });
    const out = factoryBuffer.getChannelData(0);
    const notes = [52, 353, 175, 630, 65, 240, 144, 415];
    let seed = 101;
    for (let i = 0; i < out.length; i++) {
      const segment = Math.min(7, Math.floor(i / (sr * step)));
      const at = i / sr - segment * step;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const pitch = notes[segment];
      const phase = 2 * Math.PI * (pitch * at + (segment % 4 === 0 ? 3.7 * (1 - Math.exp(-at * 32)) : 0));
      const tone = (Math.sin(phase) + 0.22 * Math.sin(phase * 2.005)) * Math.exp(-at * (segment % 2 ? 23 : 14));
      const hit = noise * Math.exp(-at * 42) * (segment % 2 ? 0.61 : 0.10);
      out[i] = Math.min(1, at * 800) * (tone * 0.57 + hit * 0.49) * Math.min(1, (step - at) * 180);
    }
    return factoryBuffer;
  }

  function makePeaks() {
    if (!buffer) { peaks = null; return; }
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const length = buffer.length;
    const count = Math.min(1400, length);
    peaks = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * length / count);
      const end = Math.max(start + 1, Math.floor((i + 1) * length / count));
      const increment = Math.max(1, Math.floor((end - start) / 180));
      let peak = 0;
      for (const values of channels) {
        for (let k = start; k < end; k += increment) peak = Math.max(peak, Math.abs(values[k]));
      }
      peaks[i] = peak;
    }
  }

  function setBuffer(value, bytes) {
    buffer = value;
    original = bytes;
    reversed = null;
    cachedBase64 = null;
    makePeaks();
  }

  function playable() {
    if (!state.reverse || !buffer) return buffer;
    if (!reversed) {
      reversed = new AudioBuffer({ length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const dest = reversed.getChannelData(c);
        dest.set(buffer.getChannelData(c));
        dest.reverse();
      }
    }
    return reversed;
  }

  async function loadData(data) {
    const id = ++loading;
    const next = data ?? defaults();
    if (!valid(next)) throw new Error("Neplatná data sampleru.");
    let source, bytes;
    const embedded = next.source.audio;
    const custom = next.source.id !== "factory";
    if (!custom) source = getFactory();
    else if (embedded) {
      bytes = fromBase64(embedded);
      source = await (ctx?.engine ?? window.Engine).decode(bytes);
    } else if (state.source.id === next.source.id && original && buffer) {
      bytes = original;
      source = buffer;
    } else {
      try { bytes = await sampleStore("readonly", store => store.get(next.source.id)); } catch { /* Missing storage. */ }
      if (bytes) source = await (ctx?.engine ?? window.Engine).decode(bytes);
    }
    if (id !== loading) return;
    resetPlayback();
    state = { ...next, source: { id: next.source.id, name: next.source.name }, pattern: [...next.pattern] };
    setBuffer(source, bytes);
    render();
    if (custom && !bytes) ctx?.notify("Zvukový soubor není v tomto prohlížeči uložený. Načti jej znovu do sampleru.");
    if (embedded && bytes) await persist(next.source.id, bytes);
  }

  async function persist(id, bytes) {
    try { await sampleStore("readwrite", store => store.put(bytes, id)); }
    catch { ctx?.notify("Zvuk se nevešel do místního úložiště. Ulož si jej exportem projektu."); }
  }

  async function importFile(file) {
    if (!file) return;
    const id = ++loading;
    ui.filename.textContent = "Načítání…";
    try {
      const bytes = await file.arrayBuffer();
      const decoded = await ctx.engine.decode(bytes);
      if (id !== loading) return;
      const replacingMissing = !buffer && state.source.id !== "factory";
      const fileId = replacingMissing ? state.source.id : (crypto.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2));
      await persist(fileId, bytes);
      if (id !== loading) return;
      const oldPattern = state.pattern;
      if (!replacingMissing) state = { ...defaults(), pattern: oldPattern };
      state.source = { id: fileId, name: file.name };
      setBuffer(decoded, bytes);
      render();
      ctx.changed();
    } catch {
      if (id !== loading) return;
      render();
      ctx.notify("Soubor se nepodařilo přečíst jako zvuk. Zkus WAV, MP3 nebo OGG.");
    }
  }

  const seconds = n => n.toFixed(2).replace(".", ",") + " s";

  function draw() {
    if (!ui) return;
    const canvas = ui.canvas, rect = canvas.getBoundingClientRect();
    const width = rect.width, height = rect.height;
    if (!width || !height) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext("2d");
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, width, height);
    const x0 = state.start * width, x1 = state.end * width, cell = (x1 - x0) / 8;
    g.fillStyle = "rgba(51,225,213,0.065)";
    g.fillRect(x0, 0, x1 - x0, height);
    g.fillStyle = "rgba(56,232,216,0.15)";
    g.fillRect(x0 + cell * (litPad >= 0 ? litPad : state.selected), 0, cell, height);
    g.strokeStyle = "#30424a"; g.lineWidth = 1; g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = Math.round(x0 + i * cell) + 0.5;
      g.moveTo(x, 0); g.lineTo(x, height);
    }
    g.moveTo(0, height / 2); g.lineTo(width, height / 2); g.stroke();
    if (peaks) {
      const bars = Math.ceil(width / 2);
      const max = Math.max(0.3, ...peaks);
      for (let i = 0; i < bars; i++) {
        const x = i * 2;
        const pos = state.reverse ? 1 - x / width : x / width;
        const amp = peaks[Math.min(peaks.length - 1, Math.floor(pos * peaks.length))] / max * height * 0.36;
        g.fillStyle = x < x0 || x > x1 ? "#3d535c" : "#58e6d7";
        g.fillRect(x, height / 2 - amp, 1.5, Math.max(1, amp * 2));
      }
    }
    g.fillStyle = "#63f2dd";
    g.fillRect(x0, 0, 2, height); g.fillRect(x1 - 2, 0, 2, height);
    g.fillStyle = "#8db6b5"; g.font = '10px ui-monospace, monospace';
    if (cell > 25) for (let i = 0; i < 8; i++) g.fillText(String(i + 1).padStart(2, "0"), x0 + i * cell + 4, 12);
  }

  function render() {
    if (!ui) return;
    ui.filename.textContent = state.source.name;
    ui.filename.title = state.source.name;
    ui.duration.textContent = buffer ? seconds(buffer.duration) : "Chybí soubor";
    ui.start.value = state.start; ui.end.value = state.end; ui.rate.value = state.rate;
    ui.startVal.textContent = seconds((buffer?.duration || 0) * state.start);
    ui.endVal.textContent = seconds((buffer?.duration || 0) * state.end);
    ui.rateVal.textContent = state.rate.toFixed(2).replace(".", ",") + "×";
    ui.reverse.setAttribute("aria-pressed", String(state.reverse));
    ui.preview.disabled = !buffer;
    ui.pads.forEach((button, i) => {
      button.disabled = !buffer;
      button.setAttribute("aria-pressed", String(i === state.selected));
      button.classList.toggle("smp-hit", litPad === i);
    });
    ui.steps.forEach((button, i) => {
      const value = state.pattern[i];
      button.textContent = value < 0 ? "·" : String(value + 1);
      button.setAttribute("aria-pressed", String(value >= 0));
      button.setAttribute("aria-label", "Krok " + (i + 1) + (value < 0 ? ", pauza" : ", řez " + (value + 1)));
      button.classList.toggle("smp-current", currentStep === i);
    });
    draw();
  }

  function play(slice, time) {
    const source = playable();
    if (!source) return;
    const size = (state.end - state.start) / 8;
    const from = slice == null ? state.start : state.start + slice * size;
    const to = slice == null ? state.end : from + size;
    ctx.engine.playBuffer(source, { time, start: from * source.duration, end: to * source.duration, rate: state.rate });
  }

  function flash(slice) {
    clearTimeout(releaseTimer);
    litPad = slice;
    if (ui) { ui.pads.forEach((b, i) => b.classList.toggle("smp-hit", i === slice)); draw(); }
    releaseTimer = setTimeout(() => {
      litPad = -1;
      if (ui) { ui.pads.forEach(b => b.classList.remove("smp-hit")); draw(); }
    }, 150);
  }

  function choose(slice) {
    state.selected = slice; render(); ctx.changed();
    ctx.preview(() => { play(slice); flash(slice); });
  }

  function tick(step, time) {
    if (!ctx || !buffer) return;
    const slot = step % 16, slice = state.pattern[slot];
    if (slice >= 0) play(slice, time);
    const timer = setTimeout(() => {
      stepTimers.delete(timer);
      if (ui) {
        if (currentStep >= 0) ui.steps[currentStep].classList.remove("smp-current");
        ui.steps[slot].classList.add("smp-current");
      }
      currentStep = slot;
      if (slice >= 0) flash(slice);
    }, Math.max(0, time - ctx.engine.now()) * 1000);
    stepTimers.add(timer);
  }

  function resetPlayback() {
    for (const timer of stepTimers) clearTimeout(timer);
    stepTimers.clear(); clearTimeout(releaseTimer);
    currentStep = litPad = -1;
    if (ui) {
      ui.steps.forEach(b => b.classList.remove("smp-current"));
      ui.pads.forEach(b => b.classList.remove("smp-hit"));
      draw();
    }
  }

  function changed() { render(); ctx.changed(); }

  function mount(element, context) {
    observer?.disconnect();
    host = element; ctx = context;
    if (!buffer && state.source.id === "factory") setBuffer(getFactory());
    host.innerHTML = `
      <div class="smp-ui">
        <div class="smp-file-row">
          <div class="smp-info"><strong class="smp-filename"></strong><span class="smp-duration"></span></div>
          <button type="button" class="smp-import">Import zvuku</button>
          <input class="smp-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aif,.aiff" hidden>
        </div>
        <canvas class="smp-wave" role="img" aria-label="Průběh zvuku a rozdělení ořezu na osm řezů"></canvas>
        <div class="smp-trim">
          <label>Začátek <output data-value="start"></output><input type="range" data-field="start" min="0" max="1" step="0.001"></label>
          <label>Konec <output data-value="end"></output><input type="range" data-field="end" min="0" max="1" step="0.001"></label>
          <label>Rychlost <output data-value="rate"></output><input type="range" data-field="rate" min="0.25" max="4" step="0.05"></label>
        </div>
        <div class="smp-operations"><button type="button" class="smp-preview">Přehrát ořez</button><button type="button" class="smp-reverse">Reverse</button></div>
        <div class="smp-row-title">Řezy</div>
        <div class="smp-pads" role="group" aria-label="Přehrát a vybrat řez">${Array.from({length:8},(_,i)=>`<button type="button" aria-label="Řez ${i+1}">${String(i+1).padStart(2,"0")}</button>`).join("")}</div>
        <div class="smp-row-title">Sekvence řezů</div>
        <div class="smp-steps" role="group" aria-label="Sekvence šestnácti kroků">${'<button type="button"></button>'.repeat(16)}</div>
        <p class="smp-hint">Vyber řez a kliknutím ho vlož do kroku. Dalším kliknutím ho odebereš.</p>
      </div>`;
    const get = s => host.querySelector(s);
    ui = {
      filename: get(".smp-filename"), duration: get(".smp-duration"), canvas: get(".smp-wave"),
      file: get(".smp-file"), preview: get(".smp-preview"), reverse: get(".smp-reverse"),
      pads: [...host.querySelectorAll(".smp-pads button")], steps: [...host.querySelectorAll(".smp-steps button")]
    };
    get(".smp-import").onclick = () => ui.file.click();
    ui.file.onchange = () => { const file = ui.file.files[0]; ui.file.value = ""; importFile(file); };
    for (const field of ["start", "end", "rate"]) {
      ui[field] = get('[data-field="' + field + '"]');
      ui[field + "Val"] = get('[data-value="' + field + '"]');
      ui[field].oninput = () => {
        let value = Number(ui[field].value);
        const epsilon = Math.min(.001, state.end - state.start);
        if (field === "start") value = Math.min(state.end - epsilon, value);
        if (field === "end") value = Math.max(state.start + epsilon, value);
        state[field] = value;
        changed();
      };
    }
    ui.preview.onclick = () => ctx.preview(() => play(null));
    ui.reverse.onclick = () => {
      const { start, end } = state;
      state.start = 1 - end; state.end = 1 - start; state.reverse = !state.reverse;
      changed();
    };
    ui.pads.forEach((b, i) => { b.onclick = () => choose(i); });
    ui.steps.forEach((b, i) => { b.onclick = () => {
      state.pattern[i] = state.pattern[i] === state.selected ? -1 : state.selected;
      changed();
    }; });
    if (window.ResizeObserver) {
      observer = new ResizeObserver(draw); observer.observe(ui.canvas);
    }
    render();
  }

  window.Sampler = { mount, tick, importFile, getData, loadData, validate: valid, resetPlayback };
})();
