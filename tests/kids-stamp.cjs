"use strict";
const assert=require("node:assert/strict");

module.exports=async function kidsStamp(reference){
  const browser=reference.context().browser();
  const context=await browser.newContext({hasTouch:true,viewport:{width:1100,height:620}});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(8000);
  const root=page.locator("#kids-band");
  const control=k=>root.locator('[data-k="'+k+'"]');
  const pad=row=>root.locator('[data-k="pad"][data-row="'+row+'"]');
  const note=(row,col)=>root.locator('[data-k="note"][data-row="'+row+'"][data-col="'+col+'"]');
  const ghost=root.locator(".kv-stamp-ghost");
  const notes=()=>page.evaluate(()=>App.P.tracks[App.P.sel.t].clips[App.P.sel.p].map(n=>({...n})));
  const center=async el=>{const r=await el.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  async function drag(row,over,col,finish){
    const from=await center(pad(row)),to=await center(note(over,col));
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    try{
      await page.mouse.move(to.x,to.y,{steps:5});await ghost.waitFor();
      assert.equal(await note(row,col).evaluate(el=>el.classList.contains("kv-stamp-target")),true);
      if(row!==over)assert.equal(await note(over,col).evaluate(el=>el.classList.contains("kv-stamp-target")),false);
      assert.equal(await ghost.locator("svg").evaluate(el=>el.outerHTML),await pad(row).locator("svg").evaluate(el=>el.outerHTML));
      if(finish)await finish();
    }finally{await page.mouse.up();}
    await ghost.waitFor({state:"detached"});
    assert.equal(await root.locator(".kv-stamp-target").count(),0);
  }
  try{
    const url=new URL(reference.url());url.search="?kids";await page.goto(url.href);
    await pad(0).waitFor();await page.waitForFunction(()=>App.Kids.active);
    assert.equal(await pad(1).getAttribute("aria-label"),"Play Pig");
    await pad(2).tap();assert.deepEqual(await notes(),[],"a tap auditions without writing a beat");
    await drag(1,3,6);
    const stamped=await notes();
    assert.deepEqual(stamped.map(n=>[n.n,n.s]),[[37,12]],"drop a pig on beat 7, even across another row");
    await drag(1,3,6);assert.deepEqual(await notes(),stamped,"occupied notes keep their duration and expression");
    await control("undo").click();assert.deepEqual(await notes(),[],"one completed stamp makes one undo step");
    assert.equal(await control("undo").isDisabled(),true);
    await drag(2,1,1,async()=>{const out=await center(control("save"));await page.mouse.move(out.x,out.y);});
    assert.deepEqual(await notes(),[]);assert.equal(await page.evaluate(()=>App.KidsStore.slots().some(Boolean)),false);
    await drag(0,0,4,async()=>{await page.keyboard.press("Escape");});
    assert.deepEqual(await notes(),[],"an abandoned stamp leaves the clip empty");
    // Changing the pattern with another input while the original mouse is still held
    // cancels the old ghost before releasing; it cannot write into the next pattern.
    await drag(2,3,4,async()=>{
      await page.evaluate(()=>App.Kids.dispatch("pattern",1));
      await ghost.waitFor({state:"detached"});
    });
    assert.deepEqual(await notes(),[]);
    await drag(0,3,2,async()=>{
      await control("shelf").evaluate(b=>b.click());
      await ghost.waitFor({state:"detached"});
    });
    await control("back").click();assert.deepEqual(await notes(),[],"opening the shelf cancels the stamp");
    if(browser.browserType().name()==="chromium"){
      // Playwright's tap cannot move a touch point. Send a real browser touch
      // sequence through CDP to exercise capture, cancellation and generated clicks.
      const cdp=await context.newCDPSession(page),start=await center(pad(3)),target=await center(note(1,5));
      const touch=(type,point)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:point?[{...point,id:1,radiusX:4,radiusY:4}]:[]});
      await touch("touchStart",start);await touch("touchMove",target);await ghost.waitFor();
      await touch("touchCancel");await ghost.waitFor({state:"detached"});assert.deepEqual(await notes(),[]);
      await touch("touchStart",start);await touch("touchMove",target);await ghost.waitFor();await touch("touchEnd");
      await page.waitForFunction(()=>App.P.tracks[App.P.sel.t].clips[App.P.sel.p].length===1);
      assert.deepEqual((await notes()).map(n=>[n.n,n.s]),[[39,10]]);
      await control("undo").tap();assert.deepEqual(await notes(),[]);await cdp.detach();
    }
    await control("arm").click();
    await page.waitForFunction(()=>{const c=App.Seq.now(App.P.sel.t);return c && c.step>=1 && c.step<4;});
    const from=await center(pad(0)),to=await center(note(2,7));
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    try{
      const running=await notes();assert.equal(running.length,1,"armed pads record on press");
      await page.mouse.move(to.x,to.y,{steps:4});assert.equal(await ghost.count(),0);
    }finally{await page.mouse.up();}
    await control("play").click();
    const recorded=await notes();assert.equal(recorded.length,1);assert.equal(recorded[0].n,36);assert.notEqual(recorded[0].s,14);
    assert.deepEqual(errors,[]);
    console.log("Picture score · drag a sound across rows, occupied beat, single Undo, cancelled drag, live pad recording"+(browser.browserType().name()==="chromium"?", native touch drag":""));
  }finally{await context.close();}
};
