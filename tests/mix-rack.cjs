/* Use actual audio taps to verify modulation, inserts, routing and WAV stem alignment. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");

module.exports = async function mixRack(reference) {
  const page = await reference.context().browser().newPage({viewport:{width:1100,height:620}});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(reference.url());
    await page.getByRole("button",{name:"MODULATION…",exact:true}).click();
    let dlg = page.getByRole("dialog",{name:"Modulation matrix"});
    await dlg.getByLabel("Modulation track").selectOption("1");
    await dlg.getByLabel("Macro 1 name").fill("Napětí");
    await dlg.getByLabel("Macro 1 name").press("Tab");
    await dlg.getByRole("button",{name:"Add route"}).click();
    await dlg.getByLabel("Route 1 destination").selectOption("pan");
    await dlg.getByLabel("Route 1 start").fill("-100");
    await dlg.getByLabel("Route 1 start").press("Tab");
    await dlg.getByRole("button",{name:"Add route"}).click();
    await dlg.getByLabel("Route 2 destination").selectOption("drive");
    await dlg.getByLabel("Macro 1",{exact:true}).fill("0.75");
    await dlg.getByRole("button",{name:"Close",exact:true}).click();
    await page.getByRole("button",{name:"ROUTING…"}).click();
    dlg = page.getByRole("dialog",{name:"Mixer routing"});
    await dlg.getByLabel("Mixer channel").selectOption("t1");
    await dlg.getByLabel("Track output").selectOption("0");
    await dlg.getByLabel("Mixer channel").selectOption("b0");
    await dlg.getByLabel("Bus name").fill("DRUM ROOM");
    await dlg.getByLabel("Bus name").press("Tab");
    await dlg.getByLabel("New insert effect").selectOption("saturate");
    await dlg.getByRole("button",{name:"Add insert"}).click();
    await dlg.getByLabel("New insert effect").selectOption("highpass");
    await dlg.getByRole("button",{name:"Add insert"}).click();
    await dlg.getByRole("button",{name:"↑",exact:true}).last().click();
    await dlg.getByLabel("Sidechain key").selectOption("kick0");
    await dlg.getByRole("button",{name:"Close",exact:true}).click();
    await page.reload();
    const settings=await page.evaluate(() => App.P.rack);
    assert.deepEqual(settings.strips[1].routes.map(r => r.target),["pan","drive"]);
    assert.equal(settings.strips[1].macros[0],.75);
    assert.equal(settings.strips[1].macroNames[0],"Napětí");
    assert.equal(settings.strips[1].bus,0);
    assert.deepEqual(settings.groups[0].chain.map(f => f.type),["highpass","saturate"]);
    assert.equal(settings.groups[0].key,"kick0");
    assert.equal(settings.groups[0].name,"DRUM ROOM");

    const dsp = await page.evaluate(async () => {
      const P = App.newProject(), ti=1, sr=24000;
      const T=P.tracks[ti], s=P.rack.strips[ti], bus=P.rack.groups[0];
      T.vol=1; T.pan=0; T.rev=0; T.dly=0; T.drive=0; s.bus=0;
      // Feed a calibrated instrument signal and an isolated kick, independent of device presets.
      const render=async (automate=false) => {
        const ctx=new OfflineAudioContext(4,sr,sr);
        const E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"track",index:ti},{type:"group",index:0}]});
        E.syncAll();
        const tone=ctx.createOscillator(), level=ctx.createGain();
        tone.frequency.value=500; level.gain.value=.18;
        tone.connect(level).connect(E.tracks[ti].tin); tone.start(0); tone.stop(.96);
        E.play(0,36,1,.25,.25); // Pad 1 feeds the real, independent kick key tap.
        if (automate) E.automate(ti,T,{macro1:{mode:"linear",points:[{s:0,v:0},{s:1,v:1}]}},0,.1,.8);
        const buf=await ctx.startRendering();
        const rms=(channel,a,b) => {
          const values=buf.getChannelData(channel).subarray(Math.round(a*sr),Math.round(b*sr));
          let energy=0; for (const v of values) energy+=v*v;
          return Math.sqrt(energy/values.length);
        };
        let peak=0; for (let c=0;c<4;c++) for (const v of buf.getChannelData(c)) peak=Math.max(peak,Math.abs(v));
        return {left:rms(0,.05,.1),right:rms(1,.05,.1),lateL:rms(0,.82,.9),lateR:rms(1,.82,.9),
          group:rms(2,.29,.36),track:rms(0,.29,.36),peak};
      };
      const base=await render();
      bus.key="kick0"; bus.depth=1; bus.release=.018;
      const ducked=await render();
      bus.key="off"; bus.level=.5;
      const quiet=await render();
      bus.level=1; s.macros[0]=1;
      s.routes=[{source:"macro1",target:"pan",low:-1,high:1},{source:"macro1",target:"drive",low:0,high:1}];
      const right=await render(); s.macros[0]=0; const sweep=await render(true);
      s.routes=[{source:"track0",target:"level",low:0,high:-1}];
      const followed=await render();
      s.routes=[]; s.chain=[{type:"lowpass",value:0,on:true},{type:"saturate",value:1,on:true}];
      const filtered=await render(); s.chain.reverse(); const reordered=await render();
      return {base,ducked,quiet,right,sweep,followed,filtered,reordered};
    });
    assert.ok(dsp.base.track>.05 && dsp.base.peak<1 && Math.abs(dsp.base.track-dsp.base.group)<1e-6,JSON.stringify(dsp));
    assert.ok(dsp.ducked.group < dsp.ducked.track*.7,"Kick reduces bus level without reducing the track stem");
    assert.ok(Math.abs(dsp.quiet.group/dsp.quiet.track-.25)<.005,"Bus fader uses squared taper");
    assert.ok(dsp.right.left<1e-4 && dsp.right.right>dsp.base.right*1.5,"Macro changes pan and distortion together");
    assert.ok(dsp.sweep.left>.08 && dsp.sweep.right<1e-4 && dsp.sweep.lateL<1e-4 && dsp.sweep.lateR>.1,"Macro lane crosses from left to right");
    assert.ok(dsp.followed.track < dsp.base.track*.85,"Audio follower reduces level from the actual kick");
    assert.ok(dsp.filtered.track < dsp.base.track*.2 && Math.abs(dsp.filtered.track-dsp.reordered.track)>.0001,"Effect order changes the measured signal");
    for(const v of Object.values(dsp)) assert.ok(Number.isFinite(v.peak) && Number.isFinite(v.track));
    const cutoff = await page.evaluate(async () => {
      const P=App.newProject(), sr=24000, ti=1, T=P.tracks[ti];
      T.kind="syn"; Object.assign(T.syn,{w1:0,lv1:1,lv2:0,sub:0,noise:0,fm:0,oct1:0,
        cut:40,fenv:0,ftrk:0,ldest:0,ftype:0,res:0,aa:.004,ad:.03,as:1,ar:.02});
      const ctx=new OfflineAudioContext(2,sr,sr);
      const E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"track",index:ti}]});
      E.syncAll(); E.play(ti,84,1,.03,.9);
      E.automate(ti,T,{cutoff:{mode:"linear",points:[{s:0,v:0},{s:1,v:1}]}},0,.15,.7);
      const buf=await ctx.startRendering(), data=buf.getChannelData(0);
      const rms=(a,b) => Math.sqrt(data.subarray(sr*a,sr*b).reduce((energy,x)=>energy+x*x,0)/(sr*(b-a)));
      return [rms(.06,.12),rms(.73,.88)];
    });
    assert.ok(cutoff[1]>.05 && cutoff[0]<cutoff[1]*.01,"Absolute cutoff lane opens a sounding voice");
    const tails=await page.evaluate(async () => {
      const P=App.newProject(),sr=24000,ti=1,T=P.tracks[ti],s=P.rack.strips[ti];
      T.kind="syn"; Object.assign(T.syn,{cut:16000,ftype:0,aa:.004,ad:.02,as:1,ar:.25,fenv:0,ldest:0,sub:0,noise:0});
      const render=async (amount,padDrive) => {
        s.routes=amount===null ? [] : [{source:"macro1",target:"release",low:amount,high:amount}];
        P.tracks[0].kit.pads[1].drive=padDrive;
        const ctx=new OfflineAudioContext(4,sr,sr), E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"track",index:ti},{type:"track",index:0}]});
        E.syncAll(); E.play(ti,60,1,.05,.2);
        // Use a deterministic tone to compare the pad-only saturation transfer.
        Object.assign(P.tracks[0].kit.pads[1],{nz:0,tone:.15,tune:300,wave:0,sweep:0,dec:.3});
        E.play(0,37,1,.25,.1);
        const buf=await ctx.startRendering();
        const rms=ch=>Math.sqrt(buf.getChannelData(ch).subarray(.35*sr,.45*sr).reduce((e,x)=>e+x*x,0)/(.1*sr));
        return [rms(0),rms(2)];
      };
      return {dry:await render(null,0),neutral:await render(0,0),short:await render(-1,1),long:await render(1,0)};
    });
    assert.ok(Math.abs(tails.neutral[0]/tails.dry[0]-1)<.025,"Neutral routed release preserves the original decay");
    assert.ok(tails.long[0]>tails.neutral[0]*2 && tails.short[0]<tails.neutral[0]*.05,"Release destination changes the measured decay time");
    assert.ok(tails.short[1]>tails.dry[1]*2,"Pad insert distorts the individual pad");
    await page.evaluate(() => {
      App.P.tracks[0].clips[0]=[{s:0,l:1,n:36,v:.9,p:1}];
      App.P.tracks[1].clips[0]=[{s:4,l:5,n:55,v:1,p:1}]; App.commit(); App.refresh();
    });
    await page.getByRole("button",{name:"File",exact:true}).click();
    await page.getByRole("menuitem",{name:/export stems/i}).click();
    dlg=page.getByRole("dialog",{name:"Export stems"});
    await dlg.getByLabel("Stem grouping").selectOption("groups");
    const boxes=dlg.getByRole("checkbox");
    for(const cb of await boxes.all()) if(!(await cb.getAttribute("aria-label")).startsWith("GRP") &&
      !(await cb.getAttribute("aria-label")).startsWith("TRK 01")) await cb.uncheck();
    const [file]=await Promise.all([page.waitForEvent("download"),dlg.getByRole("button",{name:"Export WAVs · ZIP"}).click()]);
    const data=await fs.readFile(await file.path()), lengths=[], wavNames=[];
    let at=0;
    while(data.readUInt32LE(at)===0x04034b50){
      const bytes=data.readUInt32LE(at+18), nameLength=data.readUInt16LE(at+26);
      const name=data.toString("utf8",at+30,at+30+nameLength);
      const start=at+30+nameLength+data.readUInt16LE(at+28), wav=data.subarray(start,start+bytes);
      assert.equal(wav.toString("ascii",0,4),"RIFF"); assert.equal(wav.readUInt16LE(22),2); assert.equal(wav.readUInt16LE(34),24);
      assert.ok(wav.subarray(44).some(x => x!==0)); assert.equal(wav.readUInt32LE(40),bytes-44);
      lengths.push(bytes); wavNames.push(name); at=start+bytes;
    }
    assert.equal(data.readUInt32LE(at),0x02014b50); assert.equal(wavNames.length,2);
    assert.ok(wavNames.some(x=>x.includes("DRUM ROOM"))); assert.equal(lengths[0],lengths[1]);
    await page.evaluate(() => {
      App.P.bpm=40; App.P.pats[0].bars=16;
      App.P.chain=Array(32).fill(0); App.P.song=1; App.P.performance.source="arrangement"; App.refresh();
    });
    await page.getByRole("button",{name:"File",exact:true}).click();
    await page.getByRole("menuitem",{name:/export stems/i}).click();
    await dlg.getByRole("button",{name:"Export WAVs · ZIP"}).click();
    await dlg.getByRole("status").filter({hasText:/longer than 20 min/i}).waitFor();
    assert.ok(await dlg.getByRole("button",{name:"Export WAVs · ZIP"}).isEnabled());
    await dlg.getByRole("button",{name:"Close",exact:true}).click();
    assert.equal(await dlg.count(),0);
    assert.deepEqual(errors,[]);
    console.log("Rack audio · peak "+dsp.base.peak.toFixed(4)+" · track RMS "+dsp.base.track.toFixed(4)+" · keyed bus RMS "+dsp.ducked.group.toFixed(4)+" · 2 aligned stereo stems");
  } finally { await page.close(); }
};
