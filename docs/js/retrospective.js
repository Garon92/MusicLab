/* Short, session-only history of notes the player actually performed, including with transport stopped. */
(() => {
  "use strict";
  const {h,btn}=App.UI,{select,field}=App.ClipWrite;
  const limit=4096, memorySeconds=600;
  let records=[],preview=null,previewId=0,previousPoint=null;
  function clock(){
    const ctx=App.E.ctx, f=App.Seq.frame(),now=ctx.currentTime;
    const frac=f?App.clamp((now-f.t)/f.span,0,1):0;
    const run=f ? App.Seq.runId : null,step=f ? (f.runStep??f.absoluteStep)+frac : null;
    const sd=f?.sd || 15/App.P.bpm, grid=step==null?null:swing(step,App.P.swing);
    const old=previousPoint;
    // Across a loop use the unwrapped musical counter. Across a transport restart
    // integrate the real pause rather than comparing positions from two runs.
    const delta=!old ? 0 : run!=null && run===old.run && grid>=old.grid ? grid-old.grid : Math.max(0,now-old.time)/old.sd;
    const point={time:now,metric:(old?.metric||0)+delta,run,grid,step,absolute:f ? f.absoluteStep+frac : null,sd,
      bar:(f && App.Conductor?.position(App.P,f.absoluteStep).barSteps) || App.spb(App.P)};
    previousPoint=point;return point;
  }
  function start(ti,n,v){
    const a=clock(),previous=records.at(-1);
    if(previous && previous.P!==App.P)records=[];
    while(records.length && (records.length>=limit || a.time-records[0].a.time>memorySeconds))records.shift();
    const entry={ti,n,v,a,P:App.P,b:null};records.push(entry);return entry;
  }
  function end(note){if(note && note.P===App.P)note.b=clock();}
  const swing=(s,amount)=>s+(Math.floor(s)%2===1 ? (1-(s%1)) : s%1)*amount/200;
  function phrase(ti,choice,align) {
    const raw=records.filter(r=>r.P===App.P && r.ti===ti && r.b && r.b.time>=r.a.time);
    if(!raw.length)return null;
    const last=raw.reduce((a,b)=>a.b.time>=b.b.time?a:b);
    const bar=last.a.bar,swingAmount=App.P.swing;
    let windowStart=-Infinity;
    let selected;
    if(choice==="phrase"){
      let i=raw.length-1,start=raw[i].a.metric;
      while(i>0){
        const before=raw[i-1];
        if(start-before.b.metric>before.a.bar || last.b.metric-before.a.metric>App.MAX_STEPS)break;
        i--;start=before.a.metric;
      }
      selected=raw.slice(i);
    }else{
      const steps=Math.min(App.MAX_STEPS,Number(choice)*bar);
      windowStart=last.b.metric-steps;
      selected=raw.filter(r=>r.b.metric>windowStart);
    }
    if(!selected.length)return null;
    const first=selected[0],start=Math.max(first.a.metric,windowStart);
    let barPhase=0;
    if(align && first.a.absolute!=null && start===first.a.metric){
      const meter=App.Conductor?.position(App.P,Math.floor(first.a.absolute));
      barPhase=Number.isFinite(meter?.inside)?meter.inside+first.a.absolute%1:first.a.absolute%bar;
    }
    const position=a=>{
      const x=Math.max(0,a.metric-start)+swing(barPhase,swingAmount),pair=Math.floor(x/2)*2,mid=1+swingAmount/200,r=x-pair;
      return pair+(r<=mid ? r/mid : 1+(r-mid)/(2-mid));
    };
    const notes=[];let extent=0;
    for(const r of selected){
      const pos=position(r.a);if(pos>=App.MAX_STEPS || pos<-.001)continue;
      const s=App.clamp(Math.round(pos),0,App.MAX_STEPS-1);
      const off=App.clamp(Math.round((swing(pos,swingAmount)-swing(s,swingAmount))*1000)/1000,-.49,.49);
      const l=App.clamp(Math.round(Math.max(.01,position(r.b)-pos)),1,App.MAX_STEPS-s);
      notes.push({s,n:r.n,v:r.v,p:1,l,...(off?{off}:{})}); extent=Math.max(extent,s+l);
    }
    const steps=Math.min(App.MAX_STEPS,Math.max(bar,Math.ceil(extent/bar)*bar));
    return notes.length ? {notes,steps,seconds:last.b.time-first.a.time} : null;
  }
  function clearPreview(){
    previewId++;if(preview){try{preview.stop();}catch{}preview.disconnect();preview=null;}
  }
  async function audition(ti,data){
    clearPreview();const token=previewId,project=App.P,E=App.audio(),P=App.sanitize(structuredClone(project));
    if(!E)return;
    P.sel={t:ti,p:0,pad:0};P.song=0;P.chain=[];P.audio.regions=[];
    P.arrangement={tempo:[],meters:[],slots:[],sections:[]};
    if(P.scenes?.cues)P.scenes.cues=[];
    P.performance.source="take";P.performance.loops[ti][0]=data.steps;
    P.performance.take={steps:data.steps,origin:0,events:[{t:ti,p:0,at:0,offset:0}]};
    P.tracks[ti].clips[0]=data.notes;P.tracks[ti].automation[0]={};
    P.tracks.forEach(t=>{t.solo=0;t.mute=0;});
    const {full,cut}=await App.Seq.renderSong({project:P});
    if(token!==previewId || project!==App.P)return;
    const node=E.ctx.createBufferSource();node.buffer=full;node.connect(E.ctx.destination);
    preview=node;node.onended=()=>{node.disconnect();if(preview===node)preview=null;};node.start(0,cut/full.sampleRate);
  }
  function open(){
    const P=App.P,node=App.Workspace.begin("Capture recent notes"),body=h("div.dlg-body");
    node.classList.add("tool-dialog","prod-dialog");
    const counts=P.tracks.map((_,t)=>records.filter(r=>r.ti===t && r.b && r.P===P).length);
    const initial=counts[P.sel.t] ? P.sel.t : records.filter(r=>r.P===P && r.b).at(-1)?.ti ?? P.sel.t;
    const track=select("Played track",P.tracks.map((t,i)=>[i,(i+1)+" · "+t.name+" ("+counts[i]+")"]),initial);
    const range=select("Capture range",[["phrase","Last phrase"],...[1,2,4,8,16].map(n=>[n,"Last "+n+" bar"+(n===1?"":"s")])],"phrase");
    const align=select("Clip alignment",[["bar","Keep played bar position"],["first","Start on first note"]],"bar");
    const target=select("Capture destination",[],""),summary=h("output.prod-summary"),graphic=h("canvas.prod-preview",{"aria-label":"Captured notes preview",role:"img"});
    const status=h("p.tool-status",{role:"status"});let data;
    const play=btn("Audition","Listen to the recovered phrase",async()=>{try{if(data)await audition(+track.value,data);}catch(e){status.textContent=e.message;}});
    const insert=btn("Create clip","Write the recovered notes to this free clip",()=>{
      try{if(!data || !target.value)throw Error("Select a free clip.");App.ClipWrite.write(+track.value,+target.value,data.notes,data.steps);node.close();App.UI.msg("RECENT PERFORMANCE CAPTURED");}
      catch(e){status.textContent=e.message;}
    },"confirm-action");
    function refresh(){
      clearPreview();const ti=+track.value;data=phrase(ti,range.value,align.value==="bar");
      const old=target.value;target.replaceChildren(...App.ClipWrite.targets(ti).map(([p,l])=>h("option",{value:p,text:l})));if([...target.options].some(o=>o.value===old))target.value=old;
      play.disabled=!data;insert.disabled=!data || !target.options.length;
      summary.textContent=data?data.notes.length+" notes · "+data.steps+" steps · "+data.seconds.toFixed(1)+" s":"No recent notes on this track";
      status.textContent=data && !target.options.length?"All eight clips on this track are occupied":"";
      const d=App.UI.fit(graphic),ctx=graphic.getContext("2d"),width=graphic.clientWidth,height=graphic.clientHeight;
      ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle=App.C.pn;ctx.fillRect(0,0,width,height);if(!data)return;
      const low=Math.min(...data.notes.map(n=>n.n))-1,high=Math.max(...data.notes.map(n=>n.n))+1,nh=height/(high-low+1);
      ctx.fillStyle=App.C.ln2;
      for(let s=0;s<data.steps;s+=App.beatSteps(P))ctx.fillRect(s*width/data.steps,0,1,height);
      ctx.fillStyle=App.C.t1;
      for(const nt of data.notes){ctx.globalAlpha=.3+.7*nt.v;ctx.fillRect((nt.s+(nt.off||0))*width/data.steps,(high-nt.n)*nh,Math.max(2,nt.l*width/data.steps-1),Math.min(8,nh));}
      ctx.globalAlpha=1;
    }
    track.onchange=range.onchange=align.onchange=refresh;
    body.append(h("h2",{text:"Capture recent notes"}),h("div.tool-fields",null,field("Source",track),field("Range",range),field("Start",align)),summary,graphic,
      h("div.tool-fields",null,field("Empty clip",target),play,insert),status,h("p.dlg-tip",{text:"CAPTURE RECOVERS WHAT WAS PLAYED ON THE KEYS OR MIDI WITHOUT RECORDING"}));
    node.append(body);node.showModal();refresh();node.addEventListener("close",clearPreview,{once:true});
  }
  App.Retrospective={start,end,open,mark(){if(records.length && App.E)clock();},rebind(){clearPreview();for(const r of records)r.P=App.P;},reset(){clearPreview();records=[];previousPoint=null;}};
})();
