"use strict";
const assert = require("node:assert/strict");

module.exports = async function materialAndMidi(main) {
  const context = await main.context().browser().newContext({viewport:{width:1280,height:720}});
  const page = await context.newPage(), errors = [];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.addInitScript(()=>{
      const input={id:"keys",name:"Bench keys",state:"connected"};
      const output={id:"receiver",name:"Synth receiver",state:"connected",clear(){},send(bytes,time){window.messages.push([Array.from(bytes),time]);}};
      window.messages=[];window.hardware={inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]])};
      window.pulse=(bytes,ms)=>input.onmidimessage?.({currentTarget:input,data:bytes,timeStamp:ms ?? performance.now()});
      Object.defineProperty(navigator,"requestMIDIAccess",{configurable:true,value:async()=>window.hardware});
    });
    await page.goto(main.url());
    await page.waitForFunction(()=>window.App?.P?.midiIO);
    await page.evaluate(async()=>{
      const P=App.P, b=new AudioBuffer({length:10000,numberOfChannels:1,sampleRate:44100});
      const x=b.getChannelData(0); for(let i=0;i<x.length;i++)x[i]=.4*Math.sin(i*.06)*Math.exp(-5*i/x.length);
      P.tracks[6].smp.id=App.addBuffer("metal",b); P.tracks[6].clips[0]=[{s:0,n:60,l:2,v:.8,p:1,off:.18}];
      P.tracks[6].automation[0]={macro1:{mode:"linear",points:[{s:0,v:.2},{s:12,v:1}]}};
      P.tracks[0].clips[0]=[{s:4,n:36,l:2,v:.7,p:1}];P.performance.loops[0][0]=7;
      App.select(6,0);App.commit();App.refresh();
    });
    const command=async(name)=>{await page.getByRole("button",{name:"File",exact:true}).click();await page.getByText(name,{exact:true}).click();};
    await command("Material library…");
    const dialog=page.getByRole("dialog");
    await dialog.getByText("The library is empty.",{exact:false}).waitFor();
    await dialog.getByLabel("Capture scope").selectOption("pattern");
    await dialog.getByLabel("Material name").fill("Two voices");await dialog.getByLabel("Tags",{exact:true}).fill("break metal");
    await dialog.getByRole("button",{name:"Save material"}).click();
    await dialog.getByText("Saved Two voices",{exact:true}).waitFor();
    await dialog.getByLabel("Minimum BPM").fill("140");
    await dialog.getByText("No matching material.").waitFor();
    await dialog.getByLabel("Minimum BPM").fill("");await dialog.getByLabel("Search library").fill("metal");
    await dialog.getByRole("button",{name:"Done"}).click();
    await page.reload();await page.waitForFunction(()=>App.P?.tracks[6].clips[0].length);
    await page.evaluate(()=>{App.P=App.newProject(); App.select(0,3);App.P.bpm=144;App.commit();App.refresh();App.samples.clear();});
    await command("Material library…");await dialog.getByRole("button",{name:"Audition",exact:true}).click();
    await dialog.getByText(/audition at 144 BPM/).waitFor();
    await dialog.getByRole("button",{name:"Insert",exact:true}).click();
    await dialog.getByText(/Two voices inserted into D/).waitFor();
    let check=await page.evaluate(()=>[App.P.sel.p,App.P.bpm,App.P.tracks[6].clips[3][0].off,App.P.tracks[0].clips[3][0].s,App.P.performance.loops[0][3],App.P.tracks[6].automation[3].macro1.points.length,!!App.samples.get(App.P.tracks[6].smp.id)?.buffer]);
    assert.deepEqual(check,[3,144,.18,4,7,2,true]);
    const title=await dialog.locator(".library-drag").boundingBox();
    const cell=await page.locator("#mx .cl").nth(8+2).boundingBox();
    await page.mouse.move(title.x+5,title.y+4);await page.mouse.down();
    await page.mouse.move(title.x+17,title.y+4);await page.mouse.move(cell.x+4,cell.y+4,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>App.P.tracks[7].clips[2].length && App.P.tracks[1].clips[2].length);
    await page.evaluate(()=>{App.doUndo(-1);App.select(1,0);App.P.tracks[1].clips[0]=[{s:0,n:48,v:.8,l:2,p:1}];App.commit();App.refresh();});
    await page.getByRole("button",{name:"MIDI",exact:true}).click();
    await dialog.getByRole("button",{name:"Connect devices"}).click();
    await dialog.getByLabel("Output",{exact:true}).selectOption("receiver");
    await dialog.getByLabel("Clock",{exact:true}).selectOption("send");
    await dialog.getByLabel("Controller target").selectOption("macro2");
    await dialog.getByRole("button",{name:"Learn selected target"}).click();
    await page.keyboard.press("Escape");await dialog.getByText("Controller learn cancelled.").waitFor();
    await dialog.getByRole("button",{name:"Learn selected target"}).click();
    await page.evaluate(()=>window.pulse([0xb2,19,60]));
    await dialog.getByText(/CC 19 → BASS \/ Macro 2/).waitFor();
    await dialog.getByRole("button",{name:"Pick control on console"}).click();
    await page.locator('#mx [data-midi-track="1"][data-midi-target="pan"]').click();
    await page.evaluate(()=>window.pulse([0xb2,20,64]));
    assert.equal(await page.evaluate(()=>App.P.midiIO.bindings.length),2);
    await page.evaluate(()=>{App.recArm=true;App.Seq.play();});
    await page.waitForFunction(()=>App.Seq.now(1)?.step>=1);
    await page.evaluate(()=>{window.pulse([0xb2,19,12]);window.pulse([0xb2,20,64]);});
    await page.waitForFunction(()=>App.Seq.now(1)?.step>=3);
    await page.evaluate(()=>{window.pulse([0xb2,19,112]);window.pulse([0xb2,20,10]);App.Seq.stop();});
    check=await page.evaluate(()=>{
      const lane=App.P.tracks[1].automation[0].macro2, saved=App.sanitize(JSON.parse(JSON.stringify(App.P)));
      const kinds=messages.map(([bytes])=>bytes[0]);
      return [lane.points.length,lane.points[0].v<lane.points[1].v,App.P.tracks[1].automation[0].pan.points.length,App.P.tracks[1].pan<-.8,App.Rack.getMacro(1,1)>.8,
        saved.midiIO.bindings.length,saved.tracks[1].automation[0].macro2.points.length,
        [0xfa,0xf8,0x91,0x81,0xfc].every(byte=>kinds.includes(byte)),messages.filter(([msg])=>msg[0]===0xf8).every(([,t])=>Number.isFinite(t))];
    });
    assert.deepEqual(check,[2,true,2,true,true,2,2,true,true]);
    await page.getByRole("button",{name:/^MIDI 1$/}).click();
    await dialog.getByLabel("Clock",{exact:true}).selectOption("follow");await dialog.getByRole("button",{name:"Done"}).click();
    await page.evaluate(()=>{window.pulse([0xfa]); const start=performance.now();for(let i=0;i<31;i++)window.pulse([0xf8],start+i*25);});
    assert.deepEqual(await page.evaluate(()=>[App.Seq.playing,App.P.bpm]),[true,100]);
    await page.evaluate(()=>window.pulse([0xfc]));assert.equal(await page.evaluate(()=>App.Seq.playing),false);
    await page.evaluate(()=>{window.pulse([0xf2,8,0]);window.pulse([0xfb]);});
    await page.waitForFunction(()=>App.Seq.frame()?.absoluteStep===8);
    await page.evaluate(()=>window.pulse([0xfc]));
    await page.getByRole("button",{name:/^MIDI 1$/}).click();
    await dialog.getByRole("button",{name:"Pick control on console"}).click();
    await page.locator('#dv [data-midi-target="cutoff"]').click();
    await page.evaluate(()=>{window.pulse([0xb2,76,127]);window.pulse([0xb2,76,0]);});
    assert.equal(await page.evaluate(()=>App.P.tracks[1].syn.cut),20);
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
};
