/* One language for every control. The value control on the console and the fields in every dialog answer the same
   gestures (drag, wheel, type, right-click reset), a list always opens the console's own menu, every object has a
   right-click menu, and a drag outlines the places that will take it. Driven with real pointer and key events. */
"use strict";
const assert = require("node:assert/strict");

module.exports = async function consoleKit(page) {
  const close = () => page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach(d => d.close()); App.UI.closeMenu(); App.Workspace.focus(""); });
  const state = fn => page.evaluate(fn);
  const centre = async locator => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // A drag with real pointer events; `during` runs while the load is in the air.
  const drag = async (from, to, during, modifiers = []) => {
    const a = await centre(from), b = await centre(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 2 });
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.move(b.x, b.y, { steps: 6 });
    if (during) await during();
    await page.mouse.up();
    for (const key of modifiers) await page.keyboard.up(key);
  };
  const wheel = async (locator, notches) => {
    await locator.hover();
    for (let i = 0; i < Math.abs(notches); i++) { await page.mouse.wheel(0, notches > 0 ? -120 : 120); await page.waitForTimeout(20); }
  };
  const menuItem = name => page.locator(".mn").getByRole("menuitem", { name });

  await close();
  await page.setViewportSize({ width: 1600, height: 900 });
  await state(() => { App.P.name = "TO RESET"; App.commit(); App.file("new"); }); // never wait for the opener: a confirmation answers only when it closes
  await page.locator("dialog[open] .confirm-action").click();
  await page.waitForFunction(() => App.P.name === "UNTITLED" && !document.querySelector("dialog[open]"));
  await state(() => { App.P.tracks[0].clips[0] = [{ s: 0, n: 36, l: 1, v: 1, p: 1 }, { s: 4, n: 38, l: 1, v: 0.8, p: 1 }]; App.select(0, 0); App.commit(); App.refresh(); });

  /* ── every object answers a right-click with what can be done to it ── */
  const cell = (t, p) => page.locator("#mx .cl").nth(t * 8 + p);
  const head = p => page.locator("#mx .mx-p").nth(p);
  const track = t => page.locator("#mx .mx-n").nth(t);
  await cell(0, 0).click({ button: "right" });
  assert.deepEqual(await page.locator(".mn .mn-i").allTextContents(), ["Duplicate to next free cell", "Clear", "Length, repeat, stretch…", "Batch edit…", "Save to library…"]);
  await menuItem("Duplicate to next free cell").click();
  assert.equal(await state(() => App.P.tracks[0].clips[1].length), 2, "the clip landed in the next free cell");
  assert.deepEqual(await state(() => [App.P.sel.t, App.P.sel.p]), [0, 1]);
  await cell(0, 1).click({ button: "right" });
  await menuItem("Clear").click();
  assert.equal(await state(() => App.P.tracks[0].clips[1].length), 0);
  await page.getByRole("button", { name: "UNDO", exact: true }).click();
  assert.equal(await state(() => App.P.tracks[0].clips[1].length), 2, "clearing is one undo step");
  await cell(0, 2).click({ button: "right" });
  assert.ok(await menuItem("Clear").isDisabled(), "an empty cell has nothing to clear");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".mn").count(), 0);

  await head(1).click({ button: "right", position: { x: 20, y: 10 } });
  await menuItem("Add to song").click();
  await page.waitForFunction(() => App.P.chain.length === 1 && App.P.chain[0] === 1);
  await page.locator("#mx .sl").first().click({ button: "right" });
  await menuItem("Remove from song").click();
  await page.waitForFunction(() => App.P.chain.length === 0);

  await track(4).click({ button: "right" });
  assert.ok((await page.locator(".mn .mn-i.on").textContent()).startsWith("Synth"), "the menu marks the device the track has");
  await menuItem(/^Sampler/).click();
  assert.equal(await state(() => App.P.tracks[4].kind), "smp");
  await page.getByRole("button", { name: "UNDO", exact: true }).click();
  assert.equal(await state(() => App.P.tracks[4].kind), "syn");

  /* ── the pattern length is a value on the pattern letter ── */
  const bars = head(2).locator(".pm"), selectedBefore = await state(() => App.P.sel.p);
  await wheel(bars, 3);
  assert.equal(await state(() => App.P.pats[2].bars), 4);
  assert.equal((await bars.locator(".v").textContent()).trim(), "4 BAR");
  await bars.click({ button: "right" });
  assert.equal(await state(() => App.P.pats[2].bars), 1, "right-click puts a value back");
  assert.equal(await state(() => App.P.sel.p), selectedBefore, "adjusting a length neither selects nor drags the pattern");

  /* ── ALT makes mute and solo exclusive ── */
  const solo = t => page.locator("#mx .mx-b.s").nth(t), mute = t => page.locator("#mx .mx-b.m").nth(t);
  const flags = key => page.evaluate(k => App.P.tracks.map(t => +t[k]).join(""), key);
  await solo(1).click();
  await solo(3).click({ modifiers: ["Alt"] });
  assert.equal(await flags("solo"), "00010000");
  await solo(3).click({ modifiers: ["Alt"] });
  assert.equal(await flags("solo"), "00000000");
  await mute(2).click({ modifiers: ["Alt"] });
  assert.equal(await flags("mute"), "11011111");
  await mute(2).click({ modifiers: ["Alt"] });
  assert.equal(await flags("mute"), "00000000");

  /* ── a drag shows where it can land, Escape calls it off ── */
  let outlined = 0;
  await drag(cell(0, 0), cell(3, 4), async () => {
    outlined = await page.locator(".dt").count();
    assert.equal(await page.locator(".gh").count(), 1, "the load follows the pointer");
    assert.ok(await cell(3, 4).evaluate(e => e.classList.contains("dz")), "the cell under the pointer is lit");
  });
  assert.ok(outlined >= 64, "every cell that takes a clip is outlined: " + outlined);
  assert.equal(await page.locator(".dt, .dz, .gh").count(), 0, "the outlines go when the drag ends");
  assert.equal(await state(() => App.P.tracks[3].clips[4].length), 2);
  {
    const a = await centre(cell(0, 0)), b = await centre(cell(5, 5));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".dt, .dz, .gh").count(), 0, "Escape ends the drag");
    await page.mouse.up();
    assert.equal(await state(() => App.P.tracks[5].clips[5].length), 0, "and nothing is copied");
  }
  // A device onto another track; a pad onto another pad, ALT swaps.
  await drag(track(1), track(5));
  assert.ok(await state(() => JSON.stringify(App.P.tracks[5].syn) === JSON.stringify(App.P.tracks[1].syn) && App.P.tracks[5].kind === App.P.tracks[1].kind), "the device was copied");
  assert.equal(await state(() => App.P.tracks[5].name), "SYNTH", "the track keeps its name");
  await state(() => App.select(0, 0));
  const pad = i => page.locator("#dv .pd").nth(i);
  await drag(pad(0), pad(2));
  assert.deepEqual(await state(() => App.P.tracks[0].kit.pads.map(p => p.name).slice(0, 3)), ["KICK", "SNARE", "KICK"]);
  await drag(pad(1), pad(3), null, ["Alt"]);
  assert.deepEqual(await state(() => App.P.tracks[0].kit.pads.map(p => p.name).slice(0, 4)), ["KICK", "HAT", "KICK", "SNARE"]);
  await pad(2).click({ button: "right" });
  await menuItem("Back to init sound").click();
  assert.equal(await state(() => App.P.tracks[0].kit.pads[2].name), "CLAP");

  /* ── dialog fields: a list opens the console menu, never the browser's ── */
  await state(() => App.Rack.mixer(1));
  const dialog = page.locator("dialog[open]").last();
  assert.equal(await dialog.locator(".dlg-hd .tg").textContent(), "Mixer routing");
  assert.equal(await dialog.getByRole("button", { name: "Close", exact: true }).count(), 1, "one way out, in the frame");
  const key = () => dialog.locator('select[aria-label="Sidechain key"]'); // the open list is labelled after its field
  assert.deepEqual(await key().evaluate(sel => ["pointerdown", "mousedown"].map(type => {
    const e = new (type === "pointerdown" ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, button: 0 });
    sel.dispatchEvent(e); return e.defaultPrevented;
  })), [true, true], "the browser's own list is suppressed");
  await page.mouse.move(2, 2); await page.mouse.up();
  await state(() => App.UI.closeMenu());
  await key().click();
  const list = dialog.locator(".mn");
  await list.waitFor();
  assert.equal(await list.locator(".mn-i").count(), await key().evaluate(sel => sel.options.length), "one row per option");
  assert.equal(await list.locator(".mn-i.on").count(), 1, "the current choice is marked");
  const second = await key().evaluate(sel => sel.options[1].value);
  await list.locator(".mn-i").nth(1).click();
  assert.equal(await key().inputValue(), second);
  assert.equal(await state(() => App.P.rack.strips[1].key), second, "picking fires the field's change");
  await key().click(); await list.waitFor();
  await key().click();
  assert.equal(await list.count(), 0, "pressing the open list's field closes it");
  await key().focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await key().evaluate(sel => sel.selectedIndex), 2, "arrow keys step a list");
  await page.keyboard.press("Enter");
  await list.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await list.count(), 0);
  assert.ok(await dialog.isVisible(), "Escape closed the list, not the dialog");
  await wheel(key(), 1);
  assert.equal(await key().evaluate(sel => sel.selectedIndex), 3, "the wheel steps a list");
  await key().click({ button: "right" });
  assert.equal(await key().evaluate(sel => sel.selectedIndex), 0, "right-click returns a field to the value it appeared with, across the dialog's redraws");
  assert.equal(await state(() => App.P.rack.strips[1].key), "off");

  /* ── a number is dragged, wheeled, typed and reset like a console value ── */
  const threshold = () => dialog.getByLabel("Sidechain threshold");
  const start = +(await threshold().inputValue());
  assert.ok(+(await threshold().evaluate(e => getComputedStyle(e).getPropertyValue("--n"))) > 0, "the bar under a number shows where it stands");
  await threshold().hover();
  await page.waitForFunction(() => /DRAG \/ WHEEL = ADJUST/.test(document.querySelector("dialog[open]").dataset.st));
  assert.match(await dialog.getAttribute("data-st"), /^Sidechain threshold {2}-?\d/, "the strip names the field and its value");
  await wheel(threshold(), 3);
  const wheeled = +(await threshold().inputValue());
  assert.ok(wheeled > start, "wheel up raises the value: " + start + " to " + wheeled);
  await page.waitForFunction(v => App.P.rack.strips[1].threshold === v, wheeled);
  await state(() => App.doUndo(-1));
  assert.equal(await state(() => App.P.rack.strips[1].threshold), start, "three notches of the wheel are one undo step");
  await state(() => App.doUndo(1));
  assert.equal(await state(() => App.P.rack.strips[1].threshold), wheeled);
  await state(() => App.Rack.mixer(1)); // undo replaced the project under the open editor; a user cannot do that, so open it afresh
  {
    const c = await centre(threshold());
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 40, c.y, { steps: 4 });
    assert.ok(await threshold().evaluate(e => e.classList.contains("dr")), "the field shows it is being dragged");
    await page.mouse.up();
  }
  const dragged = +(await threshold().inputValue());
  assert.ok(dragged > wheeled, "dragging right raises the value: " + wheeled + " to " + dragged);
  assert.equal(await state(() => App.P.rack.strips[1].threshold), dragged, "the drag is applied when it ends");
  await threshold().click();
  await page.keyboard.type("-12");
  await page.keyboard.press("Enter");
  assert.equal(await state(() => App.P.rack.strips[1].threshold), -12, "a click selects the value for typing");
  await page.mouse.move(4, 4);
  await threshold().click({ button: "right" });
  assert.equal(+(await threshold().inputValue()), -30, "right-click resets a number to the default it names, not to what it happened to show first");
  await page.waitForFunction(() => document.querySelector('dialog[open] input[aria-label="Sidechain threshold"]').classList.contains("df"), null, { timeout: 2000 });
  assert.equal(await state(() => App.P.rack.strips[1].threshold), -30);

  // A number never reaches its editor empty or out of range: empty goes back to the last good value, the rest is pulled in.
  await threshold().fill("");
  await page.keyboard.press("Tab");
  assert.equal(+(await threshold().inputValue()), -30, "an emptied number returns to its last value");
  assert.equal(await state(() => App.P.rack.strips[1].threshold), -30, "and the editor never hears of it");
  await threshold().fill("999");
  await page.keyboard.press("Tab");
  assert.equal(+(await threshold().inputValue()), 0, "a number past its limit stops at the limit");
  assert.equal(await state(() => App.P.rack.strips[1].threshold), 0);
  assert.ok(await state(() => Number.isFinite(App.P.rack.strips[1].threshold)));

  // A drag that leaves the dialog is not a wish to close it; a click on the backdrop is.
  {
    const box = await dialog.boundingBox(), c = await centre(threshold());
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(box.x - 30, c.y, { steps: 4 }); await page.mouse.up();
    assert.ok(await dialog.isVisible(), "a drag released on the backdrop leaves the dialog open");
    await page.mouse.click(box.x - 30, box.y + 20);
    assert.equal(await page.locator("dialog[open]").count(), 0, "a click on the backdrop closes it");
  }

  /* ── a list longer than the window breaks into columns instead of scrolling ── */
  await close();
  await page.setViewportSize({ width: 1100, height: 620 });
  await state(() => App.InstrumentLab.tuning());
  await page.locator("dialog[open]").getByLabel("Reference MIDI note").click();
  const long = await page.locator("dialog[open] .mn").evaluate(m => {
    const r = m.getBoundingClientRect(), items = [...m.querySelectorAll(".mn-i")];
    return { n: items.length, cols: m.classList.contains("cols"), inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
      scrolls: m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1, columns: new Set(items.map(i => Math.round(i.getBoundingClientRect().left))).size };
  });
  assert.ok(long.n > 100 && long.cols && long.columns > 1 && long.inside && !long.scrolls, "128 choices on one screen: " + JSON.stringify(long));
  await page.keyboard.type("A4");
  assert.equal((await page.locator("dialog[open] .mn .mn-i:focus span").first().textContent()).slice(0, 2), "A4", "typing jumps to a choice");
  await page.keyboard.press("Escape");
  await close();
  await page.setViewportSize({ width: 1600, height: 900 });
  await state(() => { App.P.name = "TO RESET"; App.commit(); App.file("new"); }); // never wait for the opener: a confirmation answers only when it closes
  await page.locator("dialog[open] .confirm-action").click();
  await page.waitForFunction(() => App.P.name === "UNTITLED" && !document.querySelector("dialog[open]"));
  console.log("Console kit · object menus, pattern length, exclusive mute and solo, drags with outlined targets, console lists and number gestures in dialogs, columned menus");
};
