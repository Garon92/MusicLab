(() => {
  "use strict";

  let audio;
  let master;
  let noise;
  let volume = 0.65;
  const voices = new Set();
  const waves = new Set(["sine", "triangle", "square", "sawtooth"]);

  async function start() {
    if (!audio) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error("Tento prohlížeč neumí přehrát zvuk.");
      audio = new Audio();
      master = audio.createGain();
      master.gain.value = volume;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 5;
      master.connect(limiter).connect(audio.destination);

      noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.5), audio.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (audio.state !== "running") await audio.resume();
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (audio) master.gain.setTargetAtTime(volume, audio.currentTime, 0.015);
  }

  // A short gate on each voice lets Stop fade both live and scheduled notes.
  function voice() {
    const gate = audio.createGain();
    gate.connect(master);
    const sources = new Set();
    const nodes = [gate];
    const entry = { gate, sources };
    voices.add(entry);
    return {
      gate,
      track(node) {
        nodes.push(node);
        return node;
      },
      run(source, begin, end) {
        sources.add(source);
        source.onended = () => {
          source.disconnect();
          sources.delete(source);
          if (!sources.size) {
            for (const node of nodes) node.disconnect();
            voices.delete(entry);
          }
        };
        source.start(begin);
        source.stop(end);
      }
    };
  }

  function silence() {
    if (!audio) return;
    const now = audio.currentTime;
    for (const { gate, sources } of voices) {
      gate.gain.cancelScheduledValues(now);
      gate.gain.setTargetAtTime(0, now, 0.002);
      for (const source of sources) source.stop(now + 0.016);
    }
  }

  function envelope(v, time, duration, attack, level) {
    const env = v.track(audio.createGain());
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(level, time + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    env.connect(v.gate);
    return env;
  }

  function tone(v, time, duration, wave, from, to, env) {
    const osc = audio.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, time);
    if (from !== to) osc.frequency.exponentialRampToValueAtTime(to, time + duration * 0.7);
    osc.connect(env);
    v.run(osc, time, time + duration + 0.005);
  }

  function hiss(v, time, duration, type, frequency, q, env) {
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = v.track(audio.createBiquadFilter());
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter).connect(env);
    v.run(source, time, time + duration);
  }

  function playDrum(index, time) {
    if (!audio || !Number.isInteger(index) || index < 0 || index > 3) return;
    const t = Number.isFinite(time) ? Math.max(audio.currentTime, time) : audio.currentTime;
    const v = voice();
    if (index === 0) {
      tone(v, t, 0.30, "sine", 125, 43, envelope(v, t, 0.30, 0.003, 0.96));
      tone(v, t, 0.03, "triangle", 600, 90, envelope(v, t, 0.03, 0.001, 0.25));
    } else if (index === 1) {
      hiss(v, t, 0.19, "highpass", 1300, 0.65, envelope(v, t, 0.19, 0.002, 0.52));
      tone(v, t, 0.12, "triangle", 215, 111, envelope(v, t, 0.12, 0.002, 0.34));
    } else if (index === 2) {
      hiss(v, t, 0.08, "highpass", 6300, 0.8, envelope(v, t, 0.08, 0.002, 0.40));
    } else {
      const env = envelope(v, t, 0.22, 0.002, 0.60);
      for (const offset of [0.012, 0.024]) {
        env.gain.cancelScheduledValues(t + offset);
        env.gain.setValueAtTime(0.015, t + offset);
        env.gain.exponentialRampToValueAtTime(0.54, t + offset + 0.002);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      }
      hiss(v, t, 0.22, "bandpass", 1550, 0.85, env);
    }
  }

  function playNote(midi, time, options = {}) {
    if (!audio || !Number.isFinite(midi)) return;
    const t = Number.isFinite(time) ? Math.max(audio.currentTime, time) : audio.currentTime;
    const wave = waves.has(options.wave) ? options.wave : "triangle";
    const duration = Math.max(0.08, Math.min(4, Number(options.duration) || 0.46));
    const frequency = 440 * 2 ** ((Math.min(127, Math.max(0, midi)) - 69) / 12);
    const level = { sine: 0.47, triangle: 0.49, sawtooth: 0.30, square: 0.24 }[wave];
    const v = voice();
    const env = v.track(audio.createGain());
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + 0.014);
    env.gain.exponentialRampToValueAtTime(level * 0.58, t + duration * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    env.connect(v.gate);
    tone(v, t, duration, wave, frequency, frequency, env);
  }

  window.LabAudio = { start, now: () => audio?.currentTime || 0, setVolume, silence, playDrum, playNote };
})();
