/* Audio regions and alternate takes share the same portable sample pool as instruments. */
(() => {
  "use strict";
  const {h,btn} = App.UI, {clamp} = App, MAX = 8192;
  const num = (v, min, max, def) => Number.isFinite(v) ? clamp(v,min,max) : def;
  const idOf = v => typeof v === "string" ? v.slice(0,128) : "";
  const beatTime=(s,P=App.P)=>App.Conductor.time(P,s);
  const after=(s,sec,P=App.P)=>App.Conductor.step(P,beatTime(s,P)+sec);
  const endOf=(r,P=App.P)=>after(r.at,r.len*r.repeats,P);
  const reg = r => {
    const takes = (Array.isArray(r?.takes) ? r.takes : []).slice(0,64)
      .filter(t => idOf(t?.sample)).map(t => ({sample:idOf(t.sample), offset:num(t.offset,0,7200,0)}));
    if (!takes.length) return null;
    const len = num(r.len,.001,1200,1);
    return {id:idOf(r.id) || App.uid(), track:Math.round(num(r.track,0,7,0)), at:num(r.at,0,MAX,0), len,
      takes, take:Math.round(num(r.take,0,takes.length-1,0)), gain:num(r.gain,0,2,1), mute:!!r.mute,
      fin:num(r.fin,0,len,0), fout:num(r.fout,0,len,0), repeats:Math.round(num(r.repeats,1,128,1)),
      layer:idOf(r.layer), name:String(r.name || "REGION").slice(0,40)};
  };
  App.extendProject({
    load(P,raw) {
      const regions = Array.isArray(raw?.audio?.regions) ? raw.audio.regions : [];
      P.audio = {regions:regions.slice(0,2048).map(reg).filter(Boolean)};
      const used=new Set();
      for(const r of P.audio.regions){if(used.has(r.id))r.id=App.uid();used.add(r.id);}
      P.tracks.forEach((t,i) => {
        const d = t.smp, old = raw?.tracks?.[i]?.smp || {};
        const markers = old.markers;
        d.markers = Array.isArray(markers) && markers.length === d.slices-1 &&
          markers.every((v,j) => Number.isFinite(v) && v > (j===0?0:markers[j-1]) && v < 1) ? markers.slice() : [];
        d.warpSource = idOf(old.warpSource);
        const spec = old.warpSpec, anchors = spec?.anchors;
        d.warpSpec = {from:num(spec?.from,20,400,P.bpm),to:num(spec?.to,20,400,P.bpm),anchors:[]};
        if (Array.isArray(anchors)) for (const pair of anchors.slice(0,32)) {
          const prev = d.warpSpec.anchors.at(-1) || [0,0];
          if (Array.isArray(pair) && pair.length===2 && pair.every((v,j) => Number.isFinite(v) && v>prev[j] && v<1)) d.warpSpec.anchors.push([...pair]);
        }
      });
    },
    sampleIds(P,ids) {
      for (const r of P.audio?.regions || []) for (const t of r.takes) ids.add(t.sample);
      for (const t of P.tracks) if (t.smp.warpSource) ids.add(t.smp.warpSource);
    },
    remapSample(P,from,to) {
      for (const r of P.audio?.regions || []) for (const t of r.takes) if (t.sample===from) t.sample=to;
      for (const t of P.tracks) if (t.smp.warpSource===from) t.smp.warpSource=to;
    }
  });
  const pool = () => App.P.audio.regions;
  const sample = id => App.samples.get(id)?.buffer;
  function durationSteps(P) {
    return Math.max(0, Math.ceil((P.audio?.regions || []).reduce((end,r) => Math.max(end,endOf(r,P)),0) - 1e-8));
  }
  const sounding = new WeakMap();
  function stopSources(E) {
    for (const source of sounding.get(E) || []) { try { source.stop(); } catch {} }
  }
  function voice(E,r,at,skip=0) {
    const take = r.takes[r.take], buffer = sample(take.sample);
    if (r.mute || !buffer || !E.tracks?.[r.track]) return;
    const dur = Math.min(r.len,buffer.duration-take.offset);
    if (dur - skip < .0001) return;
    const node = E.ctx.createBufferSource(), level = E.ctx.createGain();
    const attack = r.fin || .002, release = r.fout || .002;
    const scale = Math.min(1,r.len/(attack+release)), fi=attack*scale, fo=release*scale;
    const volume = t => r.gain * Math.min(1, t / Math.max(.000001,fi), (r.len - t) / Math.max(.000001,fo));
    node.buffer = buffer;
    level.gain.setValueAtTime(volume(skip),at);
    for (const t of [fi,r.len-fo,dur]) if (t>skip && t<=dur) level.gain.linearRampToValueAtTime(volume(t),at+t-skip);
    node.connect(level).connect(E.tracks[r.track].tin);
    let nodes = sounding.get(E);
    if (!nodes) sounding.set(E, nodes = new Set());
    nodes.add(node);
    node.onended = () => { nodes.delete(node); node.disconnect(); level.disconnect(); };
    node.start(at,take.offset+skip,dur-skip);
  }
  function schedule(E,P,absolute,time,sd,chase=false,width=1) {
    if (!E.ctx || !E.tracks) return;
    for (const r of P.audio?.regions || []) {
      if (r.mute) continue;
      const elapsed=beatTime(absolute,P)-beatTime(r.at,P), until=beatTime(absolute+width,P)-beatTime(absolute,P), first=Math.max(0,Math.floor(elapsed/r.len+1e-8));
      for (let k = first; k < r.repeats; k++) {
        const diff=k*r.len-elapsed;
        if (diff >= until-1e-8) break;
        if (diff >= -1e-8) voice(E,r,time+Math.max(0,diff));
        else if (chase && -diff < r.len) voice(E,r,time,-diff);
      }
    }
  }

  function refreshPlayback() {
    const E=App.E;
    if(!E || !App.Seq.playing)return;
    const frame=App.Seq.frame(), future=App.Seq.nextGrid();
    if(!frame || !future)return;
    stopSources(E);
    const total=App.Seq.rangeSteps?.() || Infinity;
    let time=E.ctx.currentTime+.005, step=Math.max(0,after(frame.absoluteStep,time-frame.straightTime)), chase=true;
    while(time<future.time-.000001){
      step%=total;
      const width=Math.min(Math.floor(step+1e-7)+1-step,after(step,future.time-time)-step);
      if(width<=0)break;
      schedule(E,App.P,step,time,beatTime(step+1)-beatTime(step),chase,width);
      time+=beatTime(step+width)-beatTime(step);step+=width;chase=false;
    }
  }
  let studio = null, sampleDialog = null, capture = null, captureTimer, generation = 0, selected = "", track = 0, cursor = 0;
  let snap = 1, loopBars = 1, src = "mic", zoom = 0, viewportStart = 0, notice = "", view = "timeline";
  const find = () => pool().find(r => r.id===selected);
  function add(id,ti,at,more={}) {
    if (pool().length >= 2048) throw Error("REGION LIMIT REACHED");
    const S = App.samples.get(id);
    const r = reg({name:S.name,track:ti,at,len:S.buffer.duration,takes:[{sample:id,offset:0}],...more});
    pool().push(r); selected=r.id; track=r.track; return r;
  }
  function edit(fn) {
    try { fn(); App.commit(); refreshPlayback(); notice=""; }
    catch(e) {notice=e.message;}
    render();
  }
  function split(r,step) {
    if (!r) throw Error("SELECT A REGION");
    const cut=beatTime(step)-beatTime(r.at);
    if (r.repeats!==1 || cut<.001 || cut>r.len-.001) throw Error("PLACE CURSOR INSIDE A SINGLE REGION");
    if (pool().length >= 2048) throw Error("REGION LIMIT REACHED");
    const next=reg({...r,id:App.uid(),at:step,len:r.len-cut,fin:0,takes:r.takes.map(t=>({...t,offset:t.offset+cut}))});
    r.len=cut; r.fin=Math.min(r.fin,cut); r.fout=0;
    pool().push(next); selected=next.id; return next;
  }
  function crossfade(r) {
    if (!r || r.repeats!==1) throw Error("SELECT A SINGLE REGION");
    const prev=pool().filter(x=>x!==r && x.track===r.track && x.repeats===1 && x.at<r.at && endOf(x)>r.at)
      .sort((a,b)=>b.at-a.at)[0];
    if (!prev) throw Error("OVERLAP THE END OF AN EARLIER REGION ON THIS TRACK");
    const duration=beatTime(prev.at)-beatTime(r.at)+prev.len;
    if (duration>r.len) throw Error("EXTEND THE LATER REGION PAST THE EARLIER END");
    prev.fout=duration; r.fin=duration;
  }
  function setTrim(r,from,to) {
    const old=r.takes[r.take].offset, delta=from-old;
    if (!(to>from+.0009) || r.takes.some(t=>t.offset+delta<-.00001 || t.offset+delta+to-from>(sample(t.sample)?.duration ?? Infinity)+.00001)) throw Error("TRIM EXCEEDS A TAKE BOUNDARY");
    if (after(r.at,delta)<-.00001) throw Error("TRIM WOULD START BEFORE THE TIMELINE");
    r.takes.forEach(t=>t.offset=Math.max(0,t.offset+delta));
    r.at=Math.max(0,after(r.at,delta));r.len=to-from;r.fin=Math.min(r.fin,r.len);r.fout=Math.min(r.fout,r.len);
  }
  async function importFiles(files,ti,at) {
    const P=App.P, epoch=generation, imported=[];
    try {
      for (const file of files) imported.push(await App.addSample(file.name.replace(/\.[^.]+$/,"").slice(0,40),file));
      if (P!==App.P || epoch!==generation) return;
      edit(()=>{const positions=imported.map(id=>{const start=at;at=after(at,sample(id).duration);return start;});
        if(positions.some(start=>start>MAX) || pool().length+imported.length>2048)throw Error("TIMELINE LIMIT REACHED");
        imported.forEach((id,i)=>add(id,ti,positions[i]));});
    } catch {if(P===App.P && epoch===generation){notice="CANNOT DECODE AUDIO FILE";render();}}
  }
  function reset() {
    ++generation; clearTimeout(captureTimer);stopLoop();
    const c=capture; capture=null;
    if(c?.awaitingNewInput)c.E.closeInput();
    if(c?.rec && !c.stopping) c.rec.stop().catch(()=>{});
    if(App.E) stopSources(App.E);
    if (studio?.open) studio.close();
    if (sampleDialog?.open) sampleDialog.close();
    selected="";cursor=0;viewportStart=0;notice="";
  }
  function crop(buf,offset,len) {
    const frame=Math.round(offset*buf.sampleRate), a=Math.max(0,frame), n=Math.max(1,Math.round(len*buf.sampleRate)), pad=Math.min(n,Math.max(0,-frame));
    const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,sampleRate:buf.sampleRate,length:n});
    for(let i=0;i<out.numberOfChannels;i++) out.getChannelData(i).set(buf.getChannelData(i).subarray(a,a+n-pad),pad);
    return out;
  }
  async function finishCapture() {
    const c=capture;
    if (!c || c.stopping)return;
    if(!c.rec){
      capture=null;
      if(c.awaitingNewInput)c.E.closeInput();
      notice="RECORDING CANCELLED";render();return;
    }
    c.stopping=true;clearTimeout(captureTimer);
    try {
      const end=Math.min(c.end ?? c.E.ctx.currentTime,c.E.ctx.currentTime);
      const raw=await c.rec.stop();
      if (c!==capture || c.project!==App.P) return;
      const first=c.rec.firstTime() ?? c.connected, length=end-c.when;
      if(length<.005 || raw.length<2 || raw.duration+first<c.when+.01) throw Error("RECORDING TOO SHORT");
      const buffer=crop(raw,c.when-first,c.end ? c.end-c.when : length);
      const name=(c.mode==="take" ? "TAKE" : c.mode==="loop" ? "LAYER" : "INPUT")+" "+(App.P.audio.regions.length+1);
      const id=App.addBuffer(name,buffer);
      if(c.mode==="take") {
        const r=pool().find(x=>x.id===c.regionId);
        if (!r) throw Error("TAKE TARGET REMOVED");
        r.takes.push({sample:id,offset:0});r.take=r.takes.length-1;selected=r.id;
      } else {
        const layer=add(id,c.track,c.at,{layer:c.group});
        if(c.mode==="loop" && loopClock && c.when>=loopClock.phase && src!=="mix") {
          const now=c.E.ctx.currentTime, skip=(now-loopClock.phase)%loopClock.len;
          if(skip>=0 && skip<loopClock.len) voice(c.E,layer,now+.005,skip+.005);
        }
      }
      App.commit(); refreshPlayback(); notice=c.mode==="loop"?"LAYER RECORDED": "RECORDING ADDED";
    } catch(e) {if(c===capture) notice=e.message;}
    finally { if(c===capture){ capture=null;render(); } }
  }
  async function record(mode) {
    if (capture) return;
    const E=App.audio(),r=find(); if(!E) return;
    if(mode==="take" && (!r || r.takes.length>=64)){ notice="SELECT A REGION WITH FEWER THAN 64 TAKES";render();return; }
    const c=capture={E,mode,project:App.P,track:mode==="take"?r.track:track,
      at:mode==="take"?r.at:cursor,regionId:r?.id,group:"",connected:0,awaitingNewInput:src==="mic" && !E.input};
    try {
      notice="ARMING INPUT";render();
      const node=src==="mic"?await E.openInput():src==="track"?(E.tracks[c.track].instrument || E.tracks[c.track].pan):E.out;
      if(capture!==c)return;
      c.awaitingNewInput=false;
      c.rec=await E.record(node);
      if(capture!==c){await c.rec.stop();return;}
      c.connected=E.ctx.currentTime;
      const loopSteps=App.Conductor.barsAfter(App.P,cursor,loopBars)-cursor;
      if(mode==="loop") {
        // Play aligned layers through normal mixer channels while a new pass is captured.
        // A rolling transport already supplies those layers through the scheduler.
        if(loopClock) {
          c.when=loopClock.phase+Math.max(0,Math.ceil((E.ctx.currentTime+.1-loopClock.phase)/loopClock.len))*loopClock.len;
          c.at=loopClock.at;
        } else if(!App.Seq.playing) {
          c.when=E.ctx.currentTime+.12;
        } else {
          const next=App.Seq.nextGrid(loopSteps);
          c.when=next?.time ?? E.ctx.currentTime+.12;
          c.at=next?.step ?? cursor;
        }
        const group=pool().find(x=>x.layer && Math.abs(x.at-c.at)<.001 && Math.abs(x.len-loopLength(c.at))<.002)?.layer;
        c.group=group || App.uid();
        if(!App.Seq.playing && !loopClock && src!=="mix") for(const layer of pool().filter(x=>x.layer===c.group)) voice(E,layer,c.when);
        c.end=c.when+loopLength(c.at);
      } else {
        c.when=E.ctx.currentTime+.09;
        if(mode==="take") {
          const next=App.Seq.nextGrid?.(1);
          if(next && App.Seq.playing){
            const cycle=App.Seq.rangeSteps?.() ?? Infinity;
            const wait=Number.isFinite(cycle)?((r.at-next.step+cycle)%cycle):Math.max(0,r.at-next.step);
            c.when=next.time+(Number.isFinite(cycle)&&r.at<next.step?beatTime(cycle)-beatTime(next.step)+beatTime(r.at):beatTime(next.step+wait)-beatTime(next.step));
          }
          c.end=c.when+r.len;
        }
        if(mode==="region" && App.Seq.playing) {
          const next=App.Seq.nextGrid(snap || 1);if(next){c.when=next.time;c.at=next.step;}
        }
      }
      if(c.end) {
        const wait=()=>{if(capture!==c)return;const left=c.end-E.ctx.currentTime;
          if(left>.01) captureTimer=setTimeout(wait,Math.max(8,Math.min(250,left*1000)));
          else if(left>0) captureTimer=setTimeout(wait,12);
          else finishCapture();
        };wait();
      }
      notice=mode==="region"?"RECORDING · STOP TO PLACE REGION":"RECORDING ONE PASS";render();
    } catch(e) {
      if(capture===c){
        capture=null;
        notice=e.name==="NotAllowedError"?"INPUT PERMISSION DENIED · CHOOSE A RECORD SOURCE":
          e.name==="NotFoundError"?"NO INPUT DEVICE FOUND":e.message || "RECORDING UNAVAILABLE";
        render();
      }
    }
  }
  let loopClock=null, loopTimer, raf, canvas, paintStamp=0;
  function stopLoop() {
    clearTimeout(loopTimer);
    if(loopClock && App.E)stopSources(App.E);
    loopClock=null;
  }
  const loopLength=(at=cursor)=>beatTime(App.Conductor.barsAfter(App.P,at,loopBars))-beatTime(at);
  const layersAt=(at,len)=>pool().filter(r=>r.layer && Math.abs(r.at-at)<.001 && Math.abs(r.len-len)<.002);
  function startLoop() {
    if(loopClock){stopLoop();render();return;}
    const E=App.audio();if(!E)return;
    App.Seq.stop();
    const len=loopLength(),at=cursor;
    loopClock={at,len,phase:E.ctx.currentTime+.14,next:E.ctx.currentTime+.14};
    const run=()=>{
      if(!loopClock || App.Seq.playing){stopLoop();render();return;}
      const now=E.ctx.currentTime;
      if(loopClock.next<now-.2)loopClock.next+=Math.ceil((now-loopClock.next)/len)*len;
      while(loopClock.next<now+.16){
        for(const r of layersAt(at,len))voice(E,r,loopClock.next);
        loopClock.next+=len;
      }
      loopTimer=setTimeout(run,28);
    };
    run();render();
  }
  const field=(name,control)=>h("label.ast-field",null,h("span",{text:name}),control);
  function number(name,v,min,max,inc,accept) {
    const node=h("input",{type:"number","aria-label":name,min,max,step:inc,value:+Number(v).toFixed(4)});
    node.onchange=()=>{if(node.value!=="" && node.checkValidity())accept(node.valueAsNumber);else{notice="VALUE OUTSIDE RANGE";render();}};
    return field(name,node);
  }
  function select(name,options,v,accept) {
    const o=h("select",{"aria-label":name},options.map(([value,label])=>h("option",{value,text:label})));
    o.value=String(v);o.onchange=()=>accept(o.value);return field(name,o);
  }
  function action(label,tip,fn,disabled=false,cls="") {
    const b=btn(label,tip,fn,cls);b.disabled=!!disabled;return b;
  }
  const trackOptions=()=>App.P.tracks.map((t,i)=>[i,App.pad2(i+1)+" "+t.name]);
  const projectSteps=()=>Math.max(App.spb(App.P)*2,durationSteps(App.P),App.P.song ? (App.Conductor.layout(App.P,App.P.chain).at(-1)?.end||0):App.patSteps(App.P,App.P.sel.p));
  function bounds(cv) {
    const w=cv.clientWidth,height=cv.clientHeight, left=Math.min(90,w*.135),top=18;
    const C=App.Conductor,start=zoom?viewportStart:0,bar=C.meter(App.P,start).width;
    const last=Math.max(projectSteps(),cursor+1),pos=C.position(App.P,last);
    const span=zoom ? C.barsAfter(App.P,start,zoom)-start : C.barStart(App.P,pos.bar+Number(pos.inside>0));
    return {w,height,left,top,span,start,bar,scale:(w-left)/span,row:(height-top)/8};
  }
  function positions(cv) {
    const b=bounds(cv),out=[];
    for(let ti=0;ti<8;ti++) {
      const rs=pool().filter(r=>r.track===ti && endOf(r)>b.start && r.at<b.start+b.span).sort((a,c)=>a.at-c.at);
      const lanes=[];
      const packed=rs.map(r=>{
        let line=lanes.findIndex(end=>end<=r.at+.0001);
        if(line<0)line=lanes.length;lanes[line]=endOf(r);return {r,line};
      });
      const hh=b.row/Math.max(1,lanes.length);
      for(const {r,line} of packed)out.push({r,x:b.left+(r.at-b.start)*b.scale,
        y:b.top+ti*b.row+line*hh+1,w:(endOf(r)-r.at)*b.scale,h:Math.max(2,hh-2)});
    }
    return {b,out};
  }
  function draw() {
    if(!canvas?.isConnected)return;
    const cv=canvas,d=App.UI.fit(cv),ctx=cv.getContext("2d"),{b,out}=positions(cv),C=App.C;
    ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle=C.r0;ctx.fillRect(0,0,b.w,b.height);
    ctx.font='10px "IBM Plex Mono", monospace';ctx.textBaseline="middle";ctx.lineWidth=1;
    for(let i=0;i<8;i++){
      const y=b.top+i*b.row;ctx.fillStyle=i===track?C.r3:C.r1;ctx.fillRect(0,y,b.left,b.row);
      ctx.fillStyle=i===track?C.am:C.t2;ctx.fillText(App.pad2(i+1)+" "+App.P.tracks[i].name.slice(0,8),5,y+b.row/2,b.left-8);
      ctx.fillStyle=C.ln;ctx.fillRect(0,y,b.w,1);
    }
    const map=App.Conductor;
    for(let i=map.position(App.P,b.start).bar;map.barStart(App.P,i)<b.start+b.span;){
      const pos=map.barStart(App.P,i),meter=map.meter(App.P,pos),x=b.left+(pos-b.start)*b.scale;
      ctx.fillStyle=C.ln2;ctx.fillRect(Math.round(x),b.top,1,b.height-b.top);ctx.fillStyle=C.t3;ctx.fillText(String(i+1),x+3,9);
      i+=Math.max(1,Math.ceil(42/(meter.width*b.scale)));
    }
    ctx.save();ctx.beginPath();ctx.rect(b.left,b.top,b.w-b.left,b.height-b.top);ctx.clip();
    if(b.scale*4>=12) {
      ctx.fillStyle=C.ln;
      for(let pos=Math.ceil(b.start/4)*4;pos<b.start+b.span;pos+=4)if(map.position(App.P,pos).inside)ctx.fillRect(Math.round(b.left+(pos-b.start)*b.scale),b.top,1,b.height-b.top);
    }
    for(const {r,x,y,w,h:hh} of out) {
      const on=r.id===selected,S=App.samples.get(r.takes[r.take].sample);
      ctx.fillStyle=r.mute?C.r1:on?C.r3:C.r2;ctx.fillRect(x,y,w,hh);
      ctx.strokeStyle=on?C.am:r.mute?C.ln2:C.t3;ctx.strokeRect(x+.5,y+.5,Math.max(0,w-1),Math.max(0,hh-1));
      if(S && hh>=5){
        const pk=S.peaks,n=pk.length/2,center=y+hh/2,amp=hh*.41/Math.max(.02,S.peak),offset=r.takes[r.take].offset;
        ctx.fillStyle=r.mute?C.ln3:C.t2;
        for(let xx=Math.max(b.left,Math.ceil(x+1));xx<Math.min(b.w,x+w-1);xx+=2){
          const time=beatTime(b.start+(xx-b.left)/b.scale)-beatTime(r.at),secs=((time%r.len)+r.len)%r.len, i=clamp(Math.floor((offset+secs)/S.buffer.duration*n),0,n-1);
          let a=pk[i*2],cc=pk[i*2+1];
          const j1=Math.min(n,Math.ceil((offset+secs+beatTime(b.start+(xx+2-b.left)/b.scale)-beatTime(b.start+(xx-b.left)/b.scale))/S.buffer.duration*n));
          for(let j=i+1;j<j1;j++){a=Math.min(a,pk[j*2]);cc=Math.max(cc,pk[j*2+1]);}
          ctx.fillRect(xx,center-cc*amp,1,Math.max(1,(cc-a)*amp));
        }
      }
      if((r.fin || r.fout || r.repeats>1) && w/r.repeats>3) {
        const px=sec=>b.left+(after(r.at,sec)-b.start)*b.scale;
        ctx.strokeStyle=on?C.am:C.t3;ctx.lineWidth=1;
        for(let rep=0;rep<r.repeats;rep++){
          const xx=px(rep*r.len),one=px((rep+1)*r.len)-xx;
          if(xx+one<b.left || xx>b.w)continue;
          ctx.beginPath();
          if(rep){ctx.moveTo(xx,y);ctx.lineTo(xx,y+hh);}
          if(r.fin){ctx.moveTo(xx,y+hh-1);ctx.lineTo(px(rep*r.len+r.fin),y+1);}
          if(r.fout){ctx.moveTo(px((rep+1)*r.len-r.fout),y+1);ctx.lineTo(xx+one,y+hh-1);}ctx.stroke();
        }
      }
      if(hh>13 && w>42){ctx.fillStyle=C.r0;ctx.fillRect(Math.max(x,b.left)+2,y+1,Math.min(w-3,r.name.length*6+3),11);ctx.fillStyle=on?C.am:C.t1;ctx.fillText(r.name,Math.max(x,b.left)+3,y+7,w-5);}
    }
    const line=(step,color)=>{const x=b.left+(step-b.start)*b.scale;ctx.fillStyle=color;ctx.fillRect(x,b.top,1,b.height-b.top);};
    line(cursor,C.am);
    if(App.Seq.playing){const p=App.Seq.frame();if(p)line(p.absoluteStep+clamp((App.E.ctx.currentTime-p.straightTime)/p.sd,0,1),C.t1);}
    if(loopClock){const t=App.E.ctx.currentTime-loopClock.phase;if(t>=0)line(after(loopClock.at,t%loopClock.len),C.t1);}
    ctx.restore();
  }
  function bindCanvas(cv) {
    const point=e=>{const rect=cv.getBoundingClientRect(),b=bounds(cv),x=e.clientX-rect.left,y=e.clientY-rect.top;
      const pos=b.start+(x-b.left)/b.scale,step=clamp(snap?Math.round(pos/snap)*snap:Math.round(pos*1000)/1000,0,MAX);
      return {x,y,step,track:clamp(Math.floor((y-b.top)/b.row),0,7)};
    };
    cv.onpointerdown=e=>{
      if(e.button!==0 || capture)return;
      if(loopClock)stopLoop();
      const p=point(e),hit=positions(cv).out.findLast(o=>p.x>=o.x && p.x<=o.x+o.w && p.y>=o.y && p.y<=o.y+o.h);
      cv.setPointerCapture(e.pointerId);
      if(hit){selected=hit.r.id;track=hit.r.track;}else {track=p.track;selected="";}
      cursor=p.step;draw();
      const r=hit?.r, old=r && {at:r.at,track:r.track};let moved=false;
      cv.onpointermove=ev=>{
        const to=point(ev);
        if(!r || (!moved && Math.abs(to.x-p.x)<4 && Math.abs(to.y-p.y)<4))return;
        moved=true;r.at=clamp(old.at+to.step-p.step,0,MAX);r.track=to.track;track=r.track;cursor=r.at;draw();
      };
      const end=ev=>{
        cv.onpointermove=cv.onpointerup=cv.onpointercancel=null;
        if(moved && ev.type==="pointercancel")Object.assign(r,old);
        if(moved && ev.type==="pointerup"){App.commit();refreshPlayback();}render();
      };
      cv.onpointerup=cv.onpointercancel=end;
    };
    cv.ondragover=e=>{if(e.dataTransfer.types.includes("Files"))e.preventDefault();};
    cv.ondrop=e=>{e.preventDefault();e.stopPropagation();const p=point(e);importFiles([...e.dataTransfer.files],p.track,p.step);};
  }

  function render() {
    if(!studio?.open)return;
    if(App.P.sel.t!==track)App.select(track,App.P.sel.p);
    const old=document.activeElement, tag=old?.tagName, label=old?.getAttribute("aria-label") || old?.textContent;
    const body=h("div.dlg-body.ast-body"),r=find();
    const tabs=["timeline","looper"].map(v=>action(v==="timeline"?"Timeline":"Looper",v==="timeline"?"AUDIO REGIONS AND ALTERNATE TAKES":"RECORD AND OVERDUB LOOP LAYERS",()=>{if(capture)return;stopLoop();view=v;render();},!!capture,view===v?"on":""));
    body.append(h("div.ast-head",null,h("h2",{text:"Audio studio"}),...tabs,h("span.sp"),action("Close","RETURN TO CONSOLE",()=>studio.close())));
    const zoomCtl=select("View",[[0,"FIT"],[2,"2 BARS"],[4,"4 BARS"],[8,"8 BARS"],[16,"16 BARS"],[32,"32 BARS"]],zoom,v=>{zoom=+v;viewportStart=zoom?Math.floor(cursor/(zoom*App.spb(App.P)))*zoom*App.spb(App.P):0;render();});
    body.append(h("div.ast-toolbar",null,select("Track",trackOptions(),track,v=>{track=+v;App.select(track,App.P.sel.p);selected="";render();}),
      number("Cursor · step",cursor,0,MAX,.001,v=>{if(loopClock)stopLoop();cursor=v;render();}),select("Snap",[[0,"FREE"],[1,"1/16"],[2,"1/8"],[4,"1/4"],[App.spb(App.P),"BAR"]],snap,v=>{snap=+v;render();}),zoomCtl,
      zoom?action("‹","PREVIOUS PAGE",()=>{viewportStart=Math.max(0,viewportStart-zoom*App.spb(App.P));render();}):null,
      zoom?action("›","NEXT PAGE",()=>{viewportStart=Math.min(MAX-zoom*App.spb(App.P),viewportStart+zoom*App.spb(App.P));render();}):null));
    canvas=h("canvas.ast-timeline",{"aria-label":"Audio timeline · drop files or drag regions across tracks",role:"img"});bindCanvas(canvas);body.append(canvas);
    const idle=!capture;
    if(view==="looper" && src==="mix")src="track";
    const sourceCtl=select("Record source",[["mic","MIC / LINE"],["track","TRACK INSTRUMENT"],...(view==="timeline"?[["mix","MASTER OUTPUT"]]:[])],src,v=>{src=v;});
    if(view==="timeline"){
      body.append(h("div.ast-toolbar",null,action("Import audio…","PLACE FILES CONSECUTIVELY AT THE CURSOR",()=>App.pickFile("audio/*",files=>importFiles(files,track,cursor)),!idle),
        sourceCtl, action(capture?.mode==="region"?"Stop recording":"Record region","CAPTURE AUDIO INTO THE SELECTED LANE",()=>capture?finishCapture():record("region"),!!capture && capture.mode!=="region","rec"+(capture?.mode==="region"?".on":"")),
        action("Record take","RECORD ONE ALTERNATE PASS OF THE SELECTED REGION",()=>record("take"),!idle || !r,"rec"),
        action(App.Seq.playing?"Stop transport":"Play transport","PLAY TIMELINE WITH THE SONG OR CURRENT PATTERN",()=>{stopLoop();App.Seq.toggle();render();},!!capture)));
    } else {
      const group=layersAt(cursor,loopLength());
      body.append(h("div.ast-toolbar",null,sourceCtl,select("Loop bars",[[1,"1"],[2,"2"],[4,"4"],[8,"8"],[16,"16"]],loopBars,v=>{stopLoop();loopBars=+v;render();}),
        action(loopClock?"Stop loop":"Play loop","AUDITION LAYERS AT THE CURSOR IN A CONTINUOUS LOOP",()=>startLoop(),!idle),
        action("Overdub layer","CAPTURE ONE BAR-ALIGNED PASS AND KEEP PREVIOUS LAYERS",()=>record("loop"),!idle,"rec"),
        action("Undo layer","REMOVE THE LAST OVERDUB AT THIS CURSOR AND LOOP LENGTH",()=>edit(()=>{pool().splice(pool().indexOf(group.at(-1)),1);selected="";}),!idle || !group.length),
        h("small",{text:group.length+" LAYERS"})));
    }
    const opts=pool().map((x,i)=>[x.id,(i+1)+" · "+App.pad2(x.track+1)+" "+x.name]);
    body.append(h("div.ast-inspect",null,select("Region",[["","SELECT REGION"],...opts],r?.id || "",v=>{selected=v;const x=find();if(x){track=x.track;cursor=x.at;}render();}),
      r? select("Take",r.takes.map((t,i)=>[i,(i+1)+" · "+(App.samples.get(t.sample)?.name || "MISSING")]),r.take,v=>edit(()=>r.take=+v)):null,
      r?action("Audition","PLAY SELECTED TAKE THROUGH ITS OUTPUT STRIP",()=>{const E=App.audio();if(E)voice(E,{...r,mute:false},E.ctx.currentTime+.02);}):null,
      r?action("Transcribe…","CONVERT THIS SINGLE-NOTE MELODY TO EDITABLE NOTES",openTranscription,!idle):null));
    if(r) {
      const source=r.takes[r.take],end=source.offset+r.len;
      body.append(h("div.ast-toolbar.ast-params",null,number("Start · step",r.at,0,MAX,.001,v=>edit(()=>r.at=v)),
        number("Trim in · s",source.offset,0,7200,"any",v=>edit(()=>setTrim(r,v,end))),
        number("Trim out · s",end,.001,7200,"any",v=>edit(()=>setTrim(r,source.offset,v))),
        number("Fade in · s",r.fin,0,r.len,"any",v=>edit(()=>r.fin=v)),number("Fade out · s",r.fout,0,r.len,"any",v=>edit(()=>r.fout=v)),
        number("Gain",r.gain,0,2,.01,v=>edit(()=>r.gain=v)),number("Repeats",r.repeats,1,128,1,v=>edit(()=>r.repeats=v))));
      body.append(h("div.ast-toolbar",null,select("Route",trackOptions(),r.track,v=>edit(()=>{r.track=+v;track=r.track;})),
        action("Split at cursor","SPLIT ALL TAKES AT THE CURSOR · CHOOSE A TAKE FOR EACH PIECE",()=>edit(()=>split(r,cursor))),
        action("Crossfade","FADE BETWEEN OVERLAPPING REGIONS ON THIS TRACK",()=>edit(()=>crossfade(r))),
        action("Duplicate","PLACE A COPY IMMEDIATELY AFTER THIS REGION",()=>edit(()=>{const at=endOf(r);if(at>MAX || pool().length>=2048)throw Error("TIMELINE LIMIT REACHED");const n=reg({...r,id:App.uid(),at});pool().push(n);selected=n.id;})),
        action(r.mute?"Unmute":"Mute","TOGGLE REGION IN THE MIX",()=>edit(()=>r.mute=!r.mute)),
        action("Remove","REMOVE REGION · PROJECT UNDO RESTORES IT",()=>edit(()=>{pool().splice(pool().indexOf(r),1);selected="";}))));
    }
    body.append(h("output.ast-status",{role:"status",text:notice || (r ? r.name+" · "+r.len.toFixed(3)+" S · "+r.takes.length+" TAKE"+(r.takes.length===1?"":"S") : "DROP AUDIO ON A LANE · CLICK TO SET CURSOR · DRAG A REGION TO MOVE")}));
    if(capture)for(const el of body.querySelectorAll("input,select,button")){
      if(el.textContent!=="Stop recording" && el.textContent!=="Close")el.disabled=true;
    }
    studio.replaceChildren(body);
    const next=[...body.querySelectorAll("button,select,input")].find(el=>el.tagName===tag && !el.disabled && (el.getAttribute("aria-label") || el.textContent)===label);
    (next || studio).focus({preventScroll:true});draw();
  }
  function open() {
    track=App.P.sel.t;view="timeline";notice="";
    const dlg=studio=App.Workspace.begin("Audio studio");dlg.classList.add("ast-dialog");dlg.setAttribute("data-instrument-keys","");dlg.tabIndex=-1;dlg.showModal();
    dlg.addEventListener("close",()=>{if(studio!==dlg)return;stopLoop();cancelAnimationFrame(raf);studio=null;canvas=null;
      if(capture && (!capture.rec || capture.mode==="region"))finishCapture();
      App.releaseAll();},{once:true});
    let width=0,height=0;
    function frame(now){
      if(studio!==dlg || !dlg.open)return;
      if(now-paintStamp>40 && (loopClock || App.Seq.playing || capture || width!==canvas.clientWidth || height!==canvas.clientHeight)){
        draw();paintStamp=now;width=canvas.clientWidth;height=canvas.clientHeight;
        if(capture?.when && !capture.stopping){
          const t=capture.E.ctx.currentTime-capture.when,out=studio.querySelector(".ast-status");
          const label=t<0?"ARMED · RECORDING IN "+(-t).toFixed(1)+" S":
            capture.end?"RECORDING · "+t.toFixed(1)+" / "+(capture.end-capture.when).toFixed(1)+" S":
            "RECORDING · "+t.toFixed(1)+" S · STOP TO PLACE REGION";
          if(out.textContent!==label)out.textContent=label;
        }
      }
      raf=requestAnimationFrame(frame);
    }
    render();raf=requestAnimationFrame(frame);
  }
  // Carry region and slice boundaries through a re-warp, including edits made
  // on a previously stretched version. Coordinates on the original are stable.
  function retimeMarkers(d, targetAnchors) {
    const oldAnchors=d.warpSource ? d.warpSpec?.anchors || [] : [];
    function map(position, points, reverse) {
      const axis=reverse?1:0,other=1-axis;
      let previous=[0,0];
      for(const next of [...points,[1,1]]) {
        if(position<=next[axis]){
          const fraction=(position-previous[axis])/(next[axis]-previous[axis]);
          return previous[other]+(next[other]-previous[other])*fraction;
        }
        previous=next;
      }
      return 1;
    }
    const target=p=>map(map(p,oldAnchors,true),targetAnchors,false);
    const st=target(d.st),en=target(d.en),low=Math.min(st,en),delta=Math.abs(st-en);
    const markers=delta && (d.mode===1 || d.markers?.length) ? App.AudioDSP.sliceEdges(d).slice(1,-1).map(v=>(target(v)-low)/delta) : [];
    return {st,en,markers};
  }
  function editSample(ti) {
    const P=App.P,d=P.tracks[ti].smp;
    const dlg=sampleDialog=App.Workspace.begin("Sample editor");dlg.classList.add("ast-dialog","ast-sample");
    let from=d.warpSpec?.from || P.bpm,to=d.warpSpec?.to || P.bpm;
    let anchors=(d.warpSpec?.anchors || []).map(p=>[...p]), marker=0, text="", busy=false,anchor=0;
    const ready=()=>P===App.P && dlg.open && d===P.tracks[ti].smp;
    function update(fn) {fn();App.commit();App.Dv.build();App.Ed.sync();renderSample();}
    function renderSample() {
      if(!ready())return;
      const S=App.samples.get(d.id), original=App.samples.get(d.warpSource || d.id);
      const body=h("div.dlg-body.ast-body"),close=action("Close","RETURN TO DEVICE",()=>dlg.close());
      body.append(h("div.ast-head",null,h("h2",{text:"Sample editor"}),h("span.sp"),close));
      if(!S || !original){body.append(h("output.ast-status",{text:"LOAD AUDIO IN THE SAMPLE MODULE TO EDIT IT"}));dlg.replaceChildren(body);return;}
      const edges=App.AudioDSP.sliceEdges(d),cv=h("canvas.ast-wave",{"aria-label":"Sample waveform with slice boundaries",role:"img"});
      const bounds=()=>[Math.min(d.st,d.en),Math.max(d.st,d.en)];
      const marks=()=>edges.slice(1,-1).map(v=>(v-edges[0])/(edges.at(-1)-edges[0] || 1));
      const writeMarkers=ms=>{d.markers=ms;d.slices=ms.length+1;d.mode=1;marker=clamp(marker,0,ms.length-1);};
      const markerCtl=select("Boundary",marks().map((v,i)=>[i,(i+1)+" · "+(edges[i+1]*S.buffer.duration).toFixed(3)+" S"]),marker,v=>{marker=+v;renderSample();});
      const adjust=v=>{
        const ms=marks(),low=ms[marker-1] ?? 0,high=ms[marker+1] ?? 1;
        if(!(v>low && v<high)){text="BOUNDARIES MUST REMAIN IN ORDER";renderSample();return;}
        update(()=>writeMarkers(ms.map((x,i)=>i===marker?v:x)));
      };
      body.append(h("div.ast-subhead",null,h("h3",{text:"Slice map"}),h("small",{text:S.name+" · "+S.buffer.duration.toFixed(3)+" S"})),cv,
        h("div.ast-toolbar",null,action("Detect transients","PLACE UP TO 16 SLICES AT THE STRONGEST ATTACKS IN THE TRIMMED RANGE",()=>{
          const [a,b]=bounds(), ms=App.AudioDSP.transients(S.buffer,a,b,16);
          if(!ms.length){text="NO DISTINCT ATTACKS FOUND";renderSample();return;}text=ms.length+" TRANSIENTS";update(()=>writeMarkers(ms));
        },busy),action("Equal slices","DISTRIBUTE THE CURRENT BOUNDARIES EVENLY",()=>update(()=>{d.mode=1;d.markers=[];}),busy),
        markerCtl, number("Position · %",(marks()[marker] ?? .5)*100,.001,99.999,"any",v=>adjust(v/100)),
        action("+ Slice","SPLIT THE SEGMENT BEFORE THIS BOUNDARY",()=>{const ms=marks();ms.splice(marker,0,((ms[marker-1]||0)+ms[marker])/2);update(()=>writeMarkers(ms));},busy || d.slices>=16),
        action("− Slice","REMOVE THE SELECTED BOUNDARY",()=>{const ms=marks();ms.splice(marker,1);update(()=>writeMarkers(ms));},busy || d.slices<=2)));
      const setAnchor=(axis,v)=>{
        const a=anchors[anchor],p=anchors[anchor-1] || [0,0],n=anchors[anchor+1] || [1,1];
        if(v/100<=p[axis] || v/100>=n[axis]){text="WARP ANCHORS MUST REMAIN IN ORDER";}else a[axis]=v/100;
        renderSample();
      };
      const warpCv=h("canvas.ast-warp",{"aria-label":"Original to destination warp anchor map",role:"img"});
      body.append(h("div.ast-subhead",null,h("h3",{text:"Warp / time stretch"}),h("small",{text:original.name+" · "+(original.buffer.duration*from/to).toFixed(3)+" S TARGET"})),
        warpCv,h("div.ast-toolbar",null,number("Source BPM",from,20,400,.01,v=>{from=v;renderSample();}),
          number("Target BPM",to,20,400,.01,v=>{to=v;renderSample();}),action("Project tempo","USE TRANSPORT BPM AS DESTINATION",()=>{to=P.bpm;renderSample();},busy),
          action("+ Anchor","WARP A LOCAL EVENT BY MAPPING SOURCE TO DESTINATION POSITION",()=>{
            const all=[[0,0],...anchors,[1,1]];let at=0;
            for(let i=1;i<all.length-1;i++)if(all[i+1][0]-all[i][0]>all[at+1][0]-all[at][0])at=i;
            anchors.splice(at,0,[(all[at][0]+all[at+1][0])/2,(all[at][1]+all[at+1][1])/2]);anchor=at;renderSample();
          },busy || anchors.length>=32)),
        anchors.length?h("div.ast-toolbar",null,select("Anchor",anchors.map((_,i)=>[i,String(i+1)]),anchor,v=>{anchor=+v;renderSample();}),
          number("Source · %",anchors[anchor][0]*100,.001,99.999,"any",v=>setAnchor(0,v)),
          number("Destination · %",anchors[anchor][1]*100,.001,99.999,"any",v=>setAnchor(1,v)),
          action("Remove anchor","DELETE THIS LOCAL TIME MAPPING",()=>{anchors.splice(anchor,1);anchor=Math.max(0,anchor-1);renderSample();},busy)):null);
      const apply=async()=>{
        busy=true;text="STRETCHING ORIGINAL AUDIO";renderSample();
        const sourceId=d.warpSource || d.id, oldId=d.id, spec={from,to,anchors:anchors.map(a=>[...a])};
        try{
          const out=await App.AudioDSP.warp(original.buffer,from/to,spec.anchors,()=>ready() && d.id===oldId);
          if(!ready() || d.id!==oldId)return;
          const newId=App.addBuffer(original.name.slice(0,32)+" WARP",out);
          update(()=>Object.assign(d,retimeMarkers(d,spec.anchors),{warpSource:sourceId,id:newId,warpSpec:spec}));
          text="STRETCH APPLIED · ORIGINAL RETAINED";
        }catch(e){text=e.message;}finally{busy=false;renderSample();}
      };
      body.append(h("div.ast-toolbar",null,action("Apply stretch","RENDER PITCH-PRESERVING STRETCH FROM THE ORIGINAL SAMPLE",apply,busy,"confirm-action"),
        action("Restore original","PUT ORIGINAL AUDIO BACK IN THE SAMPLER",()=>{text="ORIGINAL RESTORED";from=to=P.bpm;anchors=[];update(()=>Object.assign(d,retimeMarkers(d,[]),{id:d.warpSource,warpSource:"",warpSpec:null}));},busy || !d.warpSource),
        action("Audition","PLAY THE CURRENT SAMPLE",()=>{const E=App.audio();if(E){const r=reg({takes:[{sample:d.id}],track:ti,len:S.buffer.duration,at:0});voice(E,r,E.ctx.currentTime+.03);}},busy)),
        h("output.ast-status",{role:"status",text:text || "SELECT A BOUNDARY ON THE WAVEFORM · DRAG TO REPOSITION"}));
      dlg.replaceChildren(body);
      for(const el of body.querySelectorAll("input,select"))el.disabled=busy;
      const drawWave=()=>{
        const scale=App.UI.fit(cv),w=cv.clientWidth,hh=cv.clientHeight,c=cv.getContext("2d"),pk=S.peaks,n=pk.length/2,C=App.C;
        c.setTransform(scale,0,0,scale,0,0);c.fillStyle=C.r0;c.fillRect(0,0,w,hh);
        for(let i=0;i<w;i++){const j=Math.floor(i/w*n)*2,yy=hh/2,level=hh*.44/Math.max(S.peak,.01);c.fillStyle=C.t2;c.fillRect(i,yy-pk[j+1]*level,1,Math.max(1,(pk[j+1]-pk[j])*level));}
        for(let i=0;i<edges.length;i++){const x=edges[i]*w;c.fillStyle=i===marker+1?C.am:C.t3;c.fillRect(x,0,2,hh);}
      };
      drawWave();
      let movedMarker=null;
      cv.onpointerdown=e=>{
        if(e.button!==0 || busy)return;
        const q=cv.getBoundingClientRect(),f=clamp((e.clientX-q.left)/q.width,0,1);
        marker=edges.slice(1,-1).reduce((nearest,x,i)=>Math.abs(x-f)<Math.abs(edges[nearest+1]-f)?i:nearest,0);drawWave();
        cv.setPointerCapture(e.pointerId);const initial=e.clientX;
        cv.onpointermove=ev=>{
          if(Math.abs(ev.clientX-initial)<3)return;
          edges[marker+1]=clamp((ev.clientX-q.left)/q.width,edges[marker]+.00001,edges[marker+2]-.00001);
          movedMarker=marks();drawWave();
        };
        cv.onpointerup=()=>{cv.onpointermove=null;if(movedMarker)update(()=>writeMarkers(movedMarker));else renderSample();};cv.onpointercancel=()=>renderSample();
      };
      const z=App.UI.fit(warpCv),cw=warpCv.clientWidth,ch=warpCv.clientHeight,ctx=warpCv.getContext("2d");
      ctx.setTransform(z,0,0,z,0,0);ctx.fillStyle=App.C.r0;ctx.fillRect(0,0,cw,ch);
      const scaleX=f=>5+(cw-10)*f;
      for(const [i,p] of [[0,0],...anchors,[1,1]].entries()){ctx.strokeStyle=i===anchor+1?App.C.am:App.C.t3;
        ctx.beginPath();ctx.moveTo(scaleX(p[0]),3);ctx.lineTo(scaleX(p[1]),ch-3);ctx.stroke();
        ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(scaleX(p[0])-2,0,4,5);ctx.fillRect(scaleX(p[1])-2,ch-5,4,5);}
    }
    dlg.addEventListener("close",()=>{if(sampleDialog===dlg)sampleDialog=null;},{once:true});
    dlg.showModal();renderSample();
  }
  function openTranscription() {
    if(capture)return;
    const r=find() || pool()[0];
    if(!r){open();notice="Record or import a single-note melody, then select its region.";render();return;}
    const take=r.takes[r.take];
    App.Transcription.open({sample:take.sample,offset:take.offset,seconds:r.len,name:r.name,track:r.track,at:r.at});
  }
  App.AudioStudio={open,editSample,openTranscription,reset,sync:render,durationSteps,schedule,stopSources};
})();
