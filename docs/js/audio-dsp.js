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
  // A quarter-hop Hann transform reconstructs the selected bins by overlap-add.
  // All channels use the same mask and retain their independent complex phases.
  const N=4096, hop=N/4;
  const windowFn=Float64Array.from({length:N},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/N));
  const reverseBits=new Uint16Array(N), cos=new Float64Array(N/2), sin=new Float64Array(N/2);
  for(let i=1;i<N;i++)reverseBits[i]=(reverseBits[i>>1]>>1)|((i&1)*N/2);
  for(let k=0;k<N/2;k++){cos[k]=Math.cos(2*Math.PI*k/N);sin[k]=Math.sin(2*Math.PI*k/N);}
  function transform(re,im,inverse=false) {
    for(let i=0;i<N;i++) {
      const j=reverseBits[i];
      if(j>i){const r=re[j],m=im[j];re[j]=re[i];im[j]=im[i];re[i]=r;im[i]=m;}
    }
    for(let size=2;size<=N;size*=2){
      const half=size/2, stride=N/size;
      for(let a=0;a<N;a+=size) for(let j=0;j<half;j++){
        const k=j*stride, i=a+j, b=i+half, c=cos[k], sn=inverse?sin[k]:-sin[k];
        const r=re[b]*c-im[b]*sn, m=re[b]*sn+im[b]*c;
        re[b]=re[i]-r;im[b]=im[i]-m;re[i]+=r;im[i]+=m;
      }
    }
    if(inverse)for(let i=0;i<N;i++){re[i]/=N;im[i]/=N;}
  }
  function windowAt(data,start,re,im){
    im.fill(0);
    for(let i=0;i<N;i++)re[i]=(data[start+i]||0)*windowFn[i];
    transform(re,im);
  }
  async function spectralEdit(buffer,offset,len,box,mode,db,valid=()=>true){
    const sr=buffer.sampleRate, start=Math.max(0,Math.round(offset*sr));
    const count=Math.min(buffer.length-start,Math.round(len*sr));
    if(count<=0 || !Number.isFinite(db) || ![box.from,box.to,box.low,box.high].every(Number.isFinite) ||
      box.to<=box.from || box.high<=box.low || !["gain","isolate","removed"].includes(mode))throw Error("INVALID SPECTRAL SELECTION");
    const a=clamp(Math.round(box.from*sr),0,count), b=clamp(Math.round(box.to*sr),0,count);
    if(a>=b)throw Error("EMPTY TIME RANGE");
    const out=new AudioBuffer({numberOfChannels:buffer.numberOfChannels,sampleRate:sr,length:count});
    const re=new Float64Array(N),im=new Float64Array(N), weights=new Float64Array(N);
    const resolution=sr/N, feather=Math.min(2*resolution,(box.high-box.low)/4);
    const low=box.low-resolution/2, high=box.high+resolution/2;
    for(let k=0;k<N;k++){
      const f=Math.min(k,N-k)*resolution;
      const l=clamp((f-low+feather)/feather,0,1),h=clamp((high-f+feather)/feather,0,1);
      weights[k]=(.5-.5*Math.cos(Math.PI*Math.min(l,h)));
    }
    const fade=Math.max(1,Math.min(Math.round(sr*.004),(b-a)/4));
    const scale=10**(db/20)-1;
    let yielded=performance.now();
    for(let c=0;c<out.numberOfChannels;c++){
      const source=buffer.getChannelData(c).subarray(start,start+count),dest=out.getChannelData(c);
      if(mode==="gain")dest.set(source);
      for(let i=(Math.floor(a/hop)-3)*hop;i<b;i+=hop){
        if(performance.now()-yielded>20){
          await new Promise(resolve=>setTimeout(resolve,0));if(!valid())throw Error("EDIT CANCELLED");
          yielded=performance.now();
        }
        windowAt(source,i,re,im);
        for(let k=0;k<N;k++){re[k]*=weights[k];im[k]*=weights[k];}
        transform(re,im,true);
        for(let j=Math.max(a,i);j<Math.min(b,i+N);j++){
          const edge=Math.min(1,(j-a)/fade,(b-j)/fade), w=(.5-.5*Math.cos(Math.PI*edge))*windowFn[j-i]/1.5;
          const band=re[j-i]*w;
          dest[j]+=band*(mode==="gain"?scale:mode==="removed"?-scale:1);
        }
      }
    }
    return out;
  }
  function spectrogram(buffer,offset,len,width,height){
    const sr=buffer.sampleRate,low=20,nyquist=sr/2;
    const bins=Array.from({length:height+1},(_,i)=>Math.max(1,Math.round((low*(nyquist/low)**(1-i/height))*N/sr)));
    const out=new Uint8ClampedArray(width*height*4),re=new Float64Array(N),im=new Float64Array(N),power=new Float64Array(N/2+1);
    for(let x=0;x<width;x++){
      const at=Math.round((offset+(x+.5)*len/width)*sr)-N/2;power.fill(0);
      for(let c=0;c<Math.min(2,buffer.numberOfChannels);c++){
        windowAt(buffer.getChannelData(c),at,re,im);
        for(let k=1;k<power.length;k++)power[k]+=re[k]**2+im[k]**2;
      }
      for(let j=0;j<height;j++){
        let peak=0;
        for(let k=bins[j+1];k<=bins[j];k++)peak=Math.max(peak,power[k]);
        const db=10*Math.log10(1e-14+peak/(N*N/16*Math.min(2,buffer.numberOfChannels)));
        const value=clamp((db+84)/84,0,1), i=(j*width+x)*4;
        out[i]=6+104*value**3;out[i+1]=13+226*value;out[i+2]=9+135*value**1.5;out[i+3]=255;
      }
    }
    return new ImageData(out,width,height);
  }
  App.AudioDSP = {sliceEdges, transients, warp, spectralEdit, spectrogram};
})();
