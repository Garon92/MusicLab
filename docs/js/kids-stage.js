/* The band on stage: where each member stands, and the little scenes some of them play together when their notes meet
   on the same beat. The view decides who is on stage and when a beat passes; this file only places and plays. */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  // A stable number in [0, 1) per member, so the crowd stands the same way every time it is drawn.
  const seed = (text) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  const wide = (m) => (m.part < 4 ? 1.257 : 1); // musicians are drawn wider than they are tall

  /* Musicians stand on a riser at the back. The pictured sounds gather in front of them in uneven rows, families
     together, the front row widest and nearest. Rows overlap like a crowd, but nobody covers the middle of anyone. */
  function arrange(floor, list, riser) {
    const W = floor.clientWidth, H = floor.clientHeight;
    if (!W || !H) return;
    const band = list.filter((m) => m.part < 4), crowd = list.filter((m) => m.part >= 4), n = crowd.length;
    const R = n <= 5 ? 1 : n <= 12 ? 2 : n <= 21 ? 3 : 4, weights = Array.from({ length: R }, (_, r) => 1 + 0.35 * r);
    const total = weights.reduce((a, b) => a + b, 0), rows = [];
    if (band.length) rows.push({ items: band, unit: 1.18, band: true });
    let sum = 0, taken = 0;
    weights.forEach((w, r) => {
      sum += w; const upto = Math.round((n * sum) / total), items = crowd.slice(taken, upto); taken = upto;
      if (items.length) rows.push({ items, unit: 0.84 + 0.16 * (R > 1 ? r / (R - 1) : 1) });
    });
    if (!rows.length) return;
    // Each row's feet stand lower than the last; the next row's heads reach no higher than the middle of the row behind.
    // In front of the riser only the musicians' feet are hidden; in the crowd a row covers the lower half of the one behind.
    const place = (u) => { let prev = null; return rows.map((row) => { const s = row.unit * u, b = prev ? Math.max(prev.b + 0.06, prev.b - prev.s * (prev.band ? 0.22 : 0.45) + s) : s + 0.02; prev = { b, s, band: row.band }; return { ...row, s, b }; }); };
    const fits = (u) => place(u).at(-1).b <= 0.985 && rows.every((row) => row.items.reduce((w, m) => w + wide(m) * row.unit * u * H * 0.9, 0) <= 0.97 * W);
    let lo = 0.05, hi = 0.46;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    const placed = place(lo), shift = 0.985 - placed.at(-1).b;
    let riserBox = null;
    placed.forEach((row, r) => {
      const widths = row.items.map((m) => (wide(m) * row.s * H) / W), span = widths.reduce((a, b) => a + b, 0) * 0.9;
      const stagger = row.band ? 0 : (r % 2 ? 1 : -1) * Math.min(0.04, (0.97 - span) / 2) * 0.6;
      let x = 0.5 - span / 2 + stagger;
      row.items.forEach((m, i) => {
        const w = widths[i], jitter = seed(m.key), scale = 0.93 + 0.12 * seed(m.key + "s"), s = row.s * scale;
        const cx = x + w * 0.45 + (jitter - 0.5) * w * 0.12, feet = row.b + shift + (seed(m.key + "y") - 0.5) * 0.022;
        x += w * 0.9;
        Object.assign(m.el.style, { left: (cx * 100).toFixed(3) + "%", top: ((feet - s) * 100).toFixed(3) + "%", height: (s * 100).toFixed(3) + "%", zIndex: String(10 + r * 10 + Math.round(feet * 5)) });
        m.el.style.setProperty("--delay", (-seed(m.key + "d") * 2.8).toFixed(2) + "s");
        if (row.band) {
          const left = cx - (wide(m) * s * H) / W / 2, right = cx + (wide(m) * s * H) / W / 2;
          riserBox = riserBox ? { left: Math.min(riserBox.left, left), right: Math.max(riserBox.right, right), feet: Math.max(riserBox.feet, feet) } : { left, right, feet };
        }
      });
    });
    riser.hidden = !riserBox;
    if (riserBox) Object.assign(riser.style, { left: ((riserBox.left - 0.02) * 100).toFixed(2) + "%", width: ((riserBox.right - riserBox.left + 0.04) * 100).toFixed(2) + "%", top: ((riserBox.feet - 0.025) * 100).toFixed(2) + "%" });
  }

  /* Scenes. Each needs all of its members to play on the same beat, and waits a moment before it plays again. */
  const svg = (body, view = "0 0 40 40") => '<svg viewBox="' + view + '" fill="none" stroke="#273a40" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  const at = (stage, el) => { const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top, w: r.width, h: r.height, top: r.top - s.top, bottom: r.bottom - s.top }; };
  function prop(stage, cls, html, x, y, size) {
    const el = document.createElement("i"); el.className = "kv-egg " + cls; el.innerHTML = html || "";
    Object.assign(el.style, { left: x + "px", top: y + "px" }); if (size) Object.assign(el.style, { width: size + "px", height: size + "px" });
    stage.append(el); return el;
  }
  const once = (el, frames, options) => { const a = el.animate(frames, options); a.onfinish = a.oncancel = () => el.remove(); return a; };
  const art = (m) => m.querySelector(".kv-member-figure svg");
  const lift = (m, ms) => { m.classList.add("kv-lifted"); setTimeout(() => m.classList.remove("kv-lifted"), ms); };

  const scenes = {
    // Dog and cat: they lean in, a spark flies between them, and the cat jumps.
    standoff(stage, [dog, cat]) {
      const a = at(stage, dog), b = at(stage, cat), side = b.x > a.x ? 1 : -1;
      once(prop(stage, "kv-egg-spark", svg('<path d="M4 22 12 14l4 8 6-12 4 10 10-9" stroke="#e2544a" stroke-width="3.2"/><path d="m8 30 4-4m20 4-4-4m-8 6v-5" stroke="#f0a93c"/>'), (a.x + b.x) / 2, Math.min(a.y, b.y) - 10, Math.min(a.w, b.w) * 0.7),
        [{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.15)", offset: 0.25 }, { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(8deg)", offset: 0.7 }, { opacity: 0, transform: "translate(-50%,-50%) scale(.8)" }], { duration: 900, easing: "ease-out" });
      art(dog)?.animate([{ transform: "rotate(0)" }, { transform: "rotate(" + 12 * side + "deg)" }, { transform: "rotate(0)" }], { duration: 800, easing: "ease-in-out" });
      art(cat)?.animate([{ transform: "translateY(0)" }, { transform: "translateY(-38%) rotate(" + -10 * side + "deg)", offset: 0.35 }, { transform: "translateY(0)" }], { duration: 800, easing: "ease-out" });
    },
    // Cat and bird: the bird takes off over the band and comes back.
    flyAway(stage, [, bird]) {
      lift(bird, 1300);
      art(bird)?.animate([{ transform: "translate(0,0) rotate(0)" }, { transform: "translate(40%,-120%) rotate(-14deg)", offset: 0.3 }, { transform: "translate(-30%,-160%) rotate(10deg)", offset: 0.6 }, { transform: "translate(0,0) rotate(0)" }], { duration: 1300, easing: "ease-in-out" });
    },
    // Cow and rooster: morning. The sun comes up behind the band and the stage warms.
    sunrise(stage) {
      const w = stage.clientWidth, h = stage.clientHeight;
      once(prop(stage, "kv-egg-sun", svg('<circle cx="20" cy="20" r="9" fill="#f6c453"/><path d="M20 3v5m0 24v5M3 20h5m24 0h5M8 8l3.5 3.5m17 17L32 32M8 32l3.5-3.5m17-17L32 8" stroke="#e9a23b" stroke-width="2.8"/>'), w * 0.8, h * 0.42, h * 0.3),
        [{ opacity: 0, transform: "translate(-50%,-10%)" }, { opacity: 1, transform: "translate(-50%,-85%)", offset: 0.45 }, { opacity: 1, transform: "translate(-50%,-85%)", offset: 0.75 }, { opacity: 0, transform: "translate(-50%,-40%)" }], { duration: 2200, easing: "ease-out" });
      once(prop(stage, "kv-egg-wash kv-egg-warm"), [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 2200 });
    },
    // Rain and thunder: the lights go down, lightning flashes twice and it rains across the stage.
    storm(stage) {
      once(prop(stage, "kv-egg-wash kv-egg-dark"), [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1800 });
      once(prop(stage, "kv-egg-wash kv-egg-flash"), [{ opacity: 0 }, { opacity: 0.9, offset: 0.12 }, { opacity: 0, offset: 0.2 }, { opacity: 0.7, offset: 0.3 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], { duration: 1800 });
      once(prop(stage, "kv-egg-wash kv-egg-rain"), [{ opacity: 0, backgroundPosition: "0 0" }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0, backgroundPosition: "-120px 600px" }], { duration: 1800 });
    },
    // Rocket or flying saucer with a star: a shooting star crosses the top of the stage.
    shootingStar(stage) {
      const w = stage.clientWidth, h = stage.clientHeight, size = Math.max(28, h * 0.1);
      once(prop(stage, "kv-egg-comet", svg('<path d="M2 26 26 14" stroke="#fff3c4" stroke-width="5" opacity=".6"/><path d="m30 4 3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#f6c453"/>'), 0, h * 0.16, size),
        [{ opacity: 0, transform: "translate(" + w * 0.08 + "px,0) rotate(0)" }, { opacity: 1, transform: "translate(" + w * 0.3 + "px," + -h * 0.06 + "px) rotate(20deg)", offset: 0.25 }, { opacity: 1, transform: "translate(" + w * 0.7 + "px," + -h * 0.02 + "px) rotate(50deg)", offset: 0.75 }, { opacity: 0, transform: "translate(" + w * 0.92 + "px," + h * 0.06 + "px) rotate(70deg)" }], { duration: 1400, easing: "ease-in-out" });
    },
    // Fart and giggle: a green cloud rises and the whole band shakes with laughter.
    stink(stage, [fart]) {
      const a = at(stage, fart);
      once(prop(stage, "kv-egg-cloud", svg('<path d="M10 30q-7 0-7-6t7-6q0-8 9-8 6-5 12 1 7 0 7 7 0 7-7 8Z" fill="#c4dd95" stroke="#7c9a5c"/><path d="M14 22q3-3 6 0t6 0" stroke="#7c9a5c"/>'), a.x, a.top, a.w * 0.8),
        [{ opacity: 0, transform: "translate(-50%,0) scale(.4)" }, { opacity: 0.95, transform: "translate(-50%,-50%) scale(1)", offset: 0.3 }, { opacity: 0, transform: "translate(-50%,-160%) scale(1.5)" }], { duration: 1500, easing: "ease-out" });
      for (const el of stage.querySelectorAll(".kv-member-figure svg"))
        el.animate([{ transform: "rotate(0)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(3deg)" }, { transform: "rotate(0)" }], { duration: 700, delay: 250 + Math.random() * 150, easing: "ease-in-out" });
    },
    // Frog and duck: a puddle under each of them and rings on the water.
    splash(stage, members) {
      for (const m of members) {
        const a = at(stage, m);
        once(prop(stage, "kv-egg-puddle", "", a.x, a.bottom - a.h * 0.06, a.w * 0.9), [{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.3 }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.5)" }], { duration: 1200, easing: "ease-out" });
        for (let i = 0; i < 3; i++) once(prop(stage, "kv-egg-drop", "", a.x + (i - 1) * a.w * 0.18, a.bottom - a.h * 0.1, Math.max(7, a.w * 0.06)),
          [{ opacity: 1, transform: "translate(-50%,0)" }, { opacity: 1, transform: "translate(calc(-50% + " + (i - 1) * 14 + "px)," + -a.h * 0.35 + "px)", offset: 0.45 }, { opacity: 0, transform: "translate(calc(-50% + " + (i - 1) * 22 + "px),0)" }], { duration: 800, easing: "ease-out" });
      }
    },
    // Monkey and elephant: a banana flies from one to the other.
    banana(stage, [monkey, elephant]) {
      const a = at(stage, monkey), b = at(stage, elephant), dx = b.x - a.x, dy = b.y - a.y, top = -Math.max(a.h, b.h) * 0.9;
      once(prop(stage, "kv-egg-banana", svg('<path d="M8 10q-3 16 10 22 9 4 16-2-12 2-18-6-4-6-3-14Z" fill="#f6c453"/><path d="m8 10-1-4 3 1" stroke-width="2"/>'), a.x, a.y, a.w * 0.45),
        [{ transform: "translate(-50%,-50%) rotate(0)" }, { transform: "translate(calc(-50% + " + dx / 2 + "px),calc(-50% + " + (dy / 2 + top) + "px)) rotate(200deg)", offset: 0.5 }, { transform: "translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px)) rotate(400deg)", opacity: 1, offset: 0.92 }, { transform: "translate(calc(-50% + " + dx + "px),calc(-50% + " + dy + "px)) rotate(400deg)", opacity: 0 }], { duration: 1100, easing: "ease-in-out" });
      art(elephant)?.animate([{ transform: "scale(1)" }, { transform: "scale(1)", offset: 0.85 }, { transform: "scale(1.12,.92)", offset: 0.92 }, { transform: "scale(1)" }], { duration: 1300 });
    },
    // Laser and robot: a beam crosses to the robot, which flickers.
    glitch(stage, [laser, robot]) {
      const a = at(stage, laser), b = at(stage, robot), dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const beam = prop(stage, "kv-egg-beam", "", a.x, a.y);
      Object.assign(beam.style, { width: length + "px", transform: "rotate(" + Math.atan2(dy, dx) + "rad)" });
      once(beam, [{ opacity: 0, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, clipPath: "inset(0 0 0 0)", offset: 0.3 }, { opacity: 1, clipPath: "inset(0 0 0 0)", offset: 0.6 }, { opacity: 0, clipPath: "inset(0 0 0 100%)" }], { duration: 700, easing: "ease-out" });
      art(robot)?.animate([{ filter: "none", transform: "translate(0)" }, { filter: "hue-rotate(160deg) saturate(2)", transform: "translate(-3%,1%)", offset: 0.3 }, { filter: "hue-rotate(-90deg)", transform: "translate(3%,-1%)", offset: 0.45 }, { filter: "hue-rotate(160deg)", transform: "translate(-2%,0)", offset: 0.6 }, { filter: "none", transform: "translate(0)" }], { duration: 900, delay: 200 });
    },
    // Drums, bass and melody on one beat: confetti over the whole band.
    confetti(stage) {
      const w = stage.clientWidth, h = stage.clientHeight, colours = ["#ef9980", "#b0b5e9", "#eac565", "#8bceb7", "#acd28c", "#efafba"];
      for (let i = 0; i < 26; i++) {
        const piece = prop(stage, "kv-egg-confetti", "", w * (0.12 + 0.76 * Math.random()), h * 0.08, 0);
        piece.style.background = colours[i % colours.length];
        once(piece, [{ opacity: 1, transform: "translate(0,0) rotate(0)" }, { opacity: 1, transform: "translate(" + (Math.random() - 0.5) * 80 + "px," + h * (0.45 + 0.4 * Math.random()) + "px) rotate(" + (360 + Math.random() * 540) + "deg)", offset: 0.85 }, { opacity: 0, transform: "translate(" + (Math.random() - 0.5) * 90 + "px," + h * 0.9 + "px) rotate(900deg)" }], { duration: 1500 + Math.random() * 500, delay: Math.random() * 200, easing: "cubic-bezier(.2,.6,.4,1)" });
      }
    },
  };
  // Members by the sound they play: a pictured sound is "part:row", a musician its number.
  const keyOf = Object.fromEntries(App.KidsWorld.groups.flatMap((g, gi) => g.sounds.map((s, row) => [s.id, 4 + gi + ":" + row])));
  const recipes = [
    [["dog", "cat"], "standoff"], [["cat", "bird"], "flyAway"], [["cow", "rooster"], "sunrise"], [["rain", "thunder"], "storm"],
    [["rocket", "star"], "shootingStar"], [["ufo", "star"], "shootingStar"], [["fart", "giggle"], "stink"], [["frog", "duck"], "splash"],
    [["monkey", "elephant"], "banana"], [["laser", "robot"], "glitch"], [["0", "1", "2"], "confetti"],
  ].map(([need, scene]) => ({ keys: need.map((id) => keyOf[id] ?? id), scene }));
  const last = new Map();
  // On every beat while the stage is shown: the keys of the members who play on it.
  function beat(stage, members, keys, now = performance.now()) {
    if (reduced.matches) return [];
    const played = [];
    for (const recipe of recipes) {
      if (!recipe.keys.every((k) => keys.has(k) && members.has(k)) || now - (last.get(recipe) ?? -1e9) < 2400) continue;
      last.set(recipe, now); played.push(recipe.scene);
      scenes[recipe.scene](stage, recipe.keys.map((k) => members.get(k)));
    }
    return played;
  }
  App.KidsStage = { arrange, beat, recipes: () => recipes.map((r) => ({ keys: r.keys.slice(), scene: r.scene })), reset: () => last.clear() };
})();
