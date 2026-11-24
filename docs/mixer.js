(() => {
  "use strict";

  const tracks = {
    drums: ["Drums", "#efad71"], bass: ["Bass", "#b4e574"], lead: ["Lead", "#64d4c1"],
    keys: ["Keys", "#b09ddd"], sample: ["Sample", "#6ebee5"]
  };
  const divisions = { "1/16": 0.25, "1/8": 0.5, "1/8.": 0.75, "1/4": 1, "1/2": 2 };
  const bandNames = { low: "Basy", mid: "Středy", high: "Výšky" };
  function defaults() {
    return {
      tracks: Object.fromEntries(Object.keys(tracks).map(name => [name, { volume: 0.8, pan: 0, mute: false, solo: false }])),
      master: 0.78, masterMute: false,
      effects: { delay: 0.12, feedback: 0.26, time: 0.25, sync: "free" },
      eq: { low: 0, mid: 0, high: 0, bypass: false }
    };
  }
  let state = defaults();
  let ctx, mix, fx;
  let meters = {};
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

  function validate(data) {
    return !!data && !!data.tracks && Object.keys(tracks).every(id => {
      const t = data.tracks[id];
      return t && inRange(t.volume, 0, 1) && inRange(t.pan, -1, 1) && typeof t.mute === "boolean" && typeof t.solo === "boolean";
    }) && inRange(data.master, 0, 1) && typeof data.masterMute === "boolean" &&
      !!data.effects && inRange(data.effects.delay, 0, 1) && inRange(data.effects.feedback, 0, 0.86) &&
      inRange(data.effects.time, 0.02, 4) && (data.effects.sync === "free" || owns(divisions, data.effects.sync)) &&
      !!data.eq && ["low", "mid", "high"].every(k => inRange(data.eq[k], -12, 12)) && typeof data.eq.bypass === "boolean";
  }

  function clone(data) {
    return {
      tracks: Object.fromEntries(Object.keys(tracks).map(id => [id, { ...data.tracks[id] }])), master: data.master,
      masterMute: data.masterMute, effects: { ...data.effects }, eq: { ...data.eq }
    };
  }

  function time() {
    const { sync } = state.effects;
    const bpm = Number(ctx?.getTempo?.()) || 112;
    return sync === "free" ? state.effects.time : Math.min(4, Math.max(0.02, 60 / bpm * divisions[sync]));
  }

  const db = amount => amount < 0.001 ? "−∞ dB" : (20 * Math.log10(amount)).toFixed(1).replace("-", "−") + " dB";
  const pan = value => Math.abs(value) < 0.005 ? "C" : (value < 0 ? "L " : "R ") + Math.round(Math.abs(value) * 100);
  const freqLabels = { low: "160 Hz", mid: "1,2 kHz", high: "4,5 kHz" };
  const bandValue = value => (value > 0 ? "+" : "") + value.toFixed(1).replace("-", "−") + " dB";
  const pct = value => Math.round(value * 100) + " %";
  const mark = (button, on) => button.setAttribute("aria-pressed", String(on));
  function meter(name) { return '<div class="ch-meter" aria-hidden="true"><span data-level="' + name + '"></span></div>'; }

  function syncAudio() {
    if (!ctx) return;
    for (const [id, data] of Object.entries(state.tracks)) ctx.engine.setTrack(id, data);
    ctx.engine.setMaster(state.masterMute ? 0 : state.master);
    ctx.engine.setEffects({ ...state.effects, time: time() });
    ctx.engine.setEQ(state.eq);
  }

  function update() {
    if (!ctx) return;
    for (const row of mix.querySelectorAll("[data-channel]")) {
      const t = state.tracks[row.dataset.channel];
      for (const key of ["volume", "pan"]) {
        const slider = row.querySelector('[data-track-param="' + key + '"]');
        const value = key === "pan" ? pan(t.pan) : db(t.volume);
        slider.value = t[key]; slider.setAttribute("aria-valuetext", value); slider.title = value;
        row.querySelector('[data-val="' + key + '"]').textContent = value;
      }
      mark(row.querySelector("[data-mute]"), t.mute); mark(row.querySelector("[data-solo]"), t.solo);
    }
    const master = mix.querySelector("[data-master]");
    master.value = state.master; master.setAttribute("aria-valuetext", db(state.master)); master.title = db(state.master);
    mix.querySelector(".master-volume output").textContent = db(state.master);
    mark(mix.querySelector("[data-master-mute]"), state.masterMute);
    for (const key of ["delay", "feedback", "time"]) {
      const value = key === "time" ? time() : state.effects[key];
      const label = key === "time" ? Math.round(value * 1000) + " ms" : pct(value);
      const slider = fx.querySelector('[data-fx="' + key + '"]');
      slider.value = value; slider.setAttribute("aria-valuetext", label);
      slider.disabled = key === "time" && state.effects.sync !== "free";
      fx.querySelector('[data-fx-val="' + key + '"]').textContent = label;
    }
    fx.querySelector("[data-sync]").value = state.effects.sync;
    mark(fx.querySelector("[data-eq-bypass]"), state.eq.bypass);
    for (const band of Object.keys(bandNames)) {
      const slider = fx.querySelector('[data-band="' + band + '"]'), val = state.eq[band];
      slider.value = val; slider.setAttribute("aria-valuetext", bandValue(val)); slider.disabled = state.eq.bypass;
      fx.querySelector('[data-band-val="' + band + '"]').textContent = bandValue(val);
    }
  }

  function loadData(data) {
    const next = data ?? defaults();
    if (!validate(next)) throw new Error("Neplatné nastavení mixážní konzole.");
    state = clone(next);
    syncAudio(); update();
  }

  function fxSlider(id, label, min, max, step) {
    return `<label><span>${label}<output data-fx-val="${id}"></output></span>
      <input type="range" data-fx="${id}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`;
  }

  function mount(mixHost, fxHost, context) {
    mix = mixHost; fx = fxHost; ctx = context;
    mix.innerHTML = '<div class="mix-list"><div class="mix-row mix-labels" aria-hidden="true"><span>STOPA</span><span>HLASITOST</span><span>PAN</span><span>M</span><span>S</span></div>' +
      Object.entries(tracks).map(([id, [label, color]]) => `
        <div class="mix-row" data-channel="${id}" style="--chan:${color}">
          <span class="channel-name">${label}</span>
          <div class="fader-col"><input type="range" aria-label="${label}, hlasitost" data-track-param="volume" min="0" max="1" step=".01">
            ${meter(id)}<output data-val="volume"></output></div>
          <div class="fader-col"><input type="range" aria-label="${label}, panorama" data-track-param="pan" min="-1" max="1" step=".01"><output data-val="pan"></output></div>
          <button type="button" data-mute aria-label="Mute ${label}" title="Ztlumit ${label}">M</button>
          <button type="button" data-solo aria-label="Solo ${label}" title="Solo ${label}">S</button>
        </div>`).join("") +
      `</div><div class="mix-master"><div class="mx-master-row"><label class="master-volume">MASTER
        <input type="range" data-master aria-label="Master, hlasitost" min="0" max="1" step=".01"><output></output></label>
        <button class="mx-toggle" data-master-mute type="button" title="Ztlumit celý výstup" aria-label="Ztlumit master">M</button></div>${meter("master")}</div>`;
    fx.innerHTML = `
      <div class="mx-fx-head"><strong>Delay</strong><label>Sync <select data-sync aria-label="Synchronizace delaye s tempem">
        <option value="free">Volně</option><option>1/16</option><option>1/8</option><option value="1/8.">1/8 tečkovaná</option><option>1/4</option><option>1/2</option>
      </select></label></div>
      <div class="fx-grid mx-delay">${fxSlider("delay", "Úroveň ozvěny", 0, 1, .01)}${fxSlider("feedback", "Zpětná vazba", 0, .86, .01)}${fxSlider("time", "Čas opakování", .02, 4, .005)}</div>
      <div class="mx-fx-head mx-eq-head"><strong>Master EQ</strong><button type="button" class="mx-toggle" data-eq-bypass aria-label="Obejít master ekvalizér">Bypass</button></div>
      <div class="fx-grid mx-bands">${Object.entries(bandNames).map(([id, label]) =>
        `<label><span>${label}<output data-band-val="${id}"></output></span><input type="range" data-band="${id}" min="-12" max="12" step=".5" aria-label="EQ ${label}"><small>${freqLabels[id]}</small></label>`).join("")}</div>`;
    meters = Object.fromEntries([...mix.querySelectorAll("[data-level]")].map(el => [el.dataset.level, el]));
    mix.oninput = event => {
      const slider = event.target;
      if (slider.hasAttribute("data-master")) { state.master = Number(slider.value); ctx.engine.setMaster(state.masterMute ? 0 : state.master); }
      else if (slider.dataset.trackParam) {
        const id = slider.closest("[data-channel]").dataset.channel;
        state.tracks[id][slider.dataset.trackParam] = Number(slider.value);
        ctx.engine.setTrack(id, state.tracks[id]);
      } else return;
      update(); ctx.changed();
    };
    mix.onclick = event => {
      const button = event.target.closest("button"); if (!button) return;
      if (button.hasAttribute("data-master-mute")) {
        state.masterMute = !state.masterMute;
        ctx.engine.setMaster(state.masterMute ? 0 : state.master);
      } else {
        const row = button.closest("[data-channel]"); if (!row) return;
        const id = row.dataset.channel, prop = button.hasAttribute("data-solo") ? "solo" : "mute";
        state.tracks[id][prop] = !state.tracks[id][prop];
        ctx.engine.setTrack(id, state.tracks[id]);
      }
      update(); ctx.changed();
    };
    fx.oninput = event => {
      const input = event.target;
      if (input.dataset.band) {
        state.eq[input.dataset.band] = Number(input.value); ctx.engine.setEQ(state.eq);
      } else if (input.dataset.fx) {
        state.effects[input.dataset.fx] = Number(input.value); ctx.engine.setEffects({ ...state.effects, time: time() });
      } else return;
      update(); ctx.changed();
    };
    fx.querySelector("[data-sync]").onchange = event => {
      state.effects.sync = event.target.value; tempoChanged(); ctx.changed();
    };
    fx.querySelector("[data-eq-bypass]").onclick = () => {
      state.eq.bypass = !state.eq.bypass; ctx.engine.setEQ(state.eq); update(); ctx.changed();
    };
    syncAudio(); update();
  }

  function tempoChanged() {
    if (!ctx) return;
    ctx.engine.setEffects({ time: time() });
    update();
  }

  function refreshMeters(levels = {}) {
    for (const [name, bar] of Object.entries(meters)) {
      const amp = Math.max(0.001, levels[name] || 0);
      const value = Math.min(1, Math.max(0, (60 + 20 * Math.log10(amp)) / 60));
      bar.style.transform = "scaleX(" + value.toFixed(3) + ")";
      bar.classList.toggle("mx-hot", amp >= 0.89);
    }
  }

  window.Mixer = { mount, getData: () => clone(state), loadData, defaults, validate, refreshMeters, tempoChanged };
})();
