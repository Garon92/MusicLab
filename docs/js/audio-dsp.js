/* Sample editing in original-buffer coordinates. All channels share the same grain offsets. */
(() => {
  "use strict";
  const { clamp } = App;

  function sliceEdges(d) {
    const a = Math.min(d.st, d.en), b = Math.max(d.st, d.en);
    const markers = d.markers?.length === d.slices - 1 ? d.markers :
      Array.from({length:d.slices - 1}, (_, i) => (i + 1) / d.slices);
    return [a, ...markers.map(f => a + (b - a) * f), b];
  }

  function transients(buffer, lo, hi, limit) {
    const sr = buffer.sampleRate, hop = Math.max(16, Math.round(sr * .005));
    const start = Math.floor(lo * buffer.length), end = Math.ceil(hi * buffer.length);
    const channels = Array.from({length:buffer.numberOfChannels}, (_, c) => buffer.getChannelData(c));
    const flux = [];
    let previous = 0, average = 0;
    for (let i = start; i < end; i += hop) {
      let power = 0;
      for (const x of channels) for (let j = i; j < Math.min(i + hop, end); j += 2) {
        const high = x[j] - x[Math.max(0, j - 2)];
        power += x[j] * x[j] + 4 * high * high;
      }
      const level = Math.sqrt(2 * power / (hop * channels.length));
      flux.push(Math.max(0, level - previous - .3 * average));
      average = .9 * average + .1 * Math.abs(level - previous);
      previous = level;
    }
    let max = 0;
    for (const value of flux) max = Math.max(max, value);
    const candidates = [];
    for (let i = 1; i < flux.length - 1; i++) {
      if (flux[i] < Math.max(.002, max * .055) || flux[i] <= flux[i - 1] || flux[i] < flux[i + 1]) continue;
      const f = i * hop / (end - start);
      if (f > .003 && f < .997) candidates.push({f, value:flux[i]});
    }
    const found = [], spacing = .035 * sr / (end - start);
    for (const c of candidates.sort((a,b) => b.value - a.value)) {
      if (found.every(f => Math.abs(f - c.f) >= spacing)) found.push(c.f);
      if (found.length >= limit - 1) break;
    }
    return found.sort((a,b) => a - b);
  }

  // Waveform-similarity overlap-add. Search against the already chosen previous
  // grain, then use one complementary cosine crossfade for the stereo pair.
  async function warp(buffer, ratio, anchors = [], valid = () => true) {
    if (!Number.isFinite(ratio) || ratio < .125 || ratio > 8) throw Error("STRETCH RANGE IS ⅛× TO 8×");
    const n = buffer.length, sr = buffer.sampleRate, length = Math.max(1, Math.round(n * ratio));
    if (length > sr * 1200) throw Error("STRETCHED SAMPLE EXCEEDS 20 MIN");
    const points = [[0,0], ...anchors, [1,1]];
    for (let i = 1; i < points.length; i++) {
      const [x,y] = points[i], [px,py] = points[i-1];
      if (!(x > px && y > py && x <= 1 && y <= 1)) throw Error("ANCHORS MUST INCREASE ON BOTH AXES");
    }
    const out = new AudioBuffer({numberOfChannels:buffer.numberOfChannels, length, sampleRate:sr});
    const data = [], dest = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      data.push(buffer.getChannelData(c)); dest.push(out.getChannelData(c));
    }
    let ref = data[0], peak = 0;
    for (const channel of data) {
      let power = 0;
      for (let i = 0; i < n; i += Math.max(1,Math.floor(n / 4096))) power += channel[i] ** 2;
      if (power > peak) { peak = power; ref = channel; }
    }
    let lastYield = performance.now();
    for (let p = 1; p < points.length; p++) {
      const a = Math.round(n * points[p-1][0]), b = Math.round(n * points[p][0]);
      const l = Math.round(length * points[p-1][1]), r = Math.round(length * points[p][1]);
      const hop = Math.max(1, Math.min(Math.round(sr * .023), Math.floor((b - a) / 3), Math.floor((r - l) / 2)));
      const search = Math.min(hop, Math.round(sr * .012)), stride = Math.max(1, Math.floor(sr / 9000));
      const fade = Float32Array.from({length:hop}, (_,i) => .5 - .5 * Math.cos(Math.PI * i / hop));
      let prev = a;
      for (let pos = l; pos < r; pos += hop) {
        if (performance.now() - lastYield > 20) {
          await new Promise(resolve => setTimeout(resolve, 0));
          if (!valid()) throw Error("EDIT CANCELLED");
          lastYield = performance.now();
        }
        const span = Math.min(hop * 2, r - pos, b - a);
        const expected = clamp(Math.round(a + (pos - l) * (b - a) / (r - l)), a, b - span);
        let chosen = expected;
        if (pos > l && hop > 4) {
          const from = Math.max(a, expected - search), to = Math.min(b - span, expected + search);
          let score = -Infinity;
          const similarity = (s) => {
            let cross = 0, norm = 1e-12;
            for (let j = 0; j < Math.min(hop, span, b - prev - hop); j += stride * 2) {
              const y = ref[s + j];
              cross += ref[prev + hop + j] * y; norm += y * y;
            }
            return cross / Math.sqrt(norm) - 1e-8 * Math.abs(s - expected);
          };
          // A coarse search locates the period, then refine to a single frame.
          for (let s = from; s <= to; s += stride * 2) {
            const value = similarity(s);
            if (value > score) { score = value; chosen = s; }
          }
          const coarse = chosen;
          for (let s = Math.max(from, coarse - stride * 2); s <= Math.min(to, coarse + stride * 2); s++) {
            const value = similarity(s);
            if (value > score) { score = value; chosen = s; }
          }
        }
        for (let c = 0; c < data.length; c++) for (let j = 0; j < span; j++) {
          const v = data[c][chosen+j];
          dest[c][pos+j] = pos > l && j < hop ? dest[c][pos+j] * (1 - fade[j]) + v * fade[j] : v;
        }
        prev = chosen;
      }
    }
    return out;
  }
  App.AudioDSP = {sliceEdges, transients, warp};
})();
