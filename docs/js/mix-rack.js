/* Signal routing editors and aligned, pre-master WAV stems. */
(() => {
  "use strict";
  const waves = ["sine","triangle","sawtooth","square"];
  const divisions = [[0,"Free · Hz"],[.25,"1/16"],[.5,"1/8"],[1,"1/4"],[2,"1/2"],[4,"1/1"],[8,"2/1"]];
  const effects = {lowpass:"Low-pass",highpass:"High-pass",lowshelf:"Low shelf",highshelf:"High shelf",saturate:"Saturation",compress:"Compressor"};
  const targets = {cutoff:"Voice cutoff",pitch:"Voice pitch",tone:"Strip filter",drive:"Distortion",release:"Amp release",level:"Strip level",pan:"Pan",dly:"Delay send",rev:"Reverb send"};
  const trackIds = Array.from({length:8}, (_,i) => "track"+i);
  const kickIds = trackIds.map((_,i) => "kick"+i);
  const macroIds = ["macro1","macro2","macro3","macro4"];
  const sources = [...macroIds,"lfo","velocity","mic",...trackIds,...kickIds];
  const limit = (n,lo,hi,fallback) => Number.isFinite(n) ? App.clamp(n,lo,hi) : fallback;
  const choice = (x,list,otherwise) => list.includes(x) ? x : otherwise;
  const items = (x,max) => Array.isArray(x) ? x.slice(0,max) : [];
  function channel(raw) {
    const chain = items(raw?.chain,8).filter(f => f && Object.hasOwn(effects,f.type)).map(f => ({
      type:f.type, value:limit(f.value,0,1,.5), on:f.on !== false
    }));
    return {chain, key:choice(raw?.key,[...trackIds,...kickIds,"mic"],"off"),
      threshold:limit(raw?.threshold,-60,0,-30), ratio:limit(raw?.ratio,1,20,6),
      depth:limit(raw?.depth,0,1,.75), release:limit(raw?.release,.012,.6,.09)};
  }
  function model(raw) {
    const strips = trackIds.map((_,i) => {
      const r = raw?.strips?.[i];
      const routes = items(r?.routes,16).filter(x => x && sources.includes(x.source) && Object.hasOwn(targets,x.target))
        .map(x => ({source:x.source, target:x.target, low:limit(x.low,-1,1,0), high:limit(x.high,-1,1,1)}));
      return {...channel(r),routes, bus:Math.round(limit(r?.bus,-1,3,-1)),
        lfoRate:limit(r?.lfoRate,.02,30,1), lfoBeats:choice(r?.lfoBeats,divisions.map(d => d[0]),0), lfoWave:choice(r?.lfoWave,waves,"sine"),
        macros:macroIds.map((_,j) => limit(r?.macros?.[j],0,1,0)),
        macroNames:macroIds.map((_,j) => typeof r?.macroNames?.[j] === "string" ? r.macroNames[j].trim().slice(0,20) : "")};
    });
    const groups = Array.from({length:4}, (_,i) => {
      const r = raw?.groups?.[i], name = typeof r?.name === "string" && r.name.trim() ? r.name.trim().slice(0,20) : "BUS "+(i+1);
      return {...channel(r),name,level:limit(r?.level,0,1,1)};
    });
    return {strips,groups};
  }
  App.extendProject({load(P,raw){ P.rack = model(raw.rack); }});
  const {h,btn} = App.UI;
  const trackName = i => String(i+1).padStart(2,"0")+" · "+App.P.tracks[i].name;
  const options = obj => Object.entries(obj);
  const trackOptions = () => App.P.tracks.map((_,i) => [String(i),trackName(i)]);
  const groupOptions = () => App.P.rack.groups.map((g,i) => [String(i),g.name]);
  const sourceOptions = () => [...trackOptions().map(([i,label]) => ["track"+i,label+" · audio"]),
    ...trackOptions().filter(([i]) => App.P.tracks[+i].kind === "kit").map(([i,label]) => ["kick"+i,label+" · pad 1"]),
    ["mic","Mic input"]];
  const change = () => { App.E?.rack.sync(); App.commit(); };
  const getMacro = (ti,i) => App.P?.rack?.strips[ti]?.macros[i] ?? 0;
  const macroLabel = (ti,i) => {
    const name = App.P?.rack?.strips[ti]?.macroNames?.[i];
    return "Macro "+(i+1)+(name ? " · "+name : "");
  };
  function setMacro(ti,i,value,{commit=false}={}) {
    const strip = App.P?.rack?.strips[ti];
    if (!strip || !Number.isInteger(i) || i<0 || i>3 || !Number.isFinite(value)) return;
    strip.macros[i] = App.clamp(value,0,1);
    App.E?.rack.macro(ti,i,strip.macros[i]);
    const el = document.querySelector('.rack-macros input[data-midi-track="'+ti+'"][data-midi-target="'+macroIds[i]+'"]');
    if (el) { el.value = strip.macros[i]; el.nextElementSibling.textContent = Math.round(strip.macros[i]*100)+"%"; }
    if (commit) App.commit();
  }
  function select(label,entries,value,fn) {
    const el = h("select",{"aria-label":label});
    for (const [key,name] of entries) el.append(h("option",{value:key,text:name}));
    el.value = value;
    el.onchange = () => fn(el.value);
    return el;
  }
  function number(label,value,min,max,step,fn) {
    const el = h("input",{type:"number","aria-label":label,value,min,max,step});
    el.onchange = () => {
      let x = el.valueAsNumber; if (!Number.isFinite(x)) x = value;
      x = App.clamp(x,min,max); el.value = x; value = x; fn(x);
    };
    return el;
  }
  const field = (label,el) => h("label.rack-field",null,h("span",{text:label}),el);
  const section = (title,...content) => h("section.rack-section",null,h("h3",{text:title}),...content);
  function editor(title,build) {
    const dialog = App.Workspace.begin(title); dialog.classList.add("rack-dialog");
    const body = h("div.dlg-body"), center = h("div.rack-content"), top = h("div.rack-head",null,
      h("h2",{text:title}),btn("Close","Close this editor",() => dialog.close()));
    body.append(top,center); dialog.append(body);
    const draw = () => center.replaceChildren(...build(draw,dialog));
    draw(); dialog.showModal();
  }
  function modulate() {
    let ti = App.P.sel.t;
    editor("Modulation matrix",draw => {
      const s = App.P.rack.strips[ti];
      const macros = h("div.rack-macros");
      s.macros.forEach((value,j) => {
        const el = h("input",{type:"range",min:0,max:1,step:.001,value,"aria-label":"Macro "+(j+1),
          "data-midi-target":macroIds[j],"data-midi-track":ti});
        const output = h("output",{text:Math.round(value*100)+"%"});
        el.oninput = () => { setMacro(ti,j,+el.value); App.MidiIO?.record(ti,macroIds[j],+el.value); };
        el.onchange = () => App.commit();
        const name=h("input",{type:"text",value:s.macroNames[j],placeholder:"Name",maxlength:20,"aria-label":"Macro "+(j+1)+" name"});
        name.onchange=() => {
          name.value = s.macroNames[j] = name.value.trim().slice(0,20);
          for (const opt of name.closest("dialog").querySelectorAll('.rack-route option[value="'+macroIds[j]+'"]')) opt.textContent=macroLabel(ti,j);
          App.commit();
        };
        macros.append(h("div",null,h("span",{text:"Macro "+(j+1)}),name,el,output));
      });
      const settings = h("div.rack-row",null,
        field("Instrument",select("Modulation track",trackOptions(),ti,v => { ti=+v; draw(); })),
        field("LFO shape",select("LFO shape",waves.map(w => [w,w]),s.lfoWave,v => { s.lfoWave=v; change(); })),
        field("LFO clock",select("LFO clock",divisions,s.lfoBeats,v => {s.lfoBeats=+v; change(); draw();})),
        !s.lfoBeats && field("Rate · Hz",number("LFO rate",s.lfoRate,.02,30,.01,v => { s.lfoRate=v; change(); })));
      const list = h("div.rack-list");
      const src = [...macroIds.map((id,j) => [id,macroLabel(ti,j)]),["lfo","LFO"],["velocity","Last velocity"],...sourceOptions()];
      const heading = h("div.rack-route.rack-labels",null,...["Source","Destination","Start %","End %",""].map(text => h("span",{text})));
      if (s.routes.length) list.append(heading);
      s.routes.forEach((r,j) => {
        const write = (key,val) => { r[key]=val; change(); };
        const source = select("Route "+(j+1)+" source",src,r.source,v => {write("source",v); draw();});
        const dest = select("Route "+(j+1)+" destination",options(targets),r.target,v => write("target",v));
        if (App.P.tracks[ti].kind === "kit") for (const opt of dest.options) {
          if (["cutoff","release"].includes(opt.value)) { opt.disabled = true; opt.textContent += " · SYN/SMP"; }
        }
        list.append(h("div.rack-route",null,source,dest,
          number("Route "+(j+1)+" start",Math.round(r.low*100),-100,100,1,v => write("low",v/100)),
          number("Route "+(j+1)+" end",Math.round(r.high*100),-100,100,1,v => write("high",v/100)),
          btn("×","Remove modulation route "+(j+1),() => {s.routes.splice(j,1); change(); draw();})));
      });
      const add = btn("Add route","Connect another source to an instrument, insert or mixer parameter",() => {
        s.routes.push({source:"macro1",target:App.P.tracks[ti].kind === "kit" ? "rev" : "cutoff",low:0,high:1}); change(); draw();
      }); add.disabled = s.routes.length >= 16;
      const help = h("p.rack-note",{text:s.routes.some(r => r.source === "mic")
        ? "Mic follows the live input. Open IN in Signal analysis. Offline renders use silence for the mic."
        : "Endpoints are offsets from the control. Reverse the endpoints to invert a route."});
      return [settings,section("Macros",macros),section("Routes",list,add,help)];
    });
  }
  function mixer() {
    let path = "t"+App.P.sel.t;
    editor("Mixer routing",draw => {
      const isTrack = path[0] === "t", i = +path.slice(1);
      const r = App.P.rack, c = isTrack ? r.strips[i] : r.groups[i];
      const pick = [...trackOptions().map(([k,v]) => ["t"+k,v]),...groupOptions().map(([k,v]) => ["b"+k,v])];
      const controls = h("div.rack-row",null,field("Channel", select("Mixer channel",pick,path,v => {path=v; draw();})));
      if (isTrack) controls.append(field("Output",select("Track output",[["-1","Master"],...groupOptions()],c.bus,v => {c.bus=+v; change(); draw();})));
      else {
        const name = h("input",{"aria-label":"Bus name",maxlength:20,value:c.name});
        name.onchange = () => {
          name.value = c.name = name.value.trim().slice(0,20) || "BUS "+(i+1);
          controls.querySelector('option[value="'+path+'"]').textContent=c.name; change();
        };
        controls.append(field("Bus name",name),field("Level %",number("Bus level",Math.round(c.level*100),0,100,1,v => {c.level=v/100; change();})));
      }
      const inserts = h("div.rack-list");
      c.chain.forEach((f,j) => {
        const move = d => { [c.chain[j+d],c.chain[j]] = [f,c.chain[j+d]]; change(); draw(); };
        const up = btn("↑","Move insert earlier",() => move(-1)), down = btn("↓","Move insert later",() => move(1));
        up.disabled = j === 0; down.disabled = j === c.chain.length-1;
        const enabled = btn(f.on ? "On" : "Bypass","Toggle insert "+(j+1),() => {f.on=!f.on; change(); draw();});
        enabled.setAttribute("aria-pressed",String(f.on));
        const filter = ["lowpass","highpass"].includes(f.type), shelf = f.type.endsWith("shelf");
        const db = f.type === "compress";
        const label = filter ? "Hz" : shelf || db ? "dB" : "%";
        const physical = v => filter ? Math.round(30*600**v) : shelf ? Math.round((v*30-15)*10)/10 : db ? -Math.round(48*v) : Math.round(v*100);
        const normalized = x => filter ? Math.log(x/30)/Math.log(600) : shelf ? (x+15)/30 : db ? -x/48 : x/100;
        inserts.append(h("div.rack-insert",null,enabled,h("span",{text:(j+1)+" · "+effects[f.type]}),
          number("Insert "+(j+1)+" "+label,physical(f.value),Math.min(physical(0),physical(1)),Math.max(physical(0),physical(1)),shelf ? .1 : 1,
            v => {f.value=normalized(v); change();}),h("small",{text:label}),up,down,
          btn("×","Remove insert "+(j+1),() => {c.chain.splice(j,1); change(); draw();})));
      });
      const type = select("New insert effect",options(effects),"lowpass",() => {});
      const add = btn("Add insert","Append the selected processor to this channel",() => {
        c.chain.push({type:type.value,value:.5,on:true}); change(); draw();
      }); add.disabled=c.chain.length>=8;
      const side = h("div.rack-row",null,field("Key input",select("Sidechain key",[["off","Off"],...sourceOptions()],c.key,v => {c.key=v; change(); draw();})),
        field("Threshold · dB",number("Sidechain threshold",c.threshold,-60,0,.5,v => {c.threshold=v; change();})),
        field("Ratio",number("Sidechain ratio",c.ratio,1,20,.1,v => {c.ratio=v; change();})),
        field("Depth %",number("Sidechain depth",Math.round(c.depth*100),0,100,1,v => {c.depth=v/100; change();})),
        field("Response · ms",number("Sidechain response",Math.round(c.release*1000),12,600,1,v => {c.release=v/1000; change();})));
      const members = isTrack ? "" : App.P.tracks.map((t,j) => r.strips[j].bus === i ? t.name : "").filter(Boolean).join(" + ");
      return [controls,...(isTrack?[]:[h("p.rack-note",{text:"Inputs · "+(members || "No tracks assigned")})]),
        section("Insert chain",inserts,h("div.rack-row",null,type,add)),
        section("Sidechain compressor",side,...(c.key === "mic" ? [h("p.rack-note",{text:"Open IN in Signal analysis to supply a live microphone key."})] : []))];
    });
  }
  const crcTable = Uint32Array.from({length:256},(_,i) => {
    let x=i; for (let j=0;j<8;j++) x=(x>>>1) ^ ((x&1) ? 0xedb88320 : 0);
    return x>>>0;
  });
  // Stored ZIP uses standard WAV files without another compression pass.
  async function archive(files) {
    const parts=[], central=[], encoder = new TextEncoder();
    let offset=0,centralSize=0;
    const header = size => new DataView(new ArrayBuffer(size));
    for (const {name,blob} of files) {
      const filename = encoder.encode(name);
      let checksum = 0xffffffff;
      const reader = blob.stream().getReader();
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        for (const byte of value) checksum = (checksum>>>8)^crcTable[(checksum^byte)&255];
      }
      checksum = (checksum^0xffffffff)>>>0;
      const local = header(30), dir = header(46);
      local.setUint32(0,0x04034b50,true); local.setUint16(4,20,true);
      dir.setUint32(0,0x02014b50,true); dir.setUint16(4,20,true); dir.setUint16(6,20,true);
      for (const [view,base] of [[local,6],[dir,8]]) {
        view.setUint16(base,0x800,true); view.setUint16(base+6,33,true); // UTF-8, epoch 1980-01-01
        view.setUint32(base+8,checksum,true); view.setUint32(base+12,blob.size,true);
        view.setUint32(base+16,blob.size,true); view.setUint16(base+20,filename.length,true);
      }
      dir.setUint32(42,offset,true);
      parts.push(local,filename,blob); central.push(dir,filename);
      offset += 30+filename.length+blob.size; centralSize += 46+filename.length;
    }
    const end = header(22); end.setUint32(0,0x06054b50,true);
    end.setUint16(8,files.length,true); end.setUint16(10,files.length,true);
    end.setUint32(12,centralSize,true); end.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:"application/zip"});
  }
  const safe = s => s.replace(/[\\/:*?"<>|\x00-\x1f]/g,"-").trim().slice(0,64);
  const stemsFor = mode => {
    const rack = App.P.rack;
    const assign = (type,index,name) => ({type,index,name,key:type+index});
    const tracks = App.P.tracks.flatMap((t,i) => mode === "tracks" || rack.strips[i].bus < 0 ?
      [assign("track",i,"TRK "+trackName(i))] : []);
    const buses = mode === "groups" ? rack.groups.flatMap((g,i) => rack.strips.some(t => t.bus===i)
      ? [assign("group",i,"GRP "+(i+1)+" · "+g.name)] : []) : [];
    return [...buses,...tracks,assign("returns",0,"FX RETURNS")];
  };
  async function renderStems(stems) {
    if (!stems.length) throw Error("Choose a stem");
    const {full,cut} = await App.Seq.renderSong({stems});
    const files = stems.map((s,i) => {
      const stereo = {numberOfChannels:2,length:full.length,sampleRate:full.sampleRate,
        getChannelData:c => full.getChannelData(2*i+c)};
      return {name:safe(s.name)+".wav",blob:App.wav(stereo,cut)};
    });
    return archive(files);
  }
  function stems() {
    let mode="tracks", selected=new Set(stemsFor(mode).map(s => s.key)), busy=false;
    editor("Export stems",(draw,dialog) => {
      const all=stemsFor(mode);
      const modePick = select("Stem grouping",[["tracks","Individual tracks"],["groups","Group buses + direct tracks"]],mode,v => {
        mode=v; selected=new Set(stemsFor(mode).map(s => s.key)); draw();
      });
      const list=h("div.rack-stems"), status=h("p.rack-note",{role:"status"});
      const exportBtn = btn("Export WAVs · ZIP","Render selected stereo WAVs in one shared pass",async () => {
        if (busy || !selected.size) return;
        busy=true; modePick.disabled=true; exportBtn.disabled=true;
        list.querySelectorAll("input").forEach(el => el.disabled=true);
        const name=App.P.name, requested=all.filter(s => selected.has(s.key));
        status.textContent="Rendering "+requested.length+" stems…";
        try {
          const blob=await renderStems(requested);
          if (!dialog.open) return;
          App.download(blob,name+" STEMS.zip");
          App.UI.msg(requested.length+" ALIGNED STEMS EXPORTED"); dialog.close();
        } catch (e) {
          if (!dialog.open) return;
          const msg=e?.message || "Render failed"; draw();
          dialog.querySelector('[role="status"]').textContent=msg;
        } finally { busy=false; }
      },"confirm-action");
      exportBtn.disabled=!selected.size;
      all.forEach(s => {
        const cb=h("input",{type:"checkbox","aria-label":s.name}); cb.checked=selected.has(s.key);
        cb.onchange=() => { if(cb.checked) selected.add(s.key); else selected.delete(s.key); exportBtn.disabled=!selected.size; };
        list.append(h("label",null,cb,h("span",{text:s.name})));
      });
      return [field("Render outputs",modePick),section("Stereo WAV · 24 bit",list),
        h("p.rack-note",{text:mode==="tracks" ? "Post-insert, pre-bus tracks. Shared delay and reverb are on FX RETURNS."
          : "Post-fader buses, ungrouped tracks and shared FX. All files begin together, before master processing."}),
        h("div.dlg-buttons",null,status,exportBtn)];
    });
  }
  const tailSeconds = P => Math.max(0,...P.rack.strips.map((s,i) => {
    if (!s.routes.some(r => r.target === "release")) return 0;
    const t=P.tracks[i]; return t.kind === "kit" ? 0 : 6*t[t.kind].ar+.04;
  }));
  App.Rack={model,getMacro,macroLabel,setMacro,modulate,mixer,stems,renderStems,tailSeconds};
})();
