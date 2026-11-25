"use strict";
const assert=require("node:assert/strict");

module.exports=async function performanceTools(main){
  const ctx=await main.context().browser().newContext({viewport:{width:1280,height:720},acceptDownloads:true}),page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(8000);
  try{
    await page.goto(main.url());await page.waitForFunction(()=>App.P?.rules);
    const dialog=page.getByRole("dialog"),button=name=>page.getByRole("button",{name,exact:true});
    async function find(query){await page.keyboard.press("Control+k");await page.getByRole("combobox",{name:"Search commands"}).fill(query);await page.keyboard.press("Enter");}
    await find("sidechain");await dialog.getByLabel("Sidechain key").waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute("aria-label")),"Sidechain key");
    await page.keyboard.press("Control+k");await page.keyboard.press("Escape");
    assert.equal(await dialog.getAttribute("aria-label"),"Mixer routing");
    await page.keyboard.press("Escape");await find("reset");await dialog.getByRole("button",{name:"Cancel"}).click();
    assert.equal(await page.evaluate(()=>App.P.name),"UNTITLED");
    await find("warp");assert.equal(await dialog.getAttribute("aria-label"),"Sample editor");await page.keyboard.press("Escape");
    await page.evaluate(()=>{App.select(1,0);App.P.bpm=180;App.commit();App.refresh();document.activeElement.blur();});
    // Keyboard performance with stopped transport and note recording unarmed.
    await page.keyboard.down("a");await page.waitForTimeout(120);await page.keyboard.up("a");
    await page.waitForTimeout(60);await page.keyboard.down("d");await page.waitForTimeout(160);await page.keyboard.up("d");
    assert.deepEqual(await page.evaluate(()=>[!!App.recArm,App.Seq.playing,App.P.tracks[1].clips.flat().length]),[false,false,0]);
    await button("CAPTURE").click();await dialog.getByText(/2 notes ·/).waitFor();await dialog.getByLabel("Capture destination").selectOption("4");
    await dialog.getByRole("button",{name:"Audition"}).click();
    await dialog.getByRole("button",{name:"Create clip"}).click();
    const recovered=await page.evaluate(()=>structuredClone(App.P.tracks[1].clips[4]));
    assert.equal(recovered.length,2);assert.ok(recovered[1].n>recovered[0].n && recovered[1].s>=1);
    await button("UNDO").click();
    await button("CAPTURE").click();await dialog.getByText(/2 notes ·/).waitFor();await page.keyboard.press("Escape");
    await page.evaluate(()=>{
      App.select(1,0);const P=App.P;P.bpm=210;P.swing=20;P.performance.loops[1][0]=4;
      const notes=P.tracks[1].clips[0]=[60,61,62,63].map((n,s)=>({n,s,l:1,v:.7,p:1}));
      notes[3].p=.5;notes[3].r=3;
      App.commit();App.refresh();
    });
    await button("RULES").click();await dialog.getByLabel("Repeat period").selectOption("2");
    await dialog.getByLabel("Play on pass").selectOption("2");
    await dialog.getByRole("button",{name:"Apply rule"}).click();
    await dialog.getByLabel("Random seed").fill("734");await dialog.getByLabel("Random seed").press("Tab");
    await dialog.getByRole("button",{name:"Close"}).click();
    assert.ok(await page.evaluate(()=>App.P.tracks[1].clips[0].every(n=>n.when.every===2 && n.when.phase===2)));
    const decisions=await page.evaluate(()=>{
      const P=App.P, notes=P.tracks[1].clips[0];
      delete notes[0].when;notes[2].when={fill:1,phase:1,every:1};delete notes[3].when;
      App.commit();App.refresh();
      const slotInfo={slots:[{p:0,from:0,end:16},{p:1,from:16,end:32},{p:0,from:32,end:48}],arrangementSteps:48};
      const run=(bank,step)=>App.Rules.pass(P,1,bank,0,16,{...slotInfo,runStep:step,absoluteStep:step%48});
      const seedBits=p=>Array.from({length:40},(_,i)=>App.Rules.allow(p,1,0,{p:.5,s:i,n:70},1,i,false)).join();
      const packed=App.sanitize(structuredClone(P));return [run(0,0),run(1,16),run(0,32),run(1,64),seedBits(P)===seedBits(packed),seedBits(P)!==seedBits({...P,rules:{seed:735}})];
    });
    assert.deepEqual(decisions,[1,1,2,2,true,true]);
    await page.keyboard.down("Backslash");await page.evaluate(()=>App.Seq.play());await page.waitForTimeout(1250);await page.evaluate(()=>App.Seq.stop());await page.keyboard.up("Backslash");
    await button("RULES").click();
    const heard=dialog.getByLabel("Heard pass");
    await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label="Heard pass"] option')].some(o=>o.textContent.startsWith("Pass 2 ")));
    const passValue=await heard.locator("option").filter({hasText:/^Pass 2 /}).getAttribute("value");
    await heard.selectOption(passValue);await dialog.getByLabel("Print destination").selectOption("5");await dialog.getByRole("button",{name:"Print to clip"}).click();
    const print=await page.evaluate(()=>{
      const P=App.P,T=P.tracks[1],ns=T.clips[5], restored=App.sanitize(JSON.parse(JSON.stringify(P)));
      T.arp.mode=1;const out=[],sd=15/P.bpm;for(let s=0;s<4;s++)App.Seq.emit({play:(i,n,v,t,d)=>out.push([i,n,t,d])},P,5,s,(s+(s%2?P.swing/200:0))*sd,sd);
      return {pitches:ns.map(n=>n.n),resolved:ns.every(n=>n.fixed && n.p===1 && !n.when),length:P.performance.loops[1][5],saved:restored.tracks[1].clips[5],notes:ns,played:out.filter(n=>n[0]===1).map(n=>n[1])};
    });
    assert.ok([60,61,62].every(n=>print.pitches.includes(n)));assert.equal(print.resolved,true);assert.deepEqual(print.notes,print.saved);
    assert.equal(print.length,4);assert.deepEqual(print.played,print.pitches);
    // Notes on two different transport runs retain the real gap between them.
    async function playNote(n){
      return page.evaluate(async n=>{
        const time=App.E.ctx.currentTime;App.noteOn(n,.75,"probe"+n);
        await new Promise(done=>setTimeout(done,50));App.noteOff("probe"+n);return time;
      },n);
    }
    const prepared=tempo=>page.evaluate(tempo=>{
      App.P=App.newProject();App.P.bpm=120;App.P.arrangement.tempo=tempo;
      App.P.sel.t=1;App.Retrospective.reset();App.commit();App.refresh();App.Seq.play();
    },tempo);
    await prepared([]);
    await page.waitForFunction(()=>App.Seq.frame()?.step===1);
    const first=await playNote(65);
    await page.evaluate(()=>App.Seq.stop());await page.waitForTimeout(275);
    await page.evaluate(()=>App.Seq.play());await page.waitForFunction(()=>App.Seq.frame()?.step===1);
    const second=await playNote(67);
    await page.evaluate(()=>App.Seq.stop());await button("CAPTURE").click();
    await dialog.getByLabel("Clip alignment").selectOption("first");await dialog.getByRole("button",{name:"Create clip"}).click();
    const capturedAt=await page.evaluate(()=>{const n=App.P.tracks[1].clips[App.P.sel.p][1];return n.s+(n.off||0);});
    assert.ok(Math.abs(capturedAt-(second-first)/.125)<.35,"Retrospective capture preserves elapsed time across a transport restart");
    await prepared([{at:0,bpm:60,ramp:false},{at:8,bpm:240,ramp:false}]);
    for(const [step,pitch] of [[1,60],[7,62],[12,64]]){
      await page.waitForFunction(s=>App.Seq.frame()?.step===s,step);await playNote(pitch);
    }
    await page.evaluate(()=>App.Seq.stop());await button("CAPTURE").click();
    await dialog.getByText(/3 notes ·/).waitFor();await dialog.getByLabel("Capture range").selectOption("1");
    await dialog.getByText(/3 notes ·/).waitFor();await dialog.getByRole("button",{name:"Create clip"}).click();
    assert.deepEqual(await page.evaluate(()=>App.P.tracks[1].clips[App.P.sel.p].map(n=>n.n)),[60,62,64]);
    assert.deepEqual(errors,[]);
  }finally{await ctx.close();}
};
