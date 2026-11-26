/* Browser regression checks. Install the test-only dependencies with npm ci, then
   npx playwright install chromium and npm test. Set MUSICLAB_BROWSERS to a comma-
   separated list (chromium,firefox,webkit). Override a browser binary with
   MUSICLAB_CHROMIUM_PATH, MUSICLAB_FIREFOX_PATH, or MUSICLAB_WEBKIT_PATH. */
"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");

const root = path.resolve(__dirname, "../docs");
const browsers = { chromium, firefox, webkit };
const sizes = [[1100,620], [1280,720], [1366,768], [1600,900], [1920,1080], [2560,1080]];
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".woff2":"font/woff2", ".svg":"image/svg+xml" };

async function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const file = path.resolve(root, "./" + decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname));
      if (!file.startsWith(root + path.sep)) throw Error();
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

function inspectWav(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  assert.equal(bytes.toString("ascii", 36, 40), "data");
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt16LE(34), 24);
  const rate = bytes.readUInt32LE(24), hits = [];
  let energy = 0, peak = 0, last = -1;
  for (let i = 44; i < bytes.length; i += 6) {
    const left = bytes.readIntLE(i, 3) / 8388608;
    const right = bytes.readIntLE(i + 3, 3) / 8388608;
    const level = Math.max(Math.abs(left), Math.abs(right));
    peak = Math.max(peak, level);
    energy += (left * left + right * right) / 2;
    const time = (i - 44) / (rate * 6);
    if (level > 0.012 && time - last > 0.025) { hits.push(time); last = time; }
  }
  const rms = Math.sqrt(energy / ((bytes.length - 44) / 6));
  assert.ok(Number.isFinite(rms) && rms > 0.0001 && peak < 1, "Audible, finite stereo output below clipping");
  return { rms, hits };
}

function inspectMidi(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "MThd");
  assert.equal(bytes.readUInt16BE(8), 1);
  const ppqn = bytes.readUInt16BE(12), tracks = [];
  let offset = 14;
  function varint() {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = bytes.readUInt8(offset++);
      value = value * 128 + (b & 127);
      if (!(b & 128)) return value;
    }
    throw Error("Invalid variable-length MIDI value");
  }
  while (offset < bytes.length) {
    assert.equal(bytes.toString("ascii", offset, offset + 4), "MTrk");
    const end = offset + 8 + bytes.readUInt32BE(offset + 4);
    offset += 8;
    let ticks = 0, endTick;
    const on = [], off = [], markers = [];
    while (offset < end) {
      ticks += varint();
      const kind = bytes.readUInt8(offset++);
      if (kind === 0xff) {
        const type = bytes.readUInt8(offset++), size = varint();
        if (type === 0x2f) endTick = ticks;
        if (type === 0x06) markers.push([ticks, bytes.toString("ascii", offset, offset + size)]);
        offset += size;
      } else {
        assert.ok([0x80, 0x90].includes(kind & 0xf0), "Note event expected");
        const note = bytes.readUInt8(offset++), velocity = bytes.readUInt8(offset++);
        (kind >> 4 === 9 && velocity ? on : off).push([ticks, note]);
      }
    }
    assert.equal(offset, end);
    tracks.push({ endTick, on, off, markers });
  }
  assert.equal(tracks.length, bytes.readUInt16BE(10));
  return { ppqn, tracks };
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function menu(page, label) {
  await button(page, "File").click();
  await page.getByRole("menuitem", { name: label }).click();
}
async function download(page, action) {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  assert.equal(await file.failure(), null);
  return { bytes: await fs.readFile(await file.path()), name: file.suggestedFilename() };
}
async function project(page) { return page.evaluate(() => App.sanitize(App.P)); }
async function waitProject(page, name) { await page.waitForFunction(name => App.P.name === name, name); }
async function confirmIfAsked(page, targetName) {
  await page.waitForFunction(name => App.P.name === name || !!document.querySelector("dialog[open] .confirm-action"), targetName);
  if (await page.locator("dialog[open] .confirm-action").count()) await page.locator("dialog[open] .confirm-action").click();
  await waitProject(page, targetName);
}

async function checkLayout(page) {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const ti of [0, 1, 6]) {
      await page.evaluate(ti => App.select(ti, 0), ti);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const broken = await page.evaluate(() => {
        const top = document.querySelector("#top").getBoundingClientRect();
        const issues = [];
        for (const el of [document.documentElement, document.body, document.querySelector("#app")]) {
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
            issues.push((el.id || el.tagName) + " overflows its viewport");
        }
        const controls = document.querySelectorAll("#top button, #top [role=slider], #top .take");
        for (const el of controls) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          if (r.left < top.left - 1 || r.right > top.right + 1 || r.top < top.top - 1 ||
              r.bottom > top.bottom + 1 || (hit && !el.contains(hit) && !hit.contains(el))) {
            issues.push(el.getAttribute("aria-label") || el.dataset.tip || el.textContent);
          }
        }
        for (const id of ["mx", "ed", "dv", "sg", "fx", "st"]) {
          const e = document.getElementById(id).getBoundingClientRect();
          if (e.width < 2 || e.height < 2 || e.right > innerWidth + 1 || e.bottom > innerHeight + 1) issues.push(id);
        }
        return issues;
      });
      assert.deepEqual(broken, [], width + "×" + height + ", track " + ti + ": " + broken.join(", "));
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => App.select(0, 0));
}

async function run(browserName, url) {
  const executablePath = process.env["MUSICLAB_" + browserName.toUpperCase() + "_PATH"];
  const browser = await browsers[browserName].launch({ headless: true, ...(executablePath && { executablePath }) });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("response", r => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });
    await page.goto(url);
    await page.waitForSelector("#ed canvas");
    await page.evaluate(() => document.fonts.ready);

    // A genuine canvas gesture and one UI undo, on an initially empty drum clip.
    const grid = page.locator("#ed canvas");
    const bounds = await grid.boundingBox();
    await grid.click({ position: { x: bounds.width * 0.34, y: bounds.height * 0.24 } });
    await page.waitForFunction(() => App.P.tracks[0].clips[0].length === 1);
    await button(page, "UNDO").click();
    await page.waitForFunction(() => App.P.tracks[0].clips[0].length === 0);

    // A long name and a real take exercise the two transport states most likely
    // to clip the rightmost controls. A short isolated kick permits onset checks.
    const name = "LONG PROJECT NAME 0123456789";
    await page.evaluate(name => {
      const P = App.P;
      P.name = name; P.bpm = 120; P.swing = 66; P.song = 1; P.chain = [0, 1];
      P.tracks[0].drive = 0;
      Object.assign(P.tracks[0].kit.pads[0], { sweep: 0, tone: 1, nz: 0, dec: .006, tune: 600 });
      P.tracks[0].clips[0] = [{ s: 0, n: 36, l: 4, v: 1, p: 1, r: 8 }];
      App.commit(); App.refresh();
    }, name);
    await page.getByRole("button", { name: /^TAPE(?: |$)/i }).click();
    await page.waitForFunction(() => !!App.taping);
    await button(page, "Play pattern or song").click();
    await page.waitForFunction(() => App.Seq.playing && App.Seq.pos?.step >= 4);
    await button(page, "Stop playback").click();
    await page.waitForFunction(() => !App.Seq.playing);
    await page.getByRole("button", { name: /^TAPE(?: |$)/i }).click();
    await page.waitForFunction(() => App.take?.duration > 0);
    const tape = await download(page, () => page.locator("#top .take").click());
    inspectWav(tape.bytes);
    await checkLayout(page);

    await page.evaluate(() => App.select(2, 1));
    const original = await project(page);
    const saved = await download(page, () => menu(page, /Save project/i));
    assert.equal(JSON.parse(saved.bytes).name, name);
    const wave = await download(page, () => menu(page, /Export audio/i));
    const render = inspectWav(wave.bytes);
    assert.equal(render.hits.length, 8, "All eight offline ratchets must sound");
    const midi = inspectMidi((await download(page, () => menu(page, /Export MIDI/i))).bytes);
    const [conductor, kit] = midi.tracks;
    assert.deepEqual(conductor.markers, [[0,"MusicLab Pattern A"], [midi.ppqn*4,"MusicLab Pattern B"]]);
    assert.equal(conductor.endTick, midi.ppqn * 8, "The trailing empty bar must survive export");
    assert.equal(kit.on.length, 8); assert.equal(kit.off.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.equal(kit.on[i][1], 36);
      assert.ok(kit.off[i][0] > kit.on[i][0]);
      if (i < 7) assert.ok(kit.off[i][0] <= kit.on[i+1][0]);
      const audioTime = render.hits[i] - render.hits[0];
      assert.ok(Math.abs(audioTime - kit.on[i][0] / midi.ppqn * .5) < .003, "MIDI and WAV onset " + i);
    }

    // Open the downloaded project through the normal file picker.
    await page.evaluate(() => { App.P.name = "TEMP"; App.P.tracks[0].clips[0] = []; App.commit(); App.refresh(); });
    const [picker] = await Promise.all([page.waitForEvent("filechooser"), menu(page, /Open project/i)]);
    await picker.setFiles({ name: saved.name, mimeType: "application/json", buffer: saved.bytes });
    await confirmIfAsked(page, name);
    assert.deepEqual(await project(page), original);

    await menu(page, /^Reset project/i);
    await page.getByRole("dialog").getByRole("button", { name: /cancel/i }).click();
    assert.deepEqual(await project(page), original);
    await menu(page, /^Reset project/i);
    await page.locator("dialog[open] .confirm-action").click();
    await waitProject(page, "UNTITLED");
    assert.ok(await page.evaluate(() => App.P.tracks.every(t => t.clips.every(c => !c.length))));
    await button(page, "UNDO").click();
    assert.deepEqual(await project(page), original);
    await button(page, "REDO").click();
    await waitProject(page, "UNTITLED");
    await page.reload();
    await waitProject(page, "UNTITLED");
    await menu(page, /Restore last reset/i);
    await confirmIfAsked(page, name);
    assert.deepEqual(await project(page), original);
    assert.deepEqual(errors, []);
    for (const suite of ["workstation", "operations", "phrases", "automation", "performance", "audio-studio", "mix-rack", "material-midi", "capture-rules-finder", "conductor", "sampler-lab", "scenes-eq", "composition-lab", "rack-laboratory", "signal-workshop", "instrument-lab", "console-rules", "console-kit", "regressions", "kids-storage", "kids-music", "kids", "kids-sound"]) {
      await require("./" + suite + ".cjs")(page);
    }
    assert.deepEqual(errors, []);
    console.log(browserName + " " + browser.version() + " — passed 6 viewports, input/undo, transport, tape, WAV/MIDI, JSON, recovery, batch operations, phrases, automation, patches, arrangement, live performance, audio studio, stems, library, MIDI devices, capture, conductor, granular and multisampling, transcription, scenes, EQ, command search, cycle capture, song curves, modular and wavetable synthesis, Scala, spectral editing, resampling, convolution, branched racks and signal measurement, console rules in every dialog, one control language for the console and its dialogs, regressions from review, band studio, shelf, microphone, sound painting and signal screens");
  } finally { await browser.close(); }
}

(async () => {
  const old = require("./stamp.cjs").stale();
  assert.deepEqual(old, [], "index.html serves stale versions of " + old.join(", ") + " · run npm run stamp");
  const requested = (process.env.MUSICLAB_BROWSERS || "chromium").split(",").map(s => s.trim());
  if (requested.some(s => !Object.hasOwn(browsers, s))) throw Error("Use chromium, firefox or webkit in MUSICLAB_BROWSERS");
  const server = await serve();
  try {
    for (const name of requested) await run(name, "http://127.0.0.1:" + server.address().port + "/");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
