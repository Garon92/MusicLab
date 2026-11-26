"use strict";
const assert = require("node:assert/strict");

module.exports = async function kidsMusic(reference) {
  const ctx = await reference.context().browser().newContext({viewport:{width:1280,height:720}});
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(reference.url());
    await page.waitForFunction(()=>window.App?.P && App.KidsMusic);
    // Use the real transport gesture to unlock audio, in a clean independent tab.
    await page.getByRole("button",{name:"Play pattern or song",exact:true}).click();
    await page.getByRole("button",{name:"Stop playback",exact:true}).click();
    const checks = await page.evaluate(async()=>{
      const M=App.KidsMusic,P=App.P=M.newProject(),blank=P.tracks.every(t=>t.clips.every(c=>!c.length));
      const transitions=[M.edit(P,0,0,3,0), M.edit(P,0,0,3,0,true), M.edit(P,0,0,3,0,true)];
      M.edit(P,2,0,2,2);M.edit(P,2,0,2,2,true);M.edit(P,2,0,2,2,true);
      M.variation(P,1,1);
      const other=P.tracks[1].clips[1].map(n=>n.n);
      const drum=P.tracks[0].clips[0][0], long=P.tracks[2].clips[0][0];
      const states=[];
      for(let i=0;i<4;i++){M.costume(P,2,i);states.push(JSON.stringify(P.tracks[2].syn));}
      P.bpm=750;P.fx.vol=1;M.prepare(P);
      const stored=App.sanitize(P);App.E.syncAll();
      const {full,cut}=await App.Seq.renderSong({project:P}),data=full.getChannelData(0);
      let sum=0,peak=0;
      for(let i=cut;i<data.length;i++){const v=data[i];if(!Number.isFinite(v))throw Error("Non-finite band sample");sum+=v*v;peak=Math.max(peak,Math.abs(v));}
      const rms=Math.sqrt(sum/(data.length-cut));
      return {blank,transitions,drum,long,other,unique:new Set(states).size,tempos:M.tempos,bpm:stored.bpm,vol:stored.fx.vol,
        costumes:M.costumes(stored),grid:M.grid(stored,2,0),peak,rms,scale:App.SCALES[P.scale][0]};
    });
    assert.equal(checks.blank,true);assert.deepEqual(checks.transitions,[1,2,3]);
    assert.equal(checks.drum.s,0);assert.equal(checks.drum.r,2);assert.equal(checks.drum.n,36);
    assert.equal(checks.long.s,4);assert.equal(checks.long.l,4);assert.equal(checks.grid[2][2],3);
    assert.ok(checks.other.length && checks.other.every(n=>[36,38,40,43].includes(n)));
    assert.equal(checks.unique,4);assert.deepEqual(checks.costumes,[0,0,3,0]);assert.equal(checks.scale,"PENTA MAJOR");
    assert.equal(checks.bpm,checks.tempos.at(-1));assert.ok(checks.vol<=.55);
    assert.ok(checks.peak>.01 && checks.peak<=checks.vol**2+.0001 && checks.rms>.001);

    const vibrato = await page.evaluate(async()=>{
      const P=App.KidsMusic.newProject(),r=P.rack.strips[2],t=P.tracks[2];
      Object.assign(t.syn,{w1:0,w2:0,lv1:.55,lv2:0,fm:0,sub:0,noise:0,cut:18000,fenv:0,aa:.001,ad:.02,as:1,ar:.01,ldest:0});
      t.rev=t.dly=0;t.clips[0]=[{n:69,s:0,l:16,v:1,p:1}];P.bpm=96;
      r.routes=[{source:"macro3",target:"vibratoDepth",low:0,high:1},{source:"macro4",target:"vibratoRate",low:0,high:1}];
      async function probe(depth,rate){
        r.macros[2]=depth;r.macros[3]=rate;
        const {full,cut}=await App.Seq.renderSong({project:App.sanitize(P),stems:[{type:"track",index:2,point:"post"}]});
        const x=full.getChannelData(0),sr=full.sampleRate,from=cut+Math.round(sr*.28),end=from+Math.round(sr*1.6);
        let min=Infinity,max=0,previousCross,previousPitch,turns=0;
        for(let i=from;i<end;i++){
          if(x[i]<=0 && x[i+1]>0){
            const zero=i-x[i]/(x[i+1]-x[i]);
            if(previousCross!==undefined){
              const pitch=sr/(zero-previousCross);
              min=Math.min(min,pitch);max=Math.max(max,pitch);
              if(previousPitch<440 && pitch>=440)turns++;
              previousPitch=pitch;
            }
            previousCross=zero;
          }
        }
        return {min,max,hz:turns/1.6};
      }
      const neutral=await probe(0,1),slow=await probe(1,0),fast=await probe(1,1);
      const {blob}=await App.ProjectFiles.blob(P),{raw}=await App.ProjectFiles.read(blob);
      const restored=App.sanitize(raw).rack.strips[2].routes.map(r=>r.target);
      // Exercise removal while the live oscillator exists as well as bypass
      // on the offline graph. Notes must recover their original constant pitch.
      const live=App.P.rack.strips[2];
      live.routes=r.routes.slice();App.E.syncAll();
      live.routes=[];App.E.syncAll();r.routes=[];
      return {neutral,slow,fast,restored,removed:await probe(1,1)};
    });
    assert.deepEqual(vibrato.restored,["vibratoDepth","vibratoRate"]);
    assert.ok(vibrato.neutral.max-vibrato.neutral.min<1,JSON.stringify(vibrato));
    assert.ok(vibrato.removed.min>439 && vibrato.removed.max<441,JSON.stringify(vibrato));
    for (const tone of [vibrato.slow,vibrato.fast]) assert.ok(tone.min<414 && tone.max>471,JSON.stringify(vibrato));
    assert.ok(Math.abs(vibrato.slow.hz-2)<.7 && Math.abs(vibrato.fast.hz-10)<.7,JSON.stringify(vibrato));

    await page.evaluate(()=>{App.KidsMusic.audition(2,2,3);});
    await page.waitForFunction(()=>App.KidsMusic.levels()[2]>.012);
    assert.deepEqual(await page.evaluate(()=>[0,1,3].map(i=>App.KidsMusic.levels()[i])),[0,0,0]);
    await page.evaluate(()=>{
      const E=App.E,devices=navigator.mediaDevices;
      window.bandMic={devices,requests:0,state:"idle",saved:0};
      Object.defineProperty(devices,"getUserMedia",{configurable:true,value:async()=>{
        bandMic.requests++;
        if (bandMic.deny) throw new DOMException("Permission denied","NotAllowedError");
        const osc=E.ctx.createOscillator(),gain=E.ctx.createGain(),out=E.ctx.createMediaStreamDestination();
        osc.frequency.value=307;gain.gain.value=.28;osc.connect(gain).connect(out);osc.start();
        bandMic.track=out.stream.getAudioTracks()[0];bandMic.osc=osc;
        if (bandMic.wait) await new Promise(resolve=>{bandMic.grant=resolve;});
        return out.stream;
      }});
      bandMic.stateChange=(state,reason)=>Object.assign(bandMic,{state,reason});
      App.KidsMusic.record(bandMic.stateChange,()=>{bandMic.saved++;});
    });
    await page.waitForFunction(()=>bandMic.state==="recording" && App.KidsMusic.micLevel()>.1);
    await page.waitForFunction(()=>App.E.ctx.currentTime>(bandMic.started??=App.E.ctx.currentTime)+.20);
    await page.evaluate(()=>App.KidsMusic.record(bandMic.stateChange,()=>{}));
    const recorded=await page.evaluate(async()=>{
      const M=App.KidsMusic,P=App.P,T=P.tracks[6],sample=T.smp.id,duration=App.samples.get(sample)?.buffer.duration;
      bandMic.osc.stop();
      const original=bandMic.track.readyState;
      const variants=[];
      for(let i=0;i<4;i++){M.costume(P,3,i);variants.push([T.smp.id,T.smp.tune,T.smp.rev]);}
      App.samples.delete(sample);
      const restored=await App.restoreSamples(P);
      return {sample,original,variants,restored,duration,state:bandMic.state,saved:bandMic.saved};
    });
    assert.ok(recorded.sample && recorded.duration>.1 && recorded.duration<=6);assert.equal(recorded.original,"ended");
    assert.equal(recorded.state,"idle");assert.equal(recorded.saved,1);assert.equal(recorded.restored,1);
    assert.deepEqual(recorded.variants.map(x=>x.slice(1)),[[0,0],[12,0],[-12,0],[0,1]]);
    assert.ok(recorded.variants.every(x=>x[0]===recorded.sample));
    const audible=await page.evaluate(async()=>{
      const M=App.KidsMusic,P=App.sanitize(App.P),t=P.tracks[6];
      t.clips[0]=[{n:60,s:0,l:8,v:1,p:1}];
      const pitches=[];
      for (let i=0;i<4;i++) {
        M.costume(P,3,i);
        const {full,cut}=await App.Seq.renderSong({project:P,stems:[{type:"track",index:6,point:"post"}]});
        const data=full.getChannelData(0), sr=full.sampleRate, crossings=[];
        for(let j=cut+Math.round(.023*sr);j<cut+Math.round(.073*sr);j++) {
          if(data[j]<0 && data[j+1]>=0) crossings.push(j-data[j]/(data[j+1]-data[j]));
        }
        pitches.push((crossings.length-1)*sr/(crossings.at(-1)-crossings[0]));
      }
      const voice=App.samples.get(t.smp.id),forward=voice.buffer.getChannelData(0),reverse=voice.rev.getChannelData(0);
      const mirrored=[145,391,856].every(i=>reverse[i]===forward[forward.length-i-1]);
      return {pitches,mirrored};
    });
    assert.ok(audible.mirrored);
    [307,614,153.5,307].forEach((hz,i)=>assert.ok(Math.abs(audible.pitches[i]-hz)<15,JSON.stringify(audible)));
    // A permission prompt can resolve after the child leaves. Its stream is stopped
    // and the previous voice stays assigned, with no late state notification.
    await page.evaluate(()=>{bandMic.wait=true;App.KidsMusic.record(bandMic.stateChange,()=>{bandMic.saved++;});});
    await page.waitForFunction(()=>typeof bandMic.grant==="function");
    await page.evaluate(()=>{App.KidsMusic.dispose();bandMic.grant();});
    await page.waitForFunction(()=>bandMic.track.readyState==="ended");
    assert.equal(await page.evaluate(()=>App.P.tracks[6].smp.id),recorded.sample);
    await page.evaluate(()=>bandMic.osc.stop());
    const denied=await page.evaluate(async()=>{
      bandMic.deny=true;
      await App.KidsMusic.record(bandMic.stateChange,()=>{bandMic.saved++;});
      return {reason:bandMic.reason,state:App.KidsMusic.recording(),id:App.P.tracks[6].smp.id};
    });
    assert.deepEqual(denied,{reason:"denied",state:"idle",id:recorded.sample});
    await page.evaluate(()=>{
      bandMic.deny=false;bandMic.wait=false;
      App.storeBuffer=async()=>{throw Error("Storage full");};
      App.KidsMusic.record(bandMic.stateChange,()=>{bandMic.saved++;});
    });
    await page.waitForFunction(()=>bandMic.state==="recording" && App.KidsMusic.micLevel()>.1);
    await page.waitForFunction(()=>App.E.ctx.currentTime>(bandMic.retryStart??=App.E.ctx.currentTime)+.20);
    const storage=await page.evaluate(async()=>{
      await App.KidsMusic.record(bandMic.stateChange,()=>{});
      bandMic.osc.stop();
      return {reason:bandMic.reason,id:App.P.tracks[6].smp.id,device:bandMic.track.readyState,saves:bandMic.saved};
    });
    assert.deepEqual(storage,{reason:"storage",id:recorded.sample,device:"ended",saves:1});
    assert.deepEqual(errors,[]);
    console.log("Pocket band · polyphonic grid, 4 tempos, expression, actual track level and simulated voice · peak "+
      checks.peak.toFixed(4)+" RMS "+checks.rms.toFixed(4)+" · "+recorded.duration.toFixed(2)+" s restored · vibrato "+vibrato.slow.hz.toFixed(1)+"/"+vibrato.fast.hz.toFixed(1)+" Hz");
  } finally {await ctx.close();}
};
