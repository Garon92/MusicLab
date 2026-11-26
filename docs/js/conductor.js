/* Absolute song positions are sixteenths. Tempo is linear in musical time;
   integrating its reciprocal keeps every audio and MIDI event on the same map. */
(() => {
  "use strict";
  const LAST=65536, memo=new WeakMap();
  const bounded=(n,a,b,f)=>Number.isFinite(n)?App.clamp(n,a,b):f;
  const sorted=(rows,read)=>{
    const byStep=new Map();
    for(const raw of Array.isArray(rows)?rows.slice(0,16384):[]) {
      if(!raw || !Number.isInteger(raw.at) || raw.at<0 || raw.at>LAST) continue;
      const out=read(raw);if(out)byStep.set(raw.at,out);
    }
    return [...byStep.values()].sort((a,b)=>a.at-b.at);
  };
  App.extendProject({load(P,raw){
    const src=raw.arrangement||{};
    P.arrangement={
      tempo:sorted(src.tempo,e=>Number.isFinite(e.bpm)?{at:e.at,bpm:bounded(e.bpm,40,300,P.bpm),ramp:!!e.ramp,
        ...(Number.isFinite(e.inBpm)?{inBpm:bounded(e.inBpm,40,300,P.bpm)}:{})}:null),
      meters:sorted(src.meters,e=>Number.isInteger(e.sig)&&App.SIGS[e.sig]?{at:e.at,sig:e.sig}:null),
      slots:P.chain.map((_,i)=>{
        const s=src.slots?.[i];return s ? {offset:Math.round(bounded(s.offset,0,8192,0)),steps:Math.round(bounded(s.steps,0,8192,0)),rest:!!s.rest} : null;
      }),
      sections:(Array.isArray(src.sections)?src.sections:[]).slice(0,32).filter(s=>s && Number.isInteger(s.first) && s.first>=0 && s.first<P.chain.length)
        .map(s=>({name:String(s.name||"Section").trim().slice(0,32),first:s.first,count:Math.round(bounded(s.count,1,P.chain.length-s.first,1))}))
    };
    settle(P);
  }});
  const lookup=(list,x,key)=>{
    let lo=0,hi=list.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(list[mid][key]<=x)lo=mid+1;else hi=mid;}
    return list[Math.max(0,lo-1)];
  };
  function elapsed(bpm,slope,steps) {
    return Math.abs(slope)<1e-10 ? steps*15/bpm : 15*Math.log1p(steps*slope/bpm)/slope;
  }
  function cache(P) {
    const a=P.arrangement || {}, old=memo.get(P);
    if(old && old.tempo===a.tempo && old.meters===a.meters && old.bpm===P.bpm && old.sig===P.sig)return old;
    const tempos=[{at:0,bpm:P.bpm,ramp:false},...(a.tempo||[])], beats=[{at:0,sig:P.sig},...(a.meters||[])];
    if(tempos[1]?.at===0)tempos.shift();if(beats[1]?.at===0)beats.shift();
    let sec=0,bar=0;
    const times=tempos.map((e,i)=>{
      const next=tempos[i+1], slope=e.ramp && next?((next.inBpm??next.bpm)-e.bpm)/(next.at-e.at):0;
      const row={...e,sec,slope};if(next)sec+=elapsed(e.bpm,slope,next.at-e.at);return row;
    });
    const measures=beats.map((e,i)=>{
      const [n,d]=App.SIGS[e.sig],width=n*16/d,unit=d===4 ? 4 : n%3===0 ? 6 : 2;
      const r={...e,bar,width,unit};if(beats[i+1])bar+=Math.ceil((beats[i+1].at-e.at)/width);return r;
    });
    const result={tempo:a.tempo,meters:a.meters,bpm:P.bpm,sig:P.sig,times,measures};memo.set(P,result);return result;
  }
  function time(P,s) {
    if(!P.arrangement?.tempo.length || s<0)return s*15/(s<0 ? bpm(P,0) : P.bpm);
    const e=lookup(cache(P).times,s,"at");return e.sec+elapsed(e.bpm,e.slope,s-e.at);
  }
  function step(P,sec) {
    if(!P.arrangement?.tempo.length || sec<0)return sec*(sec<0?bpm(P,0):P.bpm)/15;
    const e=lookup(cache(P).times,sec,"sec");
    return e.at+(Math.abs(e.slope)<1e-10 ? (sec-e.sec)*e.bpm/15 : e.bpm*Math.expm1((sec-e.sec)*e.slope/15)/e.slope);
  }
  function bpm(P,s) {
    if(!P.arrangement?.tempo.length)return P.bpm;
    const e=lookup(cache(P).times,s,"at");return App.clamp(e.bpm+e.slope*(s-e.at),40,300);
  }
  function meter(P,s){return lookup(cache(P).measures,s,"at");}
  function position(P,s) {
    const e=meter(P,s), local=Math.max(0,s-e.at), inside=local%e.width;
    return {bar:e.bar+Math.floor(local/e.width),inside,beatSteps:e.unit,barSteps:e.width,sig:e.sig};
  }
  function barStart(P,bar) {
    const e=lookup(cache(P).measures,bar,"bar");return e.at+(bar-e.bar)*e.width;
  }
  function barsAfter(P,at,bars) {
    const pos=position(P,at);
    return barStart(P,pos.bar+bars)+pos.inside;
  }
  function layout(P,patterns,overrides=patterns===P.chain ? P.arrangement?.slots : null) {
    let at=0;
    return patterns.map((p,i)=>{
      const from=at;
      const slot=overrides?.[i];
      at=slot?.steps ? from+slot.steps : barsAfter(P,at,Math.min(P.pats[p].bars,App.maxBars(P)));
      return {p,from,end:at,offset:slot?.offset||0,rest:!!slot?.rest};
    });
  }
  // The tempo and the meter at bar 1 are the project's own BPM and SIG, the values the top bar shows and sets. A map
  // point on bar 1 is folded into them (a ramp that starts there stays, with the project value kept equal to it).
  function settle(P) {
    const a=P.arrangement;if(!a)return P;
    if(a.tempo[0]?.at===0){P.bpm=a.tempo[0].bpm;if(!a.tempo[0].ramp)a.tempo=a.tempo.slice(1);}
    if(a.meters[0]?.at===0){P.sig=a.meters[0].sig;a.meters=a.meters.slice(1);}
    return P;
  }
  App.Conductor={time,step,bpm,meter,position,barStart,barsAfter,layout,cache,settle};
})();
