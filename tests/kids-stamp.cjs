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
      assert.equal(await ghost.locator("svg").evaluate(el=>el.outerHTML),await pad(row).locator(".kv-row-picture svg").evaluate(el=>el.outerHTML));
      if(finish)await finish();
    }finally{await page.mouse.up();}
    await ghost.waitFor({state:"detached"});
    assert.equal(await root.locator(".kv-stamp-target").count(),0);
  }
  try{
    const url=new URL(reference.url());url.search="?kids";await page.goto(url.href);
    await pad(0).waitFor();await page.waitForFunction(()=>App.Kids.active);
    const suggestion=root.locator(".kv-suggested-beat");
    assert.equal(await suggestion.count(),0);
    await root.getByRole("button",{name:"Vybrat sadu: Zvířata"}).tap();
    assert.equal(await root.locator(".kv-board-name").innerText(),"Zvířata");
    assert.deepEqual(await root.locator(".kv-pad-name").allTextContents(),["Pes","Kočka","Pták","Žába","Sova","Cvrček"]);
    assert.deepEqual(await root.locator(".kv-beats i").allTextContents(),["1","2","3","4","5","6","7","8"]);
    await root.getByRole("button",{name:"Vybrat sadu: Farma"}).tap();
    assert.equal(await pad(1).getAttribute("aria-label"),"Přehrát zvuk: Prase");
    assert.equal(await pad(1).locator(".kv-pad-name").innerText(),"Prase");
    await pad(2).tap();assert.deepEqual(await notes(),[],"a tap auditions without writing a beat");
    const cue=await suggestion.evaluate(b=>({
      row:b.dataset.row,col:b.dataset.col,pressed:b.getAttribute("aria-pressed"),
      picture:b.querySelector(".kv-note-image svg").outerHTML,edge:getComputedStyle(b.querySelector(".kv-socket")).borderTopStyle
    }));
    assert.deepEqual(cue,{row:"2",col:"0",pressed:"false",picture:await pad(2).locator(".kv-row-picture svg").evaluate(s=>s.outerHTML),edge:"dashed"});
    await control("pattern").nth(1).tap();assert.equal(await suggestion.count(),0);
    await control("pattern").first().tap();await pad(0).tap();
    await control("play").tap();assert.equal(await suggestion.count(),0);await control("play").tap();
    await drag(1,3,6);
    const stamped=await notes();
    assert.deepEqual(stamped.map(n=>[n.n,n.s]),[[37,12]],"drop a pig on beat 7, even across another row");
    await pad(2).tap();assert.equal(await suggestion.count(),0,"occupied scores only show the child's own notes");
    await drag(1,3,6);assert.deepEqual(await notes(),stamped,"occupied notes keep their duration and expression");
    await control("undo").click();assert.deepEqual(await notes(),[],"one completed stamp makes one undo step");
    assert.equal(await control("undo").isDisabled(),true);
    await drag(2,1,1,async()=>{const out=await center(control("shelf"));await page.mouse.move(out.x,out.y);});
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
    await drag(5,2,6,async()=>{
      await page.evaluate(()=>App.Kids.dispatch("track",8));
      await ghost.waitFor({state:"detached"});
    });
    assert.deepEqual(await notes(),[],"changing families on the same strip cancels the old stamp");
    await root.getByRole("button",{name:"Vybrat sadu: Farma"}).tap();
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
    // A second tap on the same picture takes it out without sounding it again.
    await page.evaluate(()=>{const original=App.KidsMusic.audition;window.testStampAuditions=0;
      App.KidsMusic.audition=(...args)=>{window.testStampAuditions++;return original(...args);};
    });
    await note(1,2).tap();assert.equal(await note(1,2).getAttribute("aria-label"),"Prase, políčko 3, odebrat");
    await note(1,2).tap();assert.equal(await note(1,2).getAttribute("aria-label"),"Prase, políčko 3, přidat");
    assert.deepEqual(await notes(),[]);assert.equal(await page.evaluate(()=>window.testStampAuditions),1);
    await note(1,2).click({button:"right"});assert.deepEqual(await notes(),[],"a secondary click never adds a note");
    await note(1,2).click({modifiers:["Control"]});assert.deepEqual(await notes(),[],"Control-click never adds a note either");
    await note(1,2).tap();const keep=await notes();
    await note(1,2).click({button:"right"});assert.deepEqual(await notes(),[]);
    await control("undo").tap();assert.deepEqual(await notes(),keep,"one Undo restores the exact removed note");
    const start=await center(note(1,2)),home=await center(pad(1));
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(home.x,home.y,{steps:5});
    await root.locator(".kv-stamp-ghost.kv-pull-out").waitFor();await page.mouse.up();
    assert.deepEqual(await notes(),[],"return a placed note to its sound pad");
    await control("rhythmTools").click();await control("arm").click();
    await page.waitForFunction(()=>{const c=App.Seq.now(App.P.sel.t);return c && c.step>=1 && c.step<4;});
    const from=await center(pad(0)),to=await center(note(2,7));
    await page.mouse.move(from.x,from.y);await page.mouse.down();
    try{
      const running=await notes();assert.equal(running.length,1,"armed pads record on press");
      await page.mouse.move(to.x,to.y,{steps:4});assert.equal(await ghost.count(),0);
    }finally{await page.mouse.up();}
    await control("play").click();
    const recorded=await notes();assert.equal(recorded.length,1);assert.equal(recorded[0].n,36);assert.notEqual(recorded[0].s,14);
    await songDrags(page,root,control,center);
    assert.deepEqual(errors,[]);
    console.log("Picture score · sound stamps, cancellation and live pads; song inserts, reordering on the strip, a tap that selects a place's piece, right-click and pull-out removals, one Undo and all 32 pieces in six sizes"+(browser.browserType().name()==="chromium"?", native touch and pen drags":""));
  }finally{await context.close();}
};

async function songDrags(page,root,key,center){
  const chain=()=>page.evaluate(()=>App.P.chain.slice()),icon=i=>key("pattern").nth(i);
  const mini=root.locator(".kv-chain-print i"),sheet=root.locator(".kv-sheet-arrange:not([hidden])");
  const setChain=value=>page.evaluate(c=>App.Kids.dispatch("chain",c),value);
  const ghost=root.locator(".kv-piece-ghost");
  async function pickup(source){
    const p=await center(source);await page.mouse.move(p.x,p.y);await page.mouse.down();
    await page.mouse.move(p.x+12,p.y,{steps:2});await ghost.waitFor();
  }
  async function over(el,side=.5){
    const box=await el.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width*side,box.y+box.height/2,{steps:5});
  }
  async function place(source,to,side=.5){
    await pickup(source);await over(to,side);await page.mouse.up();
    await ghost.waitFor({state:"detached"});
  }
  await setChain([0]);await icon(1).tap();assert.deepEqual(await chain(),[0],"a tap still selects the pattern");
  assert.ok((await mini.first().boundingBox()).width>=38,"large artwork in a short chain");
  const plus=key("appendSlot");assert.ok(await plus.isVisible());
  await place(icon(2),key("arrange"),.9);assert.deepEqual(await chain(),[0,2]);
  assert.equal(await icon(1).getAttribute("aria-pressed"),"true","dragging a different piece leaves the edited pattern selected");
  assert.equal(await sheet.count(),0,"the chain stays on the score after a drop");
  await key("undo").click();assert.deepEqual(await chain(),[0],"one drop has one undo");
  await place(icon(2),plus);assert.deepEqual(await chain(),[0,2],"the inline addition slot accepts the held piece");
  await key("undo").click();
  await place(icon(3),mini.first(),.2);assert.deepEqual(await chain(),[3,0],"drop at a visible boundary");
  await pickup(icon(2));await over(key("arrange"),.9);await page.keyboard.press("Escape");await page.mouse.up();
  assert.deepEqual(await chain(),[3,0]);assert.equal(await icon(1).getAttribute("aria-pressed"),"true");
  await place(icon(2),key("shelf"));assert.deepEqual(await chain(),[3,0],"invalid drop never opens the sheet or changes the chain");
  await place(mini.first(),mini.last(),.8);
  assert.deepEqual(await chain(),[0,3]);assert.equal(await sheet.count(),0,"reorder the main strip without opening the editor");
  await key("undo").click();assert.deepEqual(await chain(),[3,0],"the main strip move has a single undo");
  await place(mini.first(),key("arrange"),.9);assert.deepEqual(await chain(),[0,3],"empty strip tail moves to the end");
  await key("undo").click();assert.deepEqual(await chain(),[3,0]);
  await mini.first().click({button:"right"});assert.deepEqual(await chain(),[0]);assert.equal(await sheet.count(),0);
  await key("undo").click();assert.deepEqual(await chain(),[3,0]);
  await mini.first().click({modifiers:["Control"]});assert.deepEqual(await chain(),[0],"Control-click also removes the occurrence once");
  await key("undo").click();assert.deepEqual(await chain(),[3,0]);
  const boardCell=root.locator('.kv-cell[data-row="2"][data-col="3"]');
  await pickup(mini.first());await over(boardCell);
  await root.locator(".kv-piece-ghost.kv-pull-out").waitFor();assert.deepEqual(await chain(),[3,0],"the minus badge previews removal");
  await page.keyboard.press("Escape");await page.mouse.up();assert.deepEqual(await chain(),[3,0]);
  await pickup(mini.first());await page.mouse.move(-2,-2);await page.mouse.up();
  assert.deepEqual(await chain(),[3,0],"releasing outside the application cancels the drop");
  await place(mini.first(),key("shelf"));assert.deepEqual(await chain(),[3,0],"another command is not a deletion target");
  await place(mini.first(),boardCell);assert.deepEqual(await chain(),[0]);assert.equal(await sheet.count(),0);
  await key("undo").click();assert.deepEqual(await chain(),[3,0],"pulling out one occurrence makes one undo checkpoint");
  // There is no separate editor: a tap on a place in the song brings that piece onto the board.
  await mini.first().tap();assert.equal(await icon(3).getAttribute("aria-pressed"),"true","a tap on a place in the song selects its piece");
  assert.equal(await sheet.count(),0);assert.deepEqual(await chain(),[3,0]);
  await place(icon(1),mini.nth(1),.2);assert.deepEqual(await chain(),[3,1,0],"place a new piece at the marked edge of the strip");
  await place(mini.first(),mini.last(),.8);assert.deepEqual(await chain(),[1,0,3],"reorder on the strip");
  await key("undo").click();await key("undo").click();assert.deepEqual(await chain(),[3,0]);
  await setChain([0,1,2,3,0,1,2,3,1,2]);await place(mini.first(),mini.last(),.8);
  assert.deepEqual(await chain(),[1,2,3,0,1,2,3,1,2,0],"a long song is all on the strip: carry one piece to its end");
  await key("undo").click();assert.deepEqual(await chain(),[0,1,2,3,0,1,2,3,1,2],"one move, one undo");
  const full=Array.from({length:32},(_,i)=>i%4);
  await setChain(full);await place(icon(1),key("arrange"),.9);
  assert.deepEqual(await chain(),full,"full chain preserves all 32 slots");
  assert.equal(await plus.isVisible(),false);
  const first=await mini.nth(16).boundingBox(),second=await mini.nth(17).boundingBox();
  await pickup(mini.first());await page.mouse.move((first.x+first.width+second.x)/2,first.y+first.height/2,{steps:5});
  await page.mouse.up();await ghost.waitFor({state:"detached"});
  const reordered=full.slice();reordered.splice(16,0,reordered.shift());
  assert.deepEqual(await chain(),reordered,"in the second row the gap picks the nearest boundary even when all 32 slots are used");
  assert.equal(await sheet.count(),0);await key("undo").click();assert.deepEqual(await chain(),full);
  for(const [width,height] of [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]]){
    await page.setViewportSize({width,height});
    const clipped=await key("arrange").evaluate(el=>{
      const bounds=el.getBoundingClientRect();
      return el.scrollHeight>el.clientHeight+1 || el.scrollWidth>el.clientWidth+1 ||
        Array.from(el.querySelectorAll(".kv-chain-print i")).some(tile=>{
          const r=tile.getBoundingClientRect();
          return r.width<20 || r.left<bounds.left || r.right>bounds.right || r.top<bounds.top || r.bottom>bounds.bottom;
        });
    });
    assert.equal(clipped,false,"all 32 pieces fit at "+width+"×"+height);
  }
  await page.setViewportSize({width:1100,height:620});
  await setChain([1,1,2]);await mini.nth(1).click({button:"right"});assert.deepEqual(await chain(),[1,2],"only the picked occurrence is removed");
  await setChain([1]);await page.evaluate(()=>App.Kids.dispatch("song",true));await key("play").tap();
  const sourceNotes=()=>page.evaluate(()=>App.P.tracks.map(t=>t.clips));
  const beforeLast=await sourceNotes();await mini.first().click({button:"right"});
  assert.deepEqual(await chain(),[]);assert.deepEqual(await sourceNotes(),beforeLast);
  assert.equal(await page.evaluate(()=>!!App.P.song || App.Seq.playing),false,"removing the last playing slot leaves an empty song and stops it");
  await key("song").tap();assert.equal(await key("songAll").isDisabled(),true);await key("song").tap();
  await page.evaluate(()=>App.Kids.dispatch("song",true));assert.deepEqual(await chain(),[],"choosing a playback mode cannot silently reinsert the last deleted piece");
  await key("undo").click();assert.deepEqual(await chain(),[1]);assert.ok(await page.evaluate(()=>App.P.song));
  if(page.context().browser().browserType().name()==="chromium"){
    await setChain([0,1]);const cdp=await page.context().newCDPSession(page);
    const touch=(type,point)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:point?[{...point,id:1,radiusX:4,radiusY:4}]:[]});
    try{
      await touch("touchStart",await center(icon(3)));await touch("touchMove",await center(key("arrange")));await ghost.waitFor();await touch("touchCancel");
      assert.deepEqual(await chain(),[0,1]);
      await touch("touchStart",await center(icon(3)));await touch("touchMove",await center(key("arrange")));await ghost.waitFor();await touch("touchEnd");
      assert.deepEqual(await chain(),[0,1,3]);
      await touch("touchStart",await center(mini.last()));await touch("touchMove",await center(boardCell));
      await root.locator(".kv-piece-ghost.kv-pull-out").waitFor();await touch("touchCancel");assert.deepEqual(await chain(),[0,1,3]);
      await touch("touchStart",await center(mini.last()));await touch("touchMove",await center(boardCell));await ghost.waitFor();await touch("touchEnd");
      assert.deepEqual(await chain(),[0,1]);await key("undo").tap();assert.deepEqual(await chain(),[0,1,3]);
      const firstMini=await mini.first().boundingBox();
      await touch("touchStart",await center(mini.last()));
      await touch("touchMove",{x:firstMini.x+firstMini.width*.2,y:firstMini.y+firstMini.height/2});await ghost.waitFor();await touch("touchEnd");
      assert.deepEqual(await chain(),[3,0,1],"a touch moves an existing main-strip picture");
      assert.equal(await sheet.count(),0);await key("undo").tap();assert.deepEqual(await chain(),[0,1,3]);
      const from=await center(icon(2)),to=await center(key("arrange"));
      await cdp.send("Input.dispatchMouseEvent",{type:"mousePressed",...from,button:"left",buttons:1,clickCount:1,pointerType:"pen"});
      await cdp.send("Input.dispatchMouseEvent",{type:"mouseMoved",...to,button:"left",buttons:1,pointerType:"pen"});
      await ghost.waitFor();
      await cdp.send("Input.dispatchMouseEvent",{type:"mouseReleased",...to,button:"left",buttons:0,clickCount:1,pointerType:"pen"});
      assert.deepEqual(await chain(),[0,1,3,2],"a pen drag appends one piece");
    }finally{await cdp.detach();}
  }
}
