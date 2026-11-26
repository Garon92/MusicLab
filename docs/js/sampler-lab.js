/* Pitched grain clouds and multisample mappings share the normal sampler voice path. */
(() => {
  "use strict";
  const {h,btn}=App.UI, {clamp}=App;
  const bounded=(v,lo,hi,def)=>Number.isFinite(v)?clamp(Math.round(v),lo,hi):def;
  function cleanZone(z) {
    if (!z || typeof z.sample!=="string" || !/^[a-z0-9]{6,24}$/.test(z.sample)) return null;
    const lo=bounded(z.lo,0,127,0), vl=bounded(z.vl,1,127,1);
    return {sample:z.sample,root:bounded(z.root,0,127,60),lo,hi:bounded(z.hi,lo,127,127),vl,vh:bounded(z.vh,vl,127,127)};
  }
  App.extendProject({
    load(P,raw) {
      P.tracks.forEach((t,i)=>{
        const list=raw.tracks?.[i]?.smp?.zones;
        t.smp.zones=Array.isArray(list)?list.slice(0,128).map(cleanZone).filter(Boolean):[];
      });
    },
    sampleIds(P,ids) { for(const t of P.tracks) for(const z of t.smp.zones||[]) ids.add(z.sample); },
    remapSample(P,from,to) { for(const t of P.tracks) for(const z of t.smp.zones||[]) if(z.sample===from)z.sample=to; }
  });

  // A narrower overlapping zone wins. Identical key and velocity ranges form
  // an alternating set, with independent counters for each engine and mapping.
  function pickZone(d,n,vel,counters) {
    const v=clamp(Math.round(vel*127),1,127), matches=[];
    let score=Infinity;
    for(const z of d.zones || []) {
      if(n<z.lo || n>z.hi || v<z.vl || v>z.vh || !App.samples.has(z.sample))continue;
      const size=(z.hi-z.lo+1)*(z.vh-z.vl+1);
      if(size<score) { score=size; matches.length=0; }
      if(size===score && (!matches.length || (matches[0].lo===z.lo && matches[0].hi===z.hi && matches[0].vl===z.vl && matches[0].vh===z.vh))) matches.push(z);
    }
    if(matches.length<2)return matches[0];
    let counts=counters.get(d);
    if(!counts)counters.set(d,counts=new Map());
    const key=[matches[0].lo,matches[0].hi,matches[0].vl,matches[0].vh].join("/");
    const i=(counts.get(key)||0)%matches.length;
    counts.set(key,i+1);
    return matches[i];
  }

  const cache=new WeakMap();
  const keyOf=(d,note)=>[d.gpos,d.gsize,d.gdens,d.gspray,d.st,d.en,d.rev,d.tune,d.root,note].join("/");
  function grains(buf,d,note,key,pitchRatio) {
    let bank=cache.get(buf);
    if(!bank)cache.set(buf,bank=new Map());
    if(bank.has(key)) {
      const cached=bank.get(key);bank.delete(key);bank.set(key,cached);return cached;
    }
    const sr=Math.min(buf.sampleRate,48000), n=Math.round(sr*1.4);
    const result=new AudioBuffer({length:n,numberOfChannels:Math.min(2,buf.numberOfChannels),sampleRate:sr});
    const width=Math.max(1,Math.round(d.gsize*sr)), count=Math.max(2,Math.round(d.gdens*n/sr));
    const step=buf.sampleRate/sr * pitchRatio*2**(d.tune/12);
    const low=clamp(Math.floor(Math.min(d.st,d.en)*buf.length),0,buf.length-1);
    const high=clamp(Math.ceil(Math.max(d.st,d.en)*buf.length),low+1,buf.length), span=high-low;
    const readWidth=width*step, scale=1/Math.max(1,.55*count*width/n), window=new Float32Array(width);
    for(let j=0;j<width;j++)window[j]=scale*(.5-.5*Math.cos(2*Math.PI*j/(width-1)));
    // Each grain has its own source position, envelope, and playback pitch.
    // Wrap *overlaps* at both ends to produce a click-free sustainable cloud.
    let state=147733;
    const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
    for(let g=0;g<count;g++) {
      const slot=Math.round((g+(random()-.5)*.28)*n/count+n)%n;
      const middle=clamp(d.gpos+(random()-.5)*2*d.gspray,0,1);
      const first=clamp(middle*span-readWidth*.5,0,Math.max(0,span-readWidth));
      for(let ch=0;ch<result.numberOfChannels;ch++) {
        const input=buf.getChannelData(ch),output=result.getChannelData(ch);
        const increment=d.rev?-step:step;
        let cursor=(first+(d.rev?(width-1)*step:0))%span, o=slot;
        for(let j=0;j<width;j++) {
          const whole=Math.floor(cursor), pos=low+whole, next=pos+1<high?pos+1:low;
          output[o]+=window[j]*(input[pos]+(cursor-whole)*(input[next]-input[pos]));
          cursor+=increment;
          if(cursor<0 || cursor>=span)cursor-=Math.floor(cursor/span)*span;
          if(++o===n)o=0;
        }
      }
    }
    // A player may sweep through thousands of positions during a session.
    if(bank.size>=12)bank.delete(bank.keys().next().value);
    bank.set(key,result);return result;
  }
  function grainVoice(ctx,time,head,pitch,sample,d,note,pitchRatio=2**((note-d.root)/12)) {
    const lifetime=ctx.createConstantSource();
    lifetime.offset.value=0;lifetime.connect(head);lifetime.start(time);
    const nodes=new Set();let active=null,key="";
    const disposeNode=pair=>{
      if(!nodes.delete(pair))return;
      if(pair.source.detune)try{pitch.disconnect(pair.source.detune);}catch{}
      pair.source.disconnect();pair.gain.disconnect();
    };
    function refresh(cfg,end=Infinity) {
      const id=keyOf(cfg,note)+"/"+pitchRatio, start=active?Math.max(time,ctx.currentTime+.004):time;
      if(id===key || start>=end || cfg.id!==sample.id)return;
      key=id;
      const source=ctx.createBufferSource(),gain=ctx.createGain(), fade=.022;
      source.buffer=grains(sample.buffer,cfg,note,id,pitchRatio);source.loop=true;
      if(source.detune)pitch.connect(source.detune);
      source.connect(gain).connect(head);
      const pair={source,gain};nodes.add(pair);
      source.onended=()=>disposeNode(pair);
      if(active) {
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+fade);
        const old=active;old.gain.gain.setTargetAtTime(0,start,fade/4);
        old.source.stop(Math.min(end,start+fade*2));
      }
      active=pair;source.start(start,(start-time)%source.buffer.duration);
      if(Number.isFinite(end))source.stop(end);
    }
    refresh(d);
    return {lifetime,refresh,stop(at){if(active)try{active.source.stop(at);}catch{}},
      dispose(){for(const p of nodes){try{p.source.stop();}catch{}disposeNode(p);}lifetime.disconnect();}};
  }

  const field=(label,el)=>h("label.ast-field",null,h("span",{text:label}),el);
  function zones(ti) {
    const P=App.P, d=P.tracks[ti].smp;
    const dlg=App.Workspace.begin("Multisample zones"),body=h("div.dlg-body.ast-body");
    dlg.classList.add("ast-dialog","zone-dialog");dlg.setAttribute("data-instrument-keys","");
    const zones=d.zones;let at=0,info="",busy=false,preview=null;
    const current=()=>P===App.P && P.tracks[ti].smp===d && dlg.open;
    // A map with no zones plays nothing, so the sampler goes back to its own recording when the last one leaves.
    function commit(message) {if(!current())return;d.mode=zones.length?3:0;App.commit();App.Dv.build();App.Ed.sync();App.Mx.draw();info=message;draw();}
    const zoneDefault={root:60,lo:0,hi:127,vl:1,vh:127};
    function number(label,key,lo,hi,z) {
      const el=h("input",{type:"number","aria-label":label,value:z[key],min:lo,max:hi,step:1,"data-reset":App.clamp(zoneDefault[key],lo,hi)});
      el.onchange=()=>{if(!el.reportValidity())return;z[key]=el.valueAsNumber;commit("");};
      return field(label,el);
    }
    function place(sample,root,lo,hi,vl=1,vh=127){return {sample,root,lo,hi,vl,vh};}
    const pitchFrom=name=>{
      const match=name.match(/(?:^|[^a-z0-9])([a-g])([#b]?)(-?\d)(?=$|[^a-z0-9])/i);
      if(!match)return null;
      const n=12*(+match[3]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()]+(match[2]==="#"?1:match[2].toLowerCase()==="b"?-1:0);
      return n>=0 && n<=127?n:null;
    };
    async function load(files) {
      if(busy || !current())return;
      if(zones.length+files.length>128){info="A map holds 128 samples.";draw();return;}
      busy=true;info="Loading samples…";draw();
      try {
        const imported=[];
        for(const file of files) {
          if(!current())return;
          const id=await App.addSample(file.name,file);
          imported.push({id,root:pitchFrom(file.name)??d.root,
            vel:bounded(Number(file.name.match(/(?:^|[_ .-])v(?:el)?(\d{1,3})(?:$|[_ .-])/i)?.[1]),1,127,80)});
        }
        if(!current() || !imported.length)return;
        const sortedUnique=arr=>[...new Set(arr)].sort((a,b)=>a-b);
        const roots=sortedUnique(imported.map(s=>s.root));
        const bounds=(values,n,lo,hi)=>{
          const i=values.indexOf(n);return [i?Math.floor((values[i-1]+n)/2)+1:lo,i+1===values.length?hi:Math.floor((n+values[i+1])/2)];
        };
        const start=zones.length;
        for(const s of imported) {
          const keys=bounds(roots,s.root,0,127);
          const velocities=sortedUnique(imported.filter(other=>other.root===s.root).map(other=>other.vel));
          zones.push(place(s.id,s.root,...keys,...bounds(velocities,s.vel,1,127)));
        }
        at=start;commit("Added "+imported.length+" sample"+(imported.length===1?"":"s"));
      }catch(e){info=e.message||"Cannot decode audio.";}
      finally{busy=false;if(current())draw();}
    }
    function audition(z) {
      const s=App.samples.get(z.sample), E=App.audio();if(!s || !E)return;
      try{preview?.stop();}catch{}
      const source=E.ctx.createBufferSource(),g=E.ctx.createGain(),start=E.ctx.currentTime+.008,len=Math.min(s.buffer.duration,1.5);
      source.buffer=s.buffer;source.connect(g).connect(E.tracks[ti].instrument);
      g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.6,start+Math.min(.007,len/2));
      g.gain.setTargetAtTime(0,start+Math.max(.005,len-.015),.004);
      source.onended=()=>{source.disconnect();g.disconnect();};source.start(start,0,len);preview=source;
    }
    function draw() {
      const z=zones[at],name=x=>App.samples.get(x.sample)?.name||"Missing sample";
      const list=h("select",{"aria-label":"Zone"},zones.map((z,i)=>h("option",{value:i,text:(i+1)+" · "+name(z)})));
      list.value=at;list.onchange=()=>{at=+list.value;draw();};
      const add=btn("Import samples…","Load files and build zones from pitch and velocity in their names",()=>App.pickFile("audio/*",load));
      add.disabled=busy;
      const use=btn("Add loaded sample","Use the main sampler recording as a zone",()=>{
        at=zones.length;zones.push(place(d.id,d.root,0,127));commit("Added loaded sample");
      });
      use.disabled=busy || !App.samples.has(d.id) || zones.length>=128;
      const chart=h("canvas.zone-map",{"aria-label":"Mapped notes (horizontal) and velocity (vertical)","role":"img"});
      const status=h("output.ast-status",{role:"status",text:info});
      body.replaceChildren(h("h2",{text:"Multisample zones"}),
        h("div.ast-toolbar",null,add,use, d.mode!==3 && zones.length?btn("Play zones","Switch this sampler to zone playback",()=>commit("Zone playback enabled")):null, h("p.dlg-tip",{text:"FILE NAMES LIKE GLASS_C4_V80_RR1.WAV SET ROOT AND VELOCITY LAYER"})),chart);
      if(z){
        const hear=btn("Audition sample","Play the original recording for this zone",()=>audition(z));
        const remove=btn("Remove zone","Remove this assignment from the instrument",()=>{zones.splice(at,1);at=Math.max(0,Math.min(at,zones.length-1));commit(zones.length?"Removed zone":"Removed the last zone · the sampler plays its own sample again");});
        body.append(h("div.ast-toolbar",null,field("Zone",list),hear,remove),
          h("div.ast-toolbar",null,number("Root note","root",0,127,z),number("Low key","lo",0,z.hi,z),
            number("High key","hi",z.lo,127,z),number("Low velocity","vl",1,z.vh,z),number("High velocity","vh",z.vl,127,z)),
          h("small",{text:App.noteName(z.lo)+" – "+App.noteName(z.hi)+" · root "+App.noteName(z.root)}),
          h("p.dlg-tip",{text:"SAME RANGES PLAY ROUND ROBIN · NARROWER OVERLAPS WIN"}));
      }else body.append(h("p.dlg-tip",{text:"IMPORT RECORDINGS OR MAP THE LOADED SAMPLE"}));
      body.append(status);
      requestAnimationFrame(()=>{
        if(!chart.isConnected)return;
        App.UI.fit(chart);const ctx=chart.getContext("2d"),w=chart.width,hh=chart.height,f=window.devicePixelRatio||1;
        const pad=20*f,height=hh-pad;
        ctx.fillStyle=App.C.r0;ctx.fillRect(0,0,w,hh);ctx.font=(10*f)+"px monospace";
        for(let n=0;n<128;n+=12){const x=Math.round(n*w/128);ctx.fillStyle=App.C.ln2;ctx.fillRect(x,0,f,height);ctx.fillStyle=App.C.t3;ctx.fillText(App.noteName(n),x+2,hh-4*f);}
        for(const i of [...zones.keys()].filter(i=>i!==at).concat(z?[at]:[])){
          const m=zones[i], x=m.lo*w/128,y=(127-m.vh)*height/127,sw=(m.hi-m.lo+1)*w/128,h=(m.vh-m.vl+1)*height/127;
          const c=i===at?App.C.am:App.C.t1;ctx.fillStyle=c;ctx.globalAlpha=.2;ctx.fillRect(x,y,sw,h);ctx.globalAlpha=1;ctx.strokeStyle=c;ctx.strokeRect(x+.5,y+.5,Math.max(1,sw-1),Math.max(1,h-1));
          if(i===at){ctx.fillRect(m.root*w/128,y,Math.max(1,f),h);}
        }
      });
      chart.onpointerdown=e=>{
        const b=chart.getBoundingClientRect(),note=clamp(Math.floor((e.clientX-b.left)/b.width*128),0,127),v=clamp(Math.round(127-(e.clientY-b.top)*127/(b.height-20)),1,127);
        const hits=zones.map((z,i)=>note>=z.lo && note<=z.hi && v>=z.vl && v<=z.vh?i:-1).filter(i=>i>=0);
        if(hits.length){at=hits[(hits.indexOf(at)+1)%hits.length];draw();}
      };
    }
    dlg.append(body);dlg.showModal();draw();
    dlg.addEventListener("close",()=>{try{preview?.stop();}catch{}},{once:true});
  }
  App.SamplerLab={pickZone,grainVoice,zones};
})();
