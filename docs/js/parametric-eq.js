/* Post-insert equalizer; preview taps belong to the open editor, never to exports. */
(() => {
  "use strict";
  const {clamp}=App, {h,btn}=App.UI;
  const centers=[100,400,1600,6400], maxHz=20000, fft=2048;
  const num=(x,min,max,fallback)=>Number.isFinite(x)?clamp(x,min,max):fallback;
  function model(raw) {
    return {on:raw?.on!==false,bands:centers.map((hz,i)=>{
      const b=raw?.bands?.[i];
      return {hz:num(b?.hz,20,maxHz,hz),db:num(b?.db,-18,18,0),q:num(b?.q,.15,18,1),on:b?.on!==false};
    })};
  }
  function graph(ctx,output) {
    const input=ctx.createGain(), bands=[], processed=ctx.createGain(), raw=ctx.createGain();
    let last=input, config=model(), monitor=null;
    const max=Math.min(maxHz,ctx.sampleRate*.49);
    for (const hz of centers) {
      const f=ctx.createBiquadFilter(); f.type="peaking"; f.frequency.value=Math.min(hz,max);
      f.Q.value=1;f.gain.value=0;last.connect(f);last=f;bands.push(f);
    }
    last.connect(processed).connect(output); input.connect(raw).connect(output);raw.gain.value=0;
    const steady=(param,value,time=ctx.currentTime)=>{
      if (!time) {param.value=value;return;}
      param.cancelScheduledValues(time);param.setTargetAtTime(value,time,.008);
    };
    function setPath() {
      const band=monitor?.mode==="band", dry=monitor?.mode==="dry";
      steady(raw.gain,!band && (dry||!config.on)?1:0);
      steady(processed.gain,!band && !dry && config.on?(monitor?.match?monitor.factor:1):0);
      if(monitor) steady(monitor.listenGain.gain,band?1:0);
    }
    function sync(eq) {
      config=eq || model();
      config.bands.forEach((b,i)=>{
        const f=bands[i];steady(f.frequency,Math.min(max,b.hz));steady(f.gain,b.on?b.db:0);steady(f.Q,b.q);
      });
      setPath();
      if(monitor) listen(monitor.index);
    }
    function listen(index) {
      if(!monitor)return;
      monitor.index=index;
      const b=config.bands[index];steady(monitor.listen.frequency,Math.min(max,b.hz));steady(monitor.listen.Q,b.q);
    }
    function audition(mode,match,index) {
      if(!monitor)return;
      monitor.mode=mode;monitor.match=match;listen(index);setPath();
    }
    // The two parallel stereo meters measure the same samples before and after EQ.
    // K-weight the monitor signal before measuring mean square to compare loudness.
    function meter(tap) {
      const shelf=ctx.createBiquadFilter(), hp=ctx.createBiquadFilter(), split=ctx.createChannelSplitter(2);
      shelf.type="highshelf";shelf.frequency.value=1682;shelf.gain.value=4;
      hp.type="highpass";hp.frequency.value=38;hp.Q.value=.5;
      const stereo=ctx.createGain();stereo.channelCount=2;stereo.channelCountMode="explicit";
      tap.connect(shelf).connect(hp).connect(stereo).connect(split);
      const channels=[0,1].map(i=>{const a=ctx.createAnalyser();a.fftSize=fft;split.connect(a,i);return a;});
      const data=new Float32Array(fft);
      return {power(){
        let power=0;
        for(const a of channels){a.getFloatTimeDomainData(data);for(const x of data)power+=x*x;}
        return power/(2*fft);
      },close(){tap.disconnect(shelf);shelf.disconnect();hp.disconnect();stereo.disconnect();split.disconnect();}};
    }
    function attach() {
      detach();
      const pre=ctx.createAnalyser(),post=ctx.createAnalyser(),listen=ctx.createBiquadFilter(),listenGain=ctx.createGain();
      pre.fftSize=post.fftSize=fft;pre.smoothingTimeConstant=post.smoothingTimeConstant=.65;
      input.connect(pre);last.connect(post);listen.type="bandpass";input.connect(listen).connect(listenGain).connect(output);listenGain.gain.value=0;
      monitor={pre,post,listen,listenGain,a:meter(input),b:meter(last),index:0,mode:"eq",match:true,factor:1,prePower:0,postPower:0};
      return monitor;
    }
    function measure() {
      const m=monitor;if(!m)return null;
      const a=m.a.power(),b=m.b.power();
      if(a>1e-10 && b>1e-10) {
        const sm=m.prePower ? .94 : 0;
        m.prePower=sm*m.prePower+(1-sm)*a;m.postPower=sm*m.postPower+(1-sm)*b;
        const factor=clamp(Math.sqrt(m.prePower/m.postPower),.125,8);
        if(Math.abs(m.factor-factor)>.001){m.factor=factor;if(m.match && m.mode==="eq" && config.on)steady(processed.gain,factor);}
      }
      return m;
    }
    function detach(owner) {
      if(!monitor || (owner && monitor!==owner))return;
      const {pre,post,listen,listenGain,a,b}=monitor;monitor=null;
      input.disconnect(pre);last.disconnect(post);input.disconnect(listen);listen.disconnect();listenGain.disconnect();
      a.close();b.close();setPath();
    }
    function schedule(from,to,t,end) {
      const ramp=(p,a,b)=>{p.setValueAtTime(a,t);if(a!==b)p.linearRampToValueAtTime(b,end);};
      from.bands.forEach((b,i)=>{
        const d=to.bands[i],f=bands[i];
        ramp(f.frequency,Math.min(max,b.hz),Math.min(max,d.hz));ramp(f.Q,b.q,d.q);ramp(f.gain,b.on?b.db:0,d.on?d.db:0);
      });
      if(!monitor){ramp(raw.gain,from.on?0:1,to.on?0:1);ramp(processed.gain,from.on?1:0,to.on?1:0);}
    }
    const cancel=time=>{
      for(const f of bands)for(const p of [f.frequency,f.gain,f.Q])p.cancelScheduledValues(time);
      for(const p of [raw.gain,processed.gain])p.cancelScheduledValues(time);
    };
    return {input,attach,detach,audition,measure,sync,schedule,bands,cancel};
  }

  const field=(name,el)=>h("label.rack-field",null,h("span",{text:name}),el);
  function open(ti=App.P.sel.t) {
    const E=App.audio();if(!E)return;
    const P=App.P, dialog=App.Workspace.begin("Parametric EQ");
    dialog.classList.add("rack-dialog","eq-dialog");
    const body=h("div.dlg-body"), cv=h("canvas.eq-spectrum",{"aria-label":"Spectrum and draggable equalizer bands",tabindex:0});
    const track=h("select",{"aria-label":"EQ track"},P.tracks.map((t,i)=>h("option",{value:i,text:(i+1)+" · "+t.name})));
    const pick=h("select",{"aria-label":"EQ band"},centers.map((_,i)=>h("option",{value:i,text:"Band "+(i+1)})));
    const match=h("input",{type:"checkbox","aria-label":"Level match A/B"});match.checked=true;
    const mode=h("select",{"aria-label":"Monitor path"},[["eq","EQ output"],["dry","Dry reference"],["band","Solo frequency band"]].map(([value,text])=>h("option",{value,text})));
    const status=h("output.eq-meter",{role:"status"}), read=h("div.rack-row");
    let band=0,active,monitor,frame,dragging=false,tweaked=false;
    const get=()=>P.rack.strips[ti].eq;
    const dirty=()=>{active.sync(get());audition();};
    const audition=()=>active.audition(mode.value,match.checked,band);
    const enable=btn("","Toggle this equalizer in playback and export",()=>{get().on=!get().on;dirty();App.commit();sync();});
    const bandOn=btn("","Enable the selected band",()=>{const b=get().bands[band];b.on=!b.on;dirty();App.commit();sync();});
    const vals={};
    for(const [key,name,min,max,step] of [["hz","Frequency · Hz",20,maxHz,1],["db","Gain · dB",-18,18,.1],["q","Q",.15,18,.01]]) {
      const el=h("input",{type:"number","aria-label":name,min,max,step});
      el.onchange=()=>{const v=el.valueAsNumber;if(!Number.isFinite(v)){sync();return;}get().bands[band][key]=clamp(v,min,max);dirty();App.commit();sync();};
      vals[key]=el;read.append(field(name,el));
    }
    function sync(){
      const eq=get(),b=eq.bands[band];pick.value=String(band);track.value=String(ti);
      for(const key in vals)vals[key].value=b[key];
      enable.textContent=eq.on?"EQ on":"EQ bypassed";enable.setAttribute("aria-pressed",String(eq.on));
      bandOn.textContent=b.on?"Band on":"Band bypassed";bandOn.setAttribute("aria-pressed",String(b.on));
    }
    function attach(){active?.detach(monitor);active=E.rack.eq(ti);monitor=active.attach();audition();sync();}
    track.onchange=()=>{ti=+track.value;attach();};pick.onchange=()=>{band=+pick.value;sync();audition();};
    mode.onchange=match.onchange=audition;
    const play=btn("Play","Toggle transport to audition this track in the mix",()=>App.Seq.toggle());
    body.append(h("div.rack-head",null,h("h2",{text:"Parametric EQ"}),btn("Close","Return to console",()=>dialog.close())),
      h("div.rack-row",null,field("Channel",track),enable,play), cv,
      h("div.rack-row",null,field("Band",pick),read,bandOn),
      h("div.rack-row.eq-monitor",null,field("Monitor",mode),h("label",null,match," Level match A/B"),status),
      h("p.rack-note",{text:"Drag a band for frequency and gain. Wheel or use Q for bandwidth. Green shows the input, pale green the output, amber the filter response."}));
    dialog.append(body);dialog.showModal();attach();
    const cx=cv.getContext("2d"), lowHz=20, highHz=Math.min(maxHz,E.ctx.sampleRate*.49), span=Math.log(highHz/lowHz);
    const xFrom=hz=>Math.log(clamp(hz,lowHz,highHz)/lowHz)/span;
    const binA=new Float32Array(fft/2),binB=new Float32Array(fft/2);
    const freq=Float32Array.from({length:256},(_,i)=>lowHz*Math.exp(span*i/255)), mag=new Float32Array(256),phase=new Float32Array(256),response=new Float32Array(256);
    function draw(){
      if(!dialog.open || App.P!==P){if(dialog.open)dialog.close();return;}
      const w=Math.max(1,cv.clientWidth),hh=Math.max(1,cv.clientHeight),dpr=Math.min(2,devicePixelRatio);
      if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(hh*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(hh*dpr);}
      cx.setTransform(dpr,0,0,dpr,0,0);cx.fillStyle="#07110c";cx.fillRect(0,0,w,hh);
      const yDb=db=>(.5-clamp(db,-20,20)/40)*hh;
      cx.font="10px monospace";cx.lineWidth=1;
      for(const hz of [50,100,200,500,1000,2000,5000,10000]){
        const x=xFrom(hz)*w;cx.strokeStyle="#1c3328";cx.beginPath();cx.moveTo(x,0);cx.lineTo(x,hh);cx.stroke();cx.fillStyle="#76a28b";cx.fillText(hz>=1000?hz/1000+"k":String(hz),x+3,hh-4);
      }
      for(const db of [-12,0,12]){cx.strokeStyle="#284134";cx.beginPath();cx.moveTo(0,yDb(db));cx.lineTo(w,yDb(db));cx.stroke();}
      const m=active.measure();
      function spectrum(an,data,color){an.getFloatFrequencyData(data);cx.strokeStyle=color;cx.beginPath();
        for(let i=0;i<freq.length;i++){const j=clamp(Math.round(freq[i]*fft/E.ctx.sampleRate),0,data.length-1);
          const y=hh*(1-clamp((data[j]+96)/96,0,1));if(i===0)cx.moveTo(0,y);else cx.lineTo(i*w/255,y);}
        cx.stroke();}
      spectrum(monitor.pre,binA,"#387a59");spectrum(monitor.post,binB,"#99d9ad");
      response.fill(0);
      for (const f of active.bands){f.getFrequencyResponse(freq,mag,phase);for(let i=0;i<mag.length;i++)response[i]+=20*Math.log10(Math.max(.001,mag[i]));}
      cx.strokeStyle="#ecbc62";cx.beginPath();response.forEach((db,i)=>i?cx.lineTo(i*w/255,yDb(db)):cx.moveTo(0,yDb(db)));cx.stroke();
      get().bands.forEach((b,i)=>{const x=xFrom(b.hz)*w,y=yDb(b.db);cx.fillStyle=!b.on?"#587264":i===band?"#ffe2a0":"#97b99f";cx.fillRect(x-5,y-5,10,10);cx.fillStyle="#c7d9cb";cx.fillText(String(i+1),x+7,y-5);});
      const info=match.checked && mode.value!=="band" && m?.prePower?"Match "+(20*Math.log10(m.factor)).toFixed(1)+" dB":"";
      if(status.textContent!==info)status.textContent=info;
      const text=App.Seq.playing?"Stop":"Play";if(play.textContent!==text)play.textContent=text;
      frame=requestAnimationFrame(draw);
    }
    const coords=e=>{const r=cv.getBoundingClientRect();return [clamp((e.clientX-r.left)/r.width,0,1),clamp((e.clientY-r.top)/r.height,0,1)];};
    const move=e=>{if(!dragging)return;const [x,y]=coords(e),b=get().bands[band];b.hz=Math.round(lowHz*Math.exp(span*x));b.db=Math.round(clamp((.5-y)*40,-18,18)*10)/10;dirty();sync();tweaked=true;};
    cv.onpointerdown=e=>{if(e.button!==0)return;const [x,y]=coords(e),r=cv.getBoundingClientRect();
      let distance=Infinity;
      get().bands.forEach((b,i)=>{const d=Math.hypot((x-xFrom(b.hz))*r.width,(y-.5+b.db/40)*r.height);if(d<distance){distance=d;band=i;}});
      dragging=true;tweaked=false;cv.setPointerCapture(e.pointerId);sync();audition();if(distance>12)move(e);};
    cv.onpointermove=move;
    cv.onpointerup=cv.onpointercancel=()=>{dragging=false;if(tweaked)App.commit();tweaked=false;};
    cv.addEventListener("wheel",e=>{e.preventDefault();const b=get().bands[band];b.q=+clamp(b.q*Math.exp(-e.deltaY*.002),.15,18).toFixed(2);dirty();sync();App.commit();},{passive:false});
    dialog.addEventListener("close",()=>{cancelAnimationFrame(frame);active.detach(monitor);if(tweaked)App.commit();},{once:true});
    frame=requestAnimationFrame(draw);
  }
  App.ParametricEQ={model,graph,open};
})();
