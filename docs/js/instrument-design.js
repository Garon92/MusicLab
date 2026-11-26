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
    ui.body.append(h("div.dlg-buttons",null,action("Audition C4",()=>App.audio()?.play(ti,60,.85,0,1,true))));
    ui.dlg.addEventListener("close",()=>App.releaseAll(),{once:true});
    if(type==="graph")graphEditor(d.graph,ui,commit);else tableEditor(d,ui,commit,ti);
  }
  const specs={
    ratio:["Pitch ratio",.0625,32,.0001],hz:["Cutoff · Hz",20,20000,1],q:["Resonance",.1,90,.1],
    level:["Base gain",0,2,.01],rate:["Rate · Hz",.015,60,.001],
    attack:["Attack · s",.001,4,.001],decay:["Decay · s",.005,6,.001],
    sustain:["Sustain",0,1,.001],release:["Release · s",.005,6,.001]
  };
  function graphEditor(g,ui,commit){
    const board=h("div.il-board",{"aria-label":"Module patch graph"}), inspector=h("div.il-inspect"),
      wiring=h("div.il-wiring"), routes=h("div.il-cables");
    const types=select("Module type",Object.entries(L.moduleTypes),"osc");
    let selected=g.nodes[0]?.id,source=selected,target="out",port="audio",amount=1;
    const label=id=>id==="out"?"Output":(L.moduleTypes[g.nodes.find(n=>n.id===id)?.type] || "")+" "+id;
    const graphPos=n=>n.id==="out"?{x:.86,y:.56}:n;
    const all=()=>[...g.nodes,{id:"out",type:"out"}];
    function drawBoard() {
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
        const b=action(n.id==="out"?"OUTPUT":n.id,()=>{if(n.id!=="out" && selected!==n.id){selected=n.id;draw();}},label(n.id));
        if(n.id!=="out"){
          b.setAttribute("aria-label","Select module "+n.id);b.classList.toggle("on",selected===n.id);
          b.onpointerdown=e=>{
            if(e.button!==0)return;
            const r=board.getBoundingClientRect(), sx=e.clientX,sy=e.clientY, ox=n.x,oy=n.y;
            b.setPointerCapture(e.pointerId);
            b.onpointermove=ev=>{if(Math.abs(ev.clientX-sx)+Math.abs(ev.clientY-sy)>3){
              n.x=clamp(ox+(ev.clientX-sx)/r.width,0,.83);n.y=clamp(oy+(ev.clientY-sy)/r.height,0,.78);position();
            }};
            b.onpointerup=b.onpointercancel=()=>{b.onpointermove=b.onpointerup=b.onpointercancel=null;if(ox!==n.x || oy!==n.y)commit();};
          };
        } else b.disabled=true;
        buttons.set(n.id,b);board.append(b);
      }
      position();
    }
    function drawInspector(){
      const n=g.nodes.find(v=>v.id===selected);
      inspector.replaceChildren();if(!n)return;
      inspector.append(h("b",{text:L.moduleTypes[n.type]+" · "+n.id}));
      for(const key of ["wave","mode",...Object.keys(specs)])if(key in n){
        const update=v=>{n[key]=v;commit();};
        if(key==="wave" || key==="mode"){
          const opts=key==="wave"?["sine","triangle","sawtooth","square"]:["lowpass","highpass","bandpass","notch"];
          inspector.append(field(key==="wave"?"Waveform":"Filter type",select(key,opts.map(x=>[x,x]),n[key],update)));
        }else{
          const [name,min,max,step]=specs[key],input=numeric(name,n[key],min,max,step,update);
          input.dataset.reset=L.moduleOf(n.type,"x")[key]; // a right-click returns to what a new module of this type has
          inspector.append(field(name,input));
        }
      }
      inspector.append(action("Remove module",()=>{
        g.nodes=g.nodes.filter(v=>v!==n);g.cables=g.cables.filter(c=>c.from!==n.id && c.to!==n.id);
        selected=g.nodes[0]?.id;if(source===n.id)source=selected;if(target===n.id)target="out";commit();draw();
      }));
    }
    function drawWire(){
      wiring.replaceChildren();if(!g.nodes.length)return;
      const sourceOpts=g.nodes.map(n=>[n.id,label(n.id)]),destOpts=all().filter(n=>L.inputs[n.type].length).map(n=>[n.id,label(n.id)]);
      source=sourceOpts.some(([id])=>id===source)?source:sourceOpts[0][0];
      target=destOpts.some(([id])=>id===target)?target:"out";
      const ports=L.inputs[all().find(n=>n.id===target).type];if(!ports.includes(port))port=ports[0];
      wiring.append(field("Source",select("Cable source",sourceOpts,source,v=>{source=v;})),
        field("Destination",select("Cable destination",destOpts,target,v=>{target=v;drawWire();})),
        field("Input",select("Cable input",ports.map(p=>[p,p]),port,v=>{port=v;})),
        field("Amount",numeric("Cable amount",amount,-2,2,.01,v=>{amount=v;})),
        action("Connect",()=>{
          const c={from:source,to:target,port,amount};
          if(g.cables.length>=48 || !L.validCable(g,c)){ui.status.textContent="Choose a new connection without a feedback loop.";return;}
          g.cables.push(c);ui.status.textContent="";commit();draw();
        }));
    }
    function draw(){
      drawBoard();drawInspector();drawWire();routes.replaceChildren();
      g.cables.forEach((c,i)=>routes.append(h("div",null,h("span",{text:c.from+" › "+c.to+" / "+c.port}),
        numeric("Gain for cable "+(i+1),c.amount,-2,2,.01,v=>{c.amount=v;commit();}),
        action("×",()=>{g.cables.splice(i,1);commit();draw();},"Disconnect "+c.from+" from "+c.to))));
    }
    ui.content.append(row(field("Module",types),action("Add module",()=>{
      if(g.nodes.length>=16){ui.status.textContent="All 16 module slots are in use.";return;}
      const type=types.value;let i=1;while(g.nodes.some(n=>n.id===type+i))i++;
      selected=type+i;source=selected;g.nodes.push(L.moduleOf(type,selected,g.nodes.length));commit();draw();
    })),board,inspector,wiring,routes);draw();
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
      preset.value="custom";
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
