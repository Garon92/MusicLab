/* A two-handed sound toy: coordinates are ordinary sends and rack macros,
   and a recorded journey lives in the same clip automation the console edits. */
(() => {
  "use strict";
  const rooms={
    echo:{label:"Ozvěna",keys:["dly","rev"],axes:["Ozvěna","Dozvuk"],ends:["Jednou","Ozvěny","Bez dozvuku","Doznívá"],colour:"#83d9cb"},
    colour:{label:"Ostrost",keys:["macro2","macro1"],axes:["Jas","Zkreslení"],ends:["Temný","Jasný","Čistý","Drsný"],colour:"#ffb36f",
      routes:[["macro2","tone",-1,"Shade"],["macro1","drive",.85,"Saturation"]]},
    motion:{label:"Chvění",keys:["macro4","macro3"],axes:["Rychlost","Síla chvění"],ends:["Pomalu","Rychle","Klid","Silně"],colour:"#bda8ec",
      routes:[["macro4","vibratoRate",1,"Vibrato speed"],["macro3","vibratoDepth",1,"Vibrato depth"]]},
    position:{label:"Poloha",keys:["pan","vol"],axes:["Poloha","Hlasitost"],ends:["Vlevo","Vpravo","Potichu","Nahlas"],colour:"#92c9e0"},
    balance:{label:"Barva",keys:["low","high"],axes:["Basy","Výšky"],ends:["Méně basů","Více basů","Méně výšek","Více výšek"],colour:"#f1cf7b"}
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
    motion:'<path d="M0 79q12-11 26 0t28-1 24 0 22-2v24H0Z" fill="#c9bbd9"/><path d="M0 88q11-4 22 0t23 0 24 0 18-1 13 0v13H0Z" fill="#afa4c5"/>'
  };
  // Each pair of pictures sits at the two ends of its own axis.
  const guideMarks={
    position:['<path d="M36 14H6l9-8m-9 8 9 8"/>','<path d="M6 14h30l-9-8m9 8-9 8"/>','<circle cx="20" cy="14" r="3" fill="currentColor"/>','<circle cx="14" cy="14" r="4" fill="currentColor"/><path d="M23 9q4 5 0 10m5-15q9 10 0 20"/>'],
    balance:['<path d="M2 15q9-5 18 0t18 0"/>','<path d="M2 15q9-20 18 0t18 0"/>','<path d="M2 15q3-5 6 0t6 0 6 0 6 0 6 0 6 0"/>','<path d="M2 15q3-18 6 0t6 0 6 0 6 0 6 0 6 0"/>'],
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
    ]
  };
  function axis(room,from,to){
    const end=i=>'<span class="ks-end" data-end="'+i+'">'+svg(guideMarks[room][i],"0 0 42 28")+
      '<span>'+rooms[room].ends[i]+'</span></span>';
    return end(from)+'<i class="ks-ruler"><i></i></i>'+end(to);
  }
  let root=null,ui=null,mode="echo",scope="family",held=null,armed=false,frozen=false,compact=false;
  let controls,pad,puck,path,scene,trail,syncHistory,oldBank=null;
  const config=()=>rooms[mode];
  const master=()=>scope==="master";
  const piece=()=>scope==="piece";
  const ti=()=>App.KidsMusic.tracks[ui.part()];
  const current=()=>App.Seq.now(ti());
  const bank=()=>ui.pattern();
  const keys=()=>master() && mode==="echo"?["mixDelay","mixReverb"]:config().keys;
  const values=(x,y)=>[mode==="colour"?1-x:x,y];
  const coords=([a,b])=>[mode==="colour"?1-a:a,b];
  const round=v=>Math.round(App.clamp(v,0,1)*1000)/1000;
  const masterRead=k=>App.toN(App.DEF.fx[k],App.P.fx[k]);
  function base(i,k){return master()?masterRead(k):App.curveBase(App.P.tracks[i],k);}
  function position(i){
    const c=current(),T=App.P.tracks[i],p=bank();
    return coords(keys().map(k=>piece()?App.curveValue(T.automation[p][k],c?.pat===p?c.step:0,base(i,k)):base(i,k)));
  }
  function audition(E,i,p){
    if(!root||App.Seq.playing)return;
    const T=App.P.tracks[i],now=E.ctx.currentTime;
    E.automate(i,T,lanes(i,p,T.automation[p]),0,now,now+.001);
  }
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
    const T=App.P.tracks[g.i],v=values(g.x,g.y),playing=piece()?current():null;
    keys().forEach((k,a)=>{
      if(master()){App.P.fx[k]=App.fromN(App.DEF.fx[k],v[a]);return;}
      if(piece() && !g.record && !g.temporary)T.automation[g.pattern][k]={mode:"step",points:[{s:0,v:v[a]}]};
      if(playing && playing.pat!==g.pattern)return;
      if(k.startsWith("macro")){
        const j=Number(k.slice(-1))-1;
        if(piece())App.E?.rack.macro(g.i,j,v[a]);
        else App.Rack.setMacro(g.i,j,v[a]);
      }
      else {
        const value=k==="pan"?v[a]*2-1:v[a];
        if(!piece())T[k]=value;
        const E=App.E;if(!E)return;
        const p=E.tracks[g.i].params[k],now=E.ctx.currentTime;p.cancelScheduledValues(now);p.setTargetAtTime(k==="pan"?value:value**2,now,.009);
      }
    });
    if(master())App.E?.syncFx();
    else if(piece() && App.E && !App.Seq.playing)audition(App.E,g.i,g.pattern);
  }
  function putPoint(lanes,k,s,v){
    const line=lanes[k]??={mode:"linear",points:[]},p=line.points.find(p=>p.s===s);
    if(p){p.v=v;p.shape="linear";delete p.in;}
    else {line.points.push({s,v,shape:"linear"});line.points.sort((a,b)=>a.s-b.s);}
  }
  function capture(){
    if(!held?.record)return;
    const c=current(),p=held.pattern;
    if(c && c.pat!==p)return;
    const s=App.clamp(Math.floor(c?.step??0),0,15);
    const v=values(held.x,held.y),stamp=p+"/"+s+"/"+v;
    if(held.stamp===stamp)return;held.stamp=stamp;
    const lanes=App.P.tracks[held.i].automation[p];
    config().keys.forEach((k,a)=>putPoint(lanes,k,s,v[a]));oldBank=null;
  }
  function lanes(i,p,stored){
    if(!held||held.i!==i||master()||(piece() && p!==held.pattern))return stored;
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
    const temporary=piece() && !armed && keys().some(k=>App.P.tracks[i].automation[bank()][k]?.points?.length>1);
    held={i,x,y,id,part,row,pattern:bank(),record:armed,temporary,preview:!(App.Seq.playing&&hasClip),repeatAt:null,note:null};
    if(!master())route(i);
    apply(held);capture();place(x,y);pad.classList.add("held");
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
    if(!master() && App.E)audition(App.E,g.i,g.pattern);
    pad?.classList.remove("held");if(!g.temporary)App.commit();oldBank=null;ui?.paint();
  }
  const scopedModes=()=>master()?["echo","balance"]:["echo","colour","motion","position"];
  function familyName(){
    return App.KidsMusic.tracks.flatMap((track,index)=>track===ti()?[App.KidsView.partLabel(index)]:[]).join(" + ");
  }
  function defaults(){
    if(master())return keys().map(k=>App.toN(App.DEF.fx[k],App.DEF.fx[k].def));
    const mix=App.KidsMusic.mixDefaults(ui.part());
    return keys().map(k=>k.startsWith("macro")?0:k==="pan"?(mix.pan+1)/2:mix[k]);
  }
  function reset(){
    const i=ti(),T=App.P.tracks[i],L=T.automation[bank()];
    if(piece()){
      for(const k of keys())delete L[k];
      if(App.E && !App.Seq.playing)audition(App.E,i,bank());
    }else{
      const [x,y]=coords(defaults());apply({i,x,y});
      if(master() && mode==="echo"){
        for(const k of ["dtime","dfb"])App.P.fx[k]=App.DEF.fx[k].def;
        App.E?.syncFx();
      }
    }
    armed=false;App.commit();oldBank=null;
  }
  function line(p){
    const i=ti(),lanes=App.P.tracks[i].automation[p],cfg=config();
    for(const b of controls.querySelectorAll("[data-mode]")){
      const room=rooms[b.dataset.mode],recorded=piece() && room.keys.some(k=>lanes[k]?.points?.length>1);
      b.classList.toggle("ks-recorded",recorded);
      b.setAttribute("aria-label",room.label+(recorded?", s nahraným pohybem":""));
    }
    const overridden=!master() && cfg.keys.some(k=>lanes[k]?.points?.length);
    const active=piece() && cfg.keys.some(k=>lanes[k]?.points?.length>1);
    if(active){
      const points=Array.from({length:65},(_,j)=>{
        const [x,y]=coords(cfg.keys.map(k=>App.curveValue(lanes[k],15*j/64,base(i,k))));
        return (x*1000).toFixed(1)+","+((1-y)*1000).toFixed(1);
      });
      path.setAttribute("points",points.join(" "));
    }else path.removeAttribute("points");
    const button=controls.querySelector('[data-sound="reset"]');
    button.disabled=piece()?!overridden:keys().every((k,a)=>Math.abs(base(i,k)-defaults()[a])<.001);
    if(master() && mode==="echo" && ["dtime","dfb"].some(k=>App.P.fx[k]!==App.DEF.fx[k].def))button.disabled=false;
    if(!compact)controls.querySelector('[data-sound="reverse"]').hidden=!active;
    const cue=controls.querySelector(".ks-cue");
    let message="";
    if(scope==="family" && overridden)message="Dílek "+"ABCD"[p]+" má vlastní efekt";
    if(piece() && active&&!App.P.tracks[i].clips[p].length)message="Přidej zvuk do rytmu";
    if(armed)message="Táhni a pusť";
    if(held)message=held.record?(current() && current().pat!==p?"Čekám na dílek "+"ABCD"[p]:"Nahrávám pohyb"):"";
    if(cue.dataset.message!==message){
      cue.dataset.message=message;cue.lastElementChild.textContent=message;
      cue.hidden=!message;cue.classList.toggle("ks-gesture-cue",armed);
    }
    oldBank=p;
  }
  function frame(_,levels){
    if(!root)return;
    if(levels)controls.querySelector(".ks-family").style.setProperty("--amplitude",levels[ui.part()]||0);
    const p=bank();
    if(held){
      capture();
      if(held.repeatAt!==null && App.E.ctx.currentTime>=held.repeatAt)auditionHit(held);
    }else{
      place(...position(ti()));
    }
    if(oldBank!==p)line(p);
  }
  function paint(){
    if(!root)return;
    const el=a=>controls.querySelector('[data-sound="'+a+'"]');
    const part=ui.part(),row=ui.row(),costume=App.KidsMusic.costumes(App.P)[part]||0;
    const family=controls.querySelector(".ks-family");
    if(family && family.dataset.source!==part+"."+costume){
      family.innerHTML=App.KidsView.character(part,costume);
      family.dataset.source=part+"."+costume;
    }
    const familyTitle=familyName(),pieceName="Dílek "+"ABCD"[bank()],scopeText=master()?"Všechny sady":piece()?pieceName:"Všechny dílky";
    controls.querySelector(".ks-target-name").textContent=master()?"Celá kapela":familyTitle;
    controls.querySelector(".ks-scope-name").textContent=scopeText;
    const summary=controls.querySelector(".ks-scope summary");summary.setAttribute("aria-label","Kde působí efekt: "+(master()?"Celá kapela":familyTitle+", "+scopeText));
    for(const b of controls.querySelectorAll("[data-scope]")){
      const where=b.dataset.scope;
      b.querySelector("strong").textContent=where==="master"?"Celá kapela":familyTitle;
      b.querySelector("small").textContent=where==="family"?"Všechny dílky":where==="piece"?"Jen "+pieceName.toLowerCase():"Všechny sady i dílky";
      b.setAttribute("aria-pressed",String(scope===where));
    }
    const sound=master()?"band":part+"."+row;
    if(puck.dataset.soundId!==sound){
      puck.dataset.soundId=sound;puck.innerHTML=master()?svg(marks.band):App.KidsView.rowArt(part,row);
    }
    for(const b of controls.querySelectorAll("[data-mode]")){
      b.hidden=!scopedModes().includes(b.dataset.mode);b.setAttribute("aria-pressed",String(b.dataset.mode===mode));
    }
    root.classList.toggle("ks-master",master());
    const play=el("play"),playing=App.Seq.playing;
    if(play && play.dataset.playing!==String(playing)){const label=playing?"Zastavit":"Přehrát";play.innerHTML=face(playing?"stop":"play",label);play.dataset.playing=playing;play.setAttribute("aria-label",label);}
    const arm=el("arm"),armState=held?.record?"recording":armed?"armed":"idle";
    arm.hidden=master();
    if(arm.dataset.state!==armState){
      const name=armState==="idle"?"Nahrát pohyb":armState==="armed"?"Zrušit nahrávání":"Ukončit záznam";
      arm.innerHTML=face(armState==="idle"?"arm":"stop",name);
      arm.dataset.state=armState;arm.setAttribute("aria-label",name);arm.setAttribute("aria-pressed",String(armed));
    }
    const cfg=config();root.style.setProperty("--room",cfg.colour);pad.dataset.room=mode;
    pad.setAttribute("aria-label",cfg.label+" · "+summary.getAttribute("aria-label")+", poslech: "+App.KidsView.rowLabel(part,row));
    if(scene.dataset.room!==mode){
      scene.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'+(backdrops[mode]||backdrops.motion)+'</svg>'+
        (marks[mode]?'':App.KidsPictures.effect(mode,true));
      controls.querySelector(".ks-axis-x").innerHTML=axis(mode,0,1);
      controls.querySelector(".ks-axis-y").innerHTML=axis(mode,3,2);
      const [left,right,down,up]=cfg.ends;
      pad.setAttribute("aria-description","Táhni obrázkem nebo použij šipky. Vlevo: "+left+". Vpravo: "+right+". Dole: "+down+". Nahoře: "+up+".");
      scene.dataset.room=mode;
    }
    if(!compact){
      const freeze=el("freeze"),freezeName=frozen?"Rozhýbat obraz":"Zastavit obraz";
      freeze.setAttribute("aria-pressed",String(frozen));freeze.setAttribute("aria-label",freezeName);freeze.lastElementChild.textContent=freezeName;
      syncHistory();
      root.querySelector(".ks-echo-controls").hidden=!master()||mode!=="echo";
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
      case "part":{
        const menu=b.closest("details");menu.open=false;menu.querySelector("summary").focus({preventScroll:true});
        App.Kids.dispatch("track",(ui.part()+1)%App.KidsMusic.tracks.length);break;
      }
      case "mode":mode=b.dataset.mode;break;
      case "scope":{
        scope=b.dataset.scope;armed=false;
        if(!scopedModes().includes(mode))mode="echo";
        const menu=b.closest("details");menu.open=false;menu.querySelector("summary").focus({preventScroll:true});break;
      }
      case "play":ui.play();break;
      case "arm":scope="piece";armed=!wasArmed;break;
      case "freeze":frozen=!frozen;break;
      case "reset":reset();break;
      case "reverse":{
        const i=ti(),L=App.P.tracks[i].automation[bank()];
        for(const k of config().keys){
          if(!L[k]?.points?.length)continue;
          const old=L[k];
          L[k]={mode:"linear",points:Array.from({length:16},(_,s)=>({s,v:round(App.curveValue(old,15-s,base(i,k)))}))};
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
  const surface='<div class="ks-stage"><div class="ks-instrument"><div class="ks-pad" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-sound="pad">'+
    '<div class="ks-scene"></div><div class="ks-cue">'+svg(marks.drag)+'<span></span></div><div class="ks-trail"><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">'+
    '<polyline fill="none" stroke="#39475d" stroke-width="3.5" stroke-dasharray="4 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/></svg>'+
    '<i class="ks-puck ks-sound-token" aria-hidden="true"></i></div></div><div class="ks-axis ks-axis-y" aria-hidden="true"></div><div class="ks-axis ks-axis-x" aria-hidden="true"></div></div></div>';
  const target=expanded=>'<details class="ks-scope"><summary class="kv-button"><span class="ks-family"></span><span class="ks-target"><strong class="ks-target-name"></strong><small class="ks-scope-name"></small></span>'+svg(marks.scope)+'</summary><div class="ks-scope-list">'+
    ["family","piece","master"].map((s,i)=>'<button type="button" class="kv-button" data-sound="scope" data-scope="'+s+'">'+svg([marks.repeat,marks.expand,marks.band][i])+'<span><strong></strong><small></small></span></button>').join("")+
    (expanded?'<button type="button" class="kv-button" data-sound="part">'+svg(marks.band)+'<strong>Další sada</strong></button>':'')+'</div></details>';
  const restore=key("reset","Obnovit efekt","reset");
  const inlineFace='<div class="ks-shell">'+target(false)+modes+surface+
    '<div class="ks-inline-tools">'+record+restore+key("expand","Zvětšit","expand",'data-k="sound"')+'</div></div>';
  const fullFace='<div class="ks-shell"><header class="ks-head"><div class="ks-players">'+key("back","K rytmu","back")+target(true)+'</div>'+
    modes+'<div class="ks-transport">'+key("play","Přehrát","play")+record+'</div></header><div class="ks-body">'+surface+
    '<aside class="ks-monitors"><div class="ks-screen"><span>Zvuková vlna</span><canvas data-kid-screen="wave" role="img" aria-label="Živá zvuková vlna"></canvas></div><div class="ks-screen"><span>Hluboké a vysoké tóny</span><canvas data-kid-screen="bands" role="img" aria-label="Hluboké a vysoké tóny ve zvuku"></canvas></div>'+key("freeze","Zastavit obraz","freeze")+'</aside></div>'+
    '<footer class="ks-foot"><div class="ks-echo-controls">'+key("time","Rozestup ozvěn","time")+key("repeat","Počet ozvěn","repeat")+'</div><div class="ks-tools">'+key("reverse","Obrátit pohyb","reverse")+restore+'</div></footer></div>';
  let events;
  function open(host,api,options={}){
    detach();root=host;ui=api;compact=!!options.compact;
    if(compact)root.classList.add("ks-inline");
    else root.classList.add("kids-surface","ks-room");
    root.innerHTML=compact?inlineFace:fullFace;
    controls=root.firstElementChild;controls.addEventListener("click",action);
    if(!compact)syncHistory=App.KidsView.historyPair(controls.querySelector(".ks-tools"));
    events=new AbortController();
    const details=controls.querySelector(".ks-scope"),summary=details.querySelector("summary");
    document.addEventListener("pointerdown",e=>{if(!details.contains(e.target))details.open=false;},{capture:true,signal:events.signal});
    details.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&details.open){e.preventDefault();e.stopPropagation();details.open=false;summary.focus();}
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();e.stopPropagation();details.open=true;
        const choices=Array.from(details.querySelectorAll("button")),i=choices.indexOf(e.target);
        (i<0?details.querySelector('[aria-pressed="true"]'):choices[(i+(e.key==="ArrowDown"?1:choices.length-1))%choices.length]).focus();
      }
      if(e.code==="Space")e.stopPropagation();
    });
    details.addEventListener("focusout",e=>{if(e.relatedTarget&&!details.contains(e.relatedTarget))details.open=false;});
    pad=root.querySelector(".ks-pad");puck=root.querySelector(".ks-puck");scene=root.querySelector(".ks-scene");
    trail=root.querySelector(".ks-trail");path=trail.querySelector("polyline");
    pad.onpointerdown=e=>{if(e.button!==0||held)return;e.preventDefault();pad.focus({preventScroll:true});pad.setPointerCapture(e.pointerId);begin(...at(e),e.pointerId);};
    pad.onpointermove=e=>{if(held?.id===e.pointerId)move(...at(e));};
    pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{if(held?.id===e.pointerId)release();};
    pad.onkeydown=e=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();e.stopPropagation();
      if(held&&held.id!=="key")return;
      const [x,y]=held?[held.x,held.y]:position(ti());
      const d=e.shiftKey ? .02 : .1,xx=round(x+(e.key==="ArrowRight"?d:e.key==="ArrowLeft"?-d:0)),yy=round(y+(e.key==="ArrowUp"?d:e.key==="ArrowDown"?-d:0));
      if(held)move(xx,yy);else begin(xx,yy,"key");
    };
    pad.onkeyup=pad.onblur=()=>{if(held?.id==="key")release();};
    paint();
    if(!compact)controls.querySelector("button").focus({preventScroll:true});
  }
  function detach(){
    if(!root)return;
    events.abort();
    release();root.classList.remove("kids-surface","ks-room","ks-inline");root.replaceChildren();
    root=null;ui=null;controls=null;syncHistory=null;pad=null;puck=null;path=null;scene=null;trail=null;
    oldBank=null;
  }
  function dropPicture(row,clientX,clientY){
    if(!compact || !pad || held || pad.closest("[inert],[hidden]") || !Number.isInteger(row) || row<0 || row>=App.KidsMusic.grid(App.P,ui.part(),ui.pattern()).length)return;
    ui.selectRow(row);
    begin(...at({clientX,clientY}),"drop");
    release();
  }
  function close(){
    detach();mode="echo";scope="family";armed=false;frozen=false;
  }
  window.addEventListener("blur",release);
  App.KidsSound={open,close,paint,frame,release,lanes,dropPicture,audition};
})();
