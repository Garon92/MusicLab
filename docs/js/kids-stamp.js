/* Picture drags on the score and the song share one pointer and one drop. */
(() => {
  "use strict";
  let surface,send,events,drag,blockedClick;
  const pads='[data-k="pad"][data-row]',cells='[data-k="note"][data-col]';
  const effect='#kids-inline-sound [data-sound="pad"]',preview='[data-k="arrange"]',miniature=".kv-chain-print i";
  const sources=[pads,cells+'[aria-pressed="true"]','[data-k="pattern"]','[data-k="addPiece"]','[data-k="piece"]',miniature].join(",");
  function target(node=null,index=null,edge=""){
    if(node!==drag.target || edge!==drag.edge){
      if(drag.target){drag.target.classList.remove("kv-stamp-target");delete drag.target.dataset.dropEdge;}
      if(node){node.classList.add("kv-stamp-target");if(edge)node.dataset.dropEdge=edge;}
    }
    drag.target=node;drag.index=index;drag.edge=edge;
  }
  function reset(suppress=false){
    if(!drag)return;
    const {source,id,ghost,capture}=drag;
    if(suppress)blockedClick={id,until:performance.now()+850};
    clearTimeout(drag.turnTimer);
    if(drag.frame)cancelAnimationFrame(drag.frame);
    target();ghost?.remove();source.classList.remove("kv-stamp-lift");
    surface.classList.remove("kv-stamping","kv-stamping-sound","kv-stamping-note","kv-stamping-pieces");
    drag.lane?.classList.remove("kv-stamp-lane");drag.zone?.classList.remove("kv-piece-zone");
    drag=null;
    if(capture.hasPointerCapture(id))capture.releasePointerCapture(id);
  }
  function start(e){
    if(drag && drag.id!==e.pointerId)reset(true);
    if(e.button!==0 || !e.isPrimary)return;
    blockedClick=null;
    const source=e.target.closest?.(sources);
    if(drag || !source || source.disabled || source.closest("[inert]"))return;
    const mini=source.matches(miniature),kind=mini?"piece":source.dataset.k;
    // Armed pads belong to live recording as soon as they are pressed.
    if(kind==="pad" && surface.querySelector('[data-k="arm"]')?.getAttribute("aria-pressed")==="true")return;
    const music=kind==="pad" || kind==="note";
    drag={id:e.pointerId,source,capture:source,kind,music,project:App.P,track:App.P.sel.t,pattern:App.P.sel.p,
      chain:music?null:App.P.chain.slice(),row:Number(source.dataset.row),col:Number(source.dataset.col),
      sourceIndex:mini?Array.from(source.parentElement.children).indexOf(source):Number(source.dataset.index),
      x:e.clientX,y:e.clientY,panel:source.closest(".kv-sheet-arrange"),board:source.closest(".kv-board"),
      lane:source.closest(".kv-lane"),ghost:null,target:null};
    try{source.setPointerCapture(e.pointerId);}catch{} // Window listeners still receive an uncaptured mouse.
  }
  function validSource(){
    if(drag.project!==App.P || surface.hidden)return false;
    // Page arrows can replace the original song tile during a drag. Once it is
    // lifted its position belongs to the chain snapshot, and the sheet owns capture.
    if(drag.ghost && drag.panel){
      if(drag.panel.hidden || !drag.panel.classList.contains("kv-sheet-arrange"))return false;
    }else if(!surface.contains(drag.source) || drag.source.closest("[hidden],[inert]"))return false;
    if(drag.music)return drag.track===App.P.sel.t && drag.pattern===App.P.sel.p &&
      (drag.kind!=="note" || drag.source.getAttribute("aria-pressed")==="true");
    return App.P.chain.length===drag.chain.length && drag.chain.every((p,i)=>p===App.P.chain[i]);
  }
  function watchSource(){
    if(!validSource())reset(true);
    else drag.frame=requestAnimationFrame(watchSource);
  }
  function lift(){
    const {source,kind,music}=drag;
    const image=kind==="pad"?".kv-row-picture svg":kind==="note"?".kv-note-image svg":":scope > svg";
    const art=source.querySelector(image);
    if(!art || (kind==="note" && !source.liftNote())){reset(true);return false;}
    const ghost=document.createElement("div");ghost.className="kv-stamp-ghost";ghost.setAttribute("aria-hidden","true");
    ghost.style.setProperty("--stamp-ink",getComputedStyle(source).getPropertyValue(music?"--row-ink":"--piece"));
    ghost.append(art.cloneNode(true));surface.append(ghost);drag.ghost=ghost;
    source.classList.add("kv-stamp-lift");
    surface.classList.add("kv-stamping",kind==="pad"?"kv-stamping-sound":kind==="note"?"kv-stamping-note":"kv-stamping-pieces");
    if(kind==="pad")drag.lane.classList.add("kv-stamp-lane");
    if(!music){
      ghost.classList.add("kv-piece-ghost");
      const pattern=kind==="piece"?drag.chain[drag.sourceIndex]:drag.sourceIndex;
      const letter=document.createElement("b");letter.textContent="ABCD"[pattern];ghost.append(letter);
      if(kind==="piece" || drag.chain.length<32){
        drag.zone=drag.panel?drag.panel.querySelector(".kv-chain-slots"):surface.querySelector(preview);
        drag.zone?.classList.add("kv-piece-zone");
      }
      if(drag.panel){
        try{drag.panel.setPointerCapture(drag.id);drag.capture=drag.panel;}catch{}
      }
    }
    drag.frame=requestAnimationFrame(watchSource);return true;
  }
  function aimSound(pointed){
    const cell=pointed?.closest(cells);
    if(drag.kind==="note"){
      const open=cell && drag.board.contains(cell) && cell.getAttribute("aria-pressed")==="false"?cell:null;
      target(open);
      const lane=open?.closest(".kv-lane")||drag.lane;
      if(drag.pictureLane!==lane){
        drag.ghost.replaceChildren(lane.querySelector(".kv-row-picture svg").cloneNode(true));
        drag.ghost.style.setProperty("--stamp-ink",getComputedStyle(lane).getPropertyValue("--row-ink"));
        drag.pictureLane=lane;
      }
      return;
    }
    const fx=pointed?.closest(effect);
    if(fx){target(fx);return;}
    // Crossing another row still stamps the picture the child picked up.
    target(cell && drag.board.contains(cell)?drag.lane.querySelector('[data-col="'+cell.dataset.col+'"]'):null);
  }
  function turnWhenHeld(button){
    if(drag.turn===button)return;
    clearTimeout(drag.turnTimer);drag.turn=button;
    if(!button)return;
    drag.turnTimer=setTimeout(()=>{
      if(!drag || !validSource() || !button.isConnected || button.disabled)return;
      button.click();
      drag.zone=drag.panel.querySelector(".kv-chain-slots");drag.zone.classList.add("kv-piece-zone");
      aim(drag.pointerX,drag.pointerY);
    },550);
  }
  function miniAtGap(items,x,y){
    // Only bridge the narrow gutters. The unoccupied tail of the strip stays
    // an append target, even when the real pieces wrap onto a second row.
    let closest=null,distance=Infinity;
    for(const tile of items){
      const r=tile.getBoundingClientRect(),dx=Math.max(r.left-x,0,x-r.right),dy=Math.max(r.top-y,0,y-r.bottom);
      if(dx<=2 && dy<=2 && dx*dx+dy*dy<distance){
        closest=tile;distance=dx*dx+dy*dy;
      }
    }
    return closest;
  }
  function aimPieces(pointed,x,y){
    const list=drag.zone;
    if(!list){target();return;}
    if(drag.panel){
      const arrow=pointed?.closest(".kv-page-key");
      turnWhenHeld(arrow && !arrow.disabled?arrow:null);
    }
    if(!drag.panel && pointed?.closest('[data-k="appendPiece"]:not(:disabled)')){target(list,drag.chain.length,"append");return;}
    if(!pointed || !list.contains(pointed)){target();return;}
    const strip=drag.panel?list:list.querySelector(".kv-chain-print");
    const items=Array.from(strip.children);
    let tile=drag.panel?pointed.closest(".kv-piece,.kv-vacant"):pointed.closest(miniature);
    if(!tile){
      if(drag.panel)tile=items.find(item=>x<=item.getBoundingClientRect().right) || items.at(-1);
      else if(strip.contains(pointed))tile=miniAtGap(items,x,y);
    }
    if(tile && !tile.classList.contains("kv-vacant")){
      const box=tile.getBoundingClientRect(),after=x>box.left+box.width/2;
      const i=drag.panel?Number(tile.dataset.index):items.indexOf(tile);
      target(tile,i+(after?1:0),after?"after":"before");
    }else if(drag.panel){
      const vacant=items.find(item=>item.classList.contains("kv-vacant"));
      target(vacant || items.at(-1) || list,drag.chain.length,vacant || !items.length?"before":"after");
    }else if(items.length===32)target(items.at(-1),items.length,"after");
    else target(list,drag.chain.length,"append");
  }
  function aim(x,y){
    const pointed=document.elementFromPoint(x,y);
    drag.pointerX=x;drag.pointerY=y;
    if(drag.music)aimSound(pointed);else aimPieces(pointed,x,y);
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
    if(!validSource()){reset(true);return;}
    if(!drag.ghost){reset();return;}
    aim(e.clientX,e.clientY);
    const {kind,sourceIndex,row,col,target:to,index}=drag;reset(true);
    if(!to)return;
    if(kind==="pad"){
      if(to.matches(effect))App.KidsSound.dropPicture(row,e.clientX,e.clientY);
      else send("stamp",row,Number(to.dataset.col));
    }else if(kind==="note")send("moveNote",row,col,Number(to.dataset.row),Number(to.dataset.col));
    else if(kind==="piece")App.KidsView.movePiece(sourceIndex,index>sourceIndex?index-1:index);
    else App.KidsView.insertPiece(sourceIndex,index);
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
      b.setAttribute("aria-description","Ťuknutím si zvuk poslechneš. Přetáhni ho do rytmu nebo na plochu efektu.");
    }
    for(const b of surface.querySelectorAll('[data-k="pattern"]'))
      b.setAttribute("aria-description","Ťuknutím vybereš dílek. Přetažením do pořadí ho vložíš do písničky.");
    surface.querySelector(preview)?.setAttribute("aria-description","Přetáhni obrázek na nové místo nebo ťukni pro otevření pořadí dílků.");
    const options={capture:true,signal:events.signal};
    surface.addEventListener("pointerdown",start,options);
    surface.addEventListener("click",click,options);
    window.addEventListener("pointermove",move,{...options,passive:false});
    window.addEventListener("pointerup",end,options);
    window.addEventListener("pointercancel",cancel,options);
    surface.addEventListener("lostpointercapture",e=>{if(e.target===drag?.capture)cancel(e);},options);
    window.addEventListener("blur",cancel,{signal:events.signal});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)reset(true);},options);
    window.addEventListener("keydown",e=>{if(drag && e.key==="Escape"){reset(true);e.preventDefault();e.stopPropagation();}},options);
  }
  function unmount(){
    if(!surface)return;
    reset();blockedClick=null;events.abort();
    for(const b of surface.querySelectorAll('.kv-stamp-source,[data-k="pattern"],'+preview)){b.classList.remove("kv-stamp-source");b.removeAttribute("aria-description");}
    surface=null;send=null;events=null;
  }
  App.KidsStamp={mount,unmount};
})();
