/* Physical MIDI connections are session-local. Routing, learn assignments and recorded lanes travel with a project. */
(() => {
  "use strict";
  const {h,btn} = App.UI;
  const labels = {vol:"Level", pan:"Pan", dly:"Delay send", rev:"Reverb send", cutoff:"Voice cutoff", macro1:"Macro 1", macro2:"Macro 2", macro3:"Macro 3", macro4:"Macro 4"};
  const label = (ti,k) => k.startsWith("macro") ? (App.Rack.macroLabel?.(ti,Number(k.slice(5))-1) || labels[k]) : labels[k];
  const index = (n,max) => Number.isInteger(n) && n >= 0 && n <= max;
  App.extendProject({load(P,raw) {
    const src = raw.midiIO || {};
    P.midiIO = {
      channels:Array.from({length:8},(_,i) => index(src.channels?.[i],16) ? src.channels[i] : i === 0 ? 10 : i+1),
      bindings:(Array.isArray(src.bindings) ? src.bindings : []).filter(b => b && index(b.ti,7) && Object.hasOwn(labels,b.key) && index(b.ch,15) && index(b.cc,119)).slice(0,128).map(({ti,key,ch,cc,port}) => ({ti,key,ch,cc,port:String(port || "").slice(0,200)}))
    };
  }});
  let access, connecting, inputId="*", outputId="", clockMode=(()=>{try{const m=localStorage.getItem("musiclab.midi-clock");return ["send","follow"].includes(m)?m:"internal";}catch{return "internal";}})(), learn=null, draw, timer, phaseAt=0, lastPulse=0, pulses=0, clockPort="", resumeStep=0;
  let intervals=[];
  const output = () => access?.outputs.get(outputId);
  const connected = port => port?.state !== "disconnected";
  const stamp = (ctx,time) => Math.max(performance.now(),performance.now()+(time-ctx.currentTime)*1000);
  function send(bytes,when) {
    const port = output();
    if (!port || !connected(port)) return;
    try { port.send(bytes,when); } catch { App.UI.msg("MIDI OUTPUT DISCONNECTED"); }
  }
  function stop() {
    const port = output();
    if (port && connected(port)) {
      try { port.clear?.(); } catch {}
      if (clockMode === "send") send([0xfc]);
      for (const channel of new Set(App.P.midiIO.channels.filter(Boolean))) send([0xb0+channel-1,123,0]);
    }
  }
  function live(ti,pitch,velocity) {
    const c=App.P.midiIO.channels[ti];
    if (c) send([(velocity ? 0x90 : 0x80)+c-1,pitch,velocity ? Math.max(1,Math.round(velocity*127)) : 0]);
  }
  function note(ti,pitch,velocity,time,duration) {
    const c=App.P.midiIO.channels[ti], ctx=App.E?.ctx;
    if (!c || !ctx || !outputId) return;
    send([0x90+c-1,pitch,Math.max(1,Math.round(velocity*127))],stamp(ctx,time));
    send([0x80+c-1,pitch,0],stamp(ctx,time+duration));
  }
  function record(ti,key,value) {
    const pos=App.recArm && App.Seq.playing && App.Seq.now(ti);
    if (!pos) return;
    const n=pos.n || App.Live.length(App.P,ti,pos.pat), s=App.clamp(Math.floor(pos.step),0,n-1);
    const bank=App.P.tracks[ti].automation[pos.pat];
    const lane=bank[key] ||= {mode:"linear",points:[]};
    const v=Math.round(value*10000)/10000, old=lane.points.find(p=>p.s===s);
    if (old) old.v=v;
    else { lane.points.push({s,v}); lane.points.sort((a,b)=>a.s-b.s); }
    App.Mx.draw(); App.Automation?.sync();
  }
  function checkpoint() { clearTimeout(timer); timer=setTimeout(()=>{timer=null; App.commit();},300); }
  function cancelLearn() { learn=null; document.body.classList.remove("learning-midi"); }
  function arm(target) {
    cancelLearn(); learn=target || {};
    if (!target) document.body.classList.add("learning-midi");
    App.UI.msg(target ? "MOVE A HARDWARE CONTROLLER · ESC CANCELS" : "SELECT AN OUTLINED MIX OR MACRO CONTROL · ESC CANCELS");
  }
  document.addEventListener("pointerdown",e=>{
    if (!learn || learn.key) return;
    const el=e.target.closest("[data-midi-target][data-midi-track]");
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    arm({ti:Number(el.dataset.midiTrack),key:el.dataset.midiTarget});
  },true);
  document.addEventListener("keydown",e=>{if (learn && e.key==="Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancelLearn(); draw?.("Controller learn cancelled.");App.UI.msg("MIDI LEARN CANCELLED"); }},true);
  function follow(byte,port,time) {
    if (clockMode!=="follow" || (clockPort && clockPort!==port)) return;
    if (byte===0xfc) {
      const pos=App.Seq.frame();
      if (pos) resumeStep=pos.absoluteStep+1;
      App.Seq.stop();App.Live?.rest?.();resetClock();return;
    }
    if (byte===0xfa || byte===0xfb) {
      resetClock(); clockPort=port;if(byte===0xfa)resumeStep=0;App.Seq.play(0,resumeStep);return;
    }
    if (byte!==0xf8) return;
    if (lastPulse && time-lastPulse>500) resetClock();
    clockPort=port;
    const delta=time-lastPulse;
    lastPulse=time;
    if (pulses++ % 6===0) phaseAt=time;
    if (delta>=7 && delta<=68) {
      intervals.push(delta); if(intervals.length>24) intervals.shift();
      if(intervals.length>=6 && pulses%6===0) {
        const sorted=[...intervals].sort((a,b)=>a-b);
        const bpm=App.clamp(Math.round(25000/sorted[Math.floor(sorted.length/2)])/10,40,300);
        if (App.P.bpm!==bpm) { App.P.bpm=bpm; App.Top.sync(); }
      }
    }
  }
  function resetClock() { lastPulse=0; phaseAt=0; pulses=0; clockPort=""; intervals=[]; }
  function phase(ctx,next,sd) {
    if(clockMode!=="follow" || !phaseAt || performance.now()-lastPulse>350) return next;
    const anchor=ctx.currentTime+(phaseAt-performance.now())/1000;
    const offset=anchor+Math.round((next-anchor)/sd)*sd-next;
    return next+App.clamp(offset,-.002,.002);
  }
  function receive(e) {
    const [st,a,b]=e.data, cmd=st&240, ch=st&15, port=e.currentTarget?.id || e.target?.id || "";
    if (inputId!== "*" && inputId!==port) return;
    if (st===0xf2 && clockMode==="follow") { resumeStep=(b<<7)|a;return; }
    if (st>=0xf8) { follow(st,port,e.timeStamp || performance.now()); return; }
    const id="m:"+port+":"+ch+":"+a;
    if (cmd===0x80 || (cmd===0x90 && !b)) { App.noteOff(id); return; }
    if (cmd===0x90 && !document.querySelector("dialog[open]:not([data-instrument-keys])")) { App.noteOn(a,b/127,id); return; }
    if (cmd===0x90 && b) { App.Groove.tap(b/127);return; }
    if (cmd!==0xb0 || a>=120) return;
    const cfg=App.P.midiIO;
    if (learn?.key) {
      const {ti,key}=learn;
      cfg.bindings=cfg.bindings.filter(x=>!(x.port===port && x.ch===ch && x.cc===a) && !(x.ti===ti && x.key===key));
      cfg.bindings.push({ti,key,ch,cc:a,port}); cancelLearn(); App.commit(); draw?.();
      App.UI.msg("CC "+a+" › "+App.P.tracks[ti].name+" / "+label(ti,key)); return;
    }
    const link=cfg.bindings.find(x=>x.cc===a && x.ch===ch && (!x.port || x.port===port));
    if (!link) return;
    const {ti,key}=link, value=b/127;
    if (key.startsWith("macro")) App.Rack.setMacro(ti,Number(key.slice(5))-1,value);
    else {
      const track=App.P.tracks[ti];
      if (key==="cutoff") {
        if (track.kind==="kit") return;
        track[track.kind].cut=App.fromN(App.DEF[track.kind].cut,value);
      } else track[key]=key==="pan" ? value*2-1 : value;
      App.E?.syncTrack(ti);
      document.querySelectorAll('[data-midi-track="'+ti+'"][data-midi-target="'+key+'"]').forEach(el=>el.paint?.());
    }
    record(ti,key,value); checkpoint();
  }
  function hook() {
    const ids=[];
    for (const p of access.inputs.values()) {
      const use=connected(p) && (inputId==="*" || p.id===inputId);
      p.onmidimessage=use ? receive : null;
      if (use) ids.push(p.id);
    }
    if (clockPort && !ids.includes(clockPort)) resetClock(); // the port that was driving the clock is gone
    App.releaseMidi(ids); App.midiN=ids.length; App.Top.sync(); draw?.();
  }
  async function connect() {
    if (access) return true;
    if (!navigator.requestMIDIAccess) return false;
    try {
      connecting ||= navigator.requestMIDIAccess({sysex:false});
      access=await connecting; access.onstatechange=hook; hook(); return true;
    } catch { return false; } finally { connecting=null; }
  }
  function select(label,entries,current,change) {
    const el=h("select",{"aria-label":label},entries.map(([v,name])=>h("option",{value:v,text:name})));
    el.value=current; el.onchange=()=>change(el.value);
    return h("label.tool-field",null,label,el);
  }
  function open() {
    const node=App.Workspace.begin("MIDI connections"), body=h("div.dlg-body");
    node.classList.add("tool-dialog"); node.append(body);
    let status="", ti=App.P.sel.t, target="vol", picking=false;
    const redraw=()=>{
      const cfg=App.P.midiIO, ports=m=>[...(m?.values() || [])].filter(connected).map(p=>[p.id,p.name || p.id]);
      body.replaceChildren(h("h2",{text:"MIDI connections"}));
      const message=h("p.tool-status",{role:"status",text:status || (access ? App.midiN+" active inputs" : navigator.requestMIDIAccess ? "No devices connected" : "Web MIDI is unavailable in this browser.")});
      if (!access && navigator.requestMIDIAccess) body.append(btn("Connect devices","Request MIDI permission",async()=>{status=await connect() ? "" : "MIDI access was denied or is unavailable."; redraw();}));
      body.append(message,h("div.tool-fields",null,
        select("Input",[["*","All inputs"],["","Off"],...ports(access?.inputs)],inputId,v=>{inputId=v;resetClock();if(access)hook();}),
        select("Output",[["","Off"],...ports(access?.outputs)],outputId,v=>{stop(); outputId=v;}),
        select("Clock",[["internal","Internal"],["send","Send clock"],["follow","Follow input clock"]],clockMode,v=>{stop();clockMode=v;resetClock();try{localStorage.setItem("musiclab.midi-clock",v);}catch{}App.Top.sync();})),
        h("h3",{text:"Track routing & controller learn"}),h("div.tool-fields",null,
        select("Track",App.P.tracks.map((t,i)=>[i,(i+1)+" · "+t.name]),ti,v=>{ti=+v;if(target==="cutoff" && App.P.tracks[ti].kind==="kit")target="vol";redraw();}),
        select("Output channel",[[0,"Off"],...Array.from({length:16},(_,i)=>[i+1,String(i+1)])],cfg.channels[ti],v=>{stop();cfg.channels[ti]=+v;App.commit();}),
        select("Controller target",Object.keys(labels).filter(k=>k!=="cutoff" || App.P.tracks[ti].kind!=="kit").map(k=>[k,label(ti,k)]),target,v=>{target=v;})));
      const learnButton=(caption,viaClick)=>btn(caption,viaClick?"CLOSES THIS DIALOG · CLICK A VALUE ON THE CONSOLE, THEN MOVE THE HARDWARE CONTROL THAT SHOULD DRIVE IT":"MOVE A KNOB OR FADER ON THE CONTROLLER · IT WILL DRIVE THE TRACK AND TARGET CHOSEN ABOVE",async()=>{
        if(!await connect()){status="Connect an available MIDI input first."; redraw();return;}
        if (!App.midiN) {status="Select or connect a MIDI input first.";redraw();return;}
        if(viaClick) { picking=true;node.close(); }
        arm(viaClick ? null : {ti,key:target});
        if (!viaClick) { status="Move the hardware control to assign it.";redraw(); }
      });
      body.append(h("div.arr-row",null,learnButton("Learn selected target",false),learnButton("Pick control on console",true)));
      const list=h("div.tool-list");
      for(const b of cfg.bindings) {
        const remove=btn("Remove","Remove this assignment",()=>{cfg.bindings=cfg.bindings.filter(x=>x!==b);App.commit();redraw();});
        list.append(h("div.tool-item",null,h("span",{text:(access?.inputs.get(b.port)?.name || "Input")+" · CH "+(b.ch+1)+" · CC "+b.cc+" › "+App.P.tracks[b.ti].name+" / "+label(b.ti,b.key)}),remove));
      }
      body.append(list,h("p.dlg-tip",{text:"ARM REC AND PLAY · CONTROLLER MOVES ARE WRITTEN INTO THE PLAYING CLIP’S AUTOMATION"}));
    };
    draw=(message="")=>{status=message;redraw();}; redraw();
    node.addEventListener("close",()=>{draw=null;if(!picking)cancelLearn();},{once:true}); node.showModal();
  }
  App.MidiIO={mode:()=>clockMode,open,connect,record,note,live,phase,stop,
    cut(ti,time){const ch=App.P.midiIO.channels[ti];if(ch && App.E)send([0xb0+ch-1,123,0],stamp(App.E.ctx,time));},
    start(ctx,t){if(clockMode==="send")send([0xfa],stamp(ctx,t));},
    clock(ctx,t,sd){if(clockMode==="send" && outputId)for(let i=0;i<6;i++)send([0xf8],stamp(ctx,t+i*sd/6));},
    reset(){cancelLearn();resetClock();resumeStep=0;clearTimeout(timer);timer=null;}
  };
})();
