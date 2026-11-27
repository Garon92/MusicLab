/* The band writes ordinary MusicLab notes, instruments and sample assignments. */
(() => {
  "use strict";

  const tracks = [0,1,2,6,3,4,5,7,3,4,5,7];
  const rows=6, allRows=Array.from({length:rows},(_,i)=>i);
  const tempos = [76, 100, 124, 148];
  const pitches = [
    [39,38,37,36,40,41], // Hat, clap, snare, kick, open hat, tom
    [43,40,38,36,33,31],
    [72,69,67,64,62,60],
    [69,67,64,60,57,55],
    ...App.KidsWorld.groups.map((_,i)=>allRows.map(r=>36+App.KidsWorld.padIndex(i,r)))
  ];
  const voicePart = 3, masterMax = .54;
  const names = ["DRUMS", "BASS", "MELODY", "MY VOICE"];
  const normalVelocity = .69, accentVelocity = .98;
  const quartets = [0, 1, 2, 3];
  const inFour = v => Number.isInteger(v) && v >= 0 && v < 4;
  const validPart = v => Number.isInteger(v) && v >= 0 && v < tracks.length;
  const validRow = r => Number.isInteger(r) && r>=0 && r<rows;
  const owns = (part,note) => validPart(part) && (part<4 || pitches[part].includes(note));
  const part = P => tracks[P.sel.kidsPart]===P.sel.t ? P.sel.kidsPart : Math.max(0,tracks.indexOf(P.sel.t));
  function select(P,index){
    if(!validPart(index))return;
    P.sel.t=tracks[index];P.sel.kidsPart=index;
  }
  function mixDefaults(part){
    return {dly:0,rev:[.04,.03,.14,.09][part]??.035,vol:[.77,.81,.73,.76][part]??.83,pan:0};
  }
  const isKit = part => part === 0 || part >= 4;
  const pitch = (part,row) => pitches[part]?.[row];

  // Keep the same recording when changing its costume. All four variants are
  // native sampler settings so they transfer to the full console and WAV bounce.
  const sampleCostumes = [
    {tune:0, rev:0, cut:12000, aa:.002, ar:.06},
    {tune:12, rev:0, cut:5600, aa:.003, ar:.12},
    {tune:-12, rev:0, cut:2300, aa:.008, ar:.15},
    {tune:0, rev:1, cut:7200, aa:.025, ar:.23}
  ];
  // The same character has a synthesized voice before its first recording.
  const synthCostumes = [
    null,
    [
      {w1:1, w2:0, lv2:.25, cut:1300, sub:.16, aa:.003, ad:.17, as:.53, ar:.06},
      {w1:3, w2:1, lv2:.2, fine2:6, cut:640, res:2, fenv:1.5, fd:.13, as:.55, ar:.08},
      {w1:2, w2:1, lv2:.33, cut:240, res:2.7, fenv:3.2, fd:.11, ad:.13, as:.16, ar:.09},
      {w1:0, w2:0, lv2:.18, semi2:12, fm:.13, cut:4300, ad:.33, as:.16, ar:.17}
    ],
    [
      {w1:0, w2:0, lv2:.2, semi2:12, fm:.18, cut:6900, ad:.27, as:.08, ar:.16},
      {w1:1, w2:0, lv2:.14, noise:.015, aa:.055, ad:.21, as:.69, ar:.13, cut:3100},
      {w1:3, w2:2, lv2:.18, cut:1500, fenv:1.5, fd:.12, ad:.16, as:.27, ar:.10},
      {w1:0, w2:0, semi2:19, lv2:.19, fm:.34, cut:9800, ad:.61, as:.09, ar:.34}
    ],
    [
      {w1:2, w2:1, lv2:.37, fine2:4, ftype:3, cut:850, res:2, fenv:1.1, ad:.20, as:.67, ar:.11},
      {w1:3, w2:1, lv2:.2, ftype:3, cut:1550, res:1.4, lrate:5, ldest:1, ldep:.003, aa:.035, ar:.12},
      {w1:1, w2:2, lv2:.51, semi2:-12, cut:850, res:2.3, fenv:1.3, fd:.19, ar:.16},
      {w1:0, w2:0, lv2:.22, semi2:7, fm:.29, cut:4100, aa:.078, ad:.38, as:.59, ar:.25}
    ]
  ];
  // Each row adjusts kick/snare/clap/hat together, retaining all eight pads.
  const drumCostumes = [
    [{tune:53, dec:.31}, {tune:188, ndec:.13}, {burst:3, ndec:.11}, {col:8300, ndec:.047}],
    [{tune:43, sweep:18, dec:.51}, {tune:137, col:1230, ndec:.21}, {burst:2, col:1700, ndec:.18}, {col:4100, ndec:.10}],
    [{tune:75, sweep:12, dec:.14}, {tune:244, tone:.9, nz:.29, dec:.10}, {tune:340, tone:.62, burst:1, ndec:.038}, {col:10500, ndec:.022}],
    [{tune:109, sweep:10, dec:.25}, {tune:276, wave:1, tone:.85, nz:.23}, {tune:398, tone:.8, burst:2, ndec:.041}, {tune:913, wave:3, tone:.25, col:6000, ndec:.072}]
  ];
  const tempoIndex = P => tempos.reduce((best, value, index) =>
    Math.abs(P.bpm - value) < Math.abs(P.bpm - tempos[best]) ? index : best, 0);
  function tempo(P,index) {
    if (inFour(index)) P.bpm = tempos[index];
    return tempoIndex(P);
  }
  App.extendProject({load(P, raw) {
    if (!Array.isArray(raw.kidsBand?.costumes)) return;
    P.kidsBand = {costumes: quartets.map(i => inFour(raw.kidsBand.costumes[i]) ? raw.kidsBand.costumes[i] : 0)};
    if ([1,2].includes(raw.kidsBand.world)) P.kidsBand.world=raw.kidsBand.world;
    if (raw.kidsBand.effects===1) P.kidsBand.effects=1;
    if (validPart(raw.sel?.kidsPart)) P.sel.kidsPart=raw.sel.kidsPart;
  }});
  function costumes(P) {
    return P.kidsBand?.costumes.slice() || [0, 0, 0, 0];
  }
  function prepare(P) {
    if (!P.kidsBand) P.kidsBand = {costumes:[0, 0, 0, 0]};
    if (P.kidsBand.world!==2) {
      const defaults=App.sanitize(App.newProject()),old=App.sanitize(P);
      for(let i=0;i<4;i++){
        const ti=tracks[i+4],T=P.tracks[ti];
        if(P.kidsBand.world===1){
          if(T.kind!=="kit" || T.kit.pads.length>8)continue;
          App.KidsWorld.install(T,i,true);
        }else{
          if(JSON.stringify(old.tracks[ti])!==JSON.stringify(defaults.tracks[ti]) ||
              P.audio?.regions?.some(r=>r.track===ti))continue;
          App.KidsWorld.install(T,i);
        }
        App.KidsWorld.install(T,i+4,true);
      }
      P.kidsBand.world=2;
    }
    if (P.kidsBand.effects!==1) wholeBand(P);
    legato(P);
    P.fx.vol = Math.min(P.fx.vol, masterMax);
    P.bpm = tempos[tempoIndex(P)];
    return P;
  }
  /* Effects are one setting for the whole band and the whole song. A song made when each instrument and each piece
     had its own keeps what was heard, made visible: every strip takes the strongest setting any of them had, and the
     effect curves of single pieces are dropped, since nothing on the kids' face would show them. Each instrument's
     own level, pan and sends are its mix and stay. Done once per song. */
  function wholeBand(P) {
    const strips = [...new Set(tracks)];
    if (P.rack?.strips) {
      const most = [0,1,2,3].map(j => Math.max(0, ...strips.map(i => P.rack.strips[i]?.macros?.[j] || 0)));
      for (const i of strips) if (P.rack.strips[i]) P.rack.strips[i].macros = most.slice();
    }
    for (const T of P.tracks) for (const lanes of T.automation) for (const k of ["dly","rev","pan","vol","macro1","macro2","macro3","macro4"]) delete lanes[k];
    P.kidsBand.effects = 1;
  }
  function sync(part) {
    if (!App.E || !App.P?.kidsBand) return;
    if (validPart(part)) App.E.syncTrack(tracks[part]);
    else App.E.syncAll();
    const param = App.E.out.gain, now = App.E.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.min(App.P.fx.vol, masterMax) ** 2, now);
  }
  function costume(P,part,index) {
    if (!inFour(part) || !inFour(index)) return;
    P.kidsBand.costumes[part] = index;
    const T = P.tracks[tracks[part]];
    if (P === App.P) App.E?.cutTrack(tracks[part]);
    if (part === 0) {
      T.kind = "kit";
      const pads = App.newKit().pads;
      drumCostumes[index].forEach((spec,i) => Object.assign(pads[i], spec));
      T.kit.pads = pads;
    } else if (part === voicePart && T.smp.id) {
      T.kind = "smp";
      Object.assign(T.smp, App.defs(App.DEF.smp), {root:60, shot:0}, sampleCostumes[index]);
    } else {
      T.kind = "syn";
      Object.assign(T.syn, App.defs(App.DEF.syn), {mode:0}, synthCostumes[part][index]);
    }
    if (P === App.P) sync(part);
  }
  function newProject() {
    const P = App.newProject();
    P.name = "POCKET BAND";
    P.scale = App.SCALES.findIndex(scale => scale[0] === "PENTA MAJOR");
    P.key = 0; P.sig = 2; P.bpm = tempos[1]; P.fx.vol = masterMax;
    P.chain = [0]; P.song = 0; P.arrangement.slots = [null];
    P.kidsBand={costumes:[0,0,0,0],world:2};
    App.KidsWorld.groups.forEach((_,i)=>App.KidsWorld.install(P.tracks[tracks[i+4]],i,i>=4));
    select(P,4);
    quartets.forEach(i => {
      const ti=tracks[i];
      const T = P.tracks[ti];
      T.name=names[i];T.lo=Math.min(...pitches[i]);Object.assign(T,mixDefaults(i));
      costume(P,i,0);
    });
    return P;
  }

  const intensity = (n, sung) => !sung && (n.r > 1 || n.l >= 2) ? 3 : n.v > .84 ? 2 : 1;
  // A recorded voice sings each note until its next one, round to the first again at the end of the piece: the whole
  // recording is heard when there is room for it, and its notes never pile up on each other. Its notes are plain or
  // accented; their length is not the child's to set.
  const sung = (P, part) => part === voicePart && P.tracks[tracks[voicePart]].kind === "smp" && !!P.tracks[tracks[voicePart]].smp.id;
  function legato(P) {
    if (!sung(P, voicePart)) return;
    for (const clip of P.tracks[tracks[voicePart]].clips.slice(0, 4)) {
      const own = clip.filter(n => owns(voicePart, n.n)), steps = [...new Set(own.map(n => n.s))].sort((a, b) => a - b);
      for (const n of own) {
        const next = steps[(steps.indexOf(n.s) + 1) % steps.length];
        n.l = next > n.s ? next - n.s : 16 - n.s + next; delete n.r;
      }
    }
  }
  function makeNote(part,row,col,strength) {
    const long = strength === 3;
    return {
      s:2*col, n:pitches[part][row],
      l:long ? (isKit(part) ? 2 : Math.min(4, 16 - 2*col)) : 1,
      v:strength === 2 ? accentVelocity : normalVelocity, p:1,
      ...(long && isKit(part) ? {r:2} : {})
    };
  }
  function grid(P,part,pattern) {
    const rows = allRows.map(() => Array(8).fill(0));
    const clip = P.tracks[tracks[part]].clips[pattern];
    for (const note of clip) {
      const row = pitches[part].indexOf(note.n), col = note.s / 2;
      if (row >= 0 && Number.isInteger(col) && col >= 0 && col < 8) rows[row][col] = intensity(note, sung(P, part));
    }
    return rows;
  }
  function edit(P,part,pattern,row,col,hold = false) {
    if (!validPart(part) || !inFour(pattern) || !validRow(row) || !Number.isInteger(col) || col < 0 || col > 7) return 0;
    const clip = P.tracks[tracks[part]].clips[pattern], key = pitches[part][row];
    const index = clip.findIndex(n => n.s === 2*col && n.n === key);
    const voiced = sung(P, part), old = index < 0 ? 0 : intensity(clip[index], voiced);
    const next = hold ? (old === 0 ? 2 : old % (voiced ? 2 : 3) + 1) : old ? 0 : 1;
    if (index >= 0) clip.splice(index,1);
    if (next) {
      clip.push(makeNote(part,row,col,next));
      clip.sort((a,b) => a.s-b.s || a.n-b.n);
    }
    legato(P);
    return next;
  }
  function clear(P,part,pattern,row){
    if(!validPart(part)||!inFour(pattern)||(row!==undefined&&!validRow(row)))return false;
    const clips=P.tracks[tracks[part]].clips, clip=clips[pattern];
    const kept=clip.filter(n=>row===undefined?!owns(part,n.n):n.n!==pitch(part,row));
    if(kept.length===clip.length)return false;
    clips[pattern]=kept;legato(P);return true;
  }
  const clearRow=(P,part,pattern,row)=>validRow(row)&&clear(P,part,pattern,row);
  function moveNote(P,part,pattern,fromRow,fromCol,toRow,toCol){
    const validCol=c=>Number.isInteger(c)&&c>=0&&c<8;
    if(!validPart(part)||!inFour(pattern)||!validRow(fromRow)||!validRow(toRow)||!validCol(fromCol)||!validCol(toCol))return 0;
    const clip=P.tracks[tracks[part]].clips[pattern],srcPitch=pitch(part,fromRow),destPitch=pitch(part,toRow);
    if(clip.some(n=>n.s===2*toCol&&n.n===destPitch))return 0;
    const note=clip.find(n=>n.s===2*fromCol&&n.n===srcPitch);
    if(!note)return 0;
    note.s=2*toCol;note.n=destPitch;
    clip.sort((a,b)=>a.s-b.s || a.n-b.n);
    legato(P);
    return intensity(note, sung(P, part));
  }
  function audition(part,row,strength=1) {
    if (!validPart(part) || !validRow(row)) return;
    const engine = App.audio(); if (!engine) return;
    const project=App.P, ti=tracks[part], n=makeNote(part,row,0,strength || 1);
    const play=()=>{
      if (project!==App.P) return;
      const step=15/project.bpm, t=Math.max(.16,engine.ctx.currentTime+Math.max(.009,engine.ctx.baseLatency||0));
      const count=n.r||1,width=n.l*step/count;
      for(let i=0;i<count;i++)engine.play(ti,n.n,n.v,t+i*width,Math.max(.02,width-.004),true);
    };
    const pad=project.tracks[ti].kind==="kit" ? project.tracks[ti].kit.pads[n.n-36] : null;
    if (pad?.src===1 && pad.id && !App.samples.has(pad.id)) {
      App.restoreSample(pad.id).then(()=>{if(App.samples.has(pad.id))play();})
        .catch(()=>window.dispatchEvent(new Event("kids-audio-error")));
    } else play();
  }

  const choose = items => items[Math.floor(Math.random()*items.length)];
  function variation(P,part,pattern) {
    const track = P.tracks[tracks[part]], before = grid(P,part,pattern);
    const notes = [], put = (row,col,strength=1) => {
      if (!notes.some(n => n.s === 2*col && n.n === pitches[part][row])) notes.push(makeNote(part,row,col,strength));
    };
    // Once a phrase exists the dice rotates and ornaments it. On a blank card,
    // start with a small rhythmic skeleton and pentatonic call or response.
    if (before.some(row => row.some(Boolean))) {
      const shift = choose([1,2,4,6]);
      before.forEach((row,r) => row.forEach((v,c) => {if(v) put(r,(c+shift)%8,v);}));
      const index = Math.floor(Math.random()*notes.length), n = notes[index];
      notes[index] = makeNote(part, pitches[part].indexOf(n.n), n.s/2, intensity(n)%3+1);
      if (notes.length < 12 && Math.random() < .65) put(choose(allRows),choose([1,3,5,7]));
    } else if (part >= 4) {
      // Give the one-shots space to answer each other, especially long animal calls.
      const caller=choose(allRows), responders=allRows.filter(r=>r!==caller);
      put(caller,0,2);put(choose(responders),choose([2,3]));put(caller,4);
      put(choose(responders),choose([6,7]));
    } else if (!part) {
      put(3,0,2); put(3,choose([3,4,5])); put(2,choose([2,6]),2);
      const hats = choose([[0,2,4,6],[1,3,5,7],[0,3,4,7]]);
      hats.forEach(c => put(0,c));
    } else {
      const shape = choose([[0,3,4,6],[0,2,5],[0,2,4,7],[1,3,6]]);
      let row = choose([2,3]);
      shape.forEach((c,i) => {
        put(row,c,i===0?2:choose([1,1,3]));
        row = App.clamp(row + choose([-1,-1,1,1,2]),0,rows-1);
      });
    }
    notes.push(...track.clips[pattern].filter(n=>!owns(part,n.n)));
    track.clips[pattern] = notes.sort((a,b) => a.s-b.s || a.n-b.n);
    legato(P);
    return true;
  }

  const meterData = new Float32Array(512);
  function level(analyser) {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(meterData);
    let energy = 0;
    for (const sample of meterData) energy += sample*sample;
    return App.clamp((Math.sqrt(energy/meterData.length)-.0002)*8,0,1);
  }
  const levels = () => tracks.map((t,index) => {
    const strip=App.E?.tracks[t];
    return level(index>=4 && App.P?.tracks[t].kit.pads.length>8 ? strip?.padMeters?.[index<8?0:1] : strip?.an);
  });

  const maxRecordSeconds = 6;
  let capture = null;
  const recording = () => capture?.state || "idle";
  const micLevel = () => level(capture?.analyser);
  function releaseInput(job) {
    clearTimeout(job.timer);
    job.analyser?.disconnect(); job.analyser = null;
    if (!job.closed) {job.closed = true; job.E.closeInput();}
  }
  function cancelRecording() {
    const job = capture;
    if (!job) return;
    capture = null;
    if (job.rec && job.state !== "saving") job.rec.stop().catch(()=>{});
    releaseInput(job);
  }
  function trimmed(buf) {
    const length = Math.min(buf.length, Math.round(buf.sampleRate*maxRecordSeconds));
    const channels = Array.from({length:buf.numberOfChannels},(_,i)=>buf.getChannelData(i));
    const silence = .0025, margin = Math.round(.012*buf.sampleRate);
    let first = length, last = -1;
    for (const data of channels) {
      for (let i=0;i<first;i++) if (Math.abs(data[i])>silence) {first=i;break;}
      for (let i=length-1;i>last;i--) if (Math.abs(data[i])>silence) {last=i;break;}
    }
    if (last-first < buf.sampleRate*.035) return null;
    first = Math.max(0,first-margin); last = Math.min(length,last+margin+1);
    const out = new AudioBuffer({numberOfChannels:channels.length,sampleRate:buf.sampleRate,length:last-first});
    channels.forEach((data,i)=>out.copyToChannel(data.subarray(first,last),i));
    return out;
  }
  async function finish(job) {
    if (capture !== job || job.state !== "recording") return;
    job.state = "saving"; job.onState("saving");
    try {
      // Stop requests the final worklet block before its media source disconnects.
      const stopped = job.rec.stop();
      releaseInput(job);
      const buffer = trimmed(await stopped);
      if (capture !== job) return;
      if (job.project !== App.P) {cancelRecording();return;}
      if (!buffer) {capture=null; job.onState("idle","empty"); return;}
      // A shelf project only gets its new reference after the audio is durable.
      let id;
      try { id = await App.storeBuffer("MY VOICE",buffer); }
      catch {
        if (capture === job) {capture=null;job.onState("idle","storage");}
        return;
      }
      if (capture !== job) return;
      if (job.project !== App.P) {cancelRecording();return;}
      const T = job.project.tracks[tracks[voicePart]];
      T.smp.id = id;
      costume(job.project,voicePart,job.project.kidsBand.costumes[voicePart]);
      legato(job.project); // the notes already written now sing the recording to the next one
      capture = null; job.onSaved(); job.onState("idle");
    } catch {
      if (capture === job) {capture = null; job.onState("idle","unavailable");}
    }
  }
  async function record(onState,onSaved) {
    if (capture) {
      if (capture.state === "recording") return finish(capture);
      if (capture.state === "pending") {const job=capture;cancelRecording();job.onState("idle");}
      return;
    }
    const E = App.audio();
    if (!E || !navigator.mediaDevices?.getUserMedia) {onState("idle","unavailable");return;}
    const job = {E,project:App.P,onState,onSaved,state:"pending",closed:false};
    capture = job; onState("pending");
    try {
      const input = await E.openInput();
      if (capture !== job) return;
      if (App.P !== job.project) {cancelRecording();return;}
      E.monitor(false);
      job.analyser = E.ctx.createAnalyser(); job.analyser.fftSize = meterData.length;
      input.connect(job.analyser);
      const rec = await E.record(input);
      if (capture !== job || App.P !== job.project) {
        if (capture === job) cancelRecording();
        await rec.stop();return;
      }
      job.rec = rec; job.state = "recording";
      job.timer = setTimeout(()=>finish(job),maxRecordSeconds*1000);
      onState("recording");
    } catch (error) {
      if (capture !== job) return;
      releaseInput(job); capture = null;
      onState("idle", error.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }
  function dispose() {
    cancelRecording();
    if (App.P?.kidsBand) App.E?.panic(true);
  }
  App.KidsMusic = {masterMax,tracks,rows,owns,part,select,clearRow,mixDefaults,tempos,tempo,tempoIndex,newProject,prepare,costumes,costume,sync,pitch,legato,sung,
    note:makeNote,strength:intensity,
    grid,edit,clear,moveNote,audition,variation,levels,record,recording,micLevel,cancelRecording,dispose};
})();
