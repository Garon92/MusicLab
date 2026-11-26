/* Through the console: collect a live take, edit launches, import timed MIDI and render the result. */
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
module.exports=async function checkPerformance(reference){
  const page=await reference.context().browser().newPage({viewport:{width:1100,height:620}}),errors=[];
  page.setDefaultTimeout(10000);page.on("pageerror",e=>errors.push(e.message));
  try{
    await page.goto(reference.url());await page.waitForSelector("#ed canvas");
    await page.evaluate(()=>{
      const P=App.P;P.bpm=240;
      P.tracks[1].clips[0]=[{s:0,n:60,l:1,v:.8,p:1},{s:1,n:62,l:1,v:.5,p:1,off:.21}];
      P.tracks[2].clips[1]=[{s:0,n:72,l:4,v:.8,p:1}];P.performance.loops[1][0]=3;
      App.select(1,0);App.commit();App.refresh();
    });
    await page.evaluate(()=>{App.P.performance.loops[5][2]=80;App.select(5,2);App.Ed.sync();});
    await page.getByRole("button",{name:"Next bars",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>App.Ed.range()),{start:64,end:80});
    const grid=page.locator("#ed .ed-b canvas"),size=await grid.boundingBox();
    await grid.click({position:{x:size.width*.95,y:size.height*.32}});
    assert.ok(await page.evaluate(()=>App.P.tracks[5].clips[2].some(n=>n.s>=76)));
    await page.getByRole("button",{name:"AUTOMATION",exact:true}).click();
    await page.locator(".auto-toolbar").getByRole("button",{name:/shape/i}).click();
    await page.getByRole("button",{name:"Write whole lane"}).click();
    assert.equal(await page.evaluate(()=>App.P.tracks[5].automation[2].vol.points.at(-1).s),80);
    await page.getByRole("button",{name:"DRAW",exact:true}).click();
    await page.evaluate(()=>App.select(1,0));
    await page.getByRole("button",{name:"GROOVE…",exact:true}).click();
    let d=page.getByRole("dialog");
    await d.getByLabel("Live recording timing").selectOption("off");
    await d.getByRole("button",{name:"Extract clip",exact:true}).click();
    assert.ok(await page.evaluate(()=>Math.abs(App.P.groove.slots[1].off-.21)<.001));
    await d.getByLabel("Note offset in milliseconds").fill("-12");await d.getByRole("button",{name:"Set timing"}).click();
    await d.getByLabel("Groove strength").fill("50");await d.getByRole("button",{name:"Apply groove"}).click();
    const timed=await page.evaluate(()=>App.P.tracks[1].clips[0].map(n=>n.off));
    assert.ok(timed[0]<0 && timed[1]>0 && timed[1]<.21);
    await d.getByRole("button",{name:"Capture groove",exact:true}).click();
    await d.getByRole("button",{name:"Tap",exact:true}).click();
    await d.getByRole("button",{name:"Finish capture"}).click();
    assert.equal(await page.evaluate(()=>App.P.groove.name),"Played groove");
    await page.evaluate(()=>{
      const E=App.audio(),ctx=E.ctx,out=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),level=ctx.createGain();
      osc.frequency.value=750;level.gain.value=0;osc.connect(level).connect(out);osc.start();
      window.clapMic={out,level,osc,requests:0};
      Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:async()=>{window.clapMic.requests++;return out.stream;}});
    });
    await d.getByLabel("Groove capture source").selectOption("mic");
    await d.getByRole("button",{name:"Capture groove",exact:true}).click();
    await d.getByText("Listening for claps",{exact:true}).waitFor();
    await page.evaluate(()=>{
      const now=App.E.ctx.currentTime+.16, gain=window.clapMic.level.gain;
      for(const [delay,v] of [[0,.15],[.202,.8],[.365,.3]]){
        const at=now+delay;gain.setValueAtTime(0,at);gain.linearRampToValueAtTime(v,at+.002);
        gain.exponentialRampToValueAtTime(.0001,at+.028);gain.setValueAtTime(0,at+.03);
      }
    });
    await d.getByText("3 hits",{exact:true}).waitFor();
    await d.getByRole("button",{name:"Finish capture"}).click();
    const mic=await page.evaluate(()=>{
      window.clapMic.osc.stop();return {requests:window.clapMic.requests,closed:!App.E.input,groove:App.P.groove};
    });
    assert.equal(mic.requests,1);assert.equal(mic.closed,true);assert.equal(mic.groove.name,"Microphone claps");
    const accents=mic.groove.slots.filter(Boolean);assert.equal(accents.length,3);
    assert.ok(Math.max(...accents.map(s=>s.v))-Math.min(...accents.map(s=>s.v))>.1);
    assert.ok(accents.some(s=>Math.abs(s.off)>.04));
    await d.getByRole("button",{name:"Close"}).click();

    await page.getByRole("button",{name:"CHORDS…",exact:true}).click();d=page.getByRole("dialog");
    await d.getByLabel("Chord root").selectOption("0");await d.getByLabel("Chord quality").selectOption("maj");
    await d.getByRole("button",{name:"Insert",exact:true}).click();
    await d.getByLabel("Chord root").selectOption("7");await d.getByLabel("Chord quality").selectOption("7");
    await d.getByRole("button",{name:"Insert",exact:true}).click();
    await d.getByLabel("Harmony for "+await page.evaluate(()=>App.P.tracks[2].name)).selectOption("chord");
    await d.getByRole("button",{name:"Apply harmony"}).click();
    const notes=await page.evaluate(()=>[App.Harmony.pitches(App.P,2,72,0),App.Harmony.pitches(App.P,2,72,16)]);
    assert.deepEqual([...new Set(notes[0].map(n=>n%12))].sort((a,b)=>a-b),[0,4,7]);
    assert.deepEqual(notes[1].map(n=>n%12).sort((a,b)=>a-b),[2,5,7,11]);

    await page.getByRole("button",{name:"LIVE…",exact:true}).click();d=page.getByRole("dialog");
    await d.getByLabel("Launch quantization").selectOption("beat");
    await d.getByRole("button",{name:"Launch track 2 clip A",exact:true}).click();
    await d.getByRole("button",{name:"Record take",exact:true}).click();
    await d.getByRole("button",{name:"Finish take",exact:true}).waitFor();
    await page.waitForFunction(()=>App.Seq.frame()?.absoluteStep>=3);
    await d.getByRole("button",{name:"Launch track 3 clip B",exact:true}).click();
    await page.waitForFunction(()=>App.Seq.frame()?.lanes[2]?.p===1);
    const active=await page.evaluate(()=>{const f=App.Seq.frame();return [f.lanes[1].s,f.absoluteStep%3,f.lanes[2].s,(f.absoluteStep-f.lanes[2].s)%4];});
    assert.equal(active[0],active[1]);assert.equal(active[3],0);
    await d.getByRole("button",{name:"Finish take",exact:true}).click();
    const take=await page.evaluate(()=>App.P.performance.take);
    assert.ok(take.events.some(e=>e.t===1&&e.p===0));assert.ok(take.events.some(e=>e.t===2&&e.p===1));
    await d.getByLabel("Performance view").selectOption("take");
    await d.getByLabel("Event step").fill("1");await d.getByLabel("Event track").selectOption("2");await d.getByLabel("Event clip").selectOption("1");
    await d.getByRole("button",{name:"Add",exact:true}).click();
    await d.getByLabel("Performance length in steps").fill("32");
    await d.getByRole("button",{name:"Apply take",exact:true}).click();
    await d.getByRole("button",{name:"Close",exact:true}).click();
    const result=await page.evaluate(async()=>{
      const P=App.P,loaded=App.sanitize(JSON.parse(JSON.stringify(P)));
      const roundtrip=App.MidiImport.read(await App.Seq.midi().arrayBuffer(),"performance.mid").project;
      const events=roundtrip.tracks.flatMap(t=>t.clips.flat());
      const buf=await App.Seq.bounce(),data=buf.getChannelData(0);
      let peak=0,sum=0;for(const x of data){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
      return {peak,rms:Math.sqrt(sum/data.length),hasTiming:events.some(n=>Math.abs(n.off||0)>.02),hasHarmony:events.some(n=>n.n%12===4),source:loaded.performance.source,
        events:loaded.performance.take.events,groove:loaded.groove.quantize,chords:loaded.harmony.chords.length};
    });
    assert.equal(result.source,"take");assert.equal(result.groove,false);assert.equal(result.chords,2);assert.ok(result.events.length>=2);
    assert.ok(result.hasTiming && result.hasHarmony,JSON.stringify(result));assert.ok(result.rms>.0001 && result.peak<1,JSON.stringify(result));
    const chordWindow=await page.evaluate(()=>{
      const P=App.newProject(),ti=2,PITCH=63,sd=15/P.bpm,played=[];
      P.pats[0].bars=2;
      P.harmony={chords:[{root:0,type:"maj",bars:1},{root:7,type:"maj",bars:1}],follow:P.tracks.map((_,i)=>i===ti?"chord":"off")};
      P.tracks[ti].clips[0]=[{s:4,n:PITCH,l:24,v:.8,p:1,off:-.2}];
      for(let i=0;i<32;i++)App.Seq.emit({play(t,n,v,time,dur,poly){played.push({n,time,dur,poly});}},P,0,i,i*sd,sd);
      return {first:played.filter(e=>Math.abs(e.time/sd-3.8)<.001),next:played.filter(e=>Math.abs(e.time/sd-16)<.001)};
    });
    assert.equal(chordWindow.first.length,3);assert.equal(chordWindow.next.length,3);assert.ok(chordWindow.first.every(e=>e.poly));
    assert.deepEqual(chordWindow.next.map(e=>e.n%12).sort((a,b)=>a-b),[2,7,11]);

    const file=async pattern=>{
      await page.getByRole("button",{name:"File",exact:true}).click();await page.getByRole("menuitem",{name:pattern}).click();
    };
    const [saved]=await Promise.all([page.waitForEvent("download"),file(/Save project/i)]);
    const bytes=await fs.readFile(await saved.path()),stored=JSON.parse(bytes);
    assert.deepEqual(stored.performance.take.events,result.events);assert.equal(stored.harmony.follow[2],"chord");
    await page.evaluate(()=>{App.P.name="REPLACED";App.P.performance.take.events=[];App.commit();});
    const [picker]=await Promise.all([page.waitForEvent("filechooser"),file(/Open project/i)]);
    await picker.setFiles({name:saved.suggestedFilename(),mimeType:"application/json",buffer:bytes});
    await page.waitForFunction(name=>App.P.name===name || !!document.querySelector("dialog[open] .confirm-action"),stored.name);
    if(await page.locator("dialog[open] .confirm-action").count())await page.locator("dialog[open] .confirm-action").click();
    await page.waitForFunction(name=>App.P.name===name,stored.name);
    const restored=await page.evaluate(()=>({performance:App.P.performance,groove:App.P.groove,harmony:App.P.harmony}));
    for(const key of ["performance","groove","harmony"])assert.deepEqual(restored[key],stored[key]);
    assert.deepEqual(errors,[]);
    return {peak:result.peak,rms:result.rms};
  }finally{await page.close();}
};
