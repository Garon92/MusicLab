"use strict";

const assert = require("node:assert/strict");

module.exports = async function kidsStorage(reference) {
  const context = await reference.context().browser().newContext({viewport:{width:1100,height:620}});
  const errors = [];
  const url = new URL(reference.url()); url.search = "";
  const open = async () => {
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url.href);
    await page.waitForFunction(() => window.App?.P && App.KidsStore);
    return page;
  };
  try {
    const page = await open();
    const result = await page.evaluate(async () => {
      const S = App.KidsStore, P = App.P;
      P.name = "DESK TAKE"; App.commit(); P.bpm = 165; App.commit();
      const adult = localStorage.getItem("musiclab.v3");
      const factory = () => {
        const song = App.newProject(); song.name = "BAND"; return song;
      };
      const tone = new AudioBuffer({length:4800,sampleRate:48000,numberOfChannels:1});
      for (let i=0;i<tone.length;i++) tone.getChannelData(0)[i] = .25*Math.sin(i*2*Math.PI*200/48000);
      S.enter(factory);
      const blank = !S.canUndo() && !App.P.tracks.some(t => t.clips.some(clip=>clip.length));
      App.P.tracks[6].smp.id = await App.storeBuffer("BAND VOICE",tone);
      App.P.tracks[6].clips[0].push({s:2,n:60,l:2,v:.8,p:1});
      App.commit();
      const voice = App.P.tracks[6].smp.id, saved = S.save(0);
      App.P.bpm = 121; App.commit();
      const independent = S.read(0).bpm === 120 && S.read(0).tracks[6].smp.id === voice;
      S.fresh(factory); App.P.name = "OTHER BAND"; App.commit(); S.save(1);
      const oldSlot = S.slot;
      S.save(0);
      const overwritten = S.read(0).name;
      const restored = S.undo() && S.read(0).name === "BAND" && App.P.name === "OTHER BAND" && S.slot === oldSlot;
      S.load(0); const loaded = App.P.tracks[6].smp.id === voice && S.slot === 0;
      const back = S.undo() && App.P.name === "OTHER BAND" && S.slot === oldSlot;
      const newBlank = S.fresh(factory) && S.slot === -1;
      const newUndo = S.undo() && App.P.name === "OTHER BAND" && S.slot === oldSlot;
      S.fresh(factory);
      const orphan = await App.storeBuffer("UNREFERENCED",tone);
      const separate = S.slots().filter(Boolean).length === 2 && S.slots()[0].motif[1] === 1 && !S.read(2);
      // Simulate a full device precisely between its single-slot and draft writes.
      const set=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){
        if(key==="musiclab.kids.v1.draft")throw new DOMException("Full","QuotaExceededError");
        return set.call(this,key,value);
      };
      let atomic;
      try { atomic = !S.save(1) && S.read(1).name === "OTHER BAND" && S.slot === -1; }
      finally { Storage.prototype.setItem=set; }
      App.flush();
      const cleanPaper = localStorage.getItem("musiclab.v3") === adult;
      const oneEdit = S.canUndo();
      S.leave();
      const consoleCopy = App.P === P && P.name === "DESK TAKE" && P.bpm === 165;
      const consoleUndo = App.undo() && App.P.name === "DESK TAKE" && App.P.bpm === 120;
      App.redo();
      S.enter(factory);
      const resume = S.canUndo() === oneEdit && App.P.name === "BAND" && S.slot === -1;
      S.leave();
      return {voice,orphan,blank,saved,independent,restored,overwritten,loaded,back,newBlank,newUndo,separate,atomic,cleanPaper,consoleCopy,consoleUndo,resume};
    });
    for(const flag of ["blank","saved","independent","restored","loaded","back","newBlank","newUndo","separate","atomic","cleanPaper","consoleCopy","consoleUndo","resume"])
      assert.equal(result[flag],true,flag);
    assert.equal(result.overwritten,"OTHER BAND");
    await page.close();

    const reload = await open();
    // Wait for the real startup sweep to prove our unselected shelf voice was
    // retained by reachability, independently of decoded buffers in the old tab.
    await reload.waitForFunction(async id => !(await App.sampleBlob(id)),result.orphan);
    const durable = await reload.evaluate(async voice => {
      const S = App.KidsStore, song = S.read(0), adult = App.P;
      await App.restoreSamples(song);
      const decoded = App.samples.get(voice)?.buffer, count = decoded?.length || 0;
      const peak = decoded?.getChannelData(0).reduce((prev,v)=>Math.max(prev,Math.abs(v)),0) || 0;
      const threshold=App.ProjectFiles.streamFrom;App.ProjectFiles.streamFrom=1;
      try {
        const childFile=await App.ProjectFiles.blob(song), child=await App.ProjectFiles.read(childFile.blob);
        const adultFile=await App.ProjectFiles.blob(adult);
        return {peak,count,sample:child.raw.tracks[6].smp.id,entry:child.entries[0].id,childCount:childFile.count,adultCount:adultFile.count,refs:+localStorage.getItem("musiclab.v3.refs"),adult:adult.name};
      } finally {App.ProjectFiles.streamFrom=threshold;}
    },result.voice);
    assert.ok(durable.count>=4000 && durable.peak>.22);
    assert.equal(durable.sample,result.voice);assert.equal(durable.entry,result.voice);
    assert.equal(durable.childCount,1);assert.equal(durable.adultCount,0);
    assert.ok(durable.refs>=2);assert.equal(durable.adult,"DESK TAKE");

    await reload.evaluate(()=>{App.KidsStore.enter(App.newProject);App.KidsStore.load(0);App.KidsStore.save(4);});
    const sibling=await open();
    await sibling.evaluate(()=>{
      App.P.name="DESK IN ANOTHER TAB";App.commit();
      App.KidsStore.enter(App.newProject);App.KidsStore.load(1);App.KidsStore.save(4);
    });
    const concurrent=await reload.evaluate(()=>{
      const protectedShelf=!App.KidsStore.undo() && App.KidsStore.read(4).name==="OTHER BAND";
      App.KidsStore.leave();App.flush();
      return {protectedShelf,desk:App.stored().name};
    });
    assert.ok(concurrent.protectedShelf);assert.equal(concurrent.desk,"DESK IN ANOTHER TAB");
    const capacity=await sibling.evaluate(()=>{
      const S=App.KidsStore;
      for(let i=0;i<8;i++)if(!S.read(i)){App.P.name="SLOT "+i;App.commit();if(!S.save(i))return false;}
      return S.slots().length===8 && S.slots().every(Boolean) && !S.save(8) && !S.read(-1) && S.read(0).name==="BAND";
    });
    assert.ok(capacity,"Eight identifiable songs coexist without reusing an occupied slot");
    const futureVoice=await sibling.evaluate(async()=>{
      // A newer build can keep this sample somewhere this version cannot read.
      localStorage.setItem("musiclab.v3.refs","999");
      return App.storeBuffer("FUTURE PROJECT",new AudioBuffer({length:1000,sampleRate:48000,numberOfChannels:1}));
    });
    await reload.close();await sibling.close();
    const older=await open();
    await older.waitForFunction(async()=> (await navigator.locks.query()).held.some(l=>l.name==="musiclab.tabs" && l.mode==="shared"));
    assert.ok(await older.evaluate(async id=>!!(await App.sampleBlob(id)),futureVoice),"An older build swept a newer build's recording");
    assert.deepEqual(errors,[]);
    console.log("Kids songbook · independent console undo, eight-slot storage, atomic overwrite and undo, streamed file, multi-tab cleanup and voice recovery");
  } finally { await context.close(); }
};
