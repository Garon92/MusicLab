/* Confirm lossless branch reconstruction, calibrated measurements and their console entry points. */
const assert=require("node:assert/strict");
module.exports=async function rackLaboratory(reference) {
  const page=await reference.context().browser().newPage({viewport:{width:1100,height:620}});
  const errors=[];
  page.on("pageerror", e=>errors.push(e.message));
  try {
    await page.goto(reference.url());
    await page.getByRole("button",{name:"ROUTING…"}).click();
    let dlg=page.getByRole("dialog",{name:"Mixer routing"});
    await dlg.getByLabel("Mixer channel").selectOption("t2");
    await dlg.getByLabel("Rack topology").selectOption("bands");
    await dlg.getByLabel("High crossover").fill("2400");
    await dlg.getByLabel("High crossover").press("Tab");
    await dlg.getByLabel("Edit branch").selectOption("2");
    await dlg.getByLabel("New branch effect").selectOption("room");
    await dlg.getByRole("button",{name:"Add branch effect"}).click();
    await dlg.getByRole("button",{name:"Solo",exact:true}).click();
    await dlg.getByRole("button",{name:"Close"}).click();
    await page.reload();
    const cfg=await page.evaluate(()=>App.P.rack.strips[2].split);
    assert.equal(cfg.mode,"bands");assert.equal(cfg.high,2400);assert.equal(cfg.paths[2].chain[0].type,"room");assert.equal(cfg.paths[2].solo,true);
    const metrics=await page.evaluate(async()=>{
      const P=App.newProject(),split=P.rack.strips[1].split,rate=24000,length=12000;
      async function render(mode,drive,solo=-1,room=false) {
        split.mode=mode;split.low=150;split.high=2000;
        split.paths.forEach((p,i)=>{p.solo=i===solo;p.chain=room && i===1?[{on:true,type:"room",value:.7}]:[];});
        const ctx=new OfflineAudioContext(4,length,rate),stems=["rack-in","post"].map(point=>({type:"track",index:1,point}));
        const E=App.Engine(ctx,()=>P,{offline:true,stems});E.syncAll();
        const buf=ctx.createBuffer(2,length,rate);
        for(let i=128;i<length;i++) {
          const s=.18*Math.sin(2*Math.PI*97*i/rate)+.1*Math.sin(2*Math.PI*4147*i/rate);
          buf.getChannelData(0)[i]=s;
          buf.getChannelData(1)[i]=drive==="mid"?s:drive==="side"?-s:.13*Math.cos(2*Math.PI*1107*i/rate);
        }
        const src=ctx.createBufferSource();src.buffer=buf;src.connect(E.rack.pickTap("track",1,"rack-in"));src.start();
        const out=await ctx.startRendering();
        let difference=0,peak=0,power=0;
        for(let c=0;c<2;c++){
          const before=out.getChannelData(c),after=out.getChannelData(c+2);
          for(let i=0;i<length;i++){const x=after[i];difference=Math.max(difference,Math.abs(x-before[i]));peak=Math.max(peak,Math.abs(x));power+=x*x;}
        }
        return {difference,peak,rms:Math.sqrt(power/(2*length))};
      }
      const neutral=[];
      for(const mode of ["off","parallel","bands","ms"])neutral.push(await render(mode,"stereo"));
      const midRejected=await render("ms","mid",1),sideRejected=await render("ms","side",0),wet=await render("ms","side",1,true);
      split.mode="off";
      const channel=P.rack.groups[0],test={type:"group",index:0,mode:"tone",level:-18,tone:1000,drive:"mid"};
      const plain=await App.SignalBench.measure(P,test);
      channel.chain=[{on:true,type:"saturate",value:1}];const hot=await App.SignalBench.measure(P,test);
      channel.chain=[{on:true,type:"lowpass",value:.45}];const filtered=await App.SignalBench.measure(P,{...test,mode:"sweep"});
      channel.chain=[{on:true,type:"compress",value:0}];const buffered=await App.SignalBench.measure(P,test);
      return {neutral,midRejected,sideRejected,wet,plain,hot,filtered,buffered};
    });
    for(const n of metrics.neutral){
      assert.ok(n.difference<2e-5 && n.rms>.06 && n.peak<.4,"Neutral stereo reconstruction "+JSON.stringify(n));
    }
    assert.ok(metrics.midRejected.rms<1e-6 && metrics.sideRejected.rms<1e-6);
    assert.ok(metrics.wet.rms>.005 && metrics.wet.difference>.01,"Room processes the isolated side signal");
    assert.ok(Math.abs(metrics.plain.points[0].db)<.02 && metrics.plain.thd<.01 && metrics.plain.latency===0);
    assert.ok(metrics.hot.thd>4 && metrics.hot.points[2].db>metrics.plain.points[2].db+20);
    assert.ok(metrics.filtered.points[0].db>-.2 && metrics.filtered.points.at(-1).db < -35);
    assert.ok(metrics.buffered.latency>3 && metrics.buffered.latency<12,"Measures compressor lookahead");
    for(const m of [metrics.plain,metrics.hot,metrics.filtered,metrics.buffered])assert.ok(m.points.every(p=>Number.isFinite(p.db)));
    const transitions=await page.evaluate(async()=>{
      const Q=App.newProject(), channel=Q.rack.groups[0], original=JSON.stringify(channel.split);
      channel.split.mode="ms";channel.split.paths[1].solo=true;
      channel.split.paths[1].chain=[{type:"room",value:.5,on:true}];
      const values=App.Scenes.capture(Q,[8],["effects"]);
      Q.scenes={items:[{id:"wide",name:"Side only",values}],cues:[{id:"wide",at:2,bars:.25}]};
      channel.split=JSON.parse(original);
      const P=App.sanitize(JSON.parse(JSON.stringify(Q))), scene=App.Scenes.session(P);
      const sr=24000,ctx=new OfflineAudioContext(2,sr,sr);
      const E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"group",index:0}]});E.syncAll();
      const tone=ctx.createConstantSource();tone.offset.value=.2;tone.connect(E.rack.pickTap("group",0,"rack-in"));tone.start();
      for(let step=0;step<12;step++)App.Scenes.schedule(E,scene,step,step*.07,(step+1)*.07);
      const data=(await ctx.startRendering()).getChannelData(0);
      const sample=time=>data[Math.floor(sr*time)];
      return {saved:P.scenes.items[0].values["rack.groups.0.split"],base:P.rack.groups[0].split.mode,
        start:sample(.09),middle:sample(.28),end:sample(.7)};
    });
    assert.equal(transitions.saved.paths[1].chain[0].type,"room");assert.equal(transitions.base,"off");
    assert.ok(Math.abs(transitions.start-.2)<.001 && Math.abs(transitions.middle-.1)<.002 && Math.abs(transitions.end)<.001,JSON.stringify(transitions));

    // Live AudioContext reached through a real transport gesture. Measure the
    // continuously sounding bus across two edits, including a polarity split.
    await page.getByRole("button",{name:"Play pattern or song",exact:true}).click();
    const switched=await page.evaluate(async()=>{
      const E=App.E, tap=E.rack.pickTap("group",0,"pre"), post=E.rack.pickTap("group",0,"post"),split=App.P.rack.groups[0].split;
      const tone=E.ctx.createConstantSource();tone.offset.value=.125;tone.connect(tap);tone.start();
      const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
      const writer=await E.record(post);await pause(150);
      split.mode="ms";split.paths[1].solo=true;E.rack.sync();await pause(150);
      split.mode="bands";split.paths[1].solo=false;E.rack.sync();await pause(150);
      const out=await writer.stop();tone.stop();tone.disconnect();const x=out.getChannelData(0);
      let delta=0,peak=0,down=false,up=false;
      for(let i=128;i<x.length;i++){
        // Capture starts and ends on quantum boundaries. Ignore the first block.
        peak=Math.max(peak,Math.abs(x[i]));delta=Math.max(delta,Math.abs(x[i]-x[i-1]));
        if(peak>.12 && x[i]<.005)down=true;
        if(down && x[i]>.12)up=true;
      }
      return {peak,delta,down,up};
    });
    assert.ok(switched.peak<.126 && switched.down && switched.up && switched.delta<.003,JSON.stringify(switched));
    await page.evaluate(()=>App.Seq.stop());
    await page.getByRole("button",{name:"BENCH…"}).click();dlg=page.getByRole("dialog",{name:"Signal bench"});
    await dlg.getByLabel("Bench path").selectOption("b0");
    await dlg.getByLabel("Test signal").selectOption("tone");
    await dlg.getByRole("button",{name:"Measure",exact:true}).click();
    await dlg.getByText(/Impulse peak delay/).waitFor();
    await dlg.getByRole("button",{name:"Hold A"}).click();
    await dlg.getByRole("button",{name:"Close"}).click();
    await page.getByRole("button",{name:"BENCH…"}).click();
    assert.match(await dlg.locator(".ref").innerText(),/A · BUS 1/);
    await dlg.getByRole("button",{name:"Clear A"}).click();
    assert.equal(await dlg.locator(".ref").count(),0);
    assert.deepEqual(errors,[]);
    console.log("  Rack and measurement bench: stereo reconstruction, branch DSP, transfer, harmonics, group delay and reference overlay", {peak:metrics.neutral[2].peak,rms:metrics.neutral[2].rms,compressorMs:metrics.buffered.latency});
  }finally{await page.close();}
};
