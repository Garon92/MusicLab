/* A two-handed sound toy: coordinates are ordinary sends and rack macros,
   and a recorded journey lives in the same clip automation the console edits. */
(() => {
  "use strict";
  const rooms={
    echo:{label:"Ozvěna",keys:["dly","rev"],axes:["Ozvěna","Dozvuk"],ends:["Jednou","Ozvěny","Bez dozvuku","Doznívá"],colour:"#83d9cb"},
    colour:{label:"Ostrost",keys:["macro2","macro1"],axes:["Jas","Zkreslení"],ends:["Temný","Jasný","Čistý","Drsný"],colour:"#ffb36f",
      routes:[["macro2","tone",-1,"Shade"],["macro1","drive",.85,"Saturation"]]},
    motion:{label:"Chvění",keys:["macro4","macro3"],axes:["Rychlost","Síla chvění"],ends:["Pomalu","Rychle","Klid","Silně"],colour:"#bda8ec",
      routes:[["macro4","vibratoRate",1,"Vibrato speed"],["macro3","vibratoDepth",1,"Vibrato depth"]]}
  };
  const eighth='<path d="M13 23V5l12 4v6l-9-4v12c0 7-14 10-14 4 0-4 6-7 11-6Z" fill="currentColor" stroke="none"/>';
  const marks={
    back:'<path d="M20 9 9 20l11 11M10 20h22"/>',
    expand:'<path d="M7 16V7h9m8 0h9v9m0 8v9h-9m-8 0H7v-9m3-14 6 6m14-6-6 6m6 14-6-6m-14 6 6-6"/>',
    play:'<path d="m13 7 18 13-18 13z" fill="currentColor"/>',stop:'<rect x="10" y="10" width="20" height="20" rx="4" fill="currentColor"/>',
    echo:'<g transform="translate(0 0) scale(.80)">'+eighth+'</g><g transform="translate(16 10) scale(.56)" opacity=".72">'+eighth+'</g><g transform="translate(29 19) scale(.37)" opacity=".52">'+eighth+'</g>',
    colour:'<g transform="translate(3 5) scale(.94)">'+eighth+'</g><path d="m25 4 2-3m3 9 5-3m-4 10 6-1m-7 8 5 2"/>',
    motion:'<g transform="translate(9 3) rotate(7 12 20)">'+eighth+'</g><path d="M6 7q-5 4-3 10m4-6q-2 2-1 4m27 6q1 2-1 5m4-7q3 6-2 11"/>',
    arm:'<circle cx="20" cy="20" r="12" fill="#ec796d"/>',
    drag:'<path d="M6 16V7h9M6 7l8 8m7 6-3-11q-1-4 2-4t4 3l3 9 4-1 5 6-1 8-6 5-7-2-9-9q-2-3 0-5t5 0l4 4"/>',
    reverse:'<path d="m18 9-9 8 9 8m-8-8h14a8 8 0 0 1 0 16h-6"/>',
    clear:'<path d="m8 25 15-15a3 3 0 0 1 4 0l6 6-16 16h-3z" fill="#f09c98"/><path d="m16 17 9 9m-9 6h17"/>',
    undo:'<path d="M15 7 5 16l10 8M6 16h15c14 0 14 15 1 16"/>',
    freeze:'<path d="M20 4v32M6 12l28 16M6 28l28-16m-20-5 6 5 6-5m-12 26 6-5 6 5"/>',
    time:'<circle cx="20" cy="21" r="13"/><path d="M16 4h8m-4 4v4m0 9 7-6"/>',
    repeat:'<path d="M4 18q3-8 6 1t7 0 7 0 5 0 6 0"/><path d="M4 27h6m3 0h4m4 0h2"/>'
  };
  const svg=(body,box="0 0 40 40")=>'<svg viewBox="'+box+'" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
  const face=(mark,label)=>svg(marks[mark])+'<span class="ks-key-name">'+label+'</span>';
  const key=(action,label,mark,extra="")=>'<button type="button" class="kv-button ks-key" data-sound="'+action+'" aria-label="'+label+'" '+extra+'>'+face(mark,label)+'</button>';
  // Each landscape has motion cues at its edges. The flying puck and its path
  // are drawn above this printed face, so they can move without repainting the illustration.
  const scenery={
    echo:'<g fill="#d0efe0"><circle cx="428" cy="48" r="25"/><path d="M0 147 69 92l32 26 59-58 70 73 76-34 96 47 57-45 41 24v55H0z"/></g><path d="M0 169q73-30 151 0t157 0 192-8v119H0z" fill="#65c7c2"/><g fill="none" stroke="#398d9c" stroke-width="3"><ellipse cx="98" cy="202" rx="42" ry="8"/><ellipse cx="98" cy="202" rx="24" ry="4"/><path d="M320 224q28 10 62 0m-240 25q31-9 66 0"/></g><path d="m75 199 7-10 16-6 18 16z" fill="#689294" stroke="#45666c" stroke-width="2"/>',
    colour:'<path d="m0 14 58 21 28-33 36 12 19-14H0zm375-14 17 23 43-10 36 32 29 10V0z" fill="#e4a485"/><path d="m0 225 41-24 49 18 65-12 64 39 76-21 55 21 150-54v88H0z" fill="#e59e7c"/><path d="m44 217 10-35 14-12 9 40 10-22 8 23-20 9z" fill="#bf8ec0"/><g stroke="#c58173" fill="none" stroke-width="2"><path d="m188 178 52-98 55 99z" fill="#f8e0aa"/><path d="m240 80 13 75 42 24m-107-1 65-23L240 80"/></g><g fill="none" stroke-width="5"><path d="m0 139 215 5" stroke="#fff2ca"/><path d="m274 140 226-60" stroke="#e68a90"/><path d="m276 146 224-18" stroke="#f6ce72"/><path d="m280 151 220 28" stroke="#83c4b1"/></g>',
    motion:'<circle cx="78" cy="46" r="23" fill="#f9da9d"/><path d="M0 192q60-48 122-3t130 1 112-24 136 15v99H0z" fill="#ad9ed5"/><g stroke="#8577a8" fill="none" stroke-width="3"><path d="M64 160q16-70 32-18t32 0 28 0 28 0"/><path d="M288 209q20-14 40 0t40 0 40 0"/></g><g fill="#f6d892"><path d="m369 38 3 8 9 3-9 3-3 9-3-9-9-3 9-3z"/><circle cx="404" cy="76" r="4"/><circle cx="339" cy="85" r="3"/></g>'
  };
  // Each pair of pictures sits at the two ends of its own axis.
  const guideMarks={
    echo:[
      '<g transform="translate(11 1) scale(.72)">'+eighth+'</g>',
      '<g transform="translate(1 1) scale(.68)">'+eighth+'</g><g transform="translate(19 7) scale(.48)" opacity=".75">'+eighth+'</g><g transform="translate(31 12) scale(.33)" opacity=".6">'+eighth+'</g>',
      '<g transform="translate(13 3) scale(.68)">'+eighth+'</g>',
      '<path d="M2 25V13Q21-8 40 13v12M7 25V15q14-15 28 0v10" fill="#e5be82"/><g transform="translate(14 10) scale(.45)">'+eighth+'</g>'
    ],
    colour:[
      '<path d="M24 4a10 10 0 1 0 6 16c-12 2-16-9-6-16Z" fill="currentColor"/>',
      '<circle cx="21" cy="14" r="5" fill="currentColor"/><path d="M21 2v3m0 18v3M9 14h3m18 0h3M12 5l3 3m12 12 3 3m0-18-3 3M15 20l-3 3"/>',
      '<path d="M2 15q6-13 13-2t14 0q6-9 11-1"/>',
      '<path d="m2 18 5-14 3 17 6-12 5 15 3-21 6 16 3-12 7 7"/>'
    ],
    motion:[
      '<path d="M2 15q9-16 18 0t18 0"/>',
      '<path d="M2 15q3-13 6 0t6 0 6 0 6 0 6 0 6 0"/>',
      '<path d="M2 14h38"/>',
      '<path d="M2 14q5-21 9 0t9 0 9 0 9 0"/>'
    ]
  };
  function axis(room,from,to){
    const end=i=>'<span class="ks-end" data-end="'+i+'">'+svg(guideMarks[room][i],"0 0 42 28")+
      '<span>'+rooms[room].ends[i]+'</span></span>';
    return end(from)+'<i class="ks-ruler"><i></i></i>'+end(to);
  }
  let root=null,ui=null,mode="echo",held=null,armed=false,frozen=false,compact=false;
  let controls,performer,pad,puck,path,scene,trail,oldBank=null;
  const config=()=>rooms[mode];
  const ti=()=>App.KidsMusic.tracks[ui.part()];
  const current=()=>App.Seq.now(ti());
  const bank=()=>current()?.pat??ui.pattern();
  const values=(x,y)=>[mode==="colour"?1-x:x,y];
  const coords=([a,b])=>[mode==="colour"?1-a:a,b];
  const round=v=>Math.round(App.clamp(v,0,1)*1000)/1000;
  function base(i,k){return k.startsWith("macro")?App.Rack.getMacro(i,Number(k.slice(-1))-1):App.P.tracks[i][k];}
  function route(i){
    const strip=App.P.rack.strips[i];let changed=false;
    for(const [source,target,high,name] of config().routes||[]){
      if(strip.routes.some(r=>r.source===source && r.target===target))continue;
      if(strip.routes.length>=16)continue;
      strip.routes.push({source,target,low:0,high});strip.macroNames[Number(source.slice(-1))-1]=name;changed=true;
    }
    if(changed)App.E?.rack.sync();
  }
  function apply(g){
    const T=App.P.tracks[g.i],v=values(g.x,g.y);
    config().keys.forEach((k,a)=>{
      if(k.startsWith("macro"))App.Rack.setMacro(g.i,Number(k.slice(-1))-1,v[a]);
      else {
        T[k]=v[a];const E=App.E;if(!E)return;
        const p=E.tracks[g.i].params[k],now=E.ctx.currentTime;p.cancelScheduledValues(now);p.setTargetAtTime(v[a]**2,now,.009);
      }
    });
  }
  function putPoint(lanes,k,s,v){
    const line=lanes[k]??={mode:"linear",points:[]},p=line.points.find(p=>p.s===s);
    if(p){p.v=v;p.shape="linear";delete p.in;}
    else {line.points.push({s,v,shape:"linear"});line.points.sort((a,b)=>a.s-b.s);}
  }
  function capture(){
    if(!held?.record)return;
    const c=current(),p=c?.pat??ui.pattern(),s=App.clamp(Math.floor(c?.step??0),0,15);
    const v=values(held.x,held.y),stamp=p+"/"+s+"/"+v;
    if(held.stamp===stamp)return;held.stamp=stamp;
    const lanes=App.P.tracks[held.i].automation[p];
    config().keys.forEach((k,a)=>putPoint(lanes,k,s,v[a]));oldBank=null;
  }
  function lanes(i,p,stored){
    if(!held||held.i!==i)return stored;
    const out={...stored};
    config().keys.forEach((k,a)=>{out[k]={mode:"step",points:[{s:0,v:values(held.x,held.y)[a]}]};});
    return out;
  }
  function place(x,y){
    puck.style.left=(x*100)+"%";puck.style.top=((1-y)*100)+"%";
    const left=Math.round(x*100),top=Math.round((1-y)*100);
    const text=config().axes[0]+" "+left+"%, "+config().axes[1]+" "+(100-top)+"%";
    if(pad.getAttribute("aria-valuetext")!==text){
      pad.parentElement.style.setProperty("--ks-x",left+"%");pad.parentElement.style.setProperty("--ks-y",top+"%");
      pad.setAttribute("aria-valuenow",String(left));pad.setAttribute("aria-valuetext",text);
    }
  }
  function at(e){
    const b=trail.getBoundingClientRect();return [round((e.clientX-b.left)/b.width),round(1-(e.clientY-b.top)/b.height)];
  }
  function begin(x,y,id){
    if(held)return;
    const E=App.audio();if(!E)return;
    if(armed && !App.Seq.playing)ui.play();
    const i=ti(),c=current(),hasClip=App.P.tracks[i].clips[c?.pat??ui.pattern()].length>0;
    const part=ui.part(),row=ui.row();
    held={i,x,y,id,part,row,record:armed,preview:!(App.Seq.playing&&hasClip),repeatAt:null,note:null};
    route(i);apply(held);capture();place(x,y);pad.classList.add("held");
    // A dropped picture gets one complete preview, including pitched instruments
    // which would otherwise get a note-off in the same instant as the note-on.
    if(id==="drop")App.KidsMusic.audition(part,row);
    else if(held.preview){
      if(App.P.tracks[i].kind==="kit")auditionHit(held);
      else {held.note=App.KidsMusic.pitch(part,row);E.noteOn(i,held.note,.66,true);}
    }
    paint();
  }
  function auditionHit(g){
    const padIndex=App.KidsMusic.pitch(g.part,g.row)-36;
    const pad=App.P.tracks[g.i].kit.pads[padIndex];
    const buffer=pad?.id && App.samples.get(pad.id)?.buffer;
    App.KidsMusic.audition(g.part,g.row);
    g.repeatAt=App.E.ctx.currentTime+Math.max(.2,30/App.P.bpm,buffer?.duration||0);
  }
  function move(x,y){
    if(!held)return;
    held.x=x;held.y=y;apply(held);capture();place(x,y);
  }
  function release(){
    if(!held)return;
    const g=held;capture();held=null;
    if(g.note!==null)App.E?.noteOff(g.i,g.note);
    if(g.record)armed=false;
    pad?.classList.remove("held");App.commit();oldBank=null;ui?.paint();
  }
  function line(p){
    const i=ti(),lanes=App.P.tracks[i].automation[p],cfg=config();
    for(const b of controls.querySelectorAll("[data-mode]")){
      const room=rooms[b.dataset.mode],recorded=room.keys.some(k=>lanes[k]?.points?.length);
      b.classList.toggle("ks-recorded",recorded);
      b.setAttribute("aria-label",room.label+(recorded?", s nahraným pohybem":""));
    }
    const active=cfg.keys.some(k=>lanes[k]?.points?.length);
    if(active){
      const points=Array.from({length:65},(_,j)=>{
        const [x,y]=coords(cfg.keys.map(k=>App.curveValue(lanes[k],15*j/64,base(i,k))));
        return (x*1000).toFixed(1)+","+((1-y)*1000).toFixed(1);
      });
      path.setAttribute("points",points.join(" "));
    }else path.removeAttribute("points");
    const clear=controls.querySelector('[data-sound="clear"]');
    if(compact)clear.hidden=!active;
    else {clear.disabled=!active;controls.querySelector('[data-sound="reverse"]').disabled=!active;}
    const cue=controls.querySelector(".ks-cue");
    let message="";
    if(active&&!App.P.tracks[i].clips[p].length)message="Přidej zvuk do rytmu";
    if(armed)message="Táhni a pusť";
    if(held)message=held.record?"Nahrávám pohyb":"";
    if(cue.dataset.message!==message){
      cue.dataset.message=message;cue.lastElementChild.textContent=message;
      cue.hidden=!message;cue.classList.toggle("ks-gesture-cue",!active || armed);
    }
    oldBank=p;
  }
  function frame(_,levels){
    if(!root)return;
    if(levels && performer)performer.style.setProperty("--amplitude",levels[ui.part()]||0);
    const c=current(),p=c?.pat??ui.pattern();
    if(held){
      capture();
      if(held.repeatAt!==null && App.E.ctx.currentTime>=held.repeatAt)auditionHit(held);
    }else{
      const i=ti(),lanes=App.P.tracks[i].automation[p];
      place(...coords(config().keys.map(k=>c?App.curveValue(lanes[k],c.step,base(i,k)):base(i,k))));
    }
    if(oldBank!==p)line(p);
  }
  function paint(){
    if(!root)return;
    const el=a=>controls.querySelector('[data-sound="'+a+'"]');
    const part=ui.part(),row=ui.row(),costume=App.KidsMusic.costumes(App.P)[part]||0;
    if(performer && performer.dataset.portrait!==part+"."+costume){
      performer.querySelector(".ks-portrait").innerHTML=App.KidsView.character(part,costume);
      performer.style.setProperty("--part",App.KidsView.partColour(part));
      performer.style.setProperty("--amplitude",0);
      performer.setAttribute("aria-label","Změnit sadu, nyní "+App.KidsView.partLabel(part));
      performer.dataset.portrait=part+"."+costume;
    }
    const family=controls.querySelector(".ks-family");
    if(family && family.dataset.source!==part+"."+costume){
      family.innerHTML=App.KidsView.character(part,costume);
      family.dataset.source=part+"."+costume;
    }
    controls.querySelector(".ks-target-name").textContent=App.KidsView.partLabel(part);
    const sound=part+"."+row;
    if(puck.dataset.soundId!==sound){
      puck.dataset.soundId=sound;puck.innerHTML=App.KidsView.rowArt(part,row);
    }
    for(const b of controls.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));
    const play=el("play"),playing=App.Seq.playing;
    if(play && play.dataset.playing!==String(playing)){const label=playing?"Zastavit":"Přehrát";play.innerHTML=face(playing?"stop":"play",label);play.dataset.playing=playing;play.setAttribute("aria-label",label);}
    const arm=el("arm"),armState=held?.record?"recording":armed?"armed":"idle";
    if(arm.dataset.state!==armState){
      const name=armState==="idle"?"Nahrát pohyb":armState==="armed"?"Zrušit nahrávání":"Ukončit záznam";
      arm.innerHTML=face(armState==="idle"?"arm":"stop",name);
      arm.dataset.state=armState;arm.setAttribute("aria-label",name);arm.setAttribute("aria-pressed",String(armed));
    }
    const cfg=config();root.style.setProperty("--room",cfg.colour);pad.dataset.room=mode;
    pad.setAttribute("aria-label",cfg.label+" pro celou sadu "+App.KidsView.partLabel(part)+", poslech: "+App.KidsView.rowLabel(part,row));
    if(scene.dataset.room!==mode){
      scene.innerHTML='<svg viewBox="0 0 500 280" preserveAspectRatio="none" aria-hidden="true">'+scenery[mode]+'</svg>';
      controls.querySelector(".ks-axis-x").innerHTML=axis(mode,0,1);
      controls.querySelector(".ks-axis-y").innerHTML=axis(mode,3,2);
      const [left,right,down,up]=cfg.ends;
      pad.setAttribute("aria-description","Táhni obrázkem nebo použij šipky. Vlevo: "+left+". Vpravo: "+right+". Dole: "+down+". Nahoře: "+up+".");
      scene.dataset.room=mode;
    }
    if(!compact){
      const freeze=el("freeze"),freezeName=frozen?"Rozhýbat obraz":"Zastavit obraz";
      freeze.setAttribute("aria-pressed",String(frozen));freeze.setAttribute("aria-label",freezeName);freeze.lastElementChild.textContent=freezeName;
      el("undo").disabled=!App.KidsStore.canUndo();
      root.querySelector(".ks-echo-controls").hidden=mode!=="echo";
      for(const [action,choices,k] of [["time",[2,5,8],"dtime"],["repeat",[.18,.4,.63],"dfb"]]){
        const button=el(action),n=choices.reduce((a,b)=>Math.abs(b-App.P.fx[k])<Math.abs(a-App.P.fx[k])?b:a);
        button.dataset.level=choices.indexOf(n)+1;button.setAttribute("aria-label",button.lastElementChild.textContent+", stupeň "+button.dataset.level+" ze 3");
      }
      controls.querySelector(".ks-monitors").dataset.frozen=String(frozen);
    }
    line(bank());frame();
  }
  function action(e){
    const b=e.target.closest("button[data-sound]");if(!b||b.disabled)return;
    const wasArmed=armed;release();
    switch(b.dataset.sound){
      case "back":ui.back();return;
      case "expand":ui.expand();return;
      case "part":App.Kids.dispatch("track",(ui.part()+1)%App.KidsMusic.tracks.length);break;
      case "mode":mode=b.dataset.mode;break;
      case "play":ui.play();break;
      case "arm":armed=!wasArmed;break;
      case "freeze":frozen=!frozen;break;
      case "undo":App.Kids.dispatch("undo");break;
      case "clear":case "reverse":{
        const i=ti(),L=App.P.tracks[i].automation[bank()];
        for(const k of config().keys){
          if(!L[k]?.points?.length)continue;
          if(b.dataset.sound==="clear")delete L[k];
          else {
            const old=L[k];
            L[k]={mode:"linear",points:Array.from({length:16},(_,s)=>({s,v:round(App.curveValue(old,15-s,base(i,k)))}))};
          }
        }
        App.commit();break;
      }
      case "time":case "repeat":{
        const time=b.dataset.sound==="time",opts=time?[2,5,8]:[.18,.4,.63];
        App.P.fx[time?"dtime":"dfb"]=opts[+b.dataset.level%3];App.E?.syncFx();App.commit();break;
      }
    }
    oldBank=null;ui.paint();
  }
  const modes='<div class="ks-modes" role="group" aria-label="Vyber efekt">'+Object.keys(rooms).map(m=>key("mode",rooms[m].label,m,'data-mode="'+m+'"')).join("")+'</div>';
  const record=key("arm","Nahrát pohyb","arm");
  const surface='<div class="ks-instrument"><div class="ks-pad" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-sound="pad">'+
    '<div class="ks-scene"></div><div class="ks-cue">'+svg(marks.drag)+'<span></span></div><div class="ks-trail"><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">'+
    '<polyline fill="none" stroke="#39475d" stroke-width="3.5" stroke-dasharray="4 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>'+
    '<i class="ks-puck ks-sound-token" aria-hidden="true"></i></div></div><div class="ks-axis ks-axis-y" aria-hidden="true"></div><div class="ks-axis ks-axis-x" aria-hidden="true"></div></div>';
  const target='<span class="ks-target"><span>Efekty sady</span><strong class="ks-target-name"></strong></span>';
  const erase=key("clear","Smazat pohyb","clear");
  const inlineFace='<div class="ks-shell"><div class="ks-heading"><span class="ks-family"></span>'+target+'</div>'+modes+surface+
    '<div class="ks-inline-tools">'+record+erase+key("expand","Zvětšit","expand",'data-k="sound"')+'</div></div>';
  const fullFace='<div class="ks-shell"><header class="ks-head"><div class="ks-players">'+key("back","Zpět k rytmu","back")+
    '<button type="button" class="kv-button ks-performer" data-sound="part" aria-label="Změnit sadu"><span class="ks-portrait"></span>'+target+'<span class="ks-cycle">'+svg('<path d="M8 24a12 12 0 1 1 20 5m0-9v9h-9"/>')+'</span></button></div>'+
    modes+'<div class="ks-transport">'+key("play","Přehrát","play")+record+'</div></header><div class="ks-body">'+surface+
    '<aside class="ks-monitors"><div class="ks-screen"><span>Zvuková vlna</span><canvas data-kid-screen="wave" role="img" aria-label="Živá zvuková vlna"></canvas></div><div class="ks-screen"><span>Hluboké a vysoké tóny</span><canvas data-kid-screen="bands" role="img" aria-label="Hluboké a vysoké tóny ve zvuku"></canvas></div>'+key("freeze","Zastavit obraz","freeze")+'</aside></div>'+
    '<footer class="ks-foot"><div class="ks-echo-controls">'+key("time","Rozestup ozvěn","time")+key("repeat","Počet ozvěn","repeat")+'</div><div class="ks-tools">'+key("reverse","Obrátit pohyb","reverse")+erase+key("undo","Vrátit úpravu","undo")+'</div></footer></div>';
  function open(host,api,options={}){
    detach();root=host;ui=api;compact=!!options.compact;
    if(compact)root.classList.add("ks-inline");
    else root.classList.add("kids-surface","ks-room");
    root.innerHTML=compact?inlineFace:fullFace;
    controls=root.firstElementChild;controls.addEventListener("click",action);
    performer=controls.querySelector("[data-sound=part]");
    pad=root.querySelector(".ks-pad");puck=root.querySelector(".ks-puck");scene=root.querySelector(".ks-scene");
    trail=root.querySelector(".ks-trail");path=trail.querySelector("polyline");
    pad.onpointerdown=e=>{if(e.button!==0||held)return;e.preventDefault();pad.focus({preventScroll:true});pad.setPointerCapture(e.pointerId);begin(...at(e),e.pointerId);};
    pad.onpointermove=e=>{if(held?.id===e.pointerId)move(...at(e));};
    pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{if(held?.id===e.pointerId)release();};
    pad.onkeydown=e=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();e.stopPropagation();
      if(held&&held.id!=="key")return;
      const [x,y]=held?[held.x,held.y]:coords(config().keys.map(k=>base(ti(),k)));
      const d=e.shiftKey ? .02 : .1,xx=round(x+(e.key==="ArrowRight"?d:e.key==="ArrowLeft"?-d:0)),yy=round(y+(e.key==="ArrowUp"?d:e.key==="ArrowDown"?-d:0));
      if(held)move(xx,yy);else begin(xx,yy,"key");
    };
    pad.onkeyup=pad.onblur=()=>{if(held?.id==="key")release();};
    paint();
    if(!compact)controls.querySelector("button").focus({preventScroll:true});
  }
  function detach(){
    if(!root)return;
    release();root.classList.remove("kids-surface","ks-room","ks-inline");root.replaceChildren();
    root=null;ui=null;controls=null;performer=null;pad=null;puck=null;path=null;scene=null;trail=null;
    oldBank=null;
  }
  function dropPicture(row,clientX,clientY){
    if(!compact || !pad || held || pad.closest("[inert],[hidden]") || !Number.isInteger(row) || row<0 || row>3)return;
    ui.selectRow(row);
    begin(...at({clientX,clientY}),"drop");
    release();
  }
  function close(){
    detach();mode="echo";armed=false;frozen=false;
  }
  window.addEventListener("blur",release);
  App.KidsSound={open,close,paint,frame,release,lanes,dropPicture};
})();
