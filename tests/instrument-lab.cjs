"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
module.exports=async function instrumentLab(reference) {
  const browser=reference.context().browser(),p=await browser.newPage({viewport:{width:1100,height:620}}),errors=[];
  p.on("pageerror",e=>errors.push(e.message));p.setDefaultTimeout(6000);
  const btn=name=>p.getByRole("button",{name,exact:true});
  const option=name=>p.getByRole("menuitem",{name:new RegExp(name)});
  const file=async label=>{await btn("File").click();await option(label).click();};
  const change=async(label,value)=>{const el=p.getByLabel(label,{exact:true});await el.fill(String(value));await el.press("Tab");};
  try{
    await p.goto(reference.url());await p.waitForFunction(()=>window.App?.InstrumentLab?.open && App.P);
    await p.evaluate(()=>App.select(3,0));
    await p.getByRole("button",{name:/SYNTH ENGINE/}).click();await option("MODULAR").click();await btn("WIRE…").click();
    await p.getByLabel("Module type").selectOption("amp");await btn("Add module").click();
    await p.getByLabel("Cable source").selectOption("osc1");await p.getByLabel("Cable destination").selectOption("amp1");await btn("Connect").click();
    await p.getByLabel("Cable source").selectOption("amp1");await p.getByLabel("Cable destination").selectOption("out");await btn("Connect").click();
    await p.locator(".il-cables button").first().click();
    await btn("Audition C4").click();
    assert.equal(await p.evaluate(()=>App.P.tracks[3].syn.graph.cables.length),2);
    await btn("Close").click();await btn("PATCH…").click();
    await p.getByLabel("New patch name").fill("Wire test");await btn("Save current sound").click();await btn("Close").click();
    await p.getByRole("button",{name:/SYNTH ENGINE/}).click();await option("WAVETABLE").click();await btn("EDIT…").click();
    await p.getByLabel("Harmonic partial").selectOption("1");await change("Sine coefficient",.55);await btn("Duplicate frame").click();
    const chooser=p.waitForEvent("filechooser");
    await btn("Load audio…").click();
    const sampleRate=24000,n=Math.floor(sampleRate/2),data=Buffer.alloc(44+2*n);
    data.write("RIFF");data.writeUInt32LE(data.length-8,4);data.write("WAVEfmt ",8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);
    data.writeUInt16LE(1,22);data.writeUInt32LE(sampleRate,24);data.writeUInt32LE(2*sampleRate,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write("data",36);data.writeUInt32LE(2*n,40);
    for(let i=0;i<n;i++)data.writeInt16LE(Math.round(14000*Math.sin(2*Math.PI*i*440/sampleRate)),44+2*i);
    await(await chooser).setFiles({name:"Partial.wav",mimeType:"audio/wav",buffer:data});
    await btn("Capture into frame").click();
    const frame=await p.evaluate(()=>App.P.tracks[3].syn.frames[1]);
    assert.ok(Math.hypot(frame.sin[1],frame.cos[1])>.36 && Math.hypot(frame.sin[0],frame.cos[0])<.03);
    await btn("Close").click();
    await file("Project tuning");const picker=p.waitForEvent("filechooser");await btn("Import Scala…").click();
    await(await picker).setFiles({name:"just.scl",mimeType:"text/plain",buffer:Buffer.from("! fixture\nJust major\n3\n5/4\n3/2\n2/1 octave\n")});
    await p.waitForFunction(()=>App.P.tuning.cents.length===3);
    await p.getByLabel("Reference MIDI note").selectOption("60");await change("Reference frequency",260);
    await btn("Sustain chord").click();await p.getByLabel("Active temperament").selectOption("off");
    await p.getByLabel("Active temperament").selectOption("on");await btn("Stop chord").click();await btn("Close").click();
    assert.deepEqual(await p.evaluate(()=>[60,61,62,63].map(n=>Math.round(App.mtof(n)))),[260,325,390,520]);
    const measure=await p.evaluate(async()=>{
      const L=App.InstrumentLab,P=App.sanitize(JSON.parse(JSON.stringify(App.P))),T=P.tracks[3],sr=24000;
      T.vol=.92;T.rev=T.dly=0;Object.assign(T.syn,{aa:.001,ad:.02,as:1,ar:.01,cut:11000,fenv:0,ftrk:0});
      const runs=[];
      for(const [design,scan] of [[1,0],[2,0],[2,.5],[2,1]]){
        T.syn.design=design;T.syn.scan=scan;T.syn.frames=[L.frameOf(),L.frameOf({sin:[0,1]})];
        const ctx=new OfflineAudioContext(2,sr,sr),E=App.Engine(ctx,()=>P,{offline:true});
        E.syncAll();E.play(3,61,1,.15,.65,true);const y=(await ctx.startRendering()).getChannelData(0);
        const window=y.slice(sr*.3,sr*.7);
        const magnitude=hz=>{let re=0,im=0;for(let i=0;i<window.length;i++){const a=2*Math.PI*hz*i/sr;re+=window[i]*Math.cos(a);im+=window[i]*Math.sin(a);}return 2*Math.hypot(re,im)/window.length;};
        runs.push({peak:window.reduce((a,b)=>Math.max(a,Math.abs(b)),0),rms:Math.sqrt(window.reduce((a,b)=>a+b*b,0)/window.length),a:magnitude(325),b:magnitude(650)});
      }
      return runs;
    });
    for(const r of measure)assert.ok(Number.isFinite(r.peak)&&r.peak<1 && r.rms>.005,JSON.stringify(measure));
    assert.ok(measure[0].a>.03 && measure[1].a>measure[1].b*3 && measure[3].b>measure[3].a*3,JSON.stringify(measure));
    assert.ok(measure[2].a>.02 && measure[2].b>.02,JSON.stringify(measure));
    const saved=p.waitForEvent("download");await file("Save project");const bytes=await fs.readFile(await(await saved).path());
    await p.evaluate(()=>{App.P=App.newProject();App.refresh();});
    const read=p.waitForEvent("filechooser");await file("Open project");await(await read).setFiles({name:"Instrument.musiclab.json",mimeType:"application/json",buffer:bytes});
    await btn("Open project").click();await p.waitForFunction(()=>App.P.tracks[3].syn.frames.length===3);
    assert.deepEqual(await p.evaluate(()=>[App.P.tracks[3].syn.graph.nodes.length,App.P.tracks[3].syn.design,App.P.tuning.hz]),[2,2,260]);
    await p.evaluate(()=>App.select(3,0));await btn("PATCH…").click();await p.getByLabel("Instrument patch",{exact:true}).selectOption({label:"Wire test"});await btn("Load patch").click();
    assert.deepEqual(await p.evaluate(()=>[App.P.tracks[3].syn.design,App.P.tracks[3].syn.graph.cables.length]),[1,2]);
    // Take one instrument from the editable graph to a playable, portable spectral sample.
    await file("Project tuning");await p.getByLabel("Active temperament").selectOption("off");await btn("Close").click();
    const grid=p.locator("#ed canvas"),rect=await grid.boundingBox();
    await grid.click({position:{x:rect.width*.32,y:rect.height*.23}});
    await p.waitForFunction(()=>App.P.tracks[3].clips[0].length===1);
    const note=await p.evaluate(()=>App.P.tracks[3].clips[0][0]);
    await btn("Play pattern or song").click();await p.waitForFunction(()=>App.Seq.playing && App.Seq.pos?.step>=2);await btn("Stop playback").click();
    await btn("AUDIO…").click();await btn("Resample…").click();
    await p.getByLabel("Source",{exact:true}).selectOption("t3");await p.getByLabel("Tap",{exact:true}).selectOption("post");
    await p.getByLabel("Destination track",{exact:true}).selectOption("5");
    await change("From · step",note.s);await change("To · step",note.s+2);await change("Tail · s",.2);
    await btn("Render range").click();await p.waitForFunction(()=>App.P.audio.regions.length===1);
    await btn("Spectrum…").click();await p.getByLabel("Operation",{exact:true}).selectOption("isolate");
    const fundamental=440*2**((note.n-69)/12);
    await change("Low · Hz",Math.round(fundamental*.75));await change("High · Hz",Math.round(fundamental*1.35));
    await p.getByLabel("Write to",{exact:true}).selectOption("sampler");await p.getByLabel("Sampler track",{exact:true}).selectOption("7");
    await btn("Send to sampler").click();await p.waitForFunction(()=>App.P.tracks[7].smp.id && !document.querySelector("dialog[open]"));
    await p.keyboard.down("a");
    await p.waitForFunction(()=>{const an=App.E.tracks[7].an,a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);return a.some(v=>Math.abs(v)>.001);});
    await p.keyboard.up("a");
    const exportFlow=p.waitForEvent("download");await file("Save project");
    const portable=await fs.readFile(await(await exportFlow).path());
    const restored=await browser.newPage();let captured;
    try{
      restored.on("pageerror",e=>errors.push(e.message));await restored.goto(reference.url());
      const importFlow=restored.waitForEvent("filechooser");
      await restored.getByRole("button",{name:"File",exact:true}).click();
      await restored.getByRole("menuitem",{name:/Open project/}).click();
      await(await importFlow).setFiles({name:"Graph to spectrum.json",mimeType:"application/json",buffer:portable});
      await restored.getByRole("button",{name:"Open project",exact:true}).click();
      await restored.waitForFunction(()=>App.P.tracks[7].smp.id && App.samples.has(App.P.tracks[7].smp.id));
      captured=await restored.evaluate(()=>{
        const s=App.P.tracks[7].smp,buf=App.samples.get(s.id).buffer,x=buf.getChannelData(0);
        return {peak:x.reduce((m,v)=>Math.max(m,Math.abs(v)),0),rms:Math.sqrt(x.reduce((a,v)=>a+v*v,0)/x.length),
          duration:buf.duration,notes:App.P.tracks[3].clips[0].length,sourceRecovered:App.samples.has(App.P.audio.regions[0].takes[0].sample),
          kind:App.P.tracks[7].kind,independent:s.id!==App.P.audio.regions[0].takes[0].sample};
      });
    }finally{await restored.close();}
    assert.ok(captured.rms>.001 && captured.peak<1 && captured.peak>.01 && captured.sourceRecovered && captured.independent && captured.kind==="smp" && captured.notes===1,JSON.stringify(captured));
    console.log("Graph → post-FX region → spectral isolation → sampler audition → portable project",captured);
    assert.deepEqual(errors,[]);
    console.log("Modular routing, cycle extraction, harmonic scanning, Scala tuning and portable projects passed",measure.map(r=>({peak:+r.peak.toFixed(4),rms:+r.rms.toFixed(4)})));
  }finally{await p.close();}
};
