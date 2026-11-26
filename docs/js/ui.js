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
  const IDLE = "CLICK GRID = NOTE · SPACE = PLAY · A-K = KEYS · RIGHT-CLICK ANYTHING = ITS MENU · DRAG A GRIP = COPY OR MOVE · CTRL/CMD K = MAP OF EVERYTHING";
  let hintEl, msgEl, sysEl, msgT = 0, fixed = null;
  let tipTarget = (t) => (t.closest ? t.closest("[data-tip]") : null); // widened below to fields, which describe themselves
  UI.init = () => {
    hintEl = document.querySelector(".st-h"); msgEl = document.querySelector(".st-m"); sysEl = document.querySelector(".st-s");
    UI.tip();
  };
  UI.tip = () => {
    const el = UI.tipEl?.isConnected ? UI.tipEl : (UI.tipEl = null);
    const text = fixed ?? (el ? UI.tipOf(el) : null);
    if (hintEl) hintEl.textContent = text ?? IDLE;
    // An open dialog covers the status line, so it carries its own strip: the same hint, else what the dialog is for.
    const dlg = [...document.querySelectorAll("dialog.console-dialog[open]")].pop();
    if (!dlg) return;
    const own = (el && dlg.contains(el) && text) || [...dlg.querySelectorAll(".dlg-tip")].map(n => n.textContent.trim()).filter(Boolean).join(" · ") || "ESC = CLOSE · CTRL/CMD K = FIND";
    if (dlg.dataset.st !== own) dlg.dataset.st = own;
  };
  // What a control says for itself. One that cannot be used now says why first (data-why), then what it is.
  UI.off = (el) => el.getAttribute?.("aria-disabled") === "true";
  UI.tipOf = (el) => {
    const tip = el._tip ? el._tip() : el.dataset.tip;
    return UI.off(el) ? (el.dataset.why || "NOT AVAILABLE NOW") + (tip ? "    " + tip : "") : tip;
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
    const el = tipTarget(e.target);
    if (el === UI.tipEl) return;
    UI.tipEl = el;
    UI.tip();
  });
  // In a dialog the keyboard reaches controls the pointer is not on; its strip follows the focus too.
  document.addEventListener("focusin", (e) => {
    // Only focus the keyboard moved: the focus a dialog takes when it opens says nothing about intent.
    const el = e.target.closest?.("dialog.console-dialog") && e.target.matches(":focus-visible") ? tipTarget(e.target) : null;
    if (!el || el === UI.tipEl) return;
    UI.tipEl = el;
    UI.tip();
  });

  /* ── popups ───────────────────────────────────────────────────── */
  let open = null;
  let opener = null;
  let closedFor = null; // the control whose list the current press just closed: that press must not open it again
  UI.closeMenu = (restore = false) => {
    if (!open) return;
    open.remove(); open = null;
    if (restore && opener?.isConnected) opener.focus?.({preventScroll:true});
    opener = null;
  };
  UI.menuOpen = () => !!open;
  // A modal dialog makes everything outside it inert, so a popup opened from one lives inside it.
  const layer = (anchor) => (anchor?.closest && anchor.closest("dialog[open]")) || [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  const place = (m, anchor, o = {}) => {
    layer(anchor).append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    if (o.width) m.style.minWidth = r.width + "px";
    // Nothing scrolls: a list taller than the window breaks into columns.
    let rows = 0;
    const tall = m.getBoundingClientRect().height, room = innerHeight - 8;
    if (m.classList.contains("mn") && tall > room) {
      m.querySelectorAll(".mn-s").forEach((s) => s.remove());
      const n = m.children.length, cols = Math.ceil(tall / room);
      rows = Math.ceil(n / cols);
      m.classList.add("cols");
      m.style.gridTemplateRows = `repeat(${rows}, auto)`;
    }
    const b = m.getBoundingClientRect();
    let x = r.left, y = r.bottom + 1;
    if (y + b.height > innerHeight) y = r.top - b.height - 1;
    if (y < 0) y = Math.max(0, innerHeight - b.height);
    m.style.left = clamp(x, 0, Math.max(0, innerWidth - b.width)) + "px";
    m.style.top = y + "px";
    open = m; opener = anchor;
    return rows;
  };
  // items: { label, value, key, tip, on, disabled } or "-" for a rule. `on` marks the current choice.
  UI.menu = (anchor, items, pick, o = {}) => {
    // Pressing the control whose list is open closes the list; it does not open it again.
    if (closedFor && closedFor === anchor) { closedFor = null; return null; }
    UI.closeMenu();
    const m = h("div.mn", {role:"menu", "aria-label":o.label || anchor.getAttribute?.("aria-label") || anchor.textContent || "Actions"});
    let rule = true; // no rule first, last or twice
    for (const it of items) {
      if (it === "-") { if (!rule) { m.append(h("div.mn-s")); rule = true; } continue; }
      rule = false;
      const b = h("button.mn-i" + (it.on ? ".on" : ""), { type:"button", role:"menuitem", tip: it.tip || it.label.toUpperCase() }, h("span", { text: it.label }), it.key ? h("span.k", { text: it.key }) : null);
      if (it.disabled) { b.setAttribute("aria-disabled", "true"); if (it.why) b.dataset.why = it.why; }
      b.onclick = e => { if (it.disabled) { UI.msg(UI.tipOf(b)); return; } UI.closeMenu(e.detail === 0); pick(it.value ?? it.label); };
      m.append(b);
    }
    if (rule && m.lastChild) m.lastChild.remove();
    const rows = place(m, anchor, o);
    const choices = [...m.querySelectorAll('button:not([aria-disabled="true"])')];
    choices.find(b => b.classList.contains("on"))?.focus({preventScroll:true});
    if (!m.contains(document.activeElement)) choices[0]?.focus({preventScroll:true});
    let typed = "", typedT = 0;
    m.onkeydown = e => {
      const i = choices.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.closeMenu(true); return; }
      if (e.key === "Tab") { UI.closeMenu(true); return; }
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing jumps to the first choice that starts with what was typed.
        e.preventDefault(); e.stopPropagation();
        clearTimeout(typedT); typedT = setTimeout(() => (typed = ""), 700);
        typed += e.key.toUpperCase();
        (choices.find(b => b.firstChild.textContent.toUpperCase().startsWith(typed)) || choices.find(b => b.firstChild.textContent.toUpperCase().includes(typed)))?.focus({preventScroll:true});
        return;
      }
      const side = rows && (e.key === "ArrowLeft" || e.key === "ArrowRight");
      if (!side && !["ArrowDown","ArrowUp","Home","End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const all = [...m.children], at = all.indexOf(document.activeElement);
      const next = side ? choices.indexOf(all[clamp(at + (e.key === "ArrowRight" ? rows : -rows), 0, all.length - 1)])
        : e.key === "Home" ? 0 : e.key === "End" ? choices.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
      choices[next < 0 ? i : next]?.focus({preventScroll:true});
    };
    return m;
  };
  UI.pop = (anchor, content) => {
    UI.closeMenu();
    place(h("div.pop", null, content), anchor);
  };
  document.addEventListener("pointerdown", (e) => {
    closedFor = null;
    if (open && !open.contains(e.target)) { closedFor = opener?.contains?.(e.target) ? opener : null; UI.closeMenu(); }
  }, true);
  document.addEventListener("click", e => {
    const button = e.target.closest?.("button");
    if (e.detail > 0 && button === document.activeElement && !button?.closest("dialog,.mn,.pop")) button.blur();
  });

  // Inline text entry placed exactly over the thing being edited.
  // `keyboard` says the entry was opened from the keys: only then does the control get the focus back afterwards.
  // After a click the focus goes nowhere, so SPACE plays and the arrows move the selection again.
  UI.edit = (target, text, done, max = 24, keyboard = false) => {
    const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
    const inp = h("input.ed", { "aria-label": target.getAttribute?.("aria-label") || target.dataset?.tip || "Edit value", maxlength: max, spellcheck: "false", autocomplete: "off" });
    inp.value = text;
    inp.style.cssText = `left:${r.left}px;top:${r.top}px;width:${Math.max(r.width, 70)}px;height:${r.height}px`;
    layer(target).append(inp);
    App.releaseAll && App.releaseAll(); // a note key held while the entry opens would otherwise never get its key-up
    inp.focus(); inp.select();
    let fin = false;
    const close = (ok, restore = false) => {
      if (fin) return;
      fin = true;
      const v = inp.value.trim();
      inp.remove();
      if (ok && v && v !== String(text).trim()) done(v); // unchanged text is not an edit: no rounding, no undo step
      if (restore && keyboard && target.isConnected) target.focus?.({preventScroll:true});
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
  // While something is being dragged, every place that would take it is outlined: the console shows where it can go.
  const reveal = (type) => {
    document.querySelectorAll(".dt").forEach((t) => t.classList.remove("dt"));
    if (type) for (const t of document.querySelectorAll("[data-drop]")) if (t._drop && t._drop[type]) t.classList.add("dt");
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
        layer(null).append(ghost);
        document.body.classList.add("dragging");
        reveal(o.type);
        UI.hint(o.hint || "DROP ON AN OUTLINED TARGET · ESC OR RELEASE ELSEWHERE = CANCEL");
      }
      ghost.style.transform = `translate(${ev.clientX + 12}px,${ev.clientY + 12}px)`;
      const t = target(ev.clientX, ev.clientY, o.type);
      if (t !== tgt) { tgt && tgt.classList.remove("dz"); tgt = t; tgt && tgt.classList.add("dz"); }
    };
    const esc = (ev) => { if (ev.key === "Escape" && on) { ev.preventDefault(); ev.stopPropagation(); up({ type: "pointercancel" }); } };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", esc, true);
      if (!on) { o.click && ev.type === "pointerup" && o.click(ev); return; }
      ghost.remove();
      document.body.classList.remove("dragging");
      reveal(null);
      UI.hint(null);
      if (tgt) { tgt.classList.remove("dz"); if (ev.type === "pointerup") tgt._drop[o.type](o.data, ev, tgt); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", esc, true);
  };

  // Files dragged in from the OS use the same targets under the type "file".
  let fileTgt = null, fileOver = false;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const fileDone = () => { fileTgt && fileTgt.classList.remove("dz"); fileTgt = null; if (fileOver) { fileOver = false; reveal(null); UI.hint(null); } };
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!fileOver) { fileOver = true; reveal("file"); UI.hint("DROP AUDIO ON AN OUTLINED TARGET · A PROJECT OR MIDI FILE ANYWHERE"); }
    const t = target(e.clientX, e.clientY, "file");
    if (t !== fileTgt) { fileTgt && fileTgt.classList.remove("dz"); fileTgt = t; fileTgt && fileTgt.classList.add("dz"); }
  });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) fileDone(); });
  window.addEventListener("dragend", fileDone);
  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const t = fileTgt || target(e.clientX, e.clientY, "file");
    fileDone();
    const files = [...e.dataTransfer.files];
    if (t) t._drop.file(files, e, t);
    // With an editor open, a file dropped beside every target would land on the track hidden behind it.
    else if (!document.querySelector("dialog[open]") || files.some((f) => /\.(json|midi?)$/i.test(f.name))) App.dropFiles(files, null);
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
    // Where a right-click returns: the parameter's default, or what this one object starts with (a drum pad's own sound).
    const defOf = () => (o.def === undefined ? d.def : typeof o.def === "function" ? o.def() : o.def);
    const done = () => { App.commit(); o.done && o.done(); };
    const paint = (el.paint = () => {
      const v = get(), n = App.toN(d, v);
      val.textContent = App.fmt(d, v);
      if (d.bool) el.setAttribute("aria-checked", String(!!v));
      else if (!d.opts) { el.setAttribute("aria-valuenow", v); el.setAttribute("aria-valuetext", val.textContent); }
      else el.setAttribute("aria-label", (d.name || d.l) + " · " + val.textContent);
      el.classList.toggle("df", v === defOf()); // at its reset value: shown dim, so what was changed stands out
      const idle = o.idle ? o.idle() : "";         // set, but with no effect now: says what would give it one
      el.classList.toggle("idle", !!idle); el._idle = idle || "";
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
    el.reset = () => put(defOf()); // for whatever resets a whole module, strip or device at once
    el.addEventListener("focus", () => { UI.tipEl = el; UI.tip(); });
    el.dataset.tip = d.name;
    el._tip = () =>
      (el._idle ? el._idle + "    " : "") + (el.dataset.why ? el.dataset.why + "    " : "") + d.name + "  " + App.fmt(d, get()) + (App.UNIT[d.u] || "") + "    " +
      (d.bool ? "CLICK = TOGGLE" : d.opts ? "CLICK = LIST · DRAG / WHEEL = STEP" : "CLICK = TYPE · DRAG / WHEEL = ADJUST · SHIFT = FINE") + " · RIGHT-CLICK = RESET";
    el.meter = mt;

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); // no focus from the mouse, either button: the keys stay with the transport and the editor
      if (e.button !== 0) return;
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
        if (ev.type !== "pointercancel") activate(false);
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

    function activate(keyboard) {
      if (d.bool) { put(get() ? 0 : 1); done(); return; }
      if (d.opts) {
        UI.menu(el, d.opts.map((t,i)=>({label:t,value:i,on:i===get()})),i=>{if(put(i)) done();});
        return;
      }
      UI.edit(el, App.fmt(d, get()), (s) => {
        let v = App.parse(d, s, get()); // a bare number is read in the unit the value is showing
        const span = () => (d.name || d.l).split(" · ")[0] + " TAKES " + App.fmt(d, d.min) + " TO " + App.fmt(d, d.max) + (App.UNIT[d.u] || "");
        if (!isFinite(v)) { UI.msg("NOT A VALUE: " + String(s).slice(0, 16).toUpperCase() + " · " + span()); return; }
        if (d.int) v = Math.round(v);
        if (v < d.min || v > d.max) UI.msg(span());
        if (put(v)) done();
      }, 24, keyboard);
    }
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); activate(true); return; }
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : -1;
      const v = e.key === "Home" ? d.min : e.key === "End" ? d.max :
        (d.bool || d.opts || d.int) ? get() + dir : d.step ? get()+dir*(e.shiftKey && d.fine ? d.fine : d.step) :
        App.fromN(d,App.toN(d,get())+dir*(e.shiftKey ? 0.002 : 0.012),e.shiftKey);
      if (put(v)) { clearTimeout(wt); wt = setTimeout(done, 350); } // a held key is one change, like a turn of the wheel
    });
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); if (put(defOf())) done(); });

    paint();
    return el;
  };

  /* ── native fields speak the console's language ──────────────── */
  // Editors in dialogs are built from select, number, range and checkbox elements. They keep their values and events
  // and take the gestures of the value control: a list opens the console menu, drag or wheel adjusts,
  // right-click puts back the value the field appeared with. Nothing the browser draws itself is left on screen.
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const kindOf = (UI.kindOf = (el) => {
    if (!el || !el.tagName) return "";
    if (el.tagName === "SELECT") return el.multiple || el.size > 1 ? "rows" : "list";
    if (el.tagName === "TEXTAREA") return "text";
    if (el.tagName !== "INPUT") return "";
    const t = el.type;
    return t === "number" ? "num" : t === "range" ? "range" : t === "checkbox" || t === "radio" ? "check" : t === "file" || t === "hidden" ? "" : "text";
  });
  const first = new WeakMap();
  // What a right-click goes back to. A field that names its default in data-reset goes there, and the name is read
  // each time, since an editor may point one field at another object. Any other field goes back to what it showed
  // when it was first touched.
  const seen = (el) => {
    if (!first.has(el)) first.set(el, el.tagName === "SELECT" ? el.selectedIndex : el.value);
    return el.tagName !== "SELECT" && el.dataset.reset != null ? el.dataset.reset : first.get(el);
  };
  const numOf = (el) => {
    const r = el.type === "range", lo = parseFloat(el.min), hi = parseFloat(el.max), st = parseFloat(el.step);
    return { min: isFinite(lo) ? lo : r ? 0 : null, max: isFinite(hi) ? hi : r ? 100 : null, step: isFinite(st) && st > 0 ? st : el.step === "any" ? 0 : 1 };
  };
  const setNum = (el, v) => {
    const { min, max, step } = numOf(el);
    if (!isFinite(v)) return false;
    if (step) { const base = min ?? 0; v = base + Math.round((v - base) / step) * step; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    const s = String(+v.toFixed(step ? Math.min(6, (String(step).split(".")[1] || "").length) : 4));
    if (s === el.value) return false;
    el.value = s;
    fire(el, "input");
    return true;
  };
  // The bar under a number shows where it stands between its limits, like the bar under a console value.
  const bar = (el) => {
    const { min, max } = numOf(el), v = parseFloat(el.value);
    const s = min != null && max != null && max > min && isFinite(v) ? clamp((v - min) / (max - min), 0, 1).toFixed(4) : "";
    if (el._n === s) return;
    el._n = s;
    if (s) el.style.setProperty("--n", s); else el.style.removeProperty("--n");
  };
  // An editor that redraws itself after a change replaces the field. Its successor inherits what "reset" goes back to
  // and the keyboard focus, so stepping a list with the arrow keys keeps working. Returns the field that is on screen.
  const changed = (el) => {
    const focused = document.activeElement === el;
    fire(el, "change");
    if (el.isConnected) return el;
    const label = el.getAttribute("aria-label"), root = [...document.querySelectorAll("dialog[open]")].pop() || document;
    const next = label && [...root.querySelectorAll(el.tagName)].find((n) => n.getAttribute("aria-label") === label);
    if (!next) return null;
    if (first.has(el)) first.set(next, first.get(el));
    if (focused) next.focus({ preventScroll: true });
    return next;
  };
  const usable = (o) => o && !o.disabled && !o.hidden;
  const stepList = (el, to, quiet) => {
    const n = el.options.length, dir = to >= el.selectedIndex ? 1 : -1;
    let i = clamp(to, 0, n - 1);
    while (i >= 0 && i < n && !usable(el.options[i])) i += dir;
    if (i < 0 || i >= n || i === el.selectedIndex) return false;
    el.selectedIndex = i;
    fire(el, "input");
    if (!quiet) changed(el);
    return true;
  };
  const openList = (el) => {
    const items = [], add = (o) => { if (!o.hidden) items.push({ label: o.label || o.textContent, value: o.index, on: o.selected, disabled: o.disabled }); };
    for (const c of el.children) {
      if (c.tagName === "OPTGROUP") { items.push("-"); [...c.children].forEach(add); items.push("-"); }
      else if (c.tagName === "OPTION") add(c);
    }
    UI.menu(el, items, (i) => { if (i !== el.selectedIndex && usable(el.options[i])) { el.selectedIndex = i; fire(el, "input"); el = changed(el); } el && el.focus({ preventScroll: true }); }, { width: true });
  };
  UI.openList = openList;

  // One wheel gesture or one drag is one change, so it is one undo step in whatever the field edits.
  let pending = null, pendT = 0;
  const flush = () => { clearTimeout(pendT); if (pending) { const el = pending; pending = null; if (el.isConnected) changed(el); } };
  const later = (el) => { if (pending && pending !== el) flush(); pending = el; clearTimeout(pendT); pendT = setTimeout(flush, 350); };
  UI.flush = flush;

  const scrub = (e, el, k) => {
    seen(el);
    const x0 = e.clientX, y0 = e.clientY, i0 = el.selectedIndex, v0 = parseFloat(el.value), q = k === "num" ? numOf(el) : null;
    let moved = false, dirty = false;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* a synthetic pointer has no capture */ }
    const mv = (ev) => {
      const dist = ev.clientX - x0 - (ev.clientY - y0);
      if (!moved && Math.abs(dist) < 4) return;
      if (!moved) { moved = true; el.classList.add("dr"); }
      if (k === "list") { if (stepList(el, i0 + Math.round(dist / 14), true)) dirty = true; return; }
      const from = isFinite(v0) ? v0 : q.min ?? 0, span = q.min != null && q.max != null ? q.max - q.min : null;
      const unit = span != null ? Math.max(span / 170, q.step / 6) : (q.step || 1) / 6;
      if (setNum(el, from + (dist * unit) / (ev.shiftKey ? 8 : 1))) dirty = true;
    };
    const up = (ev) => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.classList.remove("dr");
      if (moved) { if (dirty) changed(el); return; }
      if (ev.type === "pointercancel" || !el.isConnected) return;
      el.focus({ preventScroll: true });
      if (k === "list") openList(el); else el.select();
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  };
  document.addEventListener("pointerdown", (e) => {
    flush();
    if (e.button !== 0) return;
    const el = e.target, k = kindOf(el);
    if (k === "list") { e.preventDefault(); if (!el.disabled) scrub(e, el, k); }
    else if (k === "num" && !el.disabled && !el.readOnly && document.activeElement !== el) { e.preventDefault(); scrub(e, el, k); }
  }, true);
  // Belt and braces for engines that open a list on the mouse event instead of the pointer event.
  document.addEventListener("mousedown", (e) => { if (e.button === 0 && kindOf(e.target) === "list") e.preventDefault(); }, true);

  let wEl = null, wAcc = 0;
  document.addEventListener("wheel", (e) => {
    const el = e.target, k = kindOf(el);
    if ((k !== "list" && k !== "num" && k !== "range") || el.disabled || el.readOnly) return;
    e.preventDefault(); e.stopPropagation();
    if (wEl !== el) { wEl = el; wAcc = 0; }
    wAcc += e.deltaY || e.deltaX; // with SHIFT held, browsers report the wheel on the X axis
    if (Math.abs(wAcc) < 40) return;
    const s = wAcc < 0 ? 1 : -1;
    wAcc = 0;
    seen(el);
    if (k === "list") { stepList(el, el.selectedIndex + s); return; }
    const { min, max, step } = numOf(el), v = parseFloat(el.value), unit = step || (min != null && max != null ? (max - min) / 1000 : 0.01);
    const coarse = min != null && max != null ? Math.max(1, Math.round((max - min) / 100 / unit)) : 1;
    if (setNum(el, (isFinite(v) ? v : min ?? 0) + s * unit * (e.shiftKey ? 1 : coarse))) later(el);
  }, { passive: false, capture: true });

  document.addEventListener("contextmenu", (e) => {
    const el = e.target, k = kindOf(el);
    if (!k || k === "text") return;
    e.preventDefault();
    if (el.disabled || k === "rows" || k === "check") return;
    const d = seen(el);
    if (k === "list") { if (d !== el.selectedIndex && usable(el.options[d])) { el.selectedIndex = d; fire(el, "input"); changed(el); } }
    else if (el.value !== d) { el.value = d; fire(el, "input"); changed(el); }
  }, true);

  document.addEventListener("keydown", (e) => {
    flush();
    closedFor = null;
    const el = e.target, k = e.key;
    if (kindOf(el) !== "list" || el.disabled || e.ctrlKey || e.metaKey) return;
    const down = k === "ArrowDown" || k === "ArrowRight", up = k === "ArrowUp" || k === "ArrowLeft";
    if (k === "Enter" || k === " " || (e.altKey && (down || up))) { e.preventDefault(); seen(el); openList(el); }
    else if (down || up) { e.preventDefault(); seen(el); stepList(el, el.selectedIndex + (down ? 1 : -1)); }
    else if (k === "Home" || k === "End") { e.preventDefault(); seen(el); stepList(el, k === "Home" ? 0 : el.options.length - 1); }
  }, true);

  // A number field never hands its editor an empty, out-of-range or off-step value. A field that had a value and is
  // left empty returns to its last good one; anything else is pulled onto the field's own limits and step. Editors
  // therefore never see NaN, and the browser's own validation bubble never has a reason to appear.
  const good = new WeakMap();
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (kindOf(el) !== "num") return;
    let v = el.valueAsNumber;
    if (!Number.isFinite(v)) {
      const back = good.has(el) ? good.get(el) : seen(el);
      if (back === "" || el.value === back) return; // empty is where this field rests (an optional limit, a search bound)
      el.value = back;
      bar(el);
      e.stopImmediatePropagation();
      return;
    }
    const { min, max, step } = numOf(el);
    if (step) { const base = min ?? 0; v = base + Math.round((v - base) / step) * step; }
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    const text = String(+v.toFixed(step ? Math.min(6, (String(step).split(".")[1] || "").length) : 6));
    if (text !== el.value && +text !== +el.value) el.value = text;
    good.set(el, el.value);
    bar(el);
  }, true);

  // Names typed into the console are not prose: the browser's spell-check underline and autofill stay out of them.
  document.addEventListener("focusin", (e) => {
    if (kindOf(e.target) === "text") { e.target.spellcheck = false; e.target.setAttribute("autocomplete", "off"); }
  });

  // Bars follow values that editors set from code, and every field remembers the value it appeared with.
  UI.fields = (root = document) => {
    for (const el of root.querySelectorAll("select,input[type=number],input[type=range]")) {
      seen(el);
      if (el.tagName !== "INPUT") continue;
      bar(el);
      // A field that names its default is dim while it sits there, like a value on the console.
      if (el.dataset.reset != null) el.classList.toggle("df", +el.value === +el.dataset.reset);
    }
  };
  document.addEventListener("input", (e) => { const k = kindOf(e.target); if (k === "num" || k === "range") bar(e.target); });
  setInterval(() => UI.fields(), 150);

  const LEGEND = {
    list: "CLICK = LIST · DRAG / WHEEL = STEP · RIGHT-CLICK = RESET",
    num: "CLICK = TYPE · DRAG / WHEEL = ADJUST · SHIFT = FINE · RIGHT-CLICK = RESET",
    range: "DRAG / WHEEL = ADJUST · SHIFT = FINE · RIGHT-CLICK = RESET",
    check: "CLICK = TOGGLE", rows: "CLICK = SELECT · WHEEL = STEP", text: "TYPE · ENTER = APPLY",
  };
  const fieldTip = (el) => {
    const k = kindOf(el);
    const name = el.dataset.tip || el.closest("[data-tip]")?.dataset.tip || el.getAttribute("aria-label") || el.labels?.[0]?.textContent.trim() || el.placeholder || "";
    const value = k === "list" ? el.options[el.selectedIndex]?.textContent ?? "" : k === "check" ? (el.checked ? "ON" : "OFF") : k === "num" || k === "range" ? el.value : "";
    return name + (value !== "" ? "  " + value : "") + "    " + (el._bad ? el._bad + " · " : "") + LEGEND[k];
  };
  // An editor that checks a field before acting gets its answer, but the browser's own bubble never appears:
  // the field turns red and the strip says, in the console's words, what it needs.
  const why = (el) => {
    const v = el.validity;
    return v.customError ? el.validationMessage.replace(/\.$/, "").toUpperCase() : v.valueMissing ? "NEEDS A VALUE" : v.badInput ? "NOT A NUMBER" : v.rangeUnderflow || v.rangeOverflow ? "MUST BE " + (el.min || "ANY") + " TO " + (el.max || "ANY")
      : v.stepMismatch ? "IN STEPS OF " + el.step : v.tooLong ? "TOO LONG" : "NOT VALID";
  };
  const quiet = (el) => {
    const ok = el.checkValidity();
    el.classList.toggle("bad", !ok);
    el._bad = ok ? "" : why(el);
    if (!ok) { if (!el._tip) el._tip = () => fieldTip(el); el.focus({ preventScroll: true }); UI.tipEl = el; UI.tip(); }
    return ok;
  };
  for (const proto of [HTMLInputElement.prototype, HTMLSelectElement.prototype, HTMLTextAreaElement.prototype]) proto.reportValidity = function () { return quiet(this); };
  HTMLFormElement.prototype.reportValidity = function () { return [...this.elements].filter((el) => el.willValidate).map(quiet).every(Boolean); };
  document.addEventListener("input", (e) => { const el = e.target; if (el._bad) { el._bad = ""; el.classList.remove("bad"); if (UI.tipEl === el) UI.tip(); } });
  // What the status line describes: a field describes itself, anything else carries data-tip.
  tipTarget = (t) => {
    const f = t.closest ? t.closest("select,input,textarea") : null;
    if (f && kindOf(f)) { if (!f._tip) f._tip = () => fieldTip(f); return f; }
    return t.closest ? t.closest("[data-tip]") : null;
  };

  UI.btn = (text, tip, fn, cls) => {
    const b = h("button.bt" + (cls ? "." + cls : ""), { text, tip, type: "button" });
    // A button that cannot be used now stays within reach of the pointer, so the status line can say why
    // (data-why): it only stops acting. Code reads and writes `disabled` as on any button.
    Object.defineProperty(b, "disabled", { configurable: true, get: () => UI.off(b), set: (v) => { if (v) b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled"); } });
    b.onclick = (e) => { if (UI.off(b)) { e.stopImmediatePropagation(); UI.msg(UI.tipOf(b)); return; } fn && fn(e); };
    return b;
  };


  document.addEventListener("contextmenu", (e) => { if (!e.target.closest || !e.target.closest("input")) e.preventDefault(); });
})();
