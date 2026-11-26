/* Exercise real region playback, alternate takes, loop capture, stretch and portable audio. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
function sampleWav(){
  const sr=24000,n=sr,b=Buffer.alloc(44+n*2);
  b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
  b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write("data",36);b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++){
    const t=i/sr,age=t%0.25, amplitude=age<.085 ? .62 : .12;
    b.writeInt16LE(Math.round(32767*amplitude*Math.sin(2*Math.PI*440*t)),44+2*i);
  }
  return b;
}
module.exports=async function audioStudio(reference) {
  const browser=reference.context().browser(),p=await browser.newPage({viewport:{width:1100,height:620}});
  const errors=[];p.on("pageerror",e=>errors.push(e.message));p.setDefaultTimeout(10000);
  let imported;
  try {
    await p.goto(reference.url());await p.waitForSelector("#ed canvas");
    const button=(name)=>p.getByRole("button",{name,exact:true});
    const number=async(name,value)=>{const el=p.getByRole("spinbutton",{name,exact:true});await el.fill(String(value));await el.press("Tab");};
    const choice=(name,value)=>p.getByRole("combobox",{name,exact:true}).selectOption(String(value));
    await button("AUDIO…").click();
    const wav={name:"ATTACKS.wav",mimeType:"audio/wav",buffer:sampleWav()};
    const chooser=p.waitForEvent("filechooser");await button("Import audio…").click();await (await chooser).setFiles(wav);
    await p.waitForFunction(()=>App.P.audio.regions.length===1);
    await button("Play transport").click();await p.waitForFunction(()=>App.Seq.frame()?.absoluteStep>=1);await button("Stop transport").click();
    // Route a known tone to the dry track input. Capture goes through the real recorder.
    await choice("Record source","track");
    await p.evaluate(()=>{
      const E=App.E,src=E.ctx.createOscillator(),g=E.ctx.createGain();src.frequency.value=230;g.gain.value=.2;
      src.connect(g).connect(E.tracks[0].instrument);src.start();window.studioTestTone=src;
    });
    await button("Record take").click();
    await p.waitForFunction(()=>App.P.audio.regions[0].takes.length===2);
    await number("Cursor · step",4);await button("Split at cursor").click();
    await p.waitForFunction(()=>App.P.audio.regions.length===2);
    await choice("Take",0);
    const comp=await p.evaluate(()=>App.P.audio.regions.map(r=>[r.take,r.takes.length,r.len,r.takes[r.take].offset]));
    assert.deepEqual(comp,[[1,2,.5,0],[0,2,.5,.5]]);
    await number("Start · step",3);await button("Crossfade").click();
    assert.deepEqual(await p.evaluate(()=>App.P.audio.regions.map(r=>[r.fin,r.fout])),[[0,.125],[.125,0]]);
    await number("Trim out · s",.95);await number("Repeats",2);
    const mix=await p.evaluate(async()=>{
      const b=await App.Seq.bounce(),arr=b.getChannelData(0);let energy=0,peak=0;
      for(const x of arr){energy+=x*x;peak=Math.max(peak,Math.abs(x));}
      return {rms:Math.sqrt(energy/arr.length),peak};
    });
    assert.ok(Number.isFinite(mix.rms) && mix.rms>.002 && mix.peak<1,"Real timeline WAV mix");
    await button("Looper").click();await number("Cursor · step",16);
    await button("Overdub layer").click();await p.waitForFunction(()=>App.P.audio.regions.filter(r=>r.layer).length===1);
    await p.evaluate(()=>window.studioTestTone.stop());
    await button("Play loop").click();await button("Overdub layer").click();
    await p.waitForFunction(()=>App.P.audio.regions.filter(r=>r.layer).length===2);
    const layerLevels=await p.evaluate(()=>App.P.audio.regions.filter(r=>r.layer).map(r=>{
      const b=App.samples.get(r.takes[0].sample).buffer,x=b.getChannelData(0);
      return {seconds:b.duration,rms:Math.sqrt(x.reduce((sum,v)=>sum+v*v,0)/x.length)};
    }));
    assert.equal(layerLevels[0].seconds,2);assert.ok(layerLevels[0].rms>.05);
    assert.ok(layerLevels[1].rms<.005,"Overdubs exclude previous layers at the dry instrument input");
    await button("Stop loop").click();await button("Undo layer").click();
    assert.equal(await p.evaluate(()=>App.P.audio.regions.filter(r=>r.layer).length),1);
    await button("Close").click();
    await p.evaluate(()=>{const t=App.P.tracks[6];t.smp.id=App.P.audio.regions[0].takes[0].sample;App.select(6,0);App.commit();App.refresh();});
    await button("EDIT…").click();
    await button("Detect transients").click();
    const markers=await p.evaluate(()=>App.P.tracks[6].smp.markers);
    assert.ok([.25,.5,.75].every(pos=>markers.some(m=>Math.abs(m-pos)<.012)),"Localized transient boundaries");
    await number("Source BPM",92);await number("Target BPM",120);await button("+ Anchor").click();
    await number("Destination · %",55);await button("Apply stretch").click();
    await p.waitForFunction(()=>App.P.tracks[6].smp.warpSource);
    const warp=await p.evaluate(()=>{
      const d=App.P.tracks[6].smp,b=App.samples.get(d.id).buffer,x=b.getChannelData(0);let crossings=0;
      const lo=Math.round(.1*b.sampleRate),hi=Math.round(.31*b.sampleRate);
      for(let i=lo+1;i<hi;i++)if(x[i]>=0 && x[i-1]<0)crossings++;
      return {duration:b.duration,hz:crossings*b.sampleRate/(hi-lo),anchors:d.warpSpec.anchors};
    });
    assert.ok(Math.abs(warp.duration-92/120)<.001);assert.ok(Math.abs(warp.hz-440)<12,`Pitch preserved: ${warp.hz}`);
    assert.deepEqual(warp.anchors,[[.5,.55]]);await button("Close").click();
    const saved=p.waitForEvent("download");await p.evaluate(()=>App.file("save"));
    const bytes=await fs.readFile(await (await saved).path()),json=JSON.parse(bytes);
    assert.ok(json.samples.some(s=>s.id===json.tracks[6].smp.warpSource));
    for(const r of json.audio.regions)for(const t of r.takes)assert.ok(json.samples.some(s=>s.id===t.sample));
    imported=await browser.newPage();imported.on("pageerror",e=>errors.push(e.message));
    await imported.goto(reference.url());await imported.waitForSelector("#ed canvas");
    const open=imported.waitForEvent("filechooser");await imported.evaluate(()=>App.file("open"));
    await (await open).setFiles({name:"Studio.musiclab.json",mimeType:"application/json",buffer:bytes});
    await imported.getByRole("button",{name:"Open project",exact:true}).click();
    await imported.waitForFunction(()=>App.P.audio.regions.length===3 && App.samples.has(App.P.tracks[6].smp.id));
    assert.deepEqual(await imported.evaluate(()=>App.P.audio.regions.map(r=>r.take)),[1,0,0]);
    // Substitute only the device boundary. The live MediaStreamSource, worklet
    // recorder, region placement and portable WAV encoding remain production code.
    await imported.evaluate(()=>{
      const E=App.audio(),dest=E.ctx.createMediaStreamDestination(),osc=E.ctx.createOscillator(),gain=E.ctx.createGain();
      osc.frequency.value=311;gain.gain.value=.25;osc.connect(gain).connect(dest);osc.start();
      // WebKit drops a device object nothing refers to, and a stand-in defined on it goes with it: hold the object.
      window.testMic={osc,dest,requests:0,devices:navigator.mediaDevices};
      Object.defineProperty(window.testMic.devices,"getUserMedia",{configurable:true,value:async()=>{
        window.testMic.requests++;return dest.stream;
      }});
    });
    const ib=(name)=>imported.getByRole("button",{name,exact:true});
    await ib("AUDIO…").click();
    await ib("Record region").click();
    await imported.waitForFunction(()=>document.querySelector(".ast-status")?.textContent.includes("STOP TO PLACE"));
    await imported.waitForFunction(()=>App.E.input && App.E.ctx.currentTime>=(window.micStarted ??= App.E.ctx.currentTime)+.65);
    await ib("Stop recording").click();
    await imported.waitForFunction(()=>App.P.audio.regions.length===4);
    const mic=await imported.evaluate(async()=>{
      const take=App.P.audio.regions.at(-1).takes[0],b=App.samples.get(take.sample).buffer,x=b.getChannelData(0);
      const orig=await App.sampleBlob(take.sample);const wav=await App.E.ctx.decodeAudioData(await orig.arrayBuffer());
      let en=0,cross=0;
      const from=Math.round(.2*b.sampleRate),end=Math.min(x.length,from+Math.round(.25*b.sampleRate));
      for(let i=from;i<end;i++){en+=x[i]*x[i];if(x[i]>=0 && x[i-1]<0)cross++;}
      const requests=window.testMic.requests;window.testMic.osc.stop();App.E.closeInput();
      return {rms:Math.sqrt(en/(end-from)),hz:cross*b.sampleRate/(end-from),requests,duration:wav.duration};
    });
    assert.equal(mic.requests,1);assert.ok(mic.duration>.45 && mic.rms>.05 && Math.abs(mic.hz-311)<12,JSON.stringify(mic));
    assert.deepEqual(errors,[]);
    console.log(`Audio studio · comp / crossfade / loop overdub / WAV / project · rms ${mix.rms.toFixed(4)} peak ${mix.peak.toFixed(3)} · warp ${warp.hz.toFixed(1)} Hz · internal track + virtual mic ${mic.hz.toFixed(1)} Hz`);
  } finally {await imported?.close();await p.close();}
};
