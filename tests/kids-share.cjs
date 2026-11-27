/* A song leaves the shelf three ways: a new name, a sound file, and a link that opens it in any other browser. */
"use strict";
const assert = require("node:assert/strict");

module.exports = async function kidsShare(reference) {
  const browser = reference.context().browser();
  const context = await browser.newContext({ viewport: { width: 1100, height: 620 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(9000);
  const url = new URL(reference.url()); url.search = "?kids";
  const key = k => page.locator('#kids-root [data-k="' + k + '"]').filter({ visible: true });
  // What a listener would hear: the notes of every instrument and set, the order, speed, costumes and effects.
  const song = p => p.evaluate(() => JSON.stringify({ chain: App.P.chain, song: App.P.song, bpm: App.P.bpm, costumes: App.KidsMusic.costumes(App.P),
    fx: [App.P.fx.mixDelay, App.P.fx.mixReverb].map(v => +v.toFixed(2)), macros: App.P.rack.strips[0].macros.map(v => +v.toFixed(2)),
    clips: [...new Set(App.KidsMusic.tracks)].filter(t => t !== 6).map(t => App.P.tracks[t].clips.slice(0, 4).map(c => c.map(n => [n.s, n.n, n.l, +n.v.toFixed(2)]))) }));
  try {
    await page.goto(url.href);
    await page.waitForFunction(() => App.Kids.active && document.querySelector("#kids-root .kv-cell"));
    await page.mouse.click(5, 5);
    await page.evaluate(() => {
      const d = App.Kids.dispatch;
      for (const p of [0, 1]) { d("pattern", p); d("track", 0); d("stamp", 3, 0); d("stamp", 1, 2); d("track", 4); d("stamp", 0, 4); d("track", 9); d("stamp", 1, 6); d("expression", 1, 6); d("track", 2); d("stamp", 2, 3); }
      d("chain", [0, 1, 1, 0]); d("song", true); d("tempo", 2); d("costume", 1, 2);
      App.KidsSound.setMode("colour");
      // The link is caught where it is copied, so every engine can be read the same way.
      navigator.clipboard.writeText = async text => { window.copiedLink = text; };
    });
    const pad = await page.locator("#kids-inline-sound .ks-trail").boundingBox();
    await page.mouse.click(pad.x + pad.width * .3, pad.y + pad.height * .4);
    const made = await song(page);
    // A new name, typed in place. Saved songs keep their unsaved edits unsaved.
    await key("shelf").click();await key("save").click();
    await page.evaluate(() => App.Kids.dispatch("tempo", 0));
    await key("rename").click();
    await page.locator(".kv-rename-field").fill("Kravička a prdík");await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => App.P.name), "KRAVIČKA A PRDÍK");
    assert.equal(await page.evaluate(() => [App.KidsStore.read(0).name, App.KidsStore.read(0).bpm, App.P.bpm].join(" ")), "KRAVIČKA A PRDÍK " + JSON.parse(made).bpm + " 76", "the shelf copy takes the name and keeps its own tempo");
    assert.match(await page.locator(".kv-song-card").first().innerText(), /KRAVIČKA A PRDÍK/);
    await key("rename").click();await page.locator(".kv-rename-field").fill("Jiný");await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => App.P.name), "KRAVIČKA A PRDÍK", "Escape keeps the old name");
    assert.equal(await page.locator(".kv-sheet:not([hidden])").count(), 1, "and leaves the shelf open");
    await page.evaluate(() => App.Kids.dispatch("tempo", 2));
    // The sound of the whole song as a file.
    const [file] = await Promise.all([page.waitForEvent("download", { timeout: 40000 }), key("download").click()]); // rendering the whole song takes a while
    assert.equal(file.suggestedFilename().normalize("NFC"), "KRAVIČKA A PRDÍK.wav"); // WebKit spells the accents decomposed, as macOS does
    const bytes = require("fs").readFileSync(await file.path());
    assert.ok(bytes.length > 100000 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE", "a WAV file of " + bytes.length + " bytes");
    // A link, short enough to send, that opens the same song in a browser that never saw it.
    await key("share").click();
    await page.waitForFunction(() => window.copiedLink && /zkopírovaný/.test(document.querySelector(".kv-song-status").textContent));
    const link = await page.evaluate(() => window.copiedLink);
    assert.ok(link.length < 160 && /\/#s[AB][A-Za-z0-9_-]+$/.test(link), "a short link of " + link.length + " characters");
    // A link made before the short form still opens, and so does the shortest: an empty song.
    const legacy = await page.evaluate(async () => {
      const P = App.P, m = App.KidsMusic, strip = P.rack.strips[m.tracks[0]];
      const data = { v: 1, name: P.name, tempo: m.tempoIndex(P), song: P.song ? 1 : 0, chain: P.chain, costumes: m.costumes(P), piece: P.sel.p,
        notes: [...new Set(m.tracks)].map(ti => P.tracks[ti].clips.slice(0, 4).map(c => c.map(n => [n.s, n.n, n.l, n.v, n.p ?? 1, n.r || 1]))),
        fx: [P.fx.mixDelay, P.fx.mixReverb, P.fx.dtime, P.fx.dfb], macros: strip.macros, spin: null };
      const z = new Uint8Array(await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
      let s = ""; for (const b of z) s += String.fromCharCode(b);
      return location.origin + location.pathname + "?kids#song=z" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    });
    const other = await browser.newContext({ viewport: { width: 1100, height: 620 } });
    try {
      const there = await other.newPage();there.on("pageerror", e => errors.push("other: " + e.message));
      await there.goto(link);
      await there.waitForFunction(() => App.Kids?.active && document.querySelector("#kids-root .kv-cell") && App.P.chain.length === 4);
      assert.equal(await song(there), made, "the same song opens from the link");
      assert.equal(await there.evaluate(() => [App.P.name, location.hash].join("|")), "KRAVIČKA A PRDÍK|", "with its name, and the link leaves the address so a reload does not open it again");
      await there.mouse.click(5, 5);await there.locator('#kids-root [data-k="play"]').click();
      await there.waitForFunction(() => App.Seq.playing && Math.max(...App.KidsMusic.levels()) > .001);
      await there.goto(legacy);
      await there.waitForFunction(() => App.Kids?.active && App.P.chain.length === 4 && !location.hash);
      assert.equal(await song(there), made, "a link of the earlier, longer form opens the same song");
      // A broken or foreign link opens nothing and says so: the song already open stays.
      await there.goto(new URL("?kids#song=zAAAA", reference.url()).href);
      await there.waitForFunction(() => App.Kids?.active && document.querySelector("#kids-root .kv-cell"));
      await there.waitForFunction(() => document.querySelector(".kv-flash.bad"));
      assert.equal(await song(there), made, "a broken link leaves the open song as it was");
    } finally { await other.close(); }
    // Work that was never saved goes on the shelf before a link replaces it.
    await page.evaluate(() => { App.Kids.dispatch("new"); App.Kids.dispatch("track", 0); App.Kids.dispatch("stamp", 0, 0); });
    const shelfBefore = await page.evaluate(() => App.KidsStore.slots().filter(Boolean).length);
    await page.goto(link);
    await page.waitForFunction(() => App.Kids.active && App.P.chain.length === 4);
    assert.equal(await page.evaluate(() => App.KidsStore.slots().filter(Boolean).length), shelfBefore + 1, "the unsaved song went on the shelf");
    assert.deepEqual(errors, []);
    console.log("Kids sharing · rename in place on the shelf copy, the song as a WAV, a " + link.length + "-character link that opens the same song elsewhere, the earlier link form, broken links refused, unsaved work kept");
  } finally { await context.close(); }
};
