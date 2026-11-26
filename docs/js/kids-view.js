/* The wordless instrument. Sound, projects and transport live in the controller. */
(() => {
  "use strict";
  const colour=["#ef9980","#b0b5e9","#eac565","#8bceb7","#acd28c","#b1c7e8","#efb589","#9ad4d1"];
  const parts=["Drums","Bass","Melody","Voice",...App.KidsWorld.groups.map(g=>g.name)];
  const patterns=["Sun","Moon","Leaf","Kite"];
  const ink="#23303b";
  const symbols={
    play:'<path d="M11 6Q10 5 10 8v24q0 3 3 1l19-12q2-1 0-3Z" fill="currentColor" stroke-linejoin="round"/>',
    stop:'<rect x="8.5" y="8.5" width="23" height="23" rx="4" fill="currentColor"/>',
    dice:'<g transform="rotate(-10 20 20)"><rect x="6" y="6" width="28" height="28" rx="6"/><g fill="currentColor" stroke="none"><circle cx="13" cy="13" r="2.6"/><circle cx="27" cy="13" r="2.6"/><circle cx="20" cy="20" r="2.6"/><circle cx="13" cy="27" r="2.6"/><circle cx="27" cy="27" r="2.6"/></g></g>',
    mic:'<rect x="15" y="4" width="10" height="21" rx="5" fill="currentColor"/><path d="M10 18a10 10 0 0 0 20 0M20 29v6m-6 0h12"/>',
    undo:'<path d="M15 8 6 17l9 8M8 17h13c8 0 12 4 12 10 0 4-2 6-4 8"/>',
    erase:'<path d="m8 24 15-16a3 3 0 0 1 4 0l6 6a3 3 0 0 1 0 4L18 33h-6l-5-5a3 3 0 0 1 1-4Z"/><path d="m14 18 12 11M21 33h14"/>',
    star:'<path d="m20 4 5 10 11 2-8 8 1.5 11L20 30l-10 5 2-11-8-8 11-2Z" fill="currentColor"/>',
    shelf:'<path d="M4 23v11h32V23M5 28h30"/><path d="M9 23V8h6v15m3 0V5h5v18m5-1-3-12 5-1 4 12Z"/>',
    chain:'<rect x="2" y="8" width="11" height="11" rx="3"/><rect x="27" y="8" width="11" height="11" rx="3"/><rect x="15" y="25" width="11" height="11" rx="3"/><path d="M13 13h7c4 0 5 5 2 8l-2 4"/>',
    loop:'<path d="M9 13a12 12 0 0 1 22 5M31 27a12 12 0 0 1-22-5M31 9v9h-9M9 31v-9h8"/>',
    song:'<path d="M6 27V12h27v15M14 12v15m10-15v15"/><g fill="currentColor"><circle cx="6" cy="28" r="3"/><circle cx="14" cy="28" r="3"/><circle cx="24" cy="28" r="3"/><circle cx="33" cy="28" r="3"/></g>',
    lock:'<rect x="9" y="17" width="22" height="17" rx="2"/><path d="M14 17v-5a6 6 0 0 1 12 0v5M20 24v4"/>',
    back:'<path d="m23 8-12 12 12 12M12 20h22"/>',
    next:'<path d="m15 9 11 11-11 11"/>',
    prev:'<path d="M25 9 14 20l11 11"/>',
    plus:'<path d="M20 7v26M7 20h26"/>',
    minus:'<path d="M8 20h24"/>',
    newSong:'<path d="M8 31V8h16l6 6v5M23 8v7h7M27 22v12m-6-6h12"/><circle cx="13" cy="28" r="4" fill="currentColor"/><path d="M17 27V17"/>',
    wave:'<path d="M4 20h4l3-8 5 17 5-23 5 26 4-14 2 2h4"/>',
    paw:'<path d="M6 28h7l5-7m8 6 4 4h6M13 26q-6-2-6-6c0-4 6-8 13-8s10 5 10 10l-6 5Z" fill="currentColor"/><circle cx="31" cy="18" r="5" fill="currentColor"/>',
    hare:'<path d="m7 27 8-2m8 2 8 4h5M9 25c-4-3-1-10 6-12s9 1 12 4l4-3q6 0 6 6l-7 1-5 6Z" fill="currentColor"/><path d="m28 16-4-9 1-3 7 10m0-1 2-8"/>',
    hand:'<path d="M12 23v-8q0-3 3-3t3 3v-5q0-3 3-3t3 3v5q1-4 4-3l1 6q4-2 5 2l-1 7-5 8H18L8 25q-2-5 2-5Z" fill="currentColor"/>',
    record:'<circle cx="20" cy="20" r="10" fill="currentColor"/>',
    amp:'<path d="M5 17h6l7-7v20l-7-7H5Zm19-4q8 7 0 14m5-19q12 12 0 24"/>',
    sound:'<path d="M5 11q7-10 16-6m-13 9q4-6 11-5m-7 9q2-3 6-3m4 16-7-8q-2-3 0-4 2-1 4 1l2 2-4-10q-1-3 2-4 2 0 3 3l4 9 4-2 4 4 1 6-5 6Z" fill="none"/>',
    spark:'<path d="M20 3q1 14 15 17-14 2-15 17Q18 23 5 20 18 16 20 3Z" fill="currentColor"/>',
    warn:'<path d="m20 5 16 29H4Zm0 9v8"/><circle cx="20" cy="28" r="1" fill="currentColor"/>',
    check:'<path d="m6 20 10 10 18-21"/>',
    drum:'<ellipse cx="20" cy="14" rx="14" ry="6"/><path d="M6 14v14c8 7 21 7 28 0V14M11 21l4 9 6-10 6 9 4-10"/>',
    bass:'<path d="m19 22 12-15 3 2-12 15c2 5 1 8-2 10-5 3-11-1-12-5-1-5 3-10 7-8Z"/><circle cx="17" cy="26" r="2"/><path d="m29 9 4 3"/>',
    melody:'<path d="m4 23 23-5 6 6-23 7ZM9 23l6 6m1-7 5 6m0-7 5 5M12 14l12-5"/><circle cx="10" cy="15" r="3" fill="currentColor"/>',
    pads:'<rect x="5" y="5" width="12" height="12" rx="3"/><rect x="23" y="5" width="12" height="12" rx="3"/><rect x="5" y="23" width="12" height="12" rx="3"/><rect x="23" y="23" width="12" height="12" rx="3"/>'
  };
  function svg(content,view="0 0 40 40",cls=""){
    return '<svg class="'+cls+'" viewBox="'+view+'" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+content+'</svg>';
  }
  const icon=k=>svg(symbols[k]||"");
  const paper="#fff5df",shadow="#434664";
  const tokens=[
    '<g fill="currentColor" stroke="none"><circle cx="20" cy="20" r="8"/><path d="m20 1 2.6 7-2.6 2.2L17.5 8Zm0 38-2.5-7 2.5-2 2.6 2ZM1 20l7-2.6 2.2 2.6L8 22.5Zm38 0-7 2.5-2-2.5 2-2.6ZM6 6l7 3-1 4-4-1Zm28 28-7-3 1-4 4 1Zm0-28-3 7-4-1 1-4ZM6 34l3-7 4 1-1 4Z"/></g>',
    '<path d="M29 7C11 5 6 26 24 31c3 1 6 0 9-1-7 10-25 8-29-5C0 10 15 0 29 7Z" fill="currentColor" stroke="none"/><path d="m30 9 1.7 4.3 4.4 1.7-4.4 1.7L30 21l-1.7-4.3-4.3-1.7 4.3-1.7Z" fill="currentColor" stroke="none"/>',
    '<path d="M20 33C9 33 3 25 4 11c10 1 17 7 16 18C18 14 25 7 37 4c2 17-4 27-17 29Z" fill="currentColor" stroke="none"/><path d="M20 35v-5"/>',
    '<path d="m19 1 16 15-14 15L6 17Z" fill="currentColor" stroke="none"/><path d="M21 30c4 5-6 9-9 4m9-2-3 3m5-2-2 3"/>'
  ];
  const patternIcon=i=>svg(tokens[i%4]);
  const eyes=(x,y)=>'<g fill="'+ink+'" stroke="none"><ellipse cx="'+x+'" cy="'+y+'" rx="2.4" ry="3.6"/><ellipse cx="'+(x+15)+'" cy="'+(y-1)+'" rx="2.4" ry="3.6"/></g>';
  const mouth=(x,y)=>'<g transform="translate('+x+' '+y+')"><ellipse class="kv-mouth" cx="0" cy="0" rx="4.9" ry="3.2" fill="'+ink+'" stroke="none"/></g>';
  function hat(id,x,y,who){
    if(id===0){
      const signature=[
        '<path d="M-15 1q-1-8 2-10l18-3q6 1 8 9l-8 5Z" fill="#e96651"/><path d="m-15-3 29-3 2 6-28 4Z" fill="#364758"/><path d="M3-12q0-9 7-12 1 9-7 12Z" fill="#f5ca62"/>',
        '<path d="M-15 2q-1-12 8-15 13-6 20 8l-3 6Z" fill="#717cb5"/><path d="m-17-2 26-4 5 5-28 6Z" fill="#515f86"/><path d="m-6-11 0 6m6-8 2 7m4-5 3 4" fill="none" stroke-width="1.5"/>',
        '<path d="M-10-3q-13-4-15-13 11-1 17 9-2-13 3-18 9 5 5 18 8-10 13-8 1 10-11 14Z" fill="#e9795e"/><path d="m-13-1 23-4 2 5-23 5Z" fill="#9fa9e1"/>',
        '<path d="M-22 17c-2-31 40-37 43-2" fill="none" stroke-width="5"/><path d="M-21 9q-8 0-8 8l1 9q1 5 7 4l4-3-1-17Z" fill="#d89465"/><path d="M18 7q7-2 10 5l1 9q-1 6-8 6l-4-4Z" fill="#d89465"/><path d="M24 26q0 9-14 10" fill="none"/><rect x="6" y="33" width="7" height="4" rx="2" fill="#23303b"/>'
      ];
      return '<g transform="translate('+x+' '+y+')">'+signature[who]+'</g>';
    }
    const items=[
      '<path d="m-13-2 4-6 11-2 6 4-2 4Z" fill="'+shadow+'"/><path d="m-15 0 30-3"/>',
      '<path d="m-11 1 7-17 12 12Z" fill="#ffdd71"/><path d="m-5-9 7 1"/><circle cx="-4" cy="-16" r="3" fill="'+paper+'"/>',
      '<path d="M-15 4q0-15 14-15T15 2" fill="none"/><rect x="-18" y="-1" width="6" height="10" rx="2" fill="#83c5ed"/><rect x="13" y="-3" width="6" height="10" rx="2" fill="#83c5ed"/>',
      '<path d="m-14 0-5-15 12 6 6-12 7 12 10-7-2 15Z" fill="#ffce57"/><circle cx="0" cy="-6" r="2" fill="#fe8d70" stroke="none"/>'
    ];
    return '<g transform="translate('+x+' '+y+')">'+items[id%4]+'</g>';
  }
  function character(i,variant=0){
    if(i>=4)return App.KidsPictures.cover(i-4);
    const images=[
      '<path d="m35 78-3 17 20 1 6-16m14-1 6 16 20-1-8-18" fill="'+shadow+'"/><path d="M26 73c-1-18 4-35 15-42 9-5 31-8 44-1 15 9 18 31 13 47-12 15-60 18-72-4Z" fill="#ff8b67"/><path d="M33 53q-5-5-7-1t6 8m66-5 7-5q-1 8-7 12" fill="#ff8b67"/>'+eyes(53,46)+mouth(63,57)+'<g fill="#d45e4c" stroke="none"><ellipse cx="44" cy="55" rx="5" ry="2"/><ellipse cx="78" cy="52" rx="5" ry="2"/></g><path d="M33 70q-3 16 12 11m52-15q3 12-8 14" fill="#ff8b67"/><path d="m38 78 18-16m34 13L77 59"/><circle cx="57" cy="61" r="3" fill="#fff0c9"/><circle cx="77" cy="58" r="3" fill="#fff0c9"/><path d="M44 80v14q23 12 46-2V78Z" fill="#72bea9"/><ellipse cx="67" cy="79" rx="23" ry="6" fill="#ffefd3"/><path d="m48 84 5 12 7-10 7 13 8-13 6 10 6-13" fill="none"/>'+hat(variant,60,29,0),
      '<path d="m49 81-3 14 12 1 3-14m11-1 4 14 13-1-6-15" fill="#675b98"/><path d="M38 43c3-14 16-22 31-21 17 0 25 10 25 21v26c0 18-11 24-30 22-21-2-27-10-27-26Z" fill="#a0a5ef"/><path d="M39 46q-11-6-9 3 1 9 9 10m54-15q10-5 8 4-1 8-8 11" fill="#a0a5ef"/><path d="m50 37 7-2m8-2 8 2"/>'+eyes(52,43)+mouth(61,55)+'<path d="M43 70q-1 10 11 13m26-18 10 7" fill="none"/><path d="M62 72q-15-6-19 4c-6 15 16 24 26 12 3-4 2-9 1-12l24-25-6-4Z" fill="#ec775e"/><path d="m86 49 9-11 8 6-9 10Zm-21 33 23-29"/><circle cx="59" cy="80" r="4" fill="#ffd995"/><path d="m47 83 8 5m32-18 6-7" fill="none"/>'+hat(variant,65,23,1),
      '<path d="M51 79v14l-10 3m33-18 3 12 12 3" fill="none"/><path d="M38 71q-16-4-19-20l17 7q-6-9-5-15l12 8" fill="#e99546"/><path d="M36 66q-4-21 19-37c17-12 40-7 40 13l5 9-7 2c-4 27-23 43-41 36-9-3-14-11-16-23Z" fill="#f7c954"/><path d="m92 41 15 6-13 6Z" fill="#ef815b"/>'+eyes(67,40)+mouth(81,54)+'<path d="m40 65 12 7 8-2m12 7 8 3" fill="none"/><path d="m48 78 18-15m12 16 10-15"/><circle cx="67" cy="61" r="3" fill="#94b6e9"/><circle cx="88" cy="63" r="3" fill="#94b6e9"/><path d="m37 88 54-8 12 6-55 12Z" fill="#76bfb0"/><path d="m47 87 10 8m2-10 10 8m0-10 10 8m1-10 9 7" fill="none"/>'+hat(variant,70,24,2),
      '<path d="m47 79-4 16 15-1 3-14m12-1 7 15 14-2-9-15" fill="#3e8890"/><path d="M29 65q-8-12 3-20-2-12 12-16 5-13 19-8 13-7 21 4 16-3 18 11 12 3 8 16 5 15-8 22-2 14-18 13-9 9-22 2-13 6-19-7-13-1-14-17Z" fill="#77cbb1"/><path d="M41 67q0 10 12 10m34-9q8 5 12 0" fill="none"/>'+eyes(53,46)+mouth(64,57)+'<path d="m76 78 10-22 7 3-10 23Z" fill="#7581aa"/><ellipse cx="89" cy="53" rx="7" ry="9" transform="rotate(23 89 53)" fill="#f4bc63"/><path d="m84 49 10 4m-11 0 10 4" fill="none"/><path d="M81 82q5 7 17 6m0 0q11-1 12 5" fill="none"/>'+hat(variant,66,22,3)
    ];
    const air=[
      '<path d="m20 28 4 7m1-13 4 5m70 2 6-5m-4 11 7-2"/>',
      '<path d="m23 31 3-5 2 5 5 2-5 2-2 5-2-5-5-2Zm78 29 2-3 2 3 3 1-3 2-2 3-1-3-3-2Z"/>',
      '<path d="m10 69 10 5m-3-13 5 4m76-37 3-7m3 11 6-4"/>',
      '<path d="M22 43q-7 5-4 13m-2-19q-10 7-7 20m99-20q7 5 6 12m1-19q10 7 10 19"/>'
    ];
    return svg('<g stroke="'+ink+'" stroke-width="1.6" opacity=".50">'+air[i]+'</g><g stroke="'+ink+'" stroke-width="2.3"><ellipse cx="66" cy="98" rx="41" ry="4" fill="'+ink+'" opacity=".14" stroke="none"/>'+images[i]+'</g>',"0 0 132 105","kv-character");
  }
  function element(tag,cls,parent){
    const el=document.createElement(tag);if(cls)el.className=cls;if(parent)parent.append(el);return el;
  }
  let host,send,model,deck,modal,board,toast,thumb,tempo,play,armButton,recordButton,chainPreview;
  let partButtons=[],pads=[],cells=[],patternButtons=[],lights=[],chainSlots=[],pageKind="",pageTrack=0,chainPage=0,chainIndex=-1,dialogSignature="",lastFocus=null,lastStep=-1,lastPlayPattern=-1,lastFeedback,toastTimer;
  let mainButtons={},lastFrame={},lockJobs=new Set();
  const stops=()=>{for(const cancel of [...lockJobs])cancel();};
  const call=(action,...args)=>send?.(action,...args);
  function button(parent,label,key,html,act,cls=""){
    const b=element("button","kv-button "+cls,parent);b.type="button";b.dataset.k=key;b.setAttribute("aria-label",label);b.innerHTML=html;
    if(act)b.addEventListener("click",act);
    return b;
  }
  function label(el,text){el.setAttribute("aria-label",text);}
  function pressed(el,on){el.setAttribute("aria-pressed",String(!!on));}
  function ring(b){
    const el=element("span","kv-hold",b);
    el.innerHTML=svg('<circle cx="20" cy="20" r="16" pathLength="100"/>');return el;
  }
  function hold(b,ms,short,long){
    let timer,active=false,done=false,lastInput="",origin=null;
    ring(b);
    function cancel(){
      clearTimeout(timer);active=false;origin=null;b.classList.remove("holding");lockJobs.delete(cancel);
    }
    function start(type,e){
      if(active || b.disabled)return;
      done=false;lastInput=type;active=true;origin=type==="pointer"?[e.clientX,e.clientY]:null;lockJobs.add(cancel);
      b.style.setProperty("--hold-time",ms+"ms");b.classList.add("holding");
      timer=setTimeout(()=>{if(active){done=true;cancel();long();}},ms);
    }
    b.addEventListener("pointerdown",e=>{if(e.button!==0)return;start("pointer",e);try{b.setPointerCapture(e.pointerId);}catch{}});
    b.addEventListener("pointermove",e=>{if(!active||!origin)return;const r=b.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom||Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>28){done=true;cancel();}});
    b.addEventListener("pointerup",cancel);
    for(const name of ["pointercancel","lostpointercapture"]){b.addEventListener(name,()=>{if(active){done=true;cancel();}});}
    b.addEventListener("blur",()=>{if(active && lastInput==="key"){done=true;cancel();}});
    b.addEventListener("keydown",e=>{if(e.key!=="Enter")return;e.preventDefault();e.stopPropagation();if(!e.repeat)start("key",e);});
    b.addEventListener("keyup",e=>{if(e.key!=="Enter")return;e.preventDefault();e.stopPropagation();if(active&&!done&&lastInput==="key")short?.();cancel();});
    b.addEventListener("click",e=>{e.preventDefault();if(!done)short?.();done=false;});
    b.addEventListener("contextmenu",e=>e.preventDefault());
  }
  function setIcon(b,name){if(b.dataset.icon!==name){b.innerHTML=icon(name);b.dataset.icon=name;}}
  function flash(type){
    if(!host||!type)return;
    const symbolsByStatus={saved:"star",clear:"erase",recorded:"mic",error:"warn",new:"newSong",loaded:"shelf"};
    toast.innerHTML=icon(symbolsByStatus[type]||"check");toast.classList.toggle("bad",type==="error");toast.classList.remove("visible");
    void toast.offsetWidth;toast.classList.add("visible");clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast?.classList.remove("visible"),1000);
  }
  function show(kind,trigger){
    if(!model)return;
    App.KidsSound.release();lastFocus=trigger||document.activeElement;pageKind=kind;dialogSignature="";chainIndex=-1;chainPage=0;
    stops();deck.inert=true;modal.hidden=false;renderPanel();
    modal.querySelector('[data-k="back"]')?.focus({preventScroll:true});
  }
  function closePanel(){
    if(!pageKind)return;
    stops();pageKind="";dialogSignature="";chainSlots=[];modal.hidden=true;modal.replaceChildren();deck.inert=false;
    if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});lastFocus=null;
  }
  function makeHeader(name,graphic){
    modal.replaceChildren();modal.className="kv-sheet kv-sheet-"+pageKind;modal.setAttribute("aria-label",name);
    const top=element("div","kv-sheet-head",modal);
    button(top,"Back to band","back",icon("back"),closePanel,"kv-dark");
    const sign=element("div","kv-sign",top);sign.innerHTML=icon(graphic);
    const hardware=element("span","kv-slots",top);hardware.setAttribute("aria-hidden","true");
    return element("div","kv-sheet-body",modal);
  }
  function sleeve(i,item){
    const tag=(Number.isInteger(item?.colour)?item.colour:i)%4;
    const motif=Array.isArray(item?.motif)?item.motif.slice(0,8):[];
    const bars=motif.map(v=>'<i style="--hit:'+Math.max(0,Math.min(1,(Number(v)||0)/4))+'"></i>').join("");
    return '<span class="kv-sleeve" style="--sleeve:'+colour[tag]+'"><span class="kv-disc"></span><span class="kv-cover">'+patternIcon(tag)+'<span class="kv-song-print">'+bars+'</span></span></span>';
  }
  function renderPanel(){
    if(!pageKind || !model)return;
    const previous=modal.contains(document.activeElement)?{k:document.activeElement.dataset.k,index:document.activeElement.dataset.index,row:document.activeElement.dataset.row}:null;
    const chain=model.chain||[],shelf=model.shelf||[];
    let signature=pageKind;
    if(pageKind==="wardrobe")signature+=pageTrack+"."+model.costumes?.[pageTrack];
    if(pageKind==="shelf"||pageKind==="replace")signature+=shelf.map(item=>item?[item.notes,item.patternCount,item.motif?.join("")].join("."):"-").join("/")+"."+model.slot;
    if(pageKind==="arrange")signature+=[chain.join(""),chainPage,chainIndex,model.song,model.playing].join(".");
    if(dialogSignature===signature)return;dialogSignature=signature;chainSlots=[];
    if(pageKind==="wardrobe"){
      const inner=makeHeader("Instrument sounds","spark"),list=element("div","kv-costumes",inner);
      for(let i=0;i<4;i++){
        const b=button(list,parts[pageTrack]+" sound "+(i+1),"costume",character(pageTrack,i),()=>{call("costume",pageTrack,i);closePanel();},"kv-costume");
        b.dataset.index=i;b.style.setProperty("--part",colour[pageTrack]);pressed(b,model.costumes?.[pageTrack]===i);
      }
    }else if(pageKind==="shelf"||pageKind==="replace"){
      const replace=pageKind==="replace",inner=makeHeader(replace?"Choose a shelf slot to save":"Song shelf",replace?"star":"shelf");
      const list=element("div","kv-shelf-grid",inner);
      for(let i=0;i<8;i++){
        const item=shelf[i],b=button(list,(item?"Saved song ":"Empty shelf slot ")+(i+1),"slot",item?sleeve(i,item):'<span class="kv-empty-sleeve">'+icon("plus")+'</span>',null,"kv-slot");
        b.dataset.index=i;pressed(b,model.slot===i);b.classList.toggle("filled",!!item);
        if(replace){hold(b,item?1000:750,()=>{if(!item){call("saveTo",i);closePanel();}},()=>{call("saveTo",i);closePanel();});}
        else if(item){hold(b,2000,()=>{call("load",i);closePanel();},()=>{closePanel();call("import",i);});}
        else b.addEventListener("click",()=>{call("saveTo",i);closePanel();});
      }
      if(!replace)button(inner,"New song","new",icon("newSong"),()=>{call("new");closePanel();},"kv-new");
    }else if(pageKind==="arrange"){
      const inner=makeHeader("Song arrangement","chain"),tray=element("div","kv-chain-tray",inner);
      chainPage=Math.min(chainPage,Math.max(0,Math.ceil(chain.length/8)-1));
      const turn=button(tray,"Previous song page","prevPage",icon("prev"),()=>{chainPage--;renderPanel();},"kv-page-key");turn.disabled=chainPage===0;
      const track=element("div","kv-chain-slots",tray);
      for(let col=0;col<8;col++){
        const i=chainPage*8+col,p=chain[i];
        if(p===undefined){element("span","kv-vacant",track);continue;}
        const b=button(track,"Song piece "+(i+1)+", "+patterns[p],"piece",patternIcon(p),()=>{chainIndex=i;renderPanel();},"kv-piece");
        b.dataset.index=i;b.style.setProperty("--piece",colour[p]);pressed(b,chainIndex===i);
        chainSlots.push([i,b]);
        b.draggable=true;b.addEventListener("dragstart",e=>{e.dataTransfer.setData("application/x-musiclab-kid-piece",String(i));e.dataTransfer.effectAllowed="move";});
        b.addEventListener("dragover",e=>{if(e.dataTransfer.types.includes("application/x-musiclab-kid-piece"))e.preventDefault();});
        b.addEventListener("drop",e=>{
          const v=e.dataTransfer.getData("application/x-musiclab-kid-piece");if(!/^\d+$/.test(v))return;e.preventDefault();
          movePiece(+v,i);
        });
      }
      const next=button(tray,"Next song page","nextPage",icon("next"),()=>{chainPage++;renderPanel();},"kv-page-key");next.disabled=(chainPage+1)*8>=chain.length;
      const edit=element("div","kv-chain-actions",inner);
      const left=button(edit,"Move piece earlier","moveLeft",icon("prev"),()=>movePiece(chainIndex,chainIndex-1));left.disabled=chainIndex<=0;
      const del=button(edit,"Remove piece","removePiece",icon("minus"),()=>{const l=chain.slice();l.splice(chainIndex,1);chainIndex=Math.min(chainIndex,l.length-1);call("chain",l);});del.disabled=chainIndex<0;
      const right=button(edit,"Move piece later","moveRight",icon("next"),()=>movePiece(chainIndex,chainIndex+1));right.disabled=chainIndex<0||chainIndex>=chain.length-1;
      const library=element("div","kv-piece-bank",inner);
      for(let i=0;i<4;i++){
        const b=button(library,"Add "+patterns[i]+" piece","addPiece",patternIcon(i)+'<i>'+icon("plus")+'</i>',()=>{if(chain.length>=32)return;chainIndex=chain.length;chainPage=Math.floor(chainIndex/8);call("chain",[...chain,i]);},"kv-add-piece");
        b.dataset.index=i;b.style.setProperty("--piece",colour[i]);b.disabled=chain.length>=32;
      }
      const listen=button(library,model.playing&&model.song?"Stop song":"Play song","songPlay",icon(model.playing&&model.song?"stop":"play"),()=>{
        const needsStart=!model.playing,alreadySong=model.song;
        if(!alreadySong)call("song",true);
        if(needsStart||alreadySong)call("play");
      },"kv-play");listen.disabled=!chain.length;
    }
    if(previous?.k){
      const target=Array.from(modal.querySelectorAll("[data-k]")).find(b=>b.dataset.k===previous.k && b.dataset.index===previous.index && b.dataset.row===previous.row && !b.disabled);
      target?.focus({preventScroll:true});
    }
  }
  function movePiece(from,to){
    const c=(model.chain||[]).slice();if(c[from]===undefined||to<0||to>=c.length||to===from)return;
    const [p]=c.splice(from,1);c.splice(to,0,p);chainIndex=to;chainPage=Math.floor(to/8);call("chain",c);
  }
  const drumNames=["Hi-hat","Clap","Snare","Kick"],pitches=["high","middle high","middle low","low"];
  const drumDrawings=[
    '<path d="M5 22q2-5 13-7V9h4v6q10 1 13 7-17 5-30 0Z" fill="#e6b75e"/><path d="M6 26q13 5 28 0m-14-1v9m-7 2 7-3 7 3"/>',
    '<path d="M6 26 4 16q0-3 2-3l3 8-2-13q1-3 3-1l4 12-2-14q1-3 3-1l5 14-2-11q2-2 4 1l4 13 4-4q4-3 5 1l-5 12q-6 9-15 6Z" fill="#edb887"/><path d="m27 5-1 4m7-2-3 5m7 1-4 3"/>',
    '<path d="M5 18q15-6 30-1v12q-14 7-30 0Z" fill="#d58d78"/><ellipse cx="20" cy="17" rx="15" ry="5" fill="#f6e7bb"/><path d="m8 22 3 8 5-9 5 10 6-10 4 7M23 5l-5 9m13-6-8 7"/>',
    '<circle cx="20" cy="21" r="13" fill="#bb8a77"/><ellipse cx="18" cy="21" rx="10" ry="12" fill="#f7e1ac"/><circle cx="18" cy="21" r="3" fill="#aabdc0"/><path d="m11 32-3 3m18-3 3 4"/>'
  ];
  function rowName(part,row){
    if(part>=4)return App.KidsWorld.groups[part-4].sounds[row].name;
    return part===0?drumNames[row]:parts[part]+" "+pitches[row];
  }
  function rowArt(part,row){
    if(part>=4)return App.KidsPictures.sound(App.KidsWorld.groups[part-4].sounds[row].id);
    if(part===0)return svg(drumDrawings[row]);
    const bars=Array.from({length:4},(_,i)=>{
      const y=30-i*5,fill=i===3-row?"#263b44":"#9caaa2";
      return '<rect x="'+(4+i*8)+'" y="'+y+'" width="6" height="'+(35-y)+'" rx="2" fill="'+fill+'" stroke="none"/>';
    }).join("");
    return svg('<g transform="translate(5 -1) scale(.75)">'+symbols[["","bass","melody","mic"][part]]+'</g>'+bars);
  }
  function scope(parent,type,name){
    const monitor=element("div","kv-monitor kv-monitor-"+type,parent),face=element("div","kv-glass",monitor);
    const cv=element("canvas","",face);cv.dataset.kidScreen=type;cv.setAttribute("role","img");label(cv,name);
    return monitor;
  }
  function mount(container,dispatch){
    if(host)unmount();
    host=container;send=dispatch;host.classList.add("kids-surface");host.setAttribute("aria-label","Music playground");
    deck=element("div","kv-shell",host);
    const header=element("header","kv-header",deck);
    const transport=element("div","kv-transport",header);
    play=button(transport,"Play song","play",icon("play"),()=>call("play"),"kv-play");
    const tempoBox=element("div","kv-tempo",transport);
    tempoBox.innerHTML='<div class="kv-tempo-track"><i></i><i></i><i></i><i></i></div><div class="kv-tempo-thumb"></div>';
    thumb=tempoBox.querySelector(".kv-tempo-thumb");
    tempo=element("input","kv-tempo-input",tempoBox);tempo.type="range";tempo.min=0;tempo.max=3;tempo.step=1;tempo.dataset.k="tempo";label(tempo,"Tempo");
    tempo.oninput=()=>{if(+tempo.value!==model.tempo)call("tempo",+tempo.value);};
    armButton=button(transport,"Record the sound pads","arm",svg('<rect x="4" y="7" width="21" height="22" rx="4"/><path d="M5 18h18m-10-9v18"/><circle cx="29" cy="27" r="7" fill="#ee856e"/>'),()=>call("arm"),"kv-arm");
    mainButtons={};
    recordButton=mainButtons.mic=button(transport,"Record your voice","mic",icon("mic"),()=>call("mic"),"kv-mic");
    const tools=element("div","kv-clip-tools",header);
    mainButtons.random=button(tools,"Surprise this sound collection","random",icon("dice"),()=>call("random"),"kv-random");
    mainButtons.erase=button(tools,"Clear the selected part","erase",icon("erase"),()=>call("erase"),"kv-erase");
    const output=element("div","kv-output",header);output.setAttribute("role","group");label(output,"Live sound");
    scope(output,"wave","Waveform");scope(output,"bands","Spectrum");
    const group=element("div","kv-utilities",header);
    mainButtons.undo=button(group,"Undo","undo",icon("undo"),()=>call("undo"),"kv-undo");
    mainButtons.save=button(group,"Save song to shelf","save",icon("star"),()=>{
      if(model.slot<0 && (model.shelf||[]).filter(Boolean).length>=8)show("replace",mainButtons.save);else call("save");
    },"kv-save");
    mainButtons.shelf=button(group,"Song shelf","shelf",icon("shelf"),e=>show("shelf",e.currentTarget),"kv-shelf");
    const lock=button(group,"Hold to return to console","lock",icon("lock"),null,"kv-lock");hold(lock,2000,null,()=>call("exit"));
    const main=element("main","kv-main",deck),sources=element("div","kv-sources",main);
    sources.setAttribute("role","group");label(sources,"Sound collections and musicians");
    partButtons=[];
    for(const i of [4,0,5,1,6,2,7,3]){
      const b=button(sources,parts[i],"track",'<span class="kv-character-wrap"></span><span class="kv-source-print" aria-hidden="true">'+ '<i></i>'.repeat(8)+'</span><i class="kv-source-lamp"></i>',null,"kv-musician");
      b.dataset.index=i;b.style.setProperty("--part",colour[i]);
      if(i<4)hold(b,560,()=>call("track",i),()=>{pageTrack=i;show("wardrobe",b);});
      else b.addEventListener("click",()=>call("track",i));
      partButtons[i]=b;
    }
    board=element("div","kv-board",main);board.setAttribute("role","group");label(board,"Sound pads and note grid");
    const headerRow=element("div","kv-score-head",board);headerRow.setAttribute("aria-hidden","true");
    const speaker=element("span","kv-pad-sign",headerRow);speaker.innerHTML=icon("amp");
    const beats=element("div","kv-beats",headerRow);lights=[];
    for(let c=0;c<8;c++)lights.push(element("i",c%2?"":"major",beats));
    const score=element("div","kv-score",board);cells=[];pads=[];
    for(let row=0;row<4;row++){
      const lane=element("div","kv-lane",score);
      const pad=button(lane,"Play sound "+(row+1),"pad",'<span class="kv-row-picture"></span><i class="kv-pad-lamp"></i>',null,"kv-row-pad");
      pad.dataset.row=row;pads.push(pad);
      const hit=()=>{call("pad",row);pad.classList.remove("hit");void pad.offsetWidth;pad.classList.add("hit");};
      pad.addEventListener("pointerdown",e=>{if(e.button===0)hit();});
      pad.addEventListener("click",e=>{if(!e.detail)hit();});
      const notes=element("div","kv-step-keys",lane);cells[row]=[];
      for(let c=0;c<8;c++){
        const b=button(notes,"Step "+(c+1),"note",'<span class="kv-socket"><i class="kv-idle-dot"></i><span class="kv-note-image"></span></span>',null,"kv-cell");
        b.dataset.row=row;b.dataset.col=c;
        hold(b,530,()=>call("note",row,c),()=>call("expression",row,c));cells[row].push(b);
      }
    }
    const hint=element("div","kv-empty-hint",board);hint.setAttribute("aria-hidden","true");hint.innerHTML=icon("hand");
    const effects=element("aside","kv-effects",main);effects.id="kids-inline-sound";label(effects,"Sound effects");
    const foot=element("footer","kv-bottom",deck);
    const bank=element("div","kv-patterns",foot);bank.setAttribute("role","group");label(bank,"Song pieces");patternButtons=[];
    for(let i=0;i<4;i++){
      const b=button(bank,patterns[i]+" pattern","pattern",patternIcon(i)+'<span class="kv-pattern-print" aria-hidden="true">'+ '<i></i>'.repeat(8)+'</span>',()=>call("pattern",i),"kv-pattern");
      b.dataset.index=i;b.style.setProperty("--piece",colour[i]);patternButtons.push(b);
    }
    const song=element("div","kv-song-strip",foot);
    mainButtons.append=button(song,"Add selected pattern to the song","appendPiece",icon("plus"),()=>{
      if(model.chain.length<32)call("chain",[...model.chain,model.pattern]);
    },"kv-append");
    mainButtons.song=button(song,"Song mode","song",icon("loop"),()=>call("song",!model.song),"kv-mode");
    chainPreview=button(song,"Arrange song","arrange",'<span class="kv-chain-glyph">'+icon("chain")+'</span><span class="kv-chain-print"></span>',e=>show("arrange",e.currentTarget),"kv-arrange");
    modal=element("section","kv-sheet",host);modal.hidden=true;modal.setAttribute("role","region");
    toast=element("div","kv-flash",host);toast.setAttribute("aria-hidden","true");
    host.addEventListener("keydown",keys);window.addEventListener("blur",stops);
    return host;
  }
  function keys(e){
    if(!host?.contains(e.target))return;
    if(e.key==="Escape"&&pageKind){e.preventDefault();e.stopPropagation();closePanel();}
  }
  function render(state){
    if(!host||!state)return;model=state;
    host.style.setProperty("--part",colour[state.track]||colour[0]);
    const frameTrack=state.track||0;
    play.dataset.active=!!state.playing;setIcon(play,state.playing?"stop":"play");label(play,state.playing?"Stop playback":"Play song");pressed(play,state.playing);
    tempo.value=state.tempo??1;tempo.parentElement.style.setProperty("--tempo",tempo.value);
    thumb.innerHTML=icon(+tempo.value>1?"hare":"paw");tempo.setAttribute("aria-valuetext",["Slow","Walking","Quick","Running"][+tempo.value]);
    pressed(recordButton,state.recording);recordButton.classList.toggle("recording",!!state.recording);label(recordButton,state.recording?"Finish voice recording":"Record your voice");recordButton.classList.toggle("has-voice",!!state.hasVoice);
    mainButtons.undo.disabled=!state.canUndo;pressed(mainButtons.song,state.song);setIcon(mainButtons.song,state.song?"song":"loop");
    mainButtons.mic.disabled=!!state.busy&&!state.recording;
    const elapsedSignal=state.feedback;if(elapsedSignal && elapsedSignal!==lastFeedback)flash(typeof elapsedSignal==="string"?elapsedSignal:elapsedSignal.type);
    lastFeedback=elapsedSignal;
    pressed(armButton,state.armed);
    for(let i=0;i<parts.length;i++){
      const c=state.costumes?.[i]||0,b=partButtons[i],wrap=b.querySelector(".kv-character-wrap");
      if(wrap.dataset.variant!==String(c)){wrap.innerHTML=character(i,c);wrap.dataset.variant=c;}
      pressed(b,i===frameTrack);b.classList.toggle("populated",!!state.partHasNotes?.[i]);
      const motif=state.partMotifs?.[i]||[],key=motif.join(",");
      if(b.dataset.motif!==key){
        b.dataset.motif=key;
        b.querySelectorAll(".kv-source-print i").forEach((v,s)=>v.classList.toggle("used",!!motif[s]));
      }
    }
    for(const [i,b] of patternButtons.entries()){
      pressed(b,state.pattern===i);
      b.querySelectorAll(".kv-pattern-print i").forEach((bar,c)=>bar.style.setProperty("--count",Math.min(4,state.patternMotifs?.[i]?.[c]||0)));
    }
    const chain=state.chain||[],chainKey=chain.join(",");
    if(chainPreview.dataset.chain!==chainKey){
      chainPreview.dataset.chain=chainKey;delete chainPreview.dataset.slot;
      chainPreview.querySelector(".kv-chain-print").innerHTML=chain.map(i=>'<i style="--piece:'+colour[i]+'">'+patternIcon(i)+'</i>').join("");
      label(chainPreview,"Arrange song, "+chain.length+" pieces");
    }
    mainButtons.append.disabled=chain.length>=32;mainButtons.append.style.setProperty("--piece",colour[state.pattern]);
    if(mainButtons.append.dataset.pattern!==String(state.pattern)){
      mainButtons.append.dataset.pattern=state.pattern;
      mainButtons.append.innerHTML=patternIcon(state.pattern)+'<i>'+icon("plus")+'</i>';
    }
    chainPreview.classList.toggle("long-chain",chain.length>8);
    let empty=true;
    for(let r=0;r<4;r++){
      const pad=pads[r],name=rowName(frameTrack,r),art=rowArt(frameTrack,r),rowInk=["#9bc5cf","#ecc37d","#c0aece","#b4cc98"][r];
      if(pad.dataset.part!==String(frameTrack)){
        pad.dataset.part=frameTrack;pad.querySelector(".kv-row-picture").innerHTML=art;label(pad,"Play "+name);
      }
      pad.classList.toggle("selected",r===(state.row??0));pad.parentElement.style.setProperty("--row-ink",rowInk);
      for(let c=0;c<8;c++){
        const b=cells[r][c],v=state.grid?.[r]?.[c],expression=state.expression?.[r]?.[c]??(v?Number(v)-1:0);
        const stamp=frameTrack+":"+v;
        if(b.dataset.mark!==stamp){
          b.dataset.mark=stamp;pressed(b,!!v);b.dataset.expression=String(expression);
          b.querySelector(".kv-note-image").innerHTML=v?art:"";
          label(b,name+", step "+(c+1)+(expression===1?", accent":expression===2?", long":""));
        }
        if(v)empty=false;
      }
    }
    board.classList.toggle("waiting",!!state.playing&&empty);
    renderPanel();frame(lastFrame);
  }
  function frame(f={}){
    if(!host||!model)return;lastFrame=f;
    for(let i=0;i<parts.length;i++){
      const energy=Math.max(0,Math.min(1,Number(f.levels?.[i])||0)),value=String(+energy.toFixed(3));
      if(partButtons[i].style.getPropertyValue("--amplitude")!==value){partButtons[i].style.setProperty("--amplitude",value);}
    }
    const step=model.playing && (f.pattern??model.pattern)===model.pattern ? (f.step??-1) : -1;
    if(step!==lastStep){
      for(let i=0;i<8;i++){lights[i].classList.toggle("lit",i===step);for(let r=0;r<4;r++)cells[r][i].classList.toggle("beat",i===step);}
      for(const source of partButtons){
        const bars=source.querySelector(".kv-source-print").children;
        if(lastStep>=0)bars[lastStep]?.classList.remove("playhead");
        if(step>=0)bars[step]?.classList.add("playhead");
      }
      lastStep=step;
    }
    const playPattern=model.playing?f.pattern??model.pattern:-1;
    if(lastPlayPattern!==playPattern){patternButtons.forEach((b,i)=>b.classList.toggle("sounding",i===playPattern));lastPlayPattern=playPattern;}
    const playingSlot=model.playing && model.song?f.slot:-1;
    if(chainPreview.dataset.slot!==String(playingSlot)){
      chainPreview.dataset.slot=String(playingSlot);
      Array.from(chainPreview.querySelector(".kv-chain-print").children).forEach((piece,i)=>piece.classList.toggle("sounding",i===playingSlot));
    }
    for(const [i,b] of chainSlots)b.classList.toggle("sounding",model.playing&&model.song&&i===f.slot);
    if(recordButton&&model.recording){
      recordButton.style.setProperty("--mic-level",String(Math.max(0,Math.min(1,f.micLevel||0))));
      recordButton.style.setProperty("--record-arc",(Math.max(0,Math.min(1,f.recordProgress||0))*360)+"deg");
    }
  }
  function unmount(){
    if(!host)return;stops();clearTimeout(toastTimer);
    host.removeEventListener("keydown",keys);window.removeEventListener("blur",stops);host.replaceChildren();host.classList.remove("kids-surface");
    host=null;send=null;model=null;pageKind="";lastFocus=null;lastStep=-1;lastPlayPattern=-1;lastFeedback=null;lastFrame={};
    cells=[];partButtons=[];patternButtons=[];lights=[];chainSlots=[];pads=[];mainButtons={};
  }
  App.KidsView={mount,render,frame,flash,unmount,character,rowArt,rowName,partName:i=>parts[i],partColour:i=>colour[i]};
})();
