"use strict";

const assert = require("node:assert/strict");
const sizes = [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]];

async function checkPanel(page, label) {
  const issues = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    const errors=[],root=document.getElementById("kids-root");
    if (root.innerText.trim()) errors.push("Visible text: "+root.innerText.trim().slice(0,50));
    const band=root.querySelector(".kids-surface");
    for(const el of [document.documentElement,document.body,root,band]) {
      if(!el || el.hidden)continue;
      if(el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1)
        errors.push((el.id||el.nodeName)+" overflows by "+(el.scrollWidth-el.clientWidth)+"/"+(el.scrollHeight-el.clientHeight));
    }
    for(const el of root.querySelectorAll("button,input,select,[role=button]")) {
      if(el.closest("[hidden],[inert]") || !el.getClientRects().length)continue;
      const r=el.getBoundingClientRect(),id=el.getAttribute("aria-label")||el.dataset.k||el.tagName;
      if(!el.getAttribute("aria-label") && !el.textContent.trim())errors.push("Unlabelled "+id);
      if(r.width<63.95 || r.height<63.95)errors.push(id+" measures "+r.width.toFixed(1)+"×"+r.height.toFixed(1));
      if(r.x<-.5 || r.y<-.5 || r.right>innerWidth+.5 || r.bottom>innerHeight+.5)errors.push(id+" outside viewport");
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!el.disabled && (!hit || !el.contains(hit)))errors.push(id+" is covered at the centre");
    }
    return errors;
  });
  assert.deepEqual(issues,[],label+" "+page.viewportSize().width+"×"+page.viewportSize().height+" "+issues.join(", "));
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
    assert.equal(await key("note").count(),32);
    assert.equal(await page.evaluate(()=>App.P.tracks.every(t=>t.clips.every(c=>!c.length))),true);
    await key("lock").tap();assert.ok(await page.evaluate(()=>App.Kids.active));
    for(const [width,height] of sizes){await page.setViewportSize({width,height});await checkPanel(page,"Band");}
    await page.setViewportSize({width:1100,height:620});
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
      if(t)await item("track",t).tap();
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
    await key("erase").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),0);
    await key("undo").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),1);
    await key("random").tap();assert.ok(await page.evaluate(()=>App.P.tracks[6].clips[0].length));
    await key("undo").tap();assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),1);
    await item("track",3).tap();
    await checkPanel(page,"Live pads");await key("arm").tap();
    await page.waitForFunction(()=>App.Seq.playing && App.Seq.frame()?.step>=1);
    await key("pad",'[data-row="0"]').tap();
    assert.equal(await page.evaluate(()=>App.P.tracks[6].clips[0].length),2);
    await key("back").tap();await key("play").tap();
    const tempo=key("tempo"), bounds=await tempo.boundingBox();
    await tempo.tap({position:{x:Math.floor(bounds.width-6),y:Math.floor(bounds.height/2)}});
    assert.equal(await page.evaluate(()=>App.P.bpm),148);
    await item("pattern",1).tap();await cell(2,1).tap();
    await key("arrange").tap();await item("addPiece",1).tap();
    await checkPanel(page,"Song arrangement");
    assert.deepEqual(await page.evaluate(()=>App.P.chain),[0,1]);
    await item("piece",1).tap();await key("moveLeft").tap();
    assert.deepEqual(await page.evaluate(()=>App.P.chain),[1,0]);
    await key("moveRight").tap();assert.deepEqual(await page.evaluate(()=>App.P.chain),[0,1]);
    await key("back").tap();
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
    await key("save").tap();await page.waitForFunction(()=>App.KidsStore.slot===0);
    const expected=await page.evaluate(()=>{const P=App.P;return {notes:P.tracks.map(t=>t.clips.slice(0,4)),chain:P.chain,costumes:P.kidsBand.costumes};});
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
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    await page.waitForFunction(()=>App.P.name==="DESK ORIGINAL");
    assert.deepEqual(await page.evaluate(()=>App.sanitize(App.P)),adult);
    assert.deepEqual(errors,[]);
    console.log("Kids studio · touch targets and six viewports, four audible characters, costumes, arrangement, shelf handoff and Undo · virtual mic "+voice.seconds.toFixed(2)+" s · console bounce peak "+imported.peak.toFixed(4)+", RMS "+imported.rms.toFixed(4));
  }finally{await context.close();}
};
