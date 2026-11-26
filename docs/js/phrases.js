/* Arrange notes and automation together, in bar-sized musical sections. */
(() => {
  "use strict";
  const { h, btn } = App.UI;
  const operations = {
    tile:"Repeat a range", insert:"Insert / append from source", overlay:"Overlay from source",
    replace:"Replace with source", stretch:"Stretch / compress time", resize:"Set pattern length"
  };
  const external = op => ["insert", "overlay", "replace"].includes(op);
  const sortNotes = (a, b) => a.s - b.s || a.n - b.n;

  // A piece maps an interval of an original clip into an output interval.
  // Coordinates stay in sixteenths until the final grid quantization.
  function piece(source, from, to, at, scale = 1) {
    return {source, from, to, at, scale};
  }
  const mapStep = (p, step) => Math.round(p.at + (step - p.from) * p.scale);
  function readNotes(p, stats) {
    const result = [];
    for (const n of p.source.notes) {
      if (n.s >= p.to || n.s + n.l <= p.from) continue;
      const start = Math.max(n.s, p.from), end = Math.min(n.s + n.l, p.to);
      if (start !== n.s || end !== n.s + n.l) stats.cut++;
      const s = Math.min(mapStep(p, start), mapStep(p, p.to) - 1);
      const until = Math.max(s + 1, mapStep(p, end));
      if (p.scale !== 1 && (!Number.isInteger((start-p.from)*p.scale) || !Number.isInteger((end-p.from)*p.scale))) stats.rounded++;
      const out={...n,s,l:until-s};
      if (n.off && start!==n.s) delete out.off;
      else if (n.off && p.scale!==1) {
        const timed=p.at+(start+n.off-p.from)*p.scale;
        out.s=App.clamp(Math.round(timed),Math.round(p.at),mapStep(p,p.to)-1);
        out.off=App.clamp(timed-out.s,-.49,.49);
        out.l=Math.max(1,until-out.s);
        if (!out.off) delete out.off;
      }
      result.push(out);
    }
    return result;
  }

  // Boundary points carry both the arriving value and the next outgoing value.
  // This preserves an instantaneous jump when two ramps are joined end to start.
  function readCurve(pieces, key, base, stats) {
    const active = pieces.find(p => p.source.curves[key]?.points.length);
    if (!active) return null;
    const mode = active.source.curves[key].mode, points = new Map();
    for (const p of pieces) {
      const lane = p.source.curves[key];
      const knots = [p.from, ...(lane?.points || []).filter(pt => pt.s > p.from && pt.s < p.to).map(pt => pt.s), p.to];
      for (const step of knots) {
        if (!Number.isInteger((step - p.from) * p.scale)) stats.rounded++;
        const s = mapStep(p, step), old = points.get(s);
        const v = App.curveValue(lane, step, base);
        const incoming = old ? old.in ?? old.v : App.curveValue(lane, step, base, "left");
        const shape = App.curveShape(lane, step);
        const pt = {s,v};
        if (Math.abs(incoming - v) > 1e-8) pt.in = incoming;
        if (shape !== mode) pt.shape = shape;
        points.set(s, pt);
      }
    }
    return {mode, points:[...points.values()]};
  }

  function timeline(P, ti, pi) {
    const T = P.tracks[ti];
    return {notes:T.clips[pi], curves:T.automation?.[pi] || {}};
  }
  function makePlan(P, opt) {
    const {t, p} = P.sel;
    const op = opt.op, scope = opt.scope;
    const unit = App.spb(P), current = App.patSteps(P,p), limit = App.maxBars(P);
    const originPattern = external(op) ? opt.pattern : p;
    const sourceSteps = App.patSteps(P,originPattern);
    const offset = (opt.from - 1) * unit, length = opt.bars * unit, at = (opt.at - 1) * unit;
    if (!operations[op] || !["clip","pattern"].includes(scope)) throw Error("Choose a scope and operation.");
    if (op === "resize" && scope !== "pattern") throw Error("Pattern length applies to all tracks.");
    if ((external(op) || op === "tile") && (offset < 0 || length < unit || offset + length > sourceSteps))
      throw Error("Source range exceeds the " + sourceSteps / unit + " available bars.");
    if (op === "tile" && (!Number.isInteger(opt.copies) || opt.copies < 2)) throw Error("Choose at least two copies.");
    if (op === "insert" && at > current) throw Error("Choose an insertion point within the pattern or directly after it.");
    const wanted = op === "tile" ? Math.max(current, offset + opt.copies * length) :
      op === "insert" ? current + length : op === "overlay" ? Math.max(current, at + length) :
      op === "replace" ? length : opt.size * unit;
    if (wanted < unit || wanted > limit * unit || !Number.isInteger(wanted))
      throw Error("This would make " + (wanted / unit) + " bars. This meter supports up to " + limit + ".");
    const total = scope === "clip" ? Math.max(current, wanted) : wanted;
    const tracks = scope === "clip" ? [t] : P.tracks.map((_, i) => i);
    const result = [], stats = {before:0, after:0, cut:0, rounded:0, collision:0, covered:0, beforeCurves:0, curves:0, hidden:0, discardedPoints:0};
    for (const ti of tracks) {
      const dest = timeline(P,ti,p);
      const source = external(op) ? timeline(P,scope === "clip" ? opt.track : ti,originPattern) : dest;
      const empty = {notes:[],curves:{}};
      const pieces = [];
      const add = (ref, from, to, start, scale = 1) => { if (to > from) pieces.push(piece(ref, from, to, start, scale)); };
      let layer;
      if (op === "insert") {
        add(dest,0,at,0); add(source,offset,offset+length,at); add(dest,at,current,at+length);
      } else if (op === "tile") {
        add(dest,0,offset,0);
        for (let i=0;i<opt.copies;i++) add(dest,offset,offset+length,offset+i*length);
        const end = offset + length*opt.copies;
        add(dest,end,current,end);
        stats.covered += dest.notes.filter(n => n.s >= offset+length && n.s < end).length;
      } else if (op === "overlay") {
        add(dest,0,Math.min(current,at),0);
        if (at > current) add(dest,current,at,current);
        add(source,offset,offset+length,at);
        add(dest,at+length,total,at+length);
        layer = piece(source,offset,offset+length,at);
      } else if (op === "replace") {
        add(source,offset,offset+length,0);
        add(empty,0,total-length,length);
        stats.covered += dest.notes.length;
      } else if (op === "stretch") {
        add(dest,0,current,0,wanted/current); add(empty,0,total-wanted,wanted);
      } else {
        add(dest,0,Math.min(current,total),0);
        // Extension preserves the last control position and exposes previously hidden material.
        if (total > current) { pieces.length = 0; add(dest,0,total,0); }
        if (total < current) stats.covered += dest.notes.filter(n => n.s >= total && n.s < current).length;
      }

      let notes;
      if (layer) {
        const added = readNotes(layer,stats), existing = readNotes(piece(dest,0,current,0),stats);
        const index = new Set((opt.priority === "target" ? existing : added).map(n=>n.s + "/" + n.n));
        const filtered = (opt.priority === "target" ? added : existing).filter(n => !index.has(n.s + "/" + n.n));
        stats.collision += (opt.priority === "target" ? added : existing).length - filtered.length;
        notes = filtered.concat(opt.priority === "target" ? existing : added);
      } else notes = pieces.flatMap(seg=>readNotes(seg,stats));
      if (notes.length > 4000) throw Error("Track " + (ti + 1) + " would exceed 4,000 notes. Use a shorter range.");
      const curves = {};
      for (const key of App.automationKeys) {
        // For layering, resolve automation separately from note collisions: only
        // lanes present in the source take over, and only in the source interval.
        const targetWins = opt.priority === "target" && dest.curves[key];
        const segments = layer && (!source.curves[key] || targetWins) ? [piece(dest,0,total,0)] : pieces;
        const lane = readCurve(segments,key,App.curveBase(P.tracks[ti],key,P),stats);
        if (lane) curves[key] = lane;
      }
      if (op !== "resize" || total <= current) stats.hidden += dest.notes.filter(n=>n.s >= current).length;
      if (op === "resize" && total < current) {
        for (const lane of Object.values(dest.curves)) stats.discardedPoints += lane.points.filter(pt=>pt.s > total).length;
      }
      stats.before += dest.notes.length;
      stats.after += notes.length;
      stats.beforeCurves += Object.keys(dest.curves).length;
      stats.curves += Object.keys(curves).length;
      result.push({ti, notes:notes.sort(sortNotes), curves});
    }
    const revealed = scope === "clip" && total > current ? P.tracks.reduce((count, T, ti) =>
      count + (ti === t ? 0 : T.clips[p].filter(n => n.s >= current && n.s < total).length),0) : 0;
    return {p, bars:total/unit, currentBars:current/unit, total, tracks:result, stats, revealed};
  }

  const fields = {
    scope:"Scope", op:"Operation", track:"Source track", pattern:"Source pattern", from:"From bar",
    bars:"Source bars", copies:"Total copies", at:"Place at bar", size:"Result bars", priority:"On conflict"
  };
  const choices = (values) => values.map(value => [String(value), String(value)]);
  const sequence = (a, z) => choices(Array.from({length:z-a+1},(_,i)=>a+i));
  function open(scope = "clip", initial = {}) {
    const P = App.P, { t, p } = P.sel, limit = App.maxBars(P), current = App.patSteps(P,p)/App.spb(P);
    const dialog = App.Workspace.begin("Phrase");
    dialog.classList.add("phrase-dialog");
    const body = h("div.dlg-body"), grid = h("div.ph-fields"), preview = h("div.ph-preview",{role:"status"});
    const controls = {};
    for (const [key,name] of Object.entries(fields)) {
      const field = h("select", {"aria-label": name});
      controls[key] = field;
      grid.append(h("label", null, h("span",{text:name}),field));
    }
    const options = (key, entries, chosen) => {
      const field = controls[key];
      field.replaceChildren(...entries.map(([value, label])=>h("option",{value,text:label})));
      field.value = String(chosen);
      if (field.selectedIndex < 0) field.selectedIndex = 0;
    };
    options("scope", [["clip","Clip · selected track"],["pattern","Pattern · all tracks"]], scope);
    options("op",Object.entries(operations),initial.op || "tile");
    options("track",P.tracks.map((T,i)=>[i,App.pad2(i+1)+" "+T.name]),initial.track ?? t);
    options("pattern",Array.from(App.PATS,(name,i)=>[i,"Pattern "+name]),initial.pattern ?? (p+1)%P.pats.length);
    for (const key of ["from","bars","size"]) options(key,sequence(1,limit),key === "size" ? current : 1);
    options("at",sequence(1,limit+1),current+1);
    options("copies",sequence(2,Math.max(2,limit)),2);
    options("priority",[["source","Use source"],["target","Keep target"]],"source");
    if (external(controls.op.value)) {
      controls.bars.value = String(App.patSteps(P,Number(controls.pattern.value))/App.spb(P));
      controls.at.value = controls.op.value === "insert" ? String(current + 1) : "1";
    }

    const title = h("h2", {text:"Phrase"});
    const target = h("span.ph-target");
    const apply = btn("Apply","Apply this phrase edit as one undo step",applyPlan,"confirm-action");
    const cancel = btn("Cancel","Keep the arrangement",()=>dialog.close());
    body.append(h("div.ph-title",null,title,target), grid, preview, h("div.dlg-buttons",null,cancel,apply));
    dialog.append(body);
    function read() {
      const out = {};
      for (const [key,el] of Object.entries(controls)) out[key] = ["scope","op","priority"].includes(key) ? el.value : Number(el.value);
      return out;
    }
    function updateOptions() {
      const o = read();
      const pattern = external(o.op) ? o.pattern : p;
      const span = App.patSteps(P,pattern)/App.spb(P);
      options("from",sequence(1,span),Math.min(o.from,span));
      options("bars",sequence(1,span - Number(controls.from.value) + 1),Math.min(o.bars,span - Number(controls.from.value) + 1));
      if (o.op === "resize" && o.scope === "clip") controls.op.value = "stretch";
      const active = read(), show = {scope:true, op:true,
        pattern:external(active.op), track:external(active.op) && active.scope === "clip",
        from:external(active.op) || active.op === "tile", bars:external(active.op) || active.op === "tile",
        copies:active.op === "tile", at:["overlay","insert"].includes(active.op),
        size:["resize","stretch"].includes(active.op), priority:active.op === "overlay"};
      for (const [key,el] of Object.entries(controls)) el.parentElement.hidden = !show[key];
      target.textContent = active.scope === "clip" ? App.pad2(t+1)+" "+P.tracks[t].name+" / "+App.PATS[p] : "PATTERN "+App.PATS[p]+" / ALL TRACKS";
      try {
        const plan = makePlan(P,active), s = plan.stats;
        const lines = [plan.currentBars+" › "+plan.bars+" bars   ·   "+s.before+" › "+s.after+" notes   ·   "+s.beforeCurves+" › "+s.curves+" automation lanes"];
        if (s.covered) lines.push(s.covered+" existing note onsets replaced in the target range.");
        if (s.collision) lines.push(s.collision+" same-pitch, same-step collisions resolved.");
        if (s.cut) lines.push("Notes crossing a range edge are cut there.");
        if (s.rounded) lines.push("Stretched note or curve positions snap to sixteenths.");
        if (s.discardedPoints) lines.push(s.discardedPoints+" automation points beyond the end removed.");
        if (s.hidden) lines.push(s.hidden+" off-grid target notes outside the source timeline removed.");
        if (plan.revealed) lines.push(plan.revealed+" existing off-grid notes on other tracks become audible.");
        if (active.scope === "clip" && plan.bars !== plan.currentBars) lines.push("Pattern length changes for all tracks.");
        if (active.scope === "clip" && active.op === "stretch" && active.size < current) lines.push("The remaining bars stay empty on this track.");
        if (active.op === "overlay") lines.push("Conflict priority also applies to overlapping automation lanes.");
        if (active.scope === "clip" && external(active.op) && active.track !== t) {
          const T = P.tracks[t], pads = T.kind === "kit" ? 8 : T.kind === "smp" && T.smp.mode === 1 ? T.smp.slices : 0;
          const outside = pads ? plan.tracks[0].notes.filter(n => n.n < 36 || n.n >= 36 + pads).length : 0;
          if (outside) lines.push(outside + " result notes fall outside the target's playable pad range.");
          else if (T.kind !== P.tracks[active.track].kind) lines.push("Source MIDI pitches play on the target instrument.");
        }
        const sameLength = ["stretch","resize"].includes(active.op) && active.size === current;
        if (sameLength) lines.push("Choose a different result length.");
        preview.textContent = lines.join("\n"); apply.disabled = sameLength;
      } catch (e) { preview.textContent = e.message; apply.disabled = true; }
    }
    function applyPlan() {
      if (P !== App.P || t !== P.sel.t || p !== P.sel.p) { dialog.close(); return; }
      const chosen = read();
      let plan;
      try { plan = makePlan(P,chosen); } catch { updateOptions(); return; }
      for (const row of plan.tracks) {
        const T = P.tracks[row.ti];
        T.clips[plan.p] = row.notes;
        T.automation[plan.p] = row.curves;
        // The plan lays a clip out on the pattern's length. A clip that loops at a length of its own follows the edit:
        // a stretch scales that loop, a new pattern length keeps it while it still fits, and any other edit puts the
        // clip on the pattern, so what the preview counts is what the editor shows and the transport plays.
        const loops = P.performance.loops[row.ti], own = loops[plan.p];
        if (own) {
          const next = chosen.op === "stretch" ? Math.max(1,Math.round(own * chosen.size / plan.currentBars)) : chosen.op === "resize" ? own : 0;
          loops[plan.p] = next < plan.total ? next : 0;
        }
      }
      P.pats[plan.p].bars = plan.bars;
      App.commit(); App.refresh(); dialog.close();
      App.UI.msg("PHRASE APPLIED · PATTERN " + App.PATS[p] + " · " + plan.bars + " BAR" + (plan.bars === 1 ? "" : "S"));
    }
    grid.addEventListener("change", e => {
      const o = read();
      if (e.target === controls.op || e.target === controls.pattern) {
        if (o.op === "resize") controls.scope.value = "pattern";
        if (o.op === "resize" || o.op === "stretch") controls.size.value = String(current < limit ? Math.min(current * 2, limit) : Math.max(1, Math.floor(current/2)));
        const span = App.patSteps(P,external(o.op) ? o.pattern : p)/App.spb(P);
        options("from",sequence(1,span),1);
        options("bars",sequence(1,span),external(o.op) ? span : 1);
        controls.at.value = String(o.op === "insert" ? current + 1 : 1);
      }
      updateOptions();
    });
    updateOptions(); dialog.showModal(); controls.op.focus();
  }
  App.Phrases = {open};
})();
