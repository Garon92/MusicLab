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
      if (last?.isConnected && last !== document.body && !dialog) last.focus({ preventScroll: true });
    }, { once: true });
    node.addEventListener("click", e => { if (e.target === node) node.close(); });
    document.body.append(node);
    dialog = node;
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
  App.Workspace = { init, focus, focused: () => focused, begin, decide };
})();
