/* Cross-lane edits use explicit source intervals. Samples retain offsets into
   their original takes when cuts intersect a region, including repeated audio. */
(() => {
  "use strict";
  const C=()=>App.Conductor, copy=x=>JSON.parse(JSON.stringify(x)), eps=1e-7;
  const chordSize=(P,ch,at)=>ch.steps || C().barsAfter(P,at,ch.bars)-at;
  function chordList(P) {
    let at=0;return (P.harmony?.chords||[]).map(ch=>{const from=at;at+=chordSize(P,ch,at);return {ch,from,end:at};});
  }
  function preview(P,order) {
    const old=C().layout(P,P.chain), oldEnd=old.at(-1)?.end||0;
    const segs=[],slots=[];let cursor=0;
    for(const entry of order){
      const s=old[entry.old], from=s ? s.from+(entry.skip||0) : null;
      const len=entry.len || (s ? s.end-s.from : entry.rest ? C().barsAfter(P,cursor,entry.bars||1)-cursor :
        C().barsAfter(P,cursor,Math.min(P.pats[entry.p].bars,App.maxBars(P)))-cursor);
      const override=entry.rest ? {rest:true,offset:0,steps:len} : entry.len || entry.skip ? {rest:!!s?.rest,offset:(s?.offset||0)+(entry.skip||0),steps:len} : s ? P.arrangement.slots?.[entry.old] : null;
      slots.push(override ? {...override} : null);
      segs.push({from,len,to:cursor,entry});cursor+=len;
    }
    return {segs,slots,oldEnd,end:cursor};
  }
  // Adjacent source intervals make one continuous cut; this preserves original
  // fade curves, IDs and repeats whenever a region crosses unchanged slot edges.
  function joined(segs){
    const out=[];
    for(const s of segs){const p=out.at(-1);
      if(p && p.from!=null && s.from!=null && p.from+p.len===s.from && p.to+p.len===s.to)p.len+=s.len;
      else out.push({...s});
    }return out;
  }
  function relocate(P,order) {
    // The first explicit rest before a stand-alone composition gives that
    // composition its own slot, so its recordings move with its notes.
    if(!P.chain.length && order.some(e=>e.rest) && (P.audio.regions.length || P.harmony.chords.length || App.SongCurves.end(P) ||
        P.tracks.some(t=>t.clips[P.sel.p].length || Object.keys(t.automation[P.sel.p]).length))) {
      P.chain=[P.sel.p];P.arrangement.slots=[null];order=[...order,{p:P.sel.p,old:0}];
    }
    const plan=preview(P,order), chain=order.map(e=>e.p), A=P.arrangement;
    const unchanged=order.length===P.chain.length && order.every((e,i)=>e.old===i && !e.skip && !e.len && !e.rest);
    if(unchanged || !P.chain.length) {
      P.chain=chain;A.slots=plan.slots;
      return;
    }
    const old={...P,arrangement:{...A},chain:P.chain.slice()}, Cn=C();
    const split=joined([...plan.segs,{from:plan.oldEnd,to:plan.end,len:Infinity}]);
    const points=(list,part)=>list.filter(e=>e.at>=part.from && e.at<part.from+part.len).map(e=>({...e,at:part.to+e.at-part.from}));
    function transportMap(list,kind) {
      if(!list.length)return [];
      const result=new Map();
      for(let i=0;i<split.length;i++) {
        const part=split[i], src=part.from ?? split.slice(i+1).find(x=>x.from!=null)?.from ?? plan.oldEnd;
        const row=kind==="tempo" ? {at:part.to,bpm:Cn.bpm(old,src),ramp:part.from!=null && Cn.cache(old).times.findLast(e=>e.at<=src).ramp}
          : {at:part.to,sig:Cn.meter(old,src).sig};
        const prev=split[i-1];
        if(kind==="tempo" && prev && prev.from!=null) {
          const e=Cn.cache(old).times.filter(e=>e.at<prev.from+prev.len).at(-1);
          if(e?.ramp)row.inBpm=e.bpm+e.slope*(prev.from+prev.len-e.at);
        }
        const aligned=part.from!=null ? points(list,part) : [];
        result.set(row.at,row);
        for(const p of aligned)result.set(p.at,p.at===row.at?{...row,...p}:p);
      }
      const out=[...result.values()].sort((a,b)=>a.at-b.at);
      return kind==="tempo" ? out : out.filter((e,i)=>!i || out[i-1].sig!==e.sig || Cn.position(old,split.find(p=>p.to===e.at)?.from||0).inside!==0);
    }
    const regions=[];
    for(const r of P.audio.regions) {
      let kept=false;
      const onset=Cn.time(old,r.at), finish=onset+r.len*r.repeats, rEnd=Cn.step(old,finish);
      for(const part of split) {
        if(part.from==null || part.from>=rEnd-eps || part.from+part.len<=r.at+eps)continue;
        const left=Math.max(r.at,part.from),right=Math.min(rEnd,part.from+part.len);
        if(left<=r.at+eps && right>=rEnd-eps){
          regions.push({...copy(r),id:kept?App.uid():r.id,at:part.to+r.at-part.from});kept=true;continue;
        }
        const a=Math.max(0,Cn.time(old,left)-onset),b=Math.min(finish-onset,Cn.time(old,right)-onset);
        for(let k=Math.floor((a+eps)/r.len);k<r.repeats && k*r.len<b-eps;k++){
          const start=Math.max(k*r.len,a), end=Math.min((k+1)*r.len,b),skip=start-k*r.len;
          if(end-start<.001)continue;
          regions.push({...copy(r),id:kept?App.uid():r.id,at:part.to+Cn.step(old,onset+start)-part.from,len:end-start,repeats:1,
            takes:r.takes.map(t=>({...t,offset:t.offset+skip})),fin:Math.max(0,r.fin-skip),fout:Math.max(0,r.fout-(r.len-(end-k*r.len)))});
          kept=true;
        }
      }
    }
    if(regions.length>2048 || regions.some(r=>r.at>8192))throw Error("Edit exceeds audio timeline capacity");
    const sourceChords=chordList(old), cycle=sourceChords.at(-1)?.end||0, chords=[];
    if(cycle) {
      const add=(ch,len)=>{if(len<=0)return;const last=chords.at(-1);
        if(last && !!last.rest===!!ch.rest && last.root===ch.root && last.type===ch.type)last.steps+=len;
        else chords.push({...ch,bars:1,steps:len});
      };
      for(const part of split) {
        if(part.from==null){add({rest:true,root:0,type:"maj"},part.len);continue;}
        const end=Number.isFinite(part.len) ? part.from+part.len : Math.max(part.from,cycle,plan.oldEnd);
        for(let t=part.from;t<end;){
          const pos=t%cycle,c=sourceChords.find(c=>pos<c.end),n=Math.min(end-t,c.end-pos);add(c.ch,n);t+=n;
        }
      }
      if(chords.length>1024)throw Error("Edit exceeds chord timeline capacity");
    }
    const take=P.performance.take, events=[];
    const materialEnd=split.reduce((n,s)=>s.from!=null && s.from<take.steps ? Math.max(n,s.to+Math.min(s.len,take.steps-s.from)) : n,0);
    if(take.events.length) for(const part of split) {
      if(part.to>=materialEnd)break;
      for(let t=0;t<8;t++) {
        const prior=part.from!=null && part.from<take.steps ? take.events.findLast(e=>e.t===t && e.at<=part.from) : null;
        const p=prior?.p??-1;
        events.push({at:part.to,p,t,offset:p<0?0:(prior.offset+part.from-prior.at)%App.Live.length(P,t,p)});
      }
      if(part.from!=null)events.push(...points(take.events,part).filter(e=>e.at>part.to));
    }
    const tempo=transportMap(A.tempo,"tempo"),meters=transportMap(A.meters,"meter");
    if(tempo.length>16384 || meters.length>16384 || events.length>65536 || (events.length && materialEnd>8192))throw Error("Edit exceeds conductor or performance capacity");
    const sections=[];
    for(const s of A.sections) {
      for(let i=0;i<order.length;) {
        if(!(order[i].old>=s.first && order[i].old<s.first+s.count)){i++;continue;}
        const first=i++;
        while(i<order.length && order[i].old>=s.first && order[i].old<s.first+s.count && (order[i].old>order[i-1].old || order[i].old===order[i-1].old && order[i].skip>order[i-1].skip))i++;
        sections.push({...s,first,count:i-first});
      }
    }
    const cues=P.scenes?.cues && split.filter(s=>s.from!=null).flatMap(s=>points(P.scenes.cues,s));
    if(cues?.length>256 || cues?.some(c=>c.at>=65536) || sections.length>32)throw Error("Edit exceeds scene or section capacity");
    P.songCurves=App.SongCurves.relocate(P,split);
    P.chain=chain;Object.assign(A,{slots:plan.slots,tempo,meters,sections});P.audio={regions};
    P.harmony={...P.harmony,chords:cycle?chords:[]};
    if(events.length || take.events.length)P.performance.take={...take,steps:Math.max(1,materialEnd),events:events.sort((a,b)=>a.at-b.at || a.t-b.t)};
    if(cues)P.scenes.cues=cues;
  }
  App.Arrangement={preview,relocate,chordList};
})();
