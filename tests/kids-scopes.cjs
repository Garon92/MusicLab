/* The sound up close. A tap on the header's screens swaps the notes for eight screens, every one fed by the actual
   output: the keys name the tone that sounds, the rhythm flower grows on the beat that has the kick, the cloud of left
   and right spreads with echo, and who plays lists those with notes and lifts the one that sounds. */
"use strict";
const assert = require("node:assert/strict");
const sizes = [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]];
const names = ["Vlna","Hloubky a výšky","Vodopád","Tóny","Rytmus","Síla zvuku","Vlevo a vpravo","Kdo hraje"];

module.exports = async function kidsScopes(reference) {
  const context = await reference.context().browser().newContext({ viewport: { width: 1100, height: 620 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.setDefaultTimeout(8000);
  const url = new URL(reference.url()); url.search = "?kids";
  const key = (k, attrs = "") => page.locator('#kids-root [data-k="' + k + '"]' + attrs).filter({ visible: true });
  const cell = (row, col) => key("note", '[data-row="' + row + '"][data-col="' + col + '"]');
  const read = (kind, field) => page.locator('#kids-root canvas[data-kid-screen="' + kind + '"]').evaluate((c, f) => c.dataset[f], field);
  const voices = () => page.locator(".kv-band-voice").evaluateAll(v => v.map(x => x.dataset.part));
  async function play(on) { await key("play").click(); await page.waitForFunction(on => App.Seq.playing === on, on); }
  async function layout(label) {
    const issues = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const errors = [], root = document.getElementById("kids-root"), view = root.querySelector(".kv-scopes");
      for (const el of [document.documentElement, document.body, root, root.querySelector(".kids-surface"), view])
        if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) errors.push((el.id || el.className || el.nodeName) + " overflows");
      const frame = view.getBoundingClientRect();
      for (const figure of view.querySelectorAll(".kv-scope")) {
        const glass = figure.querySelector(".kv-glass").getBoundingClientRect(), name = figure.querySelector("figcaption");
        if (glass.width < 120 || glass.height < 80) errors.push(name.textContent + " glass " + glass.width.toFixed(0) + "×" + glass.height.toFixed(0));
        if (glass.right > frame.right + .5 || name.getBoundingClientRect().bottom > frame.bottom + .5) errors.push(name.textContent + " leaves the frame");
        if (name.scrollWidth > name.clientWidth + 1) errors.push(name.textContent + " is cut");
      }
      for (const el of root.querySelectorAll("button,summary")) {
        if (el.closest("[hidden],[inert]") || !el.getClientRects().length || el.closest("details:not([open])") && !el.closest("summary")) continue;
        const r = el.getBoundingClientRect(), id = el.getAttribute("aria-label") || el.dataset.k;
        if (r.width < 63.95 || r.height < 63.95) errors.push(id + " measures " + r.width.toFixed(1) + "×" + r.height.toFixed(1));
        if (r.x < -.5 || r.y < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) errors.push(id + " outside viewport");
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!el.disabled && (!hit || !el.contains(hit))) errors.push(id + " is covered at the centre");
      }
      return errors;
    });
    assert.deepEqual(issues, [], label + " " + page.viewportSize().width + "×" + page.viewportSize().height + " " + issues.join(", "));
  }
  try {
    await page.goto(url.href);
    await page.waitForFunction(() => App.Kids.active && document.querySelector("#kids-root .kv-cell"));
    await page.mouse.click(5, 5);
    // One kick on the first beat.
    await key("track", '[data-index="0"]').click(); await cell(3, 0).click();
    await key("scopes").click();
    assert.equal(await key("scopes").getAttribute("aria-pressed"), "true", "the header's screens stay pressed while open");
    assert.equal(await key("stage").textContent(), "Noty", "the footer leads back to the notes");
    assert.deepEqual(await page.locator(".kv-scope figcaption").allTextContents(), names);
    assert.equal(await page.locator(".kv-cell").first().isVisible(), false, "the screens take the place of the notes");
    assert.ok(await key("rhythmTools").count() === 0 && await key("eraser").count() === 0, "tools that write notes rest while the screens are open");
    assert.deepEqual(await voices(), ["0"], "who plays: the drums, the only ones with notes");
    await play(true);
    await page.waitForFunction(() => {
      const c = [...document.querySelectorAll(".kv-scopes canvas")];
      return c.length === 7 && c.every(x => +x.dataset.level > .002) && +document.querySelector('[data-kid-screen="waterfall"]').dataset.heat > .3;
    }, null, { timeout: 5000 });
    // The flower: two passes of the piece, and only the first beat has a petal.
    await page.waitForFunction(() => { const b = document.querySelector('[data-kid-screen="rhythm"]').dataset.beats.split(",").map(Number); return b[0] > .5 && b.slice(1).every(v => v < .2); }, null, { timeout: 9000 });
    await page.waitForFunction(() => +document.querySelector('.kv-band-voice[data-part="0"]').style.getPropertyValue("--level") > .05, null, { timeout: 4000 });
    assert.ok(+await read("stereo", "width") < .02, "a dry kick sounds in the middle");
    // With echo the sound spreads to both sides.
    await page.evaluate(() => { App.P.fx.mixDelay = .6; App.P.fx.mixReverb = .6; App.E.syncFx(); });
    await page.waitForFunction(() => +document.querySelector('[data-kid-screen="stereo"]').dataset.width > .05, null, { timeout: 5000 });
    await page.evaluate(() => { App.P.fx.mixDelay = 0; App.P.fx.mixReverb = 0; App.E.syncFx(); });
    for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await layout("Screens up close"); }
    await page.setViewportSize({ width: 1100, height: 620 });
    await play(false);

    // Noty brings the notes back. A melody note on G: the keys read G, and nothing else, while it sounds.
    await key("stage").click();
    assert.equal(await page.locator(".kv-scopes").isHidden(), true);
    assert.equal(await key("scopes").getAttribute("aria-pressed"), "false");
    await cell(3, 0).click();
    await key("track", '[data-index="2"]').click(); await cell(2, 0).click(); await cell(2, 4).click();
    const tone = String(await page.evaluate(() => App.KidsMusic.pitch(2, 2) % 12));
    await key("scopes").click();
    assert.deepEqual(await voices(), ["2"], "who plays follows the notes");
    await play(true);
    const seen = await page.evaluate(async () => {
      const c = document.querySelector('[data-kid-screen="keys"]'), seen = new Set();
      for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 50)); seen.add(c.dataset.tone); }
      return [...seen].filter(Boolean);
    });
    assert.deepEqual(seen, [tone], "the keys name the tone the melody plays");
    await play(false);

    // The header's screens close it again; the band on stage and the screens take turns; Escape goes back to the notes.
    await key("scopes").click();
    assert.equal(await page.locator(".kv-cell").first().isVisible(), true);
    await key("stage").click(); await key("scopes").click();
    assert.equal(await page.locator(".kv-stage").isHidden(), true, "opening the screens leaves the stage");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".kv-scopes").isHidden(), true, "Escape leaves the screens");
    assert.equal(await page.locator(".kv-cell").first().isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("Kids screens up close · eight screens from the output in place of the notes, the keys reading the melody's tone, a petal only on the kicked beat, a dry kick in the middle and echo to the sides, who plays, six viewports");
  } finally { await context.close(); }
};
