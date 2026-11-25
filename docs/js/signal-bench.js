/* Calibrated electrical measurements of the same insert graph used for playback and export. */
(() => {
  "use strict";
  const {h,btn} = App.UI;
  const rate=48000, windowSize=12288, settle=6144, pulseAt=4800, toneAt=14400;
  const sweepBins=Array.from(new Set(Array.from({length:43},(_,i)=>Math.round(20*1000**(i/42)*windowSize/rate))));
  const db = amplitude => 20*Math.log10(Math.max(1e-7,amplitude));
  const frequency = bin => bin*rate/windowSize;
  const labelHz = hz => hz>=1000 ? (hz/1000).toFixed(hz%1000?1:0)+"k" : String(Math.round(hz));
  const defaults = () => ({mode:"sweep",tone:1000,level:-18,drive:"mid",type:"track",index:App.P.sel.t});
  let session, owner;
  function state() {
    if (owner!==App.P) {owner=App.P;session={config:defaults(),result:null,reference:null};}
    return session;
  }

  // Stimulus tones occupy integer DFT bins. Measure coherent bins over the same
  // full cycles on both taps, after allowing filters and dynamics to settle.
  function amplitude(data,start,bin) {
    const w=2*Math.PI*bin/windowSize;
    let real=0,imag=0;
    for (let i=0;i<windowSize;i++) {
      const sample=data[start+i];
      real+=sample*Math.cos(w*i); imag+=sample*Math.sin(w*i);
    }
    return 2*Math.hypot(real,imag)/windowSize;
  }
  async function measure(project,config) {
    const {mode,type,index,drive}=config;
    const level=App.clamp(config.level,-48,-3), bin=Math.round(App.clamp(config.tone,30,8000)*windowSize/rate);
    const inputGain=10**(level/20), bins=mode==="sweep"?sweepBins:[bin];
    const segment=settle+windowSize, frames=toneAt+segment*bins.length;
    const ctx=new OfflineAudioContext(4,frames,rate);
    const stems=[{type,index,point:"rack-in"},{type,index,point:"post"}];
    const engine=App.Engine(ctx,()=>project,{offline:true,stems}); engine.syncAll();
    const stimulus=ctx.createBuffer(2,frames,rate), left=stimulus.getChannelData(0), right=stimulus.getChannelData(1);
    left[pulseAt]=inputGain;
    bins.forEach((b,j)=>{
      const start=toneAt+j*segment,w=2*Math.PI*b/windowSize;
      for (let i=0;i<segment;i++) left[start+i]=inputGain*Math.sin(w*i);
    });
    if (drive==="mid") right.set(left);
    else if (drive==="side") for(let i=0;i<frames;i++)right[i]=-left[i];
    const src=ctx.createBufferSource();src.buffer=stimulus;src.connect(engine.rack.pickTap(type,index,"rack-in"));src.start(0);
    const capture=await ctx.startRendering(), pre=capture.getChannelData(0), post=capture.getChannelData(2);
    // Left is driven at the same reference amplitude in all three stereo modes.
    let peak=0,peakSample=pulseAt;
    for (let i=pulseAt;i<toneAt;i++){
      const value=Math.abs(post[i]);if(value>peak){peak=value;peakSample=i;}
    }
    let points,thd=null;
    const start=toneAt+settle, a=amplitude(pre,start,bins[0]), b=amplitude(post,start,bins[0]);
    if (mode==="tone") {
      const count=Math.min(10,Math.floor((windowSize/2-1)/bin));
      points=Array.from({length:count},(_,i)=>({hz:frequency(bin)*(i+1),db:db(amplitude(post,start,bin*(i+1))/Math.max(a,1e-7))}));
      if (b>1e-6) thd=100*Math.sqrt(points.slice(1).reduce((energy,p)=>energy+10**(p.db/10),0))*a/b;
    } else points=bins.map((n,j)=>{
      const offset=start+j*segment;
      return {hz:frequency(n),db:db(amplitude(post,offset,n)/Math.max(1e-7,amplitude(pre,offset,n)))};
    });
    const target=type==="track" ? project.tracks[index].name : project.rack.groups[index].name;
    return {mode,drive,level,tone:frequency(bin),points,target,thd,latency:peak>1e-6?1000*(peakSample-pulseAt)/rate:null};
  }
  function compatible(a,b) {
    return a && b && a.mode===b.mode && a.drive===b.drive && a.level===b.level && (a.mode==="sweep" || a.tone===b.tone);
  }
  function plot(canvas,latest,reference) {
    const dpi=App.UI.fit(canvas), g=canvas.getContext("2d"), width=canvas.width,height=canvas.height;
    const left=40*dpi,right=16*dpi,top=15*dpi,bottom=22*dpi,W=width-left-right,H=height-top-bottom;
    g.fillStyle=App.C.pn;g.fillRect(0,0,width,height);
    if(W<=0 || H<=0 || !latest)return;
    const tone=latest.mode==="tone", floor=tone?-100:-60, ceiling=24;
    const x=hz=>left+Math.log(hz/19)/Math.log(21000/19)*W;
    const y=value=>top+(ceiling-App.clamp(value,floor,ceiling))/(ceiling-floor)*H;
    const line=(x1,y1,x2,y2,color,width=dpi)=>{
      g.beginPath();g.strokeStyle=color;g.lineWidth=width;g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();
    };
    g.font=Math.round(10*dpi)+"px 'IBM Plex Mono',monospace";g.textBaseline="middle";
    g.textAlign="right";
    for(let n=floor;n<=ceiling;n+=tone?20:12){line(left,y(n),width-right,y(n),n===0?App.C.t3:App.C.ln2);g.fillStyle=App.C.t3;g.fillText(n,left-5*dpi,y(n));}
    const col=i=>left+W*(i+.5)/latest.points.length;
    g.textAlign="center";
    const marks=tone?latest.points.map((p,i)=>[col(i),"H"+(i+1)]):[20,50,100,200,500,1000,2000,5000,10000,20000].map(f=>[x(f),labelHz(f)]);
    for(const [cx,label] of marks){line(cx,top,cx,height-bottom,App.C.ln);g.fillStyle=App.C.t3;g.fillText(label,cx,height-bottom+12*dpi);}
    const traces=compatible(latest,reference)?[[latest,App.C.t1],[reference,App.C.am]]:[[latest,App.C.t1]];
    for(const [trace,color] of traces){
      if(tone){
        const offset=traces.length===1?0:trace===latest?-2*dpi:2*dpi;
        trace.points.forEach((p,i)=>line(col(i)+offset,y(floor),col(i)+offset,y(p.db),color,3*dpi));
      } else {
        g.beginPath();g.strokeStyle=color;g.lineWidth=2*dpi;
        if(trace!==latest)g.setLineDash([5*dpi,3*dpi]);
        trace.points.forEach((p,i)=>i?g.lineTo(x(p.hz),y(p.db)):g.moveTo(x(p.hz),y(p.db)));g.stroke();g.setLineDash([]);
      }
    }
  }
  function open(){
    const s=state(), cfg=s.config, dialog=App.Workspace.begin("Signal bench");dialog.classList.add("rack-dialog","bench-dialog");
    const field=(name,control)=>h("label.rack-field",null,h("span",{text:name}),control);
    function select(name,options,value,fn){
      const el=h("select",{"aria-label":name},options.map(([key,title])=>h("option",{value:key,text:title})));
      el.value=value;el.onchange=()=>fn(el.value);return el;
    }
    function number(name,key,min,max){
      const el=h("input",{type:"number","aria-label":name,value:cfg[key],min,max,step:1});
      el.onchange=()=>{el.value=cfg[key]=Number.isFinite(el.valueAsNumber)?App.clamp(el.valueAsNumber,min,max):cfg[key];};return el;
    }
    const sources=[...App.P.tracks.map((t,i)=>["t"+i,"Track "+(i+1)+" · "+t.name]),...App.P.rack.groups.map((b,i)=>["b"+i,b.name])];
    const target=select("Bench path",sources,(cfg.type==="track"?"t":"b")+cfg.index,v=>{cfg.type=v[0]==="t"?"track":"group";cfg.index=+v.slice(1);});
    const tone=number("Test frequency","tone",30,8000);
    const kind=select("Test signal",[["sweep","Stepped sine sweep"],["tone","Sine harmonics"]],cfg.mode,v=>{cfg.mode=v;tone.disabled=v!=="tone";});
    tone.disabled=cfg.mode!=="tone";
    const drive=select("Stereo excitation",[["mid","Mid · L = R"],["side","Side · L = −R"],["left","Left only"]],cfg.drive,v=>cfg.drive=v);
    const form=h("div.rack-row",null,field("Insert path",target),field("Test signal",kind),field("Tone · Hz",tone),field("Input · dBFS",number("Bench input level","level",-48,-3)),field("Stereo drive",drive));
    const canvas=h("canvas.bench-plot",{"aria-label":"Measured response plot"});
    const readout=h("output.bench-stats",{"aria-live":"polite"}), legend=h("div.bench-legend");
    const reference=btn("Hold A","Store the measured trace for comparison after editing a rack",()=>{s.reference=s.result;refresh();});
    const clear=btn("Clear A","Clear the retained reference measurement",()=>{s.reference=null;refresh();});
    const run=btn("Measure","Render a calibrated probe through this insert path and compare input and output",async()=>{
      const project=App.P;
      run.disabled=true;form.inert=true;readout.textContent="Measuring…";
      try{
        const result=await measure(project,{...cfg});
        if(project===App.P)s.result=result;
      }catch(err){readout.textContent="Measurement failed · "+err.message;return;}
      finally{run.disabled=false;form.inert=false;}
      if(dialog.open)refresh();
    });
    const format=result=>result.target+" · "+(result.mode==="tone"?labelHz(result.tone)+" Hz":"20 Hz–20 kHz")+" · "+result.level+" dBFS · "+result.drive;
    function refresh(){
      reference.disabled=!s.result;clear.disabled=!s.reference;
      legend.replaceChildren();
      if(s.result){
        const r=s.result, p=r.points[0], delay=r.latency===null?"—":r.latency.toFixed(2)+" ms";
        readout.textContent="Impulse peak delay "+delay+(r.mode==="tone"?"   |   Fundamental "+p.db.toFixed(2)+" dB   |   THD (H2–H"+r.points.length+") "+(r.thd===null?"—":r.thd.toFixed(3)+"%"):"   |   Readout in dB relative to measured input");
        legend.append(h("span",{text:"Current · "+format(r)}));
      } else readout.textContent="Choose a path and measure its response.";
      if(s.reference)legend.append(h("span.ref",{text:"A · "+format(s.reference)+(compatible(s.result,s.reference)?"":" · match stimulus to overlay")}));
      plot(canvas,s.result,s.reference);
    }
    dialog.append(h("div.dlg-body",null,h("div.rack-head",null,h("h2",{text:"Signal bench"}),btn("Close","Return to the console",()=>dialog.close())),form,
      h("div.rack-row.bench-actions",null,run,reference,clear),canvas,legend,readout,
      h("p.rack-note",{text:"Offline insert input → output, measured on L. An impulse precedes each test. External sidechain keys are silent."})));
    dialog.showModal();refresh();
    canvas.onpointermove=e=>{
      if(!s.result)return;
      const rect=canvas.getBoundingClientRect(), fraction=App.clamp((e.clientX-rect.left-40)/(rect.width-56),0,1);
      const points=s.result.points, hz=19*(21000/19)**fraction;
      const p=s.result.mode==="tone"?points[Math.min(points.length-1,Math.floor(fraction*points.length))]:points.reduce((a,b)=>Math.abs(Math.log(a.hz/hz))<Math.abs(Math.log(b.hz/hz))?a:b);
      canvas.title=p.hz.toFixed(1)+" Hz · "+p.db.toFixed(2)+" dB";
    };
    const observer=new ResizeObserver(()=>plot(canvas,s.result,s.reference));observer.observe(canvas);
    dialog.addEventListener("close",()=>observer.disconnect(),{once:true});
  }
  App.SignalBench={open,measure};
})();
