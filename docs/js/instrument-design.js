/* Instrument editors use the same project model that the live and render engines read. */
(() => {
  "use strict";
  const L=App.InstrumentLab, {h,btn}=App.UI, {clamp}=App;
  const field=(label,control)=>h("label.il-field",null,h("span",{text:label}),control);
  const row=(...kids)=>h("div.il-row",null,kids);
  const select=(label,entries,current,change)=>{
    const el=h("select",{"aria-label":label},entries.map(([value,text])=>h("option",{value,text})));
    el.value=current;
    if(change)el.onchange=()=>change(el.value);
    return el;
  };
  const numeric=(label,value,min,max,step,change)=>{
    const el=h("input",{type:"number","aria-label":label,value,min,max,step});
    el.onchange=()=>{if(el.reportValidity() && Number.isFinite(el.valueAsNumber))change(el.valueAsNumber);};
    return el;
  };
  const slider=(label,value,change,done)=>{
    // Limits before the value: a range rounds a value it is given first to its default whole steps, and opened at 0.
    const el=h("input",{type:"range","aria-label":label,min:0,max:1,step:.001,value});
    el.value=value;
    el.oninput=()=>change(+el.value);el.onchange=()=>done?.();
    return el;
  };
  const action=(label,fn,hint=label)=>btn(label,hint,fn);
  function shell(title) {
    const dlg=App.Workspace.begin(title), body=h("div.dlg-body.il-body"), content=h("div.il-content"), status=h("output.il-status",{role:"status"});
    dlg.classList.add("il-dialog");dlg.setAttribute("data-instrument-keys","");
    body.append(h("h2",{text:title}),content,status);
    dlg.append(body);dlg.showModal();
    return {dlg,content,status,body};
  }
  function open(type,ti=App.P.sel.t) {
    const P=App.P,T=P.tracks[ti];
    if(T?.kind!=="syn"){App.UI.msg("SELECT A SYNTH TRACK");return;}
    const d=T.syn, design=type==="graph"?1:2;
    if(d.design!==design){d.design=design;App.commit();App.Dv.build();App.E?.syncTrack(ti);}
    const ui=shell(type==="graph"?"Modular instrument":"Wavetable instrument");
    function commit(){if(P!==App.P)return;App.commit();App.E?.syncTrack(ti);App.Dv.build();}
    ui.body.append(h("div.dlg-buttons",null,action("Audition C4",()=>App.audio()?.play(ti,60,.85,0,1,true),"PLAY C4 THROUGH THIS INSTRUMENT · THE A-K KEYS PLAY IT TOO")));
    ui.dlg.addEventListener("close",()=>App.releaseAll(),{once:true});
    // Every edit here is committed at once, so Ctrl/Cmd Z steps back and opens the editor on what came back,
    // unless the step undone is the one that made this track that kind of instrument.
    ui.dlg.again=()=>{const now=App.P.tracks[ti];return now?.kind==="syn" && now.syn.design===design ? open(type,ti) : null;};
    if(type==="graph")graphEditor(d.graph,ui,commit,ti);else tableEditor(d,ui,commit,ti);
    return ui.dlg;
  }
  const specs={
    ratio:["Pitch ratio",.0625,32,.0001],hz:["Cutoff · Hz",20,20000,1],q:["Resonance",.1,90,.1],
    level:["Base gain",0,2,.01],rate:["Rate · Hz",.015,60,.001],
    attack:["Attack · s",.001,4,.001],decay:["Decay · s",.005,6,.001],
    sustain:["Sustain",0,1,.001],release:["Release · s",.005,6,.001]
  };
  // What each setting of a module does, for the strip.
  const says={
    wave:"SHAPE OF THE WAVE", mode:"WHAT THE FILTER LETS THROUGH",
    ratio:"FREQUENCY AS A MULTIPLE OF THE NOTE PLAYED · 1 = THE NOTE · 2 = AN OCTAVE UP · 0.5 = AN OCTAVE DOWN",
    hz:"CUTOFF AT REST · A CABLE INTO PITCH MOVES IT", q:"HOW NARROW AND RINGING THE FILTER IS",
    level:"GAIN AT REST · A CABLE INTO GAIN ADDS TO IT · SET 0 TO LET AN ENVELOPE OPEN IT", rate:"CYCLES A SECOND · A CABLE INTO RATE MOVES IT",
    attack:"TIME TO RISE WHEN A NOTE STARTS", decay:"TIME TO FALL TO THE SUSTAIN LEVEL", sustain:"LEVEL HELD WHILE THE NOTE IS HELD", release:"TIME TO FALL AFTER THE NOTE ENDS"
  };
  const does={
    osc:"PITCHED TONE", noise:"NOISE", impulse:"ONE CLICK AT THE START OF A NOTE", lfo:"SLOW WAVE TO MOVE A PITCH, GAIN OR RATE",
    env:"RISES AND FALLS WITH EACH NOTE · CABLE IT INTO A GAIN OR PITCH", amp:"PASSES AUDIO AT ITS GAIN", filter:"SHAPES THE AUDIO PASSING THROUGH", reson:"RINGS AT THE NOTE WHEN AUDIO HITS IT"
  };
  function graphEditor(g,ui,commit,ti){
    const board=h("div.il-board",{"aria-label":"Module patch graph"}), inspector=h("div.il-inspect"),
      wiring=h("div.il-wiring"), routes=h("div.il-cables");
    const types=select("Module type",Object.entries(L.moduleTypes),"osc");
    types.dataset.tip="KIND OF MODULE TO ADD · 16 AT MOST";
    let selected=g.nodes[0]?.id,source=selected,target="out",port="audio",amount=1,fault="";
    const label=id=>id==="out"?"Output":(L.moduleTypes[g.nodes.find(n=>n.id===id)?.type] || "")+" "+id;
    // The strip under the cables reads the patch: a fault of the last try, else whether anything is heard at all.
    const report=()=>{
      ui.status.textContent=fault || (!g.nodes.length ? "NO MODULES: THE INSTRUMENT IS SILENT · ADD ONE AND CABLE IT TO OUTPUT"
        : !L.heard(g).size ? "NOTHING REACHES OUTPUT: THE INSTRUMENT IS SILENT · CONNECT A MODULE TO OUTPUT" : "");
    };
    const change=()=>{fault="";commit();report();};
    const remove=n=>{
      g.nodes=g.nodes.filter(v=>v!==n);g.cables=g.cables.filter(c=>c.from!==n.id && c.to!==n.id);
      selected=g.nodes[0]?.id;if(source===n.id)source=selected;if(target===n.id)target="out";change();draw();
    };
    // Why a cable cannot be added, or nothing when it can.
    const refusal=c=>g.cables.length>=48 ? "ALL 48 CABLES ARE IN USE · DISCONNECT ONE FIRST"
      : c.from===c.to ? "A MODULE CANNOT FEED ITSELF"
      : g.cables.some(x=>x.from===c.from && x.to===c.to && x.port===c.port) ? "THAT CABLE IS ALREADY THERE · SET ITS AMOUNT IN THE LIST BELOW"
      : !L.validCable(g,c) ? "THAT CABLE WOULD CLOSE A LOOP: "+c.to.toUpperCase()+" ALREADY FEEDS "+c.from.toUpperCase() : "";
    const connect=c=>{
      fault=refusal(c);if(fault){report();return;}
      g.cables.push(c);change();draw();
    };
    const graphPos=n=>n.id==="out"?{x:.86,y:.56}:n;
    const all=()=>[...g.nodes,{id:"out",type:"out"}];
    function drawBoard() {
      const live=L.heard(g);
      board.replaceChildren();
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      svg.setAttribute("viewBox","0 0 1000 230");svg.setAttribute("preserveAspectRatio","none");
      svg.setAttribute("aria-hidden","true");board.append(svg);
      const buttons=new Map();
      function position(){
        for(const n of all()){
          const {x,y}=graphPos(n),b=buttons.get(n.id);b.style.left=x*100+"%";b.style.top=y*100+"%";
        }
        svg.replaceChildren();
        for(const c of g.cables) {
          const a=graphPos(g.nodes.find(m=>m.id===c.from)),b=graphPos(all().find(m=>m.id===c.to));
          const ax=a.x*1000+101,ay=a.y*230+17,bx=b.x*1000+1,by=b.y*230+17;
          const path=document.createElementNS(svg.namespaceURI,"path");
          path.setAttribute("d","M"+ax+" "+ay+" C"+(ax+70)+" "+ay+" "+(bx-70)+" "+by+" "+bx+" "+by);
          path.setAttribute("class",c.port==="audio"?"audio":"control");svg.append(path);
        }
      }
      for(const n of all()){
        const b=action(n.id==="out"?"OUTPUT":n.id,()=>{if(n.id!=="out" && selected!==n.id){selected=n.id;draw();}},
          n.id==="out" ? "WHAT ARRIVES HERE IS THE SOUND OF THE INSTRUMENT"
            : (live.has(n.id) ? "" : "NO CABLE PATH TO OUTPUT: NO EFFECT YET · ")+L.moduleTypes[n.type].toUpperCase()+" = "+does[n.type]+" · CLICK = EDIT BELOW · DRAG = MOVE · RIGHT-CLICK = CABLE OR REMOVE");
        if(n.id!=="out"){
          b.setAttribute("aria-label","Select module "+n.id);b.classList.toggle("on",selected===n.id);b.classList.toggle("idle",!live.has(n.id));
          b.oncontextmenu=e=>{
            e.preventDefault();
            const direct={from:n.id,to:"out",port:"audio",amount:1},no=refusal(direct);
            App.UI.menu(b,[{label:"Cable from here",value:"from"},...(L.inputs[n.type].length?[{label:"Cable to here",value:"to"}]:[]),
              {label:"Connect to output",value:"out",disabled:!!no,why:no},"-",{label:"Remove module",value:"remove"}],v=>{
              if(v==="remove")remove(n);
              else if(v==="out")connect(direct);
              else{if(v==="from")source=n.id;else target=n.id;fault="";drawWire();report();}
            },{label:label(n.id)});
          };
          b.onpointerdown=e=>{
            if(e.button!==0)return;
            const r=board.getBoundingClientRect(), sx=e.clientX,sy=e.clientY, ox=n.x,oy=n.y;
            b.setPointerCapture(e.pointerId);
            b.onpointermove=ev=>{if(Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)>3){
              n.x=clamp(ox+(ev.clientX-sx)/r.width,0,.83);n.y=clamp(oy+(ev.clientY-sy)/r.height,0,.78);position();
            }};
            b.onpointerup=b.onpointercancel=()=>{b.onpointermove=b.onpointerup=b.onpointercancel=null;if(ox!==n.x || oy!==n.y)change();};
          };
        } else {b.disabled=true;b.dataset.why="CABLES END HERE · PICK OUTPUT AS THE DESTINATION BELOW";}
        buttons.set(n.id,b);board.append(b);
      }
      position();
    }
    function drawInspector(){
      const n=g.nodes.find(v=>v.id===selected);
      inspector.replaceChildren();if(!n)return;
      inspector.append(h("b",{text:L.moduleTypes[n.type]+" · "+n.id}));
      for(const key of ["wave","mode",...Object.keys(specs)])if(key in n){
        const update=v=>{n[key]=v;change();};
        if(key==="wave" || key==="mode"){
          const opts=key==="wave"?["sine","triangle","sawtooth","square"]:["lowpass","highpass","bandpass","notch"];
          const list=select(key==="wave"?"Waveform":"Filter type",opts.map(x=>[x,x]),n[key],update);
          list.dataset.tip=says[key];inspector.append(field(key==="wave"?"Waveform":"Filter type",list));
        }else{
          const [name,min,max,step]=specs[key],input=numeric(name,n[key],min,max,step,update);
          input.dataset.reset=L.moduleOf(n.type,"x")[key]; // a right-click returns to what a new module of this type has
          input.dataset.tip=says[key];inspector.append(field(name,input));
        }
      }
      inspector.append(action("Remove module",()=>remove(n),"REMOVE "+n.id.toUpperCase()+" AND ITS CABLES"));
    }
    function drawWire(){
      wiring.replaceChildren();if(!g.nodes.length)return;
      const sourceOpts=g.nodes.map(n=>[n.id,label(n.id)]),destOpts=all().filter(n=>L.inputs[n.type].length).map(n=>[n.id,label(n.id)]);
      source=sourceOpts.some(([id])=>id===source)?source:sourceOpts[0][0];
      target=destOpts.some(([id])=>id===target)?target:"out";
      const ports=L.inputs[all().find(n=>n.id===target).type];if(!ports.includes(port))port=ports[0];
      const tipped=(el,tip,reset)=>{el.dataset.tip=tip;if(reset!=null)el.dataset.reset=reset;return el;};
      const clear=()=>{if(fault){fault="";report();}};
      wiring.append(field("Source",tipped(select("Cable source",sourceOpts,source,v=>{source=v;clear();}),"MODULE THE NEW CABLE LEAVES")),
        field("Destination",tipped(select("Cable destination",destOpts,target,v=>{target=v;fault="";drawWire();report();}),"MODULE THE NEW CABLE ENTERS · OUTPUT IS WHAT IS HEARD")),
        field("Input",tipped(select("Cable input",ports.map(p=>[p,p]),port,v=>{port=v;clear();}),"AUDIO = SOUND PASSES THROUGH · PITCH, GAIN AND RATE = THE CABLE MOVES THAT SETTING")),
        field("Amount",tipped(numeric("Cable amount",amount,-2,2,.01,v=>{amount=v;}),"HOW MUCH PASSES · BELOW 0 = TURNED UPSIDE DOWN",1)),
        action("Connect",()=>connect({from:source,to:target,port,amount}),"ADD THIS CABLE"));
    }
    function draw(){
      drawBoard();drawInspector();drawWire();routes.replaceChildren();
      g.cables.forEach((c,i)=>{
        const gain=numeric("Gain for cable "+(i+1),c.amount,-2,2,.01,v=>{c.amount=v;change();});
        gain.dataset.tip="HOW MUCH OF "+c.from.toUpperCase()+" ENTERS "+c.to.toUpperCase()+" / "+c.port.toUpperCase()+" · BELOW 0 = TURNED UPSIDE DOWN";gain.dataset.reset=1;
        routes.append(h("div",null,h("span",{text:c.from+" › "+c.to+" / "+c.port}),gain,
          action("×",()=>{g.cables.splice(i,1);change();draw();},"DISCONNECT "+c.from.toUpperCase()+" FROM "+c.to.toUpperCase())));
      });
      report();
    }
    ui.content.append(h("p.dlg-tip",{text:"ONLY WHAT A CABLE PATH JOINS TO OUTPUT IS HEARD · DRAG MODULES TO ARRANGE"}),row(field("Module",types),action("Add module",()=>{
      if(g.nodes.length>=16){fault="ALL 16 MODULE SLOTS ARE IN USE · REMOVE ONE FIRST";report();return;}
      const type=types.value;let i=1;while(g.nodes.some(n=>n.id===type+i))i++;
      selected=type+i;source=selected;g.nodes.push(L.moduleOf(type,selected,g.nodes.length));change();draw();
    },"ADD A MODULE OF THIS KIND · IT DOES NOTHING UNTIL A CABLE JOINS IT TOWARDS OUTPUT")),board,inspector,wiring,routes);draw();
    // Closing on a patch nothing can be heard from says so where the track is.
    ui.dlg.addEventListener("close",()=>{if(!L.heard(g).size && App.P.tracks[ti]?.syn?.graph===g)App.UI.msg("TRACK "+String(ti+1).padStart(2,"0")+" IS SILENT: NOTHING REACHES OUTPUT IN ITS MODULES · WIRE…");},{once:true});
  }

  function plot(canvas,fn){
    const w=canvas.width,hg=canvas.height,ctx=canvas.getContext("2d");
    ctx.fillStyle=App.C.r1;ctx.fillRect(0,0,w,hg);ctx.strokeStyle=App.C.ln2;ctx.beginPath();ctx.moveTo(0,hg/2);ctx.lineTo(w,hg/2);ctx.stroke();
    ctx.strokeStyle=App.C.t1;ctx.beginPath();
    for(let x=0;x<w;x++){const y=(.5-.45*clamp(fn(x/(w-1)),-1,1))*hg;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.stroke();
  }
  function tableEditor(d,ui,commit,ti){
    let at=0,partial=0,source=null,fraction=.25,hz=220,localFile=null,loading=0;
    const content=ui.content, wave=h("canvas.il-wave",{width:850,height:94,"aria-label":"Selected wavetable frame"}),
      sourceWave=h("canvas.il-source",{width:850,height:48,"aria-label":"Cycle start in source recording"});
    const projectSources=[...App.sampleIds(App.P)].map(id=>App.samples.get(id)).filter(Boolean);
    const drawWave=()=>{
      const f=d.frames[at];plot(wave,x=>f.sin.reduce((sum,im,k)=>sum+im*Math.sin(2*Math.PI*(k+1)*x)+f.cos[k]*Math.cos(2*Math.PI*(k+1)*x),0));
    };
    function drawSource(){
      sourceWave.hidden=!source;if(!source)return;
      const raw=source.buffer.getChannelData(0);
      plot(sourceWave,x=>raw[Math.floor(x*(raw.length-1))]);
      const ctx=sourceWave.getContext("2d"), w=sourceWave.width;
      const x=fraction*Math.max(0,1-1/(source.buffer.duration*hz))*w;
      ctx.fillStyle="rgba(255,183,64,.6)";ctx.fillRect(x,0,Math.max(2,w/(source.buffer.duration*hz)),sourceWave.height);
    }
    function draw(){
      const frameSelect=select("Wavetable frame",d.frames.map((_,i)=>[i,"Frame "+(i+1)]),at,v=>{at=+v;draw();});
      const parts=select("Harmonic partial",Array.from({length:L.PARTIALS},(_,j)=>[j,String(j+1)]),partial,v=>{partial=+v;draw();});
      const coeff=key=>numeric(key==="sin"?"Sine coefficient":"Cosine coefficient",+d.frames[at][key][partial].toFixed(4),-1,1,.0001,v=>{
        const f=L.frameOf(d.frames[at]);f[key][partial]=v;d.frames[at]=f;commit();drawWave();
      });
      const scan=slider("Wavetable position",d.scan,v=>{d.scan=v;App.E?.syncTrack(ti);},commit);
      const remove=action("Remove frame",()=>{d.frames.splice(at,1);at=Math.min(at,d.frames.length-1);commit();draw();});
      remove.disabled=d.frames.length===1;
      const add=action("Duplicate frame",()=>{d.frames.splice(at+1,0,L.frameOf(d.frames[at]));at++;commit();draw();});add.disabled=d.frames.length===8;
      const opts=[["","Choose audio"],...projectSources.map(s=>[s.id,s.name]),...(localFile?[["file",localFile.name]]:[])];
      const choose=select("Cycle source",opts,source===localFile && localFile?"file":source?.id||"",v=>{source=v==="file"?localFile:projectSources.find(s=>s.id===v);draw();});
      const pos=slider("Cycle start",fraction,v=>{fraction=v;drawSource();});
      sourceWave.onclick=e=>{const r=sourceWave.getBoundingClientRect();fraction=clamp((e.clientX-r.left)/r.width,0,1);pos.value=fraction;drawSource();};
      const capture=action("Capture into frame",()=>{if(!source)return;d.frames[at]=L.frameFromSample(source.buffer,fraction,hz);commit();draw();});
      capture.disabled=!source;
      const file=h("input",{type:"file",accept:"audio/*","aria-label":"Import wavetable audio",hidden:true});
      file.onchange=async()=>{
        const f=file.files[0], request=++loading;if(!f)return;
        try{
          const ctx=new OfflineAudioContext(1,1,48000),buffer=await ctx.decodeAudioData(await f.arrayBuffer());
          if(!ui.dlg.open || request!==loading)return;
          localFile=source={name:f.name,buffer};ui.status.textContent="";draw();
        }catch{if(ui.dlg.open)ui.status.textContent="Could not decode this recording.";}
      };
      content.replaceChildren(row(field("Frames",frameSelect),add,remove,field("Playback scan",scan)),wave,
        row(field("Partial",parts),field("Sine coefficient",coeff("sin")),field("Cosine coefficient",coeff("cos"))),
        h("h3",{text:"Extract a cycle"}),row(field("Recording",choose),action("Load audio…",()=>file.click()),file),
        sourceWave,row(field("Cycle start",pos),field("Fundamental · Hz",numeric("Cycle fundamental",hz,8,16000,.01,v=>{hz=v;drawSource();})),capture));
      drawWave();drawSource();
    }
    draw();
  }

  function tuning(){
    const P=App.P,t=P.tuning,ui=shell("Project tuning"),ti=P.tracks[P.sel.t].kind==="syn"?P.sel.t:P.tracks.findIndex(tr=>tr.kind==="syn");
    let held=[], request=0;
    const stop=()=>{held.forEach(n=>App.E?.noteOff(ti,n));held=[];};
    ui.dlg.addEventListener("close",stop,{once:true});
    const update=()=>{App.E?.syncAll();App.commit();};
    const names=Array.from({length:128},(_,i)=>[i,App.noteName(i)+" · "+i]);
    const preset=select("Tuning preset",[["custom","Custom"],["equal","12 equal divisions"],["just","5-limit just intonation"]],"custom",v=>{
      if(v!=="custom"){t.cents=[...(v==="equal"?L.equal:L.just)];t.name=v==="equal"?"12 equal divisions":"5-limit just intonation";t.enabled=true;update();draw();}
    });
    const file=h("input",{type:"file",accept:".scl,text/plain",hidden:true,"aria-label":"Scala scale file"});
    file.onchange=async()=>{
      const f=file.files[0],id=++request;if(!f)return;
      try{const scale=L.parseScala(await f.text());if(!ui.dlg.open || id!==request)return;
        Object.assign(t,scale,{enabled:true});update();ui.status.textContent="";draw();
      }catch(e){if(ui.dlg.open)ui.status.textContent=e.message;}
      file.value="";
    };
    const intervals=h("textarea",{"aria-label":"Scale intervals",rows:5,spellcheck:false});
    function draw(){
      // The list shows the preset the scale is, when it is one: it used to snap back to Custom after a choice.
      const same=(a,b)=>a.length===b.length && a.every((c,i)=>Math.abs(c-b[i])<1e-6);
      preset.value=same(t.cents,L.equal)?"equal":same(t.cents,L.just)?"just":"custom";
      intervals.value=t.cents.map(c=>Number(c.toFixed(5)).toFixed(5).replace(/0+$/,"").replace(/\.$/,".0")).join("  ");
      const mode=select("Active temperament",[["off","Standard 12-TET · A4 440"],["on","Project scale"]],t.enabled?"on":"off",v=>{t.enabled=v==="on";update();});
      const ref=numeric("Reference frequency",t.hz,10,20000,.01,v=>{t.hz=v;update();});
      const listen=action(held.length?"Stop chord":"Sustain chord",()=>{
        if(held.length)stop();
        else{const e=App.audio();if(!e)return;held=[0,4,7].map(i=>clamp(t.root+i,0,127));held.forEach(n=>e.noteOn(ti,n,.6,true));}
        listen.textContent=held.length?"Stop chord":"Sustain chord";
      });listen.disabled=ti<0;
      const scaleName=h("input",{type:"text",maxlength:64,"aria-label":"Scale name",value:t.name});
      const apply=action("Apply intervals",()=>{
        const rows=intervals.value.trim().split(/\s+/).filter(Boolean);
        try{const scale=L.parseScala([scaleName.value||"Custom",rows.length,...rows].join("\n"));Object.assign(t,scale,{enabled:true});ui.status.textContent="";update();draw();}
        catch(e){ui.status.textContent=e.message;}
      });
      ui.content.replaceChildren(row(field("Project plays in",mode),listen),
        row(field("Preset",preset),action("Import Scala…",()=>file.click()),file),
        row(field("Degree zero",select("Scale root note",names,t.root,v=>{t.root=+v;update();})),
          field("Reference key",select("Reference MIDI note",names,t.reference,v=>{t.reference=+v;update();})),field("Reference · Hz",ref)),
        field("Scale name",scaleName),field("Intervals",intervals),h("p.dlg-tip",{text:"CENTS WITH A DECIMAL POINT OR RATIOS · THE LAST VALUE REPEATS THE SCALE"}),
        h("div.dlg-buttons",null,apply));
    }
    draw();
  }
  Object.assign(L,{open,tuning});
})();
