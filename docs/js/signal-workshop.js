/* Range resampling, spectral takes and user impulse responses share the project audio pool. */
(() => {
  "use strict";
  const { h, btn }=App.UI, {clamp}=App;
  App.extendProject({
    load(P,raw){P.impulse={sample:typeof raw?.impulse?.sample==="string"?raw.impulse.sample.slice(0,128):""};},
    sampleIds(P,ids){if(P.impulse?.sample)ids.add(P.impulse.sample);},
    remapSample(P,from,to){if(P.impulse?.sample===from)P.impulse.sample=to;}
  });
  const MAX_IR=30;
  const irCache=new WeakMap();
  const impulseDuration=P=>Math.min(MAX_IR,App.samples.get(P.impulse?.sample)?.buffer.duration||0);
  function impulse(P,sr){
    const src=App.samples.get(P.impulse?.sample)?.buffer;
    if(!src)return null;
    const channels=[1,2,4].includes(src.numberOfChannels)?src.numberOfChannels:2;
    const length=Math.max(1,Math.round(Math.min(MAX_IR,src.duration)*sr));
    if(src.sampleRate===sr && src.length===length && src.numberOfChannels===channels)return src;
    let rates=irCache.get(src);
    if(!rates)irCache.set(src,rates=new Map());
    if(rates.has(sr))return rates.get(sr);
    const out=new AudioBuffer({length,sampleRate:sr,numberOfChannels:channels});
    for(let c=0;c<channels;c++){
      const a=src.getChannelData(c),b=out.getChannelData(c);
      for(let i=0;i<length;i++){
        const pos=i*src.sampleRate/sr,j=Math.min(a.length-1,Math.floor(pos)),f=pos-j;
        b[i]=a[j]+(a[Math.min(a.length-1,j+1)]-a[j])*f;
      }
    }
    rates.set(sr,out);return out;
  }
  function dialog(title){
    const dlg=App.Workspace.begin(title);dlg.classList.add("ast-dialog","sw-dialog");
    const body=h("div.dlg-body.ast-body"), status=h("output.ast-status",{role:"status"});
    body.append(h("div.ast-head",null,h("h2",{text:title}),h("span.sp"),btn("Close","RETURN TO CONSOLE",()=>dlg.close())));
    dlg.append(body);dlg.showModal();return {dlg,body,status};
  }
  function field(label,node){
    node.setAttribute("aria-label",label);
    return h("label.ast-field",null,h("span",{text:label}),node);
  }
  function options(items,value){
    const n=h("select",null,items.map(([v,label])=>h("option",{value:v,text:label})));
    n.value=String(value);return n;
  }
  function numeric(v,min,max,step="any"){
    return h("input",{type:"number",min,max,step,value:+v.toFixed(5)});
  }
  const toolbar=(...children)=>h("div.ast-toolbar",null,...children);
  function takeBuffer(src,from,to){
    const start=Math.max(0,Math.round(from*src.sampleRate));
    const length=Math.max(1,Math.min(src.length-start,Math.round((to-from)*src.sampleRate)));
    const out=new AudioBuffer({length,sampleRate:src.sampleRate,numberOfChannels:src.numberOfChannels});
    for(let c=0;c<src.numberOfChannels;c++)out.copyToChannel(src.getChannelData(c).subarray(start,start+length),c);
    return out;
  }
  function openImpulse(){
    const P=App.P, {dlg,body,status}=dialog("Convolution impulse");
    const selector=options([["","GENERATED ROOM"],...[...App.sampleIds(P)].filter(id=>App.samples.has(id)).map(id=>[id,App.samples.get(id).name])],P.impulse.sample);
    const name=()=>App.samples.get(P.impulse.sample)?.name;
    function show(){
      status.textContent=name()?name()+" · "+impulseDuration(P).toFixed(3)+" S · REVERB SEND RETURN":
        P.impulse.sample?"IMPULSE AUDIO UNAVAILABLE":"GENERATED ROOM · SIZE AND DAMPING ON MASTER";
    }
    function choose(id){
      if(P!==App.P || !dlg.open)return;
      if(id && !App.samples.has(id))return;
      P.impulse.sample=id;App.E?.syncFx();App.Fx.build();App.commit();show();
    }
    let request=0;
    async function load(file){
      const token=++request;status.textContent="DECODING IMPULSE…";
      try{
        const id=await App.addSample(file.name.replace(/\.[^.]+$/,"").slice(0,40),file);
        if(!dlg.open || P!==App.P || token!==request)return;
        selector.append(h("option",{value:id,text:App.samples.get(id).name}));selector.value=id;choose(id);
      }catch{if(dlg.open && token===request)status.textContent="CANNOT DECODE IMPULSE";}
    }
    body.ondragover=e=>{if(e.dataTransfer.types.includes("Files"))e.preventDefault();};
    body.ondrop=e=>{const file=e.dataTransfer.files[0];if(file){e.preventDefault();e.stopPropagation();load(file);}};
    selector.onchange=()=>{request++;choose(selector.value);};
    body.append(toolbar(field("Impulse source",selector),btn("Import impulse…","LOAD A ROOM RESPONSE OR USE ANY SOUND AS A CONVOLUTION KERNEL",()=>App.pickFile("audio/*",files=>{if(files[0])load(files[0]);}))),
      h("p.dlg-tip",{text:"DROP AUDIO OR CHOOSE A PROJECT SAMPLE · ITS FIRST 30 S FEED THE STEREO REVERB RETURN"}),status);show();
  }

  // The scheduler reconstructs history from zero. Only the requested interval and
  // its release tail are copied out. Source and routed sends share one audio clock.
  async function resample(P,{type,index,point,from,to,tail,returns}){
    if(!["track","group","master"].includes(type) || !Number.isInteger(index) || index<0 || index>=(type==="group"?4:8))throw Error("INVALID SOURCE");
    const stems=type==="master"?undefined:[{type,index,point}];
    if(stems && point==="post" && returns){
      const onlyTracks=type==="track"?[index]:P.rack.strips.flatMap((s,i)=>s.bus===index?[i]:[]);
      stems.push({type:"returns",onlyTracks});
    }
    const {full,cut}=await App.Seq.renderSong({project:P,stems,range:{from,to,tail}});
    const out=new AudioBuffer({numberOfChannels:2,sampleRate:full.sampleRate,length:Math.max(1,full.length-cut)});
    for(let c=0;c<2;c++){
      const dest=out.getChannelData(c),direct=full.getChannelData(c).subarray(cut);
      dest.set(direct);
      if(stems?.length===2){const wet=full.getChannelData(c+2).subarray(cut);for(let i=0;i<dest.length;i++)dest[i]+=wet[i];}
    }
    return out;
  }
  function openResample(ti=App.P.sel.t,cursor=0,region){
    const P=App.P,{dlg,body,status}=dialog("Resample range");
    const tracks=P.tracks.map((t,i)=>[i,App.pad2(i+1)+" "+t.name]);
    const sources=[...tracks.map(([i,n])=>["t"+i,n]),...P.rack.groups.map((g,i)=>["g"+i,g.name||"BUS "+(i+1)]),["master","MASTER OUTPUT"]];
    const source=options(sources,"t"+ti),point=options([["pre","BEFORE FX"],["post","AFTER FX"]],"post");
    const wet=h("input",{type:"checkbox","aria-label":"Include shared sends"});wet.checked=true;
    const max=App.Seq.projectSteps(P);
    const start=clamp(region?.at ?? cursor,0,Math.max(0,max-.001));
    const finish=region?App.Conductor.step(P,App.Conductor.time(P,region.at)+region.len*region.repeats):App.Conductor.barsAfter(P,start,1);
    const from=numeric(start,0,max),to=numeric(Math.min(max,finish),.0001,max),tail=numeric(0,0,30,.01);
    const target=options([["region","AUDIO REGION"],["sampler","SAMPLER"]],"region");
    const empty=P.tracks.findIndex((t,i)=>i!==ti && !t.clips.some(c=>c.length) && !P.audio.regions.some(r=>r.track===i) && t.kind==="smp" && !t.smp.id);
    const destination=options(tracks,empty<0?ti:empty);
    let busy=false;
    const sync=()=>{
      point.disabled=source.value==="master";wet.disabled=point.disabled || point.value==="pre";
      status.textContent=target.value==="sampler"?"The rendered audio becomes the destination instrument. Undo restores its previous settings.":
        "Places a new region at the selection start and keeps the source material.";
    };
    source.onchange=point.onchange=target.onchange=sync;
    const render=btn("Render range","RENDER THE SELECTED RANGE AND PLACE THE STEREO RESULT",async()=>{
      if(busy)return;
      const a=from.valueAsNumber,b=to.valueAsNumber,z=tail.valueAsNumber, dest=+destination.value, sampler=target.value==="sampler";
      if(![a,b,z].every(Number.isFinite) || a<0 || b<=a || b>max || z<0 || z>30){status.textContent="CHECK THE STEP RANGE AND TAIL";return;}
      if(!sampler && (P.audio.regions.length>=2048 || a>8192)){status.textContent="TIMELINE LIMIT REACHED";return;}
      const id=source.value,index=id==="master"?0:+id.slice(1), name=(source.selectedOptions[0].text+" PRINT").slice(0,40);
      busy=true;const controls=body.querySelectorAll("input,select,button:not(:first-child)");
      for(const n of controls)if(n.textContent!=="Close")n.disabled=true;
      status.textContent="RENDERING RANGE…";
      try{
        const buffer=await resample(P,{type:id==="master"?"master":id[0]==="g"?"group":"track",index,point:point.value,from:a,to:b,tail:z,returns:wet.checked});
        if(!dlg.open || P!==App.P)return;
        if(!sampler && buffer.duration>1200)throw Error("TIMELINE REGION EXCEEDS 20 MIN");
        const sample=App.addBuffer(name,buffer,{floating:true});
        if(sampler){App.assignBufferToSampler(dest,sample);App.select(dest,P.sel.p);dlg.close();App.UI.msg(name+" · ASSIGNED TO "+tracks[dest][1]);}
        else {
          App.AudioStudio.addRegion(sample,dest,a);App.select(dest,P.sel.p);App.commit();App.AudioStudio.refreshPlayback();App.AudioStudio.open();
        }
      }catch(e){if(dlg.open){for(const n of controls)n.disabled=false;sync();status.textContent=e.message||"RENDER FAILED";}}
      finally{busy=false;}
    },"confirm-action");
    body.append(toolbar(field("Source",source),field("Tap",point),h("label.sw-check",null,wet,"Include shared sends")),
      toolbar(field("From · step",from),field("To · step",to),field("Tail · s",tail)),
      toolbar(field("Destination",target),field("Destination track",destination),render),status);sync();
  }

  function openSpectral(r){
    const P=App.P,take=r.takes[r.take],source=App.samples.get(take.sample)?.buffer;
    if(!source){App.UI.msg("SOURCE AUDIO UNAVAILABLE");return;}
    const seconds=Math.min(r.len,source.duration-take.offset);
    if(seconds<.001){App.UI.msg("EMPTY TAKE");return;}
    const {dlg,body,status}=dialog("Spectral editor"), sr=source.sampleRate, top=sr/2;
    const sw=420,sh=150, image=document.createElement("canvas");image.width=sw;image.height=sh;
    const canvas=h("canvas.sw-spectrum",{width:840,height:300,"aria-label":"Drag to select time and frequency",role:"img"});
    let box={from:0,to:seconds,low:Math.min(300,top/4),high:Math.min(3000,top*.8)}, change=0, audition=null, cache=null;
    let busy=false;
    const from=numeric(0,0,seconds),to=numeric(seconds,0,seconds),low=numeric(box.low,0,top),high=numeric(box.high,0,top);
    const mode=options([["gain","CHANGE GAIN"],["isolate","ISOLATE SELECTION"]],"gain"),db=numeric(-24,-96,18,.1);
    const fy=f=>clamp(Math.log(top/Math.max(20,f))/Math.log(top/20),0,1), yf=y=>top*(20/top)**y;
    const target=options([["take","ALTERNATE TAKE"],["sampler","SAMPLER"]],"take");
    const tracks=P.tracks.map((t,i)=>[i,App.pad2(i+1)+" "+t.name]);
    const ti=P.tracks.findIndex((t,i)=>i!==r.track && t.kind==="smp" && !t.smp.id);
    const destination=options(tracks,ti<0?r.track:ti), destinationField=field("Sampler track",destination);
    const controls=[from,to,low,high,mode,db];
    const valid=()=>dlg.open && P===App.P && P.audio.regions.includes(r) && r.takes[r.take]===take;
    function stop(){if(audition){try{audition.stop();}catch{}audition.disconnect();audition=null;}}
    dlg.addEventListener("close",stop,{once:true});
    function redraw(){
      const g=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
      g.drawImage(image,0,0,w,h);g.font='14px "IBM Plex Mono",monospace';g.textBaseline="top";
      for(const hz of [50,100,500,1000,5000,10000])if(hz<top){
        const y=Math.round(fy(hz)*h)+.5;g.strokeStyle="#64897460";g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();
        g.fillStyle=App.C.t1;g.fillText(hz>=1000?hz/1000+"k":String(hz),4,y+1);
      }
      const tickUnit=10**Math.floor(Math.log10(seconds/6));
      const tick=([1,2,5,10].find(f=>f*tickUnit>=seconds/6)||10)*tickUnit;
      for(let t=0;t<seconds;t+=tick){
        const x=Math.round(w*t/seconds)+.5;g.strokeStyle="#64897450";g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();
        g.fillStyle=App.C.t1;g.fillText(Number(t.toPrecision(4))+" s",x+4,h-17);
      }
      const x=box.from/seconds*w,y=fy(box.high)*h, ww=(box.to-box.from)/seconds*w,hh=(fy(box.low)-fy(box.high))*h;
      g.fillStyle="#ffbb4020";g.fillRect(x,y,ww,hh);g.strokeStyle=App.C.am;g.lineWidth=2;g.strokeRect(x+1,y+1,Math.max(1,ww-2),Math.max(1,hh-2));g.lineWidth=1;
    }
    function invalidate(){change++;cache=null;stop();status.textContent="";redraw();}
    function read(){
      const values=[from,to,low,high].map(n=>n.valueAsNumber);
      if(!values.every(Number.isFinite) || values[0]<0 || values[1]>seconds+.00001 || values[1]<=values[0] || values[2]<0 || values[3]>top || values[3]<=values[2])return false;
      box={from:values[0],to:Math.min(seconds,values[1]),low:values[2],high:values[3]};return true;
    }
    for(const ctl of controls)ctl.onchange=()=>{read();invalidate();db.disabled=mode.value==="isolate";};
    let previewRequest=0;
    let anchor=null;
    const locate=e=>{const rect=canvas.getBoundingClientRect();
      return [clamp((e.clientX-rect.left)/rect.width,0,1)*seconds,yf(clamp((e.clientY-rect.top)/rect.height,0,1))];};
    canvas.onpointerdown=e=>{if(e.button!==0 || busy)return;anchor=locate(e);canvas.setPointerCapture(e.pointerId);};
    function selectRect(e){
      if(!anchor || busy)return;
      const [t,f]=locate(e), a=Math.min(anchor[0],t),b=Math.max(anchor[0],t),l=Math.min(anchor[1],f),u=Math.max(anchor[1],f);
      if(b-a<1/sr || u-l<1)return;
      box={from:a,to:b,low:l,high:u};
      [from,to,low,high].forEach((n,i)=>n.value=+([a,b,l,u][i].toFixed(5)));invalidate();
    }
    canvas.onpointermove=selectRect;canvas.onpointerup=e=>{selectRect(e);anchor=null;};canvas.onpointercancel=()=>anchor=null;
    async function perform(action){
      if(busy)return;
      if(!valid() || !read() || !Number.isFinite(db.valueAsNumber) || !db.checkValidity()){status.textContent="CHECK THE SPECTRAL RANGE";return;}
      if(action==="apply" && target.value==="take" && r.takes.length>=64){status.textContent="ALTERNATE TAKE LIMIT REACHED";return;}
      stop();busy=true;
      const request=++previewRequest,revision=change,check=()=>valid() && revision===change;
      const controls=body.querySelectorAll("select,input,button");
      for(const n of controls)if(n.textContent!=="Close" && n.textContent!=="Stop")n.disabled=true;
      status.textContent="PROCESSING SPECTRUM…";
      try{
        if(action!=="original" && !cache)cache=await App.AudioDSP.spectralEdit(source,take.offset,seconds,box,mode.value,db.valueAsNumber,check);
        if(!check() || (action!=="apply" && request!==previewRequest))return;
        if(action==="apply"){
          const toSampler=target.value==="sampler",ti=+destination.value;
          const material=toSampler && mode.value==="isolate"?takeBuffer(cache,box.from,box.to):cache;
          const id=App.addBuffer((r.name+" SPECTRAL").slice(0,40),material,{floating:true});
          if(toSampler){
            App.assignBufferToSampler(ti,id);App.select(ti,P.sel.p);dlg.close();App.UI.msg("SPECTRAL AUDIO ASSIGNED TO "+tracks[ti][1]);
          }else{
            r.takes.push({sample:id,offset:0});r.take=r.takes.length-1;App.commit();App.AudioStudio.refreshPlayback();App.AudioStudio.open();
          }
        }else{
          const E=App.audio();if(!E)throw Error("AUDIO OUTPUT UNAVAILABLE");
          const start=Math.max(0,box.from-.12),end=Math.min(seconds,box.to+.12);
          let buffer=action==="original"?source:cache,offset=start+(action==="original"?take.offset:0);
          if(action==="removed"){
            buffer=takeBuffer(cache,start,end);
            const rawAt=Math.round(take.offset*sr)+Math.round(start*sr);
            for(let c=0;c<buffer.numberOfChannels;c++){
              const d=buffer.getChannelData(c),raw=source.getChannelData(c);
              for(let i=0;i<d.length;i++)d[i]=(raw[i+rawAt]||0)-d[i];
            }
            offset=0;
          }
          const player=E.ctx.createBufferSource(),level=E.ctx.createGain();
          const at=E.ctx.currentTime+.012, duration=Math.min(end-start,buffer.duration-offset),fade=Math.min(.004,duration/2);
          audition=player;player.buffer=buffer;level.gain.setValueAtTime(0,at);level.gain.linearRampToValueAtTime(1,at+fade);
          level.gain.setValueAtTime(1,at+duration-fade);level.gain.linearRampToValueAtTime(0,at+duration);
          player.connect(level).connect(E.tracks[r.track].tin);player.start(at,offset,duration);
          player.onended=()=>{player.disconnect();level.disconnect();if(audition===player){audition=null;status.textContent="AUDITION COMPLETE";}};
          status.textContent="AUDITION · "+action.toUpperCase();
        }
      }catch(e){if(valid())status.textContent=e.message||"SPECTRAL EDIT FAILED";}
      finally{busy=false;for(const n of controls)n.disabled=false;db.disabled=mode.value==="isolate";}
    }
    const apply=btn("Apply as take","WRITE AN EDITED TAKE OR ASSIGN THE RESULT TO THE CHOSEN SAMPLER",()=>perform("apply"),"confirm-action");
    function output(){
      const sampler=target.value==="sampler";
      destinationField.hidden=!sampler;apply.textContent=sampler?"Send to sampler":"Apply as take";
      status.textContent=sampler?"Isolate crops to the selected time. Assigning replaces the destination instrument.":"The original take stays available.";
    }
    target.onchange=output;output();
    body.append(canvas,toolbar(field("From · s",from),field("To · s",to),field("Low · Hz",low),field("High · Hz",high)),
      toolbar(field("Operation",mode),field("Gain · dB",db),btn("Original","AUDITION THE SOURCE AROUND THE SELECTION",()=>perform("original")),
        btn("Result","AUDITION THE PROCESSED TAKE",()=>perform("result")),btn("Difference","HEAR ORIGINAL MINUS RESULT",()=>perform("removed")),
        btn("Stop","STOP AUDITION",()=>{previewRequest++;stop();status.textContent="AUDITION STOPPED";})),
      toolbar(field("Write to",target),destinationField,apply),status);
    status.textContent="DRAG A TIME / FREQUENCY RANGE · ORIGINAL TAKE IS RETAINED";
    requestAnimationFrame(()=>{if(valid()){image.getContext("2d").putImageData(App.AudioDSP.spectrogram(source,take.offset,seconds,sw,sh),0,0);redraw();}});
  }
  App.SignalWorkshop={openResample,openSpectral,openImpulse,impulse,impulseDuration,resample};
})();
