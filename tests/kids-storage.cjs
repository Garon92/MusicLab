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
      function check(condition, message) {
        if (!condition) throw Error(message);
      }
      check(!S.canUndo() && !S.canRedo() && !App.P.tracks.some(t => t.clips.some(clip=>clip.length)),
        "Fresh band history starts empty");
      App.P.tracks[6].smp.id = await App.storeBuffer("BAND VOICE",tone);
      App.P.tracks[6].clips[0].push({s:2,n:60,l:2,v:.8,p:1});
      App.commit();
      const voice = App.P.tracks[6].smp.id;
      check(S.save(0), "Save the recorded band");
      const firstSave = JSON.stringify(S.read(0));
      // Follow the child's sequence: keep the recording, undo the note, save a second copy, and redo.
      check(S.undo() && !App.P.tracks[6].smp.id && !App.P.tracks[6].clips[0].length && !S.canUndo(),
        "Undo immediately after Save undoes the recording edit");
      check(S.slot===0 && JSON.stringify(S.read(0))===firstSave, "Undo leaves the saved take and its slot intact");
      check(S.save(2) && S.canRedo() && !S.canUndo(), "Saving an undone draft in another slot keeps its forward history");
      check(S.redo() && !S.canRedo() && App.P.tracks[6].smp.id===voice && App.P.tracks[6].clips[0].length===1 && S.slot===2,
        "Redo recovers the recording in the draft");
      check(!S.read(2).tracks[6].smp.id && JSON.stringify(S.read(0))===firstSave, "Redo leaves both saved copies intact");
      check(S.remove(2,S.slots()[2]) && S.slot===-1 && S.save(0), "Return the recorded draft to its first slot");

      App.P.bpm = 121; App.commit();
      check(S.read(0).bpm===120 && S.save(0) && S.read(0).bpm===121, "Overwriting updates the shelf only on Save");
      check(S.undo() && App.P.bpm===120 && S.read(0).bpm===121 && S.canRedo(),
        "Undo after an overwrite preserves the new snapshot");
      check(S.save(0) && S.canRedo() && S.redo() && App.P.bpm===121 && S.read(0).bpm===120,
        "Updating an existing slot while undone keeps forward edits");
      check(S.undo() && App.P.bpm===120 && JSON.stringify(S.read(0))===firstSave,
        "Both copies of the first recording are unchanged");

      S.fresh(factory); App.P.name = "OTHER BAND"; App.commit(); S.save(1);
      check(S.load(0) && App.P.tracks[6].smp.id===voice && S.slot===0, "Load the saved recording");
      check(S.undo() && App.P.name==="OTHER BAND" && S.slot===1, "Undo load recovers the previous draft and its slot");
      check(S.redo() && App.P.tracks[6].smp.id===voice && S.slot===0 && S.undo(),
        "Redo load recovers the selected recording and its slot");

      App.P.bpm=133;App.commit();
      check(S.remove(0,S.slots()[0]) && !S.read(0) && S.lastRemoval===0, "Delete a saved song explicitly");
      check(S.undo() && App.P.bpm===120 && !S.read(0) && S.lastRemoval===0,
        "Undo changes the draft while the deleted song stays off the shelf");
      check(S.restoreRemoval() && JSON.stringify(S.read(0))===firstSave && S.canRedo(),
        "Shelf recovery restores the recording without touching forward edits");
      check(S.redo() && App.P.bpm===133 && S.slot===1, "Return to the latest draft");
      check(S.remove(1) && S.slot===-1 && App.P.name==="OTHER BAND" && S.remove(0),
        "Deleting the active save detaches its draft");
      check(S.lastRemoval===0 && S.restoreRemoval() && S.lastRemoval===1 && S.restoreRemoval() && S.slot===1,
        "Restore successive deletions and reattach the open song");

      // Open the old unversioned save twice. Each visit remembers this shelf destination.
      const legacyKey="musiclab.kids.v1.slot.7", legacySong=JSON.stringify({...App.P,name:"LEGACY SONG"});
      localStorage.setItem(legacyKey,legacySong);
      check(S.load(7), "Visit an unversioned song"); App.P.bpm=145;App.commit();
      check(S.load(7) && App.P.bpm===133 && S.slot===7, "Second visit opens the saved version");
      const beforeDraft=localStorage.getItem("musiclab.kids.v1.draft"), beforeRemoval=S.lastRemoval;
      const originalSet=Storage.prototype.setItem;
      for(const blocked of ["musiclab.kids.v1.draft",legacyKey,"musiclab.kids.v1.undo.7."]){
        let failed=false;
        Storage.prototype.setItem=function(key,value){
          if(key.startsWith(blocked)){failed=true;throw new DOMException("Full","QuotaExceededError");}
          return originalSet.call(this,key,value);
        };
        try {check(!S.remove(7) && failed,"Failed legacy deletion at "+blocked);}
        finally {Storage.prototype.setItem=originalSet;}
        check(localStorage.getItem(legacyKey)===legacySong && localStorage.getItem("musiclab.kids.v1.draft")===beforeDraft,
          "Failed deletion preserves the exact legacy song and persisted draft");
        check(S.slot===7 && S.read(7)?.name==="LEGACY SONG" && S.lastRemoval===beforeRemoval,
          "Failed deletion keeps the old song selected and adds no shelf recovery");
        check(!Object.keys(localStorage).some(key=>key.startsWith("musiclab.kids.v1.undo.7.")),
          "A failed migration leaves no pending deletion marker");
      }
      check(S.remove(7) && !S.read(7) && S.slot===-1 && S.restoreRemoval(7) && S.slot===7,
        "Successful legacy deletion and restoration reattach the active draft");
      check(S.undo() && App.P.bpm===145 && S.slot===7 && S.redo() && App.P.bpm===133 && S.slot===7,
        "Both older visits stay attached to the restored legacy song");
      check(S.remove(7) && S.undo() && S.slot===-1 && S.undo() && S.slot===-1 && S.undo() && S.slot===1 && App.P.name==="OTHER BAND",
        "Both legacy visits detach after deletion and the other song keeps its own slot");
      // The previous build could keep a visible replacement under the version's undo key.
      const version = "older-save";
      localStorage.setItem("musiclab.kids.v1.slot.3", JSON.stringify({_bandShelfVersion:version, ...App.P}));
      localStorage.setItem("musiclab.kids.v1.undo.3."+version, JSON.stringify({...App.P,name:"VISIBLE OLD TAKE"}));
      check(S.read(3).name==="VISIBLE OLD TAKE" && S.remove(3) && S.restoreRemoval() && S.read(3).name==="VISIBLE OLD TAKE" && S.remove(3),
        "A legacy shelf override keeps the song the child saw");
      const stale=S.slots()[1];
      check(S.save(1) && !S.remove(1,stale) && !S.save(1,stale) && S.read(1).bpm===133,
        "An old cover cannot remove or overwrite the newer save");
      check(S.fresh(factory) && S.slot===-1 && S.undo() && App.P.name==="OTHER BAND" && S.slot===1 && S.redo() && S.slot===-1,
        "New song and its slot can be undone and redone");
      App.P.bpm=140;App.commit();S.undo();
      check(S.canRedo() && S.save(6), "Saving keeps the way forward");
      App.P.bpm=141;App.commit();
      check(!S.canRedo() && S.read(6).bpm===120 && S.remove(6),
        "A new musical edit branches the draft but leaves its saved snapshot alone");
      const orphan = await App.storeBuffer("UNREFERENCED",tone);
      check(S.slots().filter(Boolean).length===2 && S.slots()[0].motif[1]===1 && !S.read(2),
        "Shelf and draft contain the intended songs");
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
      return {voice,orphan,atomic,cleanPaper,consoleCopy,consoleUndo,resume};
    });
    for(const flag of ["atomic","cleanPaper","consoleCopy","consoleUndo","resume"])assert.equal(result[flag],true,flag);
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

    const staleDeletion=await reload.evaluate(()=>{
      const S=App.KidsStore;S.enter(App.newProject);
      if(!S.load(0)||!S.save(4)||!S.remove(4))throw Error("Cannot seed the shared deletion");
      const keys=Object.keys(localStorage).filter(key=>key==="musiclab.kids.v1.slot.4" || key.startsWith("musiclab.kids.v1.undo.4."));
      return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
    });
    const sibling=await open();
    const secondSaved=await sibling.evaluate(()=>{
      App.P.name="DESK IN ANOTHER TAB";App.commit();
      const S=App.KidsStore;S.enter(App.newProject);
      return S.load(1) && S.save(4) && S.read(4).name==="OTHER BAND";
    });
    assert.ok(secondSaved,"The second tab completed its save");
    // A lagging WebKit storage snapshot can still show a deleted version after
    // the other tab saves here. A restore may act only on the deleted version.
    await reload.evaluate(snapshot=>{
      const get=Storage.prototype.getItem;
      Storage.prototype.getItem=function(key){
        if(key==="musiclab.kids.v1.slot.4" || key.startsWith("musiclab.kids.v1.undo.4."))return snapshot[key]??null;
        return get.call(this,key);
      };
      try {App.KidsStore.restoreRemoval();} finally {Storage.prototype.getItem=get;}
    },staleDeletion);
    await reload.waitForFunction(()=>App.KidsStore.read(4)?.name==="OTHER BAND");
    assert.equal(await sibling.evaluate(()=>App.KidsStore.read(4)?.name),"OTHER BAND","A stale restore did not replace the other tab's save");
    assert.ok(await reload.evaluate(()=>App.KidsStore.save(5)));
    await sibling.waitForFunction(()=>App.KidsStore.read(5)?.name==="BAND");
    assert.ok(await reload.evaluate(()=>{
      const S=App.KidsStore;
      App.P.bpm=150;App.commit();
      window.coverBeforeDelete=S.slots()[5];
      return S.remove(5,window.coverBeforeDelete);
    }));
    await sibling.waitForFunction(()=>!App.KidsStore.read(5));
    assert.ok(await sibling.evaluate(()=>App.KidsStore.save(5)));
    await reload.waitForFunction(()=>App.KidsStore.read(5)?.name==="OTHER BAND");
    const concurrent=await reload.evaluate(()=>{
      const S=App.KidsStore,version=localStorage.getItem("musiclab.kids.v1.slot.5");
      const protectedShelf=!S.remove(5,window.coverBeforeDelete) && !S.save(5,window.coverBeforeDelete) && !S.restoreRemoval();
      const draftHistory=S.undo() && App.P.bpm===120 && S.redo() && App.P.bpm===150;
      const unchanged=localStorage.getItem("musiclab.kids.v1.slot.5")===version && S.read(5)?.name==="OTHER BAND";
      S.leave();App.flush();
      return {protectedShelf,draftHistory,unchanged,desk:App.P.name};
    });
    assert.deepEqual(concurrent,{protectedShelf:true,draftHistory:true,unchanged:true,desk:"DESK TAKE"});
    await reload.waitForFunction(()=>App.stored().name==="DESK IN ANOTHER TAB");
    assert.equal(await sibling.evaluate(()=>App.stored().name),"DESK IN ANOTHER TAB");
    const capacity=await sibling.evaluate(()=>{
      const S=App.KidsStore;
      for(let i=0;i<8;i++)if(!S.read(i)){App.P.name="SLOT "+i;App.commit();if(!S.save(i))return false;}
      for(let i=0;i<12;i++){
        const name="TAKE "+i;
        App.P.name=name; App.commit();
        if(!S.save(6) || !S.undo() || S.read(6).name!==name)return false;
      }
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
    // A tap only shakes Smazat; the song goes away on a hold.
    const trash=sheet.getByRole("button",{name:"Smazat: Písnička 1 · BAND · podržet",exact:true});
    await trash.click();
    assert.equal(await older.evaluate(()=>App.KidsStore.read(0)?.name),"BAND","a tap on Smazat deletes nothing");
    const bin=await trash.boundingBox();
    await older.mouse.move(bin.x+bin.width/2,bin.y+bin.height/2);await older.mouse.down();
    await older.waitForFunction(()=>App.KidsStore.read(0)===null);await older.mouse.up();
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
    console.log("Kids songbook · durable saves and overwrites, independent draft undo/redo, reversible shelf deletion, eight songs, multi-tab conflicts, streamed file and voice recovery");
  } finally { await context.close(); }
};
