/* Multi-scope edits must preserve material outside the target and undo in one step. */
const assert = require("node:assert/strict");

module.exports = async function checkOperations(reference) {
  const page = await reference.context().browser().newPage({viewport:{width:1100,height:620}});
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(reference.url());
    await page.waitForSelector("#ed canvas");
    await page.evaluate(() => {
      const P = App.P;
      const note = (s,n,v,l=1,p=1) => ({s,n,v,l,p});
      const curve = () => ({mode:"linear",points:[{s:0,v:.2},{s:16,v:.8}]});
      P.tracks[0].clips[0] = [note(0,36,.7,8),note(0,36,.9),note(4,36,.4),note(8,39,.2,1,0)];
      P.tracks[0].clips[1] = [note(0,36,.3),note(8,37,.3)];
      P.tracks[1].clips[0] = [note(0,64,.4),note(4,67,.6)];
      P.tracks[2].clips[0] = [note(0,60,.45),note(4,64,.75)];
      P.tracks[0].automation[0] = {vol:curve(),pan:curve()};
      P.tracks[0].automation[1] = {vol:curve()};
      P.tracks[1].automation[0] = {pan:curve()};
      P.tracks[0].kit.pads[0].id = "testsample01";
      Object.assign(P.tracks[0].kit.pads[0],{src:1,name:"CUSTOM",pit:5});
      Object.assign(P.tracks[6].smp,{id:"testsample02",tune:9,rev:1});
      P.tracks[1].pan = .61; P.fx.low = -5;
      App.commit(); App.refresh();
    });
    const original = await page.evaluate(() => JSON.stringify(App.P));
    const undo = async () => {
      await page.getByRole("button",{name:"UNDO",exact:true}).click();
      assert.equal(await page.evaluate(() => JSON.stringify(App.P)),original);
    };
    const dialog = page.getByRole("dialog",{name:"Batch edit",exact:true});
    const operation = async (category,name) => {
      await page.getByRole("button",{name:"BATCH EDIT…",exact:true}).click();
      await dialog.getByRole("button",{name:category,exact:true}).click();
      await dialog.getByLabel("Operation",{exact:true}).selectOption({label:name});
    };
    const target = key => dialog.getByLabel("Target",{exact:true}).selectOption(key);
    const apply = async () => {
      await dialog.getByRole("button",{name:"Apply",exact:true}).click();
      await dialog.waitFor({state:"hidden"});
    };

    await operation("Notes","Velocity ramp");
    await target("custom");
    await dialog.getByRole("button",{name:"Track 2 · BASS",exact:true}).click();
    await dialog.getByLabel("First attack (%)",{exact:true}).fill("20");
    await dialog.getByLabel("Last attack (%)",{exact:true}).fill("80");
    const noOverflow = await dialog.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
    assert.ok(noOverflow,"Custom processing fits the smallest supported desktop");
    assert.equal(await page.evaluate(() => JSON.stringify(App.P)),original,"Preview must be non-destructive");
    await apply();
    const slopes = await page.evaluate(() => App.P.tracks.slice(0,3).map(tr => tr.clips[0].map(n=>n.v)));
    assert.deepEqual(slopes,[[.2,.2,.5,.8],[.2,.8],[.45,.75]]);
    assert.deepEqual(await page.evaluate(() => App.P.tracks[0].clips[1].map(n=>n.v)),[.3,.3]);
    await undo();

    await operation("Clean up","Clear material");
    await dialog.getByLabel("Material",{exact:true}).selectOption("curves");
    await dialog.getByLabel("Automation lane",{exact:true}).selectOption("pan");
    await target("pattern");
    await apply();
    assert.deepEqual(await page.evaluate(() => [
      Object.keys(App.P.tracks[0].automation[0]),Object.keys(App.P.tracks[1].automation[0]),
      Object.keys(App.P.tracks[0].automation[1]),App.P.tracks[0].clips[0].length
    ]),[["vol"],[],["vol"],4]);
    await undo();

    await operation("Clean up","Remove duplicate notes");
    await apply();
    assert.deepEqual(await page.evaluate(() => App.P.tracks[0].clips[0].map(n=>n.v)),[.9,.4,.2]);
    await undo();

    await operation("Clean up","Trim overlapping notes");
    await apply();
    assert.equal(await page.evaluate(() => App.P.tracks[0].clips[0][0].l),4);
    await undo();

    await operation("Defaults","Instrument patch");
    await target("all");
    await apply();
    const reset = await page.evaluate(() => {
      const pad = App.P.tracks[0].kit.pads[0], smp = App.P.tracks[6].smp;
      return [pad.src,pad.name,pad.id,pad.pit,smp.id,smp.tune,smp.rev,App.P.tracks[1].pan,App.P.fx.low];
    });
    assert.deepEqual(reset,[1,"CUSTOM","testsample01",0,"testsample02",0,0,.61,-5]);
    await undo();

    await page.locator("#ed canvas").focus();
    await page.keyboard.press("Control+a");
    const selected = await page.evaluate(() => App.Ed.selected().size);
    assert.equal(selected,4);
    await operation("Notes","Set note values");
    assert.equal(await dialog.getByLabel("Target",{exact:true}).inputValue(),"selection");
    await dialog.getByLabel("Attribute",{exact:true}).selectOption("r");
    await dialog.getByLabel("Attacks",{exact:true}).fill("3");
    await apply();
    assert.deepEqual(await page.evaluate(() => [
      App.P.tracks[0].clips[0].map(n => n.r), App.P.tracks[1].clips[0].some(n => n.r),
      App.Ed.selected().size
    ]),[[3,3,3,3],false,4]);
    await undo();

    await operation("Defaults","Master effects");
    await dialog.getByLabel("Section",{exact:true}).selectOption("eq");
    await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
    assert.equal(await page.evaluate(() => JSON.stringify(App.P)),original);

    // Notes on different pitches and onsets above 127 must retain independent lookups.
    await page.evaluate(() => {
      const P = App.P;
      P.pats[0].bars = 16;
      P.tracks[0].clips[0] = [[0,37],[4,37],[128,36],[130,36]].map(([s,n]) => ({s,n,l:1,v:.8,p:1}));
      App.commit(); App.refresh();
    });
    await operation("Notes","Legato");
    await dialog.getByLabel("Next attack",{exact:true}).selectOption("same");
    await apply();
    assert.deepEqual(await page.evaluate(() => App.P.tracks[0].clips[0].map(n=>n.l)),[4,252,2,126]);

    // In 6/8 the beat is a dotted quarter. Both voices of a chord get the same
    // accent position, while a partial blend retains their relative dynamics.
    await page.evaluate(() => {
      const P = App.P;
      P.sig = App.SIGS.findIndex(([n,d]) => n === 6 && d === 8);
      P.pats[0].bars = 2;
      P.tracks[0].clips[0] = [[0,36,.4],[3,36,.4],[6,36,.4],[6,37,.6],[12,36,.4],[18,36,.4]]
        .map(([s,n,v]) => ({s,n,v,l:1,p:1}));
      App.commit(); App.refresh();
    });
    const compound = await page.evaluate(() => JSON.stringify(App.P));
    await operation("Notes","Rhythmic accents");
    await dialog.getByLabel("Rhythm",{exact:true}).selectOption("backbeat");
    await dialog.getByLabel("Blend (%)",{exact:true}).fill("50");
    await dialog.getByLabel("Other velocity (%)",{exact:true}).fill("20");
    await apply();
    assert.deepEqual(await page.evaluate(() => App.P.tracks[0].clips[0].map(n=>n.v)),[.3,.3,.7,.8,.3,.7]);
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    assert.equal(await page.evaluate(() => JSON.stringify(App.P)),compound);

    await page.evaluate(() => {
      const P = App.P;
      P.sig = App.SIGS.findIndex(([n,d]) => n === 4 && d === 4);
      P.tracks[0].clips[0] = Array.from({length:32},(_,s) => ({s,n:36,v:.4,l:1,p:1}));
      App.commit(); App.refresh();
    });
    await operation("Notes","Rhythmic accents");
    await dialog.getByLabel("Rhythm",{exact:true}).selectOption("tresillo");
    await dialog.getByLabel("Blend (%)",{exact:true}).fill("100");
    await apply();
    assert.deepEqual(await page.evaluate(() => App.P.tracks[0].clips[0].filter(n=>n.v===1).map(n=>n.s)),[0,6,12,16,22,28]);
    assert.deepEqual(errors,[]);
  } finally { await page.close(); }
};
