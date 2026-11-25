/* The catalogue lists metadata alone; a separate store keeps each break and its original sample bytes. */
(() => {
  "use strict";
  const {h,btn}=App.UI, clone=v=>JSON.parse(JSON.stringify(v));
  const used=(t,p)=>!!(t.clips[p].length || Object.keys(t.automation[p]).length);
  let database, preview, generation=0;
  function db() {
    if(!database) database=new Promise((resolve,reject)=>{
      const open=indexedDB.open("musiclab.material",1);
      open.onupgradeneeded=()=>{for(const name of ["index","material"])open.result.createObjectStore(name,{keyPath:"id"});};
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{const d=open.result;d.onversionchange=()=>{d.close();database=null;};resolve(d);};
    }).catch(e=>{database=null;throw e;});
    return database;
  }
  async function read(store,id) {
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(store), s=tx.objectStore(store), r=id ? s.get(id) : s.getAll();
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
  }
  async function write(meta,packed) {
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(["index","material"],"readwrite");
      for(const [name,row] of [["index",meta],["material",{id:meta.id,packed}]]) {
        const s=tx.objectStore(name);
        if(packed) s.put(row);else s.delete(meta.id);
      }
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error || Error("Library write failed"));
    });
  }
  function capture(project,scope) {
    const P=App.newProject(), pi=project.sel.p, tracks=scope==="pattern" ? project.tracks.map((_,i)=>i).filter(i=>used(project.tracks[i],pi)) : [project.sel.t];
    if (!tracks.some(i=>used(project.tracks[i],pi))) throw Error("The selected material contains no notes or automation.");
    for (const key of ["sig","swing","key","scale","bpm","fx","harmony","rack","tuning","impulse"]) P[key]=clone(project[key]);
    P.pats[0]=clone(project.pats[pi]);P.sel.t=tracks[0];
    for(const i of tracks) {
      const original=project.tracks[i], t=clone(original);
      t.clips=Array.from({length:8},()=>[]);t.automation=Array.from({length:8},()=>({}));
      t.clips[0]=clone(original.clips[pi]);t.automation[0]=clone(original.automation[pi]);
      t.solo=0; if(scope==="clip")t.mute=0;
      P.tracks[i]=t;P.performance.loops[i][0]=project.performance.loops[i][pi];
    }
    return {P,tracks};
  }
  async function save(scope,title,tags) {
    const {P,tracks}=capture(App.P,scope);
    const name=title.trim().slice(0,64);
    if (!name) throw Error("Name the material first.");
    const meta={id:App.uid(),name,scope,tracks,bpm:P.bpm,tags:tags.trim().slice(0,120),notes:tracks.reduce((n,i)=>n+P.tracks[i].clips[0].length,0),steps:Math.max(App.patSteps(P,0),...tracks.map(i=>App.Live.length(P,i,0))),date:Date.now()};
    await write(meta,await App.ProjectFiles.pack(P));return meta;
  }
  async function unpack(id) {
    const row=await read("material",id), packed=row?.packed, P=App.sanitize(packed);
    if (!P) throw Error("Material is unavailable.");
    const durable=await App.ProjectFiles.importSamples(P,packed.samples);
    await App.restoreSamples(P);
    return {P,durable};
  }
  function stop() {
    generation++;
    if(preview){try{preview.stop();}catch{} preview.disconnect();preview=null;}
  }
  async function listen(meta) {
    stop();const token=generation, session=App.P, bpm=session.bpm, engine=App.audio();
    if (!engine) throw Error("Audio output is unavailable.");
    const {P}=await unpack(meta.id);
    if (token!==generation || session!==App.P)return;
    P.bpm=bpm;
    P.performance.source="take";
    P.performance.take={origin:0,steps:meta.steps,events:meta.tracks.map(t=>({at:0,t,p:0,offset:0}))};
    const {full,cut}=await App.Seq.renderSong({project:P});
    if(token!==generation || session!==App.P)return;
    const node=engine.ctx.createBufferSource();node.buffer=full;
    node.connect(engine.ctx.destination);preview=node;
    node.onended=()=>{node.disconnect();if(preview===node)preview=null;};
    node.start(0,cut/full.sampleRate);
  }
  function destination(meta,project=App.P,target) {
    const order=(first)=>[first,...Array.from({length:8},(_,i)=>i).filter(i=>i!==first)];
    if (target) {
      const tracks=meta.tracks.map(i=>target.ti==null ? i : (target.ti+i-meta.tracks[0])%8);
      const banks=target.p==null ? order(project.sel.p) : [target.p];
      const p=banks.find(p=>tracks.every(i=>!used(project.tracks[i],p)));
      return p==null ? null : {p,tracks};
    }
    if(meta.scope==="pattern") {
      const p=order(project.sel.p).find(p=>!project.chain.includes(p) && project.tracks.every(t=>!used(t,p)));
      return p===undefined ? null : {p,tracks:[...meta.tracks]};
    }
    // Prefer the selected cell, then this track's other banks, before another track.
    for(const ti of order(project.sel.t))for(const p of order(project.sel.p))
      if(!used(project.tracks[ti],p))return {p,tracks:[ti]};
    return null;
  }
  async function insert(meta,withSounds,target) {
    const session=App.P, dest=destination(meta,session,target);
    if(!dest)throw Error("No free destination. Clear a clip or an unused pattern first.");
    const {P:source,durable}=await unpack(meta.id);
    const current=destination(meta,session,target);
    if(session!==App.P || current?.p!==dest.p || current.tracks.join()!==dest.tracks.join())throw Error("Destination changed. Select the material again.");
    const empty=session.tracks.every(t=>!used(t,dest.p));
    if(empty)session.pats[dest.p].bars=App.clamp(Math.ceil(meta.steps/App.spb(session)),1,App.maxBars(session));
    for(const [j,from] of meta.tracks.entries()) {
      const ti=dest.tracks[j], orig=source.tracks[from], t=session.tracks[ti];
      const unused=t.clips.every((_,p)=>!used(t,p)) && !session.audio.regions.some(r=>r.track===ti);
      if(withSounds || unused) {
        for(const key of ["kind","name","lo","syn","arp","smp","kit","vol","pan","dly","rev","drive"]) t[key]=clone(orig[key]);
        const strip=clone(source.rack.strips[from]);
        const remap=id=>{
          const m=/^(kick|track)([0-7])$/.exec(id), at=m ? meta.tracks.indexOf(+m[2]) : -1;
          return at<0 ? id : m[1]+dest.tracks[at];
        };
        strip.key=remap(strip.key);
        for (const route of strip.routes) route.source=remap(route.source);
        if (strip.bus>=0 && !session.rack.strips.some((s,i)=>i!==ti && s.bus===strip.bus)) {
          session.rack.groups[strip.bus]=clone(source.rack.groups[strip.bus]);
        }
        session.rack.strips[ti]=strip;
      }
      t.clips[dest.p]=clone(orig.clips[0]);t.automation[dest.p]=clone(orig.automation[0]);
      const steps=App.Live.length(source,from,0);
      session.performance.loops[ti][dest.p]=steps===App.patSteps(session,dest.p) ? 0 : steps;
    }
    App.select(dest.tracks[0],dest.p);App.commit();App.refresh();
    return {dest,durable};
  }
  async function drop({meta,withSounds,project},target) {
    if(project!==App.P)return;
    try {
      const {dest,durable}=await insert(meta,withSounds,target);
      App.UI.msg(meta.name+" → "+App.P.tracks[dest.tracks[0]].name+" / "+App.PATS[dest.p]+(durable?"":" · SAVE PROJECT TO KEEP AUDIO"));
    } catch(e){App.UI.msg(e.message);}
  }
  function open() {
    const project=App.P,node=App.Workspace.begin("Material library"), body=h("div.dlg-body");
    node.classList.add("tool-dialog","library-dialog");
    const input=(label,def="")=>h("input",{type:"text","aria-label":label,value:def});
    const field=(label,control)=>h("label.tool-field",null,label,control);
    const scope=h("select",{"aria-label":"Capture scope"},h("option",{value:"clip",text:"Selected clip"}),h("option",{value:"pattern",text:"Whole pattern"}));
    const name=input("Material name"), tags=input("Tags"), search=input("Search library");
    const low=h("input",{type:"number",min:40,max:300,placeholder:"40","aria-label":"Minimum BPM"});
    const high=h("input",{type:"number",min:40,max:300,placeholder:"300","aria-label":"Maximum BPM"});
    const sound=h("input",{type:"checkbox","aria-label":"Replace sounds on occupied tracks"});
    const list=h("div.tool-list"), status=h("p.tool-status",{role:"status"});
    let rows=[], busy=false;
    const destText=m=>{const d=destination(m);return d ? (m.scope==="pattern" ? "Pattern " : project.tracks[d.tracks[0]].name+" / ")+App.PATS[d.p] : "No free destination";};
    async function action(fn) {
      if(busy)return;
      busy=true;
      try {status.textContent="Working…";await fn();}
      catch(e){status.textContent=e.message || "Library unavailable";}finally{busy=false;}
    }
    function render() {
      const q=search.value.trim().toLowerCase(), matches=rows.filter(r=>(r.name+" "+r.tags+" "+r.bpm).toLowerCase().includes(q) && (!low.value || r.bpm>=low.valueAsNumber) && (!high.value || r.bpm<=high.valueAsNumber));
      list.replaceChildren();
      for(const m of matches) {
        const play=btn("Audition","Play at "+project.bpm+" BPM",()=>action(async()=>{await listen(m);status.textContent=m.name+" · audition at "+project.bpm+" BPM";}));
        const add=btn("Insert","Insert into "+destText(m),()=>action(async()=>{
          const {dest,durable}=await insert(m,sound.checked);render();
          status.textContent=m.name+" inserted into "+App.PATS[dest.p]+(durable ? "" : " · save the project to keep embedded audio");
        }));
        add.disabled=!destination(m);
        const remove=btn("Delete","Delete this saved entry",()=>{
          const yes=btn("Confirm delete","Delete "+m.name,()=>action(async()=>{await write(m,null);rows=rows.filter(r=>r.id!==m.id);render();status.textContent="Removed "+m.name;}));
          remove.replaceWith(yes);yes.focus();
        });
        const title=h("strong.library-drag",{text:m.name,title:"Drag onto a matrix cell, track or pattern"});
        title.onpointerdown=e=>{
          if(e.button!==0 || busy)return;
          e.preventDefault();
          App.UI.drag(e,{type:"material",label:m.name,data:{meta:m,withSounds:sound.checked,project},
            hint:"DROP ON A FREE MATRIX CELL, TRACK OR PATTERN",start:()=>node.close()});
        };
        list.append(h("div.tool-item",null,h("div",null,title,h("small",{text:m.scope+" · "+m.bpm+" BPM · "+m.tracks.length+" track"+(m.tracks.length===1?"":"s")+" · "+m.notes+" notes"+(m.tags ? " · "+m.tags : "")+" → "+destText(m)})),play,add,remove));
      }
      if(!matches.length)list.append(h("p.tool-status",{text:rows.length?"No match":"Library empty"}));
    }
    function suggest(){name.value=(scope.value==="clip" ? project.tracks[project.sel.t].name+" " : "PATTERN ")+App.PATS[project.sel.p];}
    suggest();scope.onchange=suggest;search.oninput=low.oninput=high.oninput=render;
    const captureButton=btn("Save material","Store notes, curves, instruments and their samples",()=>action(async()=>{const m=await save(scope.value,name.value,tags.value);rows.unshift(m);render();status.textContent="Saved "+m.name;}));
    body.append(h("h2",{text:"Material library"}),h("div.tool-fields",null,field("Capture",scope),field("Name",name),field("Tags",tags),captureButton),
      h("h3",{text:"Saved material"}),h("div.tool-fields",null,field("Search",search),field("Min BPM",low),field("Max BPM",high)),list,
      h("label.tool-check",null,sound," Apply saved sounds to occupied tracks"),h("p.dlg-tip",{text:"DRAG A NAME ONTO THE MATRIX · FREE TRACKS TAKE THE STORED SOUND"}),
      status,h("div.dlg-buttons",null,btn("Stop audition","Stop preview audio",()=>{stop();status.textContent="Audition stopped";}),btn("Close","Return to the console",()=>node.close())));
    node.append(body);node.addEventListener("close",stop,{once:true});node.showModal();
    action(async()=>{rows=(await read("index")).sort((a,b)=>b.date-a.date);render();status.textContent="";});
  }
  App.Library={open,save,listen,insert,stop,drop};
})();
