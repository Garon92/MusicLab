/* MUSICLAB · Standard MIDI File import */
(() => {
  "use strict";

  const fail = (message) => { throw new Error(message); };
  const controllers = new Map([[7,"vol"],[10,"pan"],[74,"filter"],[91,"rev"],[94,"dly"]]);
  const ccValue = (key,v) => key !== "pan" ? v / 127 : v <= 64 ? v / 128 : .5 + (v - 64) / 126;
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
    const messages = new Map();
    let controlCount = 0, nativeSwing = null;
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
      let tick = 0, running = 0, port = 0, name = "";
      const channel = (ch) => {
        const address = port * 16 + ch;
        if (!channels.has(address)) channels.set(address, { ti, ch, address, notes: [], pressed: new Map(), sustained: [], pedal: false, program: null });
        return channels.get(address);
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
          if (type === 33 && len === 1) port = data[pos];
          if (type === 1 && ti === 0 && tick === 0 && len <= 18) {
            const match = /^MusicLab Swing (\d{1,3})$/.exec(textDecoder.decode(data.subarray(pos,pos+len)));
            if (match && Number(match[1]) <= 100) nativeSwing = Number(match[1]);
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
        } else if (op === 11 && controllers.has(a)) {
          if (++controlCount > 1500000) fail("Too many MIDI controller events to import.");
          if (!messages.has(part.address)) messages.set(part.address, []);
          messages.get(part.address).push({tick, key:controllers.get(a), v:b});
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
        parts.push({ name, ti, ch:part.ch, address:part.address, program:part.program, notes:part.notes });
      }
      ti++;
    }
    if (!noteCount && !duration && !controlCount) fail("This MIDI file contains no notes or timed bars.");
    const active = parts.filter(part => part.notes.length);
    for (const [address,events] of messages) {
      let matching = active.filter(p => p.address === address);
      if (!matching.length) { matching = [parts.find(p => p.address === address)]; active.push(matching[0]); }
      events.sort((a,b) => a.tick-b.tick);
      for (const part of matching) part.controllers = events;
    }
    active.sort((a,b) => a.ti-b.ti || a.ch-b.ch);
    return { format, division, duration, tempos, signatures, keys, names, markers, parts:active, usedPrograms, expression, nativeSwing };
  }

  function initial(events, fallback) {
    let value = fallback;
    for (const event of events) if (event.tick === 0) value = event.value;
    return value;
  }
  const noteSort = (a, b) => a.t - b.t || a.s - b.s || a.n - b.n || a.end - b.end || a.v - b.v || a.r - b.r;

  function configure(file, filename, warnings) {
    const P = App.newProject();
    const conductor = file.parts.every(part => part.ti !== 0);
    P.name = (conductor ? file.names[0] : "") || String(filename || "MIDI import").split(/[\\/]/).pop().replace(/\.(?:mid|midi)$/i, "") || "MIDI import";
    const micros = initial(file.tempos, 500000), bpm = 6e7 / micros;
    P.bpm = App.clamp(Math.round(bpm * 1000) / 1000, 40, 300);
    if (bpm < 39.999 || bpm > 300.001) warnings.push("Tempo adjusted to " + P.bpm + " BPM (console range 40–300).");

    const signature = initial(file.signatures, [4, 4]);
    let sig = App.SIGS.findIndex(s => String(s) === String(signature));
    if (sig === -1) {
      sig = App.SIGS.findIndex(s => s[0] * signature[1] === signature[0] * s[1]);
      if (sig < 0) sig = 2;
      warnings.push(signature.join("/") + " meter mapped to " + App.SIGS[sig].join("/") + ".");
    }

    P.sig = sig;
    [P.key, P.scale] = initial(file.keys, [0, 0]);
    const frameCode = 256 - (file.division >> 8);
    const fps = frameCode === 29 ? 30000 / 1001 : frameCode;
    const stepPerTick = file.division & 0x8000 ? bpm / (15 * fps * (file.division & 255)) : 4 / file.division;
    function markers(events,read) {
      const byStep=new Map();
      for(const event of events){const at=Math.round(event.tick*stepPerTick), cue=read(event.value);
        if(at>0 && at<=65536 && cue)byStep.set(at,{at,...cue});}
      return [...byStep.values()].sort((a,b)=>a.at-b.at);
    }
    P.arrangement.tempo=markers(file.tempos,x=>({bpm:App.clamp(6e7/x,40,300),ramp:false}));
    P.arrangement.meters=markers(file.signatures,x=>{const sig=App.SIGS.findIndex(v=>v[0]===x[0] && v[1]===x[1]);return sig>=0?{sig}:null;});
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
  function arrangement(onsets, carries, bars, spb, maxBars, markers, stepPerTick, controllerBars) {
    const dictionary = new Map();
    const barIds = onsets.map((list, bar) => {
      const offset = bar * spb;
      const fragments = list.concat(carries[bar]).map(nt => [
        nt.t, nt.n, nt.v, nt.r, nt.off, Math.max(-1, nt.s - offset), Math.min(spb + 1, nt.end - offset)
      ].join(",")).sort();
      const key = fragments.join(";") + "|" + controllerBars[bar];
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
    // Try regular phrase lengths first. Long arrangements with an obvious
    // repeating structure then cost only O(bars × maximum phrase length).
    let regular = null;
    for (let len = maxBars; len >= 1; len--) {
      const chain = [], ids = new Set();
      let cuts = 0;
      for (let start = 0; start < bars; start += len) {
        const word = words[start].find(w => w.len === Math.min(len, bars-start));
        ids.add(word.id);
        if (ids.size > 8 || chain.length >= 32) break;
        chain.push({start,...word}); cuts += carries[start + word.len]?.length || 0;
        if (start+word.len === bars) {
          const score = ids.size*2 + chain.length + cuts*2;
          if (!regular || score < regular.score) regular = {chain,covered:bars,cuts,score};
        }
      }
    }
    if (regular && !regular.cuts) return regular;
    const schedule = Array.from({ length: bars + 1 }, () => new Map());
    const seed = { ids: [], chain: [], cuts: 0 };
    schedule[0].set("", seed);
    let best = seed, covered = 0;
    const cost = plan => plan.ids.length * 2 + plan.chain.length + plan.cuts * 2;
    const rank = (plan, start) => {
      // Reward dictionaries which will also explain upcoming bars. Without look-ahead the
      // first verse might consume all eight slots before its chorus repeats are discovered.
      const horizon = Math.min(16, bars - start), future = new Uint16Array(horizon + 1);
      for (let offset = horizon - 1; offset >= 0; offset--) {
        let best = 4 + future[offset + 1];
        for (const w of words[start + offset]) if (plan.ids.includes(w.id)) {
          best = Math.min(best, 1 + future[Math.min(horizon, offset + w.len)]);
        }
        future[offset] = best;
      }
      return plan.ids.length * 6 + plan.chain.length + plan.cuts * .5 + future[0];
    };
    // Search alternative phrase lengths so pickups, repeats and odd endings need not align
    // to a fixed number of bars. Bound the search by the fixed eight-pattern/32-entry console.
    for (let start = 0; start < bars; start++) {
      const candidates = [...schedule[start].values()];
      const beam = bars > 64 ? 16 : 48;
      if (candidates.length > beam) {
        for (const plan of candidates) plan.rank = rank(plan, start);
        candidates.sort((a, b) => a.rank - b.rank);
        candidates.length = beam;
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
    if (regular && (covered < bars || regular.score < cost(best))) return regular;
    return { chain: best.chain, covered, cuts: best.cuts };
  }

  // MIDI controllers are channel state, including across clip boundaries.
  // Sample the state at grid boundaries. Dense moves get interpolated segments,
  // while switches and isolated controller messages keep their stepped shape.
  function controlLanes(parts, P, steps, stepPerTick, unSwing) {
    const lanes = [];
    for (const track of parts) {
      const groups = new Map();
      const streams = new Set(track.parts.map(p => p.controllers).filter(Boolean));
      for (const messages of streams) for (const event of messages) {
        if (!groups.has(event.key)) groups.set(event.key,[]);
        groups.get(event.key).push(event);
      }
      for (const [key, events] of groups) {
        const values = new Float64Array(steps+1), smooth = new Uint8Array(steps);
        const changes = new Map(), arrivals = new Map();
        const epsilon = Math.min(.06,stepPerTick / (2 - P.swing / 100)) + .00001;
        let boundary = -1, firstValue = 0;
        if (streams.size > 1) events.sort((a,b) => a.tick-b.tick);
        for (const e of events) {
          const at = unSwing(e.tick*stepPerTick);
          if (at > steps+epsilon) break;
          const index = Math.max(0,Math.ceil(at-epsilon)), v = ccValue(key,e.v);
          changes.set(index,v);
          if (Math.abs(index-at) <= epsilon) {
            // The last point of one pattern and first of the next may share a
            // MIDI tick. Keep the arriving level as well as the outgoing one.
            if (boundary === index) arrivals.set(index,firstValue);
            else { boundary = index; firstValue = v; }
          } else if (index > 0) smooth[index-1] = Math.min(2, smooth[index-1] + 1);
        }
        if (!changes.size) continue;
        let value = App.curveBase(P.tracks[track.index],key);
        for (let i=0; i<=steps; i++) {
          if (changes.has(i)) value = changes.get(i);
          values[i] = value;
        }
        lanes.push({t:track.index,key,values,smooth,arrivals});
      }
    }
    return lanes;
  }
  function cutLane(lane, from, to) {
    const points = [];
    for (let i=from; i<to; i++) {
      const next = lane.arrivals.get(i+1) ?? lane.values[i+1];
      const v = lane.values[i], linear = lane.smooth[i] >= 2 && next !== v;
      if (i === from || v !== lane.values[i-1] || linear || lane.smooth[i-1] >= 2) {
        const point = {s:i-from,v};
        if (i > from && lane.arrivals.has(i) && lane.smooth[i-1] >= 2) point.in = lane.arrivals.get(i);
        if (linear) point.shape = "linear";
        points.push(point);
      }
    }
    if (lane.smooth[to-1] >= 2) points.push({s:to-from,v:lane.arrivals.get(to) ?? lane.values[to]});
    return {mode:"step",points};
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
    if (file.nativeSwing !== null) P.swing = file.nativeSwing;
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
        const first=hits[i], raw=first.tick*stepPerTick, start=nearestStep(raw), shift=raw-gridTime(start);
        const pos=start, shifted=tick=>unSwing(tick*stepPerTick-shift);
        let count = 1, length = 0;
        if (i + 1 < hits.length && Math.abs(shift)<=.491) {
          const width = shifted(hits[i + 1].tick) - pos;
          if (width > .105 && Math.abs(width - Math.round(width)) > .035) {
            for (let j = 0; j < 8 && i + j < hits.length; j++) {
              const hit = hits[i + j], expected = pos + (j + 1) * width;
              if (hit.v !== first.v || Math.abs(shifted(hit.tick) - (expected - width)) > .028 ||
                  Math.abs(shifted(hit.end) - expected) > Math.min(width * .25, tolerance / (1 - swing) + .02)) break;
              const len = Math.round(expected - start);
              if (j && len > 0 && Math.abs(expected - start - len) < .028 && Math.floor(start / spb) === Math.floor((start + len - 1) / spb)) {
                count = j + 1; length = len;
              }
            }
          }
        }
        if (count === 1) yield first;
        else { yield { ...first, end: (gridTime(start + length)+shift) / stepPerTick, r: count }; i += count - 1; }
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
        const s=nearestStep(rawStart), drift=rawStart-gridTime(s), off=App.clamp(drift,-.49,.49);
        const end=Math.max(s+1,nearestStep(rawEnd-off));
        if(Math.abs(drift-off)>tolerance || Math.abs(rawEnd-off-gridTime(end))>tolerance)quantized++;
        if (nt.v < 3) soft++;
        maxEnd = Math.max(maxEnd, end);
        if (s >= maxTimeline) continue;
        const n = track.kit ? drumPad(nt.n) : nt.n;
        if (track.kit && !exactDrums.includes(nt.n)) pitched.add(nt.n);
        histogram[n]++;
        notes.push({ t: track.index, s, end, n, v: nt.v, r: nt.r || 1, off:Math.abs(off)>.001 ? Math.round(off*1000)/1000 : 0 });
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
    const lanes = controlLanes(parts,P,bars*spb,stepPerTick,unSwing);
    const ccBars = Array.from({length:bars},(_,bar) => lanes.map(lane => {
      const from = bar*spb, span = cutLane(lane,from,from+spb);
      return JSON.stringify(span.points);
    }).join("/"));
    const plan = arrangement(onsets, carries, bars, spb, maxBars, file.markers, stepPerTick, ccBars);
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
        for (const lane of lanes) P.tracks[lane.t].automation[index][lane.key] = cutLane(lane,from,to);
        const segment = carries[item.start].concat(...onsets.slice(item.start, item.start + item.len)).sort(noteSort);
        for (const note of segment) {
          const clip = P.tracks[note.t].clips[index];
          if (clip.length === 4000) { truncatedClips++; continue; }
          const s = Math.max(from, note.s);
          clip.push({ s: s - from, n: note.n, l: Math.min(note.end, to) - s, v: note.v / 127, p: 1, ...(note.off && s===note.s ? {off:note.off} : {}), ...(note.r > 1 ? { r: note.r } : {}) });
        }
      }
      P.chain.push(seen.get(item.id));
      if(P.arrangement.meters.length)P.arrangement.slots.push({offset:0,steps:Math.min(item.len*spb,Math.max(1,maxEnd-item.start*spb)),rest:false});
    }
    P.song = P.chain.length > 1 || P.arrangement.meters.length ? 1 : 0;
    P.sel.p = P.chain[0];
    if (file.parts.length > parts.length) warnings.push(file.parts.length + " MIDI parts share " + parts.length + " console tracks.");
    if (pitched.size) warnings.push(pitched.size + " non-kit drum pitch" + (pitched.size === 1 ? "" : "es") + " mapped to the closest pads.");
    if (quantized) warnings.push(quantized + " note" + (quantized === 1 ? "" : "s") + " adjusted to the available note length or microtiming range.");
    if (soft) warnings.push("Very soft velocities raised to the minimum playable level.");
    if (file.usedPrograms) warnings.push("MIDI instrument programs use MusicLab synth and kit sounds.");
    if (lanes.length) warnings.push(lanes.length + " controller lane" + (lanes.length === 1 ? "" : "s") + " mapped to the sixteenth-note automation grid.");
    if (file.expression) warnings.push("Other controllers, pitch bend and aftertouch are not represented.");
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
