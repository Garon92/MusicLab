"use strict";

const assert = require("node:assert/strict");
const sizes = [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]];

async function checkPanel(page, label, controlScope="") {
  const issues = await page.evaluate(async (controlScope) => {
    await new Promise(requestAnimationFrame);
    const errors=[],root=document.getElementById("kids-root");
    const band=root.querySelector(".kids-surface");
    for(const el of [document.documentElement,document.body,root,band]) {
      if(!el || el.hidden)continue;
      if(el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1)
        errors.push((el.id||el.nodeName)+" overflows by "+(el.scrollWidth-el.clientWidth)+"/"+(el.scrollHeight-el.clientHeight));
    }
    const scope=controlScope?root.querySelector(controlScope):root;
    for(const el of scope.querySelectorAll("button,input,select,summary,[role=button]")) {
      if(el.closest("[hidden],[inert]") || !el.getClientRects().length)continue;
      if(el.closest("details:not([open])") && !el.closest("summary"))continue;
      const r=el.getBoundingClientRect(),id=el.getAttribute("aria-label")||el.dataset.k||el.tagName;
      if(!el.getAttribute("aria-label") && !el.textContent.trim())errors.push("Unlabelled "+id);
      if(r.width<63.95 || r.height<63.95)errors.push(id+" measures "+r.width.toFixed(1)+"×"+r.height.toFixed(1));
      if(r.x<-.5 || r.y<-.5 || r.right>innerWidth+.5 || r.bottom>innerHeight+.5)errors.push(id+" outside viewport");
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!el.disabled && (!hit || !el.contains(hit)))errors.push(id+" is covered at the centre");
      if(el.closest(".kv-menu-tray")){
        const caption=el.querySelector(".kv-caption"),picture=el.querySelector("svg").getBoundingClientRect();
        const range=document.createRange();range.selectNodeContents(caption);
        for(const text of range.getClientRects()){
          if(text.left<picture.right || text.right>r.right-3 || text.top<r.top+2 || text.bottom>r.bottom-2)
            errors.push(id+" caption overlaps its picture or leaves its button");
        }
      }
    }
    return errors;
  },controlScope);
  assert.deepEqual(issues,[],label+" "+page.viewportSize().width+"×"+page.viewportSize().height+" "+issues.join(", "));
}

async function checkDeskDrags(page) {
  const row=page.locator('.kv-row-pad[data-row="1"]');
  const note=(r,c)=>page.locator('.kv-cell[data-row="'+r+'"][data-col="'+c+'"]');
  const undo=page.locator('#kids-band [data-k="undo"]');
  const track=()=>page.evaluate(()=>{
    const t=App.P.tracks[App.P.sel.t];return {dly:App.P.fx.mixDelay,rev:App.P.fx.mixReverb,notes:t.clips[0]}; // the band's echo
  });
  async function move(from,to,x=.5,y=.5,hover){
    const a=await from.boundingBox(),b=await to.boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    try{
      await page.mouse.move(b.x+b.width*x,b.y+b.height*y,{steps:6});
      if(hover)await hover();
    }finally{await page.mouse.up();}
  }
  const initial=await track(),field=page.locator('#kids-inline-sound .ks-trail');
  await page.evaluate(()=>{
    window.previousAudition=App.KidsMusic.audition;window.droppedPreviews=[];
    App.KidsMusic.audition=(part,row,...args)=>{
      window.droppedPreviews.push({row,amount:App.P.fx.mixDelay});
      window.previousAudition(part,row,...args);
    };
  });
  try{
    await move(row,field,.65,.25,async()=>{
      assert.deepEqual(await track(),initial,"hovering previews the destination without editing sound");
      assert.equal(await page.locator('#kids-inline-sound .ks-pad.kv-stamp-target').count(),1);
      await page.keyboard.press("Escape");
    });
    assert.deepEqual(await track(),initial);
    await move(row,field,.65,.25);
    const placed=await track(),preview=await page.evaluate(()=>window.droppedPreviews.at(-1));
    assert.ok(Math.abs(placed.dly-.65)<.015 && Math.abs(placed.rev-.75)<.015,"drop sets both axes at the release point");
    assert.equal(preview.row,1);assert.equal(preview.amount,placed.dly);assert.deepEqual(placed.notes,[]);
    await undo.click();assert.deepEqual(await track(),initial);
  }finally{await page.evaluate(()=>{App.KidsMusic.audition=window.previousAudition;});}
  const src=note(0,1),dest=note(2,4),other=note(1,5);
  await src.tap();await other.tap();
  const plain=await track(),a=await src.boundingBox(),b=await dest.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  try{
    await page.waitForFunction(()=>App.P.tracks[App.P.sel.t].clips[0][0].v>.84);
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:6});
    assert.equal(await page.locator(".kv-stamp-ghost").count(),0,"holding for an accent finishes that gesture");
  }finally{await page.mouse.up();}
  const accented=await track();
  assert.equal(accented.notes[0].s,plain.notes[0].s);assert.equal(accented.notes[0].n,plain.notes[0].n);
  await undo.click();assert.deepEqual(await track(),plain);
  await page.evaluate(()=>{
    const t=App.P.tracks[App.P.sel.t];Object.assign(t.clips[0][0],{p:.72,v:.9,l:2,r:2});App.commit();App.refresh();
  });
  const two=await track();
  await move(src,other);assert.deepEqual(await track(),two,"dropping on an occupied beat preserves both notes");
  await move(src,dest,.5,.5,async()=>{
    const expected=await page.locator('.kv-row-pad[data-row="2"] .kv-row-picture svg').evaluate(svg=>svg.outerHTML);
    assert.equal(await page.locator(".kv-stamp-ghost svg").evaluate(svg=>svg.outerHTML),expected);
    assert.deepEqual(await track(),two,"the picture at the pointer previews the new sound before release");
  });
  const moved=await track();
  assert.deepEqual(moved.notes,[{...two.notes[0],n:38,s:8},two.notes[1]],"changing row and beat preserves the note's articulation");
  await undo.click();assert.deepEqual(await track(),two);
  await src.tap();await other.tap();assert.deepEqual(await track(),initial);
}

async function checkEraser(page,key) {
  const clips=()=>page.evaluate(()=>App.P.tracks.map(t=>t.clips));
  const initial=await clips();
  await page.evaluate(()=>{
    const music=App.KidsMusic;
    for(const [part,section,row,beat] of [[4,0,0,1],[4,0,0,6],[4,0,5,3],[8,0,0,2],[6,0,2,2],[4,1,0,1],[8,1,3,4],[4,3,4,3]]){
      music.edit(App.P,part,section,row,beat);
    }
    const shared=App.P.tracks[music.tracks[4]];
    for(const p of [4,7])shared.clips[p].push({...shared.clips[0][0]});
    shared.automation[0].pan={mode:"linear",points:[{s:0,v:-.42},{s:8,v:.42}]};
    App.commit();App.Kids.dispatch("track",4);App.Kids.dispatch("pad",0);
  });
  const full=await clips();
  const automation=()=>page.evaluate(()=>App.P.tracks[App.KidsMusic.tracks[4]].automation[0]);
  const movement=await automation();
  const counts=()=>page.evaluate(()=>[4,8,6].map(p=>App.KidsMusic.grid(App.P,p,0).flat().filter(Boolean).length));
  for(const [action,expected] of [["eraseRow",[1,1,1]],["erase",[0,1,1]],["erasePiece",[0,0,0]]]){
    await key("eraser").tap();await key(action).tap();
    assert.deepEqual(await counts(),expected,action+" affects precisely the pictured target, including when two sources share a console strip");
    assert.deepEqual((await clips()).map(t=>t.slice(1)),full.map(t=>t.slice(1)),"other pieces are kept");
    assert.deepEqual(await automation(),movement,"erasing notes leaves the recorded effect movement in place");
    await key("undo").tap();assert.deepEqual(await clips(),full,"one Undo restores all deleted notes");
  }
  const withoutSource=await page.evaluate(()=>App.P.tracks.map((t,ti)=>t.clips.map((clip,p)=>
    ti===App.KidsMusic.tracks[4] && p<4?clip.filter(n=>!App.KidsMusic.owns(4,n.n)):clip)));
  await key("pattern",'[data-index="2"]').tap();
  await key("eraser").tap();assert.ok(await key("erase").isDisabled(),"this piece has no farm notes");
  await key("eraseSourceInBand").tap();
  assert.deepEqual(await clips(),withoutSource,"remove the farm across A–D, keep both shared-strip partners in A/B and console pieces E–H");
  assert.deepEqual(await automation(),movement);
  await key("eraser").tap();assert.ok(await key("eraseSourceInBand").isDisabled());await key("eraser").tap();
  await key("undo").tap();assert.deepEqual(await clips(),full,"one Undo restores the farm across all four pieces");
  await key("pattern",'[data-index="0"]').tap();
  await key("undo").tap();assert.deepEqual(await clips(),initial);
}

module.exports = async function kidsUI(reference) {
  const context=await reference.context().browser().newContext({hasTouch:true,viewport:{width:1100,height:620}});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  page.setDefaultTimeout(7000);
  const url=new URL(reference.url());url.search="";
  const base=page.locator("#kids-root");
  const key=(k,attrs="")=>base.locator('[data-k="'+k+'"]'+attrs).filter({visible:true});
  const item=(k,i)=>key(k,'[data-index="'+i+'"]');
  const cell=(row,col)=>key("note",'[data-row="'+row+'"][data-col="'+col+'"]');
  async function held(target,until) {
    const r=await target.boundingBox();assert.ok(r);
    await page.mouse.move(r.x+r.width/2,r.y+r.height/2);
    await page.mouse.down();
    try{await until();}finally{await page.mouse.up();}
  }
  const visibleKids=()=>page.waitForFunction(()=>App.Kids.active && document.querySelector("#kids-root .kv-cell"));
  try {
    await page.goto(url.href);await page.waitForSelector("#ed canvas");
    const adult=await page.evaluate(()=>{
      const p=App.P;p.name="DESK ORIGINAL";p.bpm=132;p.tracks[1].clips[1]=[{n:41,s:1,l:2,p:1,v:.87}];App.commit();App.refresh();
      const devices=navigator.mediaDevices;window.kidMicProbe={devices,requests:0};
      const input={id:"keys",name:"Desk keys",state:"connected"},output={id:"rack",name:"Desk synth",state:"connected",send(){kidMidi.sent++;},clear(){}};
      window.kidMidi={input,sent:0};Object.defineProperty(navigator,"requestMIDIAccess",{configurable:true,value:async()=>({
        inputs:new Map([["keys",input]]),outputs:new Map([["rack",output]])
      })});
      Object.defineProperty(devices,"getUserMedia",{configurable:true,value:async()=>{
        const probe=window.kidMicProbe,ctx=App.E.ctx,out=ctx.createMediaStreamDestination();
        probe.requests++;const sine=ctx.createOscillator(),gain=ctx.createGain();
        sine.frequency.value=311;gain.gain.value=.24;sine.connect(gain).connect(out);sine.start();
        Object.assign(probe,{sine,out,track:out.stream.getAudioTracks()[0],start:ctx.currentTime});
        if(probe.defer){probe.defer=false;await new Promise(resolve=>probe.grant=resolve);}
        return out.stream;
      }});
      return App.sanitize(p);
    });
    await page.getByRole("button",{name:"MIDI",exact:true}).tap();
    const midi=page.getByRole("dialog");
    await midi.getByRole("button",{name:"Connect devices"}).tap();
    await midi.getByLabel("Output",{exact:true}).selectOption("rack");
    await midi.getByLabel("Clock",{exact:true}).selectOption("follow");
    await midi.getByRole("button",{name:"Close",exact:true}).tap();
    await page.getByRole("button",{name:/^TAPE(?: |$)/i}).tap();
    await page.waitForFunction(()=>App.taping?.seconds()>.12);
    // Start a console input permission request, then make the recorder's real
    // final block arrive just after the user has clicked into the band.
    await page.evaluate(()=>{
      kidMicProbe.defer=true;void App.recStart({ti:6},"in");
      const rec=App.taping, stop=rec.stop.bind(rec);
      rec.stop=async()=>{const buf=await stop();await new Promise(r=>window.finishTapeBlock=r);return buf;};
    });
    await page.getByRole("button",{name:/^TAPE(?: |$)/i}).tap();
    await page.waitForFunction(()=>kidMicProbe.grant && window.finishTapeBlock);
    const [priorChooser]=await Promise.all([page.waitForEvent("filechooser"),page.evaluate(()=>App.pickFile(".wav",()=>{window.staleFileChosen=true;}))]);
    await page.locator("#kids-entry").tap();
    await page.keyboard.press("Control+k");await page.keyboard.press("Space");
    assert.equal(await page.locator("dialog[open]").count(),0);
    assert.ok(await page.evaluate(()=>{
      kidMidi.input.onmidimessage({data:[0xfa],currentTarget:kidMidi.input});
      return document.getElementById("app").inert && App.Kids.entering && !App.Seq.playing;
    }));
    await page.evaluate(()=>finishTapeBlock());
    await visibleKids();
    assert.ok(await page.evaluate(()=>{window.parkedBandTestTake=App.take;return !App.taping && App.take?.duration>.1;}));
    assert.ok(await page.evaluate(()=>{
      kidMidi.sent=0;let notes=0;const play=App.noteOn;
      App.noteOn=()=>notes++;
      try{
        for(const data of [[0xfa],[0x90,48,117]])kidMidi.input.onmidimessage({data,currentTarget:kidMidi.input});
        App.MidiIO.live(0,36,1);
        return !App.Seq.playing && notes===0 && kidMidi.sent===0;
      }finally{App.noteOn=play;}
    }));
    await priorChooser.setFiles({name:"late.wav",mimeType:"audio/wav",buffer:Buffer.from([0])});
    assert.equal(await page.evaluate(()=>!!window.staleFileChosen),false);
    await page.evaluate(()=>{kidMicProbe.grant();kidMicProbe.sine.stop();});
    await page.waitForFunction(()=>kidMicProbe.track.readyState==="ended" && !App.E.input && !App.recTo);
    assert.ok(await page.evaluate(()=>{
      const dt=new DataTransfer(),root=document.getElementById("kids-band");
      dt.items.add(new File([JSON.stringify(App.newProject())],"foreign.json",{type:"application/json"}));
      const drop=new DragEvent("drop",{dataTransfer:dt,cancelable:true,bubbles:true});
      let reachedConsole=false;const observe=()=>{reachedConsole=true;};
      window.addEventListener("drop",observe);root.dispatchEvent(drop);window.removeEventListener("drop",observe);
      return drop.defaultPrevented && !reachedConsole;
    }));
    assert.equal(await key("note").count(),48);
    assert.equal(await key("track").count(),12);assert.equal(await key("pad").count(),6);
    assert.equal(await key("pattern").count(),4);assert.equal(await page.locator("#kids-band .kv-output canvas[data-kid-screen]").count(),2);
    assert.equal(await key("pad",'[data-row="0"]').getAttribute("aria-label"),"Přehrát zvuk: Kráva");
    for(const [k,title] of [["play","Přehrát"],["rhythmTools","Rytmus"],["mic","Nahrát hlas"],["undo","Zpět"],["redo","Vpřed"],["shelf","Písničky"]])
      assert.equal((await key(k).innerText()).trim(),title);
    assert.equal(await page.locator("#kids-inline-sound [data-sound=pad]").isVisible(),true);
    assert.equal(await page.evaluate(()=>App.P.tracks.every(t=>t.clips.every(c=>!c.length))),true);
    const chosen=cell(1,3),pressed=()=>chosen.getAttribute("aria-pressed");
    assert.ok(await key("undo").isDisabled() && await key("redo").isDisabled());
    await chosen.tap();await key("undo").tap();assert.equal(await pressed(),"false");
    await key("redo").tap();assert.equal(await pressed(),"true");assert.ok(await key("redo").isDisabled());
    await page.keyboard.press("Meta+z");assert.equal(await pressed(),"false");
    await page.keyboard.press("Meta+Shift+z");assert.equal(await pressed(),"true");
    await page.keyboard.press("Control+z");await page.keyboard.press("Control+y");assert.equal(await pressed(),"true");
    await page.keyboard.press("Control+z");await cell(2,1).tap();
    assert.ok(await key("redo").isDisabled(),"a new edit replaces the abandoned music branch");
    await key("undo").tap();
    await key("lock").tap();assert.ok(await page.evaluate(()=>App.Kids.active));
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});await checkPanel(page,"Band");
      await key("song").tap();await checkPanel(page,"Playback choices",".kv-play-menu[open]");
      await key("rhythmTools").tap();await checkPanel(page,"Rhythm choices",".kv-rhythm-tools[open]");
      assert.equal(await key("songAll").count(),0);
      await key("eraser").tap();await checkPanel(page,"Eraser targets",".kv-eraser-tools[open]");
      assert.ok(await key("erasePiece").isDisabled());assert.ok(await key("eraseSourceInBand").isDisabled());await key("eraser").tap();
    }
    await page.setViewportSize({width:1100,height:620});
    await key("song").tap();assert.equal(await key("songPiece").getAttribute("aria-pressed"),"true");
    await key("songAll").tap();assert.ok(await page.evaluate(()=>App.P.song));
    await key("song").press("ArrowDown");assert.equal(await key("songAll").evaluate(el=>el===document.activeElement),true);
    await key("songAll").press("ArrowUp");await key("songPiece").press("Space");
    assert.equal(await page.evaluate(()=>App.P.song),0);assert.equal(await page.evaluate(()=>App.Seq.playing),false);
    await key("play").tap();await key("rhythmTools").press("ArrowDown");await key("arm").press("Escape");
    assert.equal(await page.locator(".kv-empty-hint").count(),0,"playing an empty grid never draws a floating pointer");
    assert.equal(await key("arm").count(),0);assert.equal(await key("rhythmTools").evaluate(el=>el===document.activeElement),true);
    await key("song").tap();await page.locator(".kv-beats").click();assert.equal(await key("songAll").count(),0);
    assert.ok(await page.evaluate(()=>App.Seq.playing));await key("play").tap();
    await checkDeskDrags(page);
    await checkEraser(page,key);
    // The source, its six row pads, its steps and its effects stay on this desk.
    // Compose two different collections, then verify that switching keeps the
    // previous rhythm visible in its eight-beat miniature on the source card.
    for(const [source,track,row,step,name] of [[4,3,0,1,"Kráva"],[6,5,2,4,"Klíče"]]){
      await item("track",source).tap();const pad=key("pad",'[data-row="'+row+'"]');
      assert.equal(await pad.getAttribute("aria-label"),"Přehrát zvuk: "+name);
      const bounds=await pad.boundingBox(),note=await cell(row,step).boundingBox();
      assert.ok(Math.abs(bounds.y+bounds.height/2-note.y-note.height/2)<1,"played picture sits on its own row");
      await pad.tap();await cell(row,step).tap();assert.match(await cell(row,step).getAttribute("aria-label"),new RegExp(name));
      assert.equal(await item("track",source).locator(".kv-source-print .used").count(),1);
      assert.equal(await page.evaluate(([t,c])=>App.P.tracks[t].clips[0][0].s===c*2,[track,step]),true);
      assert.equal(await page.locator("#kids-inline-sound [data-sound=pad]").isVisible(),true);
    }
    await item("track",4).tap();assert.equal(await cell(0,1).getAttribute("aria-pressed"),"true");
    assert.equal(await item("track",6).locator(".kv-source-print .used").count(),1);
    // Read the live level and the character animation in the same display frames.
    await page.evaluate(()=>{
      window.bandMeter={part:0,audio:0,mouth:0};
      const sample=()=>{
        if(!App.Kids.active)return;
        const m=window.bandMeter;m.audio=Math.max(m.audio,App.KidsMusic.levels()[m.part]);
        const el=document.querySelector('.kv-musician[data-index="'+m.part+'"]');
        m.mouth=Math.max(m.mouth,Number(el?.style.getPropertyValue("--amplitude")||0));
        requestAnimationFrame(sample);
      };sample();
    });
    for(let t=0;t<4;t++){
      await item("track",t).tap();
      await page.evaluate(i=>Object.assign(window.bandMeter,{part:i,audio:0,mouth:0}),t);
      await cell(3,2*t).tap();
      assert.equal(await cell(3,2*t).getAttribute("aria-pressed"),"true");
      await page.waitForFunction(()=>bandMeter.audio>.005 && bandMeter.mouth>.005);
    }
    assert.equal(await page.evaluate(()=>window.kidMicProbe.requests),1);
    // A held note changes articulation. A held player opens the sound wardrobe.
    await held(cell(3,6),()=>page.waitForFunction(()=>App.P.tracks[6].clips[0][0]?.v>.85));
    await held(item("track",3),()=>key("costume").first().waitFor());
    await checkPanel(page,"Sound wardrobe");await item("costume",2).tap();
    await key("eraser").tap();await checkPanel(page,"Eraser actions",".kv-eraser-tools[open]");
    assert.match(await key("erase").getAttribute("aria-label"),/Hlas.*dílek A/);
    await key("erase").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),0);
    await key("undo").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),1);
    await key("rhythmTools").tap();await key("random").tap();assert.ok(await page.evaluate(()=>App.P.tracks[6].clips[0].length));
    await key("undo").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),1);
    await checkPanel(page,"Live pads on score");await key("song").tap();await key("songAll").tap();
    await key("rhythmTools").tap();assert.match(await key("arm").getAttribute("aria-label"),/obrázky vlevo.*dílku A/);await key("arm").tap();
    assert.ok(await key("finishTaps").isVisible());assert.equal(await page.evaluate(()=>App.P.song),0,"the take records the pictured piece");
    assert.equal(await page.locator(".kv-live-input").count(),1);
    await page.waitForFunction(()=>App.Seq.playing && App.Seq.frame()?.step>=1);
    await key("pad",'[data-row="0"]').tap();
    assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),2);
    await key("finishTaps").tap();assert.equal(await page.locator(".kv-live-input").count(),0);
    assert.equal(await page.evaluate(()=>App.Seq.playing),true);await key("play").tap();
    const tempo=key("tempo"), bounds=await tempo.boundingBox();
    await tempo.tap({position:{x:Math.floor(bounds.width-6),y:Math.floor(bounds.height/2)}});
    assert.equal(await page.evaluate(()=>App.P.bpm),148);
    assert.equal(await tempo.getAttribute("aria-valuetext"),"Raketa, 148 úderů za minutu");
    assert.equal(await tempo.evaluate(el=>getComputedStyle(el.parentElement).outlineStyle),"none","adjusting tempo by touch leaves its pill clear");
    await item("pattern",1).tap();await cell(2,1).tap();
    assert.equal(await key("appendPiece").count(),0,"there is one add action at the end of the strip");
    await key("appendSlot").tap();
    assert.deepEqual(await page.evaluate(()=>App.P.chain),[0,1],"append the selected piece without leaving the score");
    assert.deepEqual(await page.locator(".kv-chain-print i>b").allTextContents(),["A","B"],"every piece shows its letter in running order");
    // The song strip is the only place for the order: nothing opens from it, a tap on a place selects its piece.
    assert.equal(await key("openArrange").count(),0);
    await page.locator(".kv-chain-print i").first().tap();
    assert.equal(await item("pattern",0).getAttribute("aria-pressed"),"true");assert.equal(await page.locator(".kv-sheet:not([hidden])").count(),0);
    assert.deepEqual(await page.locator(".kv-chain-print i.current").count(),1,"the edited piece's places in the song are marked");
    await item("pattern",1).tap();
    // Space is the transport. The desktop note and file shortcuts remain parked.
    await page.keyboard.press("Space");await page.waitForFunction(()=>App.Seq.playing && App.Seq.frame()?.step>=1);
    await page.keyboard.press("Space");await page.waitForFunction(()=>!App.Seq.playing);
    await page.keyboard.press("Control+k");assert.equal(await page.locator("dialog[open]").count(),0);
    await key("mic").tap();await page.waitForFunction(()=>App.KidsMusic.recording()==="recording" && App.E.ctx.currentTime-kidMicProbe.start>.37);
    await key("mic").tap();await page.waitForFunction(()=>App.P.tracks[6].smp.id && App.KidsMusic.recording()==="idle");
    const voice=await page.evaluate(()=>{
      const probe=window.kidMicProbe,part=App.P.tracks[6];probe.sine.stop();
      return {id:part.smp.id,seconds:App.samples.get(part.smp.id).buffer.duration,count:probe.requests,ended:probe.track.readyState};
    });
    assert.ok(voice.seconds>.12 && voice.seconds<=6);assert.equal(voice.count,2);assert.equal(voice.ended,"ended");
    await key("shelf").tap();await key("save").tap();await page.waitForFunction(()=>App.KidsStore.slot===0);
    const savedCover=await item("slot",0).elementHandle(),shelfStatus=base.locator(".kv-song-status");
    assert.equal(await shelfStatus.textContent(),"Písnička 1 je uložená.");
    await page.waitForFunction(()=>document.querySelector(".kv-song-status")?.textContent==="");
    assert.ok(await savedCover.evaluate(el=>el.isConnected),"the saved cover stays under the pointer after the status clears");
    await savedCover.dispose();
    const expected=await page.evaluate(()=>{const P=App.P;return {notes:P.tracks.map(t=>t.clips.slice(0,4)),chain:P.chain,costumes:P.kidsBand.costumes};});
    await page.keyboard.press("Control+z");
    assert.equal(await page.evaluate(()=>App.P.tracks[6].smp.id),voice.id,"a shelf shortcut leaves the song open as saved");
    await key("back").tap();await key("undo").tap();
    assert.equal(await page.evaluate(()=>App.P.tracks[6].smp.id),null,"one step back from Save undoes the last musical edit");
    assert.equal(await page.evaluate(()=>App.KidsStore.read(0).tracks[6].smp.id),voice.id,"the saved recording stays on its shelf");
    await key("redo").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].smp.id),voice.id);
    await key("shelf").tap();await checkPanel(page,"Shelf");await key("new").tap();
    assert.ok(await page.evaluate(()=>App.P.tracks.every(t=>t.clips.every(c=>!c.length))));
    await key("shelf").tap();await item("slot",0).tap();await page.waitForFunction(id=>App.P.tracks[6].smp.id===id,voice.id);
    assert.equal(await page.evaluate(()=>kidMidi.sent),0,"The band sent notes or transport to the console's MIDI port");
    await page.evaluate(()=>{kidMicProbe.defer=true;kidMicProbe.grant=null;});
    await key("mic").tap();await page.waitForFunction(()=>App.KidsMusic.recording()==="pending" && kidMicProbe.grant);
    await held(key("lock"),()=>page.waitForFunction(()=>!App.Kids.active));
    await page.evaluate(()=>{kidMicProbe.grant();kidMicProbe.sine.stop();});
    await page.waitForFunction(()=>kidMicProbe.track.readyState==="ended" && !App.E.input && App.KidsMusic.recording()==="idle");
    assert.equal(await page.evaluate(()=>App.take===window.parkedBandTestTake && App.canUndo()),true);
    assert.deepEqual(await page.evaluate(()=>App.sanitize(App.P)),adult);
    await page.locator("#kids-entry").tap();await visibleKids();
    // A clean navigation without a query exercises the remembered preference and
    // decodes the saved voice from IndexedDB again. The captured audio is local.
    await page.goto(url.href);await visibleKids();
    await page.waitForFunction(id=>App.samples.has(id) && App.P.tracks[6].smp.id===id,voice.id);
    const start=Date.now();
    await held(key("lock"),()=>page.waitForFunction(()=>!App.Kids.active));
    assert.ok(Date.now()-start>=1850,"Short lock hold exited early");
    assert.deepEqual(await page.evaluate(()=>App.sanitize(App.P)),adult);
    // Direct bookmark entry and an explicit exit transfer. Use the short tap to
    // load songs and the two-second shelf hold to reach the adult confirmation.
    url.search="?kids";await page.goto(url.href);await visibleKids();
    await key("shelf").tap();
    const confirm=page.getByRole("dialog",{name:"Open band song?"});
    await held(item("slot",0),()=>confirm.waitFor());
    await confirm.getByRole("button",{name:"Cancel",exact:true}).click();await visibleKids();
    await key("shelf").tap();await held(item("slot",0),()=>confirm.waitFor());
    await confirm.getByRole("button",{name:"Open in console",exact:true}).click();
    await page.waitForFunction(id=>!App.Kids.active && App.P.tracks[6].smp.id===id && App.samples.has(id),voice.id);
    const imported=await page.evaluate(async()=>{
      const P=App.P,buf=await App.Seq.bounce();let sum=0,peak=0;
      for(const v of buf.getChannelData(0)){if(!Number.isFinite(v))throw Error("Non-finite recorded song");sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      return {shape:{notes:P.tracks.map(t=>t.clips.slice(0,4)),chain:P.chain,costumes:P.kidsBand.costumes},
        rms:Math.sqrt(sum/buf.length),peak};
    });
    assert.deepEqual(imported.shape,expected);assert.ok(imported.rms>.0005 && imported.peak>.01 && imported.peak<=1);
    // The second sample family on a strip is editable in the ordinary console.
    await page.evaluate(()=>App.select(4,0));
    const bank=page.getByRole("button",{name:"Pad bank",exact:true});
    await bank.click();await page.getByRole("menuitem",{name:"Pads 9–16"}).click();
    const highPad=page.locator('#dv .pd[data-note="51"]');
    await highPad.click();assert.equal(await page.evaluate(()=>App.P.sel.pad),15);
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});
      assert.equal(await bank.evaluate(b=>{
        const module=b.closest(".md"),square=module.querySelectorAll(".pd");
        return square.length===8 && [...square].every(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
      }),true,"all upper-bank pads are playable at "+width+"×"+height);
    }
    await page.evaluate(()=>App.select(0,0));
    assert.equal(await bank.count(),0);assert.equal(await page.evaluate(()=>App.P.sel.pad),7);
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    await page.waitForFunction(()=>App.P.name==="DESK ORIGINAL");
    assert.deepEqual(await page.evaluate(()=>App.sanitize(App.P)),adult);
    assert.deepEqual(errors,[]);
    console.log("Kids studio · touch targets and six viewports, inline picture rows and effects, independent kit rhythms, four audible characters, costumes, arrangement, shelf handoff and Undo · virtual mic "+voice.seconds.toFixed(2)+" s · console bounce peak "+imported.peak.toFixed(4)+", RMS "+imported.rms.toFixed(4));
  }finally{await context.close();}
};
