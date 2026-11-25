/* MUSICLAB · Standard MIDI File import */
(() => {
  "use strict";

  const fail = (message) => { throw new Error(message); };
  const exactDrums = [36, 38, 39, 42, 46, 45, 37, 56];
  const programFamily = ["Piano", "Mallets", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass",
    "Reed", "Pipe", "Synth lead", "Synth pad", "Synth FX", "Ethnic", "Percussion", "Sound FX"];
  const drumPad = (n) => {
    const exact = exactDrums.indexOf(n);
    if (exact >= 0) return 36 + exact;
    if (n === 35) return 36;
    if (n === 40) return 37;
    if (n === 44 || n === 69 || n === 70 || n === 82) return 39;
    if ([49, 51, 52, 53, 55, 57, 59].includes(n)) return 40;
    if ([41, 43, 47, 48, 50, 60, 61, 62, 63, 64, 65, 66].includes(n)) return 41;
    if ([54, 58, 75, 76, 77].includes(n)) return 42;
    return 43;
  };

  // Retain track identity in format 1 and separate the channels of a single format 0 track.
  function parse(buffer) {
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let pos = 0, limit = data.length;
    const need = (n) => { if (n < 0 || pos + n > limit) fail("Incomplete MIDI file or invalid event length."); };
    const byte = () => { need(1); return data[pos++]; };
    const word = () => (byte() * 256 + byte());
    const long = () => (word() * 65536 + word());
    const tag = () => String.fromCharCode(byte(), byte(), byte(), byte());
    const vlq = () => {
      let value = 0;
      for (let j = 0; j < 4; j++) {
        const b = byte();
        value = value * 128 + (b & 127);
        if (b < 128) return value;
      }
      fail("Invalid MIDI variable-length value.");
    };
    const datum = () => { const b = byte(); if (b >= 128) fail("Invalid MIDI event data."); return b; };
    if (data.length < 14 || tag() !== "MThd") fail("Choose a Standard MIDI File (.mid or .midi).");
    const header = long();
    if (header < 6) fail("Invalid MIDI header.");
    need(header);
    const format = word(), count = word(), division = word();
    if (format !== 0 && format !== 1) fail("Only simultaneous SMF formats 0 and 1 can be imported.");
    if (!count || (format === 0 && count !== 1)) fail("Invalid number of MIDI tracks.");
    const frames = 256 - (division >> 8);
    if (!division || ((division & 0x8000) && (!(division & 255) || ![24, 25, 29, 30].includes(frames)))) fail("Invalid MIDI time division.");
    pos = 8 + header;
    const parts = [], tempos = [], signatures = [], keys = [], names = [], markers = [];
    let duration = 0, noteCount = 0, usedPrograms = false, expression = false;
    const textDecoder = new TextDecoder();
    for (let ti = 0; ti < count;) {
      limit = data.length;
      const id = tag(), size = long();
      need(size);
      const end = pos + size;
      if (id !== "MTrk") { pos = end; continue; }
      limit = end;
      const channels = new Map();
      let tick = 0, running = 0, name = "";
      const channel = (ch) => {
        if (!channels.has(ch)) channels.set(ch, { ti, ch, notes: [], pressed: new Map(), sustained: [], pedal: false, program: null });
        return channels.get(ch);
      };
      const releasePedal = (part) => { for (const nt of part.sustained) nt.end = tick; part.sustained.length = 0; };
      const finishNotes = (part) => {
        releasePedal(part);
        for (const queue of part.pressed.values()) for (let i = queue.next; i < queue.notes.length; i++) queue.notes[i].end = tick;
        part.pressed.clear();
      };
      while (pos < end) {
        tick += vlq();
        need(1);
        let status = data[pos];
        if (status >= 128) { pos++; running = status < 240 ? status : 0; }
        else { if (!running) fail("Invalid MIDI running status."); status = running; }
        if (status === 255) {
          const type = byte(), len = vlq();
          need(len);
          if (type === 3 && !name) name = textDecoder.decode(data.subarray(pos, pos + Math.min(len, 256))).replace(/[\u0000-\u001f\u007f]/g, "").trim();
          if (type === 6 && len === 18 && ti === 0) {
            const marker = /^MusicLab Pattern ([A-H])$/.exec(textDecoder.decode(data.subarray(pos, pos + len)));
            if (marker) markers.push({ tick, pattern: marker[1].charCodeAt(0) - 65 });
          }
          if (type === 81 && len === 3) {
            const us = data[pos] * 65536 + data[pos + 1] * 256 + data[pos + 2];
            if (us) tempos.push({ tick, value: us });
          }
          if (type === 88 && len >= 2 && data[pos] > 0 && data[pos + 1] <= 7) signatures.push({ tick, value: [data[pos], 2 ** data[pos + 1]] });
          if (type === 89 && len === 2) {
            const sf = (data[pos] << 24) >> 24, minor = data[pos + 1];
            if (Math.abs(sf) <= 7 && minor <= 1) keys.push({ tick, value: [(sf * 7 + (minor ? 9 : 0) + 60) % 12, minor ? 2 : 1] });
          }
          pos += len;
          if (type === 47) { pos = end; break; }
          continue;
        }
        if (status === 240 || status === 247) { const len = vlq(); need(len); pos += len; continue; }
        if (status < 128 || status >= 240) fail("Unsupported MIDI stream event.");
        const op = status >> 4, ch = status & 15, a = datum(), b = op === 12 || op === 13 ? 0 : datum();
        const part = channel(ch);
        if (op === 9 && b > 0) {
          const nt = { tick, end: null, n: a, v: b };
          if (!part.pressed.has(a)) part.pressed.set(a, { notes: [], next: 0 });
          part.pressed.get(a).notes.push(nt); part.notes.push(nt); noteCount++;
          if (noteCount > 1100000) fail("This MIDI file is too dense to import in the browser.");
        } else if (op === 8 || op === 9) {
          const queue = part.pressed.get(a);
          if (queue) {
            const nt = queue.notes[queue.next++];
            if (queue.next === queue.notes.length) part.pressed.delete(a);
            if (part.pedal && ch !== 9) part.sustained.push(nt); else nt.end = tick;
          }
        } else if (op === 11 && a === 64) {
          part.pedal = b >= 64;
          if (!part.pedal) releasePedal(part);
        } else if (op === 11 && (a === 120 || a === 123)) finishNotes(part);
        else if (op === 11 && a === 121) { part.pedal = false; releasePedal(part); }
        else if (op === 12) { if (!part.notes.length) part.program = a; usedPrograms = true; }
        else if (op === 14 || op === 10 || op === 13 || op === 11) expression = true;
      }
      duration = Math.max(duration, tick);
      names.push(name);
      for (const part of channels.values()) {
        finishNotes(part);
        if (part.notes.length) parts.push({ name, ti, ch: part.ch, program: part.program, notes: part.notes });
      }
      ti++;
    }
    if (!noteCount && !duration) fail("This MIDI file contains no notes or timed bars.");
    return { format, division, duration, tempos, signatures, keys, names, markers, parts, usedPrograms, expression };
  }

  function initial(events, fallback) {
    let value = fallback;
    for (const event of events) if (event.tick === 0) value = event.value;
    return value;
  }
  const differentLater = (events, value) => events.some(e => e.tick > 0 && String(e.value) !== String(value));
  const noteSort = (a, b) => a.t - b.t || a.s - b.s || a.n - b.n || a.end - b.end || a.v - b.v || a.r - b.r;

  function configure(file, filename, warnings) {
    const P = App.newProject();
    const conductor = file.parts.every(part => part.ti !== 0);
    P.name = (conductor ? file.names[0] : "") || String(filename || "MIDI import").split(/[\\/]/).pop().replace(/\.(?:mid|midi)$/i, "") || "MIDI import";
    const micros = initial(file.tempos, 500000), bpm = 6e7 / micros;
    P.bpm = App.clamp(Math.round(bpm * 1000) / 1000, 40, 300);
    if (bpm < 39.999 || bpm > 300.001) warnings.push("Tempo adjusted to " + P.bpm + " BPM (console range 40–300).");
    if (differentLater(file.tempos, micros)) warnings.push("Tempo changes use the opening tempo throughout.");
    const signature = initial(file.signatures, [4, 4]);
    let sig = App.SIGS.findIndex(s => String(s) === String(signature));
    if (sig === -1) {
      sig = App.SIGS.findIndex(s => s[0] * signature[1] === signature[0] * s[1]);
      if (sig < 0) sig = 2;
      warnings.push(signature.join("/") + " meter mapped to " + App.SIGS[sig].join("/") + ".");
    }
    if (differentLater(file.signatures, signature)) warnings.push("Meter changes use the opening meter throughout.");
    P.sig = sig;
    [P.key, P.scale] = initial(file.keys, [0, 0]);
    const frameCode = 256 - (file.division >> 8);
    const fps = frameCode === 29 ? 30000 / 1001 : frameCode;
    const stepPerTick = file.division & 0x8000 ? bpm / (15 * fps * (file.division & 255)) : 4 / file.division;
    return { P, stepPerTick };
  }

  function assign(parts) {
    const tracks = [], last = new Map();
    parts.forEach((part, i) => last.set(part.ch === 9, i));
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], kit = part.ch === 9;
      const same = tracks.filter(t => t.kit === kit);
      // Reserve a voice for the other instrument class if that class has not appeared yet.
      const reserve = tracks.length === 7 && tracks.every(t => t.kit === kit) && last.get(!kit) > i;
      let track;
      if (tracks.length < 8 && !reserve) {
        track = { kit, parts: [], count: 0, index: tracks.length };
        tracks.push(track);
      } else {
        const matching = same.filter(t => t.parts.some(p => p.ch === part.ch));
        track = (matching.length ? matching : same).reduce((best, t) => t.count < best.count ? t : best);
      }
      track.parts.push(part); track.count += part.notes.length;
    }
    return tracks;
  }

  // Each bar's signature includes ties across its edges. Identical bar runs can share a pattern,
  // while a held note and separate attacks on adjacent bars remain distinguishable.
  function arrangement(onsets, carries, bars, spb, maxBars, markers, stepPerTick) {
    const dictionary = new Map();
    const barIds = onsets.map((list, bar) => {
      const offset = bar * spb;
      const fragments = list.concat(carries[bar]).map(nt => [
        nt.t, nt.n, nt.v, nt.r, Math.max(-1, nt.s - offset), Math.min(spb + 1, nt.end - offset)
      ].join(",")).sort();
      const key = fragments.join(";");
      if (!dictionary.has(key)) dictionary.set(key, dictionary.size);
      return dictionary.get(key);
    });
    const lengths = new Map();
    const words = Array.from({ length: bars }, (_, start) => {
      const options = [];
      for (let len = Math.min(maxBars, bars - start); len >= 1; len--) {
        const key = barIds.slice(start, start + len).join(".");
        if (!lengths.has(key)) lengths.set(key, lengths.size);
        options.push({ id: lengths.get(key), len });
      }
      return options;
    });
    // Native markers are ordinary SMF markers. If rendered probability or a random arp
    // changed a repeat, it needs its own pattern slot rather than overwriting the first take.
    if (markers.length && markers.length <= 32 && markers[0].tick === 0) {
      const starts = markers.map(m => m.tick * stepPerTick / spb);
      const chain = [], unique = new Set();
      let cuts = 0;
      for (let i = 0; i < starts.length; i++) {
        const start = Math.round(starts[i]), end = Math.round(starts[i + 1] ?? bars);
        const word = words[start]?.find(w => w.len === end - start);
        if (!word || Math.abs(starts[i] - start) > .0001) break;
        const preferred = markers[i].pattern, id = preferred + "/" + word.id;
        unique.add(id); cuts += carries[end]?.length || 0;
        chain.push({ start, len: word.len, id, preferred });
      }
      if (chain.length === markers.length && unique.size <= 8) return { chain, covered: bars, cuts };
    }
    const schedule = Array.from({ length: bars + 1 }, () => new Map());
    const seed = { ids: [], chain: [], cuts: 0 };
    schedule[0].set("", seed);
    let best = seed, covered = 0;
    const cost = plan => plan.ids.length * 2 + plan.chain.length + plan.cuts * 2;
    const rank = (plan, start) => {
      // Reward dictionaries which will also explain upcoming bars. Without look-ahead the
      // first verse might consume all eight slots before its chorus repeats are discovered.
      const future = new Uint16Array(bars + 1);
      for (let at = bars - 1; at >= start; at--) {
        let best = 4 + future[at + 1];
        for (const w of words[at]) if (plan.ids.includes(w.id)) best = Math.min(best, 1 + future[at + w.len]);
        future[at] = best;
      }
      return plan.ids.length * 6 + plan.chain.length + plan.cuts * .5 + future[start];
    };
    // Search alternative phrase lengths so pickups, repeats and odd endings need not align
    // to four-bar boundaries. Bound the search by the fixed eight-pattern/32-entry console.
    for (let start = 0; start < bars; start++) {
      const candidates = [...schedule[start].values()];
      if (candidates.length > 96) {
        for (const plan of candidates) plan.rank = rank(plan, start);
        candidates.sort((a, b) => a.rank - b.rank);
        candidates.length = 96;
      }
      const plans = candidates;
      schedule[start].clear();
      for (const prev of plans) {
        if (prev.chain.length >= 32) continue;
        for (const word of words[start]) {
          const known = prev.ids.includes(word.id);
          if (!known && prev.ids.length === 8) continue;
          const end = start + word.len;
          const ids = known ? prev.ids : prev.ids.concat(word.id).sort((a, b) => a - b);
          const key = ids.join();
          const plan = { ids, chain: prev.chain.concat({ start, ...word }), cuts: prev.cuts + (carries[end]?.length || 0) };
          const old = schedule[end].get(key);
          if (old && (old.chain.length < plan.chain.length || (old.chain.length === plan.chain.length && old.cuts <= plan.cuts))) continue;
          schedule[end].set(key, plan);
          if (end > covered || (end === covered && cost(plan) < cost(best))) { covered = end; best = plan; }
        }
      }
    }
    return { chain: best.chain, covered, cuts: best.cuts };
  }

  function read(arrayBuffer, filename) {
    const file = parse(arrayBuffer), warnings = [];
    const { P, stepPerTick } = configure(file, filename, warnings);
    const spb = App.spb(P), maxBars = App.maxBars(P), maxTimeline = 32 * maxBars * spb;
    const parts = assign(file.parts);
    let maxEnd = Math.max(1, Math.round(file.duration * stepPerTick));
    const notes = [], pitched = new Set();
    // Detect a consistent swing grid by onset position, counting a chord as one onset.
    const positions = new Set();
    for (const part of file.parts) for (const nt of part.notes) {
      if (nt.tick * stepPerTick < maxTimeline) positions.add(nt.tick);
    }
    const candidates = [];
    let straightEven = false, atypical = 0;
    for (const tick of positions) {
      const pos = tick * stepPerTick, floor = Math.floor(pos + .015), off = pos - floor;
      if (floor % 2 === 0) { if (Math.abs(off) <= .04) straightEven = true; else atypical++; }
      else candidates.push(off);
    }
    if (straightEven && candidates.length >= 2) {
      candidates.sort((a, b) => a - b);
      const center = candidates[Math.floor(candidates.length / 2)];
      const matches = candidates.filter(v => Math.abs(v - center) <= .025).length;
      if (center >= .06 && center <= .52 && matches / (candidates.length + atypical) >= .95) P.swing = App.clamp(Math.round(center * 200), 0, 100);
    }
    const swing = P.swing / 200;
    const gridTime = s => s + (s % 2 ? swing : 0);
    function nearestStep(raw) {
      const floor = Math.floor(raw);
      return Math.abs(raw - gridTime(floor)) <= Math.abs(raw - gridTime(floor + 1)) ? floor : floor + 1;
    }
    const tolerance = Math.max(.05, .004 * P.bpm / 15 + .003);
    const unSwing = raw => {
      let i = Math.floor(raw);
      if (gridTime(i) > raw) i--;
      return i + (raw - gridTime(i)) / (gridTime(i + 1) - gridTime(i));
    };
    // Regular sub-step rolls fit a single native note with 2–8 repeats. Group only
    // equal-velocity attacks with gates that fill their subdivision, within one bar.
    function* performances(source) {
      const byPitch = new Map();
      for (const nt of source.notes) {
        if (!byPitch.has(nt.n)) byPitch.set(nt.n, []);
        byPitch.get(nt.n).push(nt);
      }
      for (const hits of byPitch.values()) for (let i = 0; i < hits.length; i++) {
        const first = hits[i], pos = unSwing(first.tick * stepPerTick), start = Math.round(pos);
        let count = 1, length = 0;
        if (i + 1 < hits.length && Math.abs(pos - start) < .025) {
          const width = unSwing(hits[i + 1].tick * stepPerTick) - pos;
          if (width > .105 && Math.abs(width - Math.round(width)) > .035) {
            for (let j = 0; j < 8 && i + j < hits.length; j++) {
              const hit = hits[i + j], expected = pos + (j + 1) * width;
              if (hit.v !== first.v || Math.abs(unSwing(hit.tick * stepPerTick) - (expected - width)) > .028 ||
                  Math.abs(unSwing(hit.end * stepPerTick) - expected) > Math.min(width * .25, tolerance / (1 - swing) + .02)) break;
              const len = Math.round(expected - start);
              if (j && len > 0 && Math.abs(expected - start - len) < .028 && Math.floor(start / spb) === Math.floor((start + len - 1) / spb)) {
                count = j + 1; length = len;
              }
            }
          }
        }
        if (count === 1) yield first;
        else { yield { ...first, end: gridTime(start + length) / stepPerTick, r: count }; i += count - 1; }
      }
    }
    let quantized = 0, soft = 0, truncatedClips = 0;
    for (const track of parts) {
      const T = P.tracks[track.index], part = track.parts[0];
      const inTrack = file.parts.filter(p => p.ti === part.ti);
      const fallback = track.kit ? "Drums" : part.program != null ? programFamily[Math.floor(part.program / 8)] : "Channel " + (part.ch + 1);
      T.name = part.name && inTrack.length === 1 ? part.name : fallback;
      T.kind = track.kit ? "kit" : "syn";
      // MIDI describes instruments abstractly. Use an audible polyphonic patch on every melodic console lane.
      T.syn = { ...App.defs(App.DEF.syn), w1: 1, cut: 6000, mode: 0, aa: .004, ar: .14 };
      T.mute = T.solo = T.dly = T.rev = 0;
      const histogram = Array(128).fill(0);
      for (const source of track.parts) for (const nt of performances(source)) {
        const rawStart = nt.tick * stepPerTick, rawEnd = nt.end * stepPerTick;
        const s = nearestStep(rawStart), end = Math.max(s + 1, nearestStep(rawEnd));
        if (Math.abs(rawStart - gridTime(s)) > tolerance || Math.abs(rawEnd - gridTime(end)) > tolerance) quantized++;
        if (nt.v < 3) soft++;
        maxEnd = Math.max(maxEnd, end);
        if (s >= maxTimeline) continue;
        const n = track.kit ? drumPad(nt.n) : nt.n;
        if (track.kit && !exactDrums.includes(nt.n)) pitched.add(nt.n);
        histogram[n]++;
        notes.push({ t: track.index, s, end, n, v: nt.v, r: nt.r || 1 });
      }
      if (!track.kit) {
        let best = -1;
        for (let lo = 0; lo <= 104; lo++) {
          const count = histogram.slice(lo, lo + 24).reduce((sum, n) => sum + n, 0);
          if (count > best || (count === best && lo % 12 === 0)) { best = count; T.lo = lo; }
        }
      }
    }
    const originalBars = Math.ceil(maxEnd / spb), bars = Math.min(originalBars, maxBars * 32);
    const onsets = Array.from({ length: bars }, () => []), carries = Array.from({ length: bars }, () => []);
    let fragments = 0;
    for (const note of notes) {
      const start = Math.floor(note.s / spb);
      onsets[start].push(note);
      const end = Math.min(bars, Math.ceil(note.end / spb));
      fragments += end - start;
      if (fragments > 4100000) fail("Overlapping held notes exceed the console’s import capacity.");
      for (let b = start + 1; b < end; b++) carries[b].push(note);
    }
    const plan = arrangement(onsets, carries, bars, spb, maxBars, file.markers, stepPerTick);
    const seen = new Map(), reserved = new Set(plan.chain.map(item => item.preferred)), used = new Set();
    for (const item of plan.chain) {
      if (!seen.has(item.id)) {
        let index = item.preferred;
        if (index === undefined || used.has(index)) {
          index = Array.from({ length: 8 }, (_, i) => i).find(i => !used.has(i) && !reserved.has(i));
        }
        used.add(index);
        const from = item.start * spb, to = from + item.len * spb;
        seen.set(item.id, index);
        P.pats[index].bars = item.len;
        const segment = carries[item.start].concat(...onsets.slice(item.start, item.start + item.len)).sort(noteSort);
        for (const note of segment) {
          const clip = P.tracks[note.t].clips[index];
          if (clip.length === 4000) { truncatedClips++; continue; }
          const s = Math.max(from, note.s);
          clip.push({ s: s - from, n: note.n, l: Math.min(note.end, to) - s, v: note.v / 127, p: 1, ...(note.r > 1 ? { r: note.r } : {}) });
        }
      }
      P.chain.push(seen.get(item.id));
    }
    P.song = P.chain.length > 1 ? 1 : 0;
    P.sel.p = P.chain[0];
    if (file.parts.length > parts.length) warnings.push(file.parts.length + " MIDI parts share " + parts.length + " console tracks.");
    if (pitched.size) warnings.push(pitched.size + " non-kit drum pitch" + (pitched.size === 1 ? "" : "es") + " mapped to the closest pads.");
    if (quantized) warnings.push(quantized + " note" + (quantized === 1 ? "" : "s") + " quantized to sixteenth notes.");
    if (soft) warnings.push("Very soft velocities raised to the minimum playable level.");
    if (file.usedPrograms) warnings.push("MIDI instrument programs use MusicLab synth and kit sounds.");
    if (file.expression) warnings.push("Continuous controllers, pitch bend and aftertouch are not represented.");
    if (plan.cuts) warnings.push("Held notes crossing pattern boundaries retrigger at the boundary.");
    if (plan.covered < originalBars) warnings.push("Imported the first " + plan.covered + " of " + originalBars + " bars (8 unique patterns, 32 chain entries maximum).");
    if (truncatedClips) warnings.push("Dense clips exceed the 4,000-note limit. " + truncatedClips + " note events omitted from unique patterns.");
    const count = (n, singular) => n + " " + singular + (n === 1 ? "" : "s");
    const mapping = [false, true].flatMap(kit => {
      const ch = [...new Set(file.parts.filter(p => (p.ch === 9) === kit).map(p => p.ch + 1))].sort((a, b) => a - b);
      return ch.length ? ["Ch " + ch.join(", ") + " → " + (kit ? "kit" : "synth")] : [];
    });
    const summary = [count(parts.length, "track") + " · " + count(plan.covered, "bar") + " · " + count(seen.size, "pattern"),
      ...(mapping.length ? [mapping.join(" · ")] : []), ...warnings].join("\n");
    return { project: App.sanitize(P), summary };
  }

  App.MidiImport = { read };
})();
