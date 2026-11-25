/* Workspace views, keyboard command finder and project decisions. */
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
    document.getElementById("view-state").textContent = id ? views[id] + " / BACK" : "ALL PANELS";
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

  function commands() {
    const P = App.P, s = P.sel, mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
    const items = [
      ["Project","Save project",mod+" S",()=>App.file("save"),"json download backup"],
      ["Project","Open project","JSON",()=>App.file("open"),"load restore file"],
      ["Project","Rename project","",()=>App.Top.rename()],
      ["Project","Reset project","",()=>App.file("new"),"clear everything new start over blank factory"],
      ["Project","Restore last reset","",()=>App.file("restore"),"recover previous backup",!App.hasRecovery()],
      ["Project","Export audio","WAV",()=>App.file("wav"),"bounce render stereo"],
      ["Project","Import MIDI","MID",()=>App.file("import-midi"),"load song notes"],
      ["Project","Export MIDI","MID",()=>App.file("mid")],
      ["Edit","Undo",mod+" Z",()=>App.doUndo(-1),"",!App.canUndo()],
      ["Edit","Redo",mod+" Shift Z",()=>App.doUndo(1),"",!App.canRedo()],
      ["Edit","Add pattern to song",App.PATS[s.p],()=>App.songSet(P.chain.length,s.p),"arrange chain"],
      ["Edit","Copy clip to next pattern","",()=>App.clipDo(s.t,s.p,"next"),"duplicate"],
      ["Edit","Clear selected clip","",()=>App.clipDo(s.t,s.p,"clear"),"erase reset notes"],
      ["Edit","Clear selected pattern","",()=>App.patternDo(s.p,"clear"),"erase notes eight tracks"],
      ["Audio","Play / Stop","Space",()=>App.playToggle()],
      ["Audio","Load audio sample","",()=>App.pickFile("audio/*",files=>App.dropFiles(files,{ti:s.t})),"import sampler drum pad wav"],
      ["Audio","Record master to tape","",()=>App.tape(),"live output capture"],
      ["Audio","Connect MIDI","",()=>App.midi(),"keyboard input"],
      ["Audio","Silence all sound","Esc",()=>App.silence(),"panic stop"],
      ["View","Full console","",()=>focus("")],
      ...Object.entries(views).map(([key,name])=>["View","Expand "+name,"",()=>focus(key),"zoom maximize focus"])
    ];
    const node = begin("Commands"), body = h("div.dlg-body.cmd-body");
    const field = h("input.cmd-query", {type:"search", placeholder:"Find a command…", "aria-label":"Find a command", autocomplete:"off"});
    const tabs = h("div.cmd-tabs"), results = h("div.cmd-results"), guide = h("span.cmd-keys");
    const pageSize = 8;
    let group = "Project", index = 0, current = [];

    function changePage(delta) {
      index = Math.max(0, Math.min(current.length - 1, (Math.floor(index / pageSize) + delta) * pageSize));
      render();
      field.focus();
    }
    const previous = btn("Previous", "Previous results", () => changePage(-1));
    const next = btn("Next", "Next results", () => changePage(1));
    const paging = h("div.cmd-pages", null, guide, previous, next);

    function render() {
      const query = field.value.toLowerCase().trim();
      current = items.filter(item => {
        if (!query) return item[0] === group;
        const terms = [item[0], item[1], item[2], item[4]].join(" ").toLowerCase();
        return query.split(/\s+/).every(word => terms.includes(word));
      });
      index = Math.max(0, Math.min(index, current.length - 1));
      for (const tab of tabs.children) tab.setAttribute("aria-pressed", String(!query && tab.textContent === group));
      results.replaceChildren();
      if (!current.length) results.append(h("div.cmd-empty", {text:"No matching commands"}));
      const first = Math.floor(index / pageSize) * pageSize;
      current.slice(first, first + pageSize).forEach((item, i) => {
        const button = h("button.cmd-row", {type:"button", disabled:item[5], "aria-current":first + i === index ? "true" : null},
          h("span", {text:item[1]}), h("small", {text:item[2]}));
        button.onclick = () => run(item);
        results.append(button);
      });
      const hasPages = current.length > pageSize;
      previous.hidden = next.hidden = !hasPages;
      previous.disabled = first === 0;
      next.disabled = first + pageSize >= current.length;
      guide.textContent = hasPages ? (first + 1) + "–" + Math.min(current.length, first + pageSize) + " / " + current.length : "↑ ↓  SELECT     ENTER  RUN     ESC  CLOSE";
    }
    function run(item) {
      if (!item || item[5]) return;
      node.addEventListener("close", () => item[3](), {once:true});
      node.close();
    }
    for (const name of ["Project","Edit","Audio","View"]) {
      tabs.append(btn(name, "Show " + name + " commands", () => {
        field.value = ""; group = name; index = 0; render(); field.focus();
      }));
    }
    field.oninput = () => { index = 0; render(); };
    field.onkeydown = e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (current.length) index = (index + (e.key === "ArrowDown" ? 1 : -1) + current.length) % current.length;
        render();
      } else if (e.key === "Enter") {
        e.preventDefault(); run(current[index]);
      }
    };
    body.append(h("div.cmd-title", null, h("h2", {text:"Commands"}), btn("Close", "Close commands", () => node.close())),
      field, tabs, results, paging);
    node.append(body);
    render(); node.showModal(); field.focus();
  }

  function init() {
    Object.keys(views).forEach(id=>{
      addToggle(id);
      new MutationObserver(()=>addToggle(id)).observe(document.getElementById(id),{childList:true});
    });
    document.getElementById("commands").onclick=commands;
    document.getElementById("view-state").onclick=e=>{
      if(focused){focus("");return;}
      App.UI.menu(e.currentTarget,Object.entries(views).map(([value,label])=>({label,value})),focus);
    };
  }
  App.Workspace={init,focus,focused:()=>focused,commands,decide};
})();
