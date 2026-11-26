/* Per-voice modular synthesis, harmonic tables and project temperament. */
(() => {
  "use strict";
  const {clamp} = App;
  const waves = ["sine","triangle","sawtooth","square"];
  const filters = ["lowpass","highpass","bandpass","notch"];
  const bounded = (n,lo,hi,fallback) => Number.isFinite(n) ? clamp(n,lo,hi) : fallback;
  const moduleTypes = {
    osc:"Oscillator", noise:"Noise", impulse:"Impulse", lfo:"LFO", env:"Envelope",
    amp:"Amplifier", filter:"Filter", reson:"Tuned resonator"
  };
  const inputs = {
    osc:["pitch"], lfo:["rate"], noise:[], impulse:[], env:[],
    amp:["audio","gain"], filter:["audio","pitch"], reson:["audio","pitch"], out:["audio"]
  };
  function moduleOf(type,id,index=0,raw={}) {
    const n={id,type, x:bounded(raw.x,0,.83,.05+index%4*.21), y:bounded(raw.y,0,.78,.1+(Math.floor(index/4)%3)*.26)};
    if(["osc","lfo"].includes(type))n.wave=waves.includes(raw.wave)?raw.wave:"sine";
    if(["osc","reson"].includes(type))n.ratio=bounded(raw.ratio,.0625,32,1);
    if(type==="filter"){ n.mode=filters.includes(raw.mode)?raw.mode:"lowpass"; n.hz=bounded(raw.hz,20,20000,1800); }
    if(type==="filter" || type==="reson")n.q=bounded(raw.q,.1,90,type==="reson"?36:1);
    if(type==="amp")n.level=bounded(raw.level,0,2,.75);
    if(type==="lfo")n.rate=bounded(raw.rate,.015,60,2);
    if(type==="env"){ n.attack=bounded(raw.attack,.001,4,.008); n.decay=bounded(raw.decay,.005,6,.24); n.sustain=bounded(raw.sustain,0,1,.25); n.release=bounded(raw.release,.005,6,.12); }
    return n;
  }
  const validCable = (graph,cable) => {
    const {from,to,port}=cable;
    if(from===to || !graph.nodes.some(n=>n.id===from))return false;
    const target=to==="out"?"out":graph.nodes.find(n=>n.id===to)?.type;
    if(!inputs[target]?.includes(port) || graph.cables.some(c=>c.from===from && c.to===to && c.port===port))return false;
    const stack=[to], seen=new Set();
    while(stack.length) {
      const id=stack.pop();
      if(id===from)return false;
      if(seen.has(id))continue;
      seen.add(id);graph.cables.forEach(c=>{if(c.from===id)stack.push(c.to);});
    }
    return true;
  };
  // Modules a cable path joins to OUTPUT. Anything outside this set has no effect, and a patch with none of them is silent.
  const heard = graph => {
    const seen=new Set(["out"]);
    for(let grew=true;grew;){grew=false;for(const c of graph.cables)if(seen.has(c.to) && !seen.has(c.from)){seen.add(c.from);grew=true;}}
    seen.delete("out");return seen;
  };
  function graphOf(raw) {
    if(!Array.isArray(raw?.nodes))return {nodes:[moduleOf("osc","osc1")],cables:[{from:"osc1",to:"out",port:"audio",amount:.7}]};
    const g={nodes:[],cables:[]};
    for(const node of raw.nodes.slice(0,16)) {
      if(!node || !Object.hasOwn(moduleTypes,node.type) || !/^[a-z][a-z0-9]{0,20}$/.test(node.id) || node.id==="out" || g.nodes.some(n=>n.id===node.id))continue;
      g.nodes.push(moduleOf(node.type,node.id,g.nodes.length,node));
    }
    if(Array.isArray(raw.cables))for(const c of raw.cables.slice(0,48)) {
      if(c && validCable(g,c))g.cables.push({from:c.from,to:c.to,port:c.port,amount:bounded(c.amount,-2,2,1)});
    }
    return g;
  }

  const PARTIALS=24;
  const frameOf=(f={})=>({
    sin:Array.from({length:PARTIALS},(_,i)=>bounded(f.sin?.[i],-1,1,i===0?1:0)),
    cos:Array.from({length:PARTIALS},(_,i)=>bounded(f.cos?.[i],-1,1,0))
  });
  function framesOf(raw) {
    const frames=Array.isArray(raw) ? raw.slice(0,8).map(f=>frameOf(f || {})) : [];
    return frames.length?frames:[frameOf(),frameOf({sin:Array.from({length:PARTIALS},(_,i)=>i%2?0:1/(i+1))})];
  }
  // Extract one chosen cycle. Keep phase as well as amplitude for every partial.
  function frameFromSample(buf,fraction,fundamental) {
    const input=buf.getChannelData(0), periodic=clamp(buf.sampleRate/fundamental,2,buf.length);
    const start=Math.round(clamp(fraction,0,1)*Math.max(0,buf.length-periodic));
    const frame=frameOf(), N=256, values=new Float32Array(N);
    for(let j=0;j<N;j++){
      const t=start+j*periodic/N,k=Math.floor(t),a=input[k]||0;
      values[j]=a+(t-k)*((input[Math.min(k+1,input.length-1)]||0)-a);
    }
    for(let k=0;k<PARTIALS;k++){
      let re=0,im=0;
      for(let j=0;j<N;j++){const angle=2*Math.PI*(k+1)*j/N;re+=values[j]*Math.cos(angle);im+=values[j]*Math.sin(angle);}
      frame.cos[k]=clamp(2*re/N,-1,1);frame.sin[k]=clamp(2*im/N,-1,1);
    }
    return frame;
  }

  const equal=Array.from({length:12},(_,i)=>(i+1)*100);
  const just=[16/15,9/8,6/5,5/4,4/3,45/32,3/2,8/5,5/3,9/5,15/8,2].map(r=>1200*Math.log2(r));
  function tuningOf(raw) {
    let cents=Array.isArray(raw?.cents)?raw.cents.slice(0,128):[];
    if(!cents.length || !cents.every(v=>Number.isFinite(v) && Math.abs(v)<=9600) || cents.at(-1)<=0)cents=equal;
    return {enabled:raw?.enabled===true, root:Math.round(bounded(raw?.root,0,127,60)),
      reference:Math.round(bounded(raw?.reference,0,127,69)), hz:bounded(raw?.hz,10,20000,440),
      name:typeof raw?.name==="string"?raw.name.slice(0,64):"Equal temperament",cents:[...cents]};
  }
  function parsePitch(line) {
    const token=line.trim().split(/\s+/)[0];
    if(/^[-+]?(?:\d+\.\d*|\.\d+)$/.test(token))return Number(token);
    if(/^\d+(?:\/\d+)?$/.test(token)){
      const [a,b="1"]=token.split("/");
      if(+a>0 && +b>0)return 1200*Math.log2(+a/+b);
    }
    throw Error("Invalid interval: "+token);
  }
  function parseScala(text) {
    const lines=text.replace(/^\uFEFF/,"").replace(/\r/g,"").split("\n").filter(l=>!l.trimStart().startsWith("!"));
    const name=(lines.shift()||"").trim() || "Scala scale";
    const count=Number((lines.shift()||"").trim());
    if(!Number.isInteger(count) || count<1 || count>128)throw Error("Use 1–128 scale degrees.");
    const pitches=lines.filter(l=>l.trim()).slice(0,count).map(parsePitch);
    if(pitches.length!==count || pitches.some(x=>!Number.isFinite(x)||Math.abs(x)>9600) || pitches.at(-1)<=0)throw Error("Check the intervals and the final repeat period.");
    return {name:name.slice(0,64),cents:pitches};
  }
  function distance(note,tun) {
    const step=note-tun.root, n=tun.cents.length, d=((step%n)+n)%n;
    return Math.floor(step/n)*tun.cents[n-1]+(d ? tun.cents[d-1] : 0);
  }
  const standardHz=n=>440*2**((n-69)/12);
  function frequency(n,P) {
    const t=P?.tuning;
    if(!t?.enabled)return standardHz(n);
    const cents=distance(n,t)-distance(t.reference,t);
    return clamp(t.hz*2**(cents/1200),.001,200000);
  }
  function nearest(hz,P=App.P) {
    if(!P?.tuning?.enabled){
      const m=69+12*Math.log2(hz/440),note=Math.round(m);
      return {note,cents:(m-note)*100};
    }
    let note=0,cents=Infinity;
    for(let i=0;i<128;i++){
      const offset=1200*Math.log2(hz/frequency(i,P));
      if(Math.abs(offset)<Math.abs(cents)){note=i;cents=offset;}
    }
    return {note,cents};
  }
  App.extendProject({load(P,raw){
    P.tuning=tuningOf(raw.tuning);
    P.tracks.forEach((T,i)=>{
      const syn=raw.tracks?.[i]?.syn;
      T.syn.graph=graphOf(syn?.graph);
      T.syn.frames=framesOf(syn?.frames);
    });
  }});

  function modularVoice(ctx,v,d,{head,time,off,hz,tune,noise,adsr}) {
    const nodes=new Map(),g=d.graph;
    if(!g || !g.cables.some(c=>c.to==="out"))return;
    const constSrc=value=>{const s=ctx.createConstantSource();s.offset.value=value;return s;};
    // Keep the voice alive for its full release, including the filter decay after an excitation pulse.
    const life=constSrc(0);life.connect(head);life.start(time);v.src.push(life);v.nodes.push(life);
    const releases=[];
    for(const m of g.nodes){
      let n,output;
      if(m.type==="osc" || m.type==="lfo"){
        n=ctx.createOscillator();n.type=m.wave;n.frequency.value=m.type==="lfo"?m.rate:Math.min(ctx.sampleRate/2,hz*m.ratio);
        if(m.type==="osc")tune(n.detune);
      } else if(m.type==="noise" || m.type==="impulse"){
        n=ctx.createBufferSource();
        if(m.type==="noise"){n.buffer=noise;n.loop=true;}
        else {
          // A short falling pulse supplies enough energy to excite a narrow filter at ordinary levels.
          const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.012),ctx.sampleRate),x=b.getChannelData(0);
          for(let j=0;j<x.length;j++)x[j]=Math.exp(-j/(ctx.sampleRate*.002));
          n.buffer=b;
        }
      } else if(m.type==="env"){
        n=constSrc(0);adsr(n.offset,time,1,m.attack,m.decay,m.sustain,off,m.release);
        releases.push([n.offset,m.release]);
      } else if(m.type==="amp"){
        n=ctx.createGain();n.gain.value=m.level;
      } else {
        n=ctx.createBiquadFilter();n.type=m.type==="reson"?"bandpass":m.mode;
        n.frequency.value=Math.min(ctx.sampleRate/2,m.type==="reson"?hz*m.ratio:m.hz);n.Q.value=m.q;
        if(m.type==="reson"){
          tune(n.detune);
          output=ctx.createGain();output.gain.value=Math.sqrt(m.q);
          n.connect(output);v.nodes.push(output);
        }
      }
      if(n.start){v.src.push(n);n.start(time);}
      nodes.set(m.id,{input:n,output:output || n});v.nodes.push(n);
    }
    // What leaves the patch is bounded (±8, far above any normal level): stacked gains cannot push the strip's filters to infinity.
    let exit=null;
    const out=()=>{
      if(!exit){
        const pre=ctx.createGain(),clip=ctx.createWaveShaper(),post=ctx.createGain();
        pre.gain.value=1/8;clip.curve=new Float32Array([-1,1]);post.gain.value=8;
        pre.connect(clip).connect(post).connect(head);v.nodes.push(pre,clip,post);exit=pre;
      }
      return exit;
    };
    const kinds=new Map(g.nodes.map(m=>[m.id,m.type]));
    for(const c of g.cables){
      const source=nodes.get(c.from).output,dest=c.to==="out"?out():nodes.get(c.to).input;
      const wire=ctx.createGain();wire.gain.value=c.amount*(c.port==="pitch"?1200:c.port==="rate"?10:1);
      let from=source.connect(wire);
      // A filter swept at audio rate becomes unstable and turns the whole output into NaN. Its pitch input follows
      // movement up to 30 Hz, which is what sweeping a filter means; oscillators keep audio-rate FM.
      if(c.port==="pitch" && kinds.get(c.to)!=="osc" && kinds.get(c.to)!=="lfo"){
        const slow=ctx.createBiquadFilter();slow.type="lowpass";slow.frequency.value=30;slow.Q.value=-3;
        from=from.connect(slow);v.nodes.push(slow);
      }
      from.connect(c.port==="pitch"?dest.detune:c.port==="rate"?dest.frequency:c.port==="gain"?dest.gain:dest);
      v.nodes.push(wire);
    }
    v.releaseModules=at=>{for(const [p,r] of releases){p.cancelScheduledValues(at);p.setTargetAtTime(0,at,r/4);}};
  }
  const waveCache=new WeakMap();
  function periodic(ctx,f) {
    let cache=waveCache.get(ctx);
    if(!cache)waveCache.set(ctx,cache=new WeakMap());
    if(cache.has(f))return cache.get(f);
    const wave=ctx.createPeriodicWave(Float32Array.from([0,...f.cos]),Float32Array.from([0,...f.sin]),{disableNormalization:true});
    cache.set(f,wave);return wave;
  }
  // Crossfade coefficients depend only on table size. Share them across voices.
  const scanCurves=new Map();
  function scanWeights(count) {
    if(!scanCurves.has(count)){
      const curves=Array.from({length:count},(_,i)=>Float32Array.from({length:1025},(_,j)=>{
        const position=clamp(j/512-1,0,1)*(count-1);
        return Math.max(0,1-Math.abs(position-i));
      }));
      scanCurves.set(count,curves);
    }
    return scanCurves.get(count);
  }
  function wavetableVoice(ctx,v,d,{head,time,hz,tune,scan}) {
    const frames=d.frames || framesOf(), count=frames.length;
    frames.forEach((f,i)=>{
      const osc=ctx.createOscillator();osc.frequency.value=Math.min(hz,ctx.sampleRate/2);
      osc.setPeriodicWave(periodic(ctx,f));tune(osc.detune);
      const gain=ctx.createGain();
      if(count>1){
        gain.gain.value=0;
        // Convert scan position (0..1) into adjacent-frame crossfade weights.
        const sh=ctx.createWaveShaper();
        sh.curve=scanWeights(count)[i];
        scan.connect(sh).connect(gain.gain);v.mods.push([scan,sh]);v.nodes.push(sh);
      }
      osc.connect(gain).connect(head);osc.start(time);v.src.push(osc);v.nodes.push(osc,gain);
    });
  }
  App.InstrumentLab={moduleTypes,inputs,moduleOf,validCable,heard,graphOf,framesOf,frameOf,frameFromSample,
    tuningOf,parseScala,parsePitch,equal,just,standardHz,frequency,nearest,PARTIALS,modularVoice,wavetableVoice};
})();
