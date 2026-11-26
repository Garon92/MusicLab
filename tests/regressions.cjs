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

  const reset = async () => {
    await state(() => { App.P.name = "TO RESET"; App.commit(); App.file("new"); });
    await page.locator("dialog[open] .confirm-action").click();
    await page.waitForFunction(() => App.P.name === "UNTITLED" && !document.querySelector("dialog[open]"));
  };
  await reset();

  // Removing the last zone left the sampler in zone mode with nothing mapped: silent, with its own sample still loaded.
  await state(() => {
    const b = new AudioBuffer({ length: 4800, sampleRate: 48000 }); b.getChannelData(0).fill(0.2);
    const id = App.addBuffer("TONE", b);
    Object.assign(App.P.tracks[6].smp, { id, mode: 3, zones: [{ sample: id, root: 60, lo: 0, hi: 127, vl: 1, vh: 127 }] });
    App.select(6, 0); App.commit(); App.refresh(); App.SamplerLab.zones(6);
  });
  await page.locator("dialog[open]").getByRole("button", { name: "Remove zone", exact: true }).click();
  assert.deepEqual(await state(() => [App.P.tracks[6].smp.zones.length, App.P.tracks[6].smp.mode]), [0, 0], "with no zone left the sampler plays its own sample");
  assert.match(await page.locator("dialog[open] .ast-status").textContent(), /plays its own sample/);
  await close();

  // A slot of empty bars went into a MIDI file as "Pattern A" and came back as a pattern of its own.
  const rest = await state(async () => {
    const P = App.P;
    P.tracks[0].clips[0] = [{ s: 0, n: 36, l: 1, v: 0.8, p: 1 }];
    P.tracks[0].clips[1] = [{ s: 4, n: 38, l: 1, v: 0.8, p: 1 }];
    P.chain = [0, 0, 1]; P.arrangement.slots = [null, { offset: 0, steps: 32, rest: true }, null]; P.song = 1;
    App.P = App.sanitize(P); App.commit(); App.refresh();
    const bytes = await App.Seq.midi().arrayBuffer();
    const marks = [...new TextDecoder("latin1").decode(bytes).matchAll(/MusicLab (Pattern [A-H]|Rest)/g)].map(m => m[1]);
    const back = App.MidiImport.read(bytes, "rest.mid").project, spans = p => App.Conductor.layout(p, p.chain).map(s => [s.from, s.end, !!s.rest].join());
    return { marks, chain: back.chain, played: App.songPatterns(back), same: spans(back).join(" ") === spans(App.P).join(" "), length: spans(back).pop() };
  });
  assert.deepEqual(rest.marks, ["Pattern A", "Rest", "Pattern B"], "empty bars are named as a rest");
  assert.deepEqual([rest.chain, rest.played, rest.same, rest.length], [[0, 0, 1], [0, 1], true, "48,64,false"], "and come back as empty bars: " + JSON.stringify(rest));
  await reset();

  // A project was saved and opened as one string, which no browser allows past about half a gigabyte. It is written
  // and read in pieces now: the file stays what it was, byte for byte, and the pieced reader returns the same project.
  const big = await state(async () => {
    const sr = 48000, tone = k => {
      const b = new AudioBuffer({ length: sr * 12, sampleRate: sr, numberOfChannels: 2 });
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * (ch ? 0.031 : 0.02) * k) * 1.3; }
      return b;
    };
    const ids = [App.addBuffer("LONG A", tone(1), { floating: true }), App.addBuffer('LONG "B" \\ [x]', tone(1.7), { floating: true })];
    App.P.tracks[6].smp.id = ids[0]; App.P.tracks[7].smp.id = ids[1]; App.P.name = "BIG"; App.commit();
    const { blob, count } = await App.ProjectFiles.blob(App.P), text = await blob.text(), whole = JSON.parse(text);
    App.ProjectFiles.streamFrom = 0;
    const pieced = await App.ProjectFiles.read(new File([blob], "big.musiclab.json"));
    const audio = await Promise.all(pieced.entries.map(async (e, i) => e.id === whole.samples[i].id && e.name === whole.samples[i].name && (await e.base64.text()) === whole.samples[i].data));
    return { ids, count, size: blob.size, asBefore: text === JSON.stringify(await App.ProjectFiles.pack(App.P)),
      project: JSON.stringify({ ...whole, samples: [] }) === JSON.stringify(pieced.raw), audio, text };
  });
  assert.ok(big.size > 12e6 && big.count === 2, "the file spans several pieces: " + big.size);
  assert.deepEqual([big.asBefore, big.project, big.audio], [true, true, [true, true]], "written and read in pieces without a change");
  // Opened through FILE with the samples gone from this browser: the pieced reader has to bring the audio back.
  await reset();
  await state(async (ids) => {
    for (const id of ids) App.samples.delete(id);
    const db = await new Promise((done, fail) => { const r = indexedDB.open("musiclab3"); r.onsuccess = () => done(r.result); r.onerror = () => fail(r.error); });
    await new Promise((done, fail) => { const t = db.transaction("smp", "readwrite"); ids.forEach(id => t.objectStore("smp").delete(id)); t.oncomplete = done; t.onabort = () => fail(t.error); });
    db.close();
  }, big.ids);
  const chooser = page.waitForEvent("filechooser");
  await state(() => { App.file("open"); });
  await (await chooser).setFiles({ name: "big.musiclab.json", mimeType: "application/json", buffer: Buffer.from(big.text) });
  await page.locator("dialog[open] .confirm-action").click();
  await page.waitForFunction(() => App.P.name === "BIG" && !document.querySelector("dialog[open]"));
  const opened = await state(async (ids) => {
    await App.restoreSamples();
    const a = App.samples.get(ids[0]), b = App.samples.get(ids[1]);
    return { names: [a?.name, b?.name], frames: [a?.buffer.length, b?.buffer.length], channels: a?.buffer.numberOfChannels,
      over: +Math.max(...a.buffer.getChannelData(0).subarray(0, 4800)).toFixed(2), value: +b.buffer.getChannelData(1)[1000].toFixed(4), want: +(Math.sin(1000 * 0.031 * 1.7) * 1.3).toFixed(4) };
  }, big.ids);
  assert.deepEqual(opened, { names: ["LONG A", 'LONG "B" \\ [x]'], frames: [576000, 576000], channels: 2, over: 1.3, value: opened.want, want: opened.want }, "the opened project has its audio, unclipped: " + JSON.stringify(opened));
  await state(() => { App.ProjectFiles.streamFrom = 64 << 20; });
  await reset();

  // Recordings no project could reach any more stayed in the browser's store for good. They leave at start-up now,
  // but only when no other tab is open: an undo history elsewhere may still lead back to them.
  const inStore = () => state(() => new Promise((done, fail) => {
    const r = indexedDB.open("musiclab3");
    r.onerror = () => fail(r.error);
    r.onsuccess = () => { const q = r.result.transaction("smp").objectStore("smp").getAllKeys(); q.onsuccess = () => { r.result.close(); done(q.result); }; };
  }));
  // Every open tab holds a shared place; a tab that has just started first asks for the store alone and waits a moment.
  const tabs = async (n) => {
    for (let i = 0; i < 150; i++) {
      const q = await state(async () => { const all = await navigator.locks.query(), mine = l => l.name === "musiclab.tabs"; return [all.held.filter(mine).map(l => l.mode).join(), all.pending.filter(mine).length]; });
      if (q[0] === Array(n).fill("shared").join() && !q[1]) return;
      await page.waitForTimeout(100);
    }
    assert.fail("the tabs did not settle");
  };
  const store = await state(() => {
    const b = new AudioBuffer({ length: 4800, sampleRate: 48000 }); b.getChannelData(0).fill(0.1);
    const used = App.addBuffer("USED", b), loose = App.addBuffer("LOOSE", b);
    App.P.tracks[6].smp.id = used; App.commit(); App.flush();
    return { used, loose };
  });
  await tabs(1);
  for (const id of [store.used, store.loose]) assert.ok((await inStore()).includes(id), "both recordings are stored");
  const [other] = await Promise.all([page.waitForEvent("popup"), state(() => { window.open(location.href); })]); // a second tab on the same storage
  await other.waitForSelector("#ed canvas");
  await tabs(2);
  await page.reload();
  await page.waitForSelector("#ed canvas");
  await tabs(2);
  assert.ok((await inStore()).includes(store.loose), "nothing is cleared while another tab is open");
  await other.close();
  await page.reload();
  await page.waitForSelector("#ed canvas");
  await tabs(1);
  const after = await inStore();
  assert.ok(!after.includes(store.loose), "a recording nothing refers to is cleared at start-up");
  assert.ok(after.includes(store.used), "one the project uses is kept");
  assert.ok(big.ids.every(id => after.includes(id)), "and so is the audio FILE › RESTORE LAST RESET would bring back");
  await page.waitForFunction((id) => App.samples.has(id), store.used);

  await reset();

  // A take from the microphone landed late by the way out and the way in, and nothing moved it back. A stand-in
  // microphone on the engine's own clock clicks every 250 ms: with 100 ms of input delay set, the clicks of a pass
  // have to sit 100 ms earlier in the layer than they do with none. (The real figure needs real devices.)
  await page.mouse.click(5, 5);
  await state(() => {
    const E = App.audio(), ctx = E.ctx, sr = ctx.sampleRate;
    const b = new AudioBuffer({ length: Math.round(sr / 4), sampleRate: sr }); b.getChannelData(0).fill(0.9, 0, 24);
    const clicks = new AudioBufferSourceNode(ctx, { buffer: b, loop: true }), line = ctx.createMediaStreamDestination();
    clicks.connect(line); clicks.start(Math.ceil(ctx.currentTime * 4 + 1) / 4);
    // WebKit drops a device object nothing refers to, and a stand-in defined on it goes with it: hold the object.
    window.standIn = { devices: navigator.mediaDevices, clicks, line };
    Object.defineProperty(window.standIn.devices, "getUserMedia", { configurable: true, value: async () => line.stream });
    E.closeInput();
    App.P.bpm = 120; App.commit(); App.refresh(); App.AudioStudio.open();
  });
  const studio = page.locator("dialog[open]").last(), layers = n => page.waitForFunction(count => App.P.audio.regions.filter(r => r.layer).length === count, n, { timeout: 15000 });
  await studio.getByRole("button", { name: "Looper", exact: true }).click();
  await studio.getByRole("combobox", { name: "Record source", exact: true }).selectOption("mic");
  await studio.getByRole("combobox", { name: "Loop bars", exact: true }).selectOption("1");
  const delay = async ms => { const f = studio.getByRole("spinbutton", { name: "Input delay · ms", exact: true }); await f.fill(String(ms)); await f.press("Tab"); };
  await delay(0);
  await studio.getByRole("button", { name: "Play loop", exact: true }).click();
  for (const [count, ms] of [[1, 0], [2, 0], [3, 100]]) { // an input that has just opened is still settling: the first pass does not count
    await delay(ms);
    await studio.getByRole("button", { name: "Overdub layer", exact: true }).click();
    await layers(count);
  }
  const moved = await state(() => {
    const said = document.querySelector("dialog[open] .ast-status").textContent;
    const at = App.P.audio.regions.filter(r => r.layer).slice(1).map(r => {
      const buf = App.samples.get(r.takes[r.take].sample).buffer, x = buf.getChannelData(0), sr = buf.sampleRate;
      let first = -1;
      for (let i = sr / 10; i < x.length && first < 0; i++) if (Math.abs(x[i]) > 0.2 && Math.abs(x[i - 200]) < 0.02) first = i;
      return { at: (first / sr) % 0.25, seconds: +buf.duration.toFixed(3), tail: Math.max(...x.subarray(x.length - sr / 2).map(Math.abs)) > 0.2 };
    });
    const shift = ((at[0].at - at[1].at) % 0.25 + 0.25) % 0.25;
    return { said, shift: +(shift * 1000).toFixed(1), seconds: at.map(a => a.seconds), tails: at.map(a => a.tail) };
  });
  assert.ok(Math.abs(moved.shift - 100) < 4, "the layer moved earlier by the input delay: " + JSON.stringify(moved));
  assert.deepEqual([moved.seconds, moved.tails], [[2, 2], [true, true]], "and still holds its whole pass, to the end: " + JSON.stringify(moved));
  assert.match(moved.said, /MOVED 100 MS EARLIER/);
  await state(() => { delete window.standIn.devices.getUserMedia; window.standIn.clicks.stop(); localStorage.removeItem("musiclab.input-delay"); });
  await close();
  await state(() => App.E.closeInput());

  // A note's velocity, probability and repeats could not be read as numbers, typed or reset. The readout over the lane
  // showed where the pointer was, not what the note had, and stood still during a drag; a right-click did nothing.
  // They are console values now, next to the selection, and the lane answers the same gestures.
  await state(() => { App.P.tracks[0].clips[0] = [0, 4, 8, 12].map((s, i) => ({ s, n: 36 + (i % 2), l: 1, v: 0.8, p: 1, r: 1 })); App.select(0, 0); App.commit(); App.refresh(); });
  const noteValues = () => state(() => [document.querySelector("#ed .ed-note .tg").textContent, ...[...document.querySelectorAll("#ed .ed-note .pm .v")].map(v => v.textContent)].join(" "));
  const second = () => state(() => { const n = App.P.tracks[0].clips[0][1]; return [Math.round(n.v * 100), Math.round(n.p * 100), n.r || 1, n.l].join("/"); });
  const value = name => page.locator("#ed .ed-note .pm", { hasText: name });
  assert.equal(await noteValues(), "NEXT NOTE 80% 100% 1 1", "with nothing selected the values are those of the next note drawn");
  const snare = await cell(4, 1);
  await page.mouse.click(snare.x, snare.y);
  assert.equal(await noteValues(), "SELECTED 80% 100% 1 1");
  const prob = await value("PROB").boundingBox();
  await page.mouse.move(prob.x + prob.width / 2, prob.y + prob.height / 2); await page.mouse.down();
  await page.mouse.move(prob.x + prob.width / 2 - 60, prob.y + prob.height / 2, { steps: 5 }); await page.mouse.up();
  assert.equal(await second(), "80/65/1/1", "a drag on the value sets the note");
  await value("VEL").click(); await page.keyboard.type("45"); await page.keyboard.press("Enter");
  assert.equal(await second(), "45/65/1/1", "a typed value sets the note");
  await value("PROB").click({ button: "right" });
  assert.equal(await second(), "45/100/1/1", "a right-click puts it back to its default");
  assert.deepEqual(await state(() => [...document.querySelectorAll("#ed .ed-note .pm")].map(p => p.classList.contains("df"))), [false, true, true, true], "and only what differs from its default is bright");
  await state(() => [...document.querySelectorAll("#ed .ed-tools .bt")].find(b => b.textContent === "PROB").click());
  const laneY = await state(() => document.querySelector("#ed canvas").getBoundingClientRect().bottom - 14);
  await page.mouse.move(snare.x, laneY); await page.mouse.down(); await page.mouse.move(snare.x, laneY - 18, { steps: 3 });
  assert.match(await state(() => document.querySelector("#ed .rd").textContent), /PROBABILITY 6\d%$/, "the readout follows a drag in the lane and shows the note's value");
  await page.mouse.up();
  assert.match(await second(), /^45\/6\d\/1\/1$/);
  await page.mouse.click(snare.x, laneY, { button: "right" });
  assert.equal(await second(), "45/100/1/1", "a right-click in the lane resets the note under it");
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => App.P.tracks[0].clips[0][1].p === 0.95, null, { timeout: 4000 });
  // The pattern's length is set where the editor shows it, and what only a pitched track has is not shown on pads.
  assert.deepEqual(await state(() => [...document.querySelectorAll("#ed .ed-tools .grp")].filter(g => g.hidden).length), 2, "chords, octaves and the scale fold are absent on a drum track");
  const len = page.locator("#ed .ed-tools .pm", { hasText: "LENGTH" });
  await len.click(); await page.keyboard.type("2"); await page.keyboard.press("Enter");
  assert.deepEqual(await state(() => [App.P.pats[0].bars, document.querySelector("#mx .mx-p .pm .v").textContent]), [2, "2 BAR"], "the length typed in the editor is the pattern's, as on its letter");
  await state(() => App.select(2, 0));
  assert.equal(await state(() => [...document.querySelectorAll("#ed .ed-tools .grp")].filter(g => g.hidden).length), 0);
  await reset();

  // Clips launched in LIVE… kept the transport for good. PLAY went on playing them, or silence once they were stopped,
  // whatever pattern was selected; with an empty song the SONG button could not hand the transport back; and nothing
  // on the console said who had it. A session ends with the player's stop now, and the console names it while it runs.
  const who = () => state(() => [App.P.performance.source, document.querySelector(".sgb").textContent, document.querySelector("#top .pos").textContent.split(" ")[0], App.Seq.playing]);
  await state(() => { App.P.tracks[0].clips[1] = [{ s: 0, n: 38, l: 1, v: 0.8, p: 1 }]; App.select(0, 1); App.commit(); App.refresh(); App.Live.launch([0], 0); });
  await page.waitForFunction(() => App.Seq.frame()?.lanes?.[0]?.p === 0);
  assert.deepEqual(await who(), ["live", "LIVE", "LIVE", true], "the console says launched clips are playing");
  await page.keyboard.press("Space");
  assert.deepEqual(await who(), ["arrangement", "SONG", "B", false], "the player's stop ends the session");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => App.Seq.frame()?.lanes?.[0]?.p === 1);
  await state(() => App.Live.launch([0], 0));
  await page.waitForFunction(() => App.Seq.frame()?.lanes?.[0]?.p === 0);
  await page.locator("#mx .sgb").click();
  await page.waitForFunction(() => App.Seq.frame()?.lanes?.[0]?.p === 1);
  assert.deepEqual(await who(), ["arrangement", "SONG", "B", true], "and the song row hands the transport back at once, with no song to return to");
  await page.keyboard.press("Space");
  await state(() => { App.P.performance.source = "live"; App.commit(); App.flush(); });
  await page.reload();
  await page.waitForSelector("#ed canvas");
  assert.equal(await state(() => App.P.performance.source), "arrangement", "a project never opens with the launcher holding the transport");

  // The first recording on a page was cut in the wrong place: the recorder's first block read frame 0 in WebKit
  // whatever the time was (a take came back half silent or "too short") and one block early in Chromium. A click
  // put on an exact frame of a context that has been running for a while has to be found on that frame.
  const fresh = await page.context().browser().newPage({ viewport: { width: 1100, height: 620 } });
  await fresh.goto(page.url());
  await fresh.waitForSelector("#ed canvas");
  await fresh.mouse.click(5, 5);
  await fresh.waitForFunction(() => App.E && App.E.ctx.currentTime > 1);
  const placed = await fresh.evaluate(async () => {
    const E = App.E, ctx = E.ctx, sr = ctx.sampleRate, out = ctx.createGain();
    const b = new AudioBuffer({ length: 64, sampleRate: sr }); b.getChannelData(0).fill(0.9, 0, 8);
    const rec = await E.record(out), at = Math.ceil((ctx.currentTime + 0.1) * sr) / sr;
    const click = new AudioBufferSourceNode(ctx, { buffer: b }); click.connect(out); click.start(at);
    await new Promise(r => setTimeout(r, 400));
    const x = (await rec.stop()).getChannelData(0);
    let i = 0; while (i < x.length && Math.abs(x[i]) < 0.5) i++;
    return { found: i < x.length, framesOff: Math.round((rec.firstTime() + i / sr - at) * sr), contextSeconds: +at.toFixed(2) };
  });
  await fresh.close();
  assert.ok(placed.found && Math.abs(placed.framesOff) <= 1, "the first recording on a page knows which frame it starts on: " + JSON.stringify(placed));

  await reset();
  console.log("Regressions · arrow-key moves, untouched values, view outside undo, scheduled notes kept, modular patch finite, mix aligned with stems, last zone, MIDI rests, pieced project files, sample store cleared, input delay, note values, launcher hands the transport back, first recording on its frame");
};
