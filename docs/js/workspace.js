/* Expandable panels and shared, keyboard-accessible dialogs. */
(() => {
  "use strict";
  const { h, btn } = App.UI;
  const views = { mx: "Clip matrix", ed: "Note editor", dv: "Instrument", sg: "Signal analysis", fx: "Master effects" };
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
        toggle.title = toggle.getAttribute("aria-label");
        toggle.textContent = key === id ? "FULL CONSOLE" : "⛶";
      }
    });
    requestAnimationFrame(() => { App.Mx.draw(); App.Ed.draw(); App.Dv.paint(); App.Sg.resize(); });
  }

  function addToggle(id) {
    const header = document.querySelector("#" + id + " > .hd");
    if (!header || header.querySelector(".view-toggle")) return;
    const active = id === focused, label = active ? "Return to full console" : "Expand " + views[id];
    const button = btn(active ? "FULL CONSOLE" : "⛶", label + " · ESC = FULL CONSOLE", () => focus(focused === id ? "" : id), "view-toggle");
    button.setAttribute("aria-label", label);
    button.title = label;
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
    const run = () => { queued = false; if (!node.isConnected) return; paginate(node); node.querySelectorAll("select[size]").forEach(reveal); App.UI.tip(); };
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

  function begin(title) {
    if (dialog) dialog.close();
    App.UI.closeMenu();
    App.Ed.cancel();
    App.releaseAll();
    const last = document.activeElement;
    const node = h("dialog.console-dialog", { "aria-label": title });
    node.addEventListener("close", () => {
      node.remove();
      if (dialog === node) dialog = null;
      App.UI.tip();
      if (last?.isConnected && last !== document.body && !dialog) last.focus({ preventScroll: true });
    }, { once: true });
    node.addEventListener("click", e => { if (e.target === node) node.close(); });
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
  App.Workspace = { init, focus, focused: () => focused, begin, decide, attend };
})();
