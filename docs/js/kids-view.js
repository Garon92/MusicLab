/* The illustrated instrument. Sound, projects and transport live in the controller. */
(() => {
  "use strict";
  const colour=["#ef9980","#b0b5e9","#eac565","#8bceb7","#acd28c","#b1c7e8","#efb589","#9ad4d1","#8fc295","#efafba","#dec08c","#aba9df"];
  const parts=["Drums","Bass","Melody","Voice",...App.KidsWorld.groups.map(g=>g.name)];
  const partLabels=["Bubny","Basa","Melodie","Hlas",...App.KidsWorld.groups.map(g=>g.label)];
  const partLabel=i=>partLabels[i];
  const soundLabels=Object.fromEntries(App.KidsWorld.groups.flatMap(g=>g.sounds.map(s=>[s.id,s.label])));
  const patterns=["Slunce","Měsíc","List","Drak"];
  const letter=i=>String.fromCharCode(65+i);
  const ink="#23303b";
  const symbols={
    play:'<path d="M11 6Q10 5 10 8v24q0 3 3 1l19-12q2-1 0-3Z" fill="currentColor" stroke-linejoin="round"/>',
    stop:'<rect x="8.5" y="8.5" width="23" height="23" rx="4" fill="currentColor"/>',
    dice:'<g transform="rotate(-10 20 20)"><rect x="6" y="6" width="28" height="28" rx="6"/><g fill="currentColor" stroke="none"><circle cx="13" cy="13" r="2.6"/><circle cx="27" cy="13" r="2.6"/><circle cx="20" cy="20" r="2.6"/><circle cx="13" cy="27" r="2.6"/><circle cx="27" cy="27" r="2.6"/></g></g>',
    mic:'<rect x="15" y="4" width="10" height="21" rx="5" fill="currentColor"/><path d="M10 18a10 10 0 0 0 20 0M20 29v6m-6 0h12"/>',
    undo:'<path d="M15 8 6 17l9 8M8 17h13c8 0 12 4 12 10 0 4-2 6-4 8"/>',
    erase:'<path d="m8 24 15-16a3 3 0 0 1 4 0l6 6a3 3 0 0 1 0 4L18 33h-6l-5-5a3 3 0 0 1 1-4Z"/><path d="m14 18 12 11M21 33h14"/>',
    star:'<path d="m20 4 5 10 11 2-8 8 1.5 11L20 30l-10 5 2-11-8-8 11-2Z" fill="currentColor"/>',
    shelf:'<path d="M8 11V6h24v5M5 16v-5h30v5"/><rect x="4" y="16" width="32" height="20" rx="4"/><path d="M23 28V20l6 1"/><ellipse cx="20" cy="29" rx="3" ry="2" fill="currentColor"/>',
    keep:'<path d="M5 24h7l3 5h10l3-5h7v10H5Z"/><path d="M20 5v17m-7-7 7 7 7-7"/>',
    sheet:'<path d="M8 4h17l7 7v24H8Zm16 0v9h8M12 19h15m-15 5h15m-15 5h10"/>',
    trash:'<path d="M7 11h26M16 10V6h8v4M10 13l2 21h16l2-21M16 17l1 12m7-12-1 12"/>',
    chain:'<rect x="2" y="8" width="11" height="11" rx="3"/><rect x="27" y="8" width="11" height="11" rx="3"/><rect x="15" y="25" width="11" height="11" rx="3"/><path d="M13 13h7c4 0 5 5 2 8l-2 4"/>',
    loop:'<path d="M9 13a12 12 0 0 1 22 5M31 27a12 12 0 0 1-22-5M31 9v9h-9M9 31v-9h8"/>',
    song:'<g stroke-width="2.2"><path d="M2 9q9-3 18 1 9-4 18-1v23q-9-3-18 1-9-4-18-1Z" fill="#81bda7"/><path d="M4 6q8-2 16 3 8-5 16-3v22q-8-2-16 2-8-4-16-2Z" fill="#fff2c8"/><path d="M20 9v21M12 20v-7l4 1m11 6v-7l5-1v7"/><g fill="currentColor" stroke="none"><ellipse cx="10" cy="20" rx="2.6" ry="2.2"/><ellipse cx="25" cy="20" rx="2.6" ry="2.2"/><ellipse cx="30" cy="19" rx="2.6" ry="2.2"/></g></g>',
    lock:'<rect x="9" y="17" width="22" height="17" rx="2"/><path d="M14 17v-5a6 6 0 0 1 12 0v5M20 24v4"/>',
    back:'<path d="m23 8-12 12 12 12M12 20h22"/>',
    next:'<path d="m15 9 11 11-11 11"/>',
    prev:'<path d="M25 9 14 20l11 11"/>',
    plus:'<path d="M20 7v26M7 20h26"/>',
    minus:'<path d="M8 20h24"/>',
    newSong:'<path d="M8 31V8h16l6 6v5M23 8v7h7M27 22v12m-6-6h12"/><circle cx="13" cy="28" r="4" fill="currentColor"/><path d="M17 27V17"/>',
    wave:'<path d="M4 20h4l3-8 5 17 5-23 5 26 4-14 2 2h4"/>',
    record:'<circle cx="20" cy="20" r="10" fill="currentColor"/>',
    sound:'<path d="M5 11q7-10 16-6m-13 9q4-6 11-5m-7 9q2-3 6-3m4 16-7-8q-2-3 0-4 2-1 4 1l2 2-4-10q-1-3 2-4 2 0 3 3l4 9 4-2 4 4 1 6-5 6Z" fill="none"/>',
    spark:'<path d="M20 3q1 14 15 17-14 2-15 17Q18 23 5 20 18 16 20 3Z" fill="currentColor"/>',
    warn:'<path d="m20 5 16 29H4Zm0 9v8"/><circle cx="20" cy="28" r="1" fill="currentColor"/>',
    check:'<path d="m6 20 10 10 18-21"/>',
    drum:'<ellipse cx="20" cy="14" rx="14" ry="6"/><path d="M6 14v14c8 7 21 7 28 0V14M11 21l4 9 6-10 6 9 4-10"/>',
    bass:'<path d="m19 22 12-15 3 2-12 15c2 5 1 8-2 10-5 3-11-1-12-5-1-5 3-10 7-8Z"/><circle cx="17" cy="26" r="2"/><path d="m29 9 4 3"/>',
    melody:'<path d="m4 23 23-5 6 6-23 7ZM9 23l6 6m1-7 5 6m0-7 5 5M12 14l12-5"/><circle cx="10" cy="15" r="3" fill="currentColor"/>',
    rename:'<path d="m8 32 3-9L27 7l6 6-16 16Z" fill="#f4c65c"/><path d="m24 10 6 6M8 32l9-3"/><path d="M21 34h12"/>',
    download:'<path d="M20 5v19m-8-8 8 8 8-8"/><path d="M6 26v7h28v-7"/>',
    share:'<circle cx="11" cy="20" r="5" fill="#8bceb7"/><circle cx="29" cy="10" r="5" fill="#f2a58b"/><circle cx="29" cy="30" r="5" fill="#b0b5e9"/><path d="m15.5 17.5 9-5m-9 10 9 5"/>',
    pads:'<rect x="5" y="5" width="12" height="12" rx="3"/><rect x="23" y="5" width="12" height="12" rx="3"/><rect x="5" y="23" width="12" height="12" rx="3"/><rect x="23" y="23" width="12" height="12" rx="3"/>',
    stage:'<path d="M3 6h34v4H3Z" fill="#d9614e"/><path d="M4 10v24q7-3 9-12 1-7-2-12Zm32 0v24q-7-3-9-12-1-7 2-12Z" fill="#e9795e"/><path d="M3 34h34" stroke-width="3"/><g fill="currentColor" stroke="none"><circle cx="15" cy="24" r="3"/><circle cx="20" cy="20.5" r="3.2"/><circle cx="25" cy="24" r="3"/><path d="M11 33q0-6 4-6t4 6Zm5 0q0-8 4-8t4 8Zm5 0q0-6 4-6t4 6Z"/></g>',
    notes:'<rect x="4" y="6" width="32" height="28" rx="5"/><path d="M4 15h32M4 25h32M15 6v28M25 6v28" stroke-width="1.6"/><circle cx="10" cy="20" r="3" fill="currentColor"/><circle cx="20" cy="10.5" r="3" fill="currentColor"/><circle cx="30" cy="29.5" r="3" fill="currentColor"/>'
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
    '<path d="M21 2 33 14 21 29 9 14Z" fill="currentColor" stroke="none"/><path d="M21 3v25M10 14h22" stroke="#fff6df" stroke-width="1.6"/><path d="M21 29q-5 3-1 6t-3 5" stroke-width="2"/><path d="m15 31 4 2-4 2Zm8 4-4 1.6 4 1.6Z" fill="currentColor" stroke="none"/>'
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
  let suggestedBeat,suggestionTimer;
  function clearSuggestion(){
    clearTimeout(suggestionTimer);suggestedBeat?.classList.remove("kv-suggested-beat");suggestedBeat=null;
  }
  let partButtons=[],pads=[],cells=[],patternButtons=[],lights=[],chainSlots=[],pageKind="",pageTrack=0,chainPage=0,chainIndex=-1,dialogSignature="",lastFocus=null,lastStep=-1,lastPlayPattern=-1,lastFeedback,toastTimer;
  let mainButtons={},lastFrame={},lockJobs=new Set();
  // The band on stage: everyone with notes in what PLAY plays (this piece or the whole song). Each hops on its own notes.
  let stage,stageFloor,stageRiser,stageOn=false,stageMembers=new Map(),stageKeys=[],stageList=[],lastBeat="",lastResting="";
  const stageSize=new ResizeObserver(()=>{if(stageOn&&stageList.length)App.KidsStage.arrange(stageFloor,stageList,stageRiser);});
  // The sound up close: a tap on the header's screens swaps the notes for eight screens (kids-scopes.js draws seven).
  let scopes,bandMeter,scopesOn=false;
  const SCREENS=[["scope","Vlna","Zvuková vlna zblízka"],["spectrum","Hloubky a výšky","Hluboké a vysoké tóny ve zvuku"],["waterfall","Vodopád","Hluboké a vysoké tóny v čase, nové vpravo"],["keys","Tóny","Které tóny zní, na klávesách"],
    ["rhythm","Rytmus","Jak silně zní každá z osmi dob dílku"],["loudness","Síla zvuku","Jak silně kapela hrála v posledních vteřinách"],["stereo","Vlevo a vpravo","Odkud zvuk zní, zleva nebo zprava"],["band","Kdo hraje","Jak nahlas hraje každý hudebník a sada"]];
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  const memberKey=(part,row)=>part<4?String(part):part+":"+row;
  // A picture plays its note: a squash, a hop and back, in the time of one beat.
  function bop(el,height=11){
    if(!el?.animate)return;
    const beat=60/(App.KidsMusic.tempos[model?.tempo??1]||100)/2,duration=App.clamp(beat*900,140,320);
    el.getAnimations?.().forEach(a=>{if(a.id==="kv-bop")a.cancel();});
    const a=el.animate(reduced.matches?[{filter:"brightness(1.3)"},{filter:"none"}]:[
      {transform:"translateY(0) scale(1,1)"},{transform:"translateY(3%) scale(1.08,.9)",offset:.18},
      {transform:"translateY(-"+height+"%) scale(.95,1.07)",offset:.5},{transform:"translateY(0) scale(1,1)"}],{duration,easing:"ease-out"});
    a.id="kv-bop";
  }
  // A note that rises from a member on stage as it plays.
  function sing(member,part){
    if(reduced.matches||!member)return;
    const note=element("i","kv-sung",member);note.style.setProperty("--note",colour[part]);note.style.left=(30+Math.random()*40)+"%";
    note.innerHTML=svg('<path d="M15 29V8l12-3v18" fill="none"/><ellipse cx="11" cy="29" rx="5" ry="4" fill="var(--note)"/><ellipse cx="23" cy="24" rx="5" ry="4" fill="var(--note)"/>');
    note.animate([{opacity:0,transform:"translate(-50%,0) scale(.6)"},{opacity:1,transform:"translate(-50%,-30%) scale(1)",offset:.2},{opacity:0,transform:"translate(-50%,-160%) scale(.9) rotate(12deg)"}],{duration:900,easing:"ease-out"}).onfinish=()=>note.remove();
  }
  // What the middle of the desk shows: the notes (""), the band on stage or the screens up close.
  function showView(next){
    const was=stageOn?"stage":scopesOn?"scopes":"";
    if(!model||next===was)return;
    if(next&&model.armed)call("disarm");
    stageOn=next==="stage";scopesOn=next==="scopes";lastResting="";
    const main=host.querySelector(".kv-main");main.classList.toggle("kv-show-stage",stageOn);main.classList.toggle("kv-show-scopes",scopesOn);
    stage.hidden=!stageOn;scopes.hidden=!scopesOn;
    render(model);if(stageOn&&stageList.length)App.KidsStage.arrange(stageFloor,stageList,stageRiser);
    (stageOn?stage.querySelector(".kv-member,[data-k=stageBack]"):was==="stage"&&!next?mainButtons.stage:null)?.focus({preventScroll:true});
  }
  const toggleStage=on=>showView(on?"stage":"");
  function renderStage(state){
    const b=mainButtons.stage,away=stageOn||scopesOn,goal=away?"notes":"stage";
    if(b.dataset.goal!==goal){
      b.dataset.goal=goal;setIcon(b,goal);caption(b,away?"Noty":"Kapela");
      label(b,away?"Zpět k notám":"Kapela: kdo hraje, ten skáče");
    }
    pressed(mainButtons.scopes,scopesOn);
    if(scopesOn)renderScopes(state);
    if(!stageOn)return;
    // This piece, or every piece of the song when PLAY plays the song.
    const scope=state.song&&state.chain.length?[...new Set(state.chain)]:[state.pattern],found=new Map();
    for(const p of scope)for(const beat of state.hits[p])for(const [part,row] of beat){const key=memberKey(part,row);if(!found.has(key))found.set(key,[part,row]);}
    const list=[...found.entries()].sort((a,b)=>a[1][0]-b[1][0]||a[1][1]-b[1][1]);
    stageKeys=state.hits.map(beats=>new Set(beats.flat().map(([part,row])=>memberKey(part,row))));
    const signature=list.map(([k])=>k).join(",")+"|"+(state.costumes||[]).join(",");
    stage.querySelector(".kv-stage-scope").textContent=state.song&&state.chain.length?"Celá písnička":"Dílek "+letter(state.pattern);
    stage.classList.toggle("grooving",!!state.playing);stage.style.setProperty("--groove",(60/(App.KidsMusic.tempos[state.tempo]||100)).toFixed(3)+"s");
    if(stage.dataset.members===signature)return;
    stage.dataset.members=signature;stageMembers.clear();stageFloor.replaceChildren();lastResting="";stageList=[];
    stage.classList.toggle("empty",!list.length);
    stageRiser=element("i","kv-stage-riser",stageFloor);stageRiser.setAttribute("aria-hidden","true");
    for(const [key,[part,row]] of list){
      const sound=part>=4?App.KidsWorld.groups[part-4].sounds[row]:null,name=sound?sound.label:partLabel(part);
      const picture=sound?App.KidsPictures.sound(sound.id):character(part,state.costumes?.[part]||0);
      const m=button(stageFloor,"Zahrát: "+name,"member",'<span class="kv-member-figure">'+picture+'</span><span class="kv-member-name">'+name+'</span>',()=>{
        call("hear",part,part<4?2:row);App.KidsStage.act(m,part,row,.3);sing(m,part);
      },"kv-member"+(part<4?" kv-member-musician":""));
      m.dataset.key=key;m.style.setProperty("--part",colour[part]);stageMembers.set(key,m);stageList.push({key,part,el:m});
    }
    App.KidsStage.arrange(stageFloor,stageList,stageRiser);
  }
  // Who plays: everyone with notes in what PLAY plays, the four musicians when nobody has any yet.
  function renderScopes(state){
    const scope=state.song&&state.chain.length?[...new Set(state.chain)]:[state.pattern],found=new Set();
    for(const p of scope)for(const beat of state.hits[p])for(const [part] of beat)found.add(part);
    const list=found.size?[...found].sort((a,b)=>a-b):[0,1,2,3],signature=list.join(",")+"|"+(state.costumes||[]).join(",");
    if(bandMeter.dataset.parts===signature)return;
    bandMeter.dataset.parts=signature;bandMeter.style.setProperty("--count",list.length);
    bandMeter.innerHTML=list.map(i=>'<span class="kv-band-voice" data-part="'+i+'" style="--part:'+colour[i]+'"><span class="kv-band-bar"><i></i></span><span class="kv-band-face">'+character(i,state.costumes?.[i]||0)+'</span></span>').join("");
    label(bandMeter,"Kdo hraje: "+list.map(partLabel).join(", "));
  }
  // Called on every beat that passes while PLAY runs: everyone with a note on it hops, wherever they are shown.
  function beatHits(pattern,beat){
    const hits=model.hits?.[pattern]?.[beat]||[],parts=new Set();
    const together=new Set();
    for(const [part,row] of hits){
      parts.add(part);
      if(stageOn){const m=stageMembers.get(memberKey(part,row));if(m){App.KidsStage.act(m,part,row,60/(App.KidsMusic.tempos[model.tempo]||100)/2);sing(m,part);together.add(memberKey(part,row));}}
      else if(part===model.track&&pattern===model.pattern){bop(pads[row]?.querySelector(".kv-row-picture"),10);bop(cells[row]?.[beat]?.querySelector(".kv-note-image"),8);}
    }
    if(!stageOn)for(const part of parts)bop(partButtons[part]?.querySelector(".kv-character-wrap"),7);
    else if(together.size>1)App.KidsStage.beat(stage,stageMembers,together); // some meetings make a little scene
  }
  const stops=()=>{for(const cancel of [...lockJobs])cancel();};
  const call=(action,...args)=>send?.(action,...args);
  function button(parent,label,key,html,act,cls=""){
    const b=element("button","kv-button "+cls,parent);b.type="button";b.dataset.k=key;b.setAttribute("aria-label",label);b.innerHTML=html;
    if(act)b.addEventListener("click",act);
    return b;
  }
  function label(el,text){el.setAttribute("aria-label",text);}
  function caption(el,text){
    let strip=el.querySelector(":scope > .kv-caption");
    if(!strip){strip=element("span","kv-caption",el);el.classList.add("kv-captioned");}
    if(strip.textContent!==text)strip.textContent=text;
    return el;
  }
  function historyPair(parent){
    const pair=element("div","kv-history",parent);pair.setAttribute("role","group");label(pair,"Historie úprav písničky");
    const step=(action,name,hint,shortcuts)=>{
      const b=caption(button(pair,hint,action,icon("undo"),()=>call(action)),name);
      b.setAttribute("aria-keyshortcuts",shortcuts);
      return b;
    };
    const undo=step("undo","Zpět","Zpět o jednu úpravu","Control+Z Meta+Z");
    const redo=step("redo","Vpřed","Vpřed o jednu úpravu","Control+Shift+Z Meta+Shift+Z Control+Y");
    const sync=()=>{undo.disabled=!model?.canUndo;redo.disabled=!model?.canRedo;};
    sync();return sync;
  }
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
    return ()=>{
      if(!active || done || lastInput!=="pointer")return false;
      done=true;cancel();return true;
    };
  }
  // A button that needs a hold shakes when it is only tapped.
  function nudge(b){
    if(reduced.matches||!b?.animate)return;
    b.animate([{transform:"rotate(0)"},{transform:"rotate(-6deg)"},{transform:"rotate(5deg)"},{transform:"rotate(-3deg)"},{transform:"rotate(0)"}],{duration:380,easing:"ease-out"});
  }
  function setIcon(b,name){
    if(b.dataset.icon===name)return;
    b.querySelector(":scope > svg")?.remove();b.insertAdjacentHTML("afterbegin",icon(name));b.dataset.icon=name;
  }
  function flash(type,subject){
    if(!host||!type||pageKind==="shelf"||pageKind==="replace")return;
    const messages={linked:["share","Písnička z odkazu je otevřená"],kept:["shelf","Rozdělaná písnička je na poličce"],saved:["star","Písnička uložena"],restored:["shelf","Písnička je zpátky"],recorded:["mic","Hlas nahrán"],error:["warn","Akce se nepovedla"],micError:["mic","Mikrofon není dostupný"],quiet:["mic","Nebyl slyšet žádný hlas"]};
    const [mark,message]=type==="erased"?["erase","Vymazáno · "+subject]:messages[type]||["check","Hotovo"];
    toast.innerHTML=icon(mark);element("span","",toast).textContent=message;toast.classList.toggle("bad",["error","micError","quiet"].includes(type));toast.classList.remove("visible");
    void toast.offsetWidth;toast.classList.add("visible");clearTimeout(toastTimer);
    const bad=["error","micError","quiet"].includes(type);toast.classList.toggle("long",bad||type==="kept");
    toastTimer=setTimeout(()=>toast?.classList.remove("visible"),bad||type==="kept"?3200:1000);
  }
  function show(kind,trigger){
    if(!model)return;
    if(model.armed)call("disarm");
    clearSuggestion();
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
    caption(button(top,"Zpátky k hudbě","back",icon("back"),closePanel,"kv-dark"),"Zpátky");
    const sign=element("div","kv-sign",top);sign.innerHTML=icon(graphic);
    element("h2","kv-sheet-title",top).textContent=name;
    const hardware=element("span","kv-slots",top);hardware.setAttribute("aria-hidden","true");
    return element("div","kv-sheet-body",modal);
  }
  function sleeve(i,item){
    const motif=Array.isArray(item?.motif)?item.motif.slice(0,8):[];
    const bars=motif.map(v=>'<i style="--hit:'+Math.max(0,Math.min(1,(Number(v)||0)/4))+'"></i>').join("");
    const pictures=item.sounds.map(sound=>typeof sound==="string"?App.KidsPictures.sound(sound):character(sound,item.costumes[sound])).join("");
    return '<span class="kv-sleeve" aria-hidden="true" style="--sleeve:'+colour[i]+'"><span class="kv-disc"></span><span class="kv-cover"><span class="kv-cover-pictures">'+(pictures||icon("sheet"))+'</span><span class="kv-song-print">'+bars+'</span></span></span>';
  }
  let replaceAt=-1,replaceTarget=null;
  function songAction(parent,text,key,picture,action,cls=""){
    return button(parent,text,key,icon(picture)+'<span>'+text+'</span>',action,"kv-song-action "+cls);
  }
  function shelfPanel(shelf){
    const replace=pageKind==="replace";
    const inner=makeHeader(replace?"Vyber písničku k přepsání":"Moje písničky","shelf");
    const actions=element("div","kv-song-actions",inner);
    const firstFree=shelf.findIndex(item=>!item);
    if(replace){
      songAction(actions,"Zrušit","cancelReplace","back",()=>{pageKind="shelf";renderPanel();modal.querySelector('[data-k="save"]').focus();});
      if(replaceAt>=0 && replaceTarget===shelf[replaceAt]){
        songAction(actions,"Přepsat písničku "+(replaceAt+1),"confirmReplace","keep",()=>{
          if(call("saveTo",replaceAt,replaceTarget)){pageKind="shelf";renderPanel();modal.querySelector('[data-k="save"]').focus();}
        },"kv-save");
      }
    }else{
      songAction(actions,model.slot>=0?"Uložit změny":"Uložit písničku","save","keep",()=>{
        if(model.slot>=0 || firstFree>=0){call("save");return;}
        replaceAt=-1;replaceTarget=null;pageKind="replace";renderPanel();modal.querySelector('[data-k="slot"]')?.focus();
      },"kv-save");
      songAction(actions,"Nová písnička","new","newSong",()=>{if(call("new"))closePanel();});
      // The open song: its name, its sound as a file, and a link that opens it anywhere.
      const status=()=>modal.querySelector(".kv-song-status");
      songAction(actions,"Přejmenovat","rename","rename",()=>renameRow(inner,status),"kv-rename-song");
      const down=songAction(actions,"Stáhnout","download","download",async()=>{
        down.disabled=true;status().textContent="Připravuji zvuk…";
        try{const file=await call("download");status().textContent="Staženo: "+file;}catch{status().textContent="Stažení se nepovedlo.";}
        finally{if(down.isConnected)down.disabled=false;}
      },"kv-download-song");
      label(down,"Stáhnout písničku jako zvuk");
      const share=songAction(actions,"Sdílet","share","share",async()=>{
        const got=await call("share");if(!got)return;
        const s=status();s.replaceChildren();
        element("span","",s).textContent=got.copied?"Odkaz je zkopírovaný. Kdo ho otevře, uslyší tuhle písničku (bez nahraného hlasu).":"Zkopíruj si odkaz:";
        if(!got.copied){const field=element("input","kv-share-link",s);field.readOnly=true;field.value=got.link;label(field,"Odkaz na písničku");field.select();}
      },"kv-share-song");
      label(share,"Sdílet písničku odkazem");
      if(model.lastRemoval>=0){
        const index=model.lastRemoval;
        const restore=songAction(actions,"Vrátit smazání","restoreSlot","undo",()=>{
          if(call("restoreRemoval",index))modal.querySelector('[data-k="slot"][data-index="'+index+'"]')?.focus();
        },"kv-restore-song");
        label(restore,"Vrátit smazání písničky "+(index+1));
      }
    }
    const count=element("span","kv-saved-count",modal.querySelector(".kv-sheet-title"));
    count.textContent=shelf.filter(Boolean).length+" / 8";
    const list=element("div","kv-shelf-grid",inner);
    for(const [i,item] of shelf.entries()){
      if(!item)continue;
      const card=element("div","kv-song-card",list),number="Písnička "+(i+1);
      const names=item.sounds.map(sound=>typeof sound==="string"?soundLabels[sound]:partLabel(sound));
      const custom=item.name && !["POCKET BAND","UNTITLED"].includes(item.name);
      const title=custom?item.name:names.map((name,index)=>index?name.toLocaleLowerCase("cs"):name).join(" a ");
      const name=title?number+" · "+title:number;
      card.classList.toggle("kv-current-song",model.slot===i);
      const b=button(card,(replace?"Vybrat k přepsání: ":"Otevřít: ")+name,"slot",sleeve(i,item),null,"kv-slot filled");
      b.dataset.index=i;pressed(b,replace?replaceAt===i:model.slot===i);
      const info=element("span","kv-song-info",b);
      element("strong","",info).textContent=title?(i+1)+" · "+title:number;
      element("span","",info).textContent=replace?"Vybrat":model.slot===i?"Otevřít znovu":"Otevřít";
      if(replace){b.onclick=()=>{replaceAt=i;replaceTarget=item;renderPanel();modal.querySelector('[data-k="confirmReplace"]')?.focus();};}
      else{
        hold(b,2000,()=>{if(call("load",i))closePanel();},()=>{closePanel();call("import",i);});
        const trash=songAction(card,"Smazat","removeSlot","trash",null,"kv-remove-song");
        hold(trash,1200,()=>{nudge(trash);const s=modal.querySelector(".kv-song-status");if(s)s.textContent="Podrž Smazat, až se kruh zaplní.";},()=>{
          if(call("removeSlot",i,item))modal.querySelector('[data-k="restoreSlot"]')?.focus();
        });
        trash.dataset.index=i;label(trash,"Smazat: "+name+" · podržet");
      }
    }
    if(!list.childElementCount){
      const empty=element("div","kv-empty-book",list);
      empty.innerHTML=icon("shelf")+'<span>Zatím tu není žádná písnička.</span>';
    }
    const status=element("div","kv-song-status",inner);
    status.setAttribute("role","status");
    updateShelfStatus(status);
  }
  // A name typed in place: Enter or Hotovo keeps it, Escape or Zrušit leaves the old one.
  function renameRow(inner,status){
    if(inner.querySelector(".kv-rename-row"))return;
    const row=element("div","kv-rename-row",inner),field=element("input","kv-rename-field",row);
    inner.insertBefore(row,inner.querySelector(".kv-shelf-grid"));
    Object.assign(field,{type:"text",maxLength:28,placeholder:"Název písničky",value:["POCKET BAND","UNTITLED"].includes(App.P.name)?"":App.P.name});label(field,"Název písničky");
    const done=()=>{const name=field.value.trim();if(!name){field.focus();return;}row.remove();if(call("rename",name))status().textContent="Písnička se jmenuje "+name.toUpperCase().slice(0,28)+".";};
    const cancel=()=>{row.remove();modal.querySelector('[data-k="rename"]')?.focus({preventScroll:true});};
    caption(button(row,"Uložit název","renameDone",icon("check"),done,"kv-save"),"Hotovo");
    caption(button(row,"Zrušit přejmenování","renameCancel",icon("back"),cancel),"Zrušit");
    field.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();done();}else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cancel();}else e.stopPropagation();});
    field.focus();
  }
  function updateShelfStatus(status){
    let next="";
    if(model.feedback==="error")next="Písničky se nepodařilo změnit.";
    else if(model.feedback==="restored")next="Písnička je zpátky.";
    else if(model.feedback==="saved" && model.slot>=0)next="Písnička "+(model.slot+1)+" je uložená.";
    else if(model.lastRemoval>=0)next="Písnička "+(model.lastRemoval+1)+" je smazaná.";
    if(status.textContent!==next)status.textContent=next;
  }
  function renderPanel(){
    if(!pageKind || !model)return;
    const previous=modal.contains(document.activeElement)?{k:document.activeElement.dataset.k,index:document.activeElement.dataset.index,row:document.activeElement.dataset.row}:null;
    const chain=model.chain||[],shelf=model.shelf||[];
    const onShelf=pageKind==="shelf"||pageKind==="replace";
    let signature=pageKind;
    if(pageKind==="wardrobe")signature+=pageTrack+"."+model.costumes?.[pageTrack];
    if(onShelf)signature+=[shelf.map(item=>item?.revision||0).join(","),model.slot,model.lastRemoval,replaceAt,replaceTarget?.revision].join(".");
    if(dialogSignature===signature){
      if(onShelf)updateShelfStatus(modal.querySelector(".kv-song-status"));
      return;
    }
    dialogSignature=signature;chainSlots=[];
    if(pageKind==="wardrobe"){
      const inner=makeHeader("Zvuky nástroje · "+App.KidsView.partLabel(pageTrack),"spark"),list=element("div","kv-costumes",inner);
      for(let i=0;i<4;i++){
        const b=button(list,App.KidsView.partLabel(pageTrack)+", zvuk "+(i+1),"costume",character(pageTrack,i),()=>{call("costume",pageTrack,i);closePanel();},"kv-costume");
        b.dataset.index=i;b.style.setProperty("--part",colour[pageTrack]);pressed(b,model.costumes?.[pageTrack]===i);
      }
    }else if(onShelf){
      shelfPanel(shelf);
    }
    if(previous?.k){
      const target=Array.from(modal.querySelectorAll("[data-k]")).find(b=>b.dataset.k===previous.k && b.dataset.index===previous.index && b.dataset.row===previous.row && !b.disabled);
      (target||modal.querySelector('[data-k="restoreSlot"]')||modal.querySelector('[data-k="save"]'))?.focus({preventScroll:true});
    }
  }
  function movePiece(from,to){
    const c=(model.chain||[]).slice();if(c[from]===undefined||to<0||to>=c.length||to===from)return;
    const [p]=c.splice(from,1);c.splice(to,0,p);chainIndex=to;chainPage=Math.floor(to/8);call("chain",c);
  }
  function removePiece(index){
    const chain=model.chain.slice();
    if(!Number.isInteger(index) || index<0 || index>=chain.length)return;
    chain.splice(index,1);
    if(chainIndex>index)chainIndex--;
    else if(chainIndex===index)chainIndex=Math.min(index,chain.length-1);
    call("chain",chain);
  }
  function insertPiece(pattern,at){
    const chain=model.chain.slice();
    if(chain.length>=32 || at<0 || at>chain.length)return;
    chain.splice(at,0,pattern);chainIndex=at;chainPage=Math.floor(at/8);call("chain",chain);
  }
  const drumNames=["Hi-hat","Clap","Snare","Kick","Open hat","Tom"],pitches=["highest","high","upper middle","lower middle","low","lowest"];
  const drumDrawings=[
    '<path d="M6 15q14-6 28 0-14 3-28 0Z" fill="#f4cb68"/><path d="M6 17q14 6 28 0-14-3-28 0Z" fill="#f4cb68"/><path d="M20 5v10m0 3v16m-7 3 7-3 7 3"/>',
    '<path d="M6 26 4 16q0-3 2-3l3 8-2-13q1-3 3-1l4 12-2-14q1-3 3-1l5 14-2-11q2-2 4 1l4 13 4-4q4-3 5 1l-5 12q-6 9-15 6Z" fill="#edb887"/><path d="m27 5-1 4m7-2-3 5m7 1-4 3"/>',
    '<path d="M5 18q15-6 30-1v12q-14 7-30 0Z" fill="#d58d78"/><ellipse cx="20" cy="17" rx="15" ry="5" fill="#f6e7bb"/><path d="m8 22 3 8 5-9 5 10 6-10 4 7M23 5l-5 9m13-6-8 7"/>',
    '<ellipse cx="31" cy="19" rx="6" ry="13" fill="#9c6f5d"/><path d="M19 6h12v26H19Z" fill="#bb8a77" stroke="none"/><path d="M19 6h12M19 32h12"/><ellipse cx="19" cy="19" rx="7" ry="13" fill="#f7e1ac"/><path d="M4 37h9l-1-3H5Z" fill="#aabdc0"/><path d="m7 34 4-12"/><circle cx="11.5" cy="20.5" r="2.8" fill="#273a40" stroke="none"/><path d="m22 32-2 5m11-5 2 5"/>',
    '<path d="M4 17q16-8 32-1-15 6-32 1Z" fill="#e6b75e"/><ellipse cx="20" cy="13.6" rx="3" ry="1.6" fill="#c9952f" stroke-width="1.6"/><path d="M20 17v17m-7 3 7-3 7 3"/><path d="m30 6 3-3m1 8 4-1M8 7 5 4" stroke-width="2"/>',
    '<path d="M7 11q12-6 26 0l-2 19q-11 6-22-1Z" fill="#82b7ad"/><ellipse cx="20" cy="12" rx="13" ry="5" fill="#fff0ce"/><path d="m10 18 4 11 5-11 5 12 6-12M24 6l9-5"/>'
  ];
  function rowName(part,row){
    if(part>=4)return App.KidsWorld.groups[part-4].sounds[row].name;
    return part===0?drumNames[row]:parts[part]+" "+pitches[row];
  }
  function rowLabel(part,row){
    if(part>=4)return soundLabels[App.KidsWorld.groups[part-4].sounds[row].id];
    return (part===0?["Hi-hat","Tlesk","Bubínek","Kopák","Činel","Tom"]:["Nejvýš","Vysoko","Trochu výš","Trochu níž","Nízko","Nejníž"])[row];
  }
  function rowArt(part,row){
    if(part>=4)return App.KidsPictures.sound(App.KidsWorld.groups[part-4].sounds[row].id);
    if(part===0)return svg(drumDrawings[row]);
    const n=App.KidsMusic.rows,mine=n-1-row,bars=Array.from({length:n},(_,i)=>{
      const x=3+i*5.8,y=36-(i+1)*4.3,on=i===mine;
      return '<rect x="'+x+'" y="'+y+'" width="4.8" height="'+(36-y)+'" rx="1.6" fill="'+(on?colour[part]:"#c9cfc4")+'" stroke="'+(on?ink:"none")+'" stroke-width="1.5"/>';
    }).join(""),x=3+mine*5.8+2.4,top=36-(mine+1)*4.3-4.6;
    const note='<ellipse cx="'+x+'" cy="'+top+'" rx="3.3" ry="2.7" fill="'+ink+'" stroke="none"/><path d="M'+(x+3)+' '+top+'v-9" stroke="'+ink+'" stroke-width="1.8"/>';
    return svg('<g transform="translate(1 1) scale(.42)" stroke-width="3.4">'+symbols[["","bass","melody","mic"][part]]+'</g>'+bars+note);
  }
  // A screen in the header; the header's screens together are the button that opens them up close.
  function scope(parent,type){
    const monitor=element("span","kv-monitor kv-monitor-"+type,parent),face=element("span","kv-glass",monitor);
    const cv=element("canvas","",face);cv.dataset.kidScreen=type;cv.setAttribute("aria-hidden","true");
    return monitor;
  }
  function dismissTools(e){
    const open=deck?.querySelector(".kv-header-menu[open]");
    if(open&&!open.contains(e.target))open.open=false;
  }
  function headerMenu(parent,key,name,cls){
    const details=element("details","kv-header-menu "+cls,parent);details.name="kids-header";
    const trigger=element("summary","kv-button",details);trigger.dataset.k=key;label(trigger,name);
    const tray=element("div","kv-menu-tray",details);tray.setAttribute("role","group");label(tray,name);
    function close(){
      details.open=false;trigger.focus({preventScroll:true});
    }
    details.addEventListener("focusout",e=>{if(e.relatedTarget&&!details.contains(e.relatedTarget))details.open=false;});
    details.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&details.open){e.preventDefault();e.stopPropagation();close();return;}
      if(e.code==="Space"){e.stopPropagation();return;}
      if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
      e.preventDefault();e.stopPropagation();details.open=true;
      const choices=Array.from(tray.querySelectorAll("button:not(:disabled)")),i=choices.indexOf(e.target);
      if(!choices.length)return;
      const first=choices.find(b=>b.getAttribute("aria-pressed")==="true")||choices[e.key==="ArrowDown"?0:choices.length-1];
      (i<0?first:choices[(i+(e.key==="ArrowDown"?1:-1)+choices.length)%choices.length]).focus({preventScroll:true});
    });
    return {trigger,tray,close};
  }
  function playbackMenu(parent){
    const {trigger,tray,close}=headerMenu(parent,"song","Co přehrát","kv-play-menu");
    mainButtons.song=trigger;trigger.classList.add("kv-play-scope");
    mainButtons.scopeDisplay=element("span","kv-scope-choice",trigger);mainButtons.scopeDisplay.setAttribute("aria-hidden","true");
    for(const [key,whole] of [["songPiece",false],["songAll",true]]){
      const text=whole?"Celá písnička":"Dílek A";
      const b=button(tray,text,key,whole?icon("song"):patternIcon(0),()=>{
        close();if(!!model.song!==whole)call("song",whole);
      },"kv-menu-choice");
      caption(b,text);mainButtons[key]=b;
    }
  }
  function rhythmTools(header){
    const {trigger,tray,close}=headerMenu(header,"rhythmTools","Upravit rytmus","kv-rhythm-tools");
    mainButtons.rhythm=trigger;trigger.classList.add("kv-rhythm-trigger");
    trigger.innerHTML=icon("pads");caption(trigger,"Rytmus");
    mainButtons.editScope=element("strong","kv-edit-scope",tray);
    function act(k){close();call(k);}
    armButton=button(tray,"Hrát na obrázky","arm",icon("record"),()=>{
      act("arm");if(model.armed)mainButtons.finish.focus({preventScroll:true});
    },"kv-arm kv-captioned");
    const text=element("span","kv-caption",armButton);
    element("strong","",text).textContent="Hrát na obrázky";
    mainButtons.tapHint=element("small","",text);
    caption(button(tray,"Vylosovat rytmus","random",icon("dice"),()=>act("random"),"kv-random"),"Vylosovat rytmus");
    mainButtons.finish=caption(button(header,"Dokončit zápis tónů","finishTaps",icon("check"),()=>{
      call("disarm");trigger.focus({preventScroll:true});
    },"kv-rhythm-finish"),"Hotovo");
  }
  function eraser(header){
    const {trigger,tray,close}=headerMenu(header,"eraser","Vymazat noty","kv-eraser-tools");
    trigger.innerHTML=icon("erase");caption(trigger,"Guma");
    mainButtons.eraseScope=element("strong","kv-edit-scope",tray);
    for(const [action,scope] of [["eraseRow","Jeden řádek"],["erase","Celý nástroj"],["erasePiece","Všechny sady i nástroje"],["eraseSourceInBand","Ve všech čtyřech dílcích"]]){
      const b=button(tray,scope,action,"",()=>{
        const name=b.querySelector("strong").textContent;
        close();call(action);flash("erased",name);
      },"kv-erase kv-captioned");
      const desc=element("span","kv-caption",b);
      element("strong","",desc);element("small","",desc).textContent=scope;
      mainButtons[action]=b;
    }
  }
  function eraseTarget(b,identity,picture,name,description,available){
    if(b.dataset.target!==identity){
      b.dataset.target=identity;b.querySelector("svg")?.remove();b.insertAdjacentHTML("afterbegin",picture());
      b.querySelector("strong").textContent=name;
    }
    label(b,description);b.disabled=!available;
  }
  function mount(container,dispatch){
    if(host)unmount();
    host=container;send=dispatch;host.classList.add("kids-surface");host.setAttribute("aria-label","Dětská hudební laboratoř");host.lang="cs";
    deck=element("div","kv-shell",host);
    const header=element("header","kv-header",deck);
    const transport=element("div","kv-transport",header);
    play=caption(button(transport,"Přehrát","play",icon("play"),()=>call("play"),"kv-play"),"Přehrát");
    mainButtons={};
    playbackMenu(transport);
    const tempoBox=element("div","kv-tempo",transport);
    tempoBox.innerHTML='<div class="kv-tempo-track"><i></i><i></i><i></i><i></i></div><div class="kv-tempo-thumb"></div>';
    thumb=tempoBox.querySelector(".kv-tempo-thumb");
    element("span","kv-tempo-name",tempoBox).textContent="Rychlost";
    tempo=element("input","kv-tempo-input",tempoBox);tempo.type="range";tempo.min=0;tempo.max=3;tempo.step=1;tempo.dataset.k="tempo";label(tempo,"Rychlost přehrávání");
    tempo.oninput=()=>{if(+tempo.value!==model.tempo)call("tempo",+tempo.value);};
    // Master volume: the same kind of slider as the speed, a speaker with more waves the louder it plays.
    const volumeBox=element("div","kv-tempo kv-volume",transport);
    volumeBox.innerHTML='<div class="kv-tempo-track"><i></i><i></i><i></i><i></i><i></i></div><div class="kv-tempo-thumb"></div>';
    mainButtons.volumeThumb=volumeBox.querySelector(".kv-tempo-thumb");
    element("span","kv-tempo-name",volumeBox).textContent="Hlasitost";
    mainButtons.volume=element("input","kv-tempo-input",volumeBox);Object.assign(mainButtons.volume,{type:"range",min:0,max:4,step:1});mainButtons.volume.dataset.k="volume";label(mainButtons.volume,"Hlasitost");
    mainButtons.volume.oninput=()=>{if(+mainButtons.volume.value!==model.volume)call("volume",+mainButtons.volume.value);};
    recordButton=mainButtons.mic=caption(button(transport,"Nahrát hlas","mic",icon("mic"),()=>call("mic"),"kv-mic"),"Nahrát hlas");
    const editTools=element("div","kv-edit-tools",header);
    rhythmTools(editTools);eraser(editTools);
    const output=mainButtons.scopes=element("button","kv-output",header);output.type="button";output.dataset.k="scopes";
    label(output,"Zvuk zblízka: osm obrazovek");output.addEventListener("click",()=>showView(scopesOn?"":"scopes"));
    scope(output,"wave");scope(output,"bands");
    const group=element("div","kv-utilities",header);
    mainButtons.syncHistory=historyPair(group);
    mainButtons.shelf=caption(button(group,"Moje písničky","shelf",icon("shelf"),e=>show("shelf",e.currentTarget),"kv-shelf"),"Písničky");
    const lock=caption(button(group,"Pro rodiče: podržet dvě sekundy pro návrat do studia","lock",icon("lock"),null,"kv-lock"),"Rodiče");
    element("span","kv-lock-time",lock).textContent="2 s";hold(lock,2000,()=>nudge(lock),()=>call("exit"));
    const main=element("main","kv-main",deck),sources=element("div","kv-sources",main);
    sources.setAttribute("role","group");label(sources,"Výběr sady zvuků nebo hudebníka");
    for(const heading of ["Sady","Hudebníci"])element("span","kv-sources-title",sources).textContent=heading;
    partButtons=[];
    for(const i of [4,8,0,5,9,1,6,10,2,7,11,3]){
      const b=button(sources,(i>=4?"Vybrat sadu: ":"Vybrat nástroj: ")+partLabel(i),"track",'<span class="kv-character-wrap"></span><span class="kv-source-title">'+partLabel(i)+'</span><span class="kv-source-print" aria-hidden="true">'+ '<i></i>'.repeat(8)+'</span><i class="kv-source-lamp"></i>',null,"kv-musician");
      b.dataset.index=i;b.style.setProperty("--part",colour[i]);
      if(i<4)hold(b,900,()=>call("track",i),()=>{pageTrack=i;show("wardrobe",b);});
      else b.addEventListener("click",()=>call("track",i));
      partButtons[i]=b;
    }
    board=element("div","kv-board",main);board.setAttribute("role","group");
    const headerRow=element("div","kv-score-head",board);headerRow.setAttribute("aria-hidden","true");
    const sourceTag=element("div","kv-board-title",headerRow);
    element("span","kv-board-cover",sourceTag);
    element("strong","kv-board-name",sourceTag);
    const beats=element("div","kv-beats",headerRow);lights=[];
    for(let c=0;c<8;c++){const tick=element("i",c%2?"":"major",beats);tick.textContent=c+1;lights.push(tick);}
    const score=element("div","kv-score",board);cells=[];pads=[];
    for(let row=0;row<App.KidsMusic.rows;row++){
      const lane=element("div","kv-lane",score);
      const pad=button(lane,"Přehrát zvuk "+(row+1),"pad",'<span class="kv-row-picture"></span><span class="kv-pad-name"></span><i class="kv-pad-lamp"></i>',null,"kv-row-pad");
      pad.dataset.row=row;pads.push(pad);
      const hit=()=>{
        call("pad",row);
        pad.classList.remove("hit");
        void pad.offsetWidth;
        pad.classList.add("hit");
        if(!model.playing && !model.patternMotifs[model.pattern].some(Boolean)){
          suggestedBeat=cells[row][0];
          suggestedBeat.classList.add("kv-suggested-beat");
          suggestionTimer=setTimeout(clearSuggestion,2500);
        }
      };
      pad.addEventListener("pointerdown",e=>{if(e.button===0)hit();});
      pad.addEventListener("click",e=>{if(!e.detail)hit();});
      const notes=element("div","kv-step-keys",lane);cells[row]=[];
      for(let c=0;c<8;c++){
        const b=button(notes,"Políčko "+(c+1),"note",'<span class="kv-socket"><i class="kv-idle-dot"></i><span class="kv-note-image"></span></span>',null,"kv-cell");
        b.dataset.row=row;b.dataset.col=c;
        b.liftNote=hold(b,900,()=>call("note",row,c),()=>call("expression",row,c));cells[row].push(b);
      }
    }
    const effects=element("aside","kv-effects",main);effects.id="kids-inline-sound";label(effects,"Efekty zvuku");
    stage=element("section","kv-stage",main);stage.hidden=true;label(stage,"Kapela na pódiu");
    element("div","kv-stage-valance",stage).setAttribute("aria-hidden","true");
    element("span","kv-stage-scope",stage).setAttribute("aria-hidden","true");
    stageFloor=element("div","kv-stage-floor",stage);stageSize.observe(stageFloor);
    const waiting=element("div","kv-stage-empty",stage);
    waiting.innerHTML='<span class="kv-stage-chairs">'+svg('<path d="M10 40V22h14v18M10 30h14M44 40V22h14v18M44 30h14M78 40V22h14v18M78 30h14" stroke-width="2.6"/><path d="M7 22h20M41 22h20M75 22h20" stroke-width="3.4"/>',"0 0 102 44")+'</span><strong>Kapela čeká na noty</strong>';
    caption(button(waiting,"Zpět k notám","stageBack",icon("notes"),()=>toggleStage(false),"kv-captioned"),"K notám");
    scopes=element("section","kv-scopes",main);scopes.hidden=true;label(scopes,"Zvuk zblízka");
    for(const [type,name,description] of SCREENS){
      const cell=element("figure","kv-scope kv-scope-"+type,scopes),face=element("div","kv-glass",cell);
      if(type==="band"){bandMeter=element("div","kv-band-meter",face);bandMeter.setAttribute("role","img");}
      else{const cv=element("canvas","",face);cv.dataset.kidScreen=type;cv.setAttribute("role","img");label(cv,description);}
      element("figcaption","",cell).textContent=name;
    }
    const foot=element("footer","kv-bottom",deck);
    const bank=element("div","kv-patterns",foot);bank.setAttribute("role","group");label(bank,"Dílky písničky");element("strong","kv-foot-label",bank).textContent="Dílky písničky";patternButtons=[];
    for(let i=0;i<4;i++){
      const b=button(bank,"Dílek "+letter(i)+" · "+patterns[i],"pattern",patternIcon(i)+'<span class="kv-pattern-letter">'+letter(i)+'</span><span class="kv-pattern-print" aria-hidden="true">'+ '<i></i>'.repeat(8)+'</span>',()=>call("pattern",i),"kv-pattern");
      b.dataset.index=i;b.style.setProperty("--piece",colour[i]);patternButtons.push(b);
    }
    const song=element("div","kv-song-strip",foot);
    chainPreview=element("div","kv-arrange",song);chainPreview.dataset.k="arrange";chainPreview.setAttribute("role","group");
    // The order of the song is set here, by dragging: a piece from A–D onto the strip, a picture along it, one off it.
    element("span","kv-chain-name",chainPreview).textContent="Pořadí dílků";
    const sequence=element("div","kv-sequence",chainPreview);
    element("span","kv-chain-print",sequence).setAttribute("aria-hidden","true");
    mainButtons.append=button(sequence,"Přidat dílek","appendSlot",icon("plus"),()=>insertPiece(model.pattern,model.chain.length),"kv-chain-add");
    // A tap on a place in the song brings that piece onto the board.
    chainPreview.addEventListener("click",e=>{const t=e.target.closest(".kv-chain-print i");if(t)call("pattern",+t.dataset.pattern);});
    // The band: beside the pieces and the song it plays, and still there while the stage is shown.
    mainButtons.stage=button(foot,"Kapela","stage","",()=>showView(stageOn||scopesOn?"":"stage"),"kv-captioned kv-stage-toggle");
    element("span","kv-caption",mainButtons.stage);
    modal=element("section","kv-sheet",host);modal.hidden=true;modal.setAttribute("role","region");
    toast=element("div","kv-flash",host);toast.setAttribute("role","status");
    host.addEventListener("keydown",keys);host.addEventListener("pointerdown",dismissTools,true);window.addEventListener("blur",stops);window.addEventListener("keydown",historyKey);
    return host;
  }
  function historyKey(e){
    // Escape leaves the stage wherever the focus is, as long as nothing else on the page takes the key first.
    if(model && e.key==="Escape" && !e.defaultPrevented && !document.querySelector("dialog[open]")){
      if(pageKind){e.preventDefault();closePanel();return;}
      if(stageOn||scopesOn){e.preventDefault();showView("");return;}
    }
    if(!model || e.defaultPrevented || e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey))return;
    if(e.target.closest?.('textarea,input:not([type="range"]),[contenteditable="true"]'))return;
    const key=e.key.toLowerCase();
    if(key!=="z" && !(key==="y" && e.ctrlKey && !e.shiftKey))return;
    e.preventDefault();
    if(!e.repeat && !pageKind)call(key==="y"||e.shiftKey?"redo":"undo");
  }
  function keys(e){
    if(!host?.contains(e.target))return;
    if(e.key==="Escape"&&pageKind){e.preventDefault();e.stopPropagation();closePanel();}
    else if(e.key==="Escape"&&(stageOn||scopesOn)){e.preventDefault();e.stopPropagation();showView("");}
    else if(e.key==="Escape"&&model?.armed){e.preventDefault();e.stopPropagation();call("disarm");mainButtons.rhythm.focus({preventScroll:true});}
  }
  function render(state){
    if(!host||!state)return;clearSuggestion();model=state;
    host.style.setProperty("--part",colour[state.track]||colour[0]);
    const frameTrack=state.track||0;
    const costume=state.costumes?.[frameTrack]||0,boardSource=frameTrack+"."+costume;
    if(board.dataset.source!==boardSource){
      board.dataset.source=boardSource;
      board.querySelector(".kv-board-cover").innerHTML=character(frameTrack,costume);
      board.querySelector(".kv-board-name").textContent=partLabel(frameTrack);
      label(board,partLabel(frameTrack)+", poslech zvuků a jejich rytmus");
    }
    const playText=state.playing?"Zastavit":"Přehrát";
    play.dataset.active=!!state.playing;setIcon(play,state.playing?"stop":"play");label(play,playText);caption(play,playText);pressed(play,state.playing);
    tempo.value=state.tempo??1;tempo.parentElement.style.setProperty("--tempo",tempo.value);
    if(thumb.dataset.speed!==tempo.value){
      thumb.dataset.speed=tempo.value;thumb.innerHTML=App.KidsPictures.tempo(+tempo.value);
      const name=["Šnek","Želva","Zajíc","Raketa"][+tempo.value],bpm=App.KidsMusic.tempos[+tempo.value];
      tempo.setAttribute("aria-valuetext",name+", "+bpm+" úderů za minutu");
    }
    const vol=state.volume??4,volumeInput=mainButtons.volume;
    volumeInput.value=vol;volumeInput.parentElement.style.setProperty("--tempo",vol);
    if(mainButtons.volumeThumb.dataset.level!==String(vol)){
      mainButtons.volumeThumb.dataset.level=vol;volumeInput.setAttribute("aria-valuetext",["Potichu","Tišeji","Středně","Hlasitěji","Nahlas"][vol]);
      const waves=["M25 16q3 4 0 8","M29 12q6 8 0 16","M33 8q9 12 0 24"].slice(0,[0,1,2,3,3][vol]).join("");
      mainButtons.volumeThumb.innerHTML=svg('<path d="M5 15h6l8-7v24l-8-7H5Z" fill="#273a40" stroke="none"/>'+(waves?'<path d="'+waves+'" stroke-width="'+(vol===4?3.4:2.6)+'"/>':""));
    }
    const micText={pending:"Zrušit žádost",recording:"Ukončit nahrávání",saving:"Ukládám hlas"}[state.micState]||"Nahrát hlas";
    pressed(recordButton,state.micState==="recording");recordButton.classList.toggle("recording",state.micState==="recording");label(recordButton,micText);
    caption(recordButton,{pending:"Zrušit",recording:"Zastavit",saving:"Ukládám"}[state.micState]||"Nahrát hlas");recordButton.classList.toggle("has-voice",!!state.hasVoice);
    mainButtons.syncHistory();
    mainButtons.mic.disabled=state.micState==="saving";
    const scopeName=App.KidsView.partLabel(frameTrack)+" · dílek "+letter(state.pattern);
    if(mainButtons.editScope.textContent!==scopeName)mainButtons.editScope.textContent=scopeName;
    const pieceName="Dílek "+letter(state.pattern),piece=mainButtons.songPiece;
    if(piece.dataset.pattern!==String(state.pattern)){
      piece.dataset.pattern=state.pattern;piece.style.setProperty("--piece",colour[state.pattern]);
      piece.innerHTML=patternIcon(state.pattern);caption(piece,pieceName);label(piece,pieceName);
    }
    pressed(piece,!state.song);pressed(mainButtons.songAll,state.song);
    mainButtons.songAll.disabled=!state.chain.length;
    mainButtons.songAll.title=state.chain.length?"":"Nejdřív přidej dílek do písničky.";
    const display=mainButtons.scopeDisplay,mark=state.song?"song":String(state.pattern);
    if(display.dataset.mark!==mark){
      display.dataset.mark=mark;display.innerHTML=state.song?icon("song"):patternIcon(state.pattern);
      const current=state.song?"Písnička":pieceName;
      element("span","",display).textContent=current;label(mainButtons.song,"Co přehrát · "+current);
    }
    mainButtons.tapHint.textContent="Ťukej vlevo. Tóny se zapíšou do dílku "+letter(state.pattern)+".";
    label(armButton,"Hrát na obrázky vlevo. Tóny se zapíšou do dílku "+letter(state.pattern)+".");
    const away=stageOn||scopesOn; // the board is not shown, so neither are the tools that write on it
    mainButtons.rhythm.parentElement.hidden=!!state.armed||away;mainButtons.finish.hidden=!state.armed||away;
    mainButtons.eraseRow.closest("details").hidden=away;
    board.classList.toggle("kv-live-input",!!state.armed);
    const row=state.row??0,rowName=rowLabel(frameTrack,row);
    mainButtons.eraseScope.textContent="Vymazat noty";
    eraseTarget(mainButtons.eraseRow,frameTrack+"."+row,()=>rowArt(frameTrack,row),rowName,"Vymazat řádek "+rowName+" · "+scopeName,state.canEraseRow);
    mainButtons.eraseRow.querySelector("small").textContent="Jeden řádek · dílek "+letter(state.pattern);
    eraseTarget(mainButtons.erase,boardSource,()=>character(frameTrack,costume),partLabel(frameTrack),"Vymazat "+(frameTrack>=4?"sadu ":"nástroj ")+scopeName,state.canEraseSource);
    mainButtons.erase.querySelector("small").textContent=(frameTrack>=4?"Celá sada":"Celý nástroj")+" · dílek "+letter(state.pattern);
    eraseTarget(mainButtons.erasePiece,String(state.pattern),()=>patternIcon(state.pattern),pieceName,"Vymazat všechny noty · "+pieceName,state.canErasePiece);
    eraseTarget(mainButtons.eraseSourceInBand,boardSource,()=>character(frameTrack,costume),partLabel(frameTrack)+" · A–D","Vymazat "+partLabel(frameTrack)+" ve všech dílcích A až D",state.canEraseSourceInBand);
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
      const previews=Math.max(1,chain.length);
      chainPreview.style.setProperty("--piece-columns",previews>12?Math.ceil(previews/2):previews);
      chainPreview.classList.toggle("long-chain",previews>12);
      chainPreview.querySelector(".kv-chain-print").innerHTML=chain.map(i=>'<i style="--piece:'+colour[i]+'" data-pattern="'+i+'"><b>'+letter(i)+'</b>'+patternIcon(i)+'</i>').join("");
      label(chainPreview,"Pořadí dílků: "+(chain.length?chain.map(letter).join(", "):"prázdné"));
    }
    if(chain.length===32 && document.activeElement===mainButtons.append)mainButtons.append.blur();
    chainPreview.querySelectorAll(".kv-chain-print i").forEach(t=>t.classList.toggle("current",+t.dataset.pattern===state.pattern));
    mainButtons.append.hidden=chain.length===32;
    label(mainButtons.append,"Přidat dílek "+letter(state.pattern)+" na konec písničky");
    for(let r=0;r<pads.length;r++){
      const pad=pads[r],name=rowLabel(frameTrack,r),art=rowArt(frameTrack,r),rowInk=["#9bc5cf","#ecc37d","#c0aece","#b4cc98","#e4a69d","#a8bdde"][r];
      if(pad.dataset.part!==String(frameTrack)){
        pad.dataset.part=frameTrack;pad.querySelector(".kv-row-picture").innerHTML=art;pad.querySelector(".kv-pad-name").textContent=name;
        label(pad,"Přehrát zvuk: "+name);
        for(const cell of cells[r])cell.querySelector(".kv-note-image").innerHTML=art;
      }
      const selected=r===(state.row??0);
      pad.setAttribute("aria-current",String(selected));pad.parentElement.classList.toggle("kv-selected-row",selected);
      pad.parentElement.style.setProperty("--row-ink",rowInk);
      for(let c=0;c<8;c++){
        const b=cells[r][c],v=state.grid?.[r]?.[c],expression=state.expression?.[r]?.[c]??(v?Number(v)-1:0);
        const stamp=frameTrack+":"+v;
        if(b.dataset.mark!==stamp){
          b.dataset.mark=stamp;pressed(b,!!v);b.dataset.expression=String(expression);
          label(b,name+", políčko "+(c+1)+(expression===1?", důraz":expression===2?", prodloužený zvuk":"")+(v?", odebrat":", přidat"));
          if(v)b.setAttribute("aria-description","Tažením tón přesuneš. Přetažením k obrázkům zvuků nebo pravým kliknutím ho odebereš.");
          else b.removeAttribute("aria-description");
        }
      }
    }
    renderStage(state);renderPanel();frame(lastFrame);
  }
  function frame(f={}){
    if(!host||!model)return;lastFrame=f;
    for(let i=0;i<parts.length;i++){
      const energy=Math.max(0,Math.min(1,Number(f.levels?.[i])||0)),value=String(+energy.toFixed(3));
      if(partButtons[i].style.getPropertyValue("--amplitude")!==value){partButtons[i].style.setProperty("--amplitude",value);}
    }
    const beatKey=model.playing&&f.step>=0&&f.pattern!=null?f.pattern+":"+f.step:"";
    if(beatKey!==lastBeat){lastBeat=beatKey;if(beatKey)beatHits(f.pattern,f.step);}
    if(stageOn){
      const resting=model.playing&&model.song&&f.pattern!=null?String(f.pattern):"";
      if(resting!==lastResting){lastResting=resting;for(const [key,m] of stageMembers)m.classList.toggle("resting",!!resting&&!stageKeys[+resting]?.has(key));}
    }
    // Each bar jumps up with its strip and falls back slowly, as a level meter does.
    if(scopesOn)for(const voice of bandMeter.children){
      voice.shown=Math.max(App.clamp(Number(f.levels?.[+voice.dataset.part])||0,0,1),(voice.shown||0)*.93);
      const level=String(+voice.shown.toFixed(3));
      if(voice.style.getPropertyValue("--level")!==level){voice.style.setProperty("--level",level);voice.classList.toggle("on",+level>.04);}
    }
    const step=model.playing && (f.pattern??model.pattern)===model.pattern ? (f.step??-1) : -1;
    if(step!==lastStep){
      for(let i=0;i<8;i++){lights[i].classList.toggle("lit",i===step);for(const row of cells)row[i].classList.toggle("beat",i===step);}
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
    if(!host)return;stops();clearSuggestion();clearTimeout(toastTimer);
    host.removeEventListener("keydown",keys);host.removeEventListener("pointerdown",dismissTools,true);window.removeEventListener("blur",stops);window.removeEventListener("keydown",historyKey);host.replaceChildren();host.classList.remove("kids-surface");
    host=null;send=null;model=null;pageKind="";lastFocus=null;lastStep=-1;lastPlayPattern=-1;lastFeedback=null;lastFrame={};
    if(stageFloor)stageSize.unobserve(stageFloor);
    stage=stageFloor=stageRiser=scopes=bandMeter=null;stageOn=scopesOn=false;stageMembers=new Map();stageKeys=[];stageList=[];lastBeat="";lastResting="";
    cells=[];partButtons=[];patternButtons=[];lights=[];chainSlots=[];pads=[];mainButtons={};
  }
  App.KidsView={mount,render,frame,flash,unmount,historyPair,movePiece,insertPiece,removePiece,character,rowArt,rowName,partName:i=>parts[i],partColour:i=>colour[i],partLabel,rowLabel};
})();
