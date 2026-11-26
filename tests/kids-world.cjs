"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");

module.exports=async function kidsWorld(reference){
  const browser=reference.context().browser(), context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage(), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(reference.url());
    await page.waitForFunction(()=>window.App?.KidsWorld && App.P);
    const initial=await page.evaluate(async()=>{
      const M=App.KidsMusic,W=App.KidsWorld,legacy=App.newProject();
      legacy.kidsBand={costumes:[1,2,0,0]};
      M.edit(legacy,2,0,1,3);
      legacy.tracks[5].clips[2].push({s:2,n:61,v:.5,p:1,l:3});
      const old=JSON.stringify(legacy.tracks[5]),melody=JSON.stringify(legacy.tracks[2]);
      M.prepare(legacy);
      const P=App.P=M.newProject(), ids=[...App.sampleIds(P)];
      const liveBefore=!!App.E;
      await W.ready(P);
      const samples=W.groups.flatMap((g,i)=>g.sounds.map((s,row)=>{
        const track=P.tracks[M.tracks[4+i]],pad=track.kit.pads[M.pitch(4+i,row)-36],audio=App.samples.get(pad.id);
        const x=audio.buffer.getChannelData(0);
        let sum=0,slope=0,peak=0,hash=2166136261;
        for(let j=0;j<x.length;j++){
          const v=x[j];sum+=v*v;peak=Math.max(peak,Math.abs(v));
          hash=Math.imul(hash^Math.round(v*32767),16777619);
          if(j)slope+=(v-x[j-1])**2;
        }
        return {id:s.id,sampleId:s.sampleId,pad:pad.id,rms:Math.sqrt(sum/x.length),peak,
          duration:audio.buffer.duration,hash:hash>>>0,bytes:audio.blob.size,
          brightness:Math.sqrt(slope/sum)*audio.buffer.sampleRate/(2*Math.PI)};
      }));
      return {liveBefore,liveAfter:!!App.E,selected:P.sel.t,blank:P.tracks.every(t=>t.clips.every(c=>!c.length)),
        tracks:M.tracks,ids,defaults:App.sampleIds(App.newProject()).size,
        old:old===JSON.stringify(legacy.tracks[5]),melody:melody===JSON.stringify(legacy.tracks[2]),
        oldKits:[3,4,7].every(i=>legacy.tracks[i].kind==="kit"),oldCostumes:M.costumes(legacy),samples};
    });
    assert.equal(initial.liveBefore,false);assert.equal(initial.liveAfter,false,"preparing the samples opens no live audio context");
    assert.equal(initial.defaults,0);assert.equal(initial.selected,3);assert.equal(initial.blank,true);
    assert.deepEqual(initial.tracks,[0,1,2,6,3,4,5,7]);
    assert.equal(initial.old,true);assert.equal(initial.melody,true);assert.equal(initial.oldKits,true);
    assert.deepEqual(initial.oldCostumes,[1,2,0,0]);
    const sounds=["cow","pig","sheep","rooster","dog","cat","bird","frog","doorbell","clock","keys","glass","train","bike-bell","horn","rain"];
    assert.deepEqual(initial.samples.map(s=>s.id),sounds);assert.equal(new Set(initial.ids).size,16);
    assert.equal(new Set(initial.samples.map(s=>s.hash)).size,16,"all sixteen pads have distinct PCM");
    for(const s of initial.samples){
      assert.equal(s.pad,s.sampleId);assert.ok(s.rms>.01 && s.rms<.8 && s.peak>.1 && s.peak<=1,s.id+" usable level");
      assert.ok(s.duration>.08 && s.duration<4 && s.bytes>1000,s.id+" short playable one-shot");
    }
    const sample=id=>initial.samples.find(s=>s.id===id);
    // A jingling key and a bicycle bell put much more energy in the upper
    // harmonics than a bark, and the clock's short ticks have sharp transients.
    assert.ok(sample("keys").brightness>3*sample("dog").brightness);
    assert.ok(sample("bike-bell").brightness>3*sample("cow").brightness);
    assert.ok(sample("clock").peak/sample("clock").rms>8);
    // A real click unlocks the live engine; the first manual hit on each strip
    // reaches its audio meter. The clip grid retains all four independent parts.
    await page.getByRole("button",{name:"Play pattern or song",exact:true}).click();
    await page.getByRole("button",{name:"Stop playback",exact:true}).click();
    for(let part=4;part<8;part++){
      await page.evaluate(part=>App.KidsMusic.audition(part,0),part);
      await page.waitForFunction(part=>App.KidsMusic.levels()[part]>.006,part);
    }
    const summary=await page.evaluate(async()=>{
      const P=App.P,M=App.KidsMusic,parts=[4,5,6,7];
      for(const part of parts){
        for(let row=0;row<4;row++)M.edit(P,part,0,row,row*2);
      }
      const notes=parts.map(part=>P.tracks[M.tracks[part]].clips[0].map(n=>[n.s,n.n]));
      const unchanged=JSON.stringify(P.tracks[M.tracks[5]].clips[0]);
      M.variation(P,4,1);M.clear(P,4,1);
      M.edit(P,7,3,2,0,true);M.edit(P,7,3,2,0,true);
      const double=P.tracks[7].clips[3][0].r;
      const {full,cut}=await App.Seq.renderSong({project:P,stems:parts.map(i=>({type:"track",index:M.tracks[i],point:"post"}))});
      const mixes=parts.map((_,i)=>{
        const x=full.getChannelData(i*2);let peak=0,sum=0;
        for(let t=cut;t<x.length;t++){sum+=x[t]*x[t];peak=Math.max(peak,Math.abs(x[t]));}
        return {peak,rms:Math.sqrt(sum/(x.length-cut))};
      });
      const master=await App.Seq.renderSong({project:P}),x=master.full.getChannelData(0);
      let peak=0,sum=0;for(let i=master.cut;i<x.length;i++){peak=Math.max(peak,Math.abs(x[i]));sum+=x[i]*x[i];}
      const rms=Math.sqrt(sum/(x.length-master.cut));
      // Exercise the regular incremental writer and reader, including a conflicting
      // inbound sample ID. The original cows and the newly imported audio coexist.
      const threshold=App.ProjectFiles.streamFrom;App.ProjectFiles.streamFrom=1;
      try {
        const {blob,count}=await App.ProjectFiles.blob(P),{raw,entries}=await App.ProjectFiles.read(blob);
        const saved=App.sanitize(raw),stored=await App.ProjectFiles.importSamples(saved,entries);
        const original=saved.tracks[3].kit.pads[0].id;
        const pig=entries.find(e=>e.id===saved.tracks[3].kit.pads[1].id);
        const changed=entries.map(e=>e.id===original?{...pig,id:original}:e);
        const different=App.sanitize(saved),remapped=await App.ProjectFiles.importSamples(different,changed);
        const reference=different.tracks[3].kit.pads[0].id;
        return {notes,kept:unchanged===JSON.stringify(P.tracks[M.tracks[5]].clips[0]),double,mixes,peak,rms,
          count,stored,remapped,conflict:reference!==original && !!App.samples.get(reference),same:[...App.sampleIds(saved)].every(id=>App.sampleIds(P).has(id))};
      } finally {App.ProjectFiles.streamFrom=threshold;}
    });
    assert.ok(summary.kept);assert.equal(summary.double,2);
    for(const notes of summary.notes)assert.deepEqual(notes,[[0,36],[4,37],[8,38],[12,39]]);
    for(const m of summary.mixes)assert.ok(m.peak>.012 && m.rms>.001 && Number.isFinite(m.rms),JSON.stringify(m));
    assert.ok(summary.rms>.001 && summary.peak>.015 && summary.peak<1,JSON.stringify(summary));
    assert.equal(summary.count,16);assert.ok(summary.stored && summary.remapped && summary.same && summary.conflict);

    const file=async(p,name)=>{await p.getByRole("button",{name:"File",exact:true}).click();await p.getByRole("menuitem",{name}).click();};
    const [exported]=await Promise.all([page.waitForEvent("download"),file(page,/Save project/i)]);
    const copy=await fs.readFile(await exported.path()), fresh=await browser.newContext();
    try {
      const receiver=await fresh.newPage();receiver.on("pageerror",e=>errors.push(e.message));
      // A recipient with neither a sample database nor the installed library
      // can open the exported project using its embedded audio.
      await receiver.route("**/audio/kids/*.wav",route=>route.abort());
      await receiver.goto(reference.url());
      const [picker]=await Promise.all([receiver.waitForEvent("filechooser"),file(receiver,/Open project/i)]);
      await picker.setFiles({name:"Band.musiclab.json",mimeType:"application/json",buffer:copy});
      await receiver.locator("dialog[open] .confirm-action").click();
      await receiver.waitForFunction(()=>App.P.name==="POCKET BAND" && [...App.sampleIds(App.P)].every(id=>App.samples.has(id)));
      const imported=await receiver.evaluate(()=>App.KidsMusic.tracks.slice(4).map(ti=>App.P.tracks[ti].clips[0].map(n=>[n.s,n.n])));
      assert.deepEqual(imported,summary.notes);
    } finally {await fresh.close();}
    // A separate load sees only the disk cache, including after the local WAV
    // route goes away. No installed sound depends on a microphone or remote URL.
    await page.route("**/audio/kids/*.wav",route=>route.abort());
    const local=await page.evaluate(async()=>{
      const P=App.P,M=App.KidsMusic;App.samples.clear();
      const n=await App.restoreSamples(P);
      const S=App.KidsStore;S.enter(M.newProject);M.edit(App.P,4,0,0,0);S.save(2);S.leave();
      return n;
    });
    assert.equal(local,16);
    await page.reload();
    const shelf=await page.evaluate(async()=>{
      const P=App.KidsStore.read(2);await App.KidsWorld.ready(P);
      const id=P.tracks[3].kit.pads[0].id;
      return {note:P.tracks[3].clips[0][0].n,bytes:(await App.sampleBlob(id)).size,count:[...App.sampleIds(P)].filter(v=>App.samples.has(v)).length};
    });
    assert.equal(shelf.count,16);assert.equal(shelf.note,36);assert.ok(shelf.bytes>1000);
    assert.deepEqual(errors,[]);
    console.log("Sound library · 16 distinct one-shots, independent strips, streaming project/ID collision, offline shelf · peak "+
      summary.peak.toFixed(4)+" RMS "+summary.rms.toFixed(4));
  } finally {await context.close();}
};
