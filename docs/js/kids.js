/* Switch between two projects inside one audio workstation. The console and the band keep separate histories. */
(() => {
  "use strict";
  const music=App.KidsMusic,store=App.KidsStore;
  let bridge,root,surface,sound,entry,parked=null,switching=false,armed=false,recordSince=0,ready=false;
  let shelves=[],signalFrame=0,feedback="",feedbackTimer=0,noticeEpoch=0;
  const lastRows=music.tracks.map(()=>0);
  // How loud the band plays is the listener's choice, not the song's: the browser keeps it, Zpět does not take it back,
  // and opening another song keeps it. Five steps up to the ceiling set for children's ears.
  const VOLUME="musiclab.kids.v1.volume",levels=[.3,.5,.68,.84,1];
  let volume=(()=>{try{const raw=localStorage.getItem(VOLUME),v=Number(raw);return raw!==null && Number.isInteger(v) && v>=0 && v<5?v:4;}catch{return 4;}})();
  const loudness=()=>music.masterMax*levels[volume];
  const pieces=[0,1,2,3];
  const valid=(n,max)=>Number.isInteger(n) && n>=0 && n<max;
  const part=()=>music.part(App.P);
  const pattern=()=>App.clamp(App.P.sel.p,0,3);
  function updateShelves(){shelves=store.slots();}
  /* A song travels in a link: what it plays, as short as it can be (kids-link.js), written after #s in the address,
     a part that never reaches a server. The recorded voice does not fit and stays at home; its notes come along. */
  const sharedCode=()=>location.hash.match(/^#s([ABJ][A-Za-z0-9_-]+)$/)?.[1]||location.hash.match(/^#song=([zj][A-Za-z0-9_-]+)$/)?.[1]||null;
  const shareable=()=>[...new Set(music.tracks)];
  const EFFECT_ROUTES=[["macro2","tone",-1],["macro1","drive",.85],["macro4","vibratoRate",1],["macro3","vibratoDepth",1]];
  async function shareLink(){
    const url=new URL(location.pathname,location.origin);
    url.hash="s"+await App.KidsLink.encode(App.P);
    return url.href;
  }
  function songFrom(data){
    const num=(v,lo,hi,d)=>Number.isFinite(+v)?App.clamp(+v,lo,hi):d,int=(v,n)=>Number.isInteger(v)&&v>=0&&v<n;
    if(data?.v!==1)throw Error("Unknown song link");
    const P=music.newProject();
    if(typeof data.name==="string" && data.name.trim())P.name=data.name.trim().toUpperCase().slice(0,28);
    if(int(data.tempo,4))music.tempo(P,data.tempo);
    (Array.isArray(data.costumes)?data.costumes:[]).slice(0,4).forEach((c,i)=>{if(int(c,4)&&c)music.costume(P,i,c);});
    P.chain=(Array.isArray(data.chain)?data.chain:[]).filter(p=>int(p,4)).slice(0,32);
    P.song=data.song && P.chain.length?1:0;P.arrangement.slots=P.chain.map(()=>null);
    if(int(data.piece,4))P.sel.p=data.piece;
    shareable().forEach((ti,k)=>{
      for(let p=0;p<4;p++){
        const list=Array.isArray(data.notes?.[k]?.[p])?data.notes[k][p]:[];
        P.tracks[ti].clips[p]=list.slice(0,256).filter(n=>Array.isArray(n)&&int(n[0],256)&&int(n[1],128))
          .map(([s,n,l,v,pr,r])=>({s,n,l:Math.round(num(l,1,64,1)),v:num(v,.05,1,.8),p:num(pr,0,1,1),...(int(r,9)&&r>1?{r}:{})}));
      }
    });
    const fx=Array.isArray(data.fx)?data.fx:[];
    P.fx.mixDelay=num(fx[0],0,1,0);P.fx.mixReverb=num(fx[1],0,1,0);if(int(fx[2],10))P.fx.dtime=fx[2];P.fx.dfb=num(fx[3],0,.95,P.fx.dfb);
    const macros=[0,1,2,3].map(j=>num(data.macros?.[j],0,1,0)),spin=Array.isArray(data.spin)?[num(data.spin[0],.25,6,1),num(data.spin[1],0,1,0)]:null;
    for(const ti of shareable()){
      const s=P.rack.strips[ti];s.macros=macros.slice();
      for(const [source,target,high] of EFFECT_ROUTES)if(!s.routes.some(r=>r.source===source&&r.target===target))s.routes.push({source,target,low:0,high});
      if(spin && spin[1]>0){Object.assign(s,{lfoRate:spin[0],lfoBeats:0,lfoWave:"sine"});s.routes.push({source:"lfo",target:"pan",low:-spin[1],high:spin[1]},{source:"lfo",target:"level",low:-.55*spin[1],high:0});}
    }
    return App.sanitize(P);
  }
  async function openShared(code){
    let P;
    try{
      P=songFrom(await App.KidsLink.decode(code));
    }catch{flash("error");return false;}
    history.replaceState(history.state,"",location.pathname+location.search); // a reload does not open it again
    const ok=dispatch("openShared",P);
    if(ok)setTimeout(()=>flash("linked"),1200);
    return ok;
  }
  // The open song as sound, the whole song when it has an order of pieces, else the piece on the board.
  async function downloadSong(){
    const P=App.sanitize(App.P);P.song=P.chain.length?1:0;
    await App.restoreSamples(P);
    const {full,cut}=await App.Seq.renderSong({project:P}),a=document.createElement("a");
    const name=!["POCKET BAND","UNTITLED"].includes(P.name)?P.name:"Pisnicka";
    a.href=URL.createObjectURL(App.wav(full,cut));a.download=name+".wav";document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),20000);
    return name+".wav";
  }
  function state(){
    const P=App.P,who=part(),pi=pattern(),grid=music.grid(P,who,pi);
    const eraseRowPitch=music.pitch(who,lastRows[who]),sourceClips=P.tracks[music.tracks[who]].clips,clip=sourceClips[pi];
    const patternMotifs=pieces.map(()=>Array(8).fill(0));
    const partMotifs=music.tracks.map((ti,source)=>{
      const partMotif=Array(8).fill(0);
      const clips=P.tracks[ti].clips;
      patternMotifs.forEach((motif,p)=>{
        for(const n of clips[p])if(n.s>=0 && n.s<16 && music.owns(source,n.n)){
          const beat=Math.floor(n.s/2);motif[beat]++;
          if(p===pi)partMotif[beat]++;
        }
      });
      return partMotif;
    });
    // Who plays on each beat of each piece, as [part,row] pairs: the band on stage and the hopping pictures read it.
    const hits=pieces.map(p=>{
      const beats=Array.from({length:8},()=>[]);
      music.tracks.forEach((_,source)=>music.grid(P,source,p).forEach((cols,row)=>cols.forEach((v,col)=>{if(v)beats[col].push([source,row]);})));
      return beats;
    });
    return {track:who,pattern:pi,row:lastRows[who],patternMotifs,partMotifs,hits,partHasNotes:partMotifs.map(hits=>hits.some(Boolean)),grid,expression:grid.map(row=>row.map(v=>Math.max(0,v-1))),
      canEraseRow:clip.some(n=>n.n===eraseRowPitch),canEraseSource:clip.some(n=>music.owns(who,n.n)),canErasePiece:P.tracks.some(t=>t.clips[pi].length),
      canEraseSourceInBand:pieces.some(p=>sourceClips[p].some(n=>music.owns(who,n.n))),
      costumes:music.costumes(P),tempo:music.tempoIndex(P),volume,playing:App.Seq.playing,song:!!P.song,chain:P.chain.slice(),
      armed,micState:music.recording(),recording:music.recording()==="recording",hasVoice:!!P.tracks[6].smp.id,canUndo:store.canUndo(),canRedo:store.canRedo(),shelf:shelves,
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
    music.prepare(App.P);App.P.fx.vol=loudness();
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
    const api={part,pattern,row:()=>lastRows[part()],selectRow:row=>{lastRows[part()]=row;},
      play,paint,expand:()=>soundPage(true),back:()=>soundPage(false,true)};
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
      if(sharedCode())void openShared(sharedCode());
      if(loadError)flash("error");
      if(!auto)surface.querySelector('[data-k="play"]')?.focus({preventScroll:true});
    }finally{switching=false;if(!store.active){consoleRoot.inert=false;document.documentElement.classList.remove("face-kids");}}
  }
  function leave(){
    if(!store.active || switching)return;
    ++noticeEpoch;clearTimeout(feedbackTimer);feedback="";ready=false;
    App.KidsSound.close();music.dispose();stop();App.KidsStamp.unmount();App.KidsView.unmount();store.leave();
    root.hidden=true;const consoleRoot=document.getElementById("app");consoleRoot.hidden=false;consoleRoot.inert=false;
    document.body.classList.remove("band-open");document.documentElement.classList.remove("face-kids");preference(false);
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
    if(!valid(row,music.rows))return;
    const P=App.P,who=part();
    music.audition(who,row);
    if(!armed || !App.Seq.playing)return;
    const track=music.tracks[who],clock=App.Seq.now(track),p=pattern();
    const beat=Math.round((clock?.step??0)/2),col=beat%8;
    if(music.grid(P,who,p)[row][col])return;
    music.edit(P,who,p,row,col);
    // The pad already sounded under the finger. When the nearest beat lies
    // ahead of the audio scheduler, let its first sequenced hit wait one lap.
    if(clock && 2*beat>clock.step){
      const note=P.tracks[track].clips[p].find(n=>n.n===music.pitch(who,row) && n.s===2*col);
      if(note)App.Seq.skip.set(note,App.E.ctx.currentTime+clock.sd+.005);
    }
    App.commit();
  }
  function changeSong(on){
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
        App.KidsSound.release();music.select(P,i);App.touch();paint();
        music.audition(i,lastRows[i]);return;
      case "pattern":
        if(!valid(i,4))return;
        App.KidsSound.release();armed=false;P.sel.p=i;if(App.Seq.playing && !P.song)App.Seq.cue(i);App.touch();paint();return;
      case "stamp":{
        if(!valid(i,music.rows)||!valid(j,8))return;
        lastRows[who]=i;
        if(music.grid(P,who,pi)[i][j]){paint();return;}
        music.edit(P,who,pi,i,j);break;
      }
      case "moveNote":{
        const strength=music.moveNote(P,who,pi,...args);
        if(!strength)return;
        const toRow=args[2];lastRows[who]=toRow;
        music.audition(who,toRow,strength);break;
      }
      case "removeNote":
        if(!valid(i,music.rows)||!valid(j,8)||!music.grid(P,who,pi)[i][j])return;
        music.edit(P,who,pi,i,j);break;
      case "note":case "expression":{
        if(!valid(i,music.rows)||!valid(j,8))return;
        lastRows[who]=i;
        const intensity=music.edit(P,who,pi,i,j,action==="expression");
        if(intensity)music.audition(who,i,intensity);
        break;
      }
      case "pad":if(valid(i,music.rows)){lastRows[who]=i;livePad(i);paint();}return;
      case "hear":if(valid(i,music.tracks.length)&&valid(j,music.rows))music.audition(i,j);return; // a member on stage plays its sound
      case "arm":
        // Record the piece printed on the button and shown in the grid, even
        // if the transport had a different piece queued in the song.
        if(P.song){P.song=0;App.commit();}
        App.Seq.play();armed=App.Seq.playing;paint();return;
      case "disarm":armed=false;paint();return;
      case "costume":
        if(!valid(i,4)||!valid(j,4))return;
        music.costume(P,i,j);music.audition(i,2);break;
      case "tempo":if(!valid(i,4))return;music.tempo(P,i);App.E?.syncFx();break;
      case "volume":
        if(!valid(i,5))return;
        volume=i;try{localStorage.setItem(VOLUME,String(i));}catch{}
        P.fx.vol=loudness();music.sync();App.touch();paint();
        if(!App.Seq.playing)music.audition(who,lastRows[who]); // a change is heard at once, also while stopped
        return;
      case "play":play();return;
      case "song":{
        if(i && !P.chain.length)return;
        const running=App.Seq.playing;stop();changeSong(!!i);if(running)App.Seq.play();break;
      }
      case "chain":{
        if(!Array.isArray(i)||i.length>32||!i.every(v=>valid(v,4)))return;
        const running=App.Seq.playing && P.song;if(running)stop();
        P.chain=i.slice();changeSong(!!P.song && i.length>0);if(running && P.song)App.Seq.play();break;
      }
      case "random":music.variation(P,who,pi);music.audition(who,2);break;
      case "eraseRow":if(!music.clearRow(P,who,pi,lastRows[who]))return;break;
      case "erase":if(!music.clear(P,who,pi))return;break;
      case "eraseSourceInBand":{
        let changed=false;
        for(const p of pieces)if(music.clear(P,who,p))changed=true;
        if(!changed)return;
        break;
      }
      case "erasePiece":{
        if(!P.tracks.some(t=>t.clips[pi].length))return;
        for(const t of P.tracks)t.clips[pi].length=0;
        break;
      }
      case "mic":
        void music.record((mode,error)=>{
          if(!store.active)return;if(mode==="recording")recordSince=performance.now();
          if(error)flash(error==="empty"?"quiet":error==="storage"?"error":"micError");else paint();
        },()=>{if(store.active){music.select(P,3);App.commit();App.E?.syncTrack(6);music.audition(3,3);flash("recorded");}});return;
      case "share":return shareLink().then(async link=>{
        try{await navigator.clipboard.writeText(link);return {link,copied:true};}catch{return {link,copied:false};}
      });
      case "download":return downloadSong();
      case "rename":{
        if(typeof i!=="string" || !i.trim())return false;
        const name=i.trim().toUpperCase().slice(0,28),slot=store.slot;
        if(slot>=0){if(!store.rename(slot,name,shelves[slot])){updateShelves();flash("error");return false;}}
        else {P.name=name;App.commit();}
        updateShelves();paint();return true;
      }
      case "undo":case "redo":case "new":case "load":case "openShared":{
        if(action==="load" && !valid(i,8))return;
        App.KidsSound.release();
        if(action==="undo" && !store.canUndo() || action==="redo" && !store.canRedo())return;
        music.cancelRecording();stop();
        const history=action==="undo" || action==="redo";
        // Work that was never put on the shelf is not thrown away by a new song or by opening another: it goes on
        // the first free place first. With the shelf full, Zpět still brings it back.
        let kept=-1;
        if(!history && store.slot<0 && P.tracks.some(t=>t.clips.some(c=>c.length))){
          const free=shelves.findIndex((x,k)=>!x && k!==store.lastRemoval); // a deleted song's place stays free for Vrátit smazání
          if(free>=0 && (action!=="load" || free!==i) && store.save(free,null))kept=free;
        }
        const ok=history?store[action]():action==="load"?store.load(i):action==="openShared"?store.fresh(()=>i):store.fresh(music.newProject);
        if(ok){prepare(!history || App.historyCrossedProject);updateShelves();paint();hydrate();if(kept>=0)setTimeout(()=>flash("kept"));}
        else flash("error");
        return ok;
      }
      case "save":case "saveTo":{
        const slot=action==="saveTo"?i:store.slot>=0?store.slot:shelves.findIndex(x=>!x);
        const preview=action==="saveTo"?j:store.slot>=0?shelves[slot]:null;
        if(!valid(slot,8) || !store.save(slot,preview)){updateShelves();flash("error");return;}
        updateShelves();flash("saved");return true;
      }
      case "removeSlot":
        if(!valid(i,8) || !shelves[i])return;
        if(!store.remove(i,j||shelves[i])){updateShelves();flash("error");return;}
        updateShelves();flash("removed");return true;
      case "restoreRemoval":{
        const ok=store.restoreRemoval(i);
        updateShelves();flash(ok?"restored":"error");return ok;
      }
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
    if(new URL(location.href).searchParams.has("kids")||store.preferred()||sharedCode())void enter(true); // a song link opens the kids' face
  }
  App.Kids={get active(){return store.active;},get entering(){return switching && !store.active;},init,enter,leave,dispatch,frame,play,confirmImport};
})();
