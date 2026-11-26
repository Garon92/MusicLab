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
      const removed = S.remove(0,S.slots()[0]) && !S.read(0) && S.slot===oldSlot && S.lastRemoval===0 &&
        S.save(0) && S.undo() && !S.read(0) && S.undo() && S.read(0).tracks[6].smp.id===voice;
      const keptDraft = S.remove(oldSlot) && S.slot===-1 && App.P.name==="OTHER BAND" && !S.read(oldSlot) &&
        S.undo() && S.slot===oldSlot && S.read(oldSlot).name==="OTHER BAND";
      const legacyKey="musiclab.kids.v1.slot.7";
      localStorage.setItem(legacyKey,JSON.stringify(App.P));
      const legacy = S.remove(7) && !S.read(7) && S.undo() && S.read(7).name==="OTHER BAND" && S.remove(7);
      const stale=S.slots()[0];S.save(0);
      const changedCopyProtected=!S.remove(0,stale) && S.read(0).name==="OTHER BAND" && S.undo() && S.read(0).name==="BAND";
      const newBlank = S.fresh(factory) && S.slot === -1;
      const newUndo = S.undo() && App.P.name === "OTHER BAND" && S.slot === oldSlot;
      S.fresh(factory);
      const orphan = await App.storeBuffer("UNREFERENCED",tone);
      const separate = S.slots().filter(Boolean).length === 2 && S.slots()[0].motif[1] === 1 && !S.read(2);
      // Either write can hit quota. The offered song, selected slot and
      // persisted draft must all survive the failed replacement.
      const set=Storage.prototype.setItem;
      let atomic=true;
      for(const blocked of ["musiclab.kids.v1.draft","musiclab.kids.v1.slot.1"]){
        const draft=localStorage.getItem("musiclab.kids.v1.draft");
        Storage.prototype.setItem=function(key,value){
          if(key===blocked)throw new DOMException("Full","QuotaExceededError");
          return set.call(this,key,value);
        };
        try { atomic=atomic && !S.save(1) && S.read(1).name==="OTHER BAND" && S.slot===-1 &&
          localStorage.getItem("musiclab.kids.v1.draft")===draft; }
        finally { Storage.prototype.setItem=set; }
      }
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
      return {voice,orphan,blank,saved,independent,restored,overwritten,loaded,back,removed,keptDraft,legacy,changedCopyProtected,newBlank,newUndo,separate,atomic,cleanPaper,consoleCopy,consoleUndo,resume};
    });
    for(const flag of ["blank","saved","independent","restored","loaded","back","removed","keptDraft","legacy","changedCopyProtected","newBlank","newUndo","separate","atomic","cleanPaper","consoleCopy","consoleUndo","resume"])
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
    assert.ok(durable.refs>=3);assert.equal(durable.adult,"DESK TAKE");
    assert.equal(await reload.evaluate(()=>localStorage.getItem("musiclab.kids.v1.slot.7")),null,"The exclusive startup sweep released the deleted shelf space");

    const firstVersion=await reload.evaluate(()=>{
      const S=App.KidsStore;S.enter(App.newProject);
      if(!S.load(0)||!S.save(4))throw Error("Cannot seed the shared slot");
      return localStorage.getItem("musiclab.kids.v1.slot.4");
    });
    const sibling=await open();
    const secondSaved=await sibling.evaluate(()=>{
      App.P.name="DESK IN ANOTHER TAB";App.commit();
      const S=App.KidsStore;S.enter(App.newProject);
      return S.load(1) && S.save(4) && S.read(4).name==="OTHER BAND";
    });
    assert.ok(secondSaved,"The second tab completed its save");
    // WebKit can finish a save in one process before it delivers the storage
    // update to the other. Reproduce that old snapshot deterministically.
    const localUndo=await reload.evaluate(version=>{
      const get=Storage.prototype.getItem;
      Storage.prototype.getItem=function(key){return key==="musiclab.kids.v1.slot.4"?version:get.call(this,key);};
      try {return App.KidsStore.undo();} finally {Storage.prototype.getItem=get;}
    },firstVersion);
    assert.ok(localUndo,"The old snapshot still believed its version was current");
    await reload.waitForFunction(()=>App.KidsStore.read(4)?.name==="OTHER BAND");
    assert.equal(await sibling.evaluate(()=>App.KidsStore.read(4)?.name),"OTHER BAND","A stale Undo did not remove the successful save");
    // Once the writer's newer version has arrived, Undo can reject the conflict immediately.
    assert.ok(await reload.evaluate(()=>App.KidsStore.save(5)));
    await sibling.waitForFunction(()=>App.KidsStore.read(5)?.name==="BAND");
    assert.ok(await sibling.evaluate(()=>App.KidsStore.save(5)));
    await reload.waitForFunction(()=>App.KidsStore.read(5)?.name==="OTHER BAND");
    const concurrent=await reload.evaluate(()=>{
      const protectedShelf=!App.KidsStore.undo() && App.KidsStore.read(5).name==="OTHER BAND";
      App.KidsStore.leave();App.flush();
      return {protectedShelf,desk:App.P.name};
    });
    assert.ok(concurrent.protectedShelf);assert.equal(concurrent.desk,"DESK TAKE");
    await reload.waitForFunction(()=>App.stored().name==="DESK IN ANOTHER TAB");
    assert.equal(await sibling.evaluate(()=>App.stored().name),"DESK IN ANOTHER TAB");
    const capacity=await sibling.evaluate(()=>{
      const S=App.KidsStore;
      for(let i=0;i<8;i++)if(!S.read(i)){App.P.name="SLOT "+i;App.commit();if(!S.save(i))return false;}
      for(let i=0;i<12;i++){App.P.name="TAKE "+i;App.commit();if(!S.save(6)||!S.undo())return false;}
      const masks=Object.keys(localStorage).filter(k=>k.startsWith("musiclab.kids.v1.undo.6."));
      return masks.length<=1 && S.slots().length===8 && S.slots().every(Boolean) && !S.save(8) && !S.read(-1) && S.read(0).name==="BAND";
    });
    assert.ok(capacity,"Eight identifiable songs coexist without reusing an occupied slot");
    const covers=await sibling.evaluate(()=>{
      const S=App.KidsStore,M=App.KidsMusic;
      S.fresh(M.newProject);
      M.edit(App.P,4,0,0,0);M.edit(App.P,4,0,0,2);M.edit(App.P,7,1,0,1);App.commit();S.save(6);
      const duet=S.slots()[6].sounds;
      const farm=App.P.tracks[M.tracks[4]].kit.pads;
      farm[0].id=farm[1].id;App.commit();S.save(7);
      const swapped=S.slots()[7].sounds;
      S.fresh(M.newProject);M.edit(App.P,1,2,1,5);M.costume(App.P,1,2);App.commit();S.save(7);
      return {duet,swapped,bass:S.slots()[7].sounds,costume:S.slots()[7].costumes[1]};
    });
    assert.deepEqual(covers,{duet:["cow","train"],swapped:["pig","train"],bass:[1],costume:2});
    const futureVoice=await sibling.evaluate(async()=>{
      // A newer build can keep this sample somewhere this version cannot read.
      localStorage.setItem("musiclab.v3.refs","999");
      return App.storeBuffer("FUTURE PROJECT",new AudioBuffer({length:1000,sampleRate:48000,numberOfChannels:1}));
    });
    await reload.close();await sibling.close();
    const older=await open();
    await older.waitForFunction(async()=> (await navigator.locks.query()).held.some(l=>l.name==="musiclab.tabs" && l.mode==="shared"));
    assert.ok(await older.evaluate(async id=>!!(await App.sampleBlob(id)),futureVoice),"An older build swept a newer build's recording");
    await older.locator("#kids-entry").click();
    const kids=older.locator("#kids-root"),songs=kids.locator('[data-k="shelf"]');
    await songs.click();
    const sheet=kids.getByRole("region",{name:"Moje písničky",exact:true});
    assert.equal(await sheet.locator('[data-k="slot"]').count(),8);
    assert.equal(await sheet.locator('[data-k="removeSlot"]').count(),8);
    const badTargets=await sheet.locator("button").evaluateAll(buttons=>buttons.filter(button=>{
      const r=button.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width<63.95 || r.height<63.95 || !button.contains(hit);
    }).map(button=>button.getAttribute("aria-label")));
    assert.deepEqual(badTargets,[],"All eight songs and their individual actions fit the smallest desktop");
    assert.ok(await sheet.getByRole("button",{name:"Otevřít: Písnička 7 · Kráva a vlak",exact:true}).isVisible());
    assert.equal(await sheet.locator('[data-k="slot"][data-index="6"] .kv-cover-pictures svg').count(),2);
    assert.ok(await sheet.getByRole("button",{name:"Otevřít: Písnička 8 · Basa",exact:true}).isVisible());
    await sheet.getByRole("button",{name:"Smazat: Písnička 1 · BAND",exact:true}).click();
    await older.waitForFunction(()=>App.KidsStore.read(0)===null);
    assert.equal(await sheet.locator(":focus").getAttribute("data-k"),"restoreSlot");
    await older.keyboard.press("Enter");
    assert.equal(await older.evaluate(()=>App.KidsStore.read(0).name),"BAND");
    assert.equal(await sheet.locator('[role="status"]').textContent(),"Písnička je zpátky.");
    assert.equal(await sheet.locator(":focus").getAttribute("data-index"),"0");
    await sheet.getByRole("button",{name:"Nová písnička",exact:true}).click();
    await songs.click();
    await sheet.getByRole("button",{name:"Uložit písničku",exact:true}).click();
    const replace=kids.getByRole("region",{name:"Vyber písničku k přepsání",exact:true});
    await replace.locator('[data-k="slot"][data-index="0"]').click();
    assert.equal(await older.evaluate(()=>App.KidsStore.read(0).name),"BAND");
    await replace.getByRole("button",{name:"Přepsat písničku 1",exact:true}).click();
    assert.equal(await older.evaluate(()=>App.KidsStore.read(0).name),"POCKET BAND");
    assert.deepEqual(await older.evaluate(()=>App.KidsStore.slots()[0].sounds),[]);
    assert.deepEqual(errors,[]);
    console.log("Kids songbook · named save/open/delete controls, eight visible songs, undoable removal and overwrite, legacy songs, streamed file, multi-tab cleanup and voice recovery");
  } finally { await context.close(); }
};
