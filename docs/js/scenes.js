/* Selective setting snapshots and reproducible song cues. Timeline evaluation never writes to the saved project. */
(() => {
  "use strict";
  const {h,btn}=App.UI, {clamp}=App;
  const parts={mix:"Level, pan & sends",device:"Instrument controls",macros:"Macros",effects:"Inserts, splits & EQ",master:"Master EQ, delay & dynamics"};
  const mixKeys=["vol","pan","dly","rev"], masterKeys=["vol","low","mid","high","comp","dfb","dtone","dwid"];
  const clip=(v,lo,hi,def)=>Number.isFinite(v)?clamp(v,lo,hi):def;
  const copy=v=>JSON.parse(JSON.stringify(v));
  const fieldMap=new Map();
  function descriptor(path) {
    if(fieldMap.has(path))return fieldMap.get(path);
    const keys=path.split("."),[top,i,sub,a,b,c]=keys;
    const index=Number(i);
    let def=null, part, ti=index, type="number";
    const isIndex=(k,n)=>/^\d+$/.test(k) && Number(k)<n;
    if(top==="fx" && keys.length===2 && masterKeys.includes(i)){def=App.DEF.fx[i];part="master";ti=-1;}
    if(top==="tracks" && isIndex(i,8)){
      if(keys.length===3 && sub==="kind"){type="kind";part="device";}
      if(keys.length===3 && mixKeys.includes(sub)){def=App.DEF.trk[sub];part="mix";}
      if(keys.length===4 && ["syn","smp","arp"].includes(sub) && Object.hasOwn(App.DEF[sub],a)){
        def=App.DEF[sub][a];part="device";
      }
      if(keys.length===6 && sub==="kit" && a==="pads" && isIndex(b,8) && Object.hasOwn(App.DEF.pad,c)){def=App.DEF.pad[c];part="device";}
    }
    if(top==="rack" && i==="groups" && isIndex(sub,4) && keys.length===4 && ["chain","split"].includes(a)){
      ti=8+Number(sub);type=a;part="effects";
    }
    if(top==="rack" && i==="strips" && isIndex(sub,8)){
      ti=Number(sub);
      if(a==="macros" && keys.length===5 && isIndex(b,4)){def={min:0,max:1};part="macros";}
      if((a==="chain" || a==="split") && keys.length===4){type=a;part="effects";}
      if(a==="eq"){
        if(keys.length===5 && b==="on"){type="boolean";part="effects";}
        if(keys.length===7 && b==="bands" && isIndex(c,4)){
          const name=keys[6];
          if(name==="on")type="boolean";
          else if(["hz","q","db"].includes(name))def={hz:{min:20,max:20000,c:"exp"},q:{min:.15,max:18,c:"exp"},db:{min:-18,max:18}}[name];
          if(def || name==="on")part="effects";
        }
      }
    }
    if(!part)return null;
    const d={keys,ti,part,def,type};
    fieldMap.set(path,d);return d;
  }
  const get=(P,keys)=>keys.reduce((o,k)=>o?.[k],P);
  const set=(P,keys,val)=>{let o=P;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)]=val;};
  const allowedFx=new Set(["lowpass","highpass","lowshelf","highshelf","saturate","compress"]);
  function safeValue(d,x) {
    if(d.type==="split")return x && typeof x==="object" && !Array.isArray(x)?App.Rack.cleanSplit(x):undefined;
    if(d.type==="chain")return Array.isArray(x)?x.slice(0,8).filter(f=>f && allowedFx.has(f.type)).map(f=>({type:f.type,value:clip(f.value,0,1,.5),on:f.on!==false})):undefined;
    if(d.type==="boolean")return typeof x==="boolean"?x:undefined;
    if(d.type==="kind")return ["syn","smp","kit"].includes(x)?x:undefined;
    if(!Number.isFinite(x))return;
    let v=clamp(x,d.def.min,d.def.max);
    return d.def.int || d.def.opts || d.def.bool?Math.round(v):v;
  }
  function cleanValues(input) {
    const result={};
    if(input && typeof input==="object") for(const [key,x] of Object.entries(input).slice(0,3500)){
      const d=descriptor(key);if(!d)continue;
      const v=safeValue(d,x);if(v!==undefined)result[key]=v;
    }
    return result;
  }
  const validId=id=>typeof id==="string" && /^[a-z\d_-]{1,64}$/i.test(id);
  App.extendProject({load(P,raw) {
    const src=raw.scenes || {},items=[],ids=new Set();
    for(const s of (Array.isArray(src.items)?src.items:[]).slice(0,32)){
      if(!s || !validId(s.id) || ids.has(s.id))continue;
      const values=cleanValues(s.values);
      if(!Object.keys(values).length)continue;
      items.push({id:s.id,name:String(s.name||"Scene").trim().slice(0,36)||"Scene",values});ids.add(s.id);
    }
    const cues=(Array.isArray(src.cues)?src.cues:[]).slice(0,256).filter(c=>c && ids.has(c.id) && Number.isInteger(c.at) && c.at>=0 && c.at<65536)
      .map(c=>({at:c.at,id:c.id,bars:clip(c.bars,0,32,0)})).sort((a,b)=>a.at-b.at);
    P.scenes={items,cues};
  }});

  function capture(P,tracks,groups) {
    const values={};
    const add=(path)=>{const d=descriptor(path),v=d && get(P,d.keys);if(v!==undefined && d)values[path]=copy(v);};
    const block=(path,keys)=>keys.forEach(k=>add(path+"."+k));
    for(const i of tracks){
      if(i>=8 && i<12) {
        if(groups.includes("effects"))block("rack.groups."+(i-8),["chain","split"]);
        continue;
      }
      const T=P.tracks[i];if(!T)continue;
      const t="tracks."+i,r="rack.strips."+i;
      if(groups.includes("mix"))block(t,mixKeys);
      if(groups.includes("device")){
        add(t+".kind");
        if(T.kind==="kit")T.kit.pads.forEach((_,n)=>block(t+".kit.pads."+n,Object.keys(App.DEF.pad)));
        else {block(t+"."+T.kind,Object.keys(App.DEF[T.kind]));if(T.kind==="syn")block(t+".arp",Object.keys(App.DEF.arp));}
      }
      if(groups.includes("effects")){
        add(r+".chain");add(r+".split");add(r+".eq.on");
        for(let b=0;b<4;b++)block(r+".eq.bands."+b,["hz","db","q","on"]);
      }
      if(groups.includes("macros"))block(r+".macros",[0,1,2,3]);
    }
    if(groups.includes("master"))block("fx",masterKeys);
    return values;
  }
  function blend(d,a,b,x) {
    if(x<=0)return a;if(x>=1)return b;
    if(d.type!=="number" || d.def.bool || d.def.opts)return a;
    const v=d.def.c==="exp" && a>0 && b>0?a*(b/a)**x:a+(b-a)*x;
    return d.def.int?Math.round(v):v;
  }
  const fraction=(event,at)=>event.end===event.at?1:clamp((at-event.at)/(event.end-event.at),0,1);
  function lastEvent(events,at) {
    let left=0,right=events.length;
    while(left<right){const mid=(left+right)>>1;if(events[mid].at<=at)left=mid+1;else right=mid;}
    return events[left-1];
  }
  function current(line,step) {
    const event=lastEvent(line.events,step);
    return event?blend(line.d,event.from,event.to,fraction(event,step)):line.base;
  }
  function chainMix(line,step) {
    const event=lastEvent(line.events,step);
    if(!event)return [{chain:line.base,weight:1}];
    const x=fraction(event,step);
    if(x===1)return [{chain:event.to,weight:1}];
    const items=event.weights.map(v=>({chain:v.chain,weight:v.weight*(1-x)}));
    const same=items.find(v=>JSON.stringify(v.chain)===JSON.stringify(event.to));
    if(same)same.weight+=x;else if(x)items.push({chain:event.to,weight:x});
    return items.filter(v=>v.weight>1e-5);
  }
  const afterBars=(P,at,bars)=>App.Conductor?.barsAfter(P,at,bars)??at+bars*App.spb(P);
  function compile(P,entries) {
    const lines=new Map(),layers=[];
    for(const {at,end,values} of entries)for(const [path,target] of Object.entries(values)){
      const d=descriptor(path);if(!d)continue;
      let line=lines.get(path);
      if(!line){
        const base=get(P,d.keys);if(base===undefined)continue;
        line={d,base:copy(base),events:[]};lines.set(path,line);
      }
      line.events.push({at,end,from:current(line,at),to:target,weights:(d.type==="chain" || d.type==="split")?chainMix(line,at):null});
    }
    for(const [path,line] of lines){
      let layer=layers.find(l=>l.ti===line.d.ti);
      if(!layer){layer={ti:line.d.ti,mix:[],master:[],macros:[],eq:false,chain:null,split:null,device:false};layers.push(layer);}
      const {part,keys}=line.d;
      if(part==="mix"||part==="master")layer[part].push(keys.at(-1));
      if(part==="macros")layer.macros.push(+keys.at(-1));
      if(part==="effects"){if(line.d.type==="chain" || line.d.type==="split")layer[line.d.type]=line;else layer.eq=true;}
      if(part==="device")layer.device=true;
    }
    return {P,lines,layers,times:[],valid:!!lines.size,cache:null};
  }
  function session(P) {
    const items=P.scenes?.items || [];
    const entries=(P.scenes?.cues || []).map(c=>{
      const scene=items.find(s=>s.id===c.id);
      return scene && {at:c.at,end:afterBars(P,c.at,c.bars),values:scene.values};
    }).filter(Boolean).sort((a,b)=>a.at-b.at);
    return compile(P,entries);
  }
  const shallow=o=>Array.isArray(o)?o.slice():{...o};
  function projectAt(s,step) {
    if(!s?.valid)return s?.P;
    if(s.cache?.step===step)return s.cache.out;
    const P=s.P,out={...P};
    // Clone only the touched branches. Unchanged tracks, samples and note banks stay shared.
    for(const line of s.lines.values()){
      const keys=line.d.keys;
      let src=P,dst=out;
      for(const key of keys.slice(0,-1)){
        if(dst[key]===src[key])dst[key]=shallow(src[key]);
        src=src[key];dst=dst[key];
      }
      dst[keys.at(-1)]=current(line,step);
    }
    s.cache={step,out};return out;
  }
  function rampWindow(E,s,at,next,time,end,remember,lanes) {
    if(!s?.valid)return;
    const A=projectAt(s,at),B=projectAt(s,next);
    if(remember){
      s.times.push({at,next,time,end});
      while(s.times.length>8 && s.times[1].end<E.ctx.currentTime-.1)s.times.shift();
      // Offline scheduling can stay several seconds ahead of rendered PCM. Note events
      // are drained in time order and only refer to recent step windows.
      if(s.times.length>48)s.times.splice(0,s.times.length-48);
      E.sceneTrack=(ti,t)=>{
        let k=s.times.length-1;while(k>0 && s.times[k].time>t)k--;
        const f=s.times[k], x=clamp((t-f.time)/Math.max(.00001,f.end-f.time),0,1);
        return projectAt(s,f.at+(f.next-f.at)*x).tracks[ti];
      };
    }
    for(const layer of s.layers){
      const i=layer.ti;
      if(i<0){for(const k of layer.master)E.sceneParam(k,-1,A.fx[k],B.fx[k],time,end);continue;}
      if(layer.split)E.rack.sceneSplit(i,chainMix(layer.split,at),chainMix(layer.split,next),time,end);
      if(layer.chain)E.rack.sceneChain(i,chainMix(layer.chain,at),chainMix(layer.chain,next),time,end);
      if(i>=8)continue;
      const tr=A.tracks[i],to=B.tracks[i],strip=A.rack.strips[i],dest=B.rack.strips[i];
      const bank=lanes?.[i], curves=bank ? tr.automation[bank.p] : null;
      const song=A.song && A.chain.length && A.performance.source==="arrangement" ? A.songCurves?.[i] : null;
      const automated=key=>song?.[key]?.length || curves?.[key]?.points?.length;
      for(const k of layer.mix)if(!automated(k))E.sceneParam(k,i,tr[k],to[k],time,end);
      if(layer.device && (tr.kind!=="kit" || to.kind!=="kit") && !automated("cutoff"))
        E.sceneParam("cutoff",i,tr[tr.kind]?.cut??20000,to[to.kind]?.cut??20000,time,end);
      if(layer.device)E.sceneDevice?.(i,tr,to,time,end);
      for(const j of layer.macros)if(!automated("macro"+(j+1)))E.rack.sceneMacro(i,j,strip.macros[j],dest.macros[j],time,end);
      if(layer.eq)E.rack.eq(i).schedule(strip.eq,dest.eq,time,end);
    }
  }
  function schedule(E,s,at,time,nextTime,lanes) {
    if(!s?.valid || !E.sceneParam)return;
    // Preserve an instantaneous cue at the next step, without a premature one-step ramp.
    const next=at+1-1e-8;
    rampWindow(E,s,at,next,time,nextTime,true,lanes);
    if(manual?.E===E){
      const job=manual, a=clamp((time-job.start)/job.seconds,0,1), b=clamp((nextTime-job.start)/job.seconds,0,1);
      rampWindow(E,job.session,a,b,time,nextTime,false,lanes);
    }
  }
  function end(E,s) {
    if(!s?.valid || !E?.endScenes)return;
    E.endScenes();E.syncAll();s.times=[];s.cache=null;
  }
  let manual=null,timer=0;
  function stopManual() {
    clearTimeout(timer);timer=0;
    if(!manual)return;
    const m=manual;manual=null;delete m.E.manualSceneTrack;
    m.E.endScenes();m.E.syncAll();
  }
  function recall(scene,bars=0,filtered=scene.values) {
    const P=App.P, E=App.E, running=App.Seq.playing && E, at=App.Seq.frame()?.absoluteStep||0;
    let source=P;
    if(manual && manual.P===P)source=projectAt(manual.session,clamp((E.ctx.currentTime-manual.start)/manual.seconds,0,1));
    stopManual();
    const s=compile(source,[{at:0,end:1,values:filtered}]);
    if(!s.valid)return;
    const finish=afterBars(P,at,bars);
    const seconds=App.Conductor?App.Conductor.time(P,finish)-App.Conductor.time(P,at):(finish-at)*15/P.bpm;
    if(!running || !bars || seconds<.01){
      for(const [key,v] of Object.entries(filtered))set(P,descriptor(key).keys,copy(v));
      App.commit();App.refresh();return;
    }
    // The project checkpoint is the destination. A separate audio-clock job owns
    // the temporary trajectory, so saving or undoing mid-transition stays atomic.
    for(const [key,v] of Object.entries(filtered))set(P,descriptor(key).keys,copy(v));
    App.commit();
    const start=E.ctx.currentTime+.012,until=start+seconds;
    manual={P,E,until,session:s,start,seconds};
    const devices=new Set(s.layers.filter(l=>l.device).map(l=>l.ti));
    E.manualSceneTrack=(i,t)=>devices.has(i)?projectAt(s,clamp((t-start)/seconds,0,1)).tracks[i]:E.sceneTrack?.(i,t);
    function advance(){
      if(!manual || manual.P!==App.P || !App.Seq.playing){stopManual();return;}
      const now=E.ctx.currentTime;
      if(now>=until){stopManual();App.refresh();return;}
      const t=Math.max(now,start),edge=Math.min(t+.11,until),a=(t-start)/seconds,b=(edge-start)/seconds;
      rampWindow(E,s,a,b,t,edge,false);
      timer=setTimeout(advance,65);
    }
    advance();
  }
  const field=(name,el)=>h("label.rack-field",null,h("span",{text:name}),el);
  function open(channel=App.P.sel.t) {
    const P=App.P,S=P.scenes, node=App.Workspace.begin("Setting scenes");
    node.classList.add("rack-dialog","scene-dialog");
    const body=h("div.dlg-body");node.append(body);
    const pick=h("select",{"aria-label":"Setting scene"}),name=h("input",{type:"text",maxlength:36,"aria-label":"Scene name",placeholder:"Scene name"});
    const tx=h("div.scene-tracks"),gx=h("div.scene-parts");
    let tracks=new Set([channel]),groups=new Set(channel<8?["mix","device","effects","macros"]:["effects"]),id="";
    const bars=h("select",{"aria-label":"Morph length"},[0,.25,.5,1,2,4,8,16,32].map(v=>h("option",{value:v,text:v ? v+" bar"+(v===1?"":"s"):"Instant"})));
    const start=h("input",{type:"number",min:1,max:2048,step:1,value:1,"aria-label":"Cue bar"});
    const saved=()=>S.items.find(s=>s.id===id);
    const status=h("output.scene-status",{role:"status"}),list=h("div.scene-cues");
    const message=t=>{status.textContent=t;};
    function selection(){
      return Object.fromEntries(Object.entries(saved()?.values||{}).filter(([key])=>{
        const d=descriptor(key);return groups.has(d.part) && (d.ti<0 || tracks.has(d.ti));}));
    }
    function mask(box,options,values,labels) {
      box.replaceChildren();
      for(const [i,key] of options.entries()){
        const check=h("input",{type:"checkbox","aria-label":labels[i]});check.checked=values.has(key);
        check.onchange=()=>{if(check.checked)values.add(key);else values.delete(key);buttons();};
        box.append(h("label",null,check,labels[i]));
      }
    }
    function changeScene() {
      id=pick.value;const s=saved();name.value=s?.name || "";
      if(s){
        const ds=Object.keys(s.values).map(descriptor);
        tracks=new Set(ds.filter(d=>d.ti>=0).map(d=>d.ti));groups=new Set(ds.map(d=>d.part));
      }
      render();
    }
    function buttons(){
      store.textContent=saved()?"Update scene":"Save scene";
      const canCapture=groups.has("master") || (tracks.size && (groups.has("effects") || ([...tracks].some(i=>i<8) && groups.size)));
      store.disabled=!name.value.trim() || !canCapture;
      call.disabled=!saved() || !Object.keys(selection()).length;
      add.disabled=!saved() || S.cues.length>=256;del.disabled=!saved();
    }
    function render(){
      pick.replaceChildren(h("option",{value:"",text:"New scene"}),...S.items.map(s=>h("option",{value:s.id,text:s.name})));pick.value=id;
      const channels=[...P.tracks.map((t,i)=>(i+1)+" · "+t.name),...P.rack.groups.map(g=>g.name)];
      mask(tx,channels.map((_,i)=>i),tracks,channels);
      mask(gx,Object.keys(parts),groups,Object.values(parts));buttons();
      list.replaceChildren(...S.cues.map((c,j)=>{
        const n=S.items.find(s=>s.id===c.id);const pos=App.Conductor?.position(P,c.at);
        return h("div.scene-cue",null,h("span",{text:"Bar "+((pos?.bar ?? Math.floor(c.at/App.spb(P)))+1)+" · step "+(c.at+1)}),
          h("span",{text:n?.name||"Scene"}),h("span",{text:c.bars?c.bars+" bars":"Instant"}),btn("×","Remove scene cue",()=>{
            S.cues.splice(j,1);App.commit();restartCues();render();
          }));
      }));
    }
    function restartCues() {
      if(App.Seq.playing){const step=App.Seq.frame()?.absoluteStep||0;App.Seq.play(undefined,step);}
    }
    const store=btn("Save scene","Store the checked controls with a name",()=>{
      const values=capture(P,[...tracks],[...groups]);
      if(!Object.keys(values).length)return;
      const s=saved(),label=name.value.trim().slice(0,36);
      if(!label)return;
      if(s){s.name=label;s.values=values;}
      else{
        if(S.items.length>=32){message("Scene bank full · 32 scenes");return;}
        id=App.uid();S.items.push({id,name:label,values});
      }
      App.commit();if(S.cues.some(c=>c.id===id))restartCues();message("Saved "+label);render();
    });
    const call=btn("Recall","Recall the checked settings; morph while transport plays",()=>{
      const s=saved();if(!s)return;
      recall(s,+bars.value,selection());message(App.Seq.playing && +bars.value ? "Morphing to "+s.name+" over "+bars.value+" bars" : "Recalled "+s.name);
    },"confirm-action");
    const del=btn("Delete","Remove this scene and its song cues; Undo restores it",()=>{
      const s=saved();if(!s)return;
      S.items=S.items.filter(v=>v.id!==id);S.cues=S.cues.filter(c=>c.id!==id);id="";name.value="";App.commit();restartCues();message("Deleted "+s.name);render();
    });
    const add=btn("Add song cue","Schedule the stored scene and its saved scope at this bar",()=>{
      if(!start.reportValidity() || !Number.isInteger(start.valueAsNumber) || start.valueAsNumber<1 || !saved())return;
      const at=App.Conductor?.barStart(P,+start.value-1)??(+start.value-1)*App.spb(P);
      if(S.cues.some(c=>c.at===at && c.id===id)){message("This scene already has a cue at this bar");return;}
      S.cues.push({at,id,bars:+bars.value});S.cues.sort((a,b)=>a.at-b.at);App.commit();restartCues();render();message("Song cue added");
    });
    const play=btn("Play","Toggle transport for live scene morphs",()=>{App.Seq.toggle();});
    name.oninput=buttons;pick.onchange=changeScene;
    body.append(
      h("div.rack-row",null,field("Scene",pick),field("Name",name),store,del),
      h("section.rack-section",null,h("h3",{text:"Recall scope"}),tx,gx),
      h("div.rack-row",null,field("Transition",bars),call,play),
      h("section.rack-section",null,h("h3",{text:"Song cues"}),h("div.rack-row",null,field("Start at bar",start),add),list),
      h("p.dlg-tip",{text:"RECALL USES THE CHECKED SCOPE · CUES KEEP THEIR SAVED SCOPE · SWITCHES FLIP AT MORPH END"}),status);
    render();node.showModal();
    const timer=setInterval(()=>{if(P!==App.P){node.close();return;}play.textContent=App.Seq.playing?"Stop":"Play";if(!manual && status.textContent.startsWith("Morphing to "))message("Recall complete");},180);
    node.addEventListener("close",()=>clearInterval(timer),{once:true});
  }
  App.Scenes={open,capture,recall,session,projectAt,schedule,end,reset:stopManual};
})();
