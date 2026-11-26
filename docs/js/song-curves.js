/* Absolute automation on the song ruler. Split segments retain their curvature. */
(() => {
  "use strict";
  const {h,btn}=App.UI, {clamp}=App, maxTime=65536, maxPoints=2048;
  const names={vol:"Volume",pan:"Pan",filter:"Track filter",cutoff:"Instrument cutoff",dly:"Delay send",rev:"Reverb send",macro1:"Macro 1",macro2:"Macro 2",macro3:"Macro 3",macro4:"Macro 4"};
  const tidy=x=>Math.round(x*1e6)/1e6;
  function clean(points) {
    const sorted=new Map();
    for(const p of (Array.isArray(points)?points:[]).slice(0,maxPoints)){
      if(!p || !Number.isFinite(p.s) || !Number.isFinite(p.v))continue;
      const s=clamp(Math.round(p.s),0,maxTime);
      sorted.set(s,{s,v:clamp(p.v,0,1),bend:Number.isFinite(p.bend)?clamp(p.bend,-1,1):0,
        ...(p.hold?{hold:true}:{}),...(Number.isFinite(p.in)?{in:clamp(p.in,0,1)}:{})});
    }
    return [...sorted.values()].sort((a,b)=>a.s-b.s);
  }
  App.extendProject({load(P,raw){
    P.songCurves=Array.from({length:8},(_,i)=>{
      const bank={};
      for(const k of App.automationKeys){const points=clean(raw.songCurves?.[i]?.[k]);if(points.length)bank[k]=points;}
      return bank;
    });
  }});
  function index(points,s){
    let lo=0,hi=points.length;
    while(lo<hi){const m=(lo+hi)>>1;if(points[m].s<=s)lo=m+1;else hi=m;}
    return lo-1;
  }
  function value(points,s,left=false){
    const i=index(points,s),a=points[i],b=points[i+1];
    if(!a)return b.in??b.v;
    if(left && a.s===s)return points[i-1]?.hold?points[i-1].v:a.in??a.v;
    if(!b || a.hold)return a.v;
    const x=(s-a.s)/(b.s-a.s);
    return a.v+((b.in??b.v)-a.v)*(x+a.bend*x*(1-x));
  }
  const end=P=>Math.max(0,...(P.songCurves||[]).flatMap(bank=>Object.values(bank).map(l=>l.at(-1)?.s||0)));
  // The engine, MIDI writer and macro rack accept local clip coordinates. Compile
  // one window at a time so the song ruler can cross any clip or slot boundary.
  function schedule(E,P,ti,clip,step,at,t,next,enabled){
    const track=P.tracks[ti], bank=enabled && P.songCurves?.[ti], keys=bank && Object.keys(bank);
    if(!keys?.length){E.automate?.(ti,track,clip,step,t,next);return;}
    const divisions=keys.some(k=>bank[k][index(bank[k],at)]?.bend)?4:1;
    for(let j=0;j<divisions;j++){
      const a=j/divisions,b=(j+1)/divisions,lanes={};
      for(const k of App.automationKeys){
        const p=bank[k], c=clip?.[k]; if(!p && !c)continue;
        const get=(x,left)=>p?value(p,at+x,left):App.curveValue(c,step+x,0,left?"left":"right");
        const initial=get(a,false),last=get(b,false),incoming=get(b,true);
        lanes[k]={mode:p?(p[index(p,at+a)]?.hold?"step":"linear"):App.curveShape(c,step+a),
          points:[{s:0,v:initial},{s:1,v:last,in:incoming}]};
      }
      E.automate?.(ti,track,lanes,0,t+(next-t)*a,t+(next-t)*b);
    }
  }
  // Reconstruct a range from exact boundary values and the quadratic midpoint.
  // A distinct incoming value preserves instantaneous jumps at splice points.
  function splice(points,parts){
    if(!points.length)return [];
    const result=new Map(),last=points.at(-1).s;
    let previous;
    for(const part of parts){
      const from=part.from,to=part.to, scale=part.scale||1;
      if(from==null){
        const v=previous??value(points,parts.find(p=>p.from!=null)?.from||0);
        result.set(to,{s:to,v,hold:true,bend:0});previous=v;continue;
      }
      const right=Number.isFinite(part.len)?from+part.len:Math.max(from,last);
      const bounds=[from,...points.filter(p=>p.s>from && p.s<right).map(p=>p.s),...(right>from?[right]:[])];
      for(let i=0;i<bounds.length;i++){
        const a=bounds[i],b=bounds[i+1],s=to+Math.round((a-from)*scale),v=value(points,a),original=points[index(points,a)];
        const incoming=i===0 && previous!=null?previous:value(points,a,true);
        const p={s,v,bend:0};
        if(Math.abs(incoming-v)>1e-7)p.in=incoming;
        if(b!=null){
          const stop=value(points,b,true);
          if(original?.hold)p.hold=true;
          else if(Math.abs(stop-v)>1e-8)p.bend=clamp(tidy(4*(value(points,(a+b)/2)-v)/(stop-v)-2),-1,1);
        }
        result.set(s,p);
      }
      previous=value(points,right,true);
    }
    if(result.size>maxPoints || [...result.keys()].some(s=>s>maxTime))throw Error("Automation exceeds the song lane capacity.");
    return [...result.values()].sort((a,b)=>a.s-b.s);
  }
  function relocate(P,parts){
    return (P.songCurves||[]).map(bank=>Object.fromEntries(Object.entries(bank).map(([k,p])=>[k,splice(p,parts)])));
  }
  function editRange(points,a,b,copies,stretch){
    if(!(b>a))throw Error("Choose a range with a positive length.");
    const parts=[{from:0,to:0,len:a}];let offset=a;
    for(let i=0;i<copies;i++){parts.push({from:a,to:offset,len:b-a,scale:stretch});offset+=Math.round((b-a)*stretch);}
    parts.push({from:b,to:offset,len:Infinity});return splice(points,parts);
  }
  const field=(label,ctl)=>h("label.arr-field",null,label,ctl);
  const num=(name,value,min,max,step=1)=>h("input",{type:"number","aria-label":name,value,min,max,step,required:true});
  function editor(host,D,changed){
    host.classList.add("song-envelope-controls");
    let ti=D.sel.t,key="vol",picked=null,span=Math.min(maxTime,Math.max(App.spb(D)*4,App.Conductor.layout(D,D.chain).at(-1)?.end||0,end(D)));
    const track=h("select",{"aria-label":"Automation track"},D.tracks.map((t,i)=>h("option",{value:i,text:t.name})));
    const target=h("select",{"aria-label":"Song automation target"},App.automationKeys.map(k=>h("option",{value:k,text:names[k]||k})));
    const canvas=h("canvas.song-curve-plot",{tabindex:0,role:"application","aria-label":"Song envelope. Click to add, drag a point, right-click to delete."});
    const view=num("Visible steps",span,1,maxTime), pos=num("Point step",0,0,maxTime),level=num("Point value percent",50,0,100,.1), bend=num("Outgoing bend",0,-100,100);
    const mode=h("select",{"aria-label":"Outgoing interpolation"},[h("option",{value:"curve",text:"Ramp"}),h("option",{value:"hold",text:"Hold"})]);
    const start=num("Range start step",0,0,maxTime),stop=num("Range end step",Math.min(App.spb(D),span),1,maxTime),repeat=num("Total repetitions",2,1,32),scaled=num("Stretched length in steps",stop.value,1,maxTime);
    const status=h("output.arr-status",{role:"status"}), read=h("output.arr-status");
    const points=()=>D.songCurves[ti][key]||[];
    const set=ps=>{if(ps.length)D.songCurves[ti][key]=ps;else delete D.songCurves[ti][key];changed();};
    const row=(...children)=>h("div.arr-row",null,...children);
    const parsePoint=()=>({s:+pos.value,v:+level.value/100,bend:+bend.value/100,...(mode.value==="hold"?{hold:true}:{})});
    function draw(){
      const r=canvas.getBoundingClientRect();if(!r.width || !r.height)return;
      const d=devicePixelRatio||1;canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);
      const g=canvas.getContext("2d");g.scale(d,d);const w=r.width,ht=r.height;
      const x=s=>9+(w-18)*s/span,y=v=>ht-19-(ht-28)*v;
      const ps=points(), active=picked==null?null:ps.find(p=>p.s===picked);
      g.fillStyle=App.C.r1;g.fillRect(0,0,w,ht);g.font="10px 'IBM Plex Mono',monospace";
      const n=App.Conductor.position(D,span).bar+1,stride=Math.max(1,Math.ceil(n/(w/68)));
      for(let bar=0;bar<n;bar+=stride){const s=App.Conductor.barStart(D,bar);g.fillStyle=App.C.ln2;g.fillRect(x(s),4,1,ht-20);g.fillStyle=App.C.t2;if(x(s)<w-24)g.fillText("B"+(bar+1),x(s)+3,ht-4);}
      if(ps.length){g.strokeStyle=App.C.t1;g.lineWidth=2;g.beginPath();for(let px=0;px<=w-18;px++){const yy=y(value(ps,span*px/(w-18)));if(px)g.lineTo(9+px,yy);else g.moveTo(9,yy);}g.stroke();}
      for(const p of ps){if(p.s>span)break;g.fillStyle=p.s===picked?App.C.am:App.C.t1;g.fillRect(x(p.s)-3,y(p.v)-3,7,7);}
      read.textContent=ps.length+" points · "+(active?"step "+active.s+" · "+(active.v*100).toFixed(1)+"%":"click to add a point");
    }
    function focusPoint(p){picked=p?.s??null;if(p){pos.value=p.s;level.value=tidy(p.v*100);bend.value=tidy(p.bend*100);mode.value=p.hold?"hold":"curve";}draw();}
    function put(p,old=picked){
      const ps=points().filter(k=>k.s!==old && k.s!==p.s);
      if(ps.length>=maxPoints){status.textContent="Maximum 2048 points per lane.";return;}
      set([...ps,p].sort((a,b)=>a.s-b.s));focusPoint(p);
    }
    function del(){if(picked===null)return;set(points().filter(p=>p.s!==picked));focusPoint(null);}
    const coord=e=>{const r=canvas.getBoundingClientRect();return {s:clamp(Math.round((e.clientX-r.left-9)/(r.width-18)*span),0,span),v:clamp(tidy((r.bottom-e.clientY-19)/(r.height-28)),0,1)};};
    let drag=null;
    canvas.onpointerdown=e=>{
      if(e.button!==0 && e.button!==2)return;
      const at=coord(e),r=canvas.getBoundingClientRect(),best=points().find(p=>Math.abs(p.s-at.s)*(r.width-18)/span<9 && Math.abs(p.v-at.v)*(r.height-28)<10);
      if(e.button===2){if(best){focusPoint(best);del();}return;}
      canvas.setPointerCapture(e.pointerId);
      if(best)focusPoint(best);else put({...at,bend:0},null);
      drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    };
    canvas.oncontextmenu=e=>e.preventDefault();
    canvas.onpointermove=e=>{
      if(!drag || e.pointerId!==drag.id || Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)<2)return;
      const ps=points(),i=ps.findIndex(p=>p.s===picked);if(i<0)return;
      // A dragged point stops beside its neighbours instead of replacing them.
      const at=coord(e);at.s=clamp(at.s,(ps[i-1]?.s ?? -1)+1,(ps[i+1]?.s ?? maxTime+1)-1);
      put({...ps[i],...at});
    };
    canvas.onlostpointercapture=()=>{drag=null;};
    canvas.onkeydown=e=>{
      if(e.key==="Delete" || e.key==="Backspace"){e.preventDefault();del();}
      if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();const ps=points(),i=ps.findIndex(p=>p.s===picked);focusPoint(ps[clamp(i+(e.key==="ArrowLeft"?-1:1),0,ps.length-1)]);}
    };
    const selectLane=()=>{ti=+track.value;key=target.value;focusPoint(points()[0]);status.textContent="";};
    track.value=ti;track.onchange=target.onchange=selectLane;
    view.onchange=()=>{if(view.reportValidity()){span=+view.value;draw();}};
    function range(isRepeat){
      const inputs=[start,stop,isRepeat?repeat:scaled];if(!inputs.every(el=>el.reportValidity()))return;
      if(!points().length){status.textContent="Add points to this lane first.";return;}
      try{const a=+start.value,b=+stop.value,scale=isRepeat?1:+scaled.value/(b-a);
        const result=editRange(points(),a,b,isRepeat?+repeat.value:1,scale);set(result);span=Math.max(span,result.at(-1).s);view.value=span;focusPoint(null);status.textContent="Range updated.";
      }catch(e){status.textContent=e.message;}
    }
    host.append(row(field("Track",track),field("Target",target),field("Visible steps",view),read),canvas,
      row(field("Step",pos),field("Value %",level),field("Shape",mode),field("Bend %",bend),
        btn("Set point","Add or update this point at its musical position",()=>{if([pos,level,bend].every(el=>el.reportValidity())){const p=parsePoint();span=Math.max(span,p.s);view.value=span;put(p,p.s);}}),btn("Delete point","Remove selected point",del)),
      row(field("Range from",start),field("To step",stop),field("Copies",repeat),btn("Repeat range","Repeat the range and shift later points",()=>range(true)),
        field("Length",scaled),btn("Stretch range","Fit range to this many steps and shift later points",()=>range(false))),
      h("p.dlg-tip",{text:"SONG LANES RUN ACROSS PATTERNS · A SONG LANE OVERRIDES CLIP AUTOMATION FOR ITS TARGET"}),status);
    selectLane();requestAnimationFrame(draw);
    const observer=new ResizeObserver(()=>canvas.isConnected?draw():observer.disconnect());observer.observe(canvas);
  }
  App.SongCurves={value,end,schedule,relocate,editRange,editor};
})();
