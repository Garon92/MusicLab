(() => {
  "use strict";

  const names = ["drums", "bass", "lead", "keys", "sample"];
  const settings = Object.fromEntries(names.map(name => [name, { volume: 0.8, pan: 0, mute: false, solo: false }]));
  const synth = { wave: "sawtooth", cutoff: 3200, resonance: 0.8, attack: 0.012, release: 0.20 };
  const effects = { delay: 0.12, feedback: 0.26, time: 0.25 };
  const offsets = { cutoff: 0, resonance: 0, wet: 0, pan: 0, volume: 0 };
  const synthetic = name => name === "lead" || name === "keys";
  const eq = { low: 0, mid: 0, high: 0, bypass: false };
  let bands;
  const waves = ["sine", "triangle", "square", "sawtooth"];
  const waveLevels = { sine: 0.65, triangle: 0.65, square: 0.32, sawtooth: 0.48 };
  let masterLevel = 0.78;
  let audio, master, masterMeter, scope, spectrum, limiter, noise, mixer;
  let usedMixer = false;
  let take = null;
  let recorderModule = null;
  const voices = new Set();
  const held = new Map();
  const meterBuffer = new Float32Array(1024);

  function bounded(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  function smooth(param, value) {
    param.setTargetAtTime(value, audio.currentTime, 0.008);
  }

  function effectiveLevel(name) {
    const channel = settings[name];
    const hasSolo = names.some(id => settings[id].solo);
    if (channel.mute || (hasSolo && !channel.solo)) return 0;
    return synthetic(name) ? Math.min(1, channel.volume * (1 + offsets.volume)) : channel.volume;
  }

  const filterHz = () => Math.min(audio.sampleRate * 0.48, Math.max(30, synth.cutoff * 2 ** (offsets.cutoff * 3)));
  const filterQ = () => Math.min(24, Math.max(0.2, synth.resonance + offsets.resonance * 8));
  const wetLevel = () => Math.max(0, Math.min(1, effects.delay + offsets.wet));
  const panLevel = name => Math.max(-1, Math.min(1, settings[name].pan + (synthetic(name) ? offsets.pan : 0)));

  // Transient bipolar offsets combine with the stored patch and mix values.
  // Dropping a target restores the latest base parameter, including live edits.
  function setModulation(values = {}) {
    for (const target of Object.keys(offsets)) {
      const value = bounded(values[target], -1, 1, 0);
      if (offsets[target] === value) continue;
      offsets[target] = value;
      if (!mixer) continue;
      if (target === "wet") {
        for (const channel of Object.values(mixer.channels)) smooth(channel.wet.gain, wetLevel());
      } else {
        for (const name of ["lead", "keys"]) {
          const c = mixer.channels[name];
          if (target === "cutoff") smooth(c.input.frequency, filterHz());
          else if (target === "resonance") smooth(c.input.Q, filterQ());
          else if (target === "pan") smooth(c.pan.pan, panLevel(name));
          else smooth(c.fader.gain, effectiveLevel(name));
        }
      }
    }
  }

  function makeStereoMeter(source) {
    const split = audio.createChannelSplitter(2);
    source.connect(split);
    const channels = [0, 1].map(index => {
      const meter = audio.createAnalyser();
      meter.fftSize = meterBuffer.length;
      split.connect(meter, index);
      return meter;
    });
    return { split, channels };
  }

  // Each channel's delay returns through its own pan and fader, including its echoes.
  function makeMixer() {
    const bus = audio.createGain();
    const channels = {};
    const nodes = [bus];
    bus.connect(bands.low);
    for (const name of names) {
      const tonal = name === "lead" || name === "keys";
      const input = tonal ? audio.createBiquadFilter() : audio.createGain();
      if (tonal) {
        input.type = "lowpass";
        input.frequency.value = filterHz();
        input.Q.value = filterQ();
      }
      const fader = audio.createGain();
      const pan = audio.createStereoPanner();
      const echo = audio.createDelay(4);
      const damping = audio.createBiquadFilter();
      const feedback = audio.createGain();
      const wet = audio.createGain();
      const meter = makeStereoMeter(pan);
      echo.delayTime.value = effects.time;
      damping.type = "lowpass";
      damping.frequency.value = 3300;
      feedback.gain.value = Math.min(0.86, effects.feedback);
      wet.gain.value = wetLevel();
      fader.gain.value = effectiveLevel(name);
      pan.pan.value = panLevel(name);
      input.connect(fader).connect(pan).connect(bus);
      input.connect(echo).connect(damping);
      damping.connect(feedback).connect(echo);
      damping.connect(wet).connect(fader);
      channels[name] = { input, fader, pan, echo, feedback, wet, meter };
      nodes.push(input, fader, pan, echo, damping, feedback, wet, meter.split, ...meter.channels);
    }
    return { bus, channels, nodes };
  }

  async function start() {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("Tento prohlížeč nepodporuje Web Audio.");
      audio = new Context({ latencyHint: "interactive" });
      limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -9;
      limiter.knee.value = 6;
      limiter.ratio.value = 9;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
      bands = {};
      for (const [name, type, frequency] of [["low", "lowshelf", 160], ["mid", "peaking", 1200], ["high", "highshelf", 4500]]) {
        const band = audio.createBiquadFilter();
        band.type = type;
        band.frequency.value = frequency;
        band.Q.value = 0.85;
        band.gain.value = eq.bypass ? 0 : eq[name];
        bands[name] = band;
      }
      bands.low.connect(bands.mid).connect(bands.high).connect(limiter);
      master = audio.createGain();
      master.gain.value = masterLevel;
      limiter.connect(master).connect(audio.destination);
      scope = audio.createAnalyser();
      spectrum = audio.createAnalyser();
      scope.fftSize = spectrum.fftSize = 2048;
      spectrum.minDecibels = -90;
      spectrum.maxDecibels = -15;
      spectrum.smoothingTimeConstant = 0.76;
      master.connect(scope);
      master.connect(spectrum);
      masterMeter = makeStereoMeter(master);
      noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.6), audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      mixer = makeMixer();
    }
    if (audio.state !== "running") await audio.resume();
  }

  function setTrack(name, update = {}) {
    if (!names.includes(name)) return;
    const data = settings[name];
    data.volume = bounded(update.volume, 0, 1, data.volume);
    data.pan = bounded(update.pan, -1, 1, data.pan);
    if (typeof update.mute === "boolean") data.mute = update.mute;
    if (typeof update.solo === "boolean") data.solo = update.solo;
    if (!mixer) return;
    smooth(mixer.channels[name].pan.pan, panLevel(name));
    for (const id of names) smooth(mixer.channels[id].fader.gain, effectiveLevel(id));
  }

  function setMaster(value) {
    masterLevel = bounded(value, 0, 1, masterLevel);
    if (master) smooth(master.gain, masterLevel);
  }

  function setSynth(update = {}) {
    const changedWave = waves.includes(update.wave) && update.wave !== synth.wave;
    if (changedWave) synth.wave = update.wave;
    synth.cutoff = bounded(update.cutoff, 30, 18000, synth.cutoff);
    synth.resonance = bounded(update.resonance, 0.2, 24, synth.resonance);
    synth.attack = bounded(update.attack, 0.001, 2, synth.attack);
    synth.release = bounded(update.release, 0.005, 5, synth.release);
    if (!mixer) return;
    for (const name of ["lead", "keys"]) {
      const filter = mixer.channels[name].input;
      smooth(filter.frequency, filterHz());
      smooth(filter.Q, filterQ());
    }
    if (changedWave) {
      for (const voice of voices) for (const osc of voice.shaped) osc.type = synth.wave;
    }
  }

  function setEffects(update = {}) {
    effects.delay = bounded(update.delay, 0, 1, effects.delay);
    effects.feedback = bounded(update.feedback, 0, 1, effects.feedback);
    effects.time = bounded(update.time, 0.02, 4, effects.time);
    if (mixer) for (const channel of Object.values(mixer.channels)) {
      smooth(channel.echo.delayTime, effects.time);
      smooth(channel.wet.gain, wetLevel());
      smooth(channel.feedback.gain, Math.min(0.86, effects.feedback));
    }
  }

  function setEQ(update = {}) {
    if (typeof update.bypass === "boolean") eq.bypass = update.bypass;
    for (const name of ["low", "mid", "high"]) {
      eq[name] = bounded(update[name], -12, 12, eq[name]);
      if (bands) smooth(bands[name].gain, eq.bypass ? 0 : eq[name]);
    }
  }

  function makeVoice(name, velocity, input = mixer.channels[name].input) {
    usedMixer = true;
    const gate = audio.createGain();
    gate.gain.value = velocity;
    gate.connect(input);
    const voice = { sources: new Set(), shaped: [], nodes: [gate], gate };
    voices.add(voice);
    return voice;
  }

  function run(voice, source, time, end, offset) {
    voice.sources.add(source);
    source.onended = () => {
      source.disconnect();
      voice.sources.delete(source);
      if (!voice.sources.size) {
        for (const node of voice.nodes) node.disconnect();
        voices.delete(voice);
      }
    };
    if (offset === undefined) source.start(time);
    else source.start(time, offset);
    if (end !== undefined) source.stop(end);
  }

  function envelope(voice, time, attack, hold, release, level, sustain) {
    const env = audio.createGain();
    const peak = time + attack;
    const off = Math.max(peak + 0.0001, time + hold);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, peak);
    if (voice.live) env.gain.setTargetAtTime(level * sustain, peak, 0.14);
    else {
      env.gain.exponentialRampToValueAtTime(level * sustain, off);
      env.gain.exponentialRampToValueAtTime(0.0001, off + release);
    }
    env.connect(voice.gate);
    voice.nodes.push(env);
    return env;
  }

  function oscillator(voice, target, wave, hz, time, end, detune = 0) {
    const osc = audio.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz;
    osc.detune.value = detune;
    osc.connect(target);
    run(voice, osc, time, end);
    return osc;
  }

  function note(name, midi, time, duration = 0.3, velocity = 1, live = false) {
    if (!audio || !["bass", "lead", "keys"].includes(name) || !Number.isFinite(midi)) return;
    velocity = bounded(velocity, 0, 1, 1);
    if (!velocity) return;
    const t = Number.isFinite(time) ? Math.max(time, audio.currentTime) : audio.currentTime;
    const hold = bounded(duration, 0.015, 20, 0.3);
    const hz = 440 * 2 ** ((bounded(midi, 0, 127, 60) - 69) / 12);
    const v = makeVoice(name, velocity);
    v.live = live;
    if (live) held.set(midi, v);
    if (name === "bass") {
      const end = live ? undefined : t + hold + 0.10;
      oscillator(v, envelope(v, t, 0.006, hold, 0.09, 0.69, 0.68), "triangle", hz, t, end);
      oscillator(v, envelope(v, t, 0.008, hold, 0.06, 0.16, 0.63), "sine", hz / 2, t, end);
      return;
    }
    const attack = live ? synth.attack : Math.min(hold, synth.attack);
    const end = live ? undefined : t + hold + synth.release + 0.008;
    const attackLevel = live ? 1 : Math.min(1, hold / synth.attack);
    const level = waveLevels[synth.wave] * attackLevel;
    if (name === "lead") {
      const env = envelope(v, t, attack, hold, synth.release, level * 0.46, 0.82);
      v.shaped.push(oscillator(v, env, synth.wave, hz, t, end, -4));
      v.shaped.push(oscillator(v, env, synth.wave, hz, t, end, 4));
    } else {
      const body = envelope(v, t, attack, hold, synth.release, level * 0.83, 0.48);
      v.shaped.push(oscillator(v, body, synth.wave, hz, t, end));
      const bell = envelope(v, t, attack, hold, synth.release * 0.65, 0.17 * attackLevel, 0.17);
      oscillator(v, bell, "sine", hz * 2.006, t, end);
    }
  }

  function hiss(v, time, duration, type, hz, q, level) {
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    src.buffer = noise;
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const env = envelope(v, time, 0.0015, 0.006, duration - 0.006, level, 0.85);
    src.connect(filter).connect(env);
    v.nodes.push(filter);
    run(v, src, time, time + duration + 0.002, Math.random() * 0.18);
  }

  function drum(index, time, velocity = 1) {
    if (!audio || !Number.isInteger(index) || index < 0 || index > 3) return;
    velocity = bounded(velocity, 0, 1, 1);
    if (!velocity) return;
    const t = Number.isFinite(time) ? Math.max(time, audio.currentTime) : audio.currentTime;
    const v = makeVoice("drums", velocity);
    if (index === 0) {
      const kick = oscillator(v, envelope(v, t, 0.002, 0.055, 0.26, 1, 0.74), "sine", 140, t, t + 0.32);
      kick.frequency.setValueAtTime(140, t);
      kick.frequency.exponentialRampToValueAtTime(51, t + 0.06);
      kick.frequency.exponentialRampToValueAtTime(43, t + 0.29);
      hiss(v, t, 0.013, "bandpass", 2100, 0.7, 0.32);
    } else if (index === 1) {
      hiss(v, t, 0.20, "highpass", 1350, 0.7, 0.68);
      const shell = oscillator(v, envelope(v, t, 0.0015, 0.012, 0.14, 0.39, 0.65), "triangle", 216, t, t + 0.155);
      shell.frequency.setValueAtTime(216, t);
      shell.frequency.exponentialRampToValueAtTime(119, t + 0.09);
    } else if (index === 2) {
      hiss(v, t, 0.081, "highpass", 6300, 0.8, 0.55);
    } else {
      for (const offset of [0, 0.013, 0.026]) {
        hiss(v, t + offset, offset === 0.026 ? 0.16 : 0.017, "bandpass", 1520, 0.72, 0.86);
      }
    }
  }

  function referenceTone(hz) {
    if (!audio || !Number.isFinite(hz)) return;
    const t = audio.currentTime;
    const frequency = bounded(hz, 20, Math.min(16000, audio.sampleRate * 0.48), 440);
    // Send the dry sine to the Keys fader after its patch filter.
    const v = makeVoice("keys", 1, mixer.channels.keys.fader);
    const env = envelope(v, t, 0.012, 0.97, 0.03, 0.26, 1);
    oscillator(v, env, "sine", frequency, t, t + 1.005);
  }

  function keyOn(midi, velocity = 1, name = "keys") {
    if (!Number.isFinite(midi) || held.has(midi)) return;
    note(name, midi, undefined, 0.3, velocity, true);
  }

  function keyOff(midi) {
    const v = held.get(midi);
    if (!v || !audio) return;
    held.delete(midi);
    const now = audio.currentTime;
    v.gate.gain.setTargetAtTime(0, now, synth.release / 7);
    for (const source of v.sources) source.stop(now + synth.release + 0.012);
  }

  function meters() {
    function peak(meter) {
      if (!meter) return 0;
      let value = 0;
      for (const node of meter.channels) {
        node.getFloatTimeDomainData(meterBuffer);
        for (let i = 0; i < meterBuffer.length; i++) value = Math.max(value, Math.abs(meterBuffer[i]));
      }
      return Math.min(1, value);
    }
    const result = { master: peak(masterMeter) };
    for (const name of names) result[name] = peak(mixer?.channels[name].meter);
    return result;
  }

  async function decode(data) {
    // Decoding a restored project must also work before the first user gesture.
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const decoder = audio || new Offline(1, 1, 44100);
    return decoder.decodeAudioData(data.slice(0));
  }

  function playBuffer(buffer, options = {}) {
    if (!audio || !buffer?.duration) return;
    const velocity = bounded(options.velocity, 0, 1, 1);
    if (!velocity) return;
    const t = Number.isFinite(options.time) ? Math.max(audio.currentTime, options.time) : audio.currentTime;
    const rate = bounded(options.rate, 0.125, 8, 1);
    const begin = bounded(options.start, 0, buffer.duration, 0);
    const end = bounded(options.end, begin, buffer.duration, buffer.duration);
    if (end <= begin) return;
    const length = (end - begin) / rate;
    const v = makeVoice("sample", velocity);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const fade = Math.min(0.005, length / 3);
    v.gate.gain.setValueAtTime(0, t);
    v.gate.gain.linearRampToValueAtTime(velocity, t + fade);
    v.gate.gain.setValueAtTime(velocity, t + length - fade);
    v.gate.gain.linearRampToValueAtTime(0, t + length);
    source.connect(v.gate);
    run(v, source, t, t + length, begin);
  }

  function silence() {
    if (!audio || !usedMixer) return;
    const now = audio.currentTime;
    // Fade the whole old graph so its filters, echoes and scheduled notes can never
    // leak into a new transport run that starts immediately after Stop.
    held.clear();
    const old = mixer;
    old.bus.gain.setTargetAtTime(0, now, 0.0015);
    for (const voice of voices) for (const source of voice.sources) source.stop(now + 0.010);
    mixer = makeMixer();
    usedMixer = false;
    setTimeout(() => { for (const node of old.nodes) node.disconnect(); }, 32);
  }

  // The worklet runs only during recording. It posts packed PCM in blocks instead
  // of forwarding a message for every 128-sample render quantum.
  const recorderSource = `
    class StereoPcmCapture extends AudioWorkletProcessor {
      constructor() {
        super();
        this.buffer = new Int16Array(8192);
        this.cursor = 0;
        this.active = true;
        this.port.onmessage = () => {
          this.active = false;
          this.flush();
          this.port.postMessage("done");
        };
      }
      flush() {
        if (!this.cursor) return;
        const chunk = this.cursor === this.buffer.length ? this.buffer : this.buffer.slice(0, this.cursor);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.buffer = new Int16Array(8192);
        this.cursor = 0;
      }
      process(inputs, outputs) {
        if (!this.active) return false;
        const input = inputs[0];
        const left = input[0];
        const right = input[1] || left;
        const frames = outputs[0][0].length;
        for (let i = 0; i < frames; i++) {
          this.buffer[this.cursor++] = Math.round(Math.max(-1, Math.min(1, left?.[i] || 0)) * 32767);
          this.buffer[this.cursor++] = Math.round(Math.max(-1, Math.min(1, right?.[i] || 0)) * 32767);
          if (this.cursor === this.buffer.length) this.flush();
        }
        return true;
      }
    }
    registerProcessor("musiclab-stereo-pcm", StereoPcmCapture);
  `;

  async function hasRecorderModule() {
    if (!audio.audioWorklet || !window.AudioWorkletNode) return false;
    if (!recorderModule) {
      const localFile = location.protocol === "file:";
      const url = localFile ? "data:text/javascript;charset=utf-8," + encodeURIComponent(recorderSource) :
        URL.createObjectURL(new Blob([recorderSource], { type: "application/javascript" }));
      recorderModule = audio.audioWorklet.addModule(url).then(() => true, () => false)
        .finally(() => { if (!localFile) URL.revokeObjectURL(url); });
    }
    return recorderModule;
  }

  async function connectRecorder(job) {
    await start();
    const stereo = { channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers" };
    if (await hasRecorderModule()) {
      const node = new AudioWorkletNode(audio, "musiclab-stereo-pcm", { ...stereo, outputChannelCount: [1] });
      let finished;
      const flushed = new Promise(resolve => { finished = resolve; });
      node.port.onmessage = ({data}) => {
        if (data === "done") finished();
        else job.chunks.push(data);
      };
      node.onprocessorerror = () => {
        job.error = new Error("Prohlížeč přerušil záznam zvuku.");
        finished();
      };
      job.end = async () => {
        node.port.postMessage("finish");
        let timeout;
        try {
          await Promise.race([flushed, new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Zvukový procesor nedokončil nahrávku.")), 3000);
          })]);
        } finally { clearTimeout(timeout); node.port.close(); }
      };
      job.node = node;
    } else {
      // Works in browsers that cannot load an AudioWorklet from a local file.
      const node = audio.createScriptProcessor(1024, 2, 1);
      node.onaudioprocess = event => {
        const left = event.inputBuffer.getChannelData(0);
        const right = event.inputBuffer.getChannelData(1);
        const pcm = new Int16Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
          pcm[i * 2] = Math.round(bounded(left[i], -1, 1, 0) * 32767);
          pcm[i * 2 + 1] = Math.round(bounded(right[i], -1, 1, 0) * 32767);
        }
        job.chunks.push(pcm.buffer);
      };
      job.end = () => { node.onaudioprocess = null; };
      job.node = node;
    }
    master.connect(job.node);
    // Both capture paths emit zeros. Connecting to the destination keeps them pulled.
    job.node.connect(audio.destination);
  }

  function recordStart() {
    if (take) return take.stopping ? take.stopping.then(recordStart) : take.ready;
    const job = { chunks: [], node: null };
    take = job;
    job.ready = connectRecorder(job).catch(error => {
      if (take === job) take = null;
      throw error;
    });
    return job.ready;
  }

  function waveBlob(chunks) {
    const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    if (length > 0xffffffff - 36) throw new Error("Nahrávka překročila maximální velikost souboru WAV.");
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const tag = (offset, name) => {
      for (let i = 0; i < name.length; i++) view.setUint8(offset + i, name.charCodeAt(i));
    };
    tag(0, "RIFF"); view.setUint32(4, length + 36, true); tag(8, "WAVE");
    tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 2, true); view.setUint32(24, audio.sampleRate, true);
    view.setUint32(28, audio.sampleRate * 4, true); view.setUint16(32, 4, true);
    view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, length, true);
    return new Blob([header, ...chunks], { type: "audio/wav" });
  }

  function recordStop() {
    const job = take;
    if (!job) return Promise.reject(new Error("Nahrávání právě neběží."));
    if (job.stopping) return job.stopping;
    job.stopping = (async () => {
      try {
        await job.ready;
        await job.end();
        if (job.error) throw job.error;
        return waveBlob(job.chunks);
      } finally {
        if (job.node) { master.disconnect(job.node); job.node.disconnect(); }
        if (take === job) take = null;
      }
    })();
    return job.stopping;
  }

  window.Engine = {
    start, now: () => audio?.currentTime || 0, sampleRate: () => audio?.sampleRate || 48000,
    drum, note, setTrack, setMaster, setSynth, setEffects, setEQ, setModulation,
    analyzers: () => ({ scope: scope || null, spectrum: spectrum || null }),
    silence, recordStart, recordStop, keyOn, keyOff, meters, decode, playBuffer, referenceTone
  };
})();
