/* The console's rules hold in every dialog, whatever feature drew it: nothing scrolls or leaves the screen, every control
   speaks the console's language (palette, capitals, no radius, no browser-default widgets), explanations live in the
   status strip, and a list that outgrows its box is paged. Runs last, on the project the other suites left behind. */
"use strict";
const assert = require("node:assert/strict");

// Each state is opened in the page; the optional third item is a tab inside the dialog.
const states = [
  ["arrange", "App.Song.open()"], ["conductor", "App.Song.open('conductor')"], ["song automation", "App.Song.open('automation')"],
  ["chords", "App.Harmony.open()"], ["audio", "App.AudioStudio.open()"], ["looper", "App.AudioStudio.open()", "Looper"],
  ["transcribe", "App.AudioStudio.openTranscription()"], ["resample", "App.AudioStudio.openResample()"], ["spectral", "App.AudioStudio.openSpectral()"],
  ["capture", "App.Retrospective.open()"], ["live", "App.Live.open()"], ["live take", "App.Live.open('take')"],
  ["phrase", "App.Phrases.open()"], ["batch", "App.Operations.open()"], ["batch clean up", "App.Operations.open()", "Clean up"],
  ["batch mix", "App.Operations.open()", "Mix"], ["batch defaults", "App.Operations.open()", "Defaults"],
  ["cycles", "App.Cycles.open()"], ["rules", "App.Rules.open()"], ["groove", "App.Groove.open()"], ["patches", "App.Patches.open()"],
  ["modular", "{const i=App.P.tracks.findIndex(t=>t.kind==='syn');if(i>=0){App.select(i,0);App.InstrumentLab.open('graph',i);}}"],
  ["wavetable", "{const i=App.P.tracks.findIndex(t=>t.kind==='syn');if(i>=0){App.select(i,0);App.InstrumentLab.open('table',i);}}"],
  ["tuning", "App.InstrumentLab.tuning()"], ["modulation", "App.Rack.modulate()"], ["mixer", "App.Rack.mixer()"],
  ["zones", "{const i=App.P.tracks.findIndex(t=>t.kind==='smp');if(i>=0){App.select(i,0);App.SamplerLab.zones(i);}}"],
  ["impulse", "App.SignalWorkshop.openImpulse()"], ["bench", "App.SignalBench.open()"], ["scenes", "App.Scenes.open()"],
  ["parametric eq", "App.ParametricEQ.open(App.P.sel.t)"], ["midi", "App.MidiIO.open()"], ["library", "App.Library.open()"],
  ["stems", "App.file('stems')"], ["reset", "App.file('new')"], ["find", "App.Finder.open()"],
];

// What breaks a rule in the dialog on top, as short sentences; an empty list is a dialog that fits the console.
const audit = () => {
  const d = [...document.querySelectorAll("dialog[open]")].pop();
  if (!d) return null;
  const shown = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const name = e => (e.tagName.toLowerCase() + "." + String(e.className || "").split(" ")[0]) + (e.getAttribute("aria-label") ? " “" + e.getAttribute("aria-label") + "”" : "");
  const r = d.getBoundingClientRect(), all = [d, ...d.querySelectorAll("*")].filter(shown), bad = [];
  if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) bad.push("leaves the screen: " + Math.round(r.width) + "×" + Math.round(r.height));
  for (const e of all) {
    const s = getComputedStyle(e), b = e.getBoundingClientRect();
    if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) bad.push("can scroll: " + name(e));
    else if (e.tagName === "TEXTAREA" && e.scrollHeight > e.clientHeight + 1) bad.push("text runs past its box: " + name(e));
    if (e !== d && (b.right > r.right + 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.top < r.top - 1)) bad.push("outside the dialog: " + name(e));
    if (parseFloat(s.borderTopLeftRadius) > 0) bad.push("rounded: " + name(e));
    if (!/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) continue;
    const kind = e.type || e.tagName.toLowerCase();
    if (kind === "file" || kind === "hidden") continue;
    if (s.appearance !== "none" && !(kind === "number" && s.appearance === "textfield")) bad.push("browser-default " + kind + ": " + name(e));
    if (!/IBM Plex Mono/.test(s.fontFamily)) bad.push("foreign font: " + name(e));
    if (!/^(range|checkbox)$/.test(kind) && s.textTransform !== "uppercase") bad.push("mixed case: " + name(e));
    const [red, green, blue] = (s.backgroundColor.match(/\d+/g) || []).map(Number);
    if (Math.max(red, green, blue) > 200 && kind !== "checkbox") bad.push("light field: " + name(e));
  }
  // The strip is the only place that spells things out: no paragraph of help in the layout, and the strip has a line.
  for (const e of d.querySelectorAll("p,small")) {
    if (shown(e) && !e.hasAttribute("role") && e.textContent.trim().split(/\s+/).length > 9) bad.push("help written into the dialog: “" + e.textContent.trim().slice(0, 40) + "…”");
  }
  if (!(d.dataset.st || "").trim()) bad.push("empty status strip");
  return [...new Set(bad)];
};

module.exports = async function consoleRules(page) {
  const close = () => page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach(d => d.close()); App.UI.closeMenu(); App.Workspace.focus(""); });
  let audited = 0;
  for (const [width, height] of [[1100, 620], [1600, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const [label, opener, tab] of states) {
      await close();
      // Never wait for what the opener returns: a confirmation answers only when it closes.
      const failure = await page.evaluate(code => { try { (0, eval)(code); return null; } catch (e) { return e.message; } }, opener);
      assert.equal(failure, null, label + " opens");
      await page.waitForTimeout(60);
      if (tab) {
        await page.locator("dialog[open]").last().getByRole("button", { name: tab, exact: true }).click();
        await page.waitForTimeout(60);
      }
      const bad = await page.evaluate(audit);
      if (bad === null) continue; // No instrument of that kind in this project.
      assert.deepEqual(bad, [], label + " at " + width + "×" + height);
      audited++;
    }
  }
  await close();
  await page.setViewportSize({ width: 1100, height: 620 });

  // Any list a dialog holds is paged once it outgrows its box; the newest row opens its page; wheel and pager turn pages.
  await page.evaluate(() => {
    const { h, btn } = App.UI, node = App.Workspace.begin("Paging check"), list = h("div.tool-list");
    const add = () => list.append(h("div.tool-item", null, h("span", { text: "ROW " + (list.querySelectorAll(".tool-item").length + 1) })));
    for (let i = 0; i < 40; i++) add();
    node.append(h("div.dlg-body", null, h("h2", { text: "Paging check" }), list, btn("Add row", "ADD A ROW TO THE LIST", add), h("p.dlg-tip", { text: "WHAT THIS DIALOG IS FOR" })));
    node.showModal();
  });
  const dialog = page.locator("dialog[open]").last(), pager = dialog.locator(".pg b");
  await pager.waitFor();
  const rows = () => page.evaluate(() => [...document.querySelectorAll("dialog[open] .tool-item")].filter(e => e.getClientRects().length).map(e => e.textContent));
  const first = await rows();
  assert.equal(first[0], "ROW 1");
  assert.ok(first.length > 2 && first.length < 40, "one page of rows: " + first.length);
  assert.equal(await pager.textContent(), "1–" + first.length + " / 40");
  assert.deepEqual(await page.evaluate(audit), [], "a paged list scrolls nowhere");
  await dialog.getByRole("button", { name: "Next rows" }).click();
  assert.equal((await rows())[0], "ROW " + (first.length + 1));
  const box = await dialog.locator(".tool-list").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -120);
  await page.waitForFunction(text => document.querySelector("dialog[open] .pg b")?.textContent === text, "1–" + first.length + " / 40");
  await dialog.getByRole("button", { name: "Add row" }).click();
  await page.waitForFunction(() => /\/ 41$/.test(document.querySelector("dialog[open] .pg b")?.textContent));
  assert.equal((await rows()).pop(), "ROW 41", "a new row opens the page it lands on");
  assert.ok(await dialog.getByRole("button", { name: "Next rows" }).isDisabled());

  // The strip says what the dialog is for, and names the control under the pointer.
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => document.querySelector("dialog[open]").dataset.st === "WHAT THIS DIALOG IS FOR");
  await dialog.getByRole("button", { name: "Add row" }).hover();
  await page.waitForFunction(() => document.querySelector("dialog[open]").dataset.st === "ADD A ROW TO THE LIST");
  await page.keyboard.press("Escape");

  // Find is the map of the console: every panel's tools on one screen, nothing scrolled, the selection moved by keys.
  await page.keyboard.press("Control+k");
  for (let i = 0; i < 13; i++) await page.keyboard.press("ArrowDown");
  const found = await page.evaluate(() => {
    const dlg = document.querySelector("dialog.find-dialog"), map = dlg.querySelector(".find-map"), selected = map.querySelector("[aria-selected=true]");
    const box = dlg.getBoundingClientRect(), rows = [...map.querySelectorAll(".find-option")];
    return {
      id: selected?.id, count: dlg.querySelector(".find-count").textContent, groups: [...map.querySelectorAll("h3")].map(e => e.textContent),
      inside: rows.every(r => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= box.top && b.bottom <= box.bottom - (parseFloat(getComputedStyle(dlg, "::after").height) || 0) + 1 && b.left >= box.left && b.right <= box.right; }),
      cut: rows.flatMap(r => [...r.children]).filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent), strip: dlg.dataset.st,
    };
  });
  assert.equal(found.id, "find-option-13"); assert.match(found.count, /^14 \/ \d+$/);
  assert.ok(found.inside, "every row of the map is on screen at 1100 × 620");
  assert.deepEqual(found.cut, [], "no label of the map is cut off");
  for (const group of ["Transport", "Clip matrix", "Song", "Edit", "Device", "Master", "Signal", "File", "Keys", "Gestures"]) assert.ok(found.groups.includes(group), group + " is on the map");
  assert.match(found.strip, /ENTER = GO$/);
  assert.deepEqual(await page.evaluate(audit), []);
  // Sideways keys cross to the neighbouring column; typing narrows the map to what matches.
  const before = found.id;
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await page.evaluate(() => document.querySelector(".find-map [aria-selected=true]").id), before);
  await page.keyboard.type("sidech");
  assert.equal(await page.evaluate(() => document.querySelector(".find-map [aria-selected=true] strong").textContent), "Sidechain");
  assert.deepEqual(await page.evaluate(audit), []);
  // A query that matches nearly everything still fits: the weakest matches make room and are counted.
  await page.getByRole("combobox", { name: "Search commands" }).fill("e");
  const broad = await page.evaluate(() => {
    const dlg = document.querySelector("dialog.find-dialog"), body = dlg.querySelector(".dlg-body"), box = dlg.getBoundingClientRect();
    const strip = parseFloat(getComputedStyle(dlg, "::after").height) || 0;
    return { fits: [...dlg.querySelectorAll(".find-option, .find-more")].every(r => r.getBoundingClientRect().bottom <= box.bottom - strip + 1),
      rows: dlg.querySelectorAll(".find-option").length, note: dlg.querySelector(".find-map > .find-more")?.textContent || "" };
  });
  assert.ok(broad.fits && broad.rows > 30, "a broad query fits the smallest window: " + JSON.stringify(broad));
  assert.match(broad.note, /weaker matches/);
  assert.deepEqual(await page.evaluate(audit), []);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1600, height: 900 });
  console.log("Console rules held in " + audited + " dialog states at three sizes · paging, status strip and command window");
};
