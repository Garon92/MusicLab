/* Pick up the pictured sound at the head of a row and place it on a beat. */
(() => {
  "use strict";
  let surface,send,events,drag,blockedClick;
  const pads='[data-k="pad"][data-row]',cells='[data-k="note"][data-col]';
  function unhighlight(){
    drag.target?.classList.remove("kv-stamp-target");
    drag.target=null;
  }
  function reset(suppress=false){
    if(!drag)return;
    const {source,id,ghost}=drag;
    if(ghost && suppress)blockedClick={id,until:performance.now()+850};
    if(drag.frame)cancelAnimationFrame(drag.frame);
    unhighlight();ghost?.remove();source.classList.remove("kv-stamp-lift");
    surface.classList.remove("kv-stamping");drag=null;
    if(source.hasPointerCapture(id))source.releasePointerCapture(id);
  }
  function start(e){
    if(drag && drag.id!==e.pointerId)reset(true);
    if(e.button!==0 || !e.isPrimary)return;
    blockedClick=null;
    const pad=e.target.closest?.(pads);
    if(drag || !pad || pad.closest("[inert]"))return;
    // The existing pad handler sounds immediately. When armed it also records
    // on the audio clock, so this press belongs entirely to live performance.
    if(surface.querySelector('[data-k="arm"]')?.getAttribute("aria-pressed")==="true")return;
    drag={id:e.pointerId,source:pad,row:Number(pad.dataset.row),x:e.clientX,y:e.clientY,
      track:App.P.sel.t,pattern:App.P.sel.p,project:App.P,ghost:null,target:null};
    try{pad.setPointerCapture(e.pointerId);}catch{} // Window listeners also receive an uncaptured mouse.
  }
  function validSource(){
    return drag.project===App.P && drag.track===App.P.sel.t && drag.pattern===App.P.sel.p &&
      !drag.source.closest("[hidden],[inert]") && surface.contains(drag.source);
  }
  function watchSource(){
    // A second finger or a key can open the shelf or switch projects while
    // the first finger is motionless. Remove its ghost as soon as the desk changes.
    if(!validSource())reset(true);
    else drag.frame=requestAnimationFrame(watchSource);
  }
  function lift(){
    const art=drag.source.querySelector(".kv-row-picture svg");
    if(!art)return false;
    const ghost=document.createElement("div");ghost.className="kv-stamp-ghost";ghost.setAttribute("aria-hidden","true");
    ghost.style.setProperty("--stamp-ink",getComputedStyle(drag.source).getPropertyValue("--row-ink"));
    ghost.append(art.cloneNode(true));surface.append(ghost);drag.ghost=ghost;
    drag.source.classList.add("kv-stamp-lift");surface.classList.add("kv-stamping");
    drag.frame=requestAnimationFrame(watchSource);
    return true;
  }
  function aim(x,y){
    const pointed=document.elementFromPoint(x,y)?.closest(cells);
    const board=drag.source.closest(".kv-board");
    // A beat is a column. Crossing into the next instrument's row while
    // dragging still stamps the picture the child picked up.
    const target=pointed && board.contains(pointed) ?
      drag.source.closest(".kv-lane").querySelector('[data-k="note"][data-col="'+pointed.dataset.col+'"]') : null;
    if(target!==drag.target){
      unhighlight();drag.target=target;target?.classList.add("kv-stamp-target");
    }
    drag.ghost.style.left=x+"px";drag.ghost.style.top=y+"px";
  }
  function move(e){
    if(!drag || drag.id!==e.pointerId)return;
    if(!validSource()){reset(true);return;}
    if(!drag.ghost){
      const distance=e.pointerType==="touch"?10:7;
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<distance || !lift())return;
    }
    e.preventDefault();aim(e.clientX,e.clientY);
  }
  function end(e){
    if(!drag || drag.id!==e.pointerId)return;
    if(!drag.ghost || !validSource()){reset(true);return;}
    aim(e.clientX,e.clientY);
    const {row,target}=drag;reset(true);
    if(target)send("stamp",row,Number(target.dataset.col));
  }
  function cancel(e){
    if(drag && (e.pointerId==null || e.pointerId===drag.id))reset(true);
  }
  function click(e){
    if(!blockedClick || !e.detail)return;
    const {id,until}=blockedClick;
    if(performance.now()>until){blockedClick=null;return;}
    if(e.pointerId>0 && e.pointerId!==id)return;
    blockedClick=null;e.preventDefault();e.stopImmediatePropagation();
  }
  function mount(host,dispatch){
    unmount();surface=host;send=dispatch;events=new AbortController();
    for(const b of surface.querySelectorAll(pads)){
      b.classList.add("kv-stamp-source");
      b.setAttribute("aria-description","Play this sound or drag it onto a beat. Arm the pads to record a live performance.");
    }
    const options={capture:true,signal:events.signal};
    surface.addEventListener("pointerdown",start,options);
    surface.addEventListener("click",click,options);
    window.addEventListener("pointermove",move,{...options,passive:false});
    window.addEventListener("pointerup",end,options);
    window.addEventListener("pointercancel",cancel,options);
    surface.addEventListener("lostpointercapture",cancel,options);
    window.addEventListener("blur",cancel,{signal:events.signal});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)reset(true);},options);
    window.addEventListener("keydown",e=>{if(drag && e.key==="Escape"){reset(true);e.preventDefault();e.stopPropagation();}},options);
  }
  function unmount(){
    if(!surface)return;
    reset();blockedClick=null;events.abort();
    for(const b of surface.querySelectorAll(".kv-stamp-source")){b.classList.remove("kv-stamp-source");b.removeAttribute("aria-description");}
    surface=null;send=null;events=null;
  }
  App.KidsStamp={mount,unmount};
})();
