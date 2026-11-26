/* A time trace and logarithmic filter bank share the actual stereo output tap. */
(() => {
  "use strict";
  const samples=new Float32Array(4096),right=new Float32Array(4096);
  let bins=null,source=null,displays=[],frameCount=0;
  const colors=["#f6806e","#ff9b6a","#ffbb5b","#ffd76e","#cde174","#8ee0a7","#64deca","#6acbde","#96b6ed","#b2a1ee","#dea9d8","#f7abc4"];
  function signals(){
    const E=App.E;
    if(!E){samples.fill(0);return {peak:0,bands:Array(12).fill(0)};}
    E.anL.getFloatTimeDomainData(samples);E.anR.getFloatTimeDomainData(right);
    let peak=0;
    for(let i=0;i<samples.length;i++){samples[i]=(samples[i]+right[i])*.5;peak=Math.max(peak,Math.abs(samples[i]));}
    if(!bins || bins.length!==E.anF.frequencyBinCount)bins=new Float32Array(E.anF.frequencyBinCount);
    E.anF.getFloatFrequencyData(bins);
    const scale=E.anF.fftSize/E.ctx.sampleRate;
    const bands=colors.map((_,i)=>{
      const a=Math.max(1,Math.floor(36*470**(i/12)*scale)),b=Math.min(bins.length,Math.max(a+1,Math.ceil(36*470**((i+1)/12)*scale)));
      let hi=-Infinity;for(let k=a;k<b;k++)hi=Math.max(hi,bins[k]);
      return App.clamp((hi+78)/65,0,1);
    });
    return {peak,bands};
  }
  function screen(canvas,data,kind){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<2 || h<2)return;
    const d=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
    const g=canvas.getContext("2d");g.setTransform(d,0,0,d,0,0);g.fillStyle="#243750";g.fillRect(0,0,w,h);
    g.fillStyle="#41536a";
    for(let x=8;x<w;x+=12)for(let y=8;y<h;y+=12)g.fillRect(x,y,1,1);
    if(kind==="wave"){
      const span=1024,mid=h/2;
      // Align a rising zero crossing to the frame so a sustained pitch stays still.
      let start=0;for(let i=1;i<1024;i++)if(samples[i-1]<0 && samples[i]>=0){start=i;break;}
      const gain=Math.min(6,.85/Math.max(.001,data.peak));
      const path=()=>{g.beginPath();for(let x=0;x<w;x++){const y=mid-samples[start+Math.floor(x*span/w)]*gain*(h*.46);if(x)g.lineTo(x,y);else g.moveTo(x,y);}g.stroke();};
      g.lineWidth=5;g.strokeStyle="#385868";path();g.lineWidth=2.4;g.lineJoin="round";g.strokeStyle="#84efd1";path();
    }else{
      const pad=Math.max(3,w*.035),step=(w-2*pad)/12;
      data.bands.forEach((v,i)=>{
        const bw=Math.max(1,step*.68),x=pad+i*step,y=h-3;
        g.fillStyle=colors[i];const bh=Math.max(2,(h-6)*v);
        g.fillRect(x,y-bh,bw,bh);
        if(h>36 && bw>6){g.fillStyle="#34415a";for(let bar=y-5;bar>y-bh+1;bar-=5)g.fillRect(x,bar,bw,1.2);}
      });
    }
    canvas.dataset.level=data.peak.toFixed(4);
  }
  function draw(root){
    // Overlay and band pages can be replaced on a completed edit.
    if(source!==root || ++frameCount%8===0 || displays.some(el=>!el.isConnected)){
      source=root;displays=Array.from(root.querySelectorAll("canvas[data-kid-screen]"));
    }
    const data=signals();
    for(const c of displays)if(c.clientWidth && !c.closest('[data-frozen="true"]'))screen(c,data,c.dataset.kidScreen);
  }
  App.KidsScopes={draw};
})();
