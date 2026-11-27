/* The sound room: one effect setting for the whole band and the whole song. Drag the picture through a scene: the
   coordinates are master returns, the strips' macros and the strips' own LFO, the same values the console edits. */
(() => {
  "use strict";
  const rooms={
    echo:{label:"Ozvěna",axes:["Ozvěna","Dozvuk"],ends:["Jednou","Ozvěny","Bez dozvuku","Doznívá"],colour:"#83d9cb"},
    colour:{label:"Ostrost",axes:["Jas","Zkreslení"],ends:["Temný","Jasný","Čistý","Drsný"],colour:"#ffb36f",
      routes:[["macro2","tone",-1,"Shade"],["macro1","drive",.85,"Saturation"]]},
    motion:{label:"Chvění",axes:["Rychlost","Síla chvění"],ends:["Pomalu","Rychle","Klid","Silně"],colour:"#bda8ec",
      routes:[["macro4","vibratoRate",1,"Vibrato speed"],["macro3","vibratoDepth",1,"Vibrato depth"]]},
    spin:{label:"Kolotoč",axes:["Rychlost","Kroužení"],ends:["Pomalu","Rychle","Na místě","Dokola"],colour:"#f3b6c6"}
  };
  const eighth='<path d="M13 23V5l12 4v6l-9-4v12c0 7-14 10-14 4 0-4 6-7 11-6Z" fill="currentColor" stroke="none"/>';
  const marks={
    scope:'<path d="m12 17 8 8 8-8"/>',
    band:'<path d="M4 24v-8l10-4v12M17 29V14l10-4v15M30 27V12l6-2"/><g fill="#75af9d"><ellipse cx="6" cy="26" rx="4" ry="3"/><ellipse cx="17" cy="31" rx="4" ry="3"/><ellipse cx="29" cy="29" rx="4" ry="3"/></g>',
    reset:'<path d="M8 15a13 13 0 1 1-1 14M7 7v10h10"/>',
    position:'<path d="M3 17h5l6-5v17l-6-5H3zm34 0h-5l-6-5v17l6-5h5Z" fill="#92c9e0"/><path d="M18 16q4 5 0 9m4-13q5 8 0 17"/>',
    balance:'<path d="M7 28V10m13 21V8m13 22V11"/><rect x="3" y="18" width="8" height="6" rx="2" fill="#e7ac68"/><rect x="16" y="12" width="8" height="6" rx="2" fill="#9abf92"/><rect x="29" y="21" width="8" height="6" rx="2" fill="#c7b4de"/>',
    back:'<path d="M20 9 9 20l11 11M10 20h22"/>',
    expand:'<path d="M7 16V7h9m8 0h9v9m0 8v9h-9m-8 0H7v-9m3-14 6 6m14-6-6 6m6 14-6-6m-14 6 6-6"/>',
    play:'<path d="m13 7 18 13-18 13z" fill="currentColor"/>',stop:'<rect x="10" y="10" width="20" height="20" rx="4" fill="currentColor"/>',
    arm:'<circle cx="20" cy="20" r="12" fill="#ec796d"/>',
    drag:'<path d="M6 16V7h9M6 7l8 8m7 6-3-11q-1-4 2-4t4 3l3 9 4-1 5 6-1 8-6 5-7-2-9-9q-2-3 0-5t5 0l4 4"/>',
    reverse:'<path d="m18 9-9 8 9 8m-8-8h14a8 8 0 0 1 0 16h-6"/>',
    freeze:'<path d="M20 4v32M6 12l28 16M6 28l28-16m-20-5 6 5 6-5m-12 26 6-5 6 5"/>',
    time:'<circle cx="20" cy="21" r="13"/><path d="M16 4h8m-4 4v4m0 9 7-6"/>',
    repeat:'<path d="M4 18q3-8 6 1t7 0 7 0 5 0 6 0"/><path d="M4 27h6m3 0h4m4 0h2"/>'
  };
  const svg=(body,box="0 0 40 40")=>'<svg viewBox="'+box+'" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
  const artwork=m=>marks[m]?svg(marks[m]):App.KidsPictures.effect(m);
  const face=(mark,label)=>artwork(mark)+'<span class="ks-key-name">'+label+'</span>';
  const key=(action,label,mark,extra="")=>'<button type="button" class="kv-button ks-key" data-sound="'+action+'" aria-label="'+label+'" '+extra+'>'+face(mark,label)+'</button>';
  // Only the paper horizon stretches. The little scene sits on its lower edge
  // and keeps its proportions on both the tall desk pad and the wider stage.
  const backdrops={
    echo:'<path d="M0 82 13 69l9 8 14-17 15 18 15-12 11 8 8-14 15 11v29H0Z" fill="#b4cfc0"/><path d="M0 89q16-5 35 0t35 0 30-1v12H0Z" fill="#90b6aa"/>',
    colour:'<path d="M0 83q10-9 21-3t22-2l12 3 10-8 11 7 8-9 16 8v21H0Z" fill="#ecc4a1"/><path d="M0 91q18-6 34-1t31-1l11-4 10 3 14-4v16H0Z" fill="#dcab8a"/>',
    motion:'<path d="M0 79q12-11 26 0t28-1 24 0 22-2v24H0Z" fill="#c9bbd9"/><path d="M0 88q11-4 22 0t23 0 24 0 18-1 13 0v13H0Z" fill="#afa4c5"/>',
    spin:'<path d="M0 84q25-8 50-2t50-3v21H0Z" fill="#efc3cf"/><path d="M0 91q20-4 40 0t35-1 25 0v10H0Z" fill="#d9a2b2"/>'
  };
  // Each pair of pictures sits at the two ends of its own axis.
  const guideMarks={
    echo:[
      '<g transform="translate(11 1) scale(.72)">'+eighth+'</g>',
      '<g transform="translate(1 1) scale(.68)">'+eighth+'</g><g transform="translate(19 7) scale(.48)" opacity=".75">'+eighth+'</g><g transform="translate(31 12) scale(.33)" opacity=".6">'+eighth+'</g>',
      '<g transform="translate(13 3) scale(.68)">'+eighth+'</g>',
      '<path d="m3 24 2-8 8-10 13-3 9 6 5 15Z" fill="#d9ac78"/><path d="M12 24q2-13 10-13 6 1 8 13Z" fill="#476775"/><g color="#fff4d5" transform="translate(16 13) scale(.34)">'+eighth+'</g>'
    ],
    colour:[
      '<path d="M24 4a10 10 0 1 0 6 16c-12 2-16-9-6-16Z" fill="#a6a8dc"/>',
      '<circle cx="21" cy="14" r="5.5" fill="#f4c65c"/><path d="M21 2v3m0 18v3M9 14h3m18 0h3M12 5l3 3m12 12 3 3m0-18-3 3M15 20l-3 3"/>',
      '<path d="M2 15q6-13 13-2t14 0q6-9 11-1"/>',
      '<path d="m2 18 5-14 3 17 6-12 5 15 3-21 6 16 3-12 7 7"/>'
    ],
    motion:[
      '<path d="M2 15q9-16 18 0t18 0"/>',
      '<path d="M2 15q3-13 6 0t6 0 6 0 6 0 6 0 6 0"/>',
      '<path d="M2 14h38"/>',
      '<path d="M2 14q5-21 9 0t9 0 9 0 9 0"/>'
    ],
    spin:[
      '<path d="M8 19q13-13 26 0"/><path d="m29 13 5 6-7 1"/>',
      '<path d="M3 19q6-9 12 0t12 0 12 0"/><path d="m34 14 5 5-7 1"/>',
      '<circle cx="21" cy="14" r="4" fill="currentColor"/>',
      '<path d="M11 15a10 8 0 1 0 5-8"/><path d="m12 3 5 4-5 4"/><circle cx="21" cy="15" r="3" fill="currentColor"/>'
    ]
  };
  function axis(room,from,to){
    const end=i=>'<span class="ks-end" data-end="'+i+'">'+svg(guideMarks[room][i],"0 0 42 28")+
      '<span>'+rooms[room].ends[i]+'</span></span>';
    return end(from)+'<i class="ks-ruler"><i></i></i>'+end(to);
  }
  let root=null,ui=null,mode="echo",held=null,frozen=false,compact=false;
  let controls,pad,puck,scene,trail,syncHistory,spinTimer=0,spinDepth=-1;
  const config=()=>rooms[mode];
  // Every strip of the band takes the same setting; the first one is read back for the picture's place.
  const strips=()=>[...new Set(App.KidsMusic.tracks)];
  const first=()=>App.P.rack.strips[App.KidsMusic.tracks[0]];
  const round=v=>Math.round(App.clamp(v,0,1)*1000)/1000;
  // The carousel turns from a quarter of a turn a second to six.
  const SPIN_LOW=.25,SPIN_RANGE=24,spinRate=x=>SPIN_LOW*SPIN_RANGE**x,spinX=r=>App.clamp(Math.log(r/SPIN_LOW)/Math.log(SPIN_RANGE),0,1);
  const spinRoute=s=>s.routes.find(r=>r.source==="lfo"&&r.target==="pan");
  // Where the picture stands in the present scene, 0–1 on each axis.
  function read(){
    const P=App.P,s=first();
    if(mode==="echo")return [App.toN(App.DEF.fx.mixDelay,P.fx.mixDelay),App.toN(App.DEF.fx.mixReverb,P.fx.mixReverb)];
    if(mode==="colour")return [1-(s.macros[1]||0),s.macros[0]||0];
    if(mode==="motion")return [s.macros[3]||0,s.macros[2]||0];
    const r=spinRoute(s);return [r?spinX(s.lfoRate):spinX(1),r?r.high:0];
  }
  const rest={echo:[0,0],colour:[1,0],motion:[0,0],spin:[spinX(1),0]};
  function atRest(){
    const [x,y]=read(),[rx,ry]=rest[mode];
    if(mode==="spin")return y<.001;
    if(mode==="echo" && ["dtime","dfb"].some(k=>App.P.fx[k]!==App.DEF.fx[k].def))return false;
    return Math.abs(x-rx)<.001 && Math.abs(y-ry)<.001;
  }
  function route(i){
    const strip=App.P.rack.strips[i];let changed=false;
    for(const [source,target,high,name] of config().routes||[]){
      if(strip.routes.some(r=>r.source===source && r.target===target) || strip.routes.length>=16)continue;
      strip.routes.push({source,target,low:0,high});strip.macroNames[Number(source.slice(-1))-1]=name;changed=true;
    }
    return changed;
  }
  // The carousel: each strip's LFO swings it from side to side and pulses its level. The wires are rebuilt only when
  // the depth changes (in tenths); the speed alone is a frequency the rack sets on its next sync.
  function spin(x,y){
    const depth=Math.round(y*10)/10,rate=+spinRate(x).toFixed(3);
    for(const i of strips()){
      const s=App.P.rack.strips[i];
      Object.assign(s,{lfoRate:rate,lfoBeats:0,lfoWave:"sine"});
      s.routes=s.routes.filter(r=>r.source!=="lfo" || (r.target!=="pan" && r.target!=="level"));
      if(depth>0 && s.routes.length<=14)s.routes.push({source:"lfo",target:"pan",low:-depth,high:depth},{source:"lfo",target:"level",low:-.55*depth,high:0});
    }
    clearTimeout(spinTimer);spinTimer=setTimeout(()=>App.E?.rack.sync(),depth!==spinDepth?0:40);spinDepth=depth;
  }
  function apply(x,y){
    const P=App.P,E=App.E;
    if(mode==="echo"){P.fx.mixDelay=App.fromN(App.DEF.fx.mixDelay,x);P.fx.mixReverb=App.fromN(App.DEF.fx.mixReverb,y);E?.syncFx();return;}
    if(mode==="spin"){spin(x,y);return;}
    let routed=false;for(const i of strips())routed=route(i)||routed;
    if(routed)E?.rack.sync();
    const [a,b,va,vb]=mode==="colour"?[1,0,1-x,y]:[3,2,x,y];
    for(const i of strips()){App.Rack.setMacro(i,a,va);App.Rack.setMacro(i,b,vb);}
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
  // While the picture is held, the sound last touched on the score plays through the effect, unless the band plays.
  function begin(x,y,id){
    if(held)return;
    const E=App.audio();if(!E)return;
    const part=ui.part(),row=ui.row(),i=App.KidsMusic.tracks[part];
    held={i,x,y,id,part,row,preview:!App.Seq.playing,repeatAt:null,note:null};
    apply(x,y);place(x,y);pad.classList.add("held");
    if(id==="drop")App.KidsMusic.audition(part,row);
    else if(held.preview){
      if(App.P.tracks[i].kind==="kit")auditionHit(held);
      else {held.note=App.KidsMusic.pitch(part,row);E.noteOn(i,held.note,.66,true);}
    }
    paint();
  }
  function auditionHit(g){
    const pd=App.P.tracks[g.i].kit.pads[App.KidsMusic.pitch(g.part,g.row)-36];
    const buffer=pd?.id && App.samples.get(pd.id)?.buffer;
    App.KidsMusic.audition(g.part,g.row);
    g.repeatAt=App.E.ctx.currentTime+Math.max(.2,30/App.P.bpm,buffer?.duration||0);
  }
  function move(x,y){
    if(!held)return;
    held.x=x;held.y=y;apply(x,y);place(x,y);
  }
  function release(){
    if(!held)return;
    const g=held;held=null;
    if(g.note!==null)App.E?.noteOff(g.i,g.note);
    if(mode==="spin"){clearTimeout(spinTimer);App.E?.rack.sync();}
    pad?.classList.remove("held");App.commit();ui?.paint();
  }
  function reset(){
    const [x,y]=rest[mode];
    if(mode==="echo"){for(const k of ["dtime","dfb"])App.P.fx[k]=App.DEF.fx[k].def;}
    apply(x,y);if(mode==="spin"){clearTimeout(spinTimer);App.E?.rack.sync();}
    App.commit();
  }
  function frame(){
    if(!root)return;
    if(held){if(held.repeatAt!==null && App.E.ctx.currentTime>=held.repeatAt)auditionHit(held);}
    else place(...read());
  }
  function paint(){
    if(!root)return;
    const el=a=>controls.querySelector('[data-sound="'+a+'"]');
    if(!puck.dataset.band){puck.dataset.band="1";puck.innerHTML=svg(marks.band);}
    for(const b of controls.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",String(b.dataset.mode===mode));
    const play=el("play"),playing=App.Seq.playing;
    if(play && play.dataset.playing!==String(playing)){const label=playing?"Zastavit":"Přehrát";play.innerHTML=face(playing?"stop":"play",label);play.dataset.playing=playing;play.setAttribute("aria-label",label);}
    const cfg=config();root.style.setProperty("--room",cfg.colour);pad.dataset.room=mode;
    pad.setAttribute("aria-label",cfg.label+" · celá kapela, celá písnička");
    if(scene.dataset.room!==mode){
      scene.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'+backdrops[mode]+'</svg>'+App.KidsPictures.effect(mode,true);
      controls.querySelector(".ks-axis-x").innerHTML=axis(mode,0,1);
      controls.querySelector(".ks-axis-y").innerHTML=axis(mode,3,2);
      const [left,right,down,up]=cfg.ends;
      pad.setAttribute("aria-description","Táhni obrázkem nebo použij šipky. Vlevo: "+left+". Vpravo: "+right+". Dole: "+down+". Nahoře: "+up+".");
      scene.dataset.room=mode;
    }
    el("reset").disabled=atRest();
    if(!compact){
      const freeze=el("freeze"),freezeName=frozen?"Rozhýbat obraz":"Zastavit obraz";
      freeze.setAttribute("aria-pressed",String(frozen));freeze.setAttribute("aria-label",freezeName);freeze.lastElementChild.textContent=freezeName;
      syncHistory();
      root.querySelector(".ks-echo-controls").hidden=mode!=="echo";
      for(const [action,choices,k] of [["time",[2,5,8],"dtime"],["repeat",[.18,.4,.63],"dfb"]]){
        const button=el(action),n=choices.reduce((a,b)=>Math.abs(b-App.P.fx[k])<Math.abs(a-App.P.fx[k])?b:a);
        button.dataset.level=choices.indexOf(n)+1;button.setAttribute("aria-label",button.lastElementChild.textContent+", stupeň "+button.dataset.level+" ze 3");
      }
      controls.querySelector(".ks-monitors").dataset.frozen=String(frozen);
    }
    frame();
  }
  function action(e){
    const b=e.target.closest("button[data-sound]");if(!b||b.disabled)return;
    release();
    switch(b.dataset.sound){
      case "back":ui.back();return;
      case "expand":ui.expand();return;
      case "mode":mode=b.dataset.mode;break;
      case "play":ui.play();break;
      case "freeze":frozen=!frozen;break;
      case "reset":reset();break;
      case "time":case "repeat":{
        const time=b.dataset.sound==="time",opts=time?[2,5,8]:[.18,.4,.63];
        App.P.fx[time?"dtime":"dfb"]=opts[+b.dataset.level%3];App.E?.syncFx();App.commit();break;
      }
    }
    ui.paint();
  }
  const modes='<div class="ks-modes" role="group" aria-label="Vyber efekt pro celou kapelu">'+Object.keys(rooms).map(m=>key("mode",rooms[m].label,m,'data-mode="'+m+'"')).join("")+'</div>';
  const surface='<div class="ks-stage"><div class="ks-instrument"><div class="ks-pad" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-sound="pad">'+
    '<div class="ks-scene"></div><div class="ks-trail"><i class="ks-puck ks-sound-token" aria-hidden="true"></i></div></div>'+
    '<div class="ks-axis ks-axis-y" aria-hidden="true"></div><div class="ks-axis ks-axis-x" aria-hidden="true"></div></div></div>';
  // What the room acts on is always the same: the whole band, the whole song. It is said, not chosen.
  const heading='<div class="ks-heading"><span class="ks-family">'+svg(marks.band)+'</span><span class="ks-target"><strong class="ks-target-name">Celá kapela</strong><small class="ks-scope-name">Celá písnička</small></span></div>';
  const restore=key("reset","Obnovit efekt","reset");
  const inlineFace='<div class="ks-shell">'+heading+modes+surface+'<div class="ks-inline-tools">'+restore+key("expand","Zvětšit","expand",'data-k="sound"')+'</div></div>';
  const fullFace='<div class="ks-shell"><header class="ks-head"><div class="ks-players">'+key("back","K rytmu","back")+heading+'</div>'+
    modes+'<div class="ks-transport">'+key("play","Přehrát","play")+'</div></header><div class="ks-body">'+surface+
    '<aside class="ks-monitors"><div class="ks-screen"><span>Zvuková vlna</span><canvas data-kid-screen="wave" role="img" aria-label="Živá zvuková vlna"></canvas></div><div class="ks-screen"><span>Hluboké a vysoké tóny</span><canvas data-kid-screen="bands" role="img" aria-label="Hluboké a vysoké tóny ve zvuku"></canvas></div>'+key("freeze","Zastavit obraz","freeze")+'</aside></div>'+
    '<footer class="ks-foot"><div class="ks-echo-controls">'+key("time","Rozestup ozvěn","time")+key("repeat","Počet ozvěn","repeat")+'</div><div class="ks-tools">'+restore+'</div></footer></div>';
  function open(host,api,options={}){
    detach();root=host;ui=api;compact=!!options.compact;
    if(compact)root.classList.add("ks-inline");
    else root.classList.add("kids-surface","ks-room");
    root.innerHTML=compact?inlineFace:fullFace;
    controls=root.firstElementChild;controls.addEventListener("click",action);
    if(!compact)syncHistory=App.KidsView.historyPair(controls.querySelector(".ks-tools"));
    pad=root.querySelector(".ks-pad");puck=root.querySelector(".ks-puck");scene=root.querySelector(".ks-scene");trail=root.querySelector(".ks-trail");
    pad.onpointerdown=e=>{if(e.button!==0||held)return;e.preventDefault();pad.focus({preventScroll:true});pad.setPointerCapture(e.pointerId);begin(...at(e),e.pointerId);};
    pad.onpointermove=e=>{if(held?.id===e.pointerId)move(...at(e));};
    pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{if(held?.id===e.pointerId)release();};
    pad.onkeydown=e=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();e.stopPropagation();
      if(held&&held.id!=="key")return;
      const [x,y]=held?[held.x,held.y]:read();
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
    root=null;ui=null;controls=null;syncHistory=null;pad=null;puck=null;scene=null;trail=null;
  }
  // A row picture dropped on the pad plays through the effect at the place where it lands.
  function dropPicture(row,clientX,clientY){
    if(!compact || !pad || held || pad.closest("[inert],[hidden]") || !Number.isInteger(row) || row<0 || row>=App.KidsMusic.rows)return;
    ui.selectRow(row);
    begin(...at({clientX,clientY}),"drop");
    release();
  }
  function close(){
    detach();mode="echo";frozen=false;
  }
  window.addEventListener("blur",release);
  App.KidsSound={open,close,paint,frame,release,dropPicture,read:()=>({mode,place:read()}),setMode:m=>{if(rooms[m]){mode=m;ui?.paint();}}};
})();
