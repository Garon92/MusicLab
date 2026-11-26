/* Single-note audio transcription. Review stays separate from the project until insertion. */
(() => {
  "use strict";
  const {h,btn}=App.UI,{clamp}=App;
  const RATE=8000,HOP=80,WINDOW=240,MAX_LAG=188,MIN_LAG=6;
  const stepTime=(P,s)=>App.Conductor ? App.Conductor.time(P,s) : s*15/P.bpm;
  const stepAt=(P,seconds)=>App.Conductor ? App.Conductor.step(P,seconds) : seconds*P.bpm/15;
  const round=v=>Math.round(v*1000)/1000;

  // Box-average before decimation. Use the strongest channel, so an anti-phase
  // stereo recording stays audible to the detector.
  function downsample(buffer,start,end) {
    const sr=buffer.sampleRate, a=Math.floor(start*sr), b=Math.min(buffer.length,Math.ceil(end*sr));
    let input=buffer.getChannelData(0), peak=-1;
    for(let ch=0;ch<buffer.numberOfChannels;ch++){
      const x=buffer.getChannelData(ch);let energy=0;
      for(let j=a;j<b;j+=Math.max(1,Math.floor((b-a)/2048)))energy+=x[j]*x[j];
      if(energy>peak){peak=energy;input=x;}
    }
    const data=new Float32Array(Math.max(0,Math.ceil((b-a)*RATE/sr)));
    for(let i=0;i<data.length;i++){
      const lo=Math.min(b-1,a+Math.floor(i*sr/RATE)),hi=Math.min(b,Math.max(lo+1,a+Math.floor((i+1)*sr/RATE)));
      let v=0;for(let j=lo;j<hi;j++)v+=input[j];data[i]=v/(hi-lo);
    }
    return data;
  }
  // YIN's normalized difference rejects harmonics by taking the first strong
  // period. Parabolic refinement keeps pitch stable between integer sample lags.
  function framePitch(x,center,diff) {
    let energy=0;
    for(let i=center-40;i<center+40;i++){const s=x[i]||0;energy+=s*s;}
    const rms=Math.sqrt(energy/80);
    if(rms<.0016)return {n:null,rms};
    const start=clamp(center-Math.floor((WINDOW+MAX_LAG)/2),0,Math.max(0,x.length-WINDOW-MAX_LAG));
    let total=0,tau=-1,best=MIN_LAG,bestValue=1;
    diff[0]=1;
    for(let lag=1;lag<=MAX_LAG;lag++){
      let sum=0;
      for(let k=0;k<WINDOW;k++){const delta=(x[start+k]||0)-(x[start+k+lag]||0);sum+=delta*delta;}
      total+=sum;diff[lag]=total>1e-10?sum*lag/total:1;
      if(lag<=MIN_LAG+1)continue;
      if(diff[lag-1]<=diff[lag-2] && diff[lag-1]<diff[lag]){
        if(diff[lag-1]<bestValue){bestValue=diff[lag-1];best=lag-1;}
        if(diff[lag-1]<.18){tau=lag-1;break;}
      }
    }
    if(tau<0){if(bestValue>.40)return {n:null,rms};tau=best;}
    const before=diff[tau-1],v=diff[tau],after=diff[tau+1],den=2*(before-2*v+after);
    const period=tau+(den?clamp((before-after)/den,-.5,.5):0);
    const {note:n,cents}=App.InstrumentLab.nearest(RATE/period);
    const confidence=(1-v)*Math.max(0,1-.45*Math.abs(cents)/100);
    return {n:n>=0&&n<=127?n:null,confidence,rms};
  }
  async function analyze(buffer,start=0,end=buffer.duration,active=()=>true) {
    const a=clamp(start,0,buffer.duration),b=clamp(end,a,buffer.duration),x=downsample(buffer,a,b);
    const frames=[],diff=new Float32Array(MAX_LAG+1);
    let nextYield=performance.now()+12,peak=0;
    for(let i=0;i<x.length;i+=HOP){
      if(performance.now()>=nextYield){await new Promise(resolve=>setTimeout(resolve,0));if(!active())return [];nextYield=performance.now()+12;}
      const f=framePitch(x,i,diff);peak=Math.max(peak,f.rms);frames.push(f);
    }
    const ns=frames.map(f=>f.rms<peak*.025?null:f.n);
    for(let i=1;i+1<frames.length;i++){
      if(ns[i-1]===ns[i+1] && ns[i-1]!==null && ns[i]!==ns[i-1])frames[i].n=ns[i-1];
      else frames[i].n=ns[i];
    }
    const notes=[];
    for(let i=0;i<frames.length;){
      const n=frames[i].n;
      if(n==null){i++;continue;}
      let j=i+1,level=frames[i].rms,conf=frames[i].confidence||0;
      while(j<frames.length && frames[j].n===n){
        // A fresh attack after a trough can repeat the same pitch without a rest.
        if(j-i>5 && frames[j].rms>frames[j-1].rms*1.9 && frames[j-1].rms<level*.26)break;
        level=Math.max(level,frames[j].rms);conf+=frames[j].confidence||0;j++;
      }
      const onset=Math.max(0,(i-.5)*HOP/RATE), release=Math.min(b-a,(j-.5)*HOP/RATE);
      if(release-onset>=.038)notes.push({n,start:round(onset),length:round(release-onset),v:clamp(Math.sqrt(level/Math.max(.001,peak))*.9,.08,1),
        confidence:conf/(j-i),keep:true});
      i=j;
    }
    return notes;
  }

  function toNotes(P,sourceStep,start,notes) {
    const origin=stepTime(P,sourceStep)+start, initial=stepAt(P,origin);
    return notes.filter(n=>n.keep).map(n=>{
      const onset=stepAt(P,origin+n.start)-initial,end=stepAt(P,origin+n.start+n.length)-initial,s=Math.max(0,Math.round(onset));
      const off=round(clamp(onset-s,-.49,.49)), l=Math.max(1,Math.round(end-onset));
      return {s,n:n.n,l,v:Math.round(n.v*100)/100,p:1,...(off?{off}:{})};
    });
  }

  function open({sample,offset=0,seconds,name,track,at=0}) {
    const P=App.P,S=App.samples.get(sample);
    if(!S){App.UI.msg("AUDIO SAMPLE IS UNAVAILABLE");return;}
    const buffer=S.buffer,total=Math.max(0,Math.min(seconds??buffer.duration,buffer.duration-offset));
    if(total<=0){App.UI.msg("NO AUDIO IN THIS REGION");return;}
    const initialSpan=Math.min(total,stepTime(P,at+App.MAX_STEPS)-stepTime(P,at));
    const dlg=App.Workspace.begin("Transcribe melody"),body=h("div.dlg-body.ast-body");
    dlg.classList.add("ast-dialog","transcription-dialog");
    const about=h("p.dlg-tip",{text:"FINDS THE NOTES IN A RECORDING · CHECK THEM IN THE LIST · PRINT WRITES A CLIP"});
    let from=0,to=initialSpan,notes=[],status="",dirty=true,busy=false,job=0,original=null,selected=-1;
    const pitched=t=>t.kind==="syn" || (t.kind==="smp" && t.smp.mode!==1);
    const tracks=P.tracks.map((t,i)=>({t,i})).filter(({t})=>pitched(t));
    const hasSource=t=>t.kind==="syn" || (t.smp.mode===3 ? t.smp.zones.some(z=>App.samples.has(z.sample)) : App.samples.has(t.smp.id));
    const solo=P.tracks.some(t=>t.solo), muted=t=>t.mute || (solo && !t.solo);
    const audible=tracks.filter(({t})=>hasSource(t) && !muted(t));
    const available=audible.length?audible:tracks.filter(({t})=>hasSource(t));
    const first=available.find(({i})=>i===track) || available.find(({t})=>t.kind==="syn") || available[0] || tracks[0];
    let ti=first?.i ?? -1;
    let pi=P.sel.p;
    const field=(label,el)=>h("label.ast-field",null,h("span",{text:label}),el);
    function number(label,value,min,max,step,onchange) {
      const e=h("input",{type:"number","aria-label":label,value,min,max,step});e.onchange=()=>{if(e.reportValidity())onchange(e.valueAsNumber);};return e;
    }
    function choice(label,items,val,fn) {
      const el=h("select",{"aria-label":label},items.map(([v,text])=>h("option",{value:v,text})));
      el.value=val;el.onchange=()=>fn(+el.value);return field(label,el);
    }
    const startBox=number("Start in region (s)",0,0,total,"any",v=>{from=v;invalidate();});
    const endBox=number("End in region (s)",to,0,total,"any",v=>{to=v;invalidate();});
    const scan=btn("Analyze range","Detect the pitch and duration of one note at a time",scanRange);
    const print=btn("Insert notes","Commit the reviewed melody to the destination clip",apply,"confirm-action");
    const details=h("output.ast-status",{role:"status"});
    const rows=h("tbody"),table=h("table.transcript-table",null,h("thead",null,h("tr",null,["Use","Pitch","Note","Start · s","Length · s","Listen","Confidence"].map(x=>h("th",{text:x})))),rows);
    const listen=(r)=>{
      const E=App.audio();if(!E)return;
      try{original?.stop();}catch{}
      const src=E.ctx.createBufferSource(),g=E.ctx.createGain(),t=E.ctx.currentTime+.012;
      const when=offset+from+r.start,len=Math.min(r.length,buffer.duration-when);
      if(len<=0)return;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.75,t+Math.min(.006,len/2));
      g.gain.setTargetAtTime(0,t+Math.max(.006,len-.012),.003);
      src.buffer=buffer;src.connect(g).connect(E.tracks[track].tin);
      src.onended=()=>{src.disconnect();g.disconnect();};src.start(t,when,len);original=src;
    };
    function renderRows() {
      rows.replaceChildren();
      notes.forEach((r,i)=>{
        const use=h("input",{type:"checkbox","aria-label":"Keep note "+(i+1)});use.checked=r.keep;use.onchange=()=>{r.keep=use.checked;sync();};
        const caption=h("span",{text:App.noteName(r.n)});
        const pitch=number("Pitch "+(i+1),r.n,0,127,1,v=>{r.n=v;caption.textContent=App.noteName(v);sync();});
        const start=number("Onset "+(i+1),r.start,0,to-from,"any",v=>{r.start=v;sync();});
        const length=number("Duration "+(i+1),r.length,.001,to-from,"any",v=>{r.length=v;sync();});
        const originalButton=btn("Source","Audition this part of the recording",()=>listen(r));
        const noteButton=btn("Note","Audition corrected pitch on the destination instrument",()=>{const E=App.audio();if(E && ti>=0)E.play(ti,r.n,r.v,E.ctx.currentTime+.01,Math.min(r.length,2));});
        const row=h("tr"+(r.confidence<.84?".uncertain":""),null,[use,pitch,caption,start,length,h("span",null,originalButton,noteButton),
          Math.round(r.confidence*100)+"%"+(r.confidence<.84?" · CHECK":"")].map(e=>h("td",null,e)));
        row.onclick=()=>{rows.children[selected]?.classList.remove("selected");selected=i;row.classList.add("selected");};
        rows.append(row);
      });
    }
    function sync() {
      const selectedNotes=notes.filter(r=>r.keep),length=ti>=0?P.tracks[ti].clips[pi].length:0;
      const valid=from>=0 && to>from && to<=total+.000001;
      scan.disabled=busy || !valid;
      let problem="";
      if(ti<0) problem="Choose a pitched instrument on a destination track first.";
      else if(!valid) problem="End must be after start and inside the region.";
      else if(selectedNotes.some(r=>r.start+r.length>to-from+.012))problem="A reviewed note exceeds the analyzed range.";
      else if(toNotes(P,at,from,notes).some(n=>n.s+n.l>App.MAX_STEPS))problem="Choose a shorter range to fit 256 steps.";
      else if(selectedNotes.length+length>4000)problem="The destination exceeds its note limit.";
      print.disabled=busy || dirty || !selectedNotes.length || !!problem;
      const target=ti>=0?P.tracks[ti]:null;
      const note=target && !hasSource(target)?" · destination needs a sample":target && muted(target)?" · destination is muted":"";
      details.textContent=(problem || status || (dirty?"Analyze the selected range.":selectedNotes.length+" notes · "+notes.filter(r=>r.confidence<.84).length+" to check · "+length+" existing notes kept"))+note;
    }
    function invalidate(){++job;busy=false;dirty=true;notes=[];renderRows();status="";sync();}
    async function scanRange() {
      if(busy || to<=from || to>total+.000001)return;
      const token=++job;busy=true;dirty=true;notes=[];renderRows();status="Analyzing melody…";sync();
      const active=()=>App.P===P && dlg.open && token===job;
      try {
        const found=await analyze(buffer,offset+from,offset+to,active);if(!active())return;
        notes=found;dirty=false;status=notes.length?"":"No stable notes in this range. Try a solo voice or single-note instrument.";renderRows();
      }catch(e){if(active())status=e.message||"Audio analysis failed.";}
      finally{if(active()){busy=false;sync();}}
    }
    function apply() {
      sync();if(print.disabled || App.P!==P)return;
      const T=P.tracks[ti], clip=T.clips[pi], added=toNotes(P,at,from,notes),needed=Math.max(...added.map(n=>n.s+n.l));
      clip.push(...added);clip.sort((a,b)=>a.s-b.s || a.n-b.n);
      if(needed>App.Live.length(P,ti,pi))P.performance.loops[ti][pi]=needed;
      App.select(ti,pi);App.commit();dlg.close();App.refresh();
      App.UI.msg(added.length+" TRANSCRIBED NOTES › "+T.name+" / "+App.PATS[pi]);
    }
    body.append(h("h2",{text:"Transcribe melody · "+(name||S.name)}),
      h("div.ast-toolbar",null,field("Start in region · s",startBox),field("End in region · s",endBox),scan),
      h("div.transcript-scroll",null,table),
      h("div.ast-toolbar",null,choice("Destination track",tracks.map(({i,t})=>[i,(i+1)+" · "+t.name]),ti,v=>{ti=v;sync();}),
        choice("Destination pattern",[...App.PATS].map((p,i)=>[i,p]),pi,v=>{pi=v;sync();}),print),details);
    body.append(about);dlg.append(body);dlg.showModal();sync();scanRange();
    dlg.addEventListener("close",()=>{job++;try{original?.stop();}catch{}},{once:true});
  }
  App.Transcription={analyze,open,toNotes};
})();
