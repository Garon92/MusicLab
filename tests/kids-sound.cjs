"use strict";
/* The sound room acts on the whole band and the whole song: four scenes, each a pair of settings the console also
   edits (master returns, the strips' macros, the strips' LFO). Measured offline where it is a sound. */
const assert=require("node:assert/strict");

module.exports=async function kidsSound(reference) {
  const context=await reference.context().browser().newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage(), errors=[];
  page.setDefaultTimeout(9000);page.on("pageerror",e=>errors.push(e.message));
  const url=new URL(reference.url());url.search="?kids";
  const room=page.locator("#kids-sound"), inline=page.locator("#kids-inline-sound");
  const key=(k,host=room)=>host.locator('[data-sound="'+k+'"]');
  const band=(k,i)=>page.locator('#kids-band [data-k="'+k+'"]'+(i===undefined?"":'[data-index="'+i+'"]')).filter({visible:true});
  const mode=(m,host=room)=>host.locator('[data-sound="mode"][data-mode="'+m+'"]');
  // What every strip of the band holds, so a setting can be seen to reach all of them.
  const settings=()=>page.evaluate(()=>{
    const strips=[...new Set(App.KidsMusic.tracks)].map(i=>App.P.rack.strips[i]);
    const lfo=s=>s.routes.find(r=>r.source==="lfo"&&r.target==="pan");
    return {fx:[App.P.fx.mixDelay,App.P.fx.mixReverb],macros:strips.map(s=>s.macros.join("/")),spin:strips.map(s=>lfo(s)?s.lfoRate.toFixed(3)+"@"+lfo(s).high:"off")};
  });
  async function holdUntil(target,fn) {
    const b=await target.boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    try {await fn();} finally {await page.mouse.up();}
  }
  async function checkBounds(host){
    for(const [width,height] of [[1100,620],[1280,720],[1366,768],[1600,900],[1920,1080],[2560,1080]]){
      await page.setViewportSize({width,height});
      const issues=await host.evaluate(root=>{
        const out=[];
        for(const el of [root,root.querySelector(".ks-shell")])
          if(el.scrollWidth>el.clientWidth+1 || el.scrollHeight>el.clientHeight+1)out.push("Overflow");
        for(const el of root.querySelectorAll("[data-sound],.kv-history button")){
          if(!el.getClientRects().length)continue;
          const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          if(b.width<63.9 || b.height<63.9 || b.x<0 || b.y<0 || b.right>innerWidth+.5 || b.bottom>innerHeight+.5 ||
            (!el.disabled && !el.contains(hit)))out.push(el.getAttribute("aria-label"));
          const caption=el.querySelector(".ks-key-name,.kv-caption"),icon=el.querySelector(":scope > svg");
          if(caption){
            const range=document.createRange();range.selectNodeContents(caption);
            const text=range.getBoundingClientRect();
            if(text.left<b.left || text.right>b.right || text.bottom>b.bottom || (icon && text.top<icon.getBoundingClientRect().bottom-1))
              out.push("Clipped button caption: "+caption.textContent);
          }
        }
        const box=s=>root.querySelector(s).getBoundingClientRect();
        const pad=box(".ks-pad"),left=box("[data-end='0']"),right=box("[data-end='1']"),down=box("[data-end='2']"),up=box("[data-end='3']");
        const trail=box(".ks-trail"),xRuler=box(".ks-axis-x .ks-ruler"),yRuler=box(".ks-axis-y .ks-ruler");
        if(Math.abs(trail.width-trail.height)>1 || Math.abs(pad.width-pad.height)>1 || Math.abs(xRuler.width-yRuler.height)>1)out.push("XY pad and rulers must be square");
        if(left.top<pad.bottom || left.right>=right.left || down.right>pad.left || up.right>pad.left ||
          up.bottom>pad.top+pad.height/2 || down.top<pad.top+pad.height/2)out.push("Axis ends must sit on the matching sides of the playing field");
        if(box(".ks-puck").width<42 || box("button[data-mode] svg").width<32)out.push("Sound pictures too small");
        const heading=root.querySelector(".ks-heading");
        if(!heading || heading.getBoundingClientRect().bottom>pad.top)out.push("The heading says what the room acts on, above the pad");
        return out;
      });
      assert.deepEqual(issues,[],width+"×"+height+" sound controls");
    }
    await page.setViewportSize({width:1280,height:720});
  }
  try {
    await page.goto(url.href);await key("pad",inline).waitFor();
    await page.mouse.click(5,5);
    // A second touch can open the shelf while the first still holds the effect pad.
    await holdUntil(key("pad",inline),async()=>{
      assert.equal(await inline.locator(".ks-pad.held").count(),1);
      await band("shelf").evaluate(b=>b.click());
      assert.equal(await inline.locator(".ks-pad.held").count(),0);
    });
    await band("back").click();
    // One setting for everyone: the room says so, and there is nothing to choose about where it applies.
    assert.equal(await inline.locator(".ks-target-name").innerText(),"Celá kapela");
    assert.equal(await inline.locator(".ks-scope-name").innerText(),"Celá písnička");
    assert.equal(await inline.locator(".ks-scope, [data-sound=arm], [data-sound=reverse]").count(),0);
    assert.deepEqual(await inline.locator("[data-mode] .ks-key-name").allTextContents(),["Ozvěna","Ostrost","Chvění","Kolotoč"]);
    // The hold above put the picture in the middle of the cave: reset takes the band back out.
    assert.equal(await key("reset",inline).isEnabled(),true);await key("reset",inline).click();
    assert.equal(await key("reset",inline).isDisabled(),true,"at rest there is nothing to reset");
    const clean=await settings();
    // Each scene: the corners of the pad reach the ends of both settings on every strip at once, and the marker beside
    // each ruler follows the picture.
    const scenes=[
      ["echo","Bez dozvuku","Doznívá",s=>s.fx],
      ["colour","Čistý","Drsný",s=>[1-+s.macros[0].split("/")[1],+s.macros[0].split("/")[0]]],
      ["motion","Klid","Silně",s=>[+s.macros[0].split("/")[3],+s.macros[0].split("/")[2]]],
      ["spin","Na místě","Dokola",s=>s.spin[0]==="off"?[null,0]:[+s.spin[0].split("@")[0],+s.spin[0].split("@")[1]]]
    ];
    for(const [id,bottom,top,pick] of scenes){
      await mode(id,inline).click();await checkBounds(inline);
      assert.deepEqual(await inline.locator(".ks-axis-y .ks-end").allTextContents(),[top,bottom]);
      const trial=async(x,y)=>{
        const r=await inline.locator(".ks-trail").boundingBox();
        await page.mouse.click(r.x+r.width*x,r.y+r.height*(1-y));
        await page.waitForTimeout(60);
        const s=await settings(),marks=await inline.evaluate(el=>{
          const rect=q=>el.querySelector(q).getBoundingClientRect(),p=rect(".ks-puck"),h=rect(".ks-axis-x .ks-ruler>i"),v=rect(".ks-axis-y .ks-ruler>i");
          return {xError:Math.abs((h.left+h.width/2)-(p.left+p.width/2)),yError:Math.abs((v.top+v.height/2)-(p.top+p.height/2))};
        });
        return {s,vals:pick(s),...marks};
      };
      const low=await trial(.2,0),high=await trial(.2,1),right=await trial(.8,1);
      assert.ok(low.vals[1]<.02 && high.vals[1]>.98,id+" vertical endpoints "+JSON.stringify([low.vals,high.vals]));
      assert.ok(high.vals[0]!==null && right.vals[0]!==null && Math.abs(high.vals[0]-right.vals[0])>.5 && Math.abs(high.vals[1]-right.vals[1])<.01,id+" horizontal endpoints "+JSON.stringify([high.vals,right.vals]));
      if(id!=="echo")assert.equal(new Set(id==="spin"?right.s.spin:right.s.macros).size,1,id+" reaches every strip alike");
      for(const sample of [low,high,right])assert.ok(sample.xError<3 && sample.yError<3,id+" ruler marker follows puck: "+JSON.stringify(sample));
      assert.equal(await key("reset",inline).isEnabled(),true);
      await key("reset",inline).click();assert.equal(await key("reset",inline).isDisabled(),true,id+" reset returns to rest");
      await band("undo").click();assert.deepEqual(await settings(),right.s,id+" undo brings the setting back");
      await key("reset",inline).click();
    }
    assert.deepEqual(await settings(),clean,"every scene back at rest");
    // While the picture is held, the sound last touched on the score plays through the effect.
    await band("track",6).click();
    await page.locator('#kids-band [data-k="pad"][data-row="2"]').click();
    await page.evaluate(()=>{
      window.previewHit=null;const original=window.priorKidAudition=App.KidsMusic.audition;
      App.KidsMusic.audition=function(part,row,...args){
        const track=App.P.tracks[App.KidsMusic.tracks[part]],k=App.KidsMusic.pitch(part,row)-36;
        window.previewHit={part,row,loaded:App.samples.has(track.kit.pads[k]?.id)};
        return original.call(this,part,row,...args);
      };
    });
    await holdUntil(key("pad",inline),()=>page.waitForFunction(()=>previewHit?.part===6 && previewHit.row===2 && previewHit.loaded && App.KidsMusic.levels()[6]>.001));
    await page.evaluate(()=>{App.KidsMusic.audition=window.priorKidAudition;});
    // The larger room: monitors that freeze, the echo's spacing and repeats, the same scenes.
    await band("track",2).click();
    for(const [r,c] of [[0,0],[2,2],[1,4],[3,6]])await page.locator('#kids-band [data-k="note"][data-row="'+r+'"][data-col="'+c+'"]').click();
    await band("sound").click();await key("pad").waitFor();
    assert.equal(await room.locator(".ks-target-name").innerText(),"Celá kapela");
    assert.equal(await room.locator("canvas[data-kid-screen]").count(),2);
    for(const id of ["spin","motion","colour","echo"]){await mode(id).click();await checkBounds(room);}
    await key("play").click();
    await page.waitForFunction(()=>{
      const screens=Array.from(document.querySelectorAll("#kids-sound canvas[data-kid-screen]"));
      if(screens.length!==2 || !screens.every(c=>+c.dataset.level>.002))return false;
      const an=App.E.anF, mag=new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(mag);return Math.max(...mag)>-64;
    });
    await key("freeze").click();
    const pixels=()=>room.locator("canvas").evaluateAll(cs=>cs.map(c=>c.toDataURL()));
    const frozen=await pixels();
    await key("play").click();
    await page.evaluate(()=>App.E.panic(true));
    await page.waitForFunction(t=>App.E.ctx.currentTime>=t,await page.evaluate(()=>App.E.ctx.currentTime+.24));
    assert.deepEqual(await pixels(),frozen);
    await key("freeze").click();
    for(const [action,param] of [["time","dtime"],["repeat","dfb"]]){
      const values=[];
      for(let i=0;i<3;i++){await key(action).click();values.push(await page.evaluate(k=>App.P.fx[k],param));}
      assert.equal(new Set(values).size,3);
    }
    await mode("colour").click();assert.equal(await room.locator(".ks-echo-controls").isHidden(),true,"the echo's own keys only with the echo");
    await key("back").click();
    // A song made when each instrument and piece had its own effects: the strongest setting reaches the whole band,
    // the curves of single pieces go, and it happens once.
    const folded=await page.evaluate(()=>{
      const M=App.KidsMusic,P=M.newProject();delete P.kidsBand.effects;
      P.rack.strips[3].macros=[.7,0,0,.4];P.rack.strips[5].macros=[.2,.5,0,0];
      P.tracks[3].dly=.6;P.tracks[3].vol=.3;P.tracks[3].automation[1].rev={mode:"step",points:[{s:0,v:.9}]};
      P.tracks[2].automation[0].macro2={mode:"step",points:[{s:0,v:.1},{s:8,v:.9}]};
      M.prepare(P);
      const strips=[...new Set(M.tracks)].map(i=>P.rack.strips[i].macros.join("/"));
      const lanes=P.tracks.flatMap(t=>t.automation.flatMap(a=>Object.keys(a)));
      const again=JSON.stringify(P);P.rack.strips[3].macros=[.1,.1,.1,.1];M.prepare(P);
      return {strips:[...new Set(strips)],lanes,farm:[P.tracks[3].dly,P.tracks[3].vol],flag:P.kidsBand.effects,once:P.rack.strips[3].macros.join("/"),
        kept:App.sanitize(JSON.parse(again)).kidsBand.effects};
    });
    assert.deepEqual(folded,{strips:["0.7/0.5/0/0.4"],lanes:[],farm:[.6,.3],flag:1,once:"0.1/0.1/0.1/0.1",kept:1},JSON.stringify(folded));
    // Measured: the echo of the whole band, the brightness and the carousel's swing from side to side.
    const dsp=await page.evaluate(async()=>{
      const base=App.sanitize(App.P),ti=2;
      base.tracks.forEach((t,i)=>{t.dly=0;t.rev=0;t.clips[0]=i===ti?[{n:57,s:0,l:2,v:1,p:1}]:[];});
      Object.assign(base.tracks[ti].syn,{aa:.001,ad:.04,as:.6,ar:.015});
      const strips=[...new Set(App.KidsMusic.tracks)];
      async function render(change,stems){
        const P=App.sanitize(base);change(P);
        return App.Seq.renderSong({project:P,stems});
      }
      async function tail(amount){
        const {full,cut}=await render(P=>{P.fx.mixDelay=amount;P.fx.mixReverb=amount;},[{type:"returns"}]);
        let energy=0,count=0;
        for(let c=0;c<full.numberOfChannels;c++){const d=full.getChannelData(c),sr=full.sampleRate;for(let i=cut+Math.round(.35*sr);i<cut+Math.round(1.4*sr);i++){if(!Number.isFinite(d[i]))throw Error("Non-finite echo");energy+=d[i]*d[i];count++;}}
        return Math.sqrt(energy/count);
      }
      const low=await tail(0),high=await tail(.9);
      async function harmonics(dark){
        const {full,cut}=await render(P=>{
          P.tracks[ti].clips[0]=[{n:57,s:0,l:12,v:1,p:1}];Object.assign(P.tracks[ti].syn,{w1:2,lv1:.5,lv2:0,sub:0,noise:0,fm:0,fenv:0,cut:18000,as:1,ldest:0});
          for(const i of strips){const s=P.rack.strips[i];s.routes.push({source:"macro2",target:"tone",low:0,high:-1});s.macros[1]=dark;}
        },[{type:"track",index:ti}]);
        const d=full.getChannelData(0),sr=full.sampleRate,from=cut+Math.floor(sr*.22),length=4096;
        const power=h=>{let x=0,y=0;for(let i=0;i<length;i++){const v=d[from+i]*(.5-.5*Math.cos(2*Math.PI*i/length)),ph=2*Math.PI*i*220*h/sr;x+=Math.cos(ph)*v;y+=Math.sin(ph)*v;}return x*x+y*y;};
        let over=0;for(let h=8;h<=24;h++)over+=power(h);return over/power(1);
      }
      const bright=await harmonics(0),dark=await harmonics(1);
      const {full,cut}=await render(P=>{
        P.tracks[ti].clips[0]=[{n:48,s:0,l:16,v:1,p:1}];
        for(const i of strips){const s=P.rack.strips[i];Object.assign(s,{lfoRate:2,lfoBeats:0,lfoWave:"sine"});s.routes.push({source:"lfo",target:"pan",low:-1,high:1},{source:"lfo",target:"level",low:-.55,high:0});}
      },[{type:"track",index:ti}]);
      const L=full.getChannelData(0),R=full.getChannelData(1),sr=full.sampleRate,w=Math.round(sr*.04),sides=[];
      for(let i=cut+Math.round(sr*.1);i+w<cut+Math.round(sr*1.6);i+=w){let l=0,r=0;for(let k=i;k<i+w;k++){l+=L[k]*L[k];r+=R[k]*R[k];}sides.push(10*Math.log10((l+1e-12)/(r+1e-12)));}
      const {blob}=await App.ProjectFiles.blob(App.P),{raw}=await App.ProjectFiles.read(blob),back=App.sanitize(raw);
      return {low,high,bright,dark,left:Math.max(...sides),right:Math.min(...sides),portable:back.kidsBand.effects};
    });
    assert.ok(dsp.high>.00005 && dsp.high>3*dsp.low,"the whole band's echo rings on: "+JSON.stringify(dsp));
    assert.ok(dsp.bright>3*dsp.dark,"darker is darker: "+JSON.stringify([dsp.bright,dsp.dark]));
    assert.ok(dsp.left>15 && dsp.right<-15,"the carousel swings the sound from side to side: "+JSON.stringify([dsp.left,dsp.right]));
    assert.equal(dsp.portable,1,"a saved song knows its effects are the whole band's");
    const masterDSP=await page.evaluate(async()=>{
      const P=App.sanitize(App.P);
      P.tracks.forEach(t=>{t.dly=0;t.rev=0;});P.fx.dtime=2;P.fx.dfb=.22;
      P.rack.strips[2].bus=1;
      async function render(input,dly,rev,subset){
        P.fx.mixDelay=dly;P.fx.mixReverb=rev;
        const sr=24000,ctx=new OfflineAudioContext(2,sr,sr);
        const E=App.Engine(ctx,()=>P,{offline:true,stems:[{type:"returns",onlyTracks:subset}]});E.syncAll();
        const sine=ctx.createOscillator();sine.frequency.value=420;
        sine.connect(E.tracks[input].instrument);sine.start(.06);sine.stop(.095);
        const buffer=await ctx.startRendering();let energy=0,peak=0,n=0;
        for(let c=0;c<2;c++){for(const v of buffer.getChannelData(c).subarray(.12*sr)){if(!Number.isFinite(v))throw Error("Invalid master return");energy+=v*v;peak=Math.max(peak,Math.abs(v));n++;}}
        return {rms:Math.sqrt(energy/n),peak};
      }
      const dry=await render(0,0,0),kit=await render(0,.8,0),group=await render(2,.8,0),verb=await render(1,0,.8),other=await render(2,.8,.8,[0]);
      const {blob}=await App.ProjectFiles.blob(P),{raw}=await App.ProjectFiles.read(blob);
      return {dry,kit,group,verb,other,portable:[App.sanitize(raw).fx.mixDelay,App.sanitize(raw).fx.mixReverb]};
    });
    assert.ok(masterDSP.dry.peak===0 && masterDSP.other.peak===0);
    for(const name of ["kit","group","verb"])assert.ok(masterDSP[name].rms>.0001,JSON.stringify(masterDSP));
    assert.deepEqual(masterDSP.portable,[.8,.8]);
    console.log("Master returns · dry/isolated silence, direct and grouped sources · RMS "+[masterDSP.kit,masterDSP.group,masterDSP.verb].map(v=>v.rms.toFixed(5)).join(", ")+" · peak "+masterDSP.kit.peak.toFixed(4));
    assert.deepEqual(errors,[]);
    console.log("Kids sound room · four scenes for the whole band on every strip, rulers, reset and undo, preview, monitors and freeze, older songs folded once · echo tail RMS "+dsp.low.toFixed(5)+"–"+dsp.high.toFixed(5)+" · harmonic ratio "+(dsp.bright/dsp.dark).toFixed(1)+" · carousel "+dsp.left.toFixed(0)+"/"+dsp.right.toFixed(0)+" dB");
  } finally {await context.close();}
};
