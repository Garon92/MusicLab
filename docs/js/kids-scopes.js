/* The signal screens of the kids' face, all fed by the actual stereo output tap. The header shows a wave and a filter
   bank; a tap on them opens the screens up close (kids-view.js): a wave with an afterglow, a fine spectrum with falling
   peaks, a waterfall of pitches over time, the twelve tones on a keyboard, the eight beats of the piece as a flower,
   left and right as a cloud of dots and the loudness of the last seconds. The eighth, who plays how loudly, is drawn by
   kids-view.js from the strips' own meters. Each screen sets data-level; some also say what they read. */
(() => {
  "use strict";
  const left=new Float32Array(4096),right=new Float32Array(4096),samples=new Float32Array(4096);
  let bins=null,source=null,displays=[],frameCount=0;
  const colors=["#f6806e","#ff9b6a","#ffbb5b","#ffd76e","#cde174","#8ee0a7","#64deca","#6acbde","#96b6ed","#b2a1ee","#dea9d8","#f7abc4"];
  const glassColour="#243750",gridColour="#41536a",light="#fff1c9",playing="#f0a53a";
  const kept=new WeakMap(); // what a screen carries from one frame to the next
  const keep=(canvas,make)=>{let m=kept.get(canvas);if(!m){m=make();kept.set(canvas,m);}return m;};
  const decibels=v=>20*Math.log10(Math.max(1e-7,v));
  const lift=v=>App.clamp((decibels(v)+54)/48,0,1); // a level as the screens show it: -54 dB is nothing, -6 dB is full
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const blend=(a,b,t)=>{const x=rgb(a),y=rgb(b);return "rgb("+x.map((v,i)=>Math.round(v+(y[i]-v)*App.clamp(t,0,1))).join(",")+")";};
  const rainbow=t=>{const p=App.clamp(t,0,1)*(colors.length-1),i=Math.min(colors.length-2,Math.floor(p));return blend(colors[i],colors[i+1],p-i);};
  // Night blue for silence, through sea and grass to sun and coral for the loudest.
  const heat=(()=>{
    const stops=[[0,glassColour],[.32,"#2d6585"],[.55,"#64deca"],[.74,"#cde174"],[.88,"#ffd76e"],[1,"#f6806e"]];
    return Array.from({length:256},(_,i)=>{
      const t=i/255,s=stops.findIndex(([at])=>at>=t),[a,ca]=stops[Math.max(0,s-1)],[b,cb]=stops[Math.max(1,s)];
      const x=rgb(ca),y=rgb(cb),k=b>a?(t-a)/(b-a):0;return x.map((v,j)=>Math.round(v+(y[j]-v)*k));
    });
  })();
  function signals(){
    const E=App.E;
    if(!E){samples.fill(0);left.fill(0);right.fill(0);return {peak:0,rms:0,bands:Array(12).fill(0),hz:0};}
    E.anL.getFloatTimeDomainData(left);E.anR.getFloatTimeDomainData(right);
    let peak=0,energy=0;const recent=samples.length-2048;
    for(let i=0;i<samples.length;i++){const v=(left[i]+right[i])*.5;samples[i]=v;peak=Math.max(peak,Math.abs(v));if(i>=recent)energy+=v*v;}
    if(!bins || bins.length!==E.anF.frequencyBinCount)bins=new Float32Array(E.anF.frequencyBinCount);
    E.anF.getFloatFrequencyData(bins);
    const hz=E.ctx.sampleRate/E.anF.fftSize;
    const bands=colors.map((_,i)=>App.clamp((loudest(36*470**(i/12),36*470**((i+1)/12),hz)+78)/65,0,1));
    return {peak,rms:Math.sqrt(energy/2048),bands,hz};
  }
  // The loudest bin between two frequencies, in dB.
  function loudest(fa,fb,hz){
    const a=Math.max(1,Math.floor(fa/hz)),b=Math.min(bins.length,Math.max(a+1,Math.ceil(fb/hz)));
    let hi=-Infinity;for(let k=a;k<b;k++)if(bins[k]>hi)hi=bins[k];
    return hi;
  }
  function fit(canvas){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<2 || h<2)return null;
    const d=Math.min(2,window.devicePixelRatio||1),W=Math.round(w*d),H=Math.round(h*d),fresh=canvas.width!==W||canvas.height!==H;
    if(fresh){canvas.width=W;canvas.height=H;}
    const g=canvas.getContext("2d");g.setTransform(d,0,0,d,0,0);
    return {g,w,h,d,fresh};
  }
  // The glass and its dot grid; a lower alpha leaves an afterglow of the frames before.
  function glass(g,w,h,alpha=1){
    g.globalAlpha=alpha;g.fillStyle=glassColour;g.fillRect(0,0,w,h);g.globalAlpha=1;
    g.fillStyle=gridColour;for(let x=8;x<w;x+=12)for(let y=8;y<h;y+=12)g.fillRect(x,y,1,1);
  }
  function box(g,x,y,w,h,r){g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,r);else g.rect(x,y,w,h);g.fill();}
  function wave(g,w,h,data,span,widths){
    const mid=h/2;
    // Align a rising zero crossing to the frame so a sustained pitch stays still.
    let start=0;for(let i=1;i<1024;i++)if(samples[i-1]<0 && samples[i]>=0){start=i;break;}
    const gain=Math.min(6,.85/Math.max(.001,data.peak));
    const path=()=>{g.beginPath();for(let x=0;x<w;x++){const y=mid-samples[start+Math.floor(x*span/w)]*gain*(h*.46);if(x)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();};
    g.lineJoin="round";g.lineWidth=widths[0];g.strokeStyle="#385868";path();g.lineWidth=widths[1];g.strokeStyle="#84efd1";path();
  }
  const screens={
    wave(c,canvas,data){glass(c.g,c.w,c.h);wave(c.g,c.w,c.h,data,1024,[5,2.4]);},
    bands({g,w,h},canvas,data){
      glass(g,w,h);
      const pad=Math.max(3,w*.035),step=(w-2*pad)/12;
      data.bands.forEach((v,i)=>{
        const bw=Math.max(1,step*.68),x=pad+i*step,y=h-3;
        g.fillStyle=colors[i];const bh=Math.max(2,(h-6)*v);
        g.fillRect(x,y-bh,bw,bh);
        if(h>36 && bw>6){g.fillStyle="#34415a";for(let bar=y-5;bar>y-bh+1;bar-=5)g.fillRect(x,bar,bw,1.2);}
      });
    },
    // The wave up close: twice as long, and each frame fades into the next.
    scope({g,w,h},canvas,data){
      glass(g,w,h,.4);g.fillStyle="#3c5470";g.fillRect(0,Math.round(h/2),w,1);
      wave(g,w,h,data,2048,[7,2.6]);
    },
    // Thirty-two bands from the deepest bass to the highest hiss, each with a cap that falls slowly from its last peak.
    spectrum({g,w,h},canvas,data){
      const n=32,m=keep(canvas,()=>({peaks:new Float32Array(n),last:0,paint:Array.from({length:n},(_,i)=>rainbow(i/(n-1)))}));
      glass(g,w,h);
      const now=performance.now(),fall=m.last?Math.min(.25,(now-m.last)/1000)*.6:0;m.last=now;
      const pad=Math.max(4,w*.03),step=(w-2*pad)/n,bw=Math.max(1,step*.74),floor=h-4,room=h-12;
      for(let i=0;i<n;i++){
        const v=data.hz?App.clamp((loudest(28*570**(i/n),28*570**((i+1)/n),data.hz)+90)/74,0,1):0;
        m.peaks[i]=Math.max(v,m.peaks[i]-fall);
        const x=pad+i*step,bh=Math.max(1.5,room*v);
        g.fillStyle=m.paint[i];g.fillRect(x,floor-bh,bw,bh);
        if(m.peaks[i]>.03){g.fillStyle=light;g.fillRect(x,floor-room*m.peaks[i]-2.5,bw,2);}
      }
    },
    // Pitch over time: the newest sound enters at the right, the deep sounds at the bottom, louder is warmer.
    waterfall({g,w,h,d,fresh},canvas,data){
      const W=canvas.width,H=canvas.height,m=keep(canvas,()=>({}));
      if(fresh || m.H!==H){
        m.H=H;m.carry=0;m.last=0;m.rows=Array.from({length:H},(_,y)=>[28*570**(1-(y+1)/H),28*570**(1-y/H)]);
        g.fillStyle=glassColour;g.fillRect(0,0,w,h);
      }
      const now=performance.now(),dt=m.last?Math.min(250,now-m.last):32;m.last=now;
      m.carry+=dt*.045*d;const dx=Math.min(W,Math.floor(m.carry));if(!dx)return;m.carry-=dx;
      g.setTransform(1,0,0,1,0,0);g.drawImage(canvas,-dx,0);
      if(!m.img || m.img.width!==dx || m.img.height!==H)m.img=g.createImageData(dx,H);
      const px=m.img.data;let hot=0;
      for(let y=0;y<H;y++){
        const v=data.hz?App.clamp((loudest(m.rows[y][0],m.rows[y][1],data.hz)+96)/78,0,1):0,[r,gr,b]=heat[Math.round(v*255)];
        hot=Math.max(hot,v);
        for(let x=0;x<dx;x++){const o=(y*dx+x)*4;px[o]=r;px[o+1]=gr;px[o+2]=b;px[o+3]=255;}
      }
      g.putImageData(m.img,W-dx,0);canvas.dataset.heat=hot.toFixed(3);
    },
    // Which of the twelve tones sound, lit on one octave of keys with their Czech names.
    keys({g,w,h},canvas,data){
      const m=keep(canvas,()=>({shown:new Float32Array(12)})),chroma=new Float64Array(12);
      glass(g,w,h);
      let total=0;
      if(data.hz){
        const a=Math.ceil(100/data.hz),b=Math.min(bins.length,Math.floor(4200/data.hz));
        for(let k=a;k<b;k++){const p=10**(bins[k]/10),tone=((Math.round(12*Math.log2(k*data.hz/440))+69)%12+12)%12;chroma[tone]+=p;total+=p;}
      }
      const most=Math.max(...chroma),gate=App.clamp((10*Math.log10(total+1e-12)+64)/30,0,1);
      let best=-1;
      for(let i=0;i<12;i++){
        const v=most>0?(chroma[i]/most)**2*gate:0;m.shown[i]=Math.max(v,m.shown[i]*.8);
        if(v>.3 && (best<0 || chroma[i]>chroma[best]))best=i;
      }
      canvas.dataset.tone=best<0?"":String(best);
      const x0=Math.max(6,w*.05),kw=(w-2*x0)/7,y0=Math.max(6,h*.1),kh=h-2*y0;
      g.font="750 "+Math.round(App.clamp(kw*.4,10,18))+"px system-ui,sans-serif";g.textAlign="center";g.textBaseline="alphabetic";
      ["C","D","E","F","G","A","H"].forEach((name,i)=>{
        const tone=[0,2,4,5,7,9,11][i],v=m.shown[tone],x=x0+i*kw;
        g.fillStyle=blend("#3a4f66",colors[tone],v);box(g,x+1.5,y0,kw-3,kh,4);
        g.fillStyle=v>.45?"#23303b":"#8fa3b6";g.fillText(name,x+kw/2,y0+kh-Math.max(5,kh*.07));
      });
      for(const [tone,after] of [[1,1],[3,2],[6,4],[8,5],[10,6]]){
        const v=m.shown[tone];g.fillStyle=blend("#16243a",colors[tone],v);box(g,x0+after*kw-kw*.3,y0,kw*.6,kh*.58,3);
      }
    },
    // The eight beats of the piece as a flower. Each petal is as long as its beat sounded the last time round, against
    // the loudest beat: a beat 20 dB quieter than that one has no petal at all.
    rhythm({g,w,h},canvas,data,beat){
      const m=keep(canvas,()=>({heard:new Float32Array(8),now:new Float32Array(8),value:new Float32Array(8),beat:-1}));
      glass(g,w,h);
      if(beat>=0){
        if(beat!==m.beat){m.beat=beat;m.now[beat]=0;}
        m.now[beat]=Math.max(m.now[beat],lift(data.rms));m.heard[beat]+=(m.now[beat]-m.heard[beat])*.5;
      }else{m.beat=-1;for(let i=0;i<8;i++)m.heard[i]*=.95;}
      const top=Math.max(...m.heard);
      for(let i=0;i<8;i++)m.value[i]=App.clamp(1-(top-m.heard[i])*48/20,0,1)*App.clamp(top*1.6,0,1);
      canvas.dataset.beats=Array.from(m.value,v=>v.toFixed(2)).join(",");
      const size=Math.min(w,h),font=Math.round(App.clamp(size*.09,10,17)),R=Math.max(10,size/2-font-6),inner=R*.18,cx=w/2,cy=h/2;
      const petal=(a,len)=>{g.beginPath();g.ellipse(cx+Math.cos(a)*len/2,cy+Math.sin(a)*len/2,Math.max(.5,len/2),Math.max(.5,Math.min(len/2,R*.17)),a,0,Math.PI*2);};
      g.font="750 "+font+"px system-ui,sans-serif";g.textAlign="center";g.textBaseline="middle";
      for(let i=0;i<8;i++){
        const a=-Math.PI/2+i*Math.PI/4,now=i===m.beat;
        petal(a,R);g.fillStyle="#2c425c";g.fill();
        petal(a,inner+(R-inner)*m.value[i]);g.fillStyle=now?playing:i%2?"#64deca":"#8ee0a7";g.fill();
        g.fillStyle=now?playing:"#8fa3b6";g.fillText(String(i+1),cx+Math.cos(a)*(R+font*.8),cy+Math.sin(a)*(R+font*.8));
      }
      g.fillStyle=light;g.beginPath();g.arc(cx,cy,inner*.7,0,Math.PI*2);g.fill();
    },
    // Left and right: one dot for each moment of the sound. Straight up is the middle; echo and the carousel spread it.
    stereo({g,w,h},canvas){
      glass(g,w,h,.42);
      const cx=w/2,cy=h/2,r=Math.min(w,h)*.42;
      g.strokeStyle="#3c5470";g.lineWidth=1;g.beginPath();g.moveTo(cx,cy-r);g.lineTo(cx,cy+r);g.moveTo(cx-r,cy);g.lineTo(cx+r,cy);g.stroke();
      g.font="750 "+Math.round(App.clamp(r*.2,10,16))+"px system-ui,sans-serif";g.textBaseline="middle";g.fillStyle="#8fa3b6";
      g.textAlign="left";g.fillText("L",6,cy);g.textAlign="right";g.fillText("P",w-6,cy);
      let peak=0;for(let i=2048;i<4096;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
      const k=.9*r/(2*Math.max(.01,peak));let el=0,er=0,mid=0,side=0;
      g.fillStyle="#84efd1";g.globalAlpha=.6;
      for(let i=2048;i<4096;i+=2){const l=left[i],q=right[i];el+=l*l;er+=q*q;mid+=(l+q)**2;side+=(q-l)**2;g.fillRect(cx+(q-l)*k-.8,cy-(l+q)*k-.8,1.6,1.6);}
      g.globalAlpha=1;
      const a=Math.sqrt(el),b=Math.sqrt(er),lean=a+b>1e-6?(b-a)/(a+b):0;canvas.dataset.lean=lean.toFixed(3);
      // 0 in the middle, more as the sound spreads; read only while something sounds, as a fading tail is mostly noise.
      if(mid/1024>1.6e-5)canvas.dataset.width=Math.sqrt(side/mid).toFixed(3);
      g.fillStyle=light;box(g,cx+lean*r-4,h-7,8,4,2);
    },
    // How strongly the band played over the last six seconds; the red lamp lights while the limiter holds it down.
    loudness({g,w,h},canvas,data){
      const m=keep(canvas,()=>({list:[]})),now=performance.now(),span=6000;
      glass(g,w,h);
      m.list.push([now,lift(data.rms)]);while(m.list.length && now-m.list[0][0]>span)m.list.shift();
      const x=t=>w-(now-t)/span*w,y=v=>h-4-v*(h-10);
      g.fillStyle="#34485f";for(const v of [.25,.5,.75])g.fillRect(0,Math.round(y(v)),w,1);
      const fill=g.createLinearGradient(0,y(0),0,y(1));fill.addColorStop(0,"#8ee0a7");fill.addColorStop(.62,"#ffd76e");fill.addColorStop(1,"#f6806e");
      g.beginPath();g.moveTo(x(m.list[0][0]),h);for(const [t,v] of m.list)g.lineTo(x(t),y(v));g.lineTo(w,h);g.closePath();
      g.globalAlpha=.85;g.fillStyle=fill;g.fill();g.globalAlpha=1;
      g.strokeStyle=light;g.lineWidth=1.6;g.lineJoin="round";g.beginPath();m.list.forEach(([t,v],i)=>i?g.lineTo(x(t),y(v)):g.moveTo(x(t),y(v)));g.stroke();
      const held=!!App.E?.limiting?.();canvas.dataset.limiting=String(held);
      if(held){g.fillStyle="#ff5a4a";g.beginPath();g.arc(w-10,10,5,0,Math.PI*2);g.fill();}
    }
  };
  function draw(root,f={}){
    // Overlay and band pages can be replaced on a completed edit.
    if(source!==root || ++frameCount%8===0 || displays.some(el=>!el.isConnected)){
      source=root;displays=Array.from(root.querySelectorAll("canvas[data-kid-screen]"));
    }
    const data=signals(),beat=Number.isInteger(f.step)?f.step:-1;
    for(const canvas of displays){
      if(!canvas.clientWidth || canvas.closest('[data-frozen="true"]'))continue;
      const c=fit(canvas);if(!c)continue;
      screens[canvas.dataset.kidScreen]?.(c,canvas,data,beat);
      canvas.dataset.level=data.peak.toFixed(4);
    }
  }
  App.KidsScopes={draw,kinds:Object.keys(screens)};
})();
