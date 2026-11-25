/* Song slots are references. An independent variation gets its own pattern bank. */
(() => {
  "use strict";
  const {h, btn} = App.UI;
  const limit = 32;
  const copy = data => JSON.parse(JSON.stringify(data));
  const slot = n => String(n + 1).padStart(2, "0");

  function setChain(patterns, start) {
    const P = App.P, wasEmpty = !P.chain.length, running = App.Seq.playing && (!!P.song || wasEmpty);
    if (running) App.Seq.stop();
    P.chain = patterns;
    if (!patterns.length || wasEmpty) P.song = Number(!!patterns.length);
    App.Seq.startAt(App.clamp(start, 0, Math.max(0, patterns.length - 1)));
    App.commit(); App.Mx.sync(); App.Top.sync();
    if (running && patterns.length) App.Seq.play();
  }
  function insert(at, p) {
    const chain = App.P.chain.slice();
    if (chain.length >= limit) { App.UI.msg("SONG IS FULL · 32 SLOTS"); return; }
    const start = App.Seq.start(), i = Math.min(at, chain.length);
    chain.splice(i, 0, p);
    setChain(chain, start + (chain.length > 1 && i <= start ? 1 : 0));
  }
  function move(from, to) {
    const chain = App.P.chain.map((p,id) => ({p,id})), start = App.Seq.start();
    if (from === to || !chain[from]) return;
    const [item] = chain.splice(from, 1);
    chain.splice(Math.min(to, chain.length), 0, item);
    setChain(chain.map(s => s.p), chain.findIndex(s => s.id === start));
  }

  function open() {
    const node = App.Workspace.begin("Song arrangement"), P = App.P;
    const draft = P.chain.map(p => ({p}));
    const head = App.clamp(App.Seq.start(),0,Math.max(0,draft.length-1));
    const originalStart = draft[head];
    const forks = new Map();
    let first = head, last = first, anchor = first;
    const content = h("div.dlg-body.song-editor"), grid = h("div.song-slots", {role:"group", "aria-label":"Song slots"});
    const summary = h("output.arr-summary"), selected = h("span.arr-selection");
    const help = h("span.arr-hint",{text:"Shift-click two slots to select a range"});
    const gap = h("select", {"aria-label":"Insert position"},
      h("option", {value:"after", text:"After selection"}), h("option", {value:"before", text:"Before selection"}));
    const bank = h("div.arr-bank", {role:"group", "aria-label":"Insert pattern"});
    const reps = h("input", {type:"number", min:1, max:31, step:1, value:1, "aria-label":"Additional copies"});
    const group = (...items) => h("div.arr-row", null, ...items);
    const select = (from, to = from) => { first = from; last = to; anchor = from; };
    const length = () => draft.length ? last - first + 1 : 0;
    const origin = p => forks.get(p) ?? p;
    function freePattern() {
      return P.pats.findIndex((pat,i) => pat.bars === 1 && !P.chain.includes(i) && !draft.some(s => s.p === i) &&
        !P.tracks.some(t => t.clips[i].length || Object.keys(t.automation[i]).length));
    }
    const repeat = btn("Repeat range", "Insert copies immediately after the selected slots", () => {
      if (repeat.disabled) return;
      const span = draft.slice(first,last+1), extra = [];
      for (let r=0; r<reps.valueAsNumber; r++) for (const item of span) extra.push({p:item.p});
      const at = last+1;
      draft.splice(at,0,...extra); select(at,at+extra.length-1); render();
    });
    function shift(by) {
      const count = length(), at = first + by;
      if (!count || at < 0 || at + count > draft.length) return;
      const moved = draft.splice(first,count);
      draft.splice(at,0,...moved); select(at,at+count-1); render();
    }
    const left = btn("Earlier", "Move the selected range one slot earlier", () => shift(-1));
    const right = btn("Later", "Move the selected range one slot later", () => shift(1));
    const remove = btn("Remove", "Remove these references from the song", () => {
      draft.splice(first,length()); select(Math.max(0, Math.min(first,draft.length-1))); render();
    });
    const unique = btn("Make variation", "Copy this slot's notes and automation to a free pattern", () => {
      const free = freePattern();
      if (free < 0 || length() !== 1) return;
      forks.set(free,origin(draft[first].p)); draft[first].p = free; render();
    });
    const apply = btn("Apply arrangement", "Apply all song edits in one undo step", () => {
      if (App.P !== P) { node.close(); return; }
      const chain = draft.map(s => s.p);
      for (const [to,from] of forks) if (chain.includes(to)) {
        P.pats[to] = copy(P.pats[from]);
        for (const t of P.tracks) { t.clips[to] = copy(t.clips[from]); t.automation[to] = copy(t.automation[from]); }
      }
      const start = draft.indexOf(originalStart);
      setChain(chain, start >= 0 ? start : first);
      const focused = draft[first]?.p;
      if (focused != null) App.select(P.sel.t, focused);
      App.Ed.sync();
      node.close();
    }, "confirm-action");
    function render() {
      grid.replaceChildren();
      help.hidden = draft.length < 2;
      draft.forEach((item,i) => {
        const b = btn("", "Click to select · Shift-click to select a range", e => {
          if (e.shiftKey) { first = Math.min(anchor,i); last = Math.max(anchor,i); }
          else select(i);
          render(); grid.children[i].focus({preventScroll:true});
        });
        b.className = "bt arr-slot";
        b.setAttribute("aria-label", "Slot " + slot(i) + ", pattern " + App.PATS[item.p]);
        b.setAttribute("aria-pressed", String(i >= first && i <= last));
        b.append(h("small", {text:slot(i)}),h("b", {text:App.PATS[item.p]}));
        grid.append(b);
      });
      if (!draft.length) grid.append(h("span.arr-empty",{text:"Empty song · choose a pattern below"}));
      const bars = draft.reduce((sum,item) => sum + App.patSteps(P, origin(item.p)) / App.spb(P),0);
      const seconds = Math.round(bars * App.spb(P) * 15 / P.bpm);
      summary.textContent = draft.length+" / "+limit+" slots · "+bars+" bars · "+Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
      selected.textContent = !length() ? "No slots" : "Slot " + slot(first) + (last === first ? "" : "–"+slot(last));
      left.disabled = !length() || first === 0;
      right.disabled = !length() || last === draft.length-1;
      remove.disabled = !length();
      const copies = reps.valueAsNumber;
      repeat.disabled = !length() || !Number.isInteger(copies) || copies < 1 || draft.length + copies*length() > limit;
      unique.disabled = length() !== 1 || freePattern() < 0;
      unique.title = unique.disabled ? "Select one slot and leave a pattern bank free" : "Allocate an independent pattern";
      for (const b of bank.children) b.disabled = draft.length >= limit;
      apply.disabled = draft.length === P.chain.length && draft.every((s,i) => s.p === P.chain[i]);
    }
    for (const [i,letter] of Array.from(App.PATS).entries()) {
      bank.append(btn(letter, "Insert pattern " + letter, () => {
        if (draft.length >= limit) return;
        const at = draft.length ? (gap.value === "before" ? first : last+1) : 0;
        draft.splice(at,0,{p:i}); select(at); render();
      }));
    }
    reps.oninput = render;
    content.append(h("h2",{text:"Song arrangement"}),summary,grid,help,
      group(h("span",{text:"Insert"}),gap,bank),
      group(selected,left,right,remove,unique),
      group(h("label",null,"Copies ",reps),repeat),
      h("div.dlg-buttons",null,btn("Cancel","Discard song edits",()=>node.close()),apply));
    node.classList.add("arr-dialog"); node.append(content); render(); node.showModal();
  }
  App.Song = { open, insert, move };
})();
