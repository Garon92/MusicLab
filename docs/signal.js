(() => {
  'use strict';

  const waves = [
    { id: 'sine', label: 'Sinus', path: 'M2 10C5 10 5 3 9 3s4 14 8 14 4-7 7-7' },
    { id: 'triangle', label: 'Trojúhelník', path: 'M2 13 8 3l9 14 7-11' },
    { id: 'sawtooth', label: 'Pila', path: 'M2 16 12 4v12L23 4v12' },
    { id: 'square', label: 'Obdélník', path: 'M2 16V4h10v12h10V4h2' }
  ];
  const params = [
    { key: 'cutoff', label: 'Filtr', min: 30, max: 18000, initial: 3200, units: 'Hz' },
    { key: 'resonance', label: 'Rezonance', min: 0.2, max: 24, initial: 0.8, units: 'Q' },
    { key: 'attack', label: 'Náběh', min: 0.001, max: 2, initial: 0.012, units: 's' },
    { key: 'release', label: 'Dozvuk', min: 0.005, max: 5, initial: 0.2, units: 's' }
  ];
  const synth = { wave: 'sawtooth', cutoff: 3200, resonance: 0.8, attack: 0.012, release: 0.2 };
  const number = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
  const ink = '#a8f3af';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  let host, ctx, ui, listeners, sizeObserver, visibilityObserver;
  let mode = 'scope';
  let frame = 0;
  let lastPaint = 0;
  let visible = true;
  let sampleData, freqData;

  function icon(path, viewBox = '0 0 24 20') {
    return '<svg aria-hidden="true" viewBox="' + viewBox + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
  }

  function formatValue(param, value) {
    if (param.units === 'Hz') {
      return value >= 1000 ? number.format(value / 1000) + ' kHz' : Math.round(value) + ' Hz';
    }
    if (param.units === 'Q') return number.format(value) + ' Q';
    return value < 1 ? Math.round(value * 1000) + ' ms' : number.format(value) + ' s';
  }

  function fraction(param) {
    return Math.log(synth[param.key] / param.min) / Math.log(param.max / param.min);
  }

  function setSynth(settings) {
    if (!settings || typeof settings !== 'object') return;
    if (waves.some(wave => wave.id === settings.wave)) synth.wave = settings.wave;
    for (const param of params) {
      const v = settings[param.key];
      if (typeof v === 'number' && Number.isFinite(v)) synth[param.key] = clamp(v, param.min, param.max);
    }
    if (ctx) ctx.engine.setSynth({ ...synth });
    updateControls();
  }

  function updateControls() {
    if (!ui) return;
    const currentWave = waves.find(wave => wave.id === synth.wave);
    ui.waveLabel.textContent = currentWave.label;
    for (const button of ui.waveButtons) button.setAttribute('aria-pressed', String(button.dataset.wave === synth.wave));
    params.forEach((param, i) => {
      const button = ui.knobs[i];
      const value = synth[param.key];
      const formatted = formatValue(param, value);
      button.style.setProperty('--turn', (fraction(param) * 270).toFixed(2) + 'deg');
      button.setAttribute('aria-valuenow', String(+value.toPrecision(6)));
      button.setAttribute('aria-valuetext', formatted);
      ui.knobReadouts[i].textContent = formatted;
    });
  }

  function changeParam(param, position) {
    const bounded = clamp(position, 0, 1);
    let value = bounded === 0 ? param.min : bounded === 1 ? param.max : param.min * (param.max / param.min) ** bounded;
    value = param.units === 'Hz' ? Math.round(value) : +value.toPrecision(4);
    if (value === synth[param.key]) return;
    setSynth({ [param.key]: value });
    ctx.changed();
  }

  function attachKnob(knob, param) {
    const options = { signal: listeners.signal };
    let drag = null;
    knob.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      knob.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, value: fraction(param) };
      knob.setPointerCapture(event.pointerId);
      knob.classList.add('is-dragged');
    }, options);
    knob.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const movement = drag.y - event.clientY + (event.clientX - drag.x) * 0.5;
      changeParam(param, drag.value + movement / (event.shiftKey ? 650 : 150));
    }, options);
    const release = event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      knob.classList.remove('is-dragged');
      if (knob.hasPointerCapture(event.pointerId)) knob.releasePointerCapture(event.pointerId);
    };
    for (const evt of ['pointerup', 'pointercancel', 'lostpointercapture']) knob.addEventListener(evt, release, options);
    knob.addEventListener('dblclick', () => {
      setSynth({ [param.key]: param.initial });
      ctx.changed();
    }, options);
    knob.addEventListener('keydown', event => {
      const adjustments = { ArrowUp: 0.015, ArrowRight: 0.015, ArrowDown: -0.015, ArrowLeft: -0.015, PageUp: 0.1, PageDown: -0.1 };
      let position;
      if (event.key === 'Home') position = 0;
      else if (event.key === 'End') position = 1;
      else if (Object.hasOwn(adjustments, event.key)) position = fraction(param) + adjustments[event.key] * (event.shiftKey ? 0.2 : 1);
      else return;
      event.preventDefault();
      changeParam(param, position);
    }, options);
  }

  const modes = {
    scope: 'Živý průběh amplitudy. Vodorovná osa ukazuje čas v milisekundách.',
    spectrum: 'Živé frekvenční spektrum. Vodorovná osa ukazuje frekvenci v hertzech, svislá úroveň v decibelech.',
    history: 'Spektrogram posledních čtyř sekund. Svislá osa ukazuje frekvenci v hertzech, světlé body značí silnější signál.',
    tuner: 'Ladička. Zahraj jeden tón a sleduj jeho výšku a odchylku od nejbližšího tónu při ladění A4 = 440 Hz.'
  };
  let source = null;
  let requestedSampleRate = 0;
  let history = null;
  let pitch = null;
  let pitchStamp = 0;
  let pitchWork = null;

  function setSource(pairOrResolver, sampleRate) {
    source = pairOrResolver || null;
    requestedSampleRate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 0;
    sampleData = freqData = history = pitch = null;
    pitchStamp = 0;
    if (ui) ui.source.textContent = source ? 'Externí vstup' : 'Master';
    draw();
  }

  function drawHistory(g, width, height, node, rate, now) {
    const cols = 128, rows = 96, span = 4000;
    const index = Math.floor(now / span * cols);
    if (!history) {
      const image = document.createElement('canvas');
      image.width = cols; image.height = rows;
      const gc = image.getContext('2d');
      const strip = gc.createImageData(1, rows);
      history = { image, gc, strip, index: index - 1 };
    }
    const { gc, strip, image } = history;
    const minHz = 40, maxHz = Math.min(16000, rate / 2), binHz = rate / (node?.fftSize || 2048);
    const range = Math.log(maxHz / minHz);
    const x = index % cols;
    if (index !== history.index) {
      const skip = Math.min(cols, index - history.index);
      for (let n = 1; n < skip; n++) gc.clearRect((x + cols - n) % cols, 0, 1, rows);
      const lo = node?.minDecibels ?? -90, hi = node?.maxDecibels ?? -15;
      for (let y = 0; y < rows; y++) {
        const hz = minHz * Math.exp((1 - (y + 1) / rows) * range);
        const hiHz = minHz * Math.exp((1 - y / rows) * range);
        let db = lo;
        if (freqData) {
          const start = clamp(Math.round(hz / binHz), 0, freqData.length - 1);
          const end = clamp(Math.round(hiHz / binHz), start, freqData.length - 1);
          for (let i = start; i <= end; i++) db = Math.max(db, freqData[i]);
        }
        const power = clamp((db - lo) / (hi - lo), 0, 1);
        const p = y * 4;
        strip.data[p] = Math.round(9 + 224 * power ** 2.5);
        strip.data[p + 1] = Math.round(17 + 230 * power ** 1.1);
        strip.data[p + 2] = Math.round(12 + 108 * power ** 1.3);
        strip.data[p + 3] = 255;
      }
      gc.putImageData(strip, x, 0);
      history.index = index;
    }
    const area = { x: 29, y: 11, w: width - 39, h: height - 29 };
    const first = x + 1, nLeft = cols - first;
    g.imageSmoothingEnabled = false;
    if (nLeft) g.drawImage(image, first, 0, nLeft, rows, area.x, area.y, area.w * nLeft / cols, area.h);
    g.drawImage(image, 0, 0, first, rows, area.x + area.w * nLeft / cols, area.y, area.w * first / cols, area.h);
    g.imageSmoothingEnabled = true;
    const yTicks = [10000,1000,100].filter(hz => hz < maxHz).map(hz => [1 - Math.log(hz / minHz) / range, hz >= 1000 ? hz / 1000 + 'k' : String(hz)]);
    axis(g, width, height, area, [[0,'−4 s'],[.25,'−3'],[.5,'−2'],[.75,'−1'],[1,'Teď']], yTicks, false);
  }

  function detectPitch(input, rate) {
    if (!input || input.length < 256) return null;
    // Averaging keeps frequencies near Nyquist from aliasing into the pitch range when decimating.
    const stride = Math.max(1, Math.floor(rate / 12000));
    const size = Math.floor(input.length / stride), reducedRate = rate / stride;
    const highLag = Math.min(Math.ceil(reducedRate / 48), Math.floor(size / 2));
    const lowLag = Math.max(2, Math.floor(reducedRate / 1400));
    if (highLag <= lowLag + 2) return null;
    if (!pitchWork || pitchWork.samples.length !== size || pitchWork.diffs.length !== highLag + 1) {
      pitchWork = { samples: new Float32Array(size), diffs: new Float32Array(highLag + 1) };
    }
    const {samples, diffs} = pitchWork;
    let sum = 0, energy = 0;
    for (let i = 0; i < size; i++) {
      let value = 0;
      for (let k = 0; k < stride; k++) value += input[i * stride + k];
      samples[i] = value / stride;
      sum += samples[i]; energy += samples[i] ** 2;
    }
    if (energy / size - (sum / size) ** 2 < 0.000009) return null;
    // YIN cumulative mean normalized difference, with identical windows for every lag.
    let running = 0;
    const windowSize = size - highLag;
    for (let lag = 1; lag <= highLag; lag++) {
      let difference = 0;
      for (let j = 0; j < windowSize; j++) difference += (samples[j] - samples[j + lag]) ** 2;
      running += difference;
      diffs[lag] = running > 0 ? difference * lag / running : 1;
    }
    for (let lag = lowLag; lag < highLag - 1; lag++) {
      if (diffs[lag] >= 0.13 || diffs[lag] >= diffs[lag - 1] || diffs[lag] > diffs[lag + 1]) continue;
      const left = diffs[lag - 1], mid = diffs[lag], right = diffs[lag + 1];
      const curvature = left + right - 2 * mid;
      const offset = curvature > 0 ? clamp((left - right) / (2 * curvature), -.5, .5) : 0;
      const hz = reducedRate / (lag + offset);
      const midi = 69 + 12 * Math.log2(hz / 440);
      const note = Math.round(midi);
      const name = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','H'][((note % 12) + 12) % 12] + (Math.floor(note / 12) - 1);
      return { hz, name, cents: Math.round((midi - note) * 100) };
    }
    return null;
  }

  function drawTuner(g, width, height, rate, now) {
    if (!pitchStamp || now - pitchStamp > 65) {
      pitch = detectPitch(sampleData, rate);
      pitchStamp = now;
    }
    const freq = pitch ? number.format(Math.round(pitch.hz * 10) / 10) + ' Hz' : 'Zahraj jeden tón';
    const cents = pitch ? (pitch.cents > 0 ? '+' : '') + pitch.cents + ' ct' : '';
    g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'right'; g.fillStyle = '#95a799'; g.fillText('A4 = 440 Hz', width - 11, 16);
    g.font = '600 26px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = ink; g.fillText(pitch?.name ?? '—', width * .5, height * .37);
    g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#bac9bd'; g.fillText([freq,cents].filter(Boolean).join('  /  '), width * .5, height * .54);
    const x = 17, y = height * .75, plotWidth = width - 2 * x;
    for (let i = 0; i <= 20; i++) {
      const center = i === 10, major = i % 5 === 0;
      const position = x + i / 20 * plotWidth;
      g.strokeStyle = center ? '#b4f88c' : major ? '#73927a' : '#3d5543';
      g.beginPath(); g.moveTo(position, y - (center ? 6 : major ? 4 : 2)); g.lineTo(position,y + 3); g.stroke();
    }
    if (pitch) {
      const position = x + (pitch.cents + 50) / 100 * plotWidth;
      g.fillStyle = Math.abs(pitch.cents) <= 5 ? '#b2f664' : '#e4bb70';
      g.beginPath(); g.moveTo(position-4,y-11); g.lineTo(position+4,y-11); g.lineTo(position,y-5); g.closePath(); g.fill();
    }
    g.font = '9px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#9daa9d';
    g.textAlign = 'left'; g.fillText('−50 ct',x,height-5);
    g.textAlign = 'center'; g.fillText('0',width/2,height-5);
    g.textAlign = 'right'; g.fillText('+50 ct',width-x,height-5);
    const description = pitch ? pitch.name + ', ' + freq + ', ' + cents : 'Čeká na stabilní tón';
    if (ui.canvas.dataset.reading !== description) {
      ui.canvas.dataset.reading = description;
      ui.canvas.setAttribute('aria-label', 'Ladička. ' + description + '. A4 = 440 Hz.');
    }
  }

  function selectMode(next) {
    if (!Object.hasOwn(modes, next)) return;
    if (next !== mode) { history = null; pitchStamp = 0; delete ui.canvas.dataset.reading; }
    mode = next;
    for (const button of ui.modeButtons) button.setAttribute('aria-pressed', String(mode === button.dataset.mode));
    ui.canvas.setAttribute('aria-label', modes[mode]);
    draw();
  }

  function mount(target, context) {
    teardown();
    host = target;
    ctx = context;
    listeners = new AbortController();
    const waveButtons = waves.map(wave => '<button type="button" class="sg-wave" data-wave="' + wave.id + '" aria-label="' + wave.label + '" title="' + wave.label + '">' + icon(wave.path) + '</button>').join('');
    const knobs = params.map(param => `<div class="sg-knob-group">
      <span class="sg-knob-label">${param.label}</span>
      <button type="button" class="sg-knob" role="slider" aria-label="${param.label}" aria-orientation="vertical" aria-valuemin="${param.min}" aria-valuemax="${param.max}" title="${param.label} · tažením nebo šipkami změň hodnotu, dvojklik ji obnoví"><span class="sg-knob-ticks"></span><span class="sg-knob-arc"></span><span class="sg-knob-dial"><i></i></span></button>
      <output class="sg-knob-readout" aria-hidden="true"></output>
    </div>`).join('');
    host.innerHTML = `<section class="sg-panel sg-analyzer" aria-label="Analyzátor">
      <div class="sg-title"><h2>${icon('M2 11h4l3-7 4 13 3-9 2 3h4')}Analyzátor</h2><span class="sg-status"><i></i><span>Připraven</span></span></div>
      <div class="sg-content sg-analysis">
        <div class="sg-tabs" role="group" aria-label="Zobrazení analyzátoru"><button type="button" data-mode="scope">Osciloskop</button><button type="button" data-mode="spectrum">Spektrum</button><button type="button" data-mode="history">Spektrogram</button><button type="button" data-mode="tuner">Ladička</button></div>
        <div class="sg-screen"><canvas aria-label="Živý osciloskop výstupu" role="img"></canvas></div>
        <div class="sg-meterline"><span class="sg-source">Master</span><div class="sg-meter" aria-hidden="true"><i></i></div><output class="sg-level" aria-live="off" aria-label="Špičková úroveň">−∞ dBFS</output></div>
      </div>
    </section>
    <section class="sg-panel sg-synthesizer" aria-label="Syntezátor">
      <div class="sg-title"><h2>${icon('M2 5h4m5 0h11M8 2v6M2 14h11m5 0h4m-7-3v6')}Syntezátor</h2></div>
      <div class="sg-content sg-synth"><div class="sg-osc-label"><span>Tvar vlny</span><strong class="sg-wave-label"></strong></div><div class="sg-waves" role="group" aria-label="Tvar vlny oscilátoru">${waveButtons}</div><div class="sg-knobs">${knobs}</div></div>
    </section>`;
    const get = selector => host.querySelector(selector);
    ui = { canvas: get('.sg-screen canvas'), modeButtons: [...host.querySelectorAll('[data-mode]')], status: get('.sg-status'),
      source: get('.sg-source'), panels: [...host.children], level: get('.sg-level'), meter: get('.sg-meter i'), waveLabel: get('.sg-wave-label'),
      waveButtons: [...host.querySelectorAll('.sg-wave')], knobs: [...host.querySelectorAll('.sg-knob')], knobReadouts: [...host.querySelectorAll('.sg-knob-readout')] };
    for (const button of ui.waveButtons) button.addEventListener('click', () => {
      if (synth.wave === button.dataset.wave) return;
      setSynth({ wave: button.dataset.wave });
      ctx.changed();
    }, { signal: listeners.signal });
    for (const button of ui.modeButtons) button.addEventListener('click', () => selectMode(button.dataset.mode), { signal: listeners.signal });
    ui.knobs.forEach((button, i) => attachKnob(button, params[i]));
    setSynth(synth);
    ui.source.textContent = source ? 'Externí vstup' : 'Master';
    selectMode(mode);
    visible = true;
    if (typeof ResizeObserver === 'function') {
      sizeObserver = new ResizeObserver(draw);
      sizeObserver.observe(ui.canvas);
    }
    if (typeof IntersectionObserver === 'function') {
      visibilityObserver = new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting);
        schedule();
      });
      visibilityObserver.observe(ui.canvas);
    }
    document.addEventListener('visibilitychange', schedule, { signal: listeners.signal });
    schedule();
  }

  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!ui || !visible || document.hidden) return;
    frame = requestAnimationFrame(renderFrame);
  }

  function renderFrame(stamp) {
    frame = 0;
    if (!ui || !visible || document.hidden) return;
    if (stamp - lastPaint >= 1000 / 30) {
      draw();
      lastPaint = stamp;
    }
    frame = requestAnimationFrame(renderFrame);
  }

  function axis(ctx2d, width, height, area, xTicks, yTicks, minor = true) {
    ctx2d.font = '9px ui-monospace, Menlo, Consolas, monospace';
    ctx2d.fillStyle = '#96a89a';
    ctx2d.lineWidth = 0.7;
    for (let i = 0; minor && i <= 12; i++) {
      const x = area.x + area.w * i / 12;
      ctx2d.beginPath(); ctx2d.moveTo(x, area.y); ctx2d.lineTo(x, area.y + area.h);
      ctx2d.strokeStyle = '#1b2920'; ctx2d.stroke();
    }
    for (const [fraction, label] of xTicks) {
      const x = area.x + fraction * area.w;
      ctx2d.beginPath(); ctx2d.moveTo(x, area.y); ctx2d.lineTo(x, area.y + area.h);
      ctx2d.strokeStyle = '#2c3b2e'; ctx2d.stroke();
      ctx2d.textAlign = x < area.x + 4 ? 'left' : x > width - 24 ? 'right' : 'center';
      ctx2d.fillText(label, x, height - 5);
    }
    ctx2d.textAlign = 'right';
    for (const [fraction, label] of yTicks) {
      const y = area.y + fraction * area.h;
      ctx2d.beginPath(); ctx2d.moveTo(area.x, y); ctx2d.lineTo(area.x + area.w, y);
      ctx2d.strokeStyle = label === '0' ? '#3a4f3e' : '#2b3c2e'; ctx2d.stroke();
      if (label) ctx2d.fillText(label, area.x - 6, y + 3);
    }
  }

  function scopePlot(g, width, height, area, sampleRate) {
    // Show one fixed interval. A rising zero-crossing keeps periodic waveforms readable.
    const count = Math.max(2, Math.min(Math.round(sampleRate * 0.02), sampleData?.length || Infinity));
    const millis = (count - 1) / sampleRate * 1000;
    const ticks = Array.from({length: 5}, (_, i) => [i / 4, String(Math.round(millis * i / 4)) + (i === 4 ? ' ms' : '')]);
    axis(g, width, height, area, ticks, [[0,'+1'],[.25,''],[.5,'0'],[.75,''],[1,'−1']]);
    let start = 0;
    if (sampleData) {
      const end = sampleData.length - count;
      for (let i = 1; i <= end; i++) if (sampleData[i - 1] < 0 && sampleData[i] >= 0) { start = i; break; }
    }
    g.beginPath();
    const pixels = Math.max(1, Math.round(area.w));
    for (let i = 0; i <= pixels; i++) {
      const sample = sampleData ? sampleData[start + Math.round(i / pixels * (count - 1))] : 0;
      const x = area.x + i / pixels * area.w;
      const y = area.y + (1 - clamp(sample, -1, 1)) / 2 * area.h;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = ink; g.lineWidth = 1.65; g.shadowColor = '#95efaa'; g.shadowBlur = 2.5;
    g.stroke(); g.shadowBlur = 0;
  }

  function spectrumPlot(g, width, height, area, node, sampleRate) {
    const floor = node?.minDecibels ?? -90;
    const ceiling = node?.maxDecibels ?? -15;
    const minHz = 30, maxHz = Math.min(20000, sampleRate / 2);
    const octaveSpan = Math.log(maxHz / minHz);
    const ticks = [30, 100, 1000, 10000].filter(hz => hz <= maxHz).map(hz => [
      Math.log(hz / minHz) / octaveSpan, hz === 10000 ? '10 kHz' : hz === 1000 ? '1k' : String(hz)
    ]);
    axis(g, width, height, area, ticks, [[0, String(ceiling)], [.5, String(Math.round((ceiling + floor) / 2))], [1, String(floor)]]);
    const points = new Path2D();
    const pixels = Math.max(1, Math.round(area.w));
    const binHz = sampleRate / (node?.fftSize || 2048);
    for (let i = 0; i <= pixels; i++) {
      const hz = minHz * Math.exp(i / pixels * octaveSpan);
      const nextHz = minHz * Math.exp((i + 1) / pixels * octaveSpan);
      let db = floor;
      if (freqData) {
        const start = clamp(Math.round(hz / binHz), 0, freqData.length - 1);
        const end = clamp(Math.round(nextHz / binHz), start, freqData.length - 1);
        for (let bin = start; bin <= end; bin++) db = Math.max(db, freqData[bin]);
      }
      const x = area.x + i / pixels * area.w;
      const y = area.y + (1 - clamp((db - floor) / (ceiling - floor), 0, 1)) * area.h;
      if (i === 0) points.moveTo(x, y); else points.lineTo(x, y);
    }
    g.lineWidth = 1.6; g.strokeStyle = ink; g.stroke(points);
    points.lineTo(area.x + area.w, area.y + area.h); points.lineTo(area.x, area.y + area.h); points.closePath();
    const gradient = g.createLinearGradient(0, area.y, 0, area.y + area.h);
    gradient.addColorStop(0, '#6ed99159'); gradient.addColorStop(1, '#6ed9910d');
    g.fillStyle = gradient; g.fill(points);
  }

  function draw() {
    if (!ui) return;
    const { canvas } = ui;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (width < 50 || height < 32) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(w / width, 0, 0, h / height, 0, 0);
    g.clearRect(0, 0, width, height);
    const selected = source ? (typeof source === 'function' ? source() : source) : ctx.engine.analyzers();
    const state = selected?.scope?.context?.state || selected?.spectrum?.context?.state;
    const nodes = state && state !== 'running' ? null : selected;
    const sampleRate = requestedSampleRate || selected?.scope?.context?.sampleRate || nodes?.spectrum?.context?.sampleRate || 48000;
    let peak = 0;
    if (nodes?.scope) {
      if (sampleData?.length !== nodes.scope.fftSize) sampleData = new Float32Array(nodes.scope.fftSize);
      nodes.scope.getFloatTimeDomainData(sampleData);
      for (const value of sampleData) peak = Math.max(peak, Math.abs(value));
    } else sampleData = null;
    const area = { x: 29, y: 11, w: width - 39, h: height - 29 };
    if (mode === 'scope') scopePlot(g, width, height, area, sampleRate);
    else if (mode === 'tuner') drawTuner(g, width, height, sampleRate, performance.now());
    else {
      if (nodes?.spectrum) {
        if (freqData?.length !== nodes.spectrum.frequencyBinCount) freqData = new Float32Array(nodes.spectrum.frequencyBinCount);
        nodes.spectrum.getFloatFrequencyData(freqData);
      } else freqData = null;
      if (mode === 'spectrum') spectrumPlot(g, width, height, area, nodes?.spectrum, sampleRate);
      else drawHistory(g, width, height, nodes?.spectrum, sampleRate, performance.now());
    }
    const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
    const active = db > -70;
    const label = active ? 'Signál' : nodes?.scope ? 'Ticho' : 'Připraven';
    if (ui.status.lastElementChild.textContent !== label) ui.status.lastElementChild.textContent = label;
    ui.status.classList.toggle('is-active', active);
    const level = db > -90 ? number.format(Math.round(db * 10) / 10).replace('-', '−') + ' dBFS' : '−∞ dBFS';
    if (ui.level.textContent !== level) ui.level.textContent = level;
    ui.meter.style.transform = 'scaleX(' + clamp((db + 60) / 60, 0, 1) + ')';
  }

  function teardown() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    listeners?.abort();
    visibilityObserver?.disconnect();
    sizeObserver?.disconnect();
    if (ui) for (const panel of ui.panels) panel.remove();
    pitchStamp = 0;
    ui = ctx = host = sampleData = freqData = history = pitch = pitchWork = visibilityObserver = sizeObserver = listeners = null;
  }

  function dispose() {
    teardown();
    source = null;
    requestedSampleRate = 0;
  }

  window.Signal = { mount, setSource, refresh() { updateControls(); draw(); }, setSynth, getSynth: () => ({ ...synth }), dispose };
})();
