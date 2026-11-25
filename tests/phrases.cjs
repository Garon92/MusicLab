/* Phrase edits use project history. Run in a separate browser context so even a
   failed assertion cannot change the project being exercised by the caller. */
"use strict";
const assert = require("node:assert/strict");

module.exports = async function checkPhrases(caller) {
  const context = await caller.context().browser().newContext({viewport:{width:1100,height:620}});
  try {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(caller.url());
    await page.locator("#ed .ed-b canvas").waitFor();
    await page.evaluate(() => {
      const P = App.P, T = P.tracks[0];
      T.clips[0] = [{s:1,l:3,n:36,v:.76,p:1,r:3},{s:8,l:1,n:38,v:.44,p:1}];
      T.automation[0] = {vol:{mode:"linear",points:[{s:0,v:.2},{s:16,v:.9}]}};
      P.tracks[2].clips[0] = [{s:4,l:3,n:60,v:.33,p:1}];
      P.pats[1].bars = 2;
      P.tracks[1].clips[1] = [{s:0,l:4,n:48,v:.6,p:1},{s:25,l:7,n:56,v:.9,p:1}];
      P.tracks[1].automation[1] = {vol:{mode:"step",points:[{s:0,v:.8},{s:12,v:.3}]}};
      App.commit(); App.refresh();
    });
    const snapshot = () => page.evaluate(() => ({tracks:App.P.tracks, patterns:App.P.pats, song:App.P.chain}));
    const original = await snapshot();
    const dialog = page.getByRole("dialog", {name:"Phrase",exact:true});
    const open = () => page.getByRole("button", {name:"PHRASE…",exact:true}).click();
    const choose = (field, value) => dialog.getByLabel(field, {exact:true}).selectOption(String(value));
    const apply = async () => {
      await dialog.getByRole("button", {name:"Apply",exact:true}).click();
      await dialog.waitFor({state:"detached"});
    };
    const undo = () => page.getByRole("button", {name:/^undo$/i}).click();

    await open(); await choose("Total copies",16); await apply();
    const tiled = await snapshot();
    assert.equal(tiled.patterns[0].bars,16);
    assert.equal(tiled.tracks[0].clips[0].length,32);
    assert.deepEqual(tiled.tracks[2],original.tracks[2]);
    const curveError = await page.evaluate(() => {
      const lane = App.P.tracks[0].automation[0].vol;
      let maxError = 0;
      for (let s=0; s<256; s+=.25) {
        const expected = .2 + (s % 16) * .7 / 16;
        maxError = Math.max(maxError,Math.abs(App.curveValue(lane,s)-expected));
      }
      return maxError;
    });
    assert.ok(curveError < 1e-8, "Each copied ramp must jump back to its exact starting level.");
    for (let i=0; i<3; i++) await page.getByRole("button",{name:"Next bars",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>App.Ed.range()),{start:192,end:256});
    const grid = page.locator("#ed .ed-b canvas"), box = await grid.boundingBox();
    await grid.click({position:{x:box.width-2,y:box.height*.2}});
    assert.ok(await page.evaluate(()=>App.P.tracks[0].clips[0].some(n=>n.s===255)));
    await undo(); await undo();
    assert.deepEqual(await snapshot(),original);

    await open(); await choose("Operation","insert"); await choose("Source track",1);
    await choose("Source pattern",1); await choose("Place at bar",1); await apply();
    assert.deepEqual(await page.evaluate(()=>App.P.tracks[0].clips[0].map(n=>n.s)),[0,25,33,40]);
    const samples = await page.evaluate(()=>[1,13,31.5,32,40,48].map(s=>App.curveValue(App.P.tracks[0].automation[0].vol,s)));
    assert.ok(samples.every((v,i)=>Math.abs(v-[.8,.3,.3,.2,.55,.9][i]) < 1e-7),"Inserted step lane and original fade must both keep their interpolation");
    await undo();
    await open(); await choose("Scope","pattern"); await choose("Operation","stretch"); await choose("Result bars",3); await apply();
    assert.equal(await page.evaluate(()=>App.P.tracks[0].clips[0][0].l),9);
    assert.equal(await page.evaluate(()=>App.P.tracks[2].clips[0][0].s),12);

    await open(); await choose("Operation","resize"); await choose("Result bars",1);
    assert.match(await dialog.locator(".ph-preview").textContent(),/removed|replaced/i);
    await apply(); await undo(); await undo();
    assert.deepEqual(await snapshot(),original);

    for (const [width,height] of [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]]) {
      await page.setViewportSize({width,height}); await open(); await choose("Operation","overlay");
      const overflows = await page.evaluate(()=>[document.querySelector(".phrase-dialog"),document.querySelector("#ed .ed-tools")]
        .some(el=>el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1));
      assert.equal(overflows,false,"Phrase dialog and editor fit at "+width+"×"+height);
      await page.keyboard.press("Escape"); await dialog.waitFor({state:"detached"});
    }
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
};
