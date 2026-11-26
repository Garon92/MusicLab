/* Expandable panels and shared, keyboard-accessible dialogs. */
(() => {
  "use strict";
  const { h, btn } = App.UI;
  const views = { mx: "CLIP MATRIX", ed: "EDIT", dv: "DEVICE", sg: "SIGNAL", fx: "MASTER" };
  let focused = "";
  let dialog = null;

  function focus(id = "") {
    if (id && !Object.hasOwn(views, id)) return;
    focused = id;
    const app = document.getElementById("app");
    if (id) app.dataset.focus = id;
    else delete app.dataset.focus;
    Object.keys(views).forEach(key => {
      const panel = document.getElementById(key);
      panel.hidden = !!id && key !== id;
      const toggle = panel.querySelector(".view-toggle");
      if (toggle) {
        toggle.setAttribute("aria-label", key === id ? "Return to full console" : "Expand " + views[key]);
        toggle.dataset.tip = (key === id ? "BACK TO THE FULL CONSOLE" : "EXPAND " + views[key] + " TO THE WHOLE SCREEN") + " · ESC = FULL CONSOLE";
        toggle.textContent = key === id ? "FULL CONSOLE" : "";
      }
    });
    requestAnimationFrame(() => { App.Mx.draw(); App.Ed.draw(); App.Dv.paint(); App.Sg.resize(); });
  }

  function addToggle(id) {
    const header = document.querySelector("#" + id + " > .hd");
    if (!header || header.querySelector(".view-toggle")) return;
    const active = id === focused, label = active ? "Return to full console" : "Expand " + views[id];
    const button = btn(active ? "FULL CONSOLE" : "", (active ? "BACK TO THE FULL CONSOLE" : "EXPAND " + views[id] + " TO THE WHOLE SCREEN") + " · ESC = FULL CONSOLE", () => focus(focused === id ? "" : id), "view-toggle");
    button.setAttribute("aria-label", label);
    header.append(button);
  }

  /* Nothing on the console scrolls, a dialog included. A list that outgrows its box shows one page of rows;
     the pager under it and the wheel turn the pages, and a row that was just added opens the page it lands on. */
  const LISTS = ".tool-list,.rack-list,.il-cables,.scene-cues,.transcript-scroll";
  const pagers = new WeakMap(), wheeled = new WeakSet();
  const rowsOf = list => {
    const table = list.querySelector(":scope > table");
    // Column labels at the head of a list stay on every page.
    return [...(table ? table.tBodies[0]?.rows || [] : list.children)].filter(r => !r.matches(".rack-labels,.pg"));
  };
  function paginate(root) {
    const memory = (root._pages ||= {});
    root.querySelectorAll(".pg").forEach(p => { if (!p._list?.isConnected) p.remove(); });
    [...root.querySelectorAll(LISTS)].forEach((list, n) => {
      rowsOf(list).forEach(r => r.classList.remove("pg-off"));
      // Rows an editor hides itself are not on any page.
      const rows = rowsOf(list).filter(r => r.getClientRects().length), key = list.className + "#" + n;
      const state = (memory[key] ||= { page: 0, count: rows.length });
      let pager = pagers.get(list);
      const top = r => r.getBoundingClientRect().top, bottom = r => r.getBoundingClientRect().bottom, starts = [0];
      // What the box holds below its first row (a table's heading stays on every page).
      const room = rows.length ? list.getBoundingClientRect().top + list.clientTop + list.clientHeight - top(rows[0]) : 0;
      if (rows.length && bottom(rows[rows.length - 1]) - top(rows[0]) > room + 1) {
        let from = top(rows[0]);
        rows.forEach((r, i) => { if (i > starts[starts.length - 1] && bottom(r) - from > room + 1) { starts.push(i); from = top(r); } });
      }
      const count = starts.length;
      if (rows.length > state.count) state.page = count - 1;
      state.count = rows.length;
      state.page = Math.min(Math.max(0, state.page), count - 1);
      if (count < 2) { if (pager) pager.hidden = true; return; }
      const first = starts[state.page], end = starts[state.page + 1] ?? rows.length;
      rows.forEach((r, i) => r.classList.toggle("pg-off", i < first || i >= end));
      const turn = by => { state.page = Math.min(Math.max(0, state.page + by), count - 1); paginate(root); };
      if (!pager) {
        const label = h("b"), prev = btn("‹", "PREVIOUS ROWS · WHEEL TURNS PAGES", () => pager._turn(-1)), next = btn("›", "NEXT ROWS · WHEEL TURNS PAGES", () => pager._turn(1));
        prev.setAttribute("aria-label", "Previous rows"); next.setAttribute("aria-label", "Next rows");
        pager = Object.assign(h("div.pg", null, prev, label, next), { _list: list, _label: label, _prev: prev, _next: next });
        pagers.set(list, pager);
        list.after(pager);
      }
      if (!wheeled.has(list)) {
        wheeled.add(list);
        list.addEventListener("wheel", e => { const p = pagers.get(list); if (!p || p.hidden) return; e.preventDefault(); p._turn(e.deltaY > 0 ? 1 : -1); }, { passive: false });
      }
      pager._turn = turn;
      pager.hidden = false;
      const text = (first + 1) + "–" + end + " / " + rows.length;
      if (pager._label.textContent !== text) pager._label.textContent = text;
      pager._prev.disabled = state.page === 0; pager._next.disabled = state.page === count - 1;
    });
  }
  // Keep a dialog's pages and its status strip in step with whatever its editor renders into it.
  function attend(node) {
    let queued = false;
    const run = () => {
      queued = false;
      if (!node.isConnected) return;
      // The header belongs to the frame: an editor that replaces everything in its dialog gets it back, named by its heading.
      if (node.head) {
        if (node.head.parentNode !== node) node.prepend(node.head);
        const name = node.querySelector("h2")?.textContent.trim();
        if (name && node.head.firstChild.textContent !== name) node.head.firstChild.textContent = name;
      }
      for (const main of node.querySelectorAll(".confirm-action[data-tip]")) if (!/ENTER$/.test(main.dataset.tip)) main.dataset.tip += " · CTRL/CMD ENTER";
      paginate(node); node.querySelectorAll("select[size]").forEach(reveal); App.UI.fields(node); App.UI.tip();
    };
    const queue = () => { if (!queued) { queued = true; Promise.resolve().then(run); } };
    new MutationObserver(queue).observe(node, { childList: true, subtree: true });
    node._attend = run;
    queue();
  }
  window.addEventListener("resize", () => document.querySelectorAll("dialog.console-dialog[open]").forEach(d => d._attend?.()));
  // A list box keeps its fixed rows too: the wheel steps the selection and the rows follow it.
  const reveal = list => {
    const o = list.options[list.selectedIndex];
    if (!o) return;
    if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop;
    else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight;
  };
  document.addEventListener("wheel", e => {
    const list = e.target.closest?.("dialog.console-dialog select[size]");
    if (!list || list.disabled || !list.options.length) return;
    e.preventDefault();
    const next = Math.min(Math.max(0, (list.selectedIndex < 0 ? 0 : list.selectedIndex) + (e.deltaY > 0 ? 1 : -1)), list.options.length - 1);
    if (next === list.selectedIndex) return;
    list.selectedIndex = next;
    list.dispatchEvent(new Event("change", { bubbles: true }));
    reveal(list);
  }, { passive: false });

  // Every dialog is framed the same way: its name on the left, the way out on the right.
  function frame(node, title) {
    // An editor that works on a draft sets node.dirty to say what closing would lose. The first try to leave says so in
    // the strip; a second one within a few seconds discards. Cancel and the editor's own buttons close at once.
    const leave = () => {
      const lost = node.dirty?.();
      if (lost && !(node._warned && Date.now() - node._warned < 6000)) {
        node._warned = Date.now(); node.dataset.notice = "NOT APPLIED YET: " + lost + " · CLOSE AGAIN TO DISCARD";
        clearTimeout(node._warnT); node._warnT = setTimeout(() => { delete node.dataset.notice; App.UI.tip(); }, 6000);
        App.UI.tip(); return;
      }
      node.close();
    };
    node.leave = leave;
    node.addEventListener("cancel", (e) => { if (node.dirty?.()) { e.preventDefault(); leave(); } });
    const close = btn("×", "CLOSE · ESC", leave, "dlg-x");
    close.setAttribute("aria-label", "Close");
    close.tabIndex = -1; // Esc is the keyboard's way out; opening a dialog must not put the focus on its exit
    node.head = h("header.dlg-hd", null, h("span.tg", { text: title }), h("span.sp"), close);
    node.append(node.head);
    // The action a dialog exists for has the thick frame. Enter runs it unless the focus is in a field or on another
    // button, which have their own use for the key; with Ctrl or Cmd it runs from anywhere.
    node.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return;
      const main = node.querySelector('.confirm-action:not(:disabled):not([aria-disabled="true"])'), t = e.target;
      if (!main || t.closest?.(".mn")) return;
      if (!(e.ctrlKey || e.metaKey) && t.matches?.("input:not([type=checkbox]), textarea, select, button")) return;
      e.preventDefault();
      if (t !== main) t.blur?.(); // a field being typed in commits before the action reads it
      main.click();
    });
    // Opening hands the focus to the first control of the editor, never to the exit.
    const show = node.showModal.bind(node);
    node.tabIndex = -1;
    node.showModal = () => {
      show();
      if (document.activeElement !== close) return;
      (node.querySelector(".dlg-body :is(button, select, input, textarea, canvas[tabindex]):not([disabled], [tabindex='-1'], [type=hidden])") || node).focus({ preventScroll: true });
    };
    return node;
  }

  function begin(title) {
    if (dialog) dialog.close();
    App.UI.closeMenu();
    App.Ed.cancel();
    App.releaseAll();
    const last = document.activeElement;
    const node = frame(h("dialog.console-dialog", { "aria-label": title }), title);
    node.addEventListener("close", () => {
      node.remove();
      if (dialog === node) dialog = null;
      App.UI.tip();
      if (last?.isConnected && last !== document.body && !dialog) last.focus({ preventScroll: true });
    }, { once: true });
    // Only a click that begins and ends on the backdrop closes: a drag out of a field must not throw the draft away.
    let pressed = null;
    node.addEventListener("pointerdown", e => { pressed = e.target; });
    node.addEventListener("click", e => { if (e.target === node && pressed === node) node.leave(); pressed = null; });
    document.body.append(node);
    dialog = node;
    attend(node);
    return node;
  }

  // Return the selected action ID. Escape, backdrop and Cancel all return null.
  function decide({ title, rows = [], actions }) {
    const node = begin(title);
    const content = h("div.dlg-body", null, h("h2", { text: title }));
    const list = h("dl.dlg-facts");
    rows.forEach(([label, value]) => list.append(h("dt", { text: label }), h("dd", { text: value })));
    const cancel = btn("Cancel", "Keep the current project", () => node.close());
    const buttons = h("div.dlg-buttons", null, cancel);
    actions.forEach(action => {
      const button = btn(action.label, action.tip || action.label, () => node.close(action.id), action.primary ? "confirm-action" : "");
      buttons.append(button);
    });
    content.append(list, buttons);
    node.append(content);
    const result = new Promise(resolve => node.addEventListener("close", () => resolve(node.returnValue || null), { once: true }));
    node.showModal();
    cancel.focus();
    return result;
  }

  function init() {
    for (const id of Object.keys(views)) {
      addToggle(id);
      new MutationObserver(() => addToggle(id)).observe(document.getElementById(id), {childList:true});
    }
  }
  App.Workspace = { init, focus, focused: () => focused, begin, decide, attend, frame };
})();
