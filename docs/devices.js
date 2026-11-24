(() => {
  "use strict";
  const drumNotes = [36, 38, 42, 39];
  const channels = { drums: 9, bass: 0, lead: 1, keys: 2 };
  let ctx,
    root,
    midi,
    input,
    output,
    stream,
    micAudio,
    micNode,
    source = "master";
  let requestedMic = 0;
  const inputHeld = new Map();

  function mount(host, context) {
    ctx = context;
    root = host;
    root.innerHTML = `<div class="io-block"><h3>MIDI porty</h3><button type="button" class="btn" data-connect>Připojit MIDI</button><label>Vstup<select data-in><option value="">Odpojeno</option></select></label><label>Výstup<select data-out><option value="">Odpojeno</option></select></label><output data-midi-state>Bez připojení</output></div>
    <div class="io-block"><h3>Vstup analyzátoru</h3><div class="inline"><button class="btn" data-master>Master</button><button class="btn" data-mic>Mikrofon</button></div><output data-mic-state>Master out</output></div>
    <div class="io-block"><h3>Standard MIDI File</h3><div class="inline"><button class="btn" data-smf>Export aranže .mid</button><button class="btn" data-import>Import .mid</button></div><input hidden type="file" data-file accept=".mid,.midi,audio/midi"><p class="io-description">Bicí, basa a lead. Import načte první čtyři takty do bank A–D.</p></div>`;
    host.querySelector("[data-connect]").addEventListener("click", connect);
    host.querySelector("[data-in]").onchange = chooseInput;
    host.querySelector("[data-out]").onchange = () => {
      panic();
      output = midi?.outputs.get(host.querySelector("[data-out]").value);
    };
    host.querySelector("[data-master]").onclick = stopMic;
    host.querySelector("[data-mic]").onclick = startMic;
    host.querySelector("[data-smf]").onclick = () => exportMidi(ctx.snapshot());
    const fileInput = host.querySelector("[data-file]");
    host.querySelector("[data-import]").onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      try {
        if (file.size > 8 * 1024 * 1024) throw Error("Soubor je příliš velký (maximum 8 MB).");
        const result = readMidi(await file.arrayBuffer());
        if (await ctx.confirmImport()) ctx.importPatterns(result.data, result.tempo);
      } catch (e) {
        ctx.notify(e.message || "MIDI soubor nelze načíst.");
      }
    };
    updateMic();
  }
  async function connect() {
    try {
      if (!navigator.requestMIDIAccess)
        throw Error("Tento prohlížeč nenabízí Web MIDI. Soubory MIDI lze používat i bez zařízení.");
      midi = await navigator.requestMIDIAccess({ sysex: false });
      await ctx.unlock();
      midi.onstatechange = refreshPorts;
      refreshPorts();
    } catch (e) {
      ctx.notify(e.name === "NotAllowedError" ? "Přístup k MIDI nebyl povolen." : e.message);
    }
  }
  function refreshPorts() {
    const update = (selector, ports, previous) => {
      const select = root.querySelector(selector);
      select.replaceChildren(new Option("Odpojeno", ""));
      for (const port of ports.values())
        if (port.state === "connected") select.add(new Option(port.name || port.id, port.id));
      if (previous && [...select.options].some((option) => option.value === previous.id))
        select.value = previous.id;
    };
    update("[data-in]", midi.inputs, input);
    update("[data-out]", midi.outputs, output);
    chooseInput();
    if (output?.state === "disconnected") output = null;
    root.querySelector("[data-midi-state]").textContent =
      midi.inputs.size + " vstupů / " + midi.outputs.size + " výstupů";
  }
  function chooseInput() {
    for (const [source, note] of inputHeld) LiveKeys.off(note, source);
    inputHeld.clear();
    if (input) input.onmidimessage = null;
    input = midi.inputs.get(root.querySelector("[data-in]").value);
    if (input)
      input.onmidimessage = (e) => {
        const [status, note, velocity] = e.data;
        const op = status & 240;
        const source = "midi:" + input.id + ":" + (status & 15) + ":" + note;
        if (op === 144 && velocity) {
          if ((status & 15) === 9) {
            const i = drumNotes.indexOf(note);
            if (i >= 0) ctx.engine.drum(i, undefined, velocity / 127);
          } else {
            inputHeld.set(source, note);
            LiveKeys.on(note, velocity / 127, source);
          }
        } else if (op === 128 || (op === 144 && !velocity)) {
          inputHeld.delete(source);
          LiveKeys.off(note, source);
        }
      };
  }
  function liveKey(on, note, velocity = 1) {
    try {
      output?.send([on ? 146 : 130, note, on ? Math.max(1, Math.min(127, Math.round(velocity * 110))) : 0]);
    } catch {
      output = null;
    }
  }
  function panic() {
    if (!output) return;
    try {
      output.clear();
      for (const ch of Object.values(channels)) output.send([176 + ch, 123, 0]);
    } catch {
      output = null;
    }
  }
  function send(track, midiNote, time, duration, velocity = 1) {
    if (!output || !(track in channels)) return;
    const ch = channels[track],
      at = performance.now() + Math.max(0, (time ?? ctx.engine.now()) - ctx.engine.now()) * 1000;
    try {
      output.send([144 + ch, midiNote, Math.max(1, Math.min(127, Math.round(velocity * 110)))], at);
      output.send([128 + ch, midiNote, 0], at + duration * 1000);
    } catch {
      output = null;
    }
  }
  function updateMic() {
    root.querySelector("[data-master]").setAttribute("aria-pressed", String(source === "master"));
    root.querySelector("[data-mic]").setAttribute("aria-pressed", String(source === "mic"));
    root.querySelector("[data-mic-state]").textContent =
      source === "mic" ? "Mikrofon · pouze měření" : "Master out";
  }
  function stopMic() {
    requestedMic++;
    source = "master";
    Signal.setSource(null);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    micNode?.disconnect();
    micNode = null;
    if (micAudio) micAudio.close().catch(() => {});
    micAudio = null;
    updateMic();
  }
  async function startMic() {
    if (source === "mic") return;
    const request = ++requestedMic;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Mikrofon vyžaduje podporovaný prohlížeč a zabezpečenou stránku.");
      const incoming = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (request !== requestedMic) {
        incoming.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = incoming;
      micAudio = new (window.AudioContext || window.webkitAudioContext)();
      await micAudio.resume();
      if (request !== requestedMic) return;
      micNode = micAudio.createMediaStreamSource(stream);
      const scope = micAudio.createAnalyser(),
        spectrum = micAudio.createAnalyser();
      scope.fftSize = 4096;
      spectrum.fftSize = 4096;
      micNode.connect(scope);
      micNode.connect(spectrum);
      source = "mic";
      Signal.setSource({ scope, spectrum }, micAudio.sampleRate);
      updateMic();
      stream.getAudioTracks()[0].addEventListener("ended", stopMic, { once: true });
    } catch (e) {
      if (request === requestedMic) {
        stopMic();
        ctx.notify(e.name === "NotAllowedError" ? "Přístup k mikrofonu nebyl povolen." : e.message);
      }
    }
  }

  function variable(n) {
    const out = [n & 127];
    while ((n = Math.floor(n / 128)) > 0) out.unshift(128 + (n & 127));
    return out;
  }
  function exportMidi(project) {
    const ppq = 96,
      events = [{ at: 0, bytes: [255, 81, 3, ...u24(Math.round(60000000 / project.tempo))] }];
    for (const [ch, gm] of [
      [0, 38],
      [1, 81],
      [2, 0],
    ])
      events.push({ at: 0, bytes: [192 + ch, gm] });
    const notes = {
      bass: [48, 47, 45, 43, 41, 40, 38, 36],
      lead: [72, 71, 69, 67, 65, 64, 62, 60],
      drums: drumNotes,
    };
    let bar = 0;
    for (const scene of project.arrangement)
      for (let rep = 0; rep < scene.repeats; rep++, bar++) {
        const bank = project.patterns.banks[scene.bank];
        for (const name of Object.keys(notes))
          bank[name].forEach((row, r) => {
            for (let s = 0; s < 16; s++)
              if (row[s] === "1") {
                const at = bar * 384 + s * 24 + (s % 2 ? Math.round((12 * project.swing) / 100) : 0);
                events.push(
                  { at, bytes: [144 + channels[name], notes[name][r], 100] },
                  { at: at + 18, bytes: [128 + channels[name], notes[name][r], 0] },
                );
              }
          });
      }
    events.push({ at: bar * 384, bytes: [255, 47, 0] });
    events.sort((a, b) => a.at - b.at);
    const tr = [];
    let prev = 0;
    for (const e of events) {
      tr.push(...variable(e.at - prev), ...e.bytes);
      prev = e.at;
    }
    const len = tr.length;
    const out = [
      77,
      84,
      104,
      100,
      0,
      0,
      0,
      6,
      0,
      0,
      0,
      1,
      0,
      ppq,
      77,
      84,
      114,
      107,
      len >>> 24,
      (len >>> 16) & 255,
      (len >>> 8) & 255,
      len & 255,
    ];
    ctx.download(
      new Blob([new Uint8Array(out), new Uint8Array(tr)], { type: "audio/midi" }),
      project.name + ".mid",
    );
  }
  function u24(n) {
    return [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  function readMidi(buffer) {
    const bytes = new Uint8Array(buffer),
      v = new DataView(buffer);
    let p = 0;
    const invalid = () => {
      throw Error("Neplatný nebo nepodporovaný soubor MIDI.");
    };
    const tag = () => {
      if (p + 4 > bytes.length) invalid();
      const s = String.fromCharCode(...bytes.subarray(p, p + 4));
      p += 4;
      return s;
    };
    const word = () => {
      if (p + 2 > bytes.length) invalid();
      const n = v.getUint16(p);
      p += 2;
      return n;
    };
    const dword = () => {
      if (p + 4 > bytes.length) invalid();
      const n = v.getUint32(p);
      p += 4;
      return n;
    };
    const vlq = (end) => {
      let n = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const b = bytes[p++];
        n = n * 128 + (b & 127);
        if (!(b & 128)) return n;
      }
      invalid();
    };
    if (tag() !== "MThd") invalid();
    const h = dword();
    if (h < 6 || 8 + h > bytes.length) invalid();
    const format = word(),
      tracks = word(),
      ppq = word();
    if (format > 1 || !ppq || ppq & 32768) invalid();
    p = 8 + h;
    const data = Patterns.defaults();
    for (const bank of data.banks)
      for (const name of ["drums", "bass", "lead"]) bank[name] = bank[name].map(() => "0".repeat(16));
    const pitches = { bass: [48, 47, 45, 43, 41, 40, 38, 36], lead: [72, 71, 69, 67, 65, 64, 62, 60] };
    let firstTempo = Infinity,
      tempo = null,
      hits = 0;
    for (let t = 0; t < tracks; t++) {
      if (tag() !== "MTrk") invalid();
      const len = dword(),
        end = p + len;
      if (end > bytes.length) invalid();
      let tick = 0,
        running = 0;
      while (p < end) {
        tick += vlq(end);
        if (p >= end) invalid();
        let status = bytes[p];
        if (status >= 128) {
          p++;
          if (status < 240) running = status;
          else running = 0;
        } else {
          if (!running) invalid();
          status = running;
        }
        if (status === 255) {
          const type = bytes[p++],
            size = vlq(end);
          if (p + size > end) invalid();
          if (type === 81 && size === 3 && tick < firstTempo) {
            const us = (bytes[p] << 16) + (bytes[p + 1] << 8) + bytes[p + 2];
            if (us) {
              tempo = Math.round(60000000 / us);
              firstTempo = tick;
            }
          }
          p += size;
          continue;
        }
        if (status === 240 || status === 247) {
          const size = vlq(end);
          p += size;
          if (p > end) invalid();
          continue;
        }
        const op = status >> 4;
        if (op < 8 || op > 14) invalid();
        const count = op === 12 || op === 13 ? 1 : 2;
        if (p + count > end) invalid();
        const note = bytes[p++],
          vel = count === 2 ? bytes[p++] : 0;
        if (note > 127 || vel > 127) invalid();
        if (op !== 9 || !vel) continue;
        const pos = Math.round((tick * 4) / ppq);
        if (pos >= 64) continue;
        const ch = status & 15;
        const name = ch === 9 ? "drums" : note < 52 ? "bass" : "lead";
        const bank = data.banks[Math.floor(pos / 16)],
          s = pos % 16;
        let row;
        if (name === "drums") {
          row = [35, 36].includes(note) ? 0 : [38, 40].includes(note) ? 1 : note === 39 ? 3 : 2;
        } else {
          let snapped = note;
          const [hi, lo] = [pitches[name][0], pitches[name][7]];
          while (snapped > hi) snapped -= 12;
          while (snapped < lo) snapped += 12;
          row = pitches[name].reduce(
            (a, x, i) => (Math.abs(x - snapped) < Math.abs(pitches[name][a] - snapped) ? i : a),
            0,
          );
          if (name === "bass") bank[name] = bank[name].map((r) => r.slice(0, s) + "0" + r.slice(s + 1));
        }
        const r = bank[name][row];
        bank[name][row] = r.slice(0, s) + "1" + r.slice(s + 1);
        hits++;
      }
    }
    if (!hits) throw Error("V prvních čtyřech taktech nejsou žádné noty.");
    return { data, tempo };
  }
  window.Devices = { mount, send, liveKey, panic, stopMic, exportMidi, readMidi };
})();
