/* A song in a link, as short as it can be without losing anything the kids' face can make.
   Format "A" is a bit stream; "B" is the same stream compressed, used when that is shorter; "J" is the song as
   compressed JSON, used only when it holds a note the kids' face itself does not make. The link is the page's
   address followed by #s, the format letter and the data in base64url. Every version ever shared must stay readable. */
(() => {
  "use strict";
  const M = () => App.KidsMusic;
  // Bits are written high first, into as many bytes as they need.
  class Writer {
    constructor() { this.bytes = []; this.n = 0; }
    put(value, width) {
      for (let i = width - 1; i >= 0; i--) {
        if (this.n % 8 === 0) this.bytes.push(0);
        if ((value >> i) & 1) this.bytes[this.bytes.length - 1] |= 128 >> (this.n % 8);
        this.n++;
      }
    }
    done() { return new Uint8Array(this.bytes); }
  }
  class Reader {
    constructor(bytes) { this.bytes = bytes; this.n = 0; }
    get(width) {
      let value = 0;
      for (let i = 0; i < width; i++) {
        const byte = this.bytes[this.n >> 3];
        if (byte === undefined) throw Error("The song link is cut short");
        value = value * 2 + ((byte >> (7 - (this.n & 7))) & 1); this.n++;
      }
      return value;
    }
  }
  const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  const deflate = (bytes) => through(bytes, new CompressionStream("deflate-raw"));
  const inflate = (bytes) => through(bytes, new DecompressionStream("deflate-raw"));
  const PARTS = 12, PIECES = 4, ROWS = 6, COLS = 8;
  const plainName = (name) => ["POCKET BAND", "UNTITLED"].includes(name);

  // The song as the plain object the reader in kids.js builds a project from (the version-1 shape).
  function data(P) {
    const m = M(), strip = P.rack.strips[m.tracks[0]], spin = strip.routes.find((r) => r.source === "lfo" && r.target === "pan");
    return { v: 1, name: P.name, tempo: m.tempoIndex(P), song: P.song ? 1 : 0, chain: P.chain.slice(0, 32), costumes: m.costumes(P), piece: App.clamp(P.sel.p, 0, 3),
      notes: [...new Set(m.tracks)].map((ti) => P.tracks[ti].clips.slice(0, 4).map((c) => c.map((n) => [n.s, n.n, n.l, n.v, n.p ?? 1, n.r || 1]))),
      fx: [P.fx.mixDelay, P.fx.mixReverb, P.fx.dtime, P.fx.dfb], macros: strip.macros.slice(), spin: spin ? [strip.lfoRate, spin.high] : null };
  }
  // Each note as the kids' face makes it: its row, its beat and how strongly it is played. Null when one is not.
  function cells(P) {
    const m = M(), out = Array.from({ length: PIECES }, () => Array.from({ length: PARTS }, () => []));
    let seen = 0, total = 0;
    for (const ti of new Set(m.tracks)) for (let p = 0; p < PIECES; p++) total += P.tracks[ti].clips[p].length;
    for (let p = 0; p < PIECES; p++) for (let part = 0; part < PARTS; part++) {
      const sung = m.sung(P, part);
      for (const n of P.tracks[m.tracks[part]].clips[p]) {
        if (!m.owns(part, n.n)) continue;
        let row = -1; for (let r = 0; r < ROWS; r++) if (m.pitch(part, r) === n.n) row = r;
        const col = n.s / 2, strength = m.strength(n, sung);
        if (row < 0 || !Number.isInteger(col) || col < 0 || col >= COLS) return null;
        const made = m.note(part, row, col, strength);
        if (made.v !== n.v || (n.p ?? 1) !== 1 || n.off || (!sung && (made.l !== n.l || (made.r || 1) !== (n.r || 1)))) return null;
        out[p][part].push(row * COLS + col, strength); seen++;
      }
    }
    return seen === total ? out : null; // a note no part owns would be lost
  }
  const milli = (v, max) => App.clamp(Math.round(v * 1000), 0, max);
  function effects(P) {
    const m = M(), strip = P.rack.strips[m.tracks[0]], spin = strip.routes.find((r) => r.source === "lfo" && r.target === "pan");
    const e = { delay: milli(App.toN(App.DEF.fx.mixDelay, P.fx.mixDelay), 1000), reverb: milli(App.toN(App.DEF.fx.mixReverb, P.fx.mixReverb), 1000), dtime: P.fx.dtime,
      dfb: milli(P.fx.dfb, 1000), macros: strip.macros.map((v) => milli(v, 1000)), spin: spin ? [milli(strip.lfoRate, 8191), App.clamp(Math.round(spin.high * 10), 0, 10)] : null };
    const rest = !e.delay && !e.reverb && e.dtime === App.DEF.fx.dtime.def && e.dfb === milli(App.DEF.fx.dfb.def, 1000) && e.macros.every((v) => !v) && !e.spin;
    return rest ? null : e;
  }
  function bits(P, grid) {
    const m = M(), w = new Writer();
    w.put(m.tempoIndex(P), 2); w.put(P.song ? 1 : 0, 1); w.put(App.clamp(P.sel.p, 0, 3), 2);
    for (const c of m.costumes(P)) w.put(c, 2);
    const chain = P.chain.slice(0, 32); w.put(chain.length, 6); for (const p of chain) w.put(p, 2);
    const name = plainName(P.name) ? new Uint8Array(0) : new TextEncoder().encode(P.name);
    w.put(name.length ? 1 : 0, 1); if (name.length) { w.put(name.length, 7); for (const b of name) w.put(b, 8); }
    const e = effects(P); w.put(e ? 1 : 0, 1);
    if (e) {
      w.put(e.delay, 10); w.put(e.reverb, 10); w.put(e.dtime, 4); w.put(e.dfb, 10); for (const v of e.macros) w.put(v, 10);
      w.put(e.spin ? 1 : 0, 1); if (e.spin) { w.put(e.spin[0], 13); w.put(e.spin[1], 4); }
    }
    // Which piece of which part has notes, then for each of those: how many, and each as its cell and strength.
    for (let p = 0; p < PIECES; p++) for (let part = 0; part < PARTS; part++) w.put(grid[p][part].length ? 1 : 0, 1);
    for (let p = 0; p < PIECES; p++) for (let part = 0; part < PARTS; part++) {
      const list = grid[p][part]; if (!list.length) continue;
      w.put(list.length / 2 - 1, 6);
      for (let i = 0; i < list.length; i += 2) { w.put(list[i], 6); w.put(list[i + 1], 2); }
    }
    return w.done();
  }
  // The shortest exact code: the bit stream, compressed when that is shorter, or JSON for a song the face cannot make.
  async function encode(P) {
    const grid = cells(P);
    if (!grid) return "J" + b64(await deflate(new TextEncoder().encode(JSON.stringify(data(P)))));
    const raw = bits(P, grid);
    let packed = null; try { packed = await deflate(raw); } catch { /* no compression in this browser: the raw stream */ }
    return packed && packed.length < raw.length ? "B" + b64(packed) : "A" + b64(raw);
  }
  function fromBits(bytes) {
    const m = M(), r = new Reader(bytes), out = { v: 1 };
    out.tempo = r.get(2); out.song = r.get(1); out.piece = r.get(2); out.costumes = [0, 1, 2, 3].map(() => r.get(2));
    const length = r.get(6); out.chain = Array.from({ length }, () => r.get(2));
    if (r.get(1)) { const n = r.get(7); out.name = new TextDecoder().decode(Uint8Array.from({ length: n }, () => r.get(8))); }
    const fx = r.get(1);
    if (fx) {
      const delay = r.get(10) / 1000, reverb = r.get(10) / 1000, dtime = r.get(4), dfb = r.get(10) / 1000, macros = [0, 1, 2, 3].map(() => r.get(10) / 1000);
      out.fx = [App.fromN(App.DEF.fx.mixDelay, delay), App.fromN(App.DEF.fx.mixReverb, reverb), dtime, dfb];
      out.macros = macros; out.spin = r.get(1) ? [r.get(13) / 1000, r.get(4) / 10] : null;
    } else { out.fx = [0, 0, App.DEF.fx.dtime.def, App.DEF.fx.dfb.def]; out.macros = [0, 0, 0, 0]; out.spin = null; }
    const present = Array.from({ length: PIECES * PARTS }, () => r.get(1)), tracks = [...new Set(m.tracks)];
    out.notes = tracks.map(() => Array.from({ length: PIECES }, () => []));
    for (let p = 0; p < PIECES; p++) for (let part = 0; part < PARTS; part++) {
      if (!present[p * PARTS + part]) continue;
      const count = r.get(6) + 1;
      for (let i = 0; i < count; i++) {
        const cell = r.get(6), strength = r.get(2), row = Math.floor(cell / COLS), col = cell % COLS;
        if (row >= ROWS || strength < 1) throw Error("A note outside the grid");
        const n = m.note(part, row, col, strength);
        out.notes[tracks.indexOf(m.tracks[part])][p].push([n.s, n.n, n.l, n.v, n.p, n.r || 1]);
      }
    }
    for (const track of out.notes) for (const clip of track) clip.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // as clips are kept
    return out;
  }
  // The plain object of a code, for the reader in kids.js to check value by value and build the song from.
  async function decode(code) {
    const kind = code[0], bytes = unb64(code.slice(1));
    if (kind === "A") return fromBits(bytes);
    if (kind === "B") return fromBits(await inflate(bytes));
    if (kind === "J" || kind === "z") return JSON.parse(new TextDecoder().decode(await inflate(bytes)));
    if (kind === "j") return JSON.parse(new TextDecoder().decode(bytes));
    throw Error("Unknown song link");
  }
  App.KidsLink = { encode, decode };
})();
