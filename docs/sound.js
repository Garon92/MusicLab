(() => {
  "use strict";

  const storageKey = "musiclab.sound.v1";
  const waveforms = [
    { id: "sine", label: "Sinus", description: "Hladká vlna zní jemně, podobně jako pískání." },
    { id: "triangle", label: "Trojúhelník", description: "Trojúhelníková vlna přidá k tónu trochu bzukotu." },
    { id: "square", label: "Obdélník", description: "Obdélníková vlna bzučí jako zvuk ze staré videohry." },
    { id: "sawtooth", label: "Pila", description: "Pilová vlna má ostrý, výrazně bzučivý zvuk." }
  ];
  const offsets = [0, 2, 4, 5, 7, 9, 11, 12];
  const names = ["C", "D", "E", "F", "G", "A", "H", "C"];
  const shortcuts = ["A", "S", "D", "F", "G", "H", "J", "K"];
  const loop = [0, 2, 4, null, 5, 3, 1, null];
  let view;
  let wave = "sine";
  let octave = 4;
  let chosen = 0;

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved) return;
      if (waveforms.some(item => item.id === saved.wave)) wave = saved.wave;
      if ([3, 4, 5].includes(saved.octave)) octave = saved.octave;
      if (Number.isInteger(saved.chosen) && saved.chosen >= 0 && saved.chosen <= 7) chosen = saved.chosen;
    } catch { /* Storage is optional. */ }
  }

  function saveSettings() {
    try { localStorage.setItem(storageKey, JSON.stringify({ wave, octave, chosen })); }
    catch { /* Controls still work when storage is unavailable. */ }
  }

  function midi(index) { return (octave + 1) * 12 + offsets[index]; }
  function noteName(index) { return names[index] + (index === 7 ? octave + 1 : octave); }

  function amplitude(phase) {
    switch (wave) {
      case "triangle": return 2 / Math.PI * Math.asin(Math.sin(phase * Math.PI * 2));
      case "square": return phase % 1 < 0.5 ? 1 : -1;
      case "sawtooth": return 2 * (phase % 1) - 1;
      default: return Math.sin(phase * Math.PI * 2);
    }
  }

  // Keep the time window fixed so a higher pitch visibly adds more cycles.
  function draw() {
    if (!view) return;
    const canvas = view.canvas;
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const scale = window.devicePixelRatio || 1;
    const realWidth = Math.round(width * scale);
    const realHeight = Math.round(height * scale);
    if (canvas.width !== realWidth || canvas.height !== realHeight) {
      canvas.width = realWidth;
      canvas.height = realHeight;
    }
    const pen = canvas.getContext("2d");
    if (!pen) return;
    const hz = 440 * 2 ** ((midi(view.shown) - 69) / 12);
    pen.setTransform(scale, 0, 0, scale, 0, 0);
    pen.clearRect(0, 0, width, height);
    pen.lineWidth = 1;
    pen.strokeStyle = "rgba(173, 220, 201, 0.29)";
    pen.setLineDash([3, 5]);
    pen.beginPath();
    pen.moveTo(0, height / 2);
    pen.lineTo(width, height / 2);
    pen.stroke();
    pen.setLineDash([]);
    pen.strokeStyle = "#a4ebbc";
    pen.lineWidth = 2.75;
    pen.lineJoin = "round";
    pen.beginPath();
    for (let x = 0; x <= Math.ceil(width); x++) {
      const phase = x / width * hz * 0.012;
      const y = height * (0.5 - 0.34 * amplitude(phase));
      if (x === 0) pen.moveTo(x, y);
      else pen.lineTo(x, y);
    }
    pen.stroke();
  }

  function showTone(index, lit) {
    if (!view) return;
    view.shown = index;
    view.note.textContent = noteName(index);
    view.hz.textContent = Math.round(440 * 2 ** ((midi(index) - 69) / 12)) + " Hz";
    view.screen.setAttribute("aria-label", [view.waveLabel.textContent, view.note.textContent, view.hz.textContent].join(", "));
    view.keys.forEach((key, i) => key.classList.toggle("snd-active", lit && i === index));
    draw();
  }

  async function preview(index) {
    const mounted = view;
    if (!mounted) return;
    clearTimeout(mounted.release);
    showTone(index, true);
    mounted.release = setTimeout(() => {
      if (view === mounted && !mounted.ctx.isPlaying()) showTone(chosen, false);
    }, 430);
    try {
      const pending = ++mounted.previewId;
      await window.LabAudio.start();
      if (view === mounted && pending === mounted.previewId) {
        window.LabAudio.playNote(midi(index), undefined, { wave, duration: 0.49 });
      }
    } catch {
      if (view === mounted) mounted.ctx.notify("Zvuk se nepodařilo spustit. Zkus kliknout na klávesu znovu.");
    }
  }

  function updateControls() {
    const current = waveforms.find(item => item.id === wave);
    view.waveButtons.forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.wave === wave));
    });
    view.description.textContent = current.description;
    view.waveLabel.textContent = current.label;
    view.select.value = String(octave);
    view.keys.forEach((key, i) => {
      key.setAttribute("aria-label", "Zahrát " + noteName(i) + ", klávesa " + shortcuts[i]);
    });
    showTone(chosen, false);
  }

  function chooseNote(index) {
    chosen = index;
    saveSettings();
    preview(index);
  }

  function handleShortcut(event) {
    if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        event.target?.closest?.("input, select, textarea, [contenteditable='true'], [role='dialog'], dialog") ||
        document.querySelector("dialog[open], [role='dialog'][aria-modal='true']:not([hidden])")) return;
    const index = shortcuts.indexOf(event.key.toUpperCase());
    if (index < 0) return;
    event.preventDefault();
    chooseNote(index);
  }

  function mount(host, ctx) {
    unmount();
    readSettings();
    host.innerHTML = `
      <section class="snd-lab" aria-label="Laboratoř zvukových vln">
        <div class="snd-wave-controls" role="group" aria-label="Tvar vlny">
          <strong class="snd-label">Tvar vlny</strong>
          <div class="snd-options">
            ${waveforms.map(item => `<button type="button" data-wave="${item.id}"><span class="snd-symbol snd-symbol-${item.id}" aria-hidden="true"></span>${item.label}</button>`).join("")}
          </div>
        </div>
        <div class="snd-screen" role="img" aria-label="Ukázka tvaru zvukové vlny">
          <div class="snd-readout"><span class="snd-wave-label"></span><span><b class="snd-note"></b> · <span class="snd-hz"></span></span></div>
          <canvas aria-hidden="true"></canvas>
        </div>
        <p class="snd-description"></p>
        <div class="snd-key-controls">
          <strong class="snd-label">Zahraj tón</strong>
          <label>Oktáva <select aria-label="Oktáva"><option value="3">Nízká</option><option value="4">Střední</option><option value="5">Vysoká</option></select></label>
        </div>
        <div class="snd-keys" role="group" aria-label="Klávesy">
          ${names.map((name, i) => `<button type="button" data-note="${i}" aria-keyshortcuts="${shortcuts[i]}"><b>${name}</b><kbd>${shortcuts[i]}</kbd></button>`).join("")}
        </div>
        <p class="snd-help">Hraj myší nebo klávesami A až K. Zkus zahrát stejný tón s jiným tvarem vlny.</p>
      </section>`;
    const root = host.querySelector(".snd-lab");
    view = {
      ctx, root, shown: chosen, previewId: 0,
      screen: root.querySelector(".snd-screen"), canvas: root.querySelector("canvas"),
      note: root.querySelector(".snd-note"), hz: root.querySelector(".snd-hz"),
      waveLabel: root.querySelector(".snd-wave-label"), description: root.querySelector(".snd-description"),
      waveButtons: [...root.querySelectorAll("[data-wave]")], keys: [...root.querySelectorAll("[data-note]")],
      select: root.querySelector("select")
    };
    view.waveButtons.forEach(button => button.addEventListener("click", () => {
      wave = button.dataset.wave;
      saveSettings();
      updateControls();
      if (!ctx.isPlaying()) preview(chosen);
    }));
    view.select.addEventListener("change", () => {
      octave = Number(view.select.value);
      saveSettings();
      updateControls();
      if (!ctx.isPlaying()) preview(chosen);
    });
    view.keys.forEach((button, i) => button.addEventListener("click", () => chooseNote(i)));
    document.addEventListener("keydown", handleShortcut);
    if (window.ResizeObserver) {
      view.observer = new ResizeObserver(draw);
      view.observer.observe(view.canvas);
    } else window.addEventListener("resize", draw);
    updateControls();
  }

  function tick(step, time) {
    const index = loop[step];
    if (view && index != null) window.LabAudio.playNote(midi(index), time, { wave, duration: 0.29 });
  }

  function highlight(step) {
    if (!view) return;
    const index = loop[step];
    showTone(index ?? view.shown, index != null);
  }

  function resetPlayback() {
    if (!view) return;
    clearTimeout(view.release);
    view.previewId++;
    showTone(chosen, false);
  }

  function unmount() {
    if (!view) return;
    document.removeEventListener("keydown", handleShortcut);
    window.removeEventListener("resize", draw);
    view.observer?.disconnect();
    clearTimeout(view.release);
    view.root.remove();
    view = null;
  }

  window.SoundLab = { mount, unmount, tick, highlight, resetPlayback };
})();
