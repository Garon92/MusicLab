"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");

module.exports=async function compositionLab(reference){
  const ctx=await reference.context().browser().newContext({viewport:{width:1100,height:620},acceptDownloads:true});
  const page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  const button=(name,root=page)=>root.getByRole("button",{name,exact:true});
  try{
    await page.goto(reference.url());await page.waitForSelector("#ed canvas");
    await page.evaluate(()=>App.select(1,0));
    await button("CYCLES…").click();
    const cycles=page.getByRole("dialog",{name:"Cycle sequencer"});
    await cycles.getByLabel("Pitch steps").fill("C3 D3 E3 G3 A3");
    await cycles.getByLabel("Pitch clock").selectOption("2/3");
    await cycles.getByLabel("Accent steps").fill("95 40 70 45 85 65 50");
    await cycles.getByLabel("Accent direction").selectOption("Reverse");
    await cycles.getByLabel("Gate steps").fill("20 80 45");
    await cycles.getByLabel("Gate phase").fill("1");
    await cycles.getByLabel("Capture length in steps").fill("4");
    await button("Audition",cycles).click();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll("dialog[open] button")).find(b=>b.textContent==="Capture last")?.disabled);
    await button("Capture last",cycles).click();
    const generated=await page.evaluate(()=>App.P.tracks[1].clips[0]);
    assert.equal(generated.length,6);assert.ok(generated.some(n=>n.fixed.offset>.2));assert.ok(new Set(generated.map(n=>n.v)).size>=3);
    await page.evaluate(()=>{const P=App.P;P.name="CYCLE LAB";P.chain=[0,0];P.song=1;App.commit();App.refresh();});
    await button("ARRANGE…").click();const song=page.getByRole("dialog",{name:"Song arrangement"});
    await button("Song automation",song).click();
    await song.getByLabel("Point value percent").fill("0");await song.getByLabel("Outgoing bend").fill("-100");await button("Set point",song).click();
    await song.getByLabel("Point step").fill("32");await song.getByLabel("Point value percent").fill("100");await button("Set point",song).click();
    await button("Apply arrangement",song).click();
    const model=await page.evaluate(()=>{
      const P=App.P,curve=P.songCurves[1].vol,A=App.SongCurves,result={values:[0,8,16,24,32].map(s=>A.value(curve,s))};
      const rep=A.editRange(curve,8,24,2,1),stretch=A.editRange(curve,8,24,1,2);
      result.repeat=[8,12,23,24,28,39].map(s=>A.value(rep,s));
      result.stretch=[8,16,24,32,40].map(s=>A.value(stretch,s));
      const values=[];A.schedule({automate(i,t,lanes,step){values.push(App.curveValue(lanes.vol,step));}},P,1,{},0,16,0,1,true);
      result.scheduled=values;
      const copy=structuredClone(P);App.Arrangement.relocate(copy,[{p:0,old:0},{p:0,rest:true,bars:1},{p:0,old:1}]);result.relocated=[24,32,40].map(s=>A.value(copy.songCurves[1].vol,s));
      return result;
    });
    assert.deepEqual(model.values,[0,.0625,.25,.5625,1]);assert.equal(model.scheduled.length,4);
    assert.ok(model.scheduled.every((v,i)=>Math.abs(v-((16+i/4)/32)**2)<1e-6));
    assert.deepEqual(model.repeat.slice(0,3),model.repeat.slice(3));
    assert.ok(model.stretch.every((v,i)=>Math.abs(v-((8+4*i)/32)**2)<1e-6));
    assert.ok(model.relocated.every((v,i)=>Math.abs(v-[.25,.25,.5625][i])<1e-6));
    await button("Play pattern or song").click();await page.waitForFunction(()=>App.Seq.frame()?.absoluteStep>=1);await button("Stop playback").click();
    const measured=await page.evaluate(async()=>{
      const buf=await App.Seq.bounce();let sum=0,peak=0;
      for(const v of buf.getChannelData(0)){if(!Number.isFinite(v))throw Error("Non-finite sample");sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      const imported=App.MidiImport.read(await App.Seq.midi().arrayBuffer(),"cycles.mid").project;
      return {peak,rms:Math.sqrt(sum/buf.length),midiNotes:imported.tracks.flatMap(t=>t.clips.flat()).length,cc:imported.tracks.some(t=>t.automation.some(bank=>bank.vol?.points.length))};
    });
    assert.ok(measured.peak>.005 && measured.rms>.001);assert.ok(measured.midiNotes>=generated.length && measured.cc);
    const file=async(label)=>{await button("File").click();await page.getByRole("menuitem",{name:label}).click();};
    const [save]=await Promise.all([page.waitForEvent("download"),file(/Save project/i)]);
    const packed=await fs.readFile(await save.path());const before=JSON.parse(packed);
    await page.evaluate(()=>{App.P.name="TEMP";App.P.cycles[1].pitch.values=[];App.P.songCurves[1]={};App.commit();});
    const [picker]=await Promise.all([page.waitForEvent("filechooser"),file(/Open project/i)]);
    await picker.setFiles({name:"Lab.json",mimeType:"application/json",buffer:packed});
    await page.locator("dialog[open] .confirm-action").click();
    await page.waitForFunction(()=>App.P.name==="CYCLE LAB");
    const reopened=await page.evaluate(()=>({cycles:App.P.cycles,songCurves:App.P.songCurves,notes:App.P.tracks[1].clips[0]}));
    assert.deepEqual(reopened.cycles,before.cycles);assert.deepEqual(reopened.songCurves,before.songCurves);assert.deepEqual(reopened.notes,generated);
    assert.equal(await page.evaluate(()=>{const draft=structuredClone(App.P);draft.tracks[1].clips[0][0].v=.01;return App.sanitize(draft).tracks[1].clips[0][0].v;}),.01);
    assert.deepEqual(errors,[]);console.log("  Cycle capture, curved song automation, section edits, JSON and MIDI round trips",measured);
  }finally{await ctx.close();}
};
