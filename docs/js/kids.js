/* Switch between two projects inside one audio workstation. The console and the band keep separate histories. */
(() => {
  "use strict";
  const music=App.KidsMusic,store=App.KidsStore;
  let bridge,root,surface,sound,entry,parked=null,switching=false,armed=false,recordSince=0,ready=false;
  let shelves=[],signalFrame=0,feedback="",feedbackTimer=0,noticeEpoch=0;
  const lastRows=music.tracks.map(()=>0);
  const valid=(n,max)=>Number.isInteger(n) && n>=0 && n<max;
  const part=()=>Math.max(0,music.tracks.indexOf(App.P.sel.t));
  const pattern=()=>App.clamp(App.P.sel.p,0,3);
  function updateShelves(){shelves=store.slots();}
  function state(){
    const P=App.P, grid=music.grid(P,part(),pattern());
    const patternMotifs=Array.from({length:4},()=>Array(8).fill(0));
    const partMotifs=music.tracks.map(ti=>{
      const partMotif=Array(8).fill(0);
      const clips=P.tracks[ti].clips;
      patternMotifs.forEach((motif,p)=>{
        for(const n of clips[p])if(n.s>=0 && n.s<16){
          const beat=Math.floor(n.s/2);motif[beat]++;
          if(p===pattern())partMotif[beat]++;
        }
      });
      return partMotif;
    });
    return {track:part(),pattern:pattern(),row:lastRows[part()],patternMotifs,partMotifs,partHasNotes:partMotifs.map(hits=>hits.some(Boolean)),grid,expression:grid.map(row=>row.map(v=>Math.max(0,v-1))),
      costumes:music.costumes(P),tempo:music.tempoIndex(P),playing:App.Seq.playing,song:!!P.song,chain:P.chain.slice(),
      armed,micState:music.recording(),recording:music.recording()==="recording",hasVoice:!!P.tracks[6].smp.id,canUndo:store.canUndo(),shelf:shelves,
      slot:store.slot,lastRemoval:store.lastRemoval,feedback};
  }
  function paint(){if(store.active && ready){App.KidsView.render(state());App.KidsSound.paint();}}
  function flash(value){
    clearTimeout(feedbackTimer);feedback=value;paint();
    feedbackTimer=setTimeout(()=>{feedback="";paint();},1100);
  }
  function preference(on){
    store.prefer(on);
    const url=new URL(location.href);
    if(on)url.searchParams.set("kids","");else url.searchParams.delete("kids");
    history.replaceState(history.state,"",url);
  }
  function prepare(resetRows=true){
    music.prepare(App.P);
    if(resetRows)lastRows.fill(0);
    if(!music.tracks.includes(App.P.sel.t))App.P.sel.t=0;
    if(!valid(App.P.sel.p,4))App.P.sel.p=0;
    music.sync();App.E?.source("out");App.E?.monitor(false);
  }
  function stop(){
    armed=false;App.Seq.stop(true);App.E?.panic(true);App.Seq.startAt(0);
  }
  function play(){
    if(App.Seq.playing){App.KidsSound.release();armed=false;App.Seq.stop(true);}
    else {App.Seq.startAt(0);App.Seq.play();}
    paint();
  }
  function soundPage(expanded,restoreFocus=false){
    const api={part,pattern,row:()=>lastRows[part()],play,paint,expand:()=>soundPage(true),back:()=>soundPage(false,true)};
    App.KidsSound.release();
    sound.hidden=!expanded;
    surface.hidden=expanded;
    const host=expanded?sound:surface.querySelector("#kids-inline-sound");
    App.KidsSound.open(host,api,{compact:!expanded});
    if(restoreFocus)surface.querySelector('[data-k="sound"]')?.focus({preventScroll:true});
  }
  async function hydrate(){
    const P=App.P,epoch=++noticeEpoch;
    try{await App.restoreSamples(P);}catch{if(store.active && P===App.P && epoch===noticeEpoch)flash("error");return;}
    if(store.active && P===App.P && epoch===noticeEpoch){music.sync();paint();}
  }
  async function enter(auto=false){
    if(store.active || switching || document.querySelector("dialog[open]"))return;
    const consoleRoot=document.getElementById("app");
    switching=true;consoleRoot.inert=true;
    try{
      parked=await bridge.park();
      store.enter(music.newProject);prepare();
      // A bookmarked studio must be playable on its very first tap, including on a cold cache.
      let loadError=false;
      try{await App.KidsWorld.ready(App.P);}catch{loadError=true;}
      root.hidden=false;consoleRoot.hidden=true;
      document.body.classList.add("band-open");updateShelves();
      App.KidsView.mount(surface,dispatch);App.KidsStamp.mount(surface,dispatch);surface.hidden=false;sound.hidden=true;
      ready=true;preference(true);paint();soundPage(false);hydrate();
      if(loadError)flash("error");
      if(!auto)surface.querySelector('[data-k="play"]')?.focus({preventScroll:true});
    }finally{switching=false;if(!store.active)consoleRoot.inert=false;}
  }
  function leave(){
    if(!store.active || switching)return;
    ++noticeEpoch;clearTimeout(feedbackTimer);feedback="";ready=false;
    App.KidsSound.close();music.dispose();stop();App.KidsStamp.unmount();App.KidsView.unmount();store.leave();
    root.hidden=true;const consoleRoot=document.getElementById("app");consoleRoot.hidden=false;consoleRoot.inert=false;
    document.body.classList.remove("band-open");preference(false);
    bridge.resume(parked);parked=null;entry.focus({preventScroll:true});
  }
  function confirmImport(kid,index){
    return App.Workspace.decide({title:"Open band song?",rows:[
      ["Shelf",String(index+1)+" / 8"],["Song",kid.name],["Replaces",App.P.name+" · Undo available"]
    ],actions:[{id:"open",label:"Open in console",primary:true}]});
  }
  async function toConsole(index){
    const kid=store.read(index);if(!kid){flash("error");return;}
    leave();
    const choice=await confirmImport(kid,index);
    if(choice==="open"){if(await bridge.install(kid))App.UI.msg("BAND SONG OPENED FROM SHELF "+(index+1)+" · UNDO RETURNS TO YOUR PROJECT");}
    else await enter();
  }
  function livePad(row){
    if(!valid(row,4))return;
    const P=App.P,who=part();
    music.audition(who,row);
    if(!armed || !App.Seq.playing)return;
    const frame=App.Seq.frame(),clock=App.Seq.now(music.tracks[who]);
    let p=clock?.pat??pattern(),col=Math.round((clock?.step||0)/2);
    if(col>=8){
      if(P.song && P.chain.length)p=P.chain[((frame?.si||0)+1)%P.chain.length];
      col=0;
    }
    if(music.grid(P,who,p)[row][col]===0){music.edit(P,who,p,row,col);App.commit();paint();}
  }
  function changeSong(on){
    if(on && !App.P.chain.length)App.P.chain=[pattern()];
    App.P.song=on?1:0;App.P.arrangement.slots=App.P.chain.map(()=>null);
  }
  function dispatch(action,...args){
    if(!store.active || switching)return;
    const P=App.P,who=part(),pi=pattern(),[i,j]=args;
    switch(action){
      case "exit":leave();return;
      case "import":if(valid(i,8))void toConsole(i);return;
      case "sound":soundPage(true);return;
      case "track":
        if(!valid(i,music.tracks.length))return;
        App.KidsSound.release();P.sel.t=music.tracks[i];App.touch();paint();
        music.audition(i,lastRows[i]);return;
      case "pattern":
        if(!valid(i,4))return;
        App.KidsSound.release();P.sel.p=i;if(App.Seq.playing && !P.song)App.Seq.cue(i);App.touch();paint();return;
      case "stamp":{
        if(!valid(i,4)||!valid(j,8))return;
        lastRows[who]=i;
        if(music.grid(P,who,pi)[i][j]){paint();return;}
        music.edit(P,who,pi,i,j);break;
      }
      case "note":case "expression":{
        if(!valid(i,4)||!valid(j,8))return;
        lastRows[who]=i;
        const intensity=music.edit(P,who,pi,i,j,action==="expression");
        if(intensity)music.audition(who,i,intensity);
        break;
      }
      case "pad":if(valid(i,4)){lastRows[who]=i;livePad(i);paint();}return;
      case "arm":
        armed=!armed;if(armed && !App.Seq.playing){App.Seq.startAt(0);App.Seq.play();}paint();return;
      case "disarm":armed=false;paint();return;
      case "costume":
        if(!valid(i,4)||!valid(j,4))return;
        music.costume(P,i,j);music.audition(i,2);break;
      case "tempo":if(!valid(i,4))return;music.tempo(P,i);App.E?.syncFx();break;
      case "play":play();return;
      case "song":{
        const running=App.Seq.playing;stop();changeSong(!!i);if(running)App.Seq.play();break;
      }
      case "chain":{
        if(!Array.isArray(i)||i.length>32||!i.every(v=>valid(v,4)))return;
        const running=App.Seq.playing && P.song;if(running)stop();
        P.chain=i.slice();changeSong(!!P.song && i.length>0);if(running && P.song)App.Seq.play();break;
      }
      case "random":music.variation(P,who,pi);music.audition(who,2);break;
      case "erase":music.clear(P,who,pi);break;
      case "mic":
        void music.record((mode,error)=>{
          if(!store.active)return;if(mode==="recording")recordSince=performance.now();
          if(error)flash(error==="empty"?"quiet":error==="storage"?"error":"micError");else paint();
        },()=>{if(store.active){P.sel.t=6;App.commit();App.E?.syncTrack(6);music.audition(3,3);flash("recorded");}});return;
      case "undo":case "new":case "load":{
        if(action==="undo" && !store.canUndo() || action==="load" && !valid(i,8))return;
        const restoringSong=action==="undo" && store.lastRemoval>=0;
        App.KidsSound.release();music.cancelRecording();stop();
        const ok=action==="undo"?store.undo():action==="load"?store.load(i):store.fresh(music.newProject);
        if(ok){
          prepare(action!=="undo" || App.historyCrossedProject);updateShelves();
          if(restoringSong)flash("restored");else paint();
          hydrate();
        }else flash("error");
        return ok;
      }
      case "save":case "saveTo":{
        const slot=action==="saveTo"?i:store.slot>=0?store.slot:shelves.findIndex(x=>!x);
        if(!valid(slot,8) || !store.save(slot,j)){updateShelves();flash("error");return;}
        updateShelves();flash("saved");return true;
      }
      case "removeSlot":
        if(!valid(i,8) || !shelves[i])return;
        if(!store.remove(i,j||shelves[i])){updateShelves();flash("error");return;}
        updateShelves();paint();return true;
      default:return;
    }
    App.commit();paint();
  }
  function frame(c,now){
    if(!ready)return;
    const mic=music.recording(), f={step:c?Math.floor(c.step/2)%8:-1,pattern:c?.pat,slot:c?.si,levels:music.levels(),
      micLevel:music.micLevel(),recordProgress:mic==="recording"?Math.min(1,(now-recordSince)/6000):0};
    if(sound.hidden)App.KidsView.frame(f);
    App.KidsSound.frame(c,f.levels);
    if(now-signalFrame>=32){App.KidsScopes.draw(root);signalFrame=now;}
  }
  function init(api){
    bridge=api;root=document.getElementById("kids-root");surface=document.getElementById("kids-band");sound=document.getElementById("kids-sound");
    // File drops belong to the console. Internal piece drags still reach the arrangement.
    for(const event of ["dragover","drop"])root.addEventListener(event,e=>{
      if(e.dataTransfer?.types.includes("Files")){e.preventDefault();e.stopPropagation();}
    });
    entry=document.getElementById("kids-entry");entry.addEventListener("click",()=>void enter());
    entry.addEventListener("contextmenu",e=>{e.preventDefault();App.UI.menu(entry,[{label:"Open kids studio",value:"open"}],()=>void enter());});
    for(const event of ["kids-storage-error","kids-audio-error"])window.addEventListener(event,()=>{if(store.active)flash("error");});
    window.addEventListener("storage",e=>{if(store.active && e.key?.includes("kids")){updateShelves();paint();}});
    document.addEventListener("visibilitychange",()=>{if(document.hidden && store.active){music.cancelRecording();App.KidsSound.release();paint();}});
    window.addEventListener("pagehide",()=>{if(store.active){music.cancelRecording();App.KidsSound.release();}});
    if(new URL(location.href).searchParams.has("kids")||store.preferred())void enter(true);
  }
  App.Kids={get active(){return store.active;},get entering(){return switching && !store.active;},init,enter,leave,dispatch,frame,play,confirmImport};
})();
