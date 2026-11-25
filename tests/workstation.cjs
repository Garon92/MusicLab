/* Exercise arrangements as references, device patches and controller interchange. */
const assert = require("node:assert/strict");

module.exports = async function checkWorkstation(reference) {
  const page = await reference.context().browser().newPage({viewport:{width:1100,height:620}});
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(8000);
  try {
    await page.goto(reference.url());
    await page.waitForSelector("#ed canvas");
    assert.equal(await page.getByRole("button",{name:"Reset project",exact:true}).count(),0);
    await page.getByRole("button",{name:"File",exact:true}).click();
    assert.equal(await page.getByRole("menuitem",{name:/^Reset project/i}).count(),1);
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const t = App.P.tracks[0];
      t.clips[0] = [{s:0,n:36,l:1,v:.8,p:1}];
      t.automation[0].pan = {mode:"linear",points:[{s:0,v:0},{s:16,v:1}]};
      App.P.chain = [0,1,0]; App.P.song = 1;
      App.commit(); App.refresh();
    });
    const arrange = page.getByRole("button",{name:"ARRANGE…",exact:true});
    await arrange.click();
    let dlg = page.getByRole("dialog",{name:"Song arrangement"});
    await dlg.getByRole("button",{name:"Slot 03, pattern A"}).click();
    await dlg.getByRole("button",{name:"Make variation"}).click();
    await dlg.getByRole("button",{name:"Apply arrangement"}).click();
    assert.deepEqual(await page.evaluate(() => App.P.chain),[0,1,2]);
    assert.ok(await page.evaluate(() => {
      const t=App.P.tracks[0];
      return JSON.stringify(t.clips[0])===JSON.stringify(t.clips[2]) &&
        JSON.stringify(t.automation[0])===JSON.stringify(t.automation[2]) && t.automation[0].pan.points !== t.automation[2].pan.points;
    }));
    await arrange.click();
    await dlg.getByRole("button",{name:"Slot 01, pattern A"}).click();
    await dlg.getByRole("button",{name:"Slot 02, pattern B"}).click({modifiers:["Shift"]});
    await dlg.getByRole("button",{name:"Repeat range"}).click();
    await dlg.getByRole("button",{name:"Earlier"}).click();
    await dlg.getByRole("button",{name:"Apply arrangement"}).click();
    assert.deepEqual(await page.evaluate(() => App.P.chain),[0,0,1,1,2]);
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    assert.deepEqual(await page.evaluate(() => App.P.chain),[0,1,2]);

    await page.evaluate(() => App.select(1,0));
    const patch = page.getByRole("button",{name:"PATCH…",exact:true});
    await patch.click();
    dlg = page.getByRole("dialog",{name:"Instrument patches"});
    await dlg.getByLabel("New patch name").fill("Original bass");
    await dlg.getByRole("button",{name:"Save current sound"}).click();
    await dlg.getByLabel("Instrument patch",{exact:true}).selectOption({label:"Glass keys"});
    await dlg.getByRole("button",{name:"Load patch"}).click();
    assert.equal(await page.evaluate(() => App.P.tracks[1].syn.fm),.32);
    await page.reload(); await patch.click();
    await dlg.getByLabel("Instrument patch",{exact:true}).selectOption({label:"Original bass"});
    await dlg.getByRole("button",{name:"Load patch"}).click();
    assert.equal(await page.evaluate(() => App.P.tracks[1].syn.cut),600);

    const roundtrip = await page.evaluate(async () => {
      const P=App.P=App.newProject(), t=P.tracks[2];
      P.pats[1].bars=16; P.chain=[1,0,1]; P.song=1; P.swing=66;
      t.clips[1]=[{s:255,n:74,l:1,v:.8,p:1}];
      P.tracks[0].automation[1].pan={mode:"linear",points:[{s:0,v:0},{s:256,v:1}]};
      const {project}=App.MidiImport.read(await App.Seq.midi().arrayBuffer(),"16 bars.mid");
      const out=project.tracks.find(t=>t.kind==="kit"&&t.automation[1].pan);
      const curve=out.automation[1].pan;
      return {chain:project.chain,bars:project.pats[1].bars,swing:project.swing,lateNote:project.tracks.some(t=>t.clips[1].some(n=>n.s===255&&n.n===74)),
        start:App.curveValue(curve,0),middle:App.curveValue(curve,128),end:App.curveValue(curve,255)};
    });
    assert.deepEqual(roundtrip.chain,[1,0,1]); assert.equal(roundtrip.bars,16);
    assert.equal(roundtrip.swing,66);
    assert.ok(roundtrip.lateNote && roundtrip.start===0 && Math.abs(roundtrip.middle-.5)<.015 && roundtrip.end>.98,JSON.stringify(roundtrip));
    assert.deepEqual(errors,[]);
  } finally {await page.close();}
};
