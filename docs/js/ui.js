/* MUSICLAB · ui kit — one value control, menus, drag + drop, status line */
(() => {
  "use strict";
  const { clamp } = App;
  const UI = (App.UI = { tipEl: null });

  const h = (UI.h = (tag, a, ...kids) => {
    const [t, ...cls] = tag.split(".");
    const e = document.createElement(t || "div");
    if (cls.length) e.className = cls.join(" ");
    if (a) for (const k in a) {
      const v = a[k];
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "tip") e.dataset.tip = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of kids.flat(3)) if (c != null && c !== false) e.append(c);
    return e;
  });

  // Size a canvas's pixel buffer to its layout box. Returns device pixels per CSS pixel.
  // Uses layout size, not the on-screen rectangle, so drawing stays right if an ancestor is ever scaled.
  UI.fit = (cv) => {
    const d = window.devicePixelRatio || 1, cw = cv.clientWidth, ch = cv.clientHeight;
    const w = Math.max(1, Math.round(cw * d)), hh = Math.max(1, Math.round(ch * d));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    return cw ? w / cw : d;
  };

  /* ── status line: the only place that spells things out ───────── */
  const IDLE = "CLICK GRID = NOTE · SPACE = PLAY · A-K = KEYS · Z X = OCTAVE · 1-8 = TRACK · ARROWS = TRACK / PATTERN · DROP AUDIO ON A TRACK OR PAD";
  let hintEl, msgEl, sysEl, msgT = 0, fixed = null;
  UI.init = () => {
    hintEl = document.querySelector(".st-h"); msgEl = document.querySelector(".st-m"); sysEl = document.querySelector(".st-s");
    UI.tip();
  };
  UI.tip = () => {
    const el = UI.tipEl?.isConnected ? UI.tipEl : (UI.tipEl = null);
    const text = fixed ?? (el ? (el._tip ? el._tip() : el.dataset.tip) : null);
    if (hintEl) hintEl.textContent = text ?? IDLE;
    // An open dialog covers the status line, so it carries its own strip: the same hint, else what the dialog is for.
    const dlg = [...document.querySelectorAll("dialog.console-dialog[open]")].pop();
    if (!dlg) return;
    const own = (el && dlg.contains(el) && text) || [...dlg.querySelectorAll(".dlg-tip")].map(n => n.textContent.trim()).filter(Boolean).join(" · ") || "ESC = CLOSE · CTRL/CMD K = FIND";
    if (dlg.dataset.st !== own) dlg.dataset.st = own;
  };
  // Canvases describe what is under the cursor themselves.
  UI.hint = (t) => { fixed = t; UI.tip(); };
  UI.msg = (t) => {
    if (!msgEl) return;
    msgEl.textContent = t;
    clearTimeout(msgT);
    msgT = setTimeout(() => (msgEl.textContent = ""), 6000);
  };
  UI.sys = (t) => { if (sysEl && sysEl.textContent !== t) sysEl.textContent = t; };
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (el === UI.tipEl) return;
    UI.tipEl = el;
    UI.tip();
  });
  // In a dialog the keyboard reaches controls the pointer is not on; its strip follows the focus too.
  document.addEventListener("focusin", (e) => {
    // Only focus the keyboard moved: the focus a dialog takes when it opens says nothing about intent.
    const el = e.target.closest?.("dialog.console-dialog") && e.target.matches(":focus-visible") ? e.target.closest("[data-tip]") : null;
    if (!el || el === UI.tipEl) return;
    UI.tipEl = el;
    UI.tip();
  });

  /* ── popups ───────────────────────────────────────────────────── */
  let open = null;
  let opener = null;
  UI.closeMenu = (restore = false) => {
    if (!open) return;
    open.remove(); open = null;
    if (restore && opener?.isConnected) opener.focus?.({preventScroll:true});
    opener = null;
  };
  UI.menuOpen = () => !!open;
  const place = (m, anchor) => {
    document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor, b = m.getBoundingClientRect();
    let x = r.left, y = r.bottom + 1;
    if (y + b.height > innerHeight) y = r.top - b.height - 1;
    if (y < 0) y = Math.max(0, innerHeight - b.height);
    m.style.left = clamp(x, 0, Math.max(0, innerWidth - b.width)) + "px";
    m.style.top = y + "px";
    open = m; opener = anchor;
  };
  UI.menu = (anchor, items, pick) => {
    UI.closeMenu();
    const m = h("div.mn", {role:"menu", "aria-label":anchor.getAttribute?.("aria-label") || anchor.textContent || "Actions"});
    for (const it of items) {
      if (it === "-") { m.append(h("div.mn-s")); continue; }
      const b = h("button.mn-i" + (it.on ? ".on" : ""), { type:"button", role:"menuitem", disabled:it.disabled, tip: it.tip }, h("span", { text: it.label }), it.key ? h("span.k", { text: it.key }) : null);
      b.onclick = e => { UI.closeMenu(e.detail === 0); pick(it.value ?? it.label); };
      m.append(b);
    }
    place(m, anchor);
    const choices = [...m.querySelectorAll("button:enabled")];
    choices.find(b => b.classList.contains("on"))?.focus();
    if (!m.contains(document.activeElement)) choices[0]?.focus();
    m.onkeydown = e => {
      const i = choices.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.closeMenu(true); return; }
      if (e.key === "Tab") { UI.closeMenu(true); return; }
      if (!["ArrowDown","ArrowUp","Home","End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const next = e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus();
    };
  };
  UI.pop = (anchor, content) => {
    UI.closeMenu();
    place(h("div.pop", null, content), anchor);
  };
  document.addEventListener("pointerdown", (e) => { if (open && !open.contains(e.target)) UI.closeMenu(); }, true);
  document.addEventListener("click", e => {
    const button = e.target.closest?.("button");
    if (e.detail > 0 && button === document.activeElement && !button?.closest("dialog,.mn,.pop")) button.blur();
  });

  // Inline text entry placed exactly over the thing being edited.
  UI.edit = (target, text, done, max = 24) => {
    const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
    const inp = h("input.ed", { "aria-label": target.getAttribute?.("aria-label") || target.dataset?.tip || "Edit value", maxlength: max, spellcheck: "false", autocomplete: "off" });
    inp.value = text;
    inp.style.cssText = `left:${r.left}px;top:${r.top}px;width:${Math.max(r.width, 70)}px;height:${r.height}px`;
    document.body.append(inp);
    App.releaseAll && App.releaseAll(); // a note key held while the entry opens would otherwise never get its key-up
    inp.focus(); inp.select();
    let fin = false;
    const close = (ok, restore = false) => {
      if (fin) return;
      fin = true;
      const v = inp.value.trim();
      inp.remove();
      if (ok && v) done(v);
      if (restore && target.isConnected) target.focus?.({preventScroll:true});
    };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") close(true, true); else if (e.key === "Escape") close(false, true); };
    inp.onblur = () => close(true);
  };

  /* ── drag + drop between panels ───────────────────────────────── */
  // Targets carry el._drop = { type: handler }. A press that never travels 5px is a click.
  UI.drop = (el, handlers) => { el.dataset.drop = "1"; el._drop = handlers; return el; };
  const target = (x, y, type) => {
    let t = document.elementFromPoint(x, y);
    t = t && t.closest ? t.closest("[data-drop]") : null;
    while (t && !(t._drop && t._drop[type])) t = t.parentElement ? t.parentElement.closest("[data-drop]") : null;
    return t;
  };
  UI.drag = (e, o) => {
    const x0 = e.clientX, y0 = e.clientY;
    let on = false, ghost = null, tgt = null;
    const move = (ev) => {
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        on = true;
        o.start?.();
        ghost = h("div.gh", { text: o.label });
        document.body.append(ghost);
        document.body.classList.add("dragging");
        UI.hint(o.hint || "DROP ON A HIGHLIGHTED TARGET");
      }
      ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 12}px)`;
      const t = target(ev.clientX, ev.clientY, o.type);
      if (t !== tgt) { tgt && tgt.classList.remove("dz"); tgt = t; tgt && tgt.classList.add("dz"); }
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!on) { o.click && ev.type === "pointerup" && o.click(ev); return; }
      ghost.remove();
      document.body.classList.remove("dragging");
      UI.hint(null);
      if (tgt) { tgt.classList.remove("dz"); if (ev.type === "pointerup") tgt._drop[o.type](o.data, ev, tgt); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Files dragged in from the OS use the same targets under the type "file".
  let fileTgt = null;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const t = target(e.clientX, e.clientY, "file");
    if (t !== fileTgt) { fileTgt && fileTgt.classList.remove("dz"); fileTgt = t; fileTgt && fileTgt.classList.add("dz"); }
  });
  window.addEventListener("dragleave", (e) => {
    if (e.relatedTarget) return;
    fileTgt && fileTgt.classList.remove("dz"); fileTgt = null;
  });
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const t = fileTgt || target(e.clientX, e.clientY, "file");
    fileTgt && fileTgt.classList.remove("dz"); fileTgt = null;
    const files = [...e.dataTransfer.files];
    if (t) t._drop.file(files, e, t);
    else App.dropFiles(files, null);
  });

  /* ── the value control ────────────────────────────────────────── */
  // Every number, list and switch on the console is this one element:
  // drag or wheel to change, double-click to type, right-click to reset.
  UI.param = (d, obj, onChange, o = {}) => {
    const O = typeof obj === "function" ? obj : () => obj;
    const el = h("div.pm" + (o.cls ? "." + o.cls : "") + (d.bi ? ".bi" : "") + (d.opts ? ".en" : "") + (d.bool ? ".bo" : ""));
    const val = h("span.v"), bar = h("i"), mt = o.meter ? h("u.mt") : null;
    el.append(mt || "", h("span.l", { text: o.label ?? d.l }), val, h("span.b", null, bar));
    el.tabIndex = 0;
    el.setAttribute("role", d.bool ? "switch" : d.opts ? "button" : "slider");
    el.setAttribute("aria-label", d.name || d.l);
    if (d.opts) el.setAttribute("aria-haspopup", "menu");
    if (!d.bool && !d.opts) {
      el.setAttribute("aria-valuemin", d.min); el.setAttribute("aria-valuemax", d.max);
    }
    if (["vol","pan","dly","rev"].includes(d.k) && App.DEF.trk[d.k] === d) {
      const ti = App.P.tracks.indexOf(O());
      if (ti >= 0) { el.dataset.midiTarget = d.k; el.dataset.midiTrack = ti; }
    }
    if (d === App.DEF.syn.cut || d === App.DEF.smp.cut) {
      const ti=App.P.tracks.findIndex(t=>t[t.kind]===O());
      if (ti>=0) { el.dataset.midiTarget="cutoff"; el.dataset.midiTrack=ti; }
    }
    const get = () => O()[d.k];
    const done = () => { App.commit(); o.done && o.done(); };
    const paint = (el.paint = () => {
      const v = get(), n = App.toN(d, v);
      val.textContent = App.fmt(d, v);
      if (d.bool) el.setAttribute("aria-checked", String(!!v));
      else if (!d.opts) { el.setAttribute("aria-valuenow", v); el.setAttribute("aria-valuetext", val.textContent); }
      else el.setAttribute("aria-label", (d.name || d.l) + " · " + val.textContent);
      if (d.bool) el.classList.toggle("on", !!v);
      if (d.bi) { bar.style.left = Math.min(n, 0.5) * 100 + "%"; bar.style.width = Math.abs(n - 0.5) * 100 + "%"; }
      else if (d.opts || d.bool) { const k = d.max + 1; bar.style.left = (v / k) * 100 + "%"; bar.style.width = 100 / k + "%"; }
      else bar.style.width = n * 100 + "%";
    });
    const put = (v) => {
      v = clamp(v, d.min, d.max);
      if (v === get()) return false;
      O()[d.k] = v;
      paint();
      onChange && onChange(d.k, v);
      if (UI.tipEl === el) UI.tip();
      return true;
    };
    el.addEventListener("focus", () => { UI.tipEl = el; UI.tip(); });
    el.dataset.tip = d.name;
    el._tip = () =>
      d.name + "  " + App.fmt(d, get()) + (App.UNIT[d.u] || "") + "    " +
      (d.bool ? "CLICK = TOGGLE" : d.opts ? "CLICK = LIST · DRAG / WHEEL = STEP" : "CLICK = TYPE · DRAG / WHEEL = ADJUST · SHIFT = FINE") + " · RIGHT-CLICK = RESET";
    el.meter = mt;

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, v0 = get(), n0 = App.toN(d, v0);
      let moved = false, changed = false;
      el.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        const dist = ev.clientX - x0 - (ev.clientY - y0);
        if (!moved && Math.abs(dist) < 3) return;
        if (!moved) { moved = true; el.classList.add("dr"); }
        if (d.bool) return;
        const v = d.opts || (d.int && d.max - d.min <= 16)
          ? Math.round(v0 + dist / 14)
          : App.fromN(d, n0 + dist / (ev.shiftKey ? 8 : 1) / (d.sens || 170), ev.shiftKey);
        if (put(v)) changed = true;
      };
      const up = (ev) => {
        el.removeEventListener("pointermove", mv);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        el.classList.remove("dr");
        if (moved) { if (changed) done(); return; }
        if (ev.type !== "pointercancel") activate();
      };
      el.addEventListener("pointermove", mv);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });

    let wt = 0, acc = 0;
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      // Trackpads send a stream of small deltas; one notch = 40 units.
      acc += e.deltaY || e.deltaX; // with SHIFT held, browsers report the wheel on the X axis
      if (Math.abs(acc) < 40) return;
      const s = acc < 0 ? 1 : -1;
      acc = 0;
      const v = d.bool ? (s > 0 ? 1 : 0)
        : d.opts || d.int ? get() + s
        : d.step ? get() + s * (e.shiftKey && d.fine ? d.fine : d.step)
        : App.fromN(d, App.toN(d, get()) + s * (e.shiftKey ? 0.002 : 0.012));
      if (put(d.step ? +v.toFixed(3) : v)) { clearTimeout(wt); wt = setTimeout(done, 350); }
    }, { passive: false });

    function activate() {
      if (d.bool) { put(get() ? 0 : 1); done(); return; }
      if (d.opts) {
        UI.menu(el, d.opts.map((t,i)=>({label:t,value:i,on:i===get()})),i=>{if(put(i)) done();});
        return;
      }
      UI.edit(el, App.fmt(d, get()), (s) => {
        let v = App.parse(d, s);
        if (!isFinite(v)) return;
        if (d.int) v = Math.round(v);
        if (put(v)) done();
      });
    }
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); activate(); return; }
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : -1;
      const v = e.key === "Home" ? d.min : e.key === "End" ? d.max :
        (d.bool || d.opts || d.int) ? get() + dir : d.step ? get()+dir*(e.shiftKey && d.fine ? d.fine : d.step) :
        App.fromN(d,App.toN(d,get())+dir*(e.shiftKey ? 0.002 : 0.012),e.shiftKey);
      if (put(v)) done();
    });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (put(d.def)) done(); });

    paint();
    return el;
  };

  UI.btn = (text, tip, fn, cls) => {
    const b = h("button.bt" + (cls ? "." + cls : ""), { text, tip, type: "button" });
    b.onclick = fn;
    return b;
  };


  document.addEventListener("contextmenu", (e) => { if (!e.target.closest || !e.target.closest("input")) e.preventDefault(); });
})();
