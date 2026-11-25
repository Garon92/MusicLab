/* Clip automation editor. The plot and the scheduler use the same interpolation. */
(() => {
  "use strict";
  const { UI, clamp, curveBase, curveValue } = App, { h, btn } = UI;
  const names = {vol:"Level", pan:"Pan", filter:"Low-pass", dly:"Delay send", rev:"Reverb send", cutoff:"Voice cutoff", macro1:"Macro 1", macro2:"Macro 2", macro3:"Macro 3", macro4:"Macro 4"};
  const nameOf = k => k.startsWith("macro") ? (App.Rack.macroLabel?.(App.P.sel.t,Number(k.slice(5))-1) || names[k]) : names[k];
  let host, panel, graph, target, modeButton, deleteButton, readout, playhead;
  let key = "vol", defaultMode = "linear", active = false, selected = -1, lastBank, gesture;
  let geometry = null;
  const settings = {shape:"rise", low:0, high:100, cycles:1};
  const track = () => App.P.tracks[App.P.sel.t];
  const bank = () => track().automation[App.P.sel.p];
  const lane = () => bank()[key];
  const range = () => App.Ed.range?.() || {start:0, end:App.Live.length(App.P,App.P.sel.t,App.P.sel.p)};

  function valueText(v) {
    if (key === "cutoff") return App.fHz(App.fromN(App.DEF.syn.cut,v)) + " HZ";
    if (key === "filter") return v >= 1 ? "OPEN" : App.fHz(20 * ((App.E?.ctx.sampleRate || 48000) / 40) ** v) + " HZ";
    if (key === "vol") return App.fDb(v * v) + " dB";
    if (key === "pan") return App.fmt(App.DEF.trk.pan, 2 * v - 1);
    return Math.round(v * 100) + "%";
  }
  function stepText(s) {
    const bar = App.spb(App.P), beat = App.beatSteps(App.P);
    return (Math.floor(s / bar) + 1) + "." + (Math.floor((s % bar) / beat) + 1) + "." + (s % beat + 1);
  }
  function commit() { App.commit(); App.Mx.sync(); sync(); }
  function draw() {
    if (!active || !graph.clientWidth || !graph.clientHeight) return;
    const d = UI.fit(graph), ctx = graph.getContext("2d"), w = graph.clientWidth, height = graph.clientHeight;
    const {start, end} = range(), left = Math.min(63, Math.max(43, 5.2 * App.rem)), right = w - 7, top = 10, bottom = height - 18;
    if (end <= start || right <= left || bottom <= top) return;
    const x = s => left + (right - left) * (s - start) / (end - start);
    const y = v => bottom - (bottom - top) * v;
    geometry = {start, end, top, bottom, left, right, x, y};
    const line = (x1,y1,x2,y2,color) => {
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    };
    const curve = lane(), base = curveBase(track(), key), c = App.C;
    ctx.setTransform(d,0,0,d,0,0);
    ctx.fillStyle = c.pn; ctx.fillRect(0,0,w,height);
    ctx.font = Math.max(9, Math.round(App.rem)) + "px " + App.FONT;
    ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of [0, .25, .5, .75, 1]) {
      line(left,y(v),right,y(v), v === .5 ? c.ln2 : c.ln);
      if (height > 110 || v % .5 === 0) { ctx.fillStyle = c.t3; ctx.fillText(valueText(v),left-6,y(v)); }
    }
    const bar = App.spb(App.P), beat = App.beatSteps(App.P);
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    for (let s = start; s <= end; s++) {
      const full = s % bar === 0, strong = s % beat === 0;
      if (!strong && (right-left)/(end-start) < 6) continue;
      line(x(s),top,x(s),bottom,full ? c.ln3 : strong ? c.ln2 : c.ln);
      if (full && s < end) { ctx.fillStyle = c.t3; ctx.fillText("BAR " + (s / bar + 1),x(s)+3,height-1); }
    }
    line(left,y(base),right,y(base),c.ln3);
    ctx.strokeStyle = curve ? c.t1 : c.t3; ctx.lineWidth = curve ? 1.8 : 1;
    ctx.setLineDash(curve ? [] : [4,4]); ctx.beginPath();
    ctx.moveTo(x(start),y(curveValue(curve,start,base)));
    const visible = (curve?.points || []).filter(p => p.s >= start && p.s <= end);
    for (const p of visible) {
      if (p.s > start) ctx.lineTo(x(p.s),y(curveValue(curve,p.s,base,"left")));
      ctx.lineTo(x(p.s),y(p.v));
    }
    ctx.lineTo(x(end),y(curveValue(curve,end,base))); ctx.stroke(); ctx.setLineDash([]);
    for (const p of visible) {
      const size = selected === p.s ? 7 : 5;
      ctx.fillStyle = selected === p.s ? c.am : c.t1;
      ctx.fillRect(x(p.s)-size/2,y(p.v)-size/2,size,size);
    }
  }
  function sync() {
    if (!host || !active) return;
    if (bank() !== lastBank) {
      if (gesture) cancel();
      selected = -1; lastBank = bank();
    }
    const curve = lane(), pt = curve?.points.find(p => p.s === selected);
    if (!pt) selected = -1;
    const q = range();
    if (selected < q.start || selected > q.end) selected = -1;
    const mixed = curve?.points.some(p => p.shape && p.shape !== curve.mode);
    target.textContent = nameOf(key) + " ▾"; modeButton.textContent = (mixed ? "Mixed" : curve?.mode || defaultMode) + " ▾";
    deleteButton.disabled = selected < 0;
    readout.textContent = selected >= 0 ? stepText(selected) + "  " + valueText(pt.v)
      : curve ? curve.points.length + (curve.points.length === 1 ? " POINT" : " POINTS") : "STATIC  " + valueText(curveBase(track(),key));
    draw();
  }

  function fromPointer(e) {
    const g = geometry, rect = graph.getBoundingClientRect();
    const x = (e.clientX - rect.left) * graph.clientWidth / rect.width, y = (e.clientY - rect.top) * graph.clientHeight / rect.height;
    return {x, y, s:clamp(Math.round(g.start + (x - g.left) / (g.right - g.left) * (g.end - g.start)), g.start, g.end),
      v:clamp(Math.round((g.bottom - y) / (g.bottom - g.top) * 1000) / 1000, 0, 1)};
  }
  function closest(at) {
    let best = 9, hit;
    for (const p of lane()?.points || []) {
      if (p.s < geometry.start || p.s > geometry.end) continue;
      const distance = Math.hypot(geometry.x(p.s)-at.x, geometry.y(p.v)-at.y);
      if (distance <= best) { best = distance; hit = p; }
    }
    return hit;
  }
  function removePoint(s) {
    const c = lane();
    if (!c) return;
    c.points = c.points.filter(p => p.s !== s);
    if (!c.points.length) delete bank()[key];
    selected = -1; commit();
  }
  function putPoint(s,v) {
    const c = lane() || (bank()[key] = {mode:defaultMode,points:[]});
    let pt = c.points.find(p => p.s === s);
    if (pt) { pt.v = v; delete pt.in; }
    else { pt = {s,v}; c.points.push(pt); c.points.sort((a,b) => a.s - b.s); }
    selected = s;
    return pt;
  }
  function movePoint(pt,s,v) {
    const points = lane().points, index = points.indexOf(pt), g = geometry;
    const min = Math.max(g.start,(points[index-1]?.s ?? -1)+1), max = Math.min(g.end,(points[index+1]?.s ?? g.end+1)-1);
    pt.s = clamp(s,min,max); pt.v = clamp(Math.round(v*1000)/1000,0,1); delete pt.in;
    selected = pt.s;
  }
  function down(e) {
    if (!geometry || gesture || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault(); graph.focus({preventScroll:true});
    const at = fromPointer(e), hit = closest(at);
    if (e.button === 2) { if (hit) removePoint(hit.s); return; }
    if (!hit && (at.x < geometry.left-5 || at.y > geometry.bottom+5)) return;
    const original = lane() ? structuredClone(lane()) : null;
    const pt = hit || putPoint(at.s,at.v);
    selected = pt.s;
    gesture = {bank:bank(), key, original, pt, id:e.pointerId, x:at.x, y:at.y};
    graph.setPointerCapture(e.pointerId); sync();
  }
  function move(e) {
    if (!geometry) return;
    const at = fromPointer(e);
    if (gesture && e.pointerId === gesture.id && Math.abs(gesture.x-at.x)+Math.abs(gesture.y-at.y)>2) {
      movePoint(gesture.pt,at.s,at.v); sync();
    }
    UI.hint(nameOf(key).toUpperCase() + "   " + stepText(at.s) + "   " + valueText(at.v) +
      "    CLICK = ADD · DRAG = MOVE · RIGHT-CLICK = DELETE");
  }
  function finish(e) {
    if (!gesture || e.pointerId !== gesture.id) return;
    gesture = null; commit();
  }
  function cancel() {
    if (!gesture) return;
    const g = gesture; gesture = null;
    if (g.original) g.bank[g.key] = g.original; else delete g.bank[g.key];
    if (graph.hasPointerCapture(g.id)) graph.releasePointerCapture(g.id);
    selected = -1; sync();
  }
  function keyboard(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !geometry) return;
    const c = lane(), pts = (c?.points || []).filter(p => p.s >= geometry.start && p.s <= geometry.end);
    const p = pts.find(p => p.s === selected);
    if (e.key === "Escape" && gesture) cancel();
    else if (e.key === "Delete" || e.key === "Backspace") { if (p) removePoint(p.s); }
    else if (e.key === "Home" || e.key === "End" || e.key === "[" || e.key === "]") {
      const i = e.key === "Home" ? 0 : e.key === "End" ? pts.length - 1 : clamp(pts.indexOf(p)+(e.key === "]" ? 1 : -1),0,pts.length-1);
      selected = pts[i]?.s ?? -1; sync();
    } else if (e.key === "Enter") {
      const s = p ? Math.min(geometry.end, p.s+1) : geometry.start;
      putPoint(s,curveValue(c,s,curveBase(track(),key))); commit();
    } else if (e.key.startsWith("Arrow")) {
      if (!p) { selected = pts[0]?.s ?? -1; sync(); }
      else {
        const ds = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dv = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
        movePoint(p,p.s + ds * (e.shiftKey ? App.beatSteps(App.P) : 1),p.v + dv * (e.shiftKey ? .1 : .01)); commit();
      }
    } else return;
    e.preventDefault(); e.stopPropagation();
  }

  function generator(anchor) {
    const form = h("form.auto-generator", {"aria-label":"Generate automation curve"});
    const shape = h("select", {"aria-label":"Curve shape"});
    for (const [id, label] of [["rise","Rise"],["fall","Fall"],["triangle","Triangle"],["sine","Sine"],["pulse","Pulse"]])
      shape.append(h("option", {value:id,text:label}));
    shape.value = settings.shape;
    const number = (name,value,min,max) => h("input", {type:"number", "aria-label":name, value, min, max, step:1, required:true});
    const low = number("Minimum percent",settings.low,0,100), high = number("Maximum percent",settings.high,0,100);
    const steps = App.Live.length(App.P,App.P.sel.t,App.P.sel.p), maxCycles = Math.max(1,Math.min(16,Math.floor(steps/2)));
    if(steps===1){
      for(const option of shape.options)option.disabled=!["rise","fall"].includes(option.value);
      if(shape.selectedOptions[0]?.disabled)shape.value="rise";
    }
    const cycles = number("Cycles",Math.min(settings.cycles,maxCycles),1,maxCycles);
    const field = (label, input) => h("label", null, h("span",{text:label}),input);
    form.append(field("Shape",shape),field("Low %",low),field("High %",high),field("Cycles",cycles),
      h("button.bt", {type:"submit",text:"Write whole lane", tip:"REPLACE THIS PARAMETER CURVE THROUGHOUT THE CURRENT CLIP · UNDO AVAILABLE"}));
    form.onsubmit = e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (+low.value > +high.value) { low.setCustomValidity("Minimum must be less than or equal to maximum"); low.reportValidity(); low.setCustomValidity(""); return; }
      Object.assign(settings,{shape:shape.value,low:+low.value,high:+high.value,cycles:+cycles.value});
      const points = [], linear = shape.value !== "pulse", n = settings.cycles, a = settings.low/100, b = settings.high/100;
      const add = (s,v, incoming) => {
        const p = {s, v:+(a+(b-a)*v).toFixed(4)};
        if (incoming != null && incoming !== v) p.in = +(a+(b-a)*incoming).toFixed(4);
        points.push(p);
      };
      for (let i=0; i<n; i++) {
        const start = Math.round(i * steps/n), end = Math.round((i+1)*steps/n), mid = Math.round((start+end)/2);
        if (shape.value === "rise") add(start,0,i ? 1 : null);
        else if (shape.value === "fall") add(start,1,i ? 0 : null);
        else if (shape.value === "triangle" || shape.value === "pulse") { add(start,0); add(mid,1); }
        else for (let s=start; s<end; s++) add(s,(1-Math.cos((s-start)/(end-start)*2*Math.PI))/2);
      }
      add(steps,shape.value === "rise" ? 1 : 0);
      bank()[key] = {mode:linear ? "linear" : "step", points};
      defaultMode = bank()[key].mode;
      selected = -1; UI.closeMenu(); commit(); graph.focus({preventScroll:true});
    };
    UI.pop(anchor,form); shape.focus();
    form.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.closeMenu(true); }
    });
  }

  function mount(el) {
    host = el;
    target = btn("", "CHOOSE THE TRACK PARAMETER TO AUTOMATE", () => {
      UI.menu(target,App.automationKeys.filter(k=>k!=="cutoff" || track().kind!=="kit" || bank().cutoff).map(k => ({value:k,label:nameOf(k),on:k===key,key:bank()[k] ? "●" : ""})), k => {
        key = k; selected = -1; sync();
      });
    });
    target.setAttribute("aria-label","Automation target"); target.setAttribute("aria-haspopup","menu");
    modeButton = btn("", "INTERPOLATION FOR THIS LANE · LINEAR GLIDES OR STEP HOLDS", () => {
      UI.menu(modeButton,["linear","step"].map(m => ({label:m,value:m,on:m === (lane()?.mode || defaultMode)})), m => {
        defaultMode = m;
        if (lane()) {
          lane().mode = m;
          for (const p of lane().points) { delete p.shape; delete p.in; }
          commit();
        } else sync();
      });
    });
    modeButton.setAttribute("aria-label","Curve interpolation");
    const generate = btn("Shape ▾","GENERATE A CURVE ACROSS THE CLIP", () => generator(generate));
    deleteButton = btn("Delete point","DELETE THE SELECTED POINT · BATCH EDIT › CLEAN UP CLEARS WHOLE CURVES", () => {
      if (selected >= 0) removePoint(selected);
    });
    readout = h("span.auto-readout");
    graph = h("canvas", {id:"auto-graph",tabindex:0,role:"application","aria-label":"Automation points. Click to add, drag to move, right-click to delete. Brackets select a point, arrows adjust it."});
    playhead = h("div.auto-playhead", {hidden:true});
    panel = h("div.auto-panel",null,h("div.hd.auto-toolbar",null,h("span.tg",{text:"Target"}),target,modeButton,generate,deleteButton,h("span.sp"),readout),
      h("div.auto-plot",null,graph,playhead));
    graph.addEventListener("pointerdown",down); graph.addEventListener("pointermove",move); graph.addEventListener("pointerup",finish);
    graph.addEventListener("pointercancel",cancel); graph.addEventListener("lostpointercapture",cancel);
    graph.addEventListener("pointerleave",() => { if (!gesture) UI.hint(null); });
    graph.addEventListener("keydown",keyboard);
    window.addEventListener("blur",cancel);
    new ResizeObserver(draw).observe(graph);
  }
  function open() {
    if (active) return;
    active = true; host.classList.add("automation-mode"); host.append(panel); sync();
    graph.focus({preventScroll:true});
  }
  function close() {
    if (!active) return;
    cancel(); active = false; host.classList.remove("automation-mode"); panel.remove(); UI.hint(null);
    playhead.hidden = true; geometry = null;
  }
  function reset() {
    close(); key = "vol"; defaultMode = "linear"; selected = -1; lastBank = null;
    Object.assign(settings,{shape:"rise",low:0,high:100,cycles:1});
  }
  function frame(c) {
    if (!active || !geometry) return;
    const step = c && c.pat === App.P.sel.p ? c.step + clamp((App.E.ctx.currentTime - c.t) / c.span,0,1) : -1;
    playhead.hidden = step < geometry.start || step >= geometry.end;
    if (!playhead.hidden) playhead.style.left = geometry.x(step) + "px";
  }
  App.Automation = {mount,open,close,reset,sync,cancel,frame,active:() => active};
})();
