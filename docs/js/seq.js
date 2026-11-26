/* MUSICLAB · sequencer — transport, step scheduling, arpeggiator, offline bounce, MIDI file */
(() => {
  "use strict";
  const { clamp } = App;
  const Seq = (App.Seq = { playing: false, pos: null, skip: new Map() });
  let firstFrame = false, nextT = 0, cursor = 0, origin = 0, pat = 0, startSi = 0, queued = null, q = [], timer = 0, worker = null;

  const songOn = (P) => (!P.performance || P.performance.source === "arrangement") && !!P.song && P.chain.length > 0;
  Seq.songOn = () => songOn(App.P);
  const swingOf = (P, s, sd) => (s & 1 ? (P.swing / 100) * 0.5 * sd : 0);

  // Swing moves the offbeat boundary; subdivisions interpolate between the adjacent
  // swung boundaries. This keeps repeats inside their note even at maximum swing.
  const gridTime = (P, pos, sd) => {
    const s = Math.floor(pos), fraction = pos - s;
    return pos * sd + (1 - fraction) * swingOf(P, s, sd) + fraction * swingOf(P, s + 1, sd);
  };
  const C=()=>App.Conductor;
  const seconds=(P,s)=>C().time(P,s);
  const duration=(P,s)=>seconds(P,s+1)-seconds(P,s);
  const countOf = nt => clamp(Math.round(nt.r || 1), 1, 8);

  // At high swing an early note on the next step can precede a late ratchet
  // on this one. Mono voice stealing and clip cuts must see audible time order.
  function eventQueue(E,P) {
    let pending=[];
    const live=E===App.E;
    return {
      note(e){pending.push(e);},
      cut(ti,time){
        pending=pending.filter(e=>e.ti!==ti || e.time<time || e.cut);
        pending.push({cut:true,ti,time});
      },
      flush(before=Infinity){
        pending.sort((a,b)=>a.time-b.time || Number(!!b.cut)-Number(!!a.cut));
        let count=0;
        for(const e of pending){
          if(e.time>=before)break;
          count++; // counted before it plays: an event that cannot be played is dropped, not retried on every tick
          try{
            if(e.cut){
              E.releaseClip?.(e.ti,e.time);
              if(live)App.MidiIO?.cut?.(e.ti,e.time);
            }else{
              E.play(e.ti,e.note,e.velocity,e.time,e.duration,e.poly);
              if(live && !P.tracks[e.ti].mute && (!P.tracks.some(t=>t.solo)||P.tracks[e.ti].solo))
                App.MidiIO?.note(e.ti,e.note,e.velocity,e.time,e.duration);
            }
          }catch(error){if(live)App.UI.msg("A NOTE ON TRACK "+(e.ti+1)+" COULD NOT BE PLAYED · "+String(error.message||error).slice(0,60).toUpperCase());}
        }
        if(count)pending.splice(0,count);
      }
    };
  }
  let output, sceneSession, runStep=0;
  function plan(P,pattern=P.sel.p) {
    const source=P.performance?.source || "arrangement", chain=songOn(P);
    const list=chain ? P.chain : [pattern], slots=C().layout(P,list), ends=slots.map(slot=>slot.end);
    const count=ends.at(-1) || 0;
    const music=source==="take" ? P.performance.take.steps : source==="live" ? P.performance.bars*App.spb(P) : count;
    const clipLength=!chain && source==="arrangement" && P.performance ? Math.max(...P.performance.loops.map(row=>row[pattern])) : 0;
    const harmony=source==="arrangement" && !chain ? App.Harmony?.duration(P)||0 : 0;
    const sceneEnd=source==="arrangement" ? (P.scenes?.cues||[]).reduce((end,c)=>Math.max(end,C().barsAfter(P,c.at,c.bars||0)),0) : 0;
    let total=Math.max(music,clipLength,harmony,sceneEnd,App.AudioStudio?.durationSteps(P)||0);
    // A looping pattern repeats under anything longer than itself (audio, chords, a long clip), so the cycle is a whole
    // number of pattern lengths: otherwise the pattern restarts mid-bar every time round.
    if(!chain && source==="arrangement" && total>count && count>0)total=Math.ceil(total/count)*count;
    return {source,chain,list,slots,ends,music,total};
  }
  function position(P,layout,at,realtime=false) {
    const {source,chain,list,ends,music}=layout;
    // A single selected pattern repeats underneath longer chord or audio timelines.
    const index=chain && at<music ? ends.findIndex(end=>at<end) : 0;
    const pi=list[index],s=chain && at<music ? at-(index?ends[index-1]:0) : at%App.patSteps(P,pi);
    const silent=((chain || source==="take") && at>=music) || (chain && layout.slots[index]?.rest);
    const lanes=silent ? Array(8).fill(null) : App.Live?.frames(P,at,realtime) || P.tracks.map((_,ti)=>{
      const n=P.performance?.loops?.[ti]?.[pi] || (chain && P.arrangement?.slots?.[index]?.steps ? App.patSteps(P,pi) : chain ? layout.slots[index].end-layout.slots[index].from : layout.ends[0]);
      return {p:pi,s:(chain?s+layout.slots[index].offset:at)%n,n};
    });
    const slot=layout.slots[index], prev=layout.slots[index-1], continuous=prev && !slot.rest && !prev.rest && prev.p===slot.p && prev.offset+prev.end-prev.from===slot.offset;
    const boundary=chain && at===slot.from && !continuous && (slot.rest || slot.offset || prev?.rest || prev?.offset);
    return {pat:pi,step:s,si:index,lanes,changes:boundary ? P.tracks.map((_,i)=>i) : App.Live?.transitions(P,at,realtime)||[]};
  }
  const emit = (E,P,pi,gridStep,t,sd,options={}) => {
    const absolute=options.absoluteStep ?? gridStep, musical=absolute+(P.performance?.source==="take" ? P.performance.take.origin||0 : 0);
    const floor=options.floor ?? 0;
    const sink=options.output || eventQueue(E,P), folded=new Map();
    const mapped=options.mapTime && P.arrangement?.tempo.length;
    const clock=offset=>{
      if(!mapped)return gridTime(P,musical+offset,sd)-gridTime(P,musical,sd);
      const swingAt=x=>{
        const k=Math.floor(x), f=x-k;
        const boundary=i=>seconds(P,absolute+i)-(seconds(P,absolute)) + swingOf(P,musical+i,duration(P,absolute+i));
        return boundary(k)+(boundary(k+1)-boundary(k))*f;
      };
      return swingAt(offset)-swingAt(0);
    };
    for (let ti=0;ti<P.tracks.length;ti++) {
      const lane=options.lanes?.[ti];
      const changed=options.changes?.includes(ti);
      if(changed)sink.cut(ti,t);
      if(options.lanes && !lane) {
        if(changed || songOn(P)) App.SongCurves.schedule(E,P,ti,null,0,absolute,t,t+sd,songOn(P));
        continue;
      }
      const bank=lane?.p ?? pi, n=lane?.n || App.Live?.length(P,ti,bank) || App.patSteps(P,bank), s=lane?.s ?? gridStep%n;
      const T=P.tracks[ti], clip=T.clips[bank];
      const harmony=App.Harmony?.state(P,ti,musical);
      const at=pos=>t+clock(pos-s);
      const pass=App.Rules?.pass?.(P,ti,bank,s,n,{...options,lane}) ?? lane?.pass ?? Math.floor((options.runStep??absolute)/n)+1;
      const fill=E===App.E && !!App.Rules?.filling?.();
      if(E===App.E)App.Rules?.step?.(ti,bank,s,n,pass,t,at(s+1));
      const add=(ti,note,nt,pos,length,gate)=>{
        if(note>127 || length<=0)return;
        if(App.Rules ? !App.Rules.allow(P,ti,bank,nt,pass,pos,fill) : nt.p<1 && Math.random()>=nt.p)return;
        const from=at(pos),span=at(pos+length)-from;
        const time=Math.max(changed?t:floor,from+(nt.off||0)*sd);
        let duration=gate==null ? span-Math.min(.004,span*.12) : span*gate;
        if(Number.isFinite(harmony?.remain))duration=Math.min(duration,at(s+harmony.remain)-time);
        if(duration<=0)return;
        const pitches=App.Harmony?.pitches(P,ti,note,musical,harmony) || [note];
        for (const key of pitches) {
          const e={ti,note:key,velocity:nt.v,time,duration,poly:pitches.length>1};
          // Reharmonizing an existing block chord can map many input notes to the same voice.
          if(harmony) {
            const id=ti+"/"+key+"/"+time,old=folded.get(id);
            if(old){old.duration=Math.max(old.duration,duration);old.velocity=Math.max(old.velocity,nt.v);continue;}
            folded.set(id,e);
          }
          sink.note(e);
          if(E===App.E)App.Rules?.hit?.(ti,bank,s,pass,key,e.velocity,time,duration,e);
        }
      };
      const stored=T.automation?.[bank];
      // While a finger is on the XY pad, the live strip follows it on the audio
      // clock. Offline audio and MIDI continue to use the saved automation.
      const automation=E===App.E && App.Kids?.active ? App.KidsSound?.lanes(ti,bank,stored) ?? stored : stored;
      App.SongCurves.schedule(E,P,ti,automation,s,absolute,t,at(s+1),songOn(P));
      if (!clip.length) continue;
      for(const nt of clip)if(nt.fixed && nt.s===s) {
        const repeats=countOf(nt), gate=nt.fixed.gate*nt.l/(nt.fixed.base||nt.l);
        if(App.Rules && !App.Rules.allow(P,ti,bank,nt,pass,s,fill))continue;
        for(let k=0;k<repeats;k++){
          const pos=s+nt.fixed.offset+k*gate/repeats, time=Math.max(floor,at(pos)+(nt.off||0)*sd);
          const held=Math.max(.001,at(pos+gate/repeats)-at(pos));
          const e={ti,note:nt.n,velocity:nt.v,time,duration:held,poly:!!nt.fixed.poly};
          sink.note(e);
          if(E===App.E)App.Rules?.hit?.(ti,bank,s,pass,nt.n,nt.v,time,held,e);
        }
      }
      if (T.kind !== "syn" || !T.arp.mode) {
        for (const nt of clip) {
          if(nt.fixed)continue;
          const length = Math.min(nt.l, n - nt.s);
          if (s < nt.s || s >= nt.s + length) continue;
          const count = countOf(nt);
          const width = length / count;
          if((changed || harmony?.change) && s>nt.s){
            const phase=(s-nt.s)/width;
            if(Math.abs(phase-Math.round(phase))>1e-8)
              add(ti,nt.n,{...nt,off:0},s,nt.s+(Math.floor(phase)+1)*width-s);
          }
          if (count === 1 && s !== nt.s) continue;
          // Only schedule the repeats whose onset falls in this scheduler window.
          const first = Math.ceil((s - nt.s) * count / length);
          const last = Math.min(count, Math.ceil((s + 1 - nt.s) * count / length));
          for (let k = first; k < last; k++) {
            if (E === App.E && k === 0 && Seq.skip.has(nt)) {
              const until = Seq.skip.get(nt); Seq.skip.delete(nt);
              if (t < until) continue;
            }
            add(ti, nt.n, nt, nt.s + k * width, width);
          }
        }
        continue;
      }
      const held = clip.filter(nt => !nt.fixed && nt.s <= s && s < nt.s + nt.l);
      if (!held.length) continue;
      held.sort((a, b) => a.n - b.n);
      const A = T.arp, per = [2, 1, 0.5][A.rate];
      const L = held.length * A.oct, rel = s - Math.min(...held.map(nt => nt.s));
      // Each repeat divides its arpeggiator pulse and keeps the chosen gate ratio.
      const fire = (k, pos) => {
        let x;
        if (A.mode === 1) x = k % L;
        else if (A.mode === 2) x = L - 1 - (k % L);
        else if (A.mode === 3) { const cycle = Math.max(1, 2 * L - 2), m = k % cycle; x = m < L ? m : cycle - m; }
        else x = Math.floor((App.Rules?.random?.(P,ti,bank,pass,s,k,91) ?? Math.random()) * L);
        const nt = held[x % held.length];
        const length = Math.min(per, n - pos, nt.s + nt.l - pos);
        const count = countOf(nt), width = length / count;
        for (let j = 0; j < count; j++) add(ti, nt.n + 12 * Math.floor(x / held.length), nt, pos + j * width, width, A.gate);
      };
      if (per === 2) { if (rel % 2 === 0) fire(rel / 2, s); }
      else if (per === 1) fire(rel, s);
      else { fire(rel * 2, s); fire(rel * 2 + 1, s + 0.5); }
    }
    if(!options.output)sink.flush();
  };

  const tick = () => {
    const E = App.E;
    if (!E || !Seq.playing) return;
    const now = E.ctx.currentTime;
    while (q.length && q[0].t <= now) Seq.pos = q.shift();
    if (nextT < now - 0.25) nextT = now + 0.03; // tab was asleep: resume from now instead of replaying the gap
    const P=App.P;
    let layout=plan(P,pat),sd=duration(P,cursor);
    while (nextT<now+.12+.5*Math.max(sd,duration(P,cursor+1))) {
      if(layout.source!=="live" && cursor>=layout.total)cursor=0;
      if(queued!=null && layout.source==="arrangement" && !layout.chain && cursor%App.patSteps(P,pat)===0) {
        pat=queued; queued=null; cursor=0;layout=plan(P,pat);
      }
      sd=duration(P,cursor);
      const frame=position(P,layout,cursor,true);
      if(layout.chain)pat=frame.pat;
      nextT=App.MidiIO?.phase?.(E.ctx,nextT,sd) ?? nextT;
      const phase=cursor+(layout.source==="take" ? P.performance.take.origin : 0);
      const t=nextT+swingOf(P,phase,sd);
      E.tempo?.(C().bpm(P,cursor),C().meter(P,cursor).width,nextT);
      App.Scenes?.schedule?.(E,sceneSession,cursor,nextT,nextT+sd,frame.lanes);
      const current=App.Scenes?.projectAt?.(sceneSession,cursor)||P;
      emit(E,current,frame.pat,frame.step,t,sd,{slots:layout.chain?layout.slots:null,arrangementSteps:layout.total,mapTime:true,runStep,absoluteStep:cursor,lanes:frame.lanes,changes:frame.changes,output,floor:origin});
      App.AudioStudio?.schedule(E,P,cursor,nextT,sd,cursor===0||firstFrame);
      firstFrame=false;
      App.MidiIO?.clock(E.ctx,nextT,sd);
      const meter=C().position(P,cursor);
      if(P.click && meter.inside%meter.beatSteps===0) E.click(t,meter.inside===0);
      q.push({...frame,...meter,t,straightTime:nextT,absoluteStep:cursor,runStep,sd,span:sd+swingOf(P,phase+1,duration(P,cursor+1))-swingOf(P,phase,sd)});
      cursor++;runStep++;nextT+=sd;
    }
    output.flush(nextT-.5*Math.max(sd,duration(P,cursor))-.002);
  };

  // A worker clock keeps time when the tab is in the background; timers on the page itself get throttled there.
  try {
    worker = new Worker(URL.createObjectURL(new Blob(["let t;onmessage=e=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" })));
    worker.onmessage = tick;
    worker.onerror = () => { worker = null; if (Seq.playing) timer = setInterval(tick, 25); };
  } catch (e) { worker = null; }

  Seq.play = (from,absoluteStep) => {
    const E = App.audio();
    if (!E) return;
    Seq.stop(true);
    Seq.runId=(Seq.runId||0)+1;
    const P = App.P;
    q=[];cursor=0;queued=null;pat=P.sel.p;
    const layout=plan(P);
    if(layout.chain) {
      const si=clamp(from ?? startSi,0,P.chain.length-1);
      pat=P.chain[si];cursor=si ? layout.ends[si-1] : 0;
    }
    if(Number.isFinite(absoluteStep)){
      const target=Math.max(0,Math.floor(absoluteStep));
      cursor=layout.source==="live" ? target : target%layout.total;
      if(layout.chain)pat=layout.list[layout.ends.findIndex(end=>cursor<end)] ?? layout.list[0];
    }
    App.Live?.start(P);
    runStep=cursor;sceneSession=App.Scenes?.session?.(P);
    output=eventQueue(E,P);
    firstFrame=true;origin=nextT=Math.max(E.ctx.currentTime+.06,.16);
    E.restartLfos(nextT);
    App.MidiIO?.start(E.ctx,nextT);
    Seq.playing = true;
    tick();
    if (worker) worker.postMessage(25); else timer = setInterval(tick, 25);
    App.Top.sync();
  };
  Seq.stop = (quiet) => {
    if (worker) worker.postMessage(0);
    clearInterval(timer);
    const was = Seq.playing;
    if(was) App.Retrospective?.mark();
    if(was) {App.Live?.finish();App.MidiIO?.stop();App.AudioStudio?.stopSources(App.E);}
    if(was){App.Rules?.stop?.(App.E.ctx.currentTime);App.Scenes?.end?.(App.E,sceneSession);App.E.stopTempo?.();}
    sceneSession=null;output=null;
    Seq.playing = false; Seq.pos = null; q = []; queued = null;
    Seq.skip.clear();
    if (was && App.E) { App.E.panic(); App.E.stopAutomation(); }
    if (!quiet) App.Top.sync();
  };
  // The player's own stop also ends a launcher session; restarts the console makes for itself (Seq.stop then Seq.play) do not.
  // Undo and redo swap the project under a running transport. When what it plays through is unchanged, it goes on from
  // where it is: what is already queued is sent, and the queue and the scene session are bound to the new project.
  Seq.shape = (P) => JSON.stringify([P.chain, P.song, P.sig, P.pats, P.arrangement, P.performance?.source, P.performance?.loops, P.performance?.take?.steps, P.harmony?.chords, (P.audio?.regions || []).length]);
  Seq.rebind = () => {
    if (!Seq.playing || !App.E) return;
    output?.flush();
    output = eventQueue(App.E, App.P);
    sceneSession = App.Scenes?.session?.(App.P);
  };
  Seq.toggle = () => { if (Seq.playing) { Seq.stop(); return App.Live?.rest?.() ? "rested" : "stopped"; } Seq.play(); return "playing"; };
  // In pattern mode a new selection takes over at the next loop boundary.
  Seq.cue = (p) => { if (Seq.playing && App.P.performance?.source==="arrangement" && !songOn(App.P)) queued = p === pat ? null : p; };
  Seq.queued = () => queued;
  Seq.pat = () => pat;
  Seq.startAt = (i) => { startSi = i; if (Seq.playing && songOn(App.P)) Seq.play(i); };
  Seq.start = () => startSi;
  Seq.frame = () => {
    if (!Seq.playing || !App.E) return null;
    const now = App.E.ctx.currentTime;
    while (q.length && q[0].t <= now) Seq.pos = q.shift();
    return Seq.pos;
  };
  // Fractional step under the playhead right now (for recording played notes).
  // Reads the audio clock itself, so it stays right while the tab is hidden and no frames are drawn.
  Seq.now = (ti) => {
    const c=Seq.frame();if(!c)return null;
    const lane=ti==null ? {p:c.pat,s:c.step} : c.lanes[ti];
    if(!lane)return null;
    return {pat:lane.p,n:lane.n,step:lane.s+clamp((App.E.ctx.currentTime-c.t)/c.span,0,1),sd:c.sd,span:c.span};
  };
  Seq.rangeSteps=()=>App.P.performance.source==="live" ? Infinity : plan(App.P,Seq.playing?pat:App.P.sel.p).total;
  Seq.nextGrid = (steps=1) => {
    const end=Seq.rangeSteps(),from=cursor>=end ? 0 : cursor;
    const meter=C().position(App.P,from),grid=steps==="bar"?meter.barSteps:steps==="beat"?meter.beatSteps:Math.max(1,Math.round(steps)||1);
    const base=typeof steps==="string" ? from-meter.inside : 0;
    const at=Math.min(end,base+Math.ceil((from-base)/grid)*grid);
    return {step:at===end?0:at,time:nextT+seconds(App.P,at)-seconds(App.P,from)};
  };

  /* Offline and file events share the same clip clocks, timing offsets and chords. */
  async function renderSong({stems,project,range}={}) {
    const P=JSON.parse(JSON.stringify(project || App.P)), layout=plan(P), scenes=App.Scenes?.session?.(P);
    const end=range ? range.to : layout.total, from=range ? range.from : 0;
    if (![from,end].every(Number.isFinite) || from<0 || end<=from || end>layout.total+1e-6) throw Error("SELECT A RANGE INSIDE THE ARRANGEMENT");
    const steps=Math.ceil(end), span=seconds(P,end), sr=App.E?.ctx.sampleRate || 48000;
    await App.compLagReady;
    const lag=stems?.length ? 0 : 2*App.compLagFrames(sr); // compressor and limiter on the master; stems are taken before them
    // The render ends when the sound does: reverb, then the delay line ringing down 60 dB, then the longest release in use.
    const echo=P.tracks.some(t=>t.dly>0) ? (()=>{
      const dt=clamp([0.125,1/6,0.25,1/3,0.375,0.5,2/3,0.75,1,2][P.fx.dtime]*60/P.bpm,.01,2.4);
      return P.fx.dfb>0.001 ? 2*dt*Math.log(.001)/Math.log(P.fx.dfb) : 2*dt;
    })() : 0;
    const release=1.5*Math.max(0,...P.tracks.map(t=>t.kind!=="kit" && t.clips.some(c=>c.length) ? t[t.kind].ar||0 : 0));
    const naturalTail=Math.min(30,Math.max(Math.min(12,1.5+P.fx.rsize),echo,release,App.Rack?.tailSeconds?.(P)||0,App.SignalWorkshop?.impulseDuration(P)||0));
    const tail=range ? clamp(Number(range.tail)||0,0,30) : naturalTail;
    if (span > 1200) throw Error("LONGER THAN 20 MIN");
    // Start at project zero to reconstruct previous sounding notes, envelopes and effects.
    const PRE=.3, until=PRE+span, channels=stems?.length ? stems.length*2 : 2, frames=Math.ceil((until+tail)*sr)+lag;
    if(stems?.length && frames*channels*4>768*1024*1024)throw Error("SELECT FEWER STEMS OR SHORTEN ARRANGEMENT");
    const ctx=new OfflineAudioContext(channels,frames,sr);
    const E=App.Engine(ctx,()=>P,{offline:true,stems});
    if(range)E.renderUntil=until;
    E.syncAll();
    const events=eventQueue(E,P);
    const output=range ? {
      cut:(ti,t)=>{if(t<until)events.cut(ti,t);},
      note:e=>{if(e.time<until)events.note({...e,duration:Math.min(e.duration,until-e.time)});}
    } : events;
    E.restartLfos(PRE); // same alignment as live playback: LFOs begin with the first step
    // Feed a long render in musical order through ONE context. A short lead
    // before each suspension leaves room for render-quantum rounding. Voices,
    // envelopes, delay lines and convolution tails live across every window.
    let t = PRE, windowEnd = PRE + 8, rendering;
    const canSuspend = typeof ctx.suspend === "function" && typeof ctx.resume === "function";
    // A negative groove offset can place a note from the next grid cell before
    // the selection end. Read that cell's events without advancing FX into the tail.
    const windows=steps+Number(!!range && steps<layout.total);
    for(let at=0;at<windows;at++) {
      const engine=at<steps?E:{};
      const sd=duration(P,at);
      if(at<steps && canSuspend && t>=windowEnd) {
        const paused=ctx.suspend(t-.25);
        if(!rendering)rendering=ctx.startRendering();else await ctx.resume();
        await Promise.race([paused,rendering]);E.collectEnded();windowEnd=t+8;
      }
      const frame=position(P,layout,at);
      engine.tempo?.(C().bpm(P,at),C().meter(P,at).width,t);
      if(at<steps)App.Scenes?.schedule?.(E,scenes,at,t,t+sd,frame.lanes);
      emit(engine,App.Scenes?.projectAt?.(scenes,at)||P,frame.pat,frame.step,t+swingOf(P,at+(layout.source==="take"?P.performance.take.origin:0),sd),sd,{slots:layout.chain?layout.slots:null,arrangementSteps:layout.total,mapTime:true,runStep:at,absoluteStep:at,lanes:frame.lanes,changes:frame.changes,output,floor:PRE});
      if(at<steps)App.AudioStudio?.schedule(E,P,at,t,sd,at===0);
      events.flush(t+sd-.5*duration(P,at+1));t+=sd;
    }
    if(layout.source==="take")P.tracks.forEach((_,ti)=>events.cut(ti,range?until:t));
    events.flush();
    if (!rendering) rendering = ctx.startRendering(); else await ctx.resume();
    return {full:await rendering, cut:Math.round((PRE+seconds(P,from)) * sr)+lag};
  }
  Seq.projectSteps=P=>plan(P).total;
  Seq.renderSong=renderSong;
  Seq.bounce = async () => {
    const {full,cut} = await renderSong();
    const out = new AudioBuffer({ length: full.length - cut, sampleRate: full.sampleRate, numberOfChannels: 2 });
    for (let c = 0; c < 2; c++) out.getChannelData(c).set(full.getChannelData(c).subarray(cut));
    return out;
  };
  Seq.bounceWav = async () => {
    const {full,cut} = await renderSong();
    return {blob:App.wav(full,cut), duration:(full.length - cut) / full.sampleRate, sampleRate:full.sampleRate};
  };

  // A loop file is exactly as long as the music. What rings on after the end is laid back over the start, where it
  // would be on the second time round, so the file repeats without a gap or a cut tail. The sum can pass full
  // scale, and is then turned down to fit.
  Seq.bounceLoop = async () => {
    const {full,cut} = await renderSong(), P = App.P, sr = full.sampleRate;
    const n = Math.max(1, Math.round(seconds(P, plan(P).total) * sr)), rest = Math.max(0, full.length - cut - n);
    const out = new AudioBuffer({ length: n, sampleRate: sr, numberOfChannels: 2 });
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const src = full.getChannelData(c).subarray(cut), dst = out.getChannelData(c);
      for (let i = 0; i < src.length; i++) dst[i % n] += src[i];
      for (let i = 0; i < n; i++) { const a = Math.abs(dst[i]); if (a > peak) peak = a; }
    }
    const gain = peak > 1 ? 0.999 / peak : 1;
    if (gain < 1) for (let c = 0; c < 2; c++) { const d = out.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= gain; }
    return { blob: App.wav(out, 0), duration: n / sr, frames: n, sampleRate: sr, folded: rest / sr, trim: 20 * Math.log10(gain) };
  };

  /* ── standard MIDI file, format 1, one track per console track ── */
  Seq.midi = () => {
    const P=App.P, layout=plan(P), list=layout.source==="arrangement" ? layout.list : Array.from({length:8},(_,i)=>i), TPS = 240, sd = 15 / P.bpm, GM = [36, 38, 39, 42, 46, 45, 37, 56];
    const vlq = (n) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
    const be = (n, k) => Array.from({ length: k }, (_, i) => (n >>> (8 * (k - 1 - i))) & 255);
    const txt = (s) => [...s].map((c) => (c.charCodeAt(0) < 128 && c.length === 1 ? c.charCodeAt(0) : 63)); // non-ASCII → "?"
    const chunk = (id, d) => [...txt(id), ...be(d.length, 4), ...d];
    const track = (name, evs, endTick, port = 0) => {
      const order = status => (status & 0xf0) === 0x90 ? 2 : (status & 0xf0) === 0xb0 ? 1 : 0;
      evs.sort((a, b) => a[0] - b[0] || order(a[1]) - order(b[1]));
      const nb = txt(name).slice(0, 100), d = [0, 0xff, 3, nb.length, ...nb];
      if (port) d.push(0, 0xff, 0x21, 1, port);
      let last = 0;
      for (const e of evs) { d.push(...vlq(e[0] - last), ...e.slice(1)); last = e[0]; }
      d.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0);
      return chunk("MTrk", d);
    };
    const endTick=layout.total*TPS, conductor=[];
    let previousTempo,previousSig;
    for(let s=0;s<layout.total;s++) {
      const micros=Math.round(4e6*duration(P,s)), sig=C().meter(P,s).sig;
      if(micros!==previousTempo) { conductor.push([s*TPS,0xff,0x51,3,...be(micros,3)]);previousTempo=micros; }
      if(sig!==previousSig) {
        const [num,den]=App.SIGS[sig];
        conductor.push([s*TPS,0xff,0x58,4,num,Math.log2(den),24,8]);previousSig=sig;
      }
    }
    const swingText = txt("MusicLab Swing " + P.swing);
    conductor.push([0, 0xff, 0x01, swingText.length, ...swingText]);
    let markerTick = 0, markerIndex=0;
    for (const pi of (layout.source==="arrangement" ? list : [])) {
      // A slot of empty bars is stored as pattern A with a rest flag: the file names it for what it is.
      const marker = txt(layout.slots[markerIndex]?.rest ? "MusicLab Rest" : "MusicLab Pattern " + String.fromCharCode(65 + pi));
      conductor.push([markerTick, 0xff, 0x06, marker.length, ...marker]);
      markerTick = layout.ends[markerIndex++] * TPS;
    }
    const tracks = [track(P.name, conductor, endTick)];
    const events = P.tracks.map(() => []);
    let channel = 0;
    const channels = P.tracks.map(T => T.kind === "kit" ? 9 : channel++);
    const CC = {vol:7, pan:10, filter:74, rev:91, dly:94};
    const previous = P.tracks.map(() => ({}));
    const mapped = P.tracks.map((T,ti) => App.automationKeys.filter(k => (layout.chain && P.songCurves?.[ti]?.[k]?.length) || list.some(pi => T.automation?.[pi]?.[k]?.points.length)));
    // Drum kits share MIDI channel 10. When they carry independent controller
    // streams, the port meta event keeps their controls on separate drum parts.
    const kitAutomation = P.tracks.some((T,ti) => T.kind === "kit" && mapped[ti].length);
    let kitPort = 0;
    const ports = P.tracks.map(T => T.kind === "kit" && kitAutomation ? kitPort++ : 0);
    const ccAt = (ti, key, tick, v) => {
      if(CC[key]==null)return;
      const value = key === "pan" && v <= .5 ? Math.round(128 * v) :
        key === "pan" ? Math.round(64 + (v - .5) * 126) : Math.round(127 * v);
      if (previous[ti][key] === value) return;
      previous[ti][key] = value;
      events[ti].push([tick, 0xb0 | channels[ti], CC[key], value]);
    };
    const noteOffs=P.tracks.map(()=>[]);
    const sink = { releaseClip(ti,time) {
      const tick=Math.round(time/sd*TPS);
      for (const off of noteOffs[ti]) if(off[0]>tick)off[0]=tick;
      noteOffs[ti]=[];
    }, play(ti, pitch, velocity, time, duration) {
      const note = P.tracks[ti].kind === "kit" ? GM[pitch - 36] : pitch;
      if (note == null) return;
      const c = channels[ti], start = Math.round(time / sd * TPS);
      const stop = Math.max(start + 1, Math.round((time + duration) / sd * TPS));
      const off=[stop,0x80|c,note,0];
      events[ti].push([start,0x90|c,note,Math.max(1,Math.round(velocity*127))],off);
      if(layout.source!=="arrangement")noteOffs[ti].push(off);
    }, automate(ti, T, lanes, s, start, end) {
      const from = Math.round(start / sd * TPS), to = Math.round(end / sd * TPS);
      for (const key of mapped[ti]) {
        const lane = lanes?.[key];
        if (!lane?.points.length) {
          ccAt(ti, key, from, App.curveBase(T, key));
          continue;
        }
        const linear = App.curveShape(lane, s) === "linear";
        const slices = linear ? 4 : 1;
        for (let j = 0; j < slices; j++) {
          const x = j / slices;
          ccAt(ti, key, Math.round(from + x * (to-from)), App.curveValue(lane, s + x));
        }
        // Preserve both sides of an instantaneous wrap / step within a ramp.
        const edge = App.curveValue(lane, s + 1), left = App.curveValue(lane, s + 1, edge, "left");
        if (linear && left !== edge) ccAt(ti, key, to - 1, left);
        ccAt(ti, key, to, edge);
      }
    } };
    const midiQueue=eventQueue(sink,P);
    for(let at=0;at<layout.total;at++){
      const frame=position(P,layout,at);
      emit(sink,P,frame.pat,frame.step,at*sd+swingOf(P,at+(layout.source==="take"?P.performance.take.origin:0),sd),sd,{slots:layout.chain?layout.slots:null,arrangementSteps:layout.total,runStep:at,absoluteStep:at,lanes:frame.lanes,changes:frame.changes,output:midiQueue});
      midiQueue.flush((at+.5)*sd);
    }
    if(layout.source==="take")P.tracks.forEach((_,ti)=>midiQueue.cut(ti,layout.total*sd));
    midiQueue.flush();
    P.tracks.forEach((T, ti) => {
      if (!events[ti].length) return;
      tracks.push(track(T.name, events[ti], endTick, ports[ti]));
    });
    return new Blob([new Uint8Array([...chunk("MThd", [0, 1, ...be(tracks.length, 2), ...be(TPS * 4, 2)]), ...tracks.flat()])], { type: "audio/midi" });
  };

  Seq.emit = emit;
})();
