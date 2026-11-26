/* The band on stage and the pictures that play their notes. KAPELA shows everyone with notes in what PLAY plays; each
   picture, on the desk and on the stage, hops on the beats where it has a note and on no other. */
"use strict";
const assert = require("node:assert/strict");
const sizes = [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]];

module.exports = async function kidsStage(reference) {
  const context = await reference.context().browser().newContext({ viewport: { width: 1100, height: 620 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.setDefaultTimeout(8000);
  const url = new URL(reference.url()); url.search = "?kids";
  const key = (k, attrs = "") => page.locator('#kids-root [data-k="' + k + '"]' + attrs).filter({ visible: true });
  const cell = (row, col) => key("note", '[data-row="' + row + '"][data-col="' + col + '"]');
  // Every hop is logged with the beat it fell on and what hopped: a source card, a row picture, a note or a member.
  const listen = () => page.evaluate(() => {
    window.hops = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const a = animate.call(this, frames, options), el = this;
      queueMicrotask(() => {
        if (a.id !== "kv-bop" || !App.Seq.playing) return;
        const pos = App.Seq.pos, member = el.closest(".kv-member"), card = el.closest(".kv-musician"), lane = el.closest(".kv-lane");
        const what = member ? "member " + member.dataset.key : card ? "card " + card.dataset.index : el.closest(".kv-row-pad") ? "pad " + [...lane.parentNode.children].indexOf(lane) : "note " + el.closest(".kv-cell")?.dataset.row + "." + el.closest(".kv-cell")?.dataset.col;
        hops.push({ pat: pos?.pat, beat: Math.floor((pos?.step ?? 0) / 2) % 8, what });
      });
      return a;
    };
  });
  // What should hop on each beat, read from the notes themselves.
  const expected = (pattern, view) => page.evaluate(([pattern, view]) => {
    const M = App.KidsMusic, P = App.P, part = M.part(P), beats = Array.from({ length: 8 }, () => new Set());
    M.tracks.forEach((_, source) => M.grid(P, source, pattern).forEach((cols, row) => cols.forEach((v, col) => {
      if (!v) return;
      if (view === "stage") beats[col].add("member " + (source < 4 ? source : source + ":" + row));
      else {
        beats[col].add("card " + source);
        if (source === part && pattern === P.sel.p) { beats[col].add("pad " + row); beats[col].add("note " + row + "." + col); }
      }
    })));
    return beats.map(s => [...s].sort());
  }, [pattern, view]);
  const heard = (pattern) => page.evaluate(pattern => {
    const beats = Array.from({ length: 8 }, () => new Set());
    for (const h of hops) if (h.pat === pattern) beats[h.beat].add(h.what);
    return beats.map(s => [...s].sort());
  }, pattern);
  async function playFor(ms) {
    await key("play").click();
    await page.waitForFunction(() => App.Seq.playing);
    await page.waitForTimeout(ms);
    await key("play").click();
    await page.waitForFunction(() => !App.Seq.playing);
  }
  async function layout(label) {
    const issues = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      const errors = [], root = document.getElementById("kids-root");
      for (const el of [document.documentElement, document.body, root, root.querySelector(".kids-surface"), root.querySelector(".kv-stage")])
        if (el && !el.hidden && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) errors.push((el.id || el.className || el.nodeName) + " overflows");
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
    await page.evaluate(() => App.Kids.dispatch("tempo", 3));
    // Desk: a cow and a pig on the farm, a kick and a snare in the drums.
    await key("track", '[data-index="4"]').click(); await cell(0, 0).click(); await cell(1, 2).click();
    await key("track", '[data-index="0"]').click(); await cell(3, 0).click(); await cell(2, 4).click();
    await listen(); await playFor(1900);
    assert.deepEqual(await heard(0), await expected(0, "desk"), "on the desk, each card, row picture and note hops on its own beats");

    // Stage: the same four, standing together. Tapping one plays it.
    await key("stage").click();
    assert.equal(await key("stage").textContent(), "Noty", "the button says where it leads back to");
    assert.deepEqual(await page.locator(".kv-member").evaluateAll(m => m.map(x => x.dataset.key + " " + x.textContent)), ["0 Bubny", "4:0 Kráva", "4:1 Prase"]);
    assert.equal(await page.locator(".kv-stage-scope").textContent(), "Dílek A");
    assert.ok(await key("rhythmTools").count() === 0 && await key("eraser").count() === 0, "tools that write notes rest while the band plays");
    await page.locator('.kv-member[data-key="4:0"]').click();
    await page.waitForFunction(() => App.KidsMusic.levels()[4] > 0.01, null, { timeout: 3000 });
    await listen(); await playFor(1900);
    assert.deepEqual(await heard(0), await expected(0, "stage"), "on stage, each member hops on its own notes");
    for (const [width, height] of sizes) { await page.setViewportSize({ width, height }); await layout("Stage"); }
    await page.setViewportSize({ width: 1100, height: 620 });
    // They stand as a crowd, not in a grid: the musician on a riser at the back, the farm animals nearer and lower.
    const stand = await page.evaluate(() => ({ riser: !document.querySelector(".kv-stage-riser").hidden, ...Object.fromEntries([...document.querySelectorAll(".kv-member")].map(m => { const r = m.getBoundingClientRect(); return [m.dataset.key, { feet: r.bottom, z: +m.style.zIndex }]; })) }));
    assert.ok(stand["4:0"].feet > stand["0"].feet + 20 && stand["4:0"].z > stand["0"].z && stand.riser, JSON.stringify(stand));
    // When a cow and a rooster play on the same beat, the sun comes up.
    await page.evaluate(() => { App.Kids.dispatch("track", 4); App.Kids.dispatch("stamp", 3, 0); window.scenes = []; const beat = App.KidsStage.beat; App.KidsStage.beat = (...a) => { const r = beat(...a); scenes.push(...r); return r; }; });
    await playFor(600);
    assert.ok(await page.evaluate(() => scenes.includes("sunrise")), "a cow and a rooster on one beat make the sun come up");
    await page.evaluate(() => { App.Kids.dispatch("undo"); });

    // A song: the band is everyone in it; while piece A plays, a frog that only has notes in B sits back.
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".kv-stage").isHidden(), true, "Escape leaves the stage");
    await key("pattern", '[data-index="1"]').click();
    await key("track", '[data-index="5"]').click(); await cell(3, 1).click();
    await page.evaluate(() => { App.Kids.dispatch("chain", [0, 1]); App.Kids.dispatch("song", true); });
    await key("stage").click();
    assert.equal(await page.locator(".kv-stage-scope").textContent(), "Celá písnička");
    assert.deepEqual(await page.locator(".kv-member").evaluateAll(m => m.map(x => x.dataset.key)), ["0", "4:0", "4:1", "5:3"]);
    await key("play").click();
    await page.waitForFunction(() => App.Seq.pos?.pat === 0 && document.querySelector('.kv-member[data-key="5:3"]').classList.contains("resting"));
    assert.equal(await page.locator('.kv-member[data-key="4:0"]').evaluate(m => m.classList.contains("resting")), false);
    await page.waitForFunction(() => App.Seq.pos?.pat === 1 && !document.querySelector('.kv-member[data-key="5:3"]').classList.contains("resting") && document.querySelector('.kv-member[data-key="4:0"]').classList.contains("resting"), null, { timeout: 5000 });
    await key("play").click();
    await page.waitForFunction(() => !document.querySelector(".kv-member.resting"));

    // An empty piece: the stage says the band waits for notes and leads back to them.
    await page.evaluate(() => App.Kids.dispatch("song", false));
    await page.keyboard.press("Escape");
    await key("pattern", '[data-index="2"]').click(); await key("stage").click();
    assert.equal(await page.locator(".kv-stage-empty").isVisible(), true);
    await layout("Empty stage");
    await key("stageBack").click();
    assert.equal(await page.locator(".kv-cell").first().isVisible(), true);
    assert.deepEqual(errors, []);
    console.log("Kids stage · the band of a piece and of a song as a crowd on a riser, members resting outside their piece, hops on each note on the desk and on stage, a scene when two meet, six viewports, empty stage");
  } finally { await context.close(); }
};
