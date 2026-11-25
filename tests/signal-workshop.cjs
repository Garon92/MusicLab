// Known tones discriminate time and frequency selectivity, stems and measured custom convolution.
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");

module.exports=async function signalWorkshop(reference){
  const browser=reference.context().browser(),ctx=await browser.newContext({viewport:{width:1100,height:620}}),p=await ctx.newPage();
  const errors=[];p.on("pageerror",e=>errors.push(e.message));
  try{
    await p.goto(reference.url());await p.waitForSelector("#ed canvas");
    const button=t=>p.getByRole("button",{name:t,exact:true}),input=t=>p.getByRole("spinbutton",{name:t,exact:true}),choice=t=>p.getByRole("combobox",{name:t,exact:true});
    const set=async(label,value)=>{await input(label).fill(String(value));await input(label).press("Tab");};
    const ids=await p.evaluate(async()=>{
      const sr=48000,b=new AudioBuffer({numberOfChannels:2,sampleRate:sr,length:sr}), a=b.getChannelData(0),r=b.getChannelData(1);
      for(let i=0;i<sr;i++){a[i]=.2*(Math.sin(2*Math.PI*240*i/sr)+Math.sin(2*Math.PI*1800*i/sr));r[i]=-a[i];}
      const id=App.addBuffer("TWO TONES",b);
      App.AudioStudio.addRegion(id,0,0);App.P.tracks[0].dly=0;App.P.tracks[0].rev=1;App.P.tracks[0].pan=.5;App.P.tracks[0].vol=1;
      const ir=new AudioBuffer({numberOfChannels:1,sampleRate:sr,length:sr/5});ir.getChannelData(0)[sr/10]=1;
      App.commit();App.refresh();return {id,wav:Array.from(new Uint8Array(await App.wav(ir).arrayBuffer()))};
    });
    await button("IR…").click();const irFile=p.waitForEvent("filechooser");await button("Import impulse…").click();
    await(await irFile).setFiles({name:"100 MS REFLECTION.wav",mimeType:"audio/wav",buffer:Buffer.from(ids.wav)});
    await p.waitForFunction(()=>App.P.impulse.sample);ids.resp=await p.evaluate(()=>App.P.impulse.sample);await button("Close").click();
    await button("AUDIO…").click();await button("Play transport").click();await p.waitForFunction(()=>App.Seq.frame()?.absoluteStep>=1);await button("Stop transport").click();
    await button("Spectrum…").click();await set("From · s",.25);await set("To · s",.75);
    await set("Low · Hz",1600);await set("High · Hz",2000);await set("Gain · dB",-70);
    await button("Difference").click();await p.waitForFunction(()=>document.querySelector(".sw-dialog output")?.textContent.includes("AUDITION"));
    await button("Apply as take").click();await p.waitForFunction(()=>App.P.audio.regions[0].takes.length===2);
    const measurements=await p.evaluate(async()=>{
      const r=App.P.audio.regions[0],s=App.samples.get(r.takes[r.take].sample).buffer,sr=s.sampleRate;
      const amplitude=(s,hz,start,c)=>{const a=s.getChannelData(c);let x=0,y=0;const n=Math.round(.1*sr),from=Math.round(start*sr);
        for(let k=from;k<from+n;k++){x+=a[k]*Math.cos(2*Math.PI*k*hz/sr);y+=a[k]*Math.sin(2*Math.PI*k*hz/sr);}return 2*Math.hypot(x,y)/n;};
      const print=await App.SignalWorkshop.resample(App.P,{type:"track",index:0,point:"pre",from:2,to:4,tail:.1,returns:false});
      let peak=0,sum=0;for(const v of print.getChannelData(0)){peak=Math.max(peak,Math.abs(v));sum+=v*v;}
      const anti=s.getChannelData(0)[16000]+s.getChannelData(1)[16000];
      return {outside:amplitude(s,1800,.04,0),inside:amplitude(s,1800,.42,0),bass:amplitude(s,240,.42,1),
        anti,seconds:print.duration,rms:Math.sqrt(sum/print.length),peak};
    });
    assert.ok(measurements.outside>.19 && measurements.inside<.001 && measurements.bass>.19);
    assert.ok(Math.abs(measurements.anti)<1e-5);
    assert.ok(Math.abs(measurements.seconds-.35)<.0001 && measurements.rms>.02 && measurements.peak<=.41);
    const isolation=await p.evaluate(async()=>{
      const P=App.sanitize(App.P);
      const empty=await App.SignalWorkshop.resample(P,{type:"group",index:3,point:"post",from:0,to:3.6,tail:.12,returns:true});
      const peak=b=>b.getChannelData(0).reduce((m,x)=>Math.max(m,Math.abs(x)),0);
      P.rack.strips[0].bus=3;
      const group=await App.SignalWorkshop.resample(P,{type:"group",index:3,point:"post",from:0,to:3.6,tail:.12,returns:true});
      P.tracks[2].clips[0]=[{s:1,n:60,l:1,v:1,p:1,off:-.48}];
      const early=await App.SignalWorkshop.resample(P,{type:"track",index:2,point:"pre",from:0,to:.95,tail:0,returns:false});
      return [peak(empty),peak(group),peak(early)];
    });
    assert.ok(isolation[0]<1e-6 && isolation[1]>.005 && isolation[2]>.005,"Per-bus send isolation and anticipated notes crossing selection boundaries: "+isolation);
    // A known reflection delays the wet-only impulse peak by 100 ms.
    const delay=await p.evaluate(async()=>{
      const P=App.P,sr=48000,ctx=new OfflineAudioContext(2,sr,sr),E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"returns",onlyTracks:[0]}]});
      E.syncAll();const src=ctx.createBufferSource(),ir=new AudioBuffer({numberOfChannels:1,length:32,sampleRate:sr});ir.getChannelData(0)[0]=.7;
      src.buffer=ir;src.connect(E.tracks[0].tin);src.start(.25);
      const data=(await ctx.startRendering()).getChannelData(0);let ix=0,max=0;
      for(let i=0;i<data.length;i++){if(Math.abs(data[i])>max){max=Math.abs(data[i]);ix=i;}}
      return {delay:ix/sr-.25,peak:max};
    });
    assert.ok(Math.abs(delay.delay-.1)<.004 && delay.peak>.0001,JSON.stringify(delay));
    await button("Resample…").click();await choice("Source").selectOption("t0");await choice("Tap").selectOption("pre");
    await choice("Destination track").selectOption("5");await set("From · step",2);await set("To · step",4);await set("Tail · s",.15);
    await button("Render range").click();await p.waitForFunction(()=>App.P.audio.regions.length===2);
    assert.ok(await p.evaluate(()=>Math.abs(App.P.audio.regions[1].len-.4)<.0001 && App.P.audio.regions[1].at===2));
    await button("Resample…").click();await choice("Source").selectOption("t0");await choice("Tap").selectOption("post");
    await choice("Destination").selectOption("sampler");await choice("Destination track").selectOption("6");
    await button("Render range").click();await p.waitForFunction(()=>App.P.tracks[6].smp.id && !document.querySelector("dialog[open]"));
    await p.evaluate(()=>{App.select(0,0);App.AudioStudio.open();});
    await choice("Region").selectOption(await p.evaluate(()=>App.P.audio.regions[0].id));
    await button("Spectrum…").click();await choice("Operation").selectOption("isolate");await set("From · s",.22);await set("To · s",.42);
    await choice("Write to").selectOption("sampler");await choice("Sampler track").selectOption("7");await button("Send to sampler").click();
    await p.waitForFunction(()=>App.P.tracks[7].smp.id && !document.querySelector("dialog[open]"));
    assert.ok(await p.evaluate(()=>Math.abs(App.samples.get(App.P.tracks[7].smp.id).buffer.duration-.2)<.0001));
    await p.evaluate(()=>{App.select(0,0);App.AudioStudio.openSpectral();});
    await set("Low · Hz",100);await set("High · Hz",4000);await set("Gain · dB",18);
    await button("Apply as take").click();await p.waitForFunction(()=>App.P.audio.regions[0].takes.length===3);
    const hotPeak=await p.evaluate(()=>App.samples.get(App.P.audio.regions[0].takes[2].sample).peak);
    assert.ok(hotPeak>1.5);
    await button("Close").click();
    await p.evaluate(()=>App.flush());
    await p.reload();await p.waitForFunction(()=>{const r=window.App?.P?.audio?.regions[0];return r && App.samples.has(r.takes[2].sample) && App.samples.has(App.P.impulse.sample);});
    assert.ok(Math.abs(await p.evaluate(()=>App.samples.get(App.P.audio.regions[0].takes[2].sample).peak)-hotPeak)<.01,
      "Closing the live graph and decoding the generated take from IndexedDB preserves headroom");
    const download=p.waitForEvent("download");await p.evaluate(()=>App.file("save"));const bytes=await fs.readFile(await (await download).path());
    const parsed=JSON.parse(bytes);for(const id of [ids.id,ids.resp,parsed.tracks[6].smp.id,parsed.audio.regions[0].takes[1].sample])assert.ok(parsed.samples.some(s=>s.id===id));
    const mirror=Buffer.from(parsed.samples.find(s=>s.id===parsed.audio.regions[0].takes[2].sample).data,"base64");
    assert.equal(mirror.readUInt16LE(20),3);assert.equal(mirror.readUInt16LE(34),32);
    const restored=await browser.newPage();try{
      await restored.goto(reference.url());await restored.waitForSelector("#ed canvas");
      const chooser=restored.waitForEvent("filechooser");await restored.evaluate(()=>App.file("open"));await(await chooser).setFiles({name:"Lab.json",mimeType:"application/json",buffer:bytes});
      await restored.getByRole("button",{name:"Open project",exact:true}).click();await restored.waitForFunction(()=>App.P.audio.regions.length===2);
      assert.deepEqual(await restored.evaluate(()=>[App.P.audio.regions[0].take,App.samples.has(App.P.impulse.sample),App.samples.has(App.P.tracks[6].smp.id)]),[2,true,true]);
      assert.ok(Math.abs(await restored.evaluate(()=>App.samples.get(App.P.audio.regions[0].takes[2].sample).peak)-hotPeak)<.01,"Floating-point take survives portable reimport above full scale");
      await restored.evaluate(()=>App.Operations.open());
      await restored.getByRole("button",{name:"Defaults",exact:true}).click();await restored.getByLabel("Operation",{exact:true}).selectOption("master");
      await restored.getByLabel("Section",{exact:true}).selectOption("reverb");await restored.getByRole("button",{name:"Apply",exact:true}).click();
      assert.equal(await restored.evaluate(()=>App.P.impulse.sample),"");
      await restored.getByRole("button",{name:"IR…",exact:true}).click();
      assert.equal(await restored.getByRole("combobox",{name:"Impulse source"}).inputValue(),"");
    }finally{await restored.close();}
    assert.deepEqual(errors,[]);console.log("Spectral edit, resampling and custom IR · offline RMS "+measurements.rms.toFixed(4)+" · peak "+measurements.peak.toFixed(4)+" · reflection "+(delay.delay*1000).toFixed(2)+" ms · portable audio round trip");
  }finally{await ctx.close();}
};
