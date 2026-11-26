/* Deterministic musical decisions and a short history of resolved sequencer events. */
(() => {
  "use strict";
  const {h,btn}=App.UI;
  const clampInt=(v,a,b,fallback)=>Number.isFinite(v)?App.clamp(Math.round(v),a,b):fallback;
  const select=(label,values,value)=>{
    const el=h("select",{"aria-label":label},values.map(([v,name])=>h("option",{value:v,text:name})));
    el.value=String(value);return el;
  };
  const field=(title,control)=>h("label.tool-field",null,title,control);
  const free=(ti,pi,P=App.P)=>!P.tracks[ti].clips[pi].length && !Object.keys(P.tracks[ti].automation[pi]).length;
  function targets(ti){
    const indices=Array.from({length:8},(_,p)=>p).filter(p=>free(ti,p));
    return indices.map(p=>[p,App.PATS[p]+" · "+App.P.tracks[ti].name]);
  }
  function write(ti,pi,notes,steps,automation={}) {
    if(!Number.isInteger(pi) || pi<0 || pi>=8 || !free(ti,pi))throw Error("Choose an empty clip on this track.");
    if(!notes.length || notes.length>4000)throw Error("A clip holds 1–4000 notes. Choose a shorter passage.");
    const P=App.P,T=P.tracks[ti],n=App.clamp(Math.ceil(steps),1,App.MAX_STEPS);
    const blank=P.tracks.every((_,i)=>free(i,pi)) && !App.songPatterns(P).includes(pi);
    if(blank)P.pats[pi].bars=App.clamp(Math.ceil(n/App.spb(P)),1,App.maxBars(P));
    T.clips[pi]=notes.sort((a,b)=>a.s-b.s || a.n-b.n); T.automation[pi]=structuredClone(automation);
    P.performance.loops[ti][pi]=n===App.patSteps(P,pi)?0:n;
    App.select(ti,pi); App.commit(); App.refresh();
  }
  App.ClipWrite={targets,write,select,field};
  function fields(note){
    const result={}, w=note.when, fixed=note.fixed;
    if(w && typeof w==="object"){
      const every=clampInt(w.every,1,32,1),phase=clampInt(w.phase,1,every,1),fill=[-1,1].includes(w.fill)?w.fill:0;
      if (every>1 || fill)result.when={every,phase,fill};
    }
    if(fixed && Number.isFinite(fixed.gate) && Number.isFinite(fixed.offset)){
      result.fixed={offset:App.clamp(fixed.offset,0,.999999),gate:App.clamp(fixed.gate,.001,App.MAX_STEPS),base:clampInt(fixed.base,1,App.MAX_STEPS,clampInt(note.l,1,App.MAX_STEPS,1)),...(fixed.poly?{poly:true}:{})};
    }
    return result;
  }
  App.extendProject({load(P,raw){P.rules={seed:clampInt(raw.rules?.seed,0,2147483647,1)};}});
  function random(P,ti,pi,pass,position,sub,salt) {
    let x=(P.rules?.seed ?? 1)>>>0;
    for(const v of [ti,pi,pass,Math.round(position*8192),Math.round(sub*8192),salt]){
      x=Math.imul((x^(v|0))>>>0,0x85ebca6b); x^=x>>>13;
    }
    x=Math.imul(x^(x>>>16),0xc2b2ae35);return ((x^(x>>>16))>>>0)/4294967296;
  }
  function allow(P,ti,pi,n,pass,pos,fill) {
    const w=n.when;
    if(w && (((pass-1)%w.every)+1!==w.phase || (w.fill===1 && !fill) || (w.fill===-1 && fill)))return false;
    return n.p==null || n.p>=1 || (n.p>0 && random(P,ti,pi,pass,pos,n.s,n.n+251)<n.p);
  }
  function pass(P,ti,bank,s,n,options={}) {
    if(options.lane?.pass!=null)return options.lane.pass;
    const at=options.absoluteStep??s, run=options.runStep??at, slots=options.slots;
    if(!slots?.length)return 1+Math.floor(run/n);
    let previous=0,cycle=0;
    for(const slot of slots){
      if(slot.rest || slot.p!==bank)continue;
      const count=Math.ceil(((slot.offset||0)%n+slot.end-slot.from)/n);
      cycle+=count;
      if(slot.end<=at)previous+=count;
      else if(slot.from<=at)previous+=Math.floor(((slot.offset||0)%n+at-slot.from)/n);
    }
    return 1+previous+cycle*Math.floor(run/Math.max(1,options.arrangementSteps));
  }
  let pressed=false, keyHeld=false,fillEl=null, journal=new Map();
  function paint(){if(fillEl){fillEl.setAttribute("aria-pressed",String(pressed||keyHeld));fillEl.classList.toggle("on",pressed||keyHeld);}}
  function reset(){pressed=false;keyHeld=false;journal=new Map();paint();}
  function fillButton(){
    // Held, not switched: it has no lamp. It lights while it is down.
    const el=fillEl=btn("FILL","HOLD IT DOWN = NOTES WITH THE FILL CONDITION PLAY · OR HOLD THE BACKSLASH KEY · SET CONDITIONS IN RULES…",()=>{});
    el.setAttribute("aria-pressed","false");el.dataset.conditionFill="1";
    el.onpointerdown=e=>{if(e.button!==0)return;pressed=true;el.setPointerCapture(e.pointerId);paint();};
    el.onlostpointercapture=el.onpointercancel=el.onpointerup=()=>{pressed=false;paint();};
    el.onkeydown=e=>{if([" ","Enter"].includes(e.key)){e.preventDefault();pressed=true;paint();}};
    el.onkeyup=e=>{if([" ","Enter"].includes(e.key)){pressed=false;paint();}};
    el.onblur=()=>{pressed=false;paint();};return el;
  }
  window.addEventListener("keydown",e=>{
    if(e.code==="Backslash" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.target.closest?.("input,select,textarea,[contenteditable=true]")){
      e.preventDefault();keyHeld=true;paint();
    }
  });
  window.addEventListener("keyup",e=>{if(e.code==="Backslash"){keyHeld=false;paint();}});
  window.addEventListener("blur",()=>{pressed=false;keyHeld=false;paint();});
  function step(ti,bank,s,n,pass,time,next) {
    const key=ti*8+bank, passes=journal.get(key)||[];
    let clip=passes.at(-1);
    if(!clip || clip.pass!==pass || clip.n!==n || clip.boundaries[s]!=null || clip.project!==App.P) {
      clip={project:App.P,pass,n,boundaries:Array(n+1),last:-1,hits:[],overflow:false,automation:App.P.tracks[ti].automation[bank]};
      passes.push(clip);if(passes.length>5)passes.shift();journal.set(key,passes);
    }
    clip.boundaries[s]=time;clip.last=s;
    if(s===n-1)clip.boundaries[n]=next;
  }
  function hit(ti,bank,s,pass,note,vel,time,duration,event){
    const clip=journal.get(ti*8+bank)?.at(-1);
    if(!clip || clip.project!==App.P || clip.pass!==pass || App.P.tracks[ti].mute || (App.P.tracks.some(t=>t.solo) && !App.P.tracks[ti].solo))return;
    if(clip.hits.length>=4000){clip.overflow=true;return;}
    clip.hits.push(event || {note,velocity:vel,time,duration});
  }
  function stop(time){
    for(const [key,passes] of journal){
      const finished=passes.filter(c=>Number.isFinite(c.boundaries[c.n]) && c.boundaries[c.n]<=time+.001);
      if(finished.length)journal.set(key,finished);else journal.delete(key);
    }
    pressed=false;keyHeld=false;paint();
  }
  function complete(ti,pi){
    const now=App.E?.ctx.currentTime ?? 0;
    return (journal.get(ti*8+pi)||[]).filter(c=>c.project===App.P && c.last===c.n-1 && c.boundaries.length===c.n+1 && c.boundaries[0]!=null && c.boundaries[c.n]<=now+.001 && !c.overflow && c.hits.length && Array.from(c.boundaries).every(Number.isFinite)).reverse();
  }
  function realized(clip){
    const boundaries=clip.boundaries,n=clip.n;
    const coord=time=>{
      if(time>=boundaries[n])return n+(time-boundaries[n])/(boundaries[n]-boundaries[n-1]);
      let i=0,j=n;
      while(i+1<j){const m=(i+j)>>1;if(boundaries[m]<=time)i=m;else j=m;}
      return i+App.clamp((time-boundaries[i])/(boundaries[i+1]-boundaries[i]),0,1);
    };
    return clip.hits.map(e=>{
      const on=App.clamp(coord(e.time),0,n-1e-5),s=Math.floor(on),gate=App.clamp(coord(e.time+e.duration)-on,.001,App.MAX_STEPS),l=App.clamp(Math.round(gate),1,App.MAX_STEPS);
      return {s,n:e.note,l,v:e.velocity,p:1,fixed:{offset:on-s,gate,base:l,...(e.poly?{poly:true}:{})}};
    });
  }
  function open() {
    const P=App.P,{t,p}=P.sel,notes=P.tracks[t].clips[p],selected=App.Ed.selected(),node=App.Workspace.begin("Note rules"),body=h("div.dlg-body");
    node.classList.add("tool-dialog","prod-dialog");
    const scope=select("Rule target",[["selected",selected.size+" selected"],["clip","All "+notes.length+" in clip"]],selected.size?"selected":"clip");
    const list=()=>scope.value==="selected"?notes.filter(n=>selected.has(n)):notes;
    const first=list()[0]?.when || {},choices=n=>Array.from({length:n},(_,i)=>[i+1,String(i+1)]);
    const every=select("Repeat period",choices(32),first.every||1),phase=select("Play on pass",choices(+every.value),first.phase||1);
    const condition=select("Fill condition",[[0,"Any time"],[1,"Only during Fill"],[-1,"Except during Fill"]],first.fill||0);
    every.onchange=()=>{const old=+phase.value;phase.replaceChildren(...choices(+every.value).map(([v,l])=>h("option",{value:v,text:l})));phase.value=Math.min(old,+every.value);};
    const status=h("p.tool-status",{role:"status"}), seed=h("input",{type:"number",min:0,max:2147483647,step:1,value:P.rules.seed,"aria-label":"Random seed"});
    const setSeed=v=>{if(P!==App.P)return;P.rules.seed=v;seed.value=v;App.commit();status.textContent="Project seed "+v;};
    seed.onchange=()=>{if(seed.value!==""&&seed.reportValidity())setSeed(+seed.value);};
    const apply=btn("Apply rule","Update selected notes in one undo step",()=>{
      const target=list();if(!target.length){status.textContent="Choose notes in the editor first.";return;}
      for(const n of target){const w=fields({when:{every:+every.value,phase:+phase.value,fill:+condition.value}}).when;if(w)n.when=w;else delete n.when;}
      App.commit();App.Ed.draw();status.textContent="Rule applied to "+target.length+" note"+(target.length===1?"":"s");
    });
    const passes=select("Heard pass",[],""),dest=select("Print destination",targets(t),targets(t)[0]?.[0]??""),print=btn("Print to clip","Write the actual pitches, dynamics, timing and lengths of this pass",()=>{
      const c=shown.find(x=>String(x.boundaries[0])===passes.value);
      try{if(!c || dest.value==="")throw Error("Play a complete pass and choose an empty clip.");write(t,+dest.value,realized(c),c.n,c.automation);node.close();App.UI.msg("PASS PRINTED TO "+App.PATS[App.P.sel.p]);}catch(e){status.textContent=e.message;}
    });
    let shown=[],sig="";
    function update(){
      const available=complete(t,p), val=available.map(x=>x.boundaries[0]).join("/");
      if(sig!==val){const old=passes.value;shown=available;passes.replaceChildren(...shown.map(c=>h("option",{value:c.boundaries[0],text:"Pass "+c.pass+" · "+c.hits.length+" notes"})));if(shown.some(c=>String(c.boundaries[0])===old))passes.value=old;sig=val;}
      if(!passes.options.length)passes.replaceChildren(h("option",{value:"",text:"None heard yet"}));
      print.disabled=!available.length || !dest.options.length;
      // Nothing can be played from inside this dialog: it says how a pass gets here.
      print.dataset.why=passes.dataset.tip=available.length?(dest.options.length?"":"EVERY CLIP OF THIS TRACK HOLDS NOTES · CLEAR ONE TO PRINT INTO IT"):"NO PASS HEARD YET · CLOSE THIS, PLAY THE CLIP ONCE ALL THE WAY ROUND, STOP, AND OPEN RULES… AGAIN";
    }
    body.append(h("h2",{text:"Note rules · "+P.tracks[t].name+" / "+App.PATS[p]}),h("div.tool-fields",null,field("Target",scope),field("Every N passes",every),field("Play on pass",phase),field("Fill",condition),apply),
      h("p.dlg-tip",{text:"HOLD FILL OR \\ WHILE PLAYING TO TRIGGER FILL NOTES"}),h("h3",{text:"Repeatable chance"}),h("div.tool-fields",null,field("Project seed",seed),btn("New seed","Choose another sequence of chance and arpeggio decisions",()=>setSeed(crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff))),
      h("h3",{text:"Print a heard pass"}),h("div.tool-fields",null,field("Performance",passes),field("Empty clip",dest),print),status);
    node.append(body);update();node.showModal();const timer=setInterval(update,250);node.addEventListener("close",()=>clearInterval(timer),{once:true});
  }
  App.Rules={fields,random,pass,allow,step,hit,filling:()=>pressed||keyHeld,fillButton,open,reset,stop};
})();
