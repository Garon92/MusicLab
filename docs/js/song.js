/* The slot chain, captured launches, harmony, audio and curves share a musical ruler. */
(() => {
  "use strict";
  const {h,btn}=App.UI, copy=x=>JSON.parse(JSON.stringify(x)), limit=32;
  const pad=n=>String(n+1).padStart(2,"0"), label=(text,ctl)=>h("label.arr-field",null,text,ctl);
  const num=(name,min,max,value,step=1)=>h("input",{"aria-label":name,type:"number",min,max,step,value});
  const selector=(name,items)=>h("select",{"aria-label":name},items.map(([v,text])=>h("option",{value:v,text})));
  const row=(...items)=>h("div.arr-row",null,...items);
  const ranges=P=>App.Conductor.layout(P,P.chain);
  function apply(P,draft,first){
    const running=App.Seq.playing;
    if(running)App.Seq.stop();
    const wasEmpty=!P.chain.length;
    for(const k of ["chain","arrangement","harmony","audio","performance","scenes","pats","tracks"])if(draft[k])P[k]=draft[k];
    if(!P.chain.length || wasEmpty)P.song=Number(!!P.chain.length);
    App.Seq.startAt(App.clamp(first,0,Math.max(0,P.chain.length-1)));
    App.commit();App.refresh();
    if(running)App.Seq.play();
  }
  const entries=P=>P.chain.map((p,old)=>({p,old}));
  function change(transform,start) {
    const P=App.P,draft=copy(P), order=entries(P);transform(order);
    try{App.Arrangement.relocate(draft,order);apply(P,draft,start(order));}
    catch(e){App.UI.msg(e.message);}
  }
  function insert(at,p) {
    const P=App.P, start=App.Seq.start(), i=Math.min(at,P.chain.length);
    if(P.chain.length>=limit){App.UI.msg("SONG IS FULL · 32 SLOTS");return;}
    change(order=>order.splice(i,0,{p}),()=>start+Number(P.chain.length>0 && i<=start));
  }
  function move(from,to) {
    if(from===to || App.P.chain[from]==null)return;
    const start=App.Seq.start();
    change(order=>{const item=order.splice(from,1)[0];order.splice(Math.min(to,order.length),0,item);},order=>order.findIndex(e=>e.old===start));
  }

  function chart(canvas,P,first,last,onPick,onMove) {
    const C=App.Conductor, slots=ranges(P), end=Math.max(slots.at(-1)?.end||0,App.AudioStudio.durationSteps(P),App.Arrangement.chordList(P).at(-1)?.end||0,
      P.performance.take.events.length ? P.performance.take.steps : 0,...P.arrangement.tempo.map(e=>e.at+1),...P.arrangement.meters.map(e=>e.at+1),1);
    const ctx=canvas.getContext("2d"),width=canvas.clientWidth,height=canvas.clientHeight;
    if(!width||!height)return;
    const dpr=window.devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);
    const margin=83,span=width-margin-3,rh=height/13, x=s=>margin+span*s/end;
    const rect=(a,b,y,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x(a),y,Math.max(1,x(b)-x(a)-1),h);};
    ctx.clearRect(0,0,width,height);ctx.font="10px 'IBM Plex Mono', monospace";ctx.textBaseline="middle";
    const line=(r,text)=>{ctx.fillStyle="#91ac9d";ctx.fillText(text,2,(r+.5)*rh,margin-4);ctx.fillStyle="#203429";ctx.fillRect(margin,(r+1)*rh-1,span,1);};
    line(0,"BARS");line(1,"SECTIONS");line(2,"CHORDS");P.tracks.forEach((t,i)=>line(i+3,t.name));line(11,"LAUNCHES");line(12,"TEMPO / METER");
    for(const s of P.arrangement.sections){const a=slots[s.first],b=slots[s.first+s.count-1];if(!a||!b)continue;rect(a.from,b.end,rh+1,rh-2,"#294938");ctx.fillStyle="#c7f6d8";ctx.fillText(s.name,x(a.from)+2,rh*1.5,Math.max(1,x(b.end)-x(a.from)-4));}
    for(const c of App.Arrangement.chordList(P))if(!c.ch.rest){
      rect(c.from,c.end,2*rh+1,rh-2,"#344237");ctx.fillStyle="#c7e9c4";ctx.fillText(App.NOTES[c.ch.root]+" "+c.ch.type,x(c.from)+2,2.5*rh,Math.max(1,x(c.end)-x(c.from)-4));
    }
    const thumbnails=new Map();
    for(const [i,s] of slots.entries()){
      ctx.fillStyle="#345241";ctx.fillRect(x(s.from),rh,1,rh*11);
      if(i>=first&&i<=last){ctx.fillStyle="rgba(245,185,81,.12)";ctx.fillRect(x(s.from),0,x(s.end)-x(s.from),height);}
      if(s.rest)continue;
      for(let ti=0;ti<8;ti++){
        const t=P.tracks[ti], y=(3+ti)*rh;
        const notes=t.clips[s.p], curves=Object.values(t.automation[s.p]), n=P.performance.loops[ti][s.p] || (s.offset?App.patSteps(P,s.p):s.end-s.from);
        if(notes.length){
          rect(s.from,s.end,y+1,rh*.4,"#173728");
          let hits=thumbnails.get(notes);
          if(!hits){hits=new Float32Array(App.MAX_STEPS);for(const nt of notes)for(let j=nt.s;j<Math.min(hits.length,nt.s+nt.l);j++)hits[j]=Math.max(hits[j],nt.v);thumbnails.set(notes,hits);}
          for(let step=s.from;step<s.end;step++){
            const v=hits[(s.offset+step-s.from)%n];if(v)rect(step,step+1,y+1+rh*.15*(1-v),Math.max(2,rh*.19),"#71c993");
          }
        }
        if(curves.length){
          const lane=curves[0], x0=Math.round(x(s.from)),x1=Math.round(x(s.end));
          ctx.strokeStyle="#e0b96c";ctx.beginPath();
          for(let px=x0;px<=x1;px+=2){
            const step=((px-margin)/span*end-s.from+s.offset)%n, v=App.curveValue(lane,Math.max(0,step));
            const py=y+rh*(.94-.34*v);if(px===x0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
          }ctx.stroke();
        }
      }
    }
    for(const r of P.audio.regions)rect(r.at,C.step(P,C.time(P,r.at)+r.len*r.repeats),(3+r.track)*rh+rh*.49,rh*.28,r.mute?"#485751":"#67b9a6");
    for(const e of P.performance.take.events)rect(e.at,Math.min(end,e.at+1),rh*11+2,rh-4,e.p<0?"#627269":"#75a483");
    for(const e of P.scenes?.cues||[])rect(e.at,e.at+1,rh*11+2,3,"#efc076");
    for(const e of [...P.arrangement.tempo,...P.arrangement.meters])rect(e.at,e.at+1,rh*12+2,rh-4,"#d8ae6a");
    const stride=Math.max(1,Math.ceil((C.position(P,end).bar+1)/(span/48)));
    for(let b=0;C.barStart(P,b)<end;b+=stride){const a=C.barStart(P,b);ctx.fillStyle="#a7cfb7";ctx.fillText(String(b+1),x(a)+2,rh*.5);}
    const locate=e=>{const at=(e.clientX-canvas.getBoundingClientRect().left-margin)/span*end;return slots.findIndex(s=>at>=s.from&&at<s.end);};
    canvas.onpointerdown=e=>{
      const i=locate(e);if(i<0 || e.button!==0)return;
      const section=e.offsetY>=rh && e.offsetY<rh*2 ? P.arrangement.sections.find(s=>i>=s.first&&i<s.first+s.count) : null;
      const a=section?.first ?? (i>=first&&i<=last?first:i), b=section?section.first+section.count-1:(i>=first&&i<=last?last:i);
      const start=e.clientX;canvas.setPointerCapture(e.pointerId);
      canvas.onpointerup=up=>{
        canvas.onpointerup=null;const j=locate(up);
        if(j>=0 && Math.abs(up.clientX-start)>5 && !up.shiftKey){if(j<a||j>b)onMove(a,b,j);return;}
        if(section && !up.shiftKey){onPick(a,false);onPick(b,true);}else onPick(i,up.shiftKey);
      };
      canvas.onpointercancel=()=>{canvas.onpointerup=null;};
    };
  }
  function open(startTab) {
    const P=App.P,D=copy(P), node=App.Workspace.begin("Song arrangement"), A=D.arrangement,C=App.Conductor;
    let first=App.clamp(App.Seq.start(),0,Math.max(0,D.chain.length-1)),last=first,anchor=first,dirty=false,tab=startTab==="conductor"?"map":"song", resize;
    const body=h("div.dlg-body.song-editor"), center=h("div.arr-content"), summary=h("output.arr-summary"),status=h("output.arr-status",{role:"status"});
    const grid=h("div.song-slots",{role:"group","aria-label":"Song slots"}), cv=h("canvas.arr-timeline",{role:"img","aria-label":"Song timeline with sections, chords, eight tracks, launches and conductor",title:"Select or Shift-select slots. Drag a section or selected range to move it across all lanes."});
    const gap=selector("Insert position",[["after","After selection"],["before","Before selection"]]);
    const copies=num("Additional copies",1,31,1), blank=num("Empty bars",1,16,4), cut=num("Split at bar",2,8192,2);
    const name=h("input",{type:"text",maxlength:32,placeholder:"e.g. Chorus","aria-label":"Section name"});
    const sections=selector("Named section",[]),sectionPicker=label("Section",sections);
    const at=num("Conductor bar",1,8192,1),tempo=num("Conductor BPM",40,300,D.bpm,.01);
    const shape=selector("Tempo transition",[["hold","Hold"],["ramp","Ramp to next point"]]);const signature=selector("Conductor meter",App.SIGS.map((v,i)=>[i,v.join("/")]));signature.value=D.sig;
    const tempoList=selector("Tempo points",[]),meterList=selector("Meter changes",[]);
    tempoList.size=4;meterList.size=4;
    const button=(text,hint,fn,enabled=true)=>{const b=btn(text,hint,fn);b.disabled=!enabled;return b;};
    const select=(i,shift=false)=>{if(shift){first=Math.min(i,anchor);last=Math.max(i,anchor);}else first=last=anchor=i;render();};
    const current=()=>entries(D), where=()=>D.chain.length?(gap.value==="before"?first:last+1):0;
    function edit(order,a,b=a) {
      if(order.length>limit){status.textContent="Song holds 32 slots.";return;}
      try{App.Arrangement.relocate(D,order);dirty=true;first=anchor=Math.max(0,a);last=Math.max(first,b);status.textContent="";render();}
      catch(e){status.textContent=e.message;}
    }
    function dragRange(a,b,target){
      const order=current(),count=b-a+1,chunk=order.splice(a,count);
      const at=target<a?target:target-count+1;
      order.splice(at,0,...chunk);edit(order,at,at+count-1);
    }
    function add(p){const list=current(), i=where();list.splice(i,0,{p});edit(list,i);}
    function shift(by){const list=current(), n=last-first+1, i=first+by;list.splice(i,0,...list.splice(first,n));edit(list,i,i+n-1);}
    function mark(){
      const title=name.value.trim();if(!title){name.focus();status.textContent="Enter a section name.";return;}
      A.sections=A.sections.filter(s=>s.first+s.count<=first || s.first>last);A.sections.push({name:title,first,count:last-first+1});
      A.sections.sort((a,b)=>a.first-b.first);dirty=true;render();
    }
    function setCue(type) {
      if(!at.reportValidity() || type==="tempo"&&!tempo.reportValidity())return;
      const step=C.barStart(D,at.valueAsNumber-1);
      if(step>65536){status.textContent="Change exceeds the conductor timeline.";return;}
      const e=type==="tempo"?{at:step,bpm:tempo.valueAsNumber,ramp:shape.value==="ramp"}:{at:step,sig:+signature.value};
      A[type]=[...A[type].filter(m=>m.at!==step),e].sort((a,b)=>a.at-b.at);dirty=true;render();
    }
    function delCue(type,sel){if(sel.selectedIndex<0)return;A[type]=A[type].filter(e=>e.at!==+sel.value);dirty=true;render();}
    function listCues(type,sel){
      const before=sel.value;
      sel.replaceChildren(...A[type].map(e=>h("option",{value:e.at,text:"Bar "+(C.position(D,e.at).bar+1)+"  ·  "+(type==="tempo"?+e.bpm.toFixed(2)+" BPM  "+(e.ramp?"↗ next":"hold"):App.SIGS[e.sig].join("/"))})));
      if([...sel.options].some(e=>e.value===before))sel.value=before;
    }
    function loadCue(type,sel){const e=A[type].find(c=>c.at===+sel.value);if(!e)return;at.value=C.position(D,e.at).bar+1;if(type==="tempo"){tempo.value=e.bpm;shape.value=e.ramp?"ramp":"hold";}else signature.value=e.sig;}
    tempoList.onchange=()=>loadCue("tempo",tempoList);meterList.onchange=()=>loadCue("meters",meterList);
    const save=btn("Apply arrangement","Apply all timeline edits as one undo step",()=>{
      if(App.P!==P){node.close();return;}apply(P,D,first);if(P.chain[first]!=null)App.select(P.sel.t,P.chain[first]);node.close();
    },"confirm-action");
    function render(){
      const slots=ranges(D), end=slots.at(-1)?.end||0, n=D.chain.length, selection=n?last-first+1:0;
      const secs=Math.round(C.time(D,end));
      summary.textContent=n+" / 32 slots · "+C.position(D,end).bar+" bars · "+Math.floor(secs/60)+":"+String(secs%60).padStart(2,"0");save.disabled=!dirty;
      center.replaceChildren();
      if(tab==="song"){
        grid.replaceChildren();
        for(const [i,s] of slots.entries()){
          const b=button("", "Select slot · Shift-click a range",e=>{select(i,e.shiftKey);grid.children[i]?.focus({preventScroll:true});});
          b.className="bt arr-slot";b.setAttribute("aria-label","Slot "+pad(i)+", "+(s.rest?"empty":"pattern "+App.PATS[s.p]));
          b.setAttribute("aria-pressed",String(i>=first&&i<=last));b.append(h("small",{text:pad(i)}),h("b",{text:s.rest?"—":App.PATS[s.p]}));grid.append(b);
        }
        if(!n)grid.append(h("span.arr-empty",{text:"Empty song · insert a pattern or empty bars"}));
        sections.replaceChildren(h("option",{value:"",text:"Select section"}),...A.sections.map((s,i)=>h("option",{value:i,text:s.name+" · "+pad(s.first)+"–"+pad(s.first+s.count-1)})));
        const selected=A.sections.findIndex(s=>s.first===first && s.count===selection);if(selected>=0)sections.value=selected;
        sections.onchange=()=>{const s=A.sections[+sections.value];if(sections.value!==""&&s){first=anchor=s.first;last=first+s.count-1;name.value=s.name;render();}};
        const bank=h("div.arr-bank",{role:"group","aria-label":"Insert pattern"},...Array.from(App.PATS,(v,i)=>button(v,"Insert pattern "+v,()=>add(i),n<limit)));
        const unused=D.pats.findIndex((pat,i)=>pat.bars===1 && !D.chain.includes(i) && !D.tracks.some(t=>t.clips[i].length||Object.keys(t.automation[i]).length));
        center.append(grid,row(gap,bank,label("Empty bars",blank),button("Insert space","Insert silent bars and shift all later material",()=>{
          if(blank.reportValidity()){const list=current(),i=where();list.splice(i,0,{p:0,rest:true,bars:+blank.value});edit(list,i);}
        },n<limit)),row(h("b",{text:n?"Slot "+pad(first)+(last!==first?"–"+pad(last):""):"No slots"}),
          button("Earlier","Move range and all timeline material earlier",()=>shift(-1),first>0),
          button("Later","Move range and all timeline material later",()=>shift(1),last<n-1),
          button("Remove","Remove selected section across all lanes",()=>{const list=current();list.splice(first,selection);edit(list,Math.max(0,Math.min(first,list.length-1)));},!!n),
          button("Make variation","Copy this slot to an independent pattern bank",()=>{
            const src=D.chain[first];D.pats[unused]=copy(D.pats[src]);for(const t of D.tracks){t.clips[unused]=copy(t.clips[src]);t.automation[unused]=copy(t.automation[src]);}
            for(const loops of D.performance.loops)loops[unused]=loops[src];D.chain[first]=unused;dirty=true;render();
          },selection===1 && !slots[first].rest && unused>=0),label("Copies",copies),button("Repeat range","Repeat all lanes in the selected slots",()=>{
            if(!copies.reportValidity())return;const list=current(),span=list.slice(first,last+1),extra=[];
            for(let k=0;k<+copies.value;k++)extra.push(...span);list.splice(last+1,0,...extra);edit(list,last+1,last+extra.length);
          },selection>0 && n+selection*Number(copies.value)<=limit)),row(sectionPicker,label("Name",name),button("Name range","Name selected slots as one section",mark,!!selection),label("Split at bar",cut),
          button("Split slot","Cut this pattern reference at an absolute bar to select part of it",()=>{
            const s=slots[first],mid=C.barStart(D,+cut.value-1),left=mid-s.from;
            if(!cut.reportValidity()||left<=0||mid>=s.end){status.textContent="Choose a bar inside the selected slot.";return;}
            const list=current();list.splice(first,1,{...list[first],len:left},{...list[first],skip:left,len:s.end-mid});edit(list,first);
          },selection===1 && n<limit)));
      }else{
        listCues("tempo",tempoList);listCues("meters",meterList);
        center.append(row(label("Bar",at),label("BPM",tempo),label("Transition",shape),button("Set tempo","Set BPM at bar; ramp connects to the next tempo point",()=>setCue("tempo")),label("Meter",signature),button("Set meter","Set time signature starting at bar",()=>setCue("meters"))),
          h("div.arr-maps",null,h("div",null,label("Tempo points",tempoList),button("Delete tempo","Delete selected tempo change",()=>delCue("tempo",tempoList),!!A.tempo.length)),
            h("div",null,label("Meter changes",meterList),button("Delete meter","Delete selected signature change",()=>delCue("meters",meterList),!!A.meters.length))));
      }
      requestAnimationFrame(()=>chart(cv,D,first,last,select,dragRange));
    }
    copies.oninput=render;
    body.append(h("h2",{text:"Song arrangement"}),summary,cv,h("small.arr-legend",{text:"GREEN  notes    TEAL  audio    AMBER  automation"}),row(...[["song","Arrangement"],["map","Tempo & meter"]].map(([id,text])=>button(text,"Show "+text,()=>{tab=id;render();}))),center,status,h("div.dlg-buttons",null,btn("Cancel","Discard pending arrangement edits",()=>node.close()),save));
    node.classList.add("arr-dialog","arr-full");node.append(body);render();node.showModal();
    resize=new ResizeObserver(()=>chart(cv,D,first,last,select,dragRange));resize.observe(cv);node.addEventListener("close",()=>resize.disconnect(),{once:true});
  }
  App.Song={open,insert,move};
})();
