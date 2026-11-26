/* Defects found by three independent reviews of the console on 2026-11-26 stay fixed. Each block says what used to
   happen. Driven with real keys and clicks where the defect was in a gesture, measured offline where it was in the sound. */
"use strict";
const assert = require("node:assert/strict");

module.exports = async function regressions(page) {
  const state = (fn, arg) => page.evaluate(fn, arg);
  const close = () => state(() => { document.querySelectorAll("dialog[open]").forEach(d => d.close()); App.UI.closeMenu(); App.Workspace.focus(""); });
  await close();
  await page.setViewportSize({ width: 1600, height: 900 });
  await state(() => { App.P.name = "TO RESET"; App.commit(); App.file("new"); });
  await page.locator("dialog[open] .confirm-action").click();
  await page.waitForFunction(() => App.P.name === "UNTITLED" && !document.querySelector("dialog[open]"));
  const cell = (step, row) => state(([s, r]) => App.Ed.cellAt(s, r), [step, row]);
  const hats = () => state(() => App.P.tracks[0].clips[0].filter(n => n.n === 39).map(n => n.s).join(","));

  // Arrow keys erased every same-pitch note a selection passed over, and wrote an undo step per press.
  await state(() => { App.P.tracks[0].clips[0] = Array.from({ length: 8 }, (_, s) => ({ s, n: 39, l: 1, v: 0.8, p: 1 })); App.select(0, 0); App.commit(); App.refresh(); });
  const first = await cell(0, 3);
  await page.mouse.click(first.x, first.y);
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  assert.equal(await hats(), "4,1,2,3,4,5,6,7", "a moving selection leaves the notes it passes alone");
  await page.waitForFunction(() => App.P.tracks[0].clips[0].length === 7);
  assert.equal(await hats(), "1,2,3,4,5,6,7", "where it lands, it replaces what was there");
  await page.keyboard.press("Control+z");
  assert.equal(await hats(), "0,1,2,3,4,5,6,7", "the whole move is one undo step");

  // A value field left without typing rewrote the value (0.8 became 0.7989) as an undo step and dropped redo;
  // after typing a value, SPACE reopened the field instead of starting the transport.
  await state(() => { App.P.tracks[0].mute = 1; App.commit(); App.doUndo(-1); });
  assert.ok(await state(() => App.canRedo()));
  await page.locator("#mx .pm.c").first().click();
  await page.locator("input.ed").waitFor();
  await page.mouse.click(800, 880);
  assert.equal(await state(() => App.P.tracks[0].vol), 0.8, "an untouched value is not rounded to what the field displays");
  assert.ok(await state(() => App.canRedo()), "and looking at it does not cost the redo history");
  await page.locator("#top .pm.in").first().click();
  await page.keyboard.type("100");
  await page.keyboard.press("Enter");
  assert.equal(await state(() => App.P.bpm), 100);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => App.Seq.playing);
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !App.Seq.playing);

  // Undo took the view back with it, and a change of view alone counted as an undo step.
  await state(() => { App.P.fold = 1; App.P.tracks[3].lo = 72; App.commit(); });
  await page.locator("#mx .mx-b.m").nth(4).click();
  await page.getByRole("button", { name: "UNDO", exact: true }).click();
  assert.deepEqual(await state(() => [App.P.tracks[4].mute, App.P.fold, App.P.tracks[3].lo]), [0, 1, 72], "undo reverts the edit and leaves the view");

  // A note played by hand cut notes the sequencer had already scheduled on a mono track or in a choke group.
  await page.mouse.click(5, 5);
  const kept = await state(() => {
    const E = App.audio(), t = E.ctx.currentTime;
    E.play(1, 36, 0.8, t + 0.6, 0.2);   // BASS is mono: scheduled for later
    E.play(0, 39, 0.8, t + 0.6, 0.1);   // closed hat, choke group 1: scheduled for later
    E.play(1, 43, 0.8, 0, 0.1);         // played now on the same mono track
    E.play(0, 40, 0.8, 0, 0.1);         // open hat now, same choke group
    const later = E.voices.filter(v => v.t0 > t + 0.5);
    return { later: later.length, alive: later.filter(v => !v.dead && v.tEnd > v.t0).length };
  });
  assert.deepEqual(kept, { later: 2, alive: 2 }, "scheduled notes survive a note played now");
  await state(() => App.E.panic(true));

  // A modular patch with an audio-rate cable on a resonator's pitch input went to NaN and silenced every track until reload.
  await state(() => { App.select(5, 0); App.InstrumentLab.open("graph", 5); });
  const dialog = page.locator("dialog[open]").last();
  const pick = (name, value) => dialog.getByRole("combobox", { name, exact: true }).selectOption(value);
  const press = name => dialog.getByRole("button", { name, exact: true }).click();
  await pick("Module type", "reson"); await press("Add module");
  await pick("Module type", "osc"); await press("Add module");
  for (const [from, to, port] of [["osc1", "reson1", "audio"], ["osc2", "reson1", "pitch"], ["reson1", "out", "audio"]]) {
    await pick("Cable source", from); await pick("Cable destination", to); await pick("Cable input", port); await press("Connect");
  }
  await press("Select module osc2");
  await pick("wave", "sawtooth");
  await dialog.getByRole("spinbutton", { name: "Pitch ratio", exact: true }).fill("2");
  await page.keyboard.press("Tab");
  await close();
  const patch = await state(async () => {
    const P = App.P;
    P.tracks.forEach(t => (t.clips[0] = []));
    P.tracks[5].clips[0] = [{ s: 0, n: 60, l: 8, v: 0.9, p: 1 }];
    P.song = 0; App.select(5, 0); App.commit(); App.refresh();
    const x = (await App.Seq.bounce()).getChannelData(0);
    let bad = 0, peak = 0;
    for (let i = 0; i < x.length; i++) { if (!Number.isFinite(x[i])) bad++; else if (Math.abs(x[i]) > peak) peak = Math.abs(x[i]); }
    return { bad, peak: +peak.toFixed(3) };
  });
  assert.equal(patch.bad, 0, "the patch renders finite samples");
  assert.ok(patch.peak > 0.01 && patch.peak <= 1, "at a sane level: " + JSON.stringify(patch));

  // The mix arrived later than the stems by the look-ahead of the master's two compressors (12 ms in Chromium and WebKit).
  const edges = await state(async () => {
    const sr = 48000, b = new AudioBuffer({ length: sr, sampleRate: sr, numberOfChannels: 1 }), d = b.getChannelData(0);
    for (let k = 0; k < 8; k++) d[sr / 2 + k] = 0.8 * (1 - k / 8);
    const P = App.P;
    P.tracks.forEach(t => (t.clips[0] = []));
    App.AudioStudio.addRegion(App.addBuffer("CLICK", b), 6, 0);
    P.tracks[6].vol = 1; P.fx.comp = 0; App.commit();
    const top = x => { let at = 0; for (let i = 1; i < x.length; i++) if (Math.abs(x[i]) > Math.abs(x[at])) at = i; return at; };
    const mix = await App.Seq.renderSong(), stem = await App.Seq.renderSong({ stems: [{ type: "track", index: 6, point: "post" }] });
    return { mix: top(mix.full.getChannelData(0).subarray(mix.cut)), stem: top(stem.full.getChannelData(0).subarray(stem.cut)), rate: mix.full.sampleRate };
  });
  assert.ok(Math.abs(edges.mix - edges.stem) <= 2, "mix and stem are aligned: " + JSON.stringify(edges));
  assert.ok(Math.abs(edges.mix - edges.rate / 2) <= 4, "and the click is where it was placed: " + JSON.stringify(edges));

  await state(() => { App.P.name = "TO RESET"; App.commit(); App.file("new"); });
  await page.locator("dialog[open] .confirm-action").click();
  await page.waitForFunction(() => App.P.name === "UNTITLED" && !document.querySelector("dialog[open]"));
  console.log("Regressions · arrow-key moves, untouched values, view outside undo, scheduled notes kept, modular patch finite, mix aligned with stems");
};
