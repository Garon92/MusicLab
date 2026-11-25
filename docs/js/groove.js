/* Timing/accent templates preserve the played displacement from the swung grid. */
(() => {
  "use strict";
  const {h,btn}=App.UI, signed=v=>Math.round(App.clamp(Number(v)||0,-.49,.49)*1000)/1000;
  let taps=null;
  // Analyze samples on the audio thread. A short peak window gives each onset
  // its own accent. Hysteresis and a quiet interval keep clap tails from retriggering.
  class ClapDetector {
    constructor(rate) {
      this.rate=rate;this.decay=Math.exp(-1/(rate*.009));this.smooth=1-Math.exp(-1/(rate*.7));
      this.floor=.003;this.envelope=0;this.active=false;this.sent=false;this.quiet=0;this.last=-Infinity;
    }
    read(data,base,hit) {
      for(let i=0;i<data.length;i++){
        const level=Math.abs(data[i]),time=base+i/this.rate;
        this.envelope=Math.max(level,this.envelope*this.decay);
        this.floor+=(Math.min(level,.15)-this.floor)*this.smooth;
        if(this.active){
          this.peak=Math.max(this.peak,level);
          if(!this.sent && time-this.last>=.014){hit(this.last,Math.min(1,Math.sqrt(this.peak)));this.sent=true;}
          this.quiet=this.envelope<Math.max(.012,this.floor*2.1)?this.quiet+1:0;
          if(this.sent && this.quiet>=.016*this.rate)this.active=false;
        }else if(this.envelope>Math.max(.033,this.floor*4.5) && time-this.last>.057){
          this.last=time;this.peak=level;this.quiet=0;this.active=true;this.sent=false;
        }
      }
    }
  }
  const processors=new WeakMap();
  function loadDetector(ctx){
    if(!ctx.audioWorklet || typeof AudioWorkletNode==="undefined")return Promise.resolve(false);
    if(!processors.has(ctx)){
      const code=ClapDetector.toString()+`
        class GrooveInput extends AudioWorkletProcessor {
          constructor(){super();this.detector=new ClapDetector(sampleRate);this.port.onmessage=()=>this.done=true;}
          process(inputs){if(this.done)return false;const ch=inputs[0][0];if(ch)this.detector.read(ch,currentFrame/sampleRate,(time,v)=>this.port.postMessage([time,v]));return true;}
        }
        registerProcessor("musiclab-groove-input",GrooveInput);`;
      const local=location.protocol==="file:";
      const url=local?"data:text/javascript;charset=utf-8,"+encodeURIComponent(code):URL.createObjectURL(new Blob([code],{type:"text/javascript"}));
      processors.set(ctx,ctx.audioWorklet.addModule(url).then(()=>true,()=>false).finally(()=>{if(!local)URL.revokeObjectURL(url);}));
    }
    return processors.get(ctx);
  }
  function closeCapture(){
    const c=taps;taps=null;
    if(!c?.E)return;
    if(c.node){
      if(c.node.port){c.node.port.onmessage=null;c.node.port.postMessage("stop");c.node.port.close();}
      else c.node.onaudioprocess=null;
      try{c.input.disconnect(c.node);}catch{} c.node.disconnect();
    }
    // An input that was open for the mixer, live recording or analysis belongs to that session.
    if(c.ownsInput && (!c.input || c.E.input===c.input))c.E.closeInput();
  }
  async function connectMic(c){
    const E=c.E,ctx=E.ctx;
    c.ownsInput=!E.input;
    c.input=await E.openInput();
    const worklet=await loadDetector(ctx);if(taps!==c)return;
    const hit=(time,v)=>{if(taps===c)tap(v,time,"mic");};
    if(worklet){
      c.node=new AudioWorkletNode(ctx,"musiclab-groove-input",{channelCount:1,channelCountMode:"explicit"});
      c.node.port.onmessage=e=>hit(e.data[0],e.data[1]);
    }else{
      const detector=new ClapDetector(ctx.sampleRate);
      c.node=ctx.createScriptProcessor(512,1,1);
      c.node.onaudioprocess=e=>detector.read(e.inputBuffer.getChannelData(0),e.playbackTime-e.inputBuffer.duration,hit);
    }
    c.input.connect(c.node);c.node.connect(ctx.destination); // The processor writes silence.
  }
  App.extendProject({load(P,raw) {
    const x=raw.groove||{};
    P.groove={quantize:x.quantize!==false,name:String(x.name||"").slice(0,40),
      slots:(Array.isArray(x.slots)?x.slots:[]).slice(0,32).map(s=>s&&Number.isFinite(s.v)?{off:signed(s.off),v:App.clamp(s.v,.01,1)}:null)};
  }});
  const recordOffset=c=>App.P.groove.quantize?0:signed((c.step-Math.round(c.step))*c.span/c.sd);
  function make(hits,size) {
    const counts=Array.from({length:size},()=>({off:0,v:0,n:0}));
    for(const e of hits){const c=counts[((e.s%size)+size)%size];c.off+=e.off||0;c.v+=e.v;c.n++;}
    return counts.map(c=>c.n?{off:signed(c.off/c.n),v:Math.round(1000*c.v/c.n)/1000}:null);
  }
  function tap(v=.8,time,source="keys") {
    if(!taps || taps.source!==source || taps.hits.length>=4096)return;
    const P=App.P,c=App.Seq.frame(),sd=c?.sd ?? 15/P.bpm,now=time ?? App.E?.ctx.currentTime ?? performance.now()/1000;
    if(taps.start==null)taps.start=now;
    let s,off;
    if(c) {
      const phase=P.performance.source==="take"?P.performance.take.origin:0;
      const grid=j=>c.straightTime+(j-c.absoluteStep+(((j+phase)&1)?P.swing/200:0))*sd;
      const near=c.absoluteStep+Math.round((now-c.straightTime)/sd);
      s=[near-1,near,near+1].reduce((a,b)=>Math.abs(now-grid(a))<=Math.abs(now-grid(b))?a:b);
      off=(now-grid(s))/sd;
    }else{
      const rel=(now-taps.start)/sd,k=Math.round(rel);
      // Pick the nearest swung subdivision, including its neighbours at high swing.
      const grid=j=>j+((j&1)?P.swing/200:0);
      s=[k-1,k,k+1].reduce((a,b)=>Math.abs(rel-grid(a))<=Math.abs(rel-grid(b))?a:b);
      off=rel-grid(s);
    }
    taps.hits.push({s,off:signed(off),v:App.clamp(v,.01,1)});
  }
  function open() {
    const P=App.P,{t,p}=P.sel,clip=P.tracks[t].clips[p],selected=App.Ed.selected(),G=P.groove,node=App.Workspace.begin("Groove and note timing");
    const {field,select,num}=App.Live,body=h("div.dlg-body.pf-body"),status=h("output");
    const quant=select("Live recording timing",[["on","Snap to step"],["off","Keep played timing"]],G.quantize?"on":"off",v=>{G.quantize=v==="on";App.commit();});
    const scope=select("Timing target",[["notes","Selected notes ("+selected.size+")"],["clip","This clip"],["pattern","All tracks in "+App.PATS[p]]],selected.size?"notes":"clip");
    const length=select("Groove cycle",[[App.beatSteps(P),"1 beat"],[App.spb(P),"1 bar"],[Math.min(32,App.spb(P)*2),"2 bars · max 32 steps"]],App.spb(P));
    const strength=h("input",{type:"range","aria-label":"Groove strength",min:0,max:100,value:100}),amt=h("b",{text:"100%"});strength.oninput=()=>amt.textContent=strength.value+"%";
    const useVel=h("input",{type:"checkbox","aria-label":"Apply accents",checked:true});
    const tiles=h("div.pf-groove",{"aria-label":"Groove offsets and accents"});
    const name=h("b"),count=h("output");
    function sync() {
      name.textContent=G.name || "No template"; rec.textContent=taps?"Finish capture":"Capture groove";
      count.textContent=taps?taps.hits.length+" hits":"";
      tiles.replaceChildren(...G.slots.map((s,i)=>{
        const ms=s?Math.round(15000/P.bpm*s.off):null;
        return h("span",{text:ms==null?"·":(ms>0?"+":"")+ms,title:"Step "+(i+1)+(s?" · "+ms+" ms · velocity "+Math.round(s.v*127):" · unused")});
      }));
    }
    function targets(){return scope.value==="notes"?[...selected].filter(n=>clip.includes(n)):scope.value==="clip"?clip:P.tracks.flatMap(T=>T.clips[p]);}
    function store(hits,label,steps) {
      if(!hits.length){status.textContent="No notes to extract";return false;}
      G.slots=make(hits,steps);G.name=label;App.commit();sync();return true;
    }
    const src=select("Groove capture source",[["keys","Pad / keys / MIDI"],["mic","Microphone claps"]],"keys");
    const rec=btn("Capture groove","Capture timing and accents from the chosen input",async()=>{
      if(taps){
        const data=taps;closeCapture();src.disabled=false;
        store(data.hits,data.source==="mic"?"Microphone claps":"Played groove",data.steps);sync();return;
      }
      const E=App.audio();if(!E){status.textContent="Audio input unavailable";return;}
      const c=taps={start:null,steps:+length.value,hits:[],source:src.value};
      src.disabled=true;sync();
      if(c.source==="mic"){
        c.E=E;status.textContent="Opening microphone";
        try {await connectMic(c);if(taps===c)status.textContent="Listening for claps";}
        catch {if(taps===c){closeCapture();src.disabled=false;status.textContent="Microphone unavailable";sync();}}
      }else status.textContent="Tap, play MIDI or use A–K";
    });
    const pad=btn("Tap","Capture a timing sample from the pad",()=>{tap();sync();});
    src.onchange=()=>{pad.disabled=src.value==="mic";};
    node.addEventListener("keydown",e=>{
      if(taps?.source==="keys" && !e.repeat && /^[asdefghjk]$/i.test(e.key) && !e.target.matches("input,select")){e.preventDefault();tap();sync();}
    });
    const max=Math.floor(.49*15000/P.bpm),ms=num("Note offset in milliseconds",-max,max,Math.round((targets()[0]?.off||0)*15000/P.bpm));
    function setOff(n,x){const v=signed(x);if(v)n.off=v;else delete n.off;}
    function changed(label,n){if(n){App.commit();App.Ed.draw();App.Mx.draw();}status.textContent=n?label+" · "+n+" notes":"No matching notes";}
    const apply=btn("Apply groove","Blend template timing and accents into the target notes",()=>{
      const a=+strength.value/100;if(!a||!G.slots.length){status.textContent="Choose a template and strength";return;}
      let n=0;for(const nt of targets()){const s=G.slots[nt.s%G.slots.length];if(!s)continue;
        setOff(nt,(nt.off||0)*(1-a)+a*s.off);if(useVel.checked)nt.v=Math.max(.02,Math.round(((1-a)*nt.v+a*s.v)*100)/100);n++;}
      changed("Groove applied",n);
    },"confirm-action");
    body.append(h("h2",{text:"Groove & note timing"}),h("div.pf-line",null,field("Live recording",quant),field("Target",scope)),
      h("div.pf-line",null,field("Offset · ms",ms),btn("Set timing","Set the selected target to a signed offset from the grid",()=>{
        if(!ms.reportValidity())return;const notes=targets();notes.forEach(nt=>setOff(nt,+ms.value*P.bpm/15000));changed("Timing set",notes.length);})),
      h("div.pf-line",null,field("Template cycle",length),btn("Extract clip","Read timing and accents from the active clip",()=>store(clip,P.tracks[t].name+" / "+App.PATS[p],+length.value))),
      h("div.pf-line",null,field("Capture input",src),rec,pad,count),h("div.pf-line",null,name,tiles),
      h("div.pf-line",null,field("Strength",strength),amt,field("Accents",useVel),apply),status,h("div.dlg-buttons",null,btn("Close","Return to the console",()=>node.close())));
    node.classList.add("pf-dialog");node.append(body);sync();node.showModal();
    const timer=setInterval(()=>{if(taps)count.textContent=taps.hits.length+" hits";},120);node.addEventListener("close",()=>{clearInterval(timer);closeCapture();},{once:true});
  }
  App.Groove={tap,recordOffset,open,reset:closeCapture};
})();
