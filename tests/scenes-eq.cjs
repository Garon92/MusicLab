/* Level-matched spectral editing and selective, audio-clock scene recalls. */
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
module.exports=async function scenesEq(reference) {
  const page=await reference.context().browser().newPage({viewport:{width:1100,height:620}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  try{
    await page.goto(reference.url());
    await page.getByRole("button",{name:"ROUTING…"}).click();
    let d=page.getByRole("dialog",{name:"Mixer routing"});
    await d.getByLabel("Mixer channel").selectOption("t1");
    await d.getByRole("button",{name:"Parametric EQ…"}).click();
    d=page.getByRole("dialog",{name:"Parametric EQ"});
    await d.getByLabel("EQ band",{exact:true}).selectOption("1");
    async function number(label,value){const el=d.getByLabel(label,{exact:true});await el.fill(String(value));await el.press("Tab");}
    await number("Frequency · Hz",1000);await number("Gain · dB",12);await number("Q",3);
    const dimensions=await d.evaluate(el=>[el.scrollWidth-el.clientWidth,Math.max(0,el.getBoundingClientRect().bottom-innerHeight)]);
    assert.ok(dimensions.every(n=>n<3),"EQ fits desktop viewport");
    await page.evaluate(()=>{
      const E=App.audio(),tone=E.ctx.createOscillator(),level=E.ctx.createGain();tone.frequency.value=1000;level.gain.value=.08;
      tone.connect(level).connect(E.tracks[1].tin);tone.start();window.testEqTone=tone;
    });
    await page.waitForFunction(()=>{
      const s=App.E.rack.eq(1).measure();return s && s.prePower>1e-6 && s.factor>.22 && s.factor<.3;
    },null,{timeout:8000});
    const readLevel=()=>page.evaluate(()=>{const a=App.E.tracks[1].an,data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length);});
    await page.waitForTimeout(250);
    const wet=await readLevel();
    await d.getByLabel("Monitor path").selectOption("dry");await page.waitForTimeout(180);const dry=await readLevel();
    assert.ok(wet>.01 && Math.abs(20*Math.log10(wet/dry))<1.8,"Level match uses the real pre/post signal: "+[wet,dry]);
    await d.getByLabel("Monitor path").selectOption("band");await number("Frequency · Hz",8000);await page.waitForTimeout(180);
    const isolated=await readLevel();assert.ok(isolated<dry*.22,"Band solo attenuates off-frequency program");
    await number("Frequency · Hz",1000);
    await d.getByRole("button",{name:"Close"}).click();
    await page.evaluate(()=>window.testEqTone.stop());await page.reload();
    assert.equal(await page.evaluate(()=>App.P.rack.strips[1].eq.bands[1].db),12);

    await page.evaluate(()=>{App.P.sel.t=1;App.P.tracks[1].pan=.75;App.P.rack.strips[1].macros[0]=.8;App.commit();App.refresh();});
    await page.getByRole("button",{name:"ROUTING…"}).click();
    await page.getByRole("button",{name:"Scenes…"}).click();d=page.getByRole("dialog",{name:"Setting scenes"});
    await d.getByLabel("Scene name").fill("Chorus");await d.getByRole("button",{name:"Save scene",exact:true}).click();
    await d.getByLabel("Morph length").selectOption("1");await d.getByLabel("Cue bar").fill("2");
    await d.getByRole("button",{name:"Add song cue"}).click();
    await page.evaluate(()=>{App.P.tracks[1].pan=-.6;App.P.rack.strips[1].macros[0]=0;App.P.tracks[2].pan=.34;App.commit();});
    await d.getByLabel("Level, pan & sends").uncheck();await d.getByRole("button",{name:"Recall",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>[App.P.tracks[1].pan,App.P.rack.strips[1].macros[0],App.P.tracks[2].pan]),[-.6,.8,.34]);
    await d.getByLabel("Level, pan & sends").check();
    await d.getByRole("button",{name:"Play",exact:true}).click();
    await page.waitForFunction(()=>App.Seq.playing && App.Seq.frame());
    await d.getByRole("button",{name:"Recall",exact:true}).click();
    const live=await page.evaluate(()=>[App.P.tracks[1].pan,App.E.manualSceneTrack(1,App.E.ctx.currentTime).pan,App.P.tracks[2].pan]);
    assert.ok(live[0]===.75 && live[1]<-.45 && live[2]===.34,"Live recall morphs from the current value and protects other tracks");
    await d.getByRole("button",{name:"Stop",exact:true}).click();await d.getByRole("button",{name:"Close"}).click();
    await page.evaluate(()=>App.doUndo(-1));
    assert.equal(await page.evaluate(()=>App.P.tracks[1].pan),-.6,"A recall is one undo checkpoint");
    const [download]=await Promise.all([page.waitForEvent("download"),page.evaluate(()=>App.file("save"))]);
    const bytes=await fs.readFile(await download.path()),file=JSON.parse(bytes);
    assert.equal(file.scenes.items[0].name,"Chorus");assert.equal(file.scenes.cues[0].bars,1);
    await page.evaluate(()=>{App.P.scenes.items=[];App.P.scenes.cues=[];App.commit();});
    const chooser=page.waitForEvent("filechooser");await page.evaluate(()=>App.file("open"));
    await (await chooser).setFiles({name:"Scene test.musiclab.json",mimeType:"application/json",buffer:bytes});
    await page.getByRole("button",{name:"Open project",exact:true}).click();
    await page.waitForFunction(()=>App.P.scenes.items[0]?.name==="Chorus");
    assert.deepEqual(await page.evaluate(()=>[App.P.scenes.cues[0].at,App.P.rack.strips[1].eq.bands[1].hz]),[16,1000]);
    const result=await page.evaluate(async()=>{
      const P=App.newProject(),T=P.tracks[1];P.bpm=240;P.pats[0].bars=2;
      Object.assign(T.syn,{w1:0,lv1:1,sub:0,noise:0,lv2:0,cut:18000,res:0,fenv:0,ftrk:0,aa:.002,ad:.01,as:1,ar:.02});
      T.vol=.8;T.dly=T.rev=0;T.pan=1;T.clips[0]=[{n:60,s:0,l:32,v:.6,p:1}];
      const values=App.Scenes.capture(P,[1],["mix"]);P.scenes={items:[{id:"pan",name:"Cross",values}],cues:[{at:0,id:"pan",bars:1}]};
      T.pan=-1;
      const restored=App.sanitize(JSON.parse(JSON.stringify(P)));const session=App.Scenes.session(restored);
      const mid=App.Scenes.projectAt(session,8);
      const {full,cut}=await App.Seq.renderSong({project:restored,stems:[{type:"track",index:1}]});
      const rms=(c,a,b)=>{const d=full.getChannelData(c).subarray(cut+Math.floor(a*full.sampleRate),cut+Math.floor(b*full.sampleRate));return Math.sqrt(d.reduce((p,x)=>p+x*x,0)/d.length);};
      const data=full.getChannelData(1);let peak=0;for(const x of data)peak=Math.max(peak,Math.abs(x));
      const renderEq=async gain=>{
        const ctx=new OfflineAudioContext(2,24000,24000),Q=App.newProject(),q=Q.rack.strips[0].eq.bands[1];
        Object.assign(q,{hz:1000,db:gain,q:3});const E=App.Engine(ctx,()=>Q,{offline:true,stems:[{type:"track",index:0}]});
        E.syncAll();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=1000;g.gain.value=.04;o.connect(g).connect(E.tracks[0].tin);o.start();
        const b=await ctx.startRendering(),wave=b.getChannelData(0).subarray(6000,18000);return Math.sqrt(wave.reduce((n,x)=>n+x*x,0)/wave.length);
      };
      return {mid:mid.tracks[1].pan,stored:restored.tracks[1].pan,peak,first:[rms(0,.05,.18),rms(1,.05,.18)],last:[rms(0,1.1,1.4),rms(1,1.1,1.4)],eq:[await renderEq(0),await renderEq(-12)]};
    });
    assert.ok(result.mid===0 && result.stored===-1 && result.peak>.02 && result.peak<1,"Cued scene round-trip and clean audio "+JSON.stringify(result));
    assert.ok(result.first[0]>result.first[1]*3 && result.last[1]>result.last[0]*8 && result.last[1]>.01,"One-bar audio-clock morph reaches right channel");
    assert.ok(Math.abs(20*Math.log10(result.eq[1]/result.eq[0])+12)<.4,"Offline EQ measures the requested cut");
    assert.deepEqual(errors,[]);
    console.log("Scenes + EQ · matched A/B "+(20*Math.log10(wet/dry)).toFixed(2)+" dB · exported cut "+(20*Math.log10(result.eq[1]/result.eq[0])).toFixed(2)+" dB · scene peak "+result.peak.toFixed(3));
  }finally{await page.close();}
};
