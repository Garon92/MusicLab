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
  await pick("Waveform", "sawtooth");
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

  // Reported from use: a list inside a popup (AUTOMATION › Shape › the shape list) closed its own popup when it opened,
  // lost the field it hangs from and jumped to the corner of the window.
  await state(() => { App.select(0, 0); });
  await page.getByRole("button", { name: "AUTOMATION", exact: true }).click();
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  const shapeList = page.getByRole("combobox", { name: "Curve shape", exact: true }), shapeAt = await shapeList.boundingBox();
  await shapeList.click();
  const hung = await state(() => { const m = document.querySelector(".mn").getBoundingClientRect(); return { popup: !!document.querySelector(".pop"), x: m.left, y: m.top }; });
  assert.ok(hung.popup && Math.abs(hung.x - shapeAt.x) < 3 && hung.y > shapeAt.y && hung.y < shapeAt.y + shapeAt.height + 6, "the list opens under its field and the popup stays: " + JSON.stringify(hung));
  await page.getByRole("menuitem", { name: "Sine", exact: true }).click();
  assert.deepEqual(await state(() => [!!document.querySelector(".pop"), document.querySelector(".pop select").value]), [true, "sine"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "DRAW", exact: true }).click();

  // Reported from use: the wheel could not land on 15% (a notch was 1.2% and the display rounds). A value now sits on
  // the grid its display shows, and a notch moves it by whole units of that grid.
  await state(() => { App.P.fx.dfb = 0.4; App.commit(); App.refresh(); });
  await page.locator('#fx .pm[aria-label="DELAY FEEDBACK"]').hover();
  // The browser delivers wheel events asynchronously. Check each exact value before sending the next notch.
  for (const percent of ["41%", "42%", "43%", "44%", "45%"]) {
    await page.mouse.wheel(0, -120);
    await page.waitForFunction(value => document.querySelector('#fx .pm[aria-label="DELAY FEEDBACK"] .v').textContent === value, percent, {timeout:3000});
  }
  await page.waitForFunction(() => Math.abs(App.P.fx.dfb - 0.45) < 1e-9);

  // A number field in a dialog was the browser's own, which writes 0,5 on a Czech machine beside the console's 0.5.
  // It is the console's field now: a point always, and a typed comma is read as one.
  await state(() => { App.select(1, 0); App.Rack.mixer(1); });
  const ratio = page.locator("dialog[open]").last().getByRole("spinbutton", { name: "Sidechain ratio", exact: true });
  assert.equal(await ratio.evaluate((e) => e.type), "text", "no browser-drawn number field");
  await ratio.fill("2,5"); await ratio.press("Tab");
  assert.deepEqual(await state(() => [App.P.rack.strips[1].ratio, document.querySelector('dialog[open] input[aria-label="Sidechain ratio"]').value]), [2.5, "2.5"]);
  await ratio.focus(); await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => App.P.rack.strips[1].ratio === 2.6, null, { timeout: 4000 });
  await close();
  await reset();

  // Loading files on pads 9–16 used to stop immediately at the old eight-pad limit.
  await state(() => { App.P.tracks[0].kit=App.newKit(16);App.P.sel.pad=14;App.commit();App.refresh(); });
  await page.locator('#dv .pd[data-note="50"]').click({button:"right"});
  const [padFiles]=await Promise.all([page.waitForEvent("filechooser"),page.getByRole("menuitem",{name:"Load audio…"}).click()]);
  await padFiles.setFiles(["cow","pig","sheep"].map(name=>require.resolve("../docs/audio/kids/"+name+".wav")));
  await page.waitForFunction(()=>App.P.tracks[0].kit.pads[15].name==="PIG");
  assert.deepEqual(await state(()=>App.P.tracks[0].kit.pads.filter(p=>p.id).map(p=>p.name)),["COW","PIG"]);
  await page.getByRole("button",{name:"UNDO",exact:true}).click();
  assert.equal(await state(()=>App.P.tracks[0].kit.pads.filter(p=>p.id).length),0);
  await reset();

  // Reported from use: an mp3 dropped into a sampler was treated as a hit. One click on a note played the whole of it,
  // deleting the note or the audio did not stop it, and a loop laid copy over copy. A long recording now plays for
  // as long as its note; a deleted note and removed audio stop sounding.
  await page.mouse.click(5, 5);
  await state(async () => {
    const sr = 22050, b = new AudioBuffer({ length: sr * 12, sampleRate: sr }), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.05) * 0.4;
    App.select(6, 0);
    await App.dropFiles([new File([await App.wav(b).arrayBuffer()], "song.wav", { type: "audio/wav" })], { ti: 6 });
  });
  assert.equal(await state(() => App.P.tracks[6].smp.shot), 0, "a long recording is not a one-shot");
  assert.match(await state(() => document.querySelector(".st-m").textContent), /0:12 OF AUDIO .* AUDIO…/, "and the console says what it is for");
  const sounding = () => state(() => App.E.voices.filter(v => v.ti === 6 && !v.dead).length);
  const spot = await cell(2, 10);
  await page.mouse.click(spot.x, spot.y);
  await page.waitForFunction(() => App.E.voices.filter(v => v.ti === 6).length === 0, null, { timeout: 4000 });
  await state(() => { App.P.tracks[6].smp.shot = 1; App.commit(); App.E.syncTrack(6); }); // chosen by hand: it plays on
  await page.mouse.click(spot.x + 90, spot.y);
  await page.waitForTimeout(500);
  assert.ok(await sounding() > 0, "a one-shot plays on after the click");
  await page.mouse.click(spot.x + 90, spot.y, { button: "right" });
  await page.waitForFunction(() => App.E.voices.filter(v => v.ti === 6).length === 0, null, { timeout: 3000 });
  await page.mouse.click(spot.x + 180, spot.y);
  await page.waitForTimeout(300);
  await page.locator("#dv .wv").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove audio" }).click();
  await page.waitForFunction(() => App.E.voices.filter(v => v.ti === 6).length === 0, null, { timeout: 3000 });
  await reset();

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

  // ── What four walkthroughs of the console as a first-time user found (2026-11-26). ──
  await reset();
  const hintNow = () => state(() => document.querySelector(".st-h").textContent), saidNow = () => state(() => document.querySelector(".st-m").textContent);
  const stripNow = () => state(() => [...document.querySelectorAll("dialog[open]")].pop()?.dataset.st || "");
  const kickSteps = () => state(() => App.P.tracks[0].clips[0].map(n => n.s).join(","));

  // SPACE after closing a dialog opened it again: the button that had opened it kept the focus and took the key.
  await page.getByRole("button", { name: "GROOVE…", exact: true }).click();
  await page.locator("dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => App.Seq.playing);
  assert.equal(await state(() => document.querySelectorAll("dialog[open]").length), 0, "SPACE is the transport, not the last button pressed");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !App.Seq.playing);

  // Delete and Ctrl/Cmd A reached the notes shown as selected only while the focus was inside the editor.
  await state(() => { App.P.tracks[0].clips[0] = [0, 4, 8].map(s => ({ s, n: 36, l: 1, v: 0.8, p: 1 })); App.select(0, 0); App.commit(); App.refresh(); });
  const midKick = await cell(4, 0);
  await page.mouse.click(midKick.x, midKick.y);
  await state(() => document.activeElement.blur());
  await page.keyboard.press("Delete");
  assert.equal(await kickSteps(), "0,8", "Delete takes the selected note wherever the focus is");
  await page.keyboard.press("Control+a");
  assert.equal(await state(() => App.Ed.selected().size), 2, "and so does select all");
  await page.keyboard.press("Escape");

  // A button that could not be used was dead to the pointer and gave no reason.
  const redoB = page.getByRole("button", { name: "REDO", exact: true });
  assert.equal(await redoB.getAttribute("aria-disabled"), "true");
  await redoB.hover();
  assert.match(await hintNow(), /^NOTHING TO REDO/, "a button that cannot be used says why under the pointer");
  const redoAt = await redoB.boundingBox();
  await page.mouse.click(redoAt.x + redoAt.width / 2, redoAt.y + redoAt.height / 2); // the real pointer: a locator waits for it to be enabled
  assert.match(await saidNow(), /NOTHING TO REDO/, "and when it is pressed");

  // A typed time was read as milliseconds while the display showed seconds: 3 typed over 2.20S gave 3 ms.
  await page.locator('#fx .pm[aria-label="REVERB DECAY TIME"]').click();
  await page.locator("input.ed").waitFor();
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  assert.equal(await state(() => App.P.fx.rsize), 3, "a bare number is read in the unit the value is shown in");

  // Controls with no effect in the present state looked live; a dialog that shaped the sound lit nothing.
  await state(() => App.select(1, 0));
  const lfoRateEl = page.locator('#dv .pm[aria-label="LFO RATE"]');
  assert.ok(await lfoRateEl.evaluate(e => e.classList.contains("idle")), "the LFO is dim while it has no destination");
  await lfoRateEl.hover();
  assert.match(await hintNow(), /^NO EFFECT WHILE DEST IS OFF/);
  await state(() => { App.P.tracks[1].syn.ldest = 2; App.P.rack.strips[1].eq.bands[0].db = 4; App.commit(); App.refresh(); });
  assert.ok(!(await lfoRateEl.evaluate(e => e.classList.contains("idle"))), "and live once it has one");
  const eqLampEl = page.locator('[data-has="eq"]');
  assert.ok(await eqLampEl.evaluate(b => b.classList.contains("has") && /EQ OF 02/.test(b.dataset.note)), "TRACK EQ… is lit while the EQ shapes the track, and says so");
  await state(() => { App.P.rack.strips[1].eq.bands[0].db = 0; App.commit(); App.refresh(); });
  assert.ok(!(await eqLampEl.evaluate(b => b.classList.contains("has"))));

  // Undo while playing restarted the loopFile even for a level change.
  await state(() => { App.P.pats[0].bars = 4; App.select(0, 0); App.commit(); App.refresh(); App.P.tracks[0].vol = 0.5; App.commit(); App.refresh(); document.activeElement.blur(); });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => App.Seq.playing && App.Seq.pos && App.Seq.pos.runStep >= 6);
  await page.keyboard.press("Control+z");
  const stillGoing = await state(() => ({ playing: App.Seq.playing, step: App.Seq.now()?.runStep ?? App.Seq.pos?.runStep, vol: App.P.tracks[0].vol }));
  assert.ok(stillGoing.playing && stillGoing.step >= 6 && stillGoing.vol !== 0.5, "a step that leaves the song's shape alone does not interrupt it: " + JSON.stringify(stillGoing));
  assert.match(await saidNow(), /^UNDONE · /, "and undo says what it took back");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => !App.Seq.playing);

  // Esc on CHORDS… or ARRANGE… dropped an unapplied draft without a word.
  await page.getByRole("button", { name: "CHORDS…", exact: true }).click();
  await page.locator("dialog[open]").last().getByRole("combobox", { name: "Harmony for BASS", exact: true }).selectOption("root");
  await page.keyboard.press("Escape");
  assert.match(await stripNow(), /^NOT APPLIED YET/, "the first Esc says what closing would lose");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.equal(await state(() => App.P.harmony.follow[1]), "off");

  // Duplicate put the copy one selection-span later: off the beat for a shortNote note.
  await state(() => { App.P.tracks[0].clips[0] = [{ s: 1, n: 36, l: 1, v: 0.8, p: 1 }]; App.select(0, 0); App.commit(); App.refresh(); });
  const shortNote = await cell(1, 0);
  await page.mouse.click(shortNote.x, shortNote.y);
  await page.keyboard.press("Control+d");
  assert.equal(await kickSteps(), "1,5", "a duplicate lands a whole beat later");

  // With FOLD on, notes outside the scale lost their rows: they could not be selected or deleted.
  await state(() => { const P = App.P, lo = P.tracks[1].lo; P.fold = 1; P.tracks[1].clips[0] = [1, 2, 3].map(k => ({ s: k, n: lo + k, l: 1, v: 0.8, p: 1 })); App.select(1, 0); App.commit(); App.refresh(); });
  await page.keyboard.press("Control+a");
  assert.equal(await state(() => App.Ed.selected().size), 3, "a folded view keeps the rows that hold notes");
  await page.keyboard.press("Delete");
  assert.equal(await state(() => App.P.tracks[1].clips[0].length), 0);
  await state(() => { App.P.fold = 0; App.commit(); App.refresh(); });

  // The slot the song starts from moved when a pattern was inserted before it.
  await state(() => { const P = App.P; P.chain = [0, 1, 2]; P.song = 1; App.commit(); App.refresh(); App.Seq.startAt(2); App.Song.insert(0, 3); });
  assert.deepEqual(await state(() => [App.P.chain.join(""), App.P.chain[App.Seq.start()]]), ["3012", 2], "the start stays on its pattern");
  await state(() => { App.P.chain = []; App.P.song = 0; App.commit(); App.refresh(); App.Seq.startAt(0); });

  // WIRE…: hints repeated the labels, nothing warned when no cable reached OUTPUT, and Ctrl/Cmd Z did nothing inside.
  await state(() => { App.select(1, 0); App.InstrumentLab.open("graph"); });
  const wireDlg = () => page.locator("dialog[open]").last(), cableCount = () => state(() => App.P.tracks[1].syn.graph.cables.length);
  await wireDlg().getByRole("button", { name: "Add module", exact: true }).hover();
  assert.match(await stripNow(), /UNTIL A CABLE JOINS IT/, "a control says what it does, not its own name");
  await wireDlg().locator(".il-cables button").click();
  assert.match(await wireDlg().locator(".il-status").textContent(), /^NOTHING REACHES OUTPUT/);
  assert.match(await page.locator("#dv .inst-overview").textContent(), /^SILENT/, "the console says so too");
  await wireDlg().getByRole("button", { name: "Connect", exact: true }).click();
  assert.deepEqual([await cableCount(), await wireDlg().locator(".il-status").textContent()], [1, ""]);
  await wireDlg().getByRole("button", { name: "Connect", exact: true }).click();
  assert.match(await wireDlg().locator(".il-status").textContent(), /ALREADY THERE/, "a refused cable says why");
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => App.P.tracks[1].syn.graph.cables.length === 0 && document.querySelectorAll("dialog[open]").length === 1);
  assert.match(await stripNow(), /^UNDONE/, "Ctrl/Cmd Z steps back and the editor stays open");
  await wireDlg().locator(".il-board .bt").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Connect to output", exact: true }).click();
  assert.equal(await cableCount(), 1, "a module answers a right-click");
  await close();
  await page.getByRole("button", { name: "GROOVE…", exact: true }).click();
  await page.keyboard.press("Control+z");
  assert.match(await stripNow(), /^UNDO WORKS ON THE CONSOLE/, "a dialog that cannot step back says where undo is");
  // Whether recorded notes snap to the step was set in here and shown nowhere on the console.
  await page.locator("dialog[open]").last().getByRole("combobox", { name: "Live recording timing", exact: true }).selectOption("off");
  await close();
  assert.equal(await page.locator("#top .bt", { hasText: /^REC/ }).first().textContent(), "REC FREE");
  await reset();

  // Audio export always ran on into the tail: there was no file of exactly the loop's length. Export loopFile is that
  // longNote to the frame, with what rings on laid back over the start.
  const loopFile = await state(async () => {
    const P = App.P, T = P.tracks[1]; // the bass patch has nothing random in it, so two renders agree to the sample
    T.clips[0] = [{ s: 0, n: 48, l: 2, v: 0.9, p: 1 }, { s: 12, n: 55, l: 2, v: 0.9, p: 1 }]; T.rev = 0; T.dly = 0.5; App.select(1, 0); App.commit();
    const plain = await App.Seq.bounce(), L = await App.Seq.bounceLoop();
    const file = await new OfflineAudioContext(2, 1, plain.sampleRate).decodeAudioData(await L.blob.arrayBuffer());
    const n = file.length, a = plain.getChannelData(0), b = file.getChannelData(0), k = 10 ** (L.trim / 20);
    let worst = 0, peak = 0, finite = true;
    for (let i = 0; i < n; i++) {
      let want = 0; for (let j = i; j < a.length; j += n) want += a[j];
      worst = Math.max(worst, Math.abs(want * k - b[i])); peak = Math.max(peak, Math.abs(b[i])); finite = finite && Number.isFinite(b[i]);
    }
    return { frames: n, want: Math.round(App.Conductor.time(P, 16) * plain.sampleRate), plain: plain.length, worst, peak, finite };
  });
  assert.ok(loopFile.frames === loopFile.want && loopFile.plain > loopFile.frames && loopFile.finite && loopFile.peak > 0.01 && loopFile.peak <= 1 && loopFile.worst < 1e-3, "a loop file is exactly as long as the loop and holds its own tail: " + JSON.stringify(loopFile));

  // A note could not be stretched past the page in view. Held at the edge, the page turns under it.
  await state(() => { const P = App.P; P.pats[0].bars = 8; P.tracks[1].clips[0] = [{ s: 60, n: P.tracks[1].lo + 6, l: 2, v: 0.8, p: 1 }]; App.select(1, 0); App.commit(); App.refresh(); });
  const longNote = () => state(() => App.P.tracks[1].clips[0].map(n => n.s + "+" + n.l).join(","));
  const noteRow = await state(() => { // the row that holds the note: where the grid answers with it
    const box = document.querySelector("#ed canvas").getBoundingClientRect();
    for (let r = 0; r < 40; r++) { const c = App.Ed.cellAt(60, r); if (c.y > box.bottom) break; document.querySelector("#ed canvas").dispatchEvent(new PointerEvent("pointermove", { clientX: c.x, clientY: c.y, bubbles: true })); if (document.querySelector("#ed .rd").textContent.includes(App.noteName(App.P.tracks[1].lo + 6))) return r; }
    return -1;
  });
  assert.ok(noteRow >= 0, "the note's row is in view");
  const noteTail = await cell(61, noteRow), cellAfter = await cell(62, noteRow), edCanvas = await page.locator("#ed canvas").boundingBox();
  await page.mouse.move(cellAfter.x - (cellAfter.x - noteTail.x) * 0.45, noteTail.y);
  await page.mouse.down();
  await page.mouse.move(edCanvas.x + edCanvas.width - 1, noteTail.y, { steps: 4 });
  assert.equal(await longNote(), "60+4", "the note reaches the end of the page");
  await page.waitForFunction(() => /^5/.test(document.querySelector(".ed-page").textContent), null, { timeout: 4000 });
  const cellOnNext = await cell(72, noteRow);
  await page.mouse.move(cellOnNext.x, cellOnNext.y, { steps: 4 });
  await page.mouse.up();
  assert.equal(await longNote(), "60+13", "and goes on to where it is dropped on the next page");
  await page.keyboard.press("Control+z");
  assert.equal(await longNote(), "60+2", "as one undo step");

  // A pad's row in the editor had no menu, though the pad on the device had one.
  await state(() => App.select(0, 0));
  const padRowAt = await cell(0, 2), edFrame = await page.locator("#ed canvas").boundingBox();
  await page.mouse.click(edFrame.x + 20, padRowAt.y, { button: "right" });
  assert.deepEqual(await state(() => [document.querySelector(".mn").getAttribute("aria-label"), ...[...document.querySelectorAll(".mn .mn-i")].map(b => b.textContent)]), ["Pad 3 CLAP", "Rename", "Load audio…", "Back to init sound"]);
  await page.keyboard.press("Escape");


  // Reported from use: reloading into the kids' face showed the console's green for a moment before the kids' paper.
  // The paper goes down before the first frame now: when the page's own scripts have run, the console is still hidden.
  const reload = await page.context().browser().newPage({ viewport: { width: 1100, height: 620 } });
  await reload.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    window.firstLook = { app: getComputedStyle(document.getElementById("app")).visibility, paper: getComputedStyle(document.body).backgroundColor, kids: !document.getElementById("kids-root").hidden };
  }));
  const kidsUrl = new URL(page.url()); kidsUrl.search = "?kids";
  await reload.goto(kidsUrl.href);
  await reload.waitForFunction(() => App.Kids.active && document.querySelector("#kids-root .kv-cell"));
  assert.deepEqual(await reload.evaluate(() => window.firstLook), { app: "hidden", paper: "rgb(234, 211, 174)", kids: false }, "before the kids' face is up, the console is not shown");
  await reload.evaluate(() => App.Kids.leave());
  assert.deepEqual(await reload.evaluate(() => [document.documentElement.classList.contains("face-kids"), getComputedStyle(document.getElementById("app")).visibility]), [false, "visible"], "and it comes back when the console does");
  await reload.close();

  // A walk through the kids' face as a child found: a slow tap on an empty beat made an accented note, a new song threw
  // away work that was never saved, and the effect's place read "Jen dílek a".
  const kidsPage = await page.context().browser().newPage({ viewport: { width: 1366, height: 768 } });
  try {
    const kidsAt = new URL(page.url()); kidsAt.search = "?kids";
    await kidsPage.goto(kidsAt.href);
    await kidsPage.waitForFunction(() => App.Kids.active && document.querySelector("#kids-root .kv-cell"));
    const slow = await kidsPage.locator('#kids-root [data-k="note"][data-row="0"][data-col="0"]').boundingBox();
    await kidsPage.mouse.move(slow.x + slow.width / 2, slow.y + slow.height / 2); await kidsPage.mouse.down(); await kidsPage.waitForTimeout(650); await kidsPage.mouse.up();
    assert.deepEqual(await kidsPage.evaluate(() => App.KidsMusic.grid(App.P, App.KidsMusic.part(App.P), 0)[0][0]), 1, "a slow tap places a plain note");
    assert.equal(await kidsPage.evaluate(() => App.KidsStore.slot), -1);
    await kidsPage.locator('#kids-root [data-k="shelf"]').click();
    await kidsPage.locator('#kids-root [data-k="new"]').click();
    const kept = await kidsPage.evaluate(() => App.KidsStore.slots().findIndex(Boolean));
    assert.ok(kept >= 0 && await kidsPage.evaluate(i => App.KidsMusic.grid(App.KidsStore.read(i), App.KidsMusic.part(App.KidsStore.read(i)), 0)[0][0] === 1, kept), "the unsaved song went onto the shelf before the new one replaced it");
    await kidsPage.evaluate(() => { App.KidsStore.remove(App.KidsStore.slots().findIndex(Boolean), App.KidsStore.slots().find(Boolean)); });
    const scopes = await kidsPage.locator('#kids-root [data-scope="piece"] small').allTextContents();
    assert.ok(scopes.length && scopes.every(t => t === "Jen dílek A"), JSON.stringify(scopes));
  } finally { await kidsPage.close(); }

  // Reported from use: some kids' sounds were off. They were replaced, but a browser that had played the old ones kept
  // them for ever. A kept copy of a bundled sound now stands only until the sound's version changes; offline it stays.
  const sounds = await page.context().browser().newContext({ viewport: { width: 1100, height: 620 } });
  try {
    const soundPage = await sounds.newPage();
    await soundPage.goto(page.url());
    await soundPage.waitForFunction(() => window.App?.KidsWorld && App.P);
    const id = "mlband01cow", stale = await soundPage.evaluate(async (id) => {
      // An old copy, as an earlier build left it: a different sound, no version.
      const old = new AudioBuffer({ length: 2400, sampleRate: 24000 }); old.getChannelData(0).fill(0.25, 0, 1200);
      const blob = App.wav(old, 0);
      await new Promise((ok, no) => { const r = indexedDB.open("musiclab3", 1); r.onupgradeneeded = () => r.result.createObjectStore("smp", { keyPath: "id" });
        r.onsuccess = () => { const t = r.result.transaction("smp", "readwrite"); t.objectStore("smp").put({ id, name: "Cow", blob }); t.oncomplete = ok; t.onerror = no; }; r.onerror = no; });
      return blob.size;
    }, id);
    await soundPage.reload(); await soundPage.waitForFunction(() => window.App?.KidsWorld && App.P);
    const fresh = await soundPage.evaluate(async (id) => { await App.restoreSample(id); return App.samples.get(id).buffer.duration; }, id);
    assert.ok(stale > 0 && fresh > 0.5, "the replaced cow is fetched over the old copy: " + fresh);
    // Without a connection, an older kept copy still plays rather than nothing.
    await soundPage.evaluate(async (id) => {
      const old = new AudioBuffer({ length: 2400, sampleRate: 24000 }); old.getChannelData(0).fill(0.25, 0, 1200);
      await new Promise((ok, no) => { const r = indexedDB.open("musiclab3", 1);
        r.onsuccess = () => { const t = r.result.transaction("smp", "readwrite"); t.objectStore("smp").put({ id, name: "Cow", blob: App.wav(old, 0) }); t.oncomplete = ok; t.onerror = no; }; r.onerror = no; });
      App.samples.delete(id);
    }, id);
    await soundPage.route("**/audio/kids/cow.wav*", r => r.abort("internetdisconnected")); // the file cannot be fetched
    assert.equal(await soundPage.evaluate(async (id) => { await App.restoreSample(id); return +App.samples.get(id)?.buffer.duration.toFixed(2); }, id), 0.1, "offline, the kept copy plays");
  } finally { await sounds.close(); }

  await reset();
  console.log("Regressions · arrow-key moves, untouched values, view outside undo, scheduled notes kept, modular patch finite, mix aligned with stems, last zone, MIDI rests, pieced project files, sample store cleared, input delay, note values, launcher hands the transport back, lists in popups, wheel grid, console number fields, long audio in a sampler, first recording on its frame, transport after a dialog, editor keys from anywhere, reasons on unavailable buttons, typed time unit, idle and lit controls, undo while playing, draft guard, duplicate on the beat, folded rows, song start slot, module wiring, loop export, page turn on drag, pad row menu, no console under a reload into the kids' face, kids' slow tap, unsaved song kept, piece name, replaced kids' sounds reach a browser that kept the old ones");
};
