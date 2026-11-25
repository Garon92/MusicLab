/* Independent clip clocks, quantized launches and editable performance arrangements. */
(() => {
  "use strict";
  const {h,btn} = App.UI;
  const limit = 8192;
  const int = (x,lo,hi,fallback) => Number.isFinite(x) ? App.clamp(Math.round(x),lo,hi) : fallback;
  const lane = (p=-1,start=0,offset=0) => ({p,start,offset});
  const memo = new WeakMap();
  let heads = [], pending = [], capture = null;
  const cleanEvent = (e,max) => e && Number.isInteger(e.t) && e.t >= 0 && e.t < 8 && Number.isInteger(e.p) && e.p >= -1 && e.p < 8
    ? {at:int(e.at,0,max-1,0),t:e.t,p:e.p,offset:int(e.offset,0,255,0)} : null;
  function normalize(events,steps) {
    const unique = new Map();
    for (const raw of events) {
      const e = cleanEvent(raw,steps);
      if (e) unique.set(e.at*8+e.t,e);
    }
    return Array.from(unique.values()).sort((a,b)=>a.at-b.at || a.t-b.t);
  }
  App.extendProject({load(P,raw) {
    const x = raw.performance || {}, t = x.take || {}, steps = int(t.steps,1,limit,16);
    P.performance = {
      source:["live","take"].includes(x.source) ? x.source : "arrangement",
      quant:["step","beat","bar"].includes(x.quant) ? x.quant : "bar",
      active:Array.from({length:8},(_,i)=>int(x.active?.[i],-1,7,-1)),
      loops:Array.from({length:8},(_,i)=>Array.from({length:8},(_,p)=>int(x.loops?.[i]?.[p],0,256,0))),
      bars:int(x.bars,1,64,4),
      take:{steps,origin:int(t.origin,0,0x7fffffff,0),events:normalize(Array.isArray(t.events) ? t.events.slice(0,limit*8) : [],steps)}
    };
  }});
  function length(P,ti,pi) {
    return P.performance?.loops[ti]?.[pi] || App.patSteps(P,pi);
  }
  function reset() { heads=[]; pending=[]; capture=null; }
  function start(P) { heads=P.performance.active.map(p=>lane(p)); pending=[]; }
  function quantSteps(P) { return ["bar","beat"].includes(P.performance.quant) ? P.performance.quant : 1; }
  function source(value) {
    const P=App.P, running=App.Seq.playing;
    if (P.performance.source === value) return;
    if (running) App.Seq.stop();
    P.performance.source=value;
    App.commit();
    if (running) App.Seq.play();
    App.Top.sync(); App.Mx.sync();
  }
  function launch(tracks,p) {
    const P=App.P, S=P.performance;
    if (S.source !== "live" && App.Seq.playing) App.Seq.stop();
    S.source="live";
    if (App.Seq.playing) {
      const due=App.Seq.nextGrid(quantSteps(P)).step;
      pending=pending.filter(e=>!tracks.includes(e.t));
      for (const t of tracks) pending.push({at:due,t,p,offset:0});
    }
    for (const t of tracks) S.active[t]=p;
    App.commit();
    if (!App.Seq.playing && p >= 0) App.Seq.play();
    App.Top.sync();
  }
  function readTake(take,at) {
    let byTrack=memo.get(take);
    if (!byTrack) {
      byTrack=Array.from({length:8},()=>[]);
      take.events.forEach(e=>byTrack[e.t].push(e));
      memo.set(take,byTrack);
    }
    return byTrack.map(list=>{
      let lo=0,hi=list.length;
      while (lo<hi) { const mid=(lo+hi)>>1; if (list[mid].at<=at) lo=mid+1; else hi=mid; }
      const e=list[lo-1];
      return e ? lane(e.p,e.at,e.offset) : lane();
    });
  }
  function positions(P,banks,at) {
    return banks.map((c,t)=>{
      if(c.p<0)return null;
      const n=length(P,t,c.p), elapsed=at-c.start+c.offset;
      return {p:c.p,s:elapsed%n,n,pass:1+Math.floor(elapsed/n)};
    });
  }
  function frames(P,at,live=false) {
    const S=P.performance;
    if (S.source === "take") return positions(P,readTake(S.take,at),at);
    if (S.source !== "live") return null;
    if (!live) return positions(P,S.active.map(p=>lane(p)),at);
    if(heads.length!==8)start(P);
    if (capture && capture.from==null) {
      capture.from=at;
      heads.forEach((c,t)=>{ if (c.p>=0) capture.events.push({at:0,t,p:c.p,offset:(at-c.start+c.offset)%length(P,t,c.p)}); });
    }
    if (capture && at-capture.from>=limit) finish(at);
    for (const e of pending.filter(e=>e.at<=at)) {
      heads[e.t]=lane(e.p,at);
      if (capture) capture.events.push({...e,at:at-capture.from});
    }
    pending=pending.filter(e=>e.at>at);
    return positions(P,heads,at);
  }
  function transitions(P,at,live) {
    const S=P.performance;
    if(S.source==="arrangement")return [];
    if(at===0 || (S.source==="take" && at===S.take.steps))return [0,1,2,3,4,5,6,7];
    const clocks=S.source==="take" ? readTake(S.take,at) : live ? heads : [];
    return clocks.flatMap((c,i)=>c.start===at?[i]:[]);
  }
  function record() {
    if (capture) { finish(); return; }
    if (App.P.performance.source !== "live") source("live");
    capture={from:null,events:[]};
    if (!App.Seq.playing) App.Seq.play();
  }
  function finish(end) {
    if (!capture) return;
    const c=capture; capture=null;
    if (c.from==null) return;
    const at=end ?? ((App.Seq.frame()?.absoluteStep ?? c.from)+1);
    const steps=int(at-c.from,1,limit,1);
    App.P.performance.take={steps,origin:c.from,events:normalize(c.events.filter(e=>e.at<steps),steps)};
    App.commit(); App.UI.msg("PERFORMANCE RECORDED · "+steps+" STEPS");
  }
  const field = (label,control) => h("label.pf-field",null,h("span",{text:label}),control);
  function select(label,options,value,onchange) {
    const el=h("select",{"aria-label":label},options.map(([v,text])=>h("option",{value:v,text})));
    el.value=value;
    if (onchange) el.onchange=()=>onchange(el.value);
    return el;
  }
  const num=(label,min,max,value)=>h("input",{type:"number","aria-label":label,min,max,step:1,value});
  function open(initial="launcher") {
    const P=App.P,S=P.performance,node=App.Workspace.begin("Live performance"),body=h("div.dlg-body.pf-body"),stage=h("div.pf-stage");
    let tab=initial==="take"?"take":"launcher",focusT=P.sel.t,focusP=P.sel.p,update=()=>{};
    const mode=select("Transport source",[["arrangement","Pattern / song"],["live","Live clips"],["take","Performance take"]],S.source,source);
    const tabs=select("Performance view",[["launcher","Clip launcher"],["take","Edit recorded take"]],tab,v=>{tab=v;render();});
    const done=btn("Close","Return to the console",()=>node.close());
    body.append(h("h2",{text:"Live performance"}),h("div.pf-line",null,field("Transport",mode),field("View",tabs)),stage,h("div.dlg-buttons",null,done));
    function launcher() {
      const grid=h("div.pf-grid",{"aria-label":"Live clip launcher"}),cells=[];
      grid.append(h("span",{text:"SCENE"}));
      const indices=Array.from({length:8},(_,i)=>i);
      for (const p of indices) grid.append(btn(App.PATS[p],"Launch this column on all tracks",()=>launch(indices,p)));
      grid.append(h("span"));
      for (const t of indices) {
        grid.append(h("span.pf-track",{text:App.pad2(t+1)+" "+P.tracks[t].name}));
        for (const p of indices) {
          const b=btn(App.PATS[p],"Launch clip · Shift-click selects its loop length",e=>{
            focusT=t; focusP=p; loop.value=S.loops[t][p]; target.textContent=App.pad2(t+1)+" / "+App.PATS[p];
            if (!e.shiftKey) launch([t],p);
            sync();
          });
          b.setAttribute("aria-label","Launch track "+(t+1)+" clip "+App.PATS[p]);
          b.classList.toggle("pf-filled",!!P.tracks[t].clips[p].length);
          cells.push({b,t,p}); grid.append(b);
        }
        grid.append(btn("■","Stop track "+(t+1)+" at the launch boundary",()=>launch([t],-1)));
      }
      const quant=select("Launch quantization",[["step","1 step"],["beat","1 beat"],["bar","1 bar"]],S.quant,v=>{S.quant=v;App.commit();});
      const loop=num("Clip loop steps",0,256,S.loops[focusT][focusP]);
      const target=h("b",{text:App.pad2(focusT+1)+" / "+App.PATS[focusP]});
      loop.onchange=()=>{S.loops[focusT][focusP]=int(loop.valueAsNumber,0,256,0);loop.value=S.loops[focusT][focusP];App.commit();App.Ed.sync();App.Mx.sync();};
      const bars=num("Live export bars",1,64,S.bars);
      bars.onchange=()=>{S.bars=int(bars.valueAsNumber,1,64,4);bars.value=S.bars;App.commit();};
      const rec=btn("Record take","Record track launches, stops and loop phase into the performance arrangement",()=>{record();sync();});
      function sync() {
        const frame=App.Seq.frame();
        if(mode.value!==S.source)mode.value=S.source;
        for (const {b,t,p} of cells) {
          b.classList.toggle("pf-playing",!!(S.source==="live" && frame?.lanes?.[t]?.p===p));
          b.classList.toggle("pf-queued",!!pending.find(e=>e.t===t&&e.p===p));
          const pressed=String(S.source==="live" && S.active[t]===p);
          if(b.getAttribute("aria-pressed")!==pressed)b.setAttribute("aria-pressed",pressed);
        }
        const label=capture?"Finish take":"Record take";
        if(rec.textContent!==label)rec.textContent=label;
        rec.classList.toggle("pf-record",!!capture);
      }
      stage.append(grid,h("div.pf-line",null,field("Launch on",quant),target,field("Loop steps · 0 = pattern",loop)),
        h("div.pf-line",null,rec,field("Live export bars",bars)));
      update=sync;sync();
    }
    function arrangement() {
      const draft=S.take.events.map(e=>({...e})),steps=num("Performance length in steps",1,limit,S.take.steps);
      const list=h("select.pf-take-list",{size:7,"aria-label":"Launch events"}),at=num("Event step",1,limit,1),offset=num("Clip start offset",0,255,0);
      const track=select("Event track",P.tracks.map((t,i)=>[i,App.pad2(i+1)+" "+t.name]),0);
      const clip=select("Event clip",[[-1,"Stop track"],...Array.from(App.PATS,(p,i)=>[i,"Clip "+p])],0);
      const status=h("output",{text:""});
      function draw(i=0) {
        list.replaceChildren(...draft.map((e,j)=>h("option",{value:j,text:"STEP "+String(e.at+1).padStart(4,"0")+"   "+App.pad2(e.t+1)+" "+P.tracks[e.t].name+"   "+(e.p<0?"STOP":"CLIP "+App.PATS[e.p]+"  +"+e.offset)})));
        list.selectedIndex=Math.min(i,draft.length-1); read();
      }
      function read() {const e=draft[list.selectedIndex];if (e) {at.value=e.at+1;track.value=e.t;clip.value=e.p;offset.value=e.offset;}}
      list.onchange=read;
      function put(replace) {
        if (!at.reportValidity()||!offset.reportValidity()) return;
        const e={at:at.valueAsNumber-1,t:+track.value,p:+clip.value,offset:offset.valueAsNumber};
        if (replace && list.selectedIndex<0) return;
        if (replace) draft.splice(list.selectedIndex,1);
        const dup=draft.findIndex(x=>x.at===e.at&&x.t===e.t);if (dup>=0) draft.splice(dup,1);
        draft.push(e);draft.sort((a,b)=>a.at-b.at||a.t-b.t);
        steps.value=Math.max(+steps.value,e.at+1);draw(draft.indexOf(e));status.textContent="Edited";
      }
      const apply=btn("Apply take","Save edited performance as the transport arrangement",()=>{
        if (!steps.reportValidity()) return;
        if (draft.some(e=>e.at>=+steps.value)) {status.textContent="Move or remove events past the end first";return;}
        if (App.Seq.playing) App.Seq.stop();
        S.take={steps:+steps.value,origin:S.take.origin,events:normalize(draft,+steps.value)};S.source="take";App.commit();App.Top.sync();App.Mx.sync();mode.value="take";status.textContent="Saved";
      },"confirm-action");
      stage.append(list,h("div.pf-line",null,field("At step",at),field("Track",track),field("Launch",clip),field("Offset",offset)),
        h("div.pf-line",null,btn("Add","Insert a launch or stop",()=>put(false)),btn("Update","Replace selected event",()=>put(true)),
          btn("Remove","Remove selected event",()=>{const i=list.selectedIndex;if(i>=0){draft.splice(i,1);draw(i);status.textContent="Edited";}})),
        h("div.pf-line",null,field("Take length · steps",steps),apply,status));draw();update=()=>{};
    }
    function render() {stage.replaceChildren();if(tab==="take")arrangement();else launcher();}
    node.classList.add("pf-dialog");node.append(body);render();node.showModal();
    const timer=setInterval(()=>{if(App.P!==P){node.close();return;}update();},100);
    node.addEventListener("close",()=>clearInterval(timer),{once:true});
  }
  App.Live={open,length,start,reset,launch,source,record,finish,frames,transitions,field,select,num};
})();
