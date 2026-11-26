/* Independent pitch, accent and gate clocks. The printer and audition share the event generator. */
(() => {
  "use strict";
  const {h,btn}=App.UI, {clamp}=App, lanes=["pitch","accent","gate"];
  const timing=[["1/4",.25],["1/3",1/3],["1/2",.5],["2/3",2/3],["1",1],["3/2",1.5],["2",2],["3",3],["4",4],["8",8]];
  const periods=Object.fromEntries(timing), directions=["Forward","Reverse","Pendulum"];
  const def=key=>({values:key==="pitch"?[]:key==="accent"?[80]:[75],clock:"1",dir:"Forward",phase:0});
  const safe=(key,x)=>{
    const base=def(key),lo=key==="pitch"?-1:0,hi=key==="pitch"?127:key==="gate"?400:100;
    if(!x)return base;
    return {values:(Array.isArray(x.values)?x.values:base.values).slice(0,32).filter(Number.isFinite).map(v=>clamp(Math.round(v),lo,hi)),
      dir:directions.includes(x.dir)?x.dir:base.dir,phase:Number.isFinite(x.phase)?clamp(Math.round(x.phase),0,31):0,clock:Object.hasOwn(periods,x.clock)?x.clock:"1"};
  };
  App.extendProject({load(P,raw){
    P.cycles=Array.from({length:8},(_,i)=>Object.fromEntries(lanes.map(k=>[k,safe(k,raw.cycles?.[i]?.[k])])));
  }});
  function laneIndex(lane,time){
    const n=lane.values.length;if(!n)return -1;
    const count=Math.floor(time/periods[lane.clock]+1e-8)+lane.phase;
    if(lane.dir==="Pendulum" && n>1){const j=count%(n*2-2);return j<n?j:n*2-2-j;}
    return lane.dir==="Reverse"?n-1-count%n:count%n;
  }
  function events(config,start,end){
    const out=[],period=periods[config.pitch.clock];
    for(let k=Math.ceil(start/period-1e-8);k*period<end-1e-8;k++){
      const time=k*period;
      const note=config.pitch.values[laneIndex(config.pitch,time)],v=(config.accent.values[laneIndex(config.accent,time)]??80)/100,
        gate=period*(config.gate.values[laneIndex(config.gate,time)]??75)/100;
      if(note>=0 && v>0 && gate>0)out.push({time,note,v,gate});
    }
    return out;
  }
  function notes(source,start,len){
    return source.filter(e=>e.time>=start-1e-8 && e.time<start+len-1e-8).map(e=>{
      const rel=Math.max(0,e.time-start),s=Math.floor(rel+1e-8),gate=Math.min(e.gate,len-rel),l=clamp(Math.round(gate),1,App.MAX_STEPS);
      return {s,n:e.note,l,v:e.v,p:1,fixed:{offset:Math.max(0,rel-s),gate,base:l}};
    });
  }
  function pitch(text){
    if(text==="-")return -1;
    if(/^\d+$/.test(text))return Number(text);
    const n=/^([a-g])([#b]?)(-?\d+)$/i.exec(text);
    return n?(Number(n[3])+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[n[1].toUpperCase()]+(n[2]==="#"?1:n[2]==="b"?-1:0):NaN;
  }
  function open(){
    const P=App.P,ti=P.sel.t,T=P.tracks[ti],config=P.cycles[ti],kit=T.kind==="kit";
    const node=App.Workspace.begin("Cycle sequencer"),body=h("div.dlg-body"),status=h("output.cycle-status",{role:"status"});
    node.classList.add("tool-dialog","cycle-dialog");
    const number=(label,v,min,max)=>h("input",{type:"number","aria-label":label,value:v,min,max,step:1});
    const field=(label,ctl)=>h("label.arr-field",null,label,ctl),col=h("div.cycle-lanes"),indicators=[];
    const option=(label,choices,value)=>{
      const el=h("select",{"aria-label":label},choices.map(v=>h("option",{value:v,text:v})));el.value=value;return el;
    };
    for(const key of lanes){
      const line=config[key],title={pitch:"Pitch",accent:"Accent",gate:"Gate"}[key];
      const input=h("input",{type:"text","aria-label":title+" steps",value:line.values.map(v=>v===-1?"-":key==="pitch"&&!kit?App.noteName(v):v).join(" "),maxlength:200,
        tip:key==="pitch"?(kit?"PAD NOTES 36 TO 43, SPACE BETWEEN, - FOR A REST · FOR EXAMPLE 36 - 38":"NOTE NAMES OR NUMBERS, SPACE BETWEEN, - FOR A REST · FOR EXAMPLE C3 E3 G3 -"):"PERCENT PER STEP, SPACE BETWEEN · FOR EXAMPLE 80 55 90"});
      const clock=option(title+" clock",Object.keys(periods),line.clock),dir=option(title+" direction",directions,line.dir),phase=number(title+" phase",line.phase,0,31);
      const strip=h("div.cycle-cells",{"aria-label":title+" cycle position"});
      const paint=()=>strip.replaceChildren(...line.values.map(v=>h("span",{text:key==="pitch"?(v<0?"–":kit?String(v):App.noteName(v)):v+"%"})));
      const hint=key==="pitch"?(kit?"Drum keys 36–43 · dash rests":"MIDI keys or C4, D#4 · dash rests"):key==="accent"?"Velocity · 0–100%":"Duration · 0–400% of the pitch clock";
      input.dataset.tip=hint;input.onchange=()=>{
        const tokens=input.value.trim().split(/[\s,]+/).filter(Boolean);
        const values=tokens.map(s=>key==="pitch"?pitch(s):/^\d+$/.test(s)?Number(s):NaN);
        if(values.length>32 || values.some(v=>!Number.isInteger(v) || (key==="pitch"?(v!==-1 && (v<(kit?36:0) || v>(kit?43:127))):(v<0 || v>(key==="gate"?400:100))))){
          input.setCustomValidity("Use up to 32 steps. "+hint);input.reportValidity();return;
        }
        input.setCustomValidity("");line.values=values;paint();App.commit();
      };
      input.oninput=()=>input.setCustomValidity("");
      clock.onchange=()=>{line.clock=clock.value;App.commit();};
      dir.onchange=()=>{line.dir=dir.value;App.commit();};
      phase.onchange=()=>{if(phase.reportValidity()){line.phase=+phase.value;App.commit();}};
      col.append(h("section.cycle-lane",null,h("div.arr-row",null,field(title+" sequence",input),field("Clock · steps",clock),field("Direction",dir),field("Phase",phase)),strip));
      paint();indicators.push([strip,line]);
    }
    const from=number("Cycle start step",0,0,65536),len=number("Capture length in steps",App.Live.length(P,ti,P.sel.p),1,App.MAX_STEPS);
    const targets=App.ClipWrite.targets(ti),dest=option("Destination clip",targets.map(([i])=>App.PATS[i]),App.PATS[targets[0]?.[0]]);
    const destIndex=()=>Array.from(App.PATS).indexOf(dest.value);
    let E,base=0,first=0,queued=0,timer=null,playhead=-1,history=[];
    const stamp=s=>{
      const k=Math.floor(s),x=s-k;
      const boundary=i=>{const t=App.Conductor.time(P,i);return t+((i%2)?P.swing/200*(App.Conductor.time(P,i+1)-t):0);};
      return boundary(k)+(boundary(k+1)-boundary(k))*x;
    };
    const valid=()=>[...body.querySelectorAll("input")].every(el=>el.reportValidity());
    function tick(){
      if(P!==App.P || !node.open){stop();return;}
      const now=E.ctx.currentTime;
      if(now>base+stamp(queued)+.15)queued=Math.max(queued,Math.floor(App.Conductor.step(P,now-base)));
      while(base+stamp(queued)<now+.12){
        const window=events(config,queued,queued+1);
        for(const e of window){
          const t=base+stamp(e.time);E.play(ti,e.note,e.v,t,Math.max(.002,stamp(e.time+e.gate)-stamp(e.time)));
          history.push(e);
        }
        queued++;
      }
      playhead=Math.max(first,App.Conductor.step(P,now-base));const cutoff=playhead-App.MAX_STEPS-2;
      while(history.length && history[0].time<cutoff)history.shift();
      for(const [strip,line] of indicators){const idx=laneIndex(line,playhead);Array.from(strip.children).forEach((cell,i)=>cell.classList.toggle("current",i===idx));}
      read.textContent="Step "+Math.floor(playhead)+" · "+(App.Conductor.position(P,Math.floor(playhead)).bar+1)+" bar";
      recent.disabled=!dest.options.length || playhead<first+Number(len.value);
    }
    function stop(){
      if(timer==null)return;
      clearInterval(timer);timer=null;E?.releaseClip(ti,E.ctx.currentTime);
      play.textContent="Audition";play.setAttribute("aria-pressed","false");
      for(const [strip] of indicators)for(const c of strip.children)c.classList.remove("current");
    }
    const read=h("output.arr-status"),play=btn("Audition","Run all three clocks from the start step on this track",()=>{
      if(timer!=null){stop();return;}if(!valid())return;
      if(!config.pitch.values.some(n=>n>=0)){status.textContent="Enter pitches in the Pitch sequence.";return;}
      E=App.audio();if(!E)return;if(App.Seq.playing)App.Seq.stop();
      first=queued=+from.value;history=[];base=Math.max(.16,E.ctx.currentTime+.05)-stamp(first);
      play.textContent="Stop audition";play.setAttribute("aria-pressed","true");timer=setInterval(tick,25);tick();
    });
    function print(last){
      status.textContent="";
      if(!valid() || !dest.options.length)return;
      if(!config.pitch.values.some(n=>n>=0)){status.textContent="Enter pitches in the Pitch sequence.";return;}
      const length=+len.value,start=last?Math.floor(playhead)-length:+from.value;
      if(last && start<first){status.textContent="Audition a full capture length first.";return;}
      const ev=last?history:events(config,start,start+length);
      try{const ns=notes(ev,start,length);App.ClipWrite.write(ti,destIndex(),ns,length);stop();node.close();App.UI.msg(ns.length+" CYCLE NOTES WRITTEN");}
      catch(err){status.textContent=err.message;}
    }
    const written=btn("Print range","Write the chosen start and length as ordinary editable notes",()=>print(false));
    const recent=btn("Capture last","Write the actual recently auditioned events including live control changes",()=>print(true));
    written.disabled=!targets.length;recent.disabled=true;
    body.append(h("h2",{text:"Cycle sequencer · "+T.name}),col,h("div.arr-row",null,field("Start step",from),play,read),
      h("div.arr-row",null,field("Length · steps",len),field("Empty clip",dest),written,recent),
      status);
    if(!targets.length)status.textContent="All eight clips on this track contain material.";
    node.append(body);node.addEventListener("close",stop,{once:true});node.showModal();
  }
  App.Cycles={open,events,notes,laneIndex};
})();
