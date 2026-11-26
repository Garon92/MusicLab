"use strict";

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
  const automation=()=>page.evaluate(()=>App.sanitize(App.P).tracks[2].automation[0]);
  const extent=lane=>Math.max(...lane.points.map(p=>p.v))-Math.min(...lane.points.map(p=>p.v));
  async function paintPath(host=room) {
    const b=await key("pad",host).boundingBox();assert.ok(b);
    const pos=(x,y)=>page.mouse.move(b.x+b.width*x,b.y+b.height*y);
    await pos(.05,.94);await page.mouse.down();
    try {
      for(const [x,y] of [[.1,.89],[.26,.70],[.43,.54],[.62,.35],[.78,.2],[.95,.06]]) {
        const at=await page.evaluate(()=>App.E.ctx.currentTime+.16);
        await page.waitForFunction(t=>App.E.ctx.currentTime>=t,at);
        await pos(x,y);
      }
    } finally {await page.mouse.up();}
  }
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
        for(const el of root.querySelectorAll("[data-sound]")){
          if(!el.getClientRects().length)continue;
          const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          if(b.width<63.9 || b.height<63.9 || b.x<0 || b.y<0 || b.right>innerWidth+.5 || b.bottom>innerHeight+.5 ||
            (!el.disabled && !el.contains(hit)))out.push(el.getAttribute("aria-label"));
          const caption=el.querySelector(".ks-key-name"),icon=el.querySelector(":scope > svg");
          if(caption){
            const range=document.createRange();range.selectNodeContents(caption);
            const text=range.getBoundingClientRect();
            if(text.left<b.left || text.right>b.right || text.bottom>b.bottom || (icon && text.top<icon.getBoundingClientRect().bottom-1))
              out.push("Clipped button caption: "+caption.textContent);
          }
        }
        const box=s=>root.querySelector(s).getBoundingClientRect();
        const pad=box(".ks-pad"),left=box("[data-end='0']"),right=box("[data-end='1']"),down=box("[data-end='2']"),up=box("[data-end='3']");
        if(left.top<pad.bottom || left.right>=right.left || down.right>pad.left || up.right>pad.left ||
          up.bottom>pad.top+pad.height/2 || down.top<pad.top+pad.height/2)out.push("Axis ends must sit on the matching sides of the playing field");
        if(box(".ks-puck").width<42 || box("button[data-mode] svg").width<32)out.push("Sound pictures too small");
        return out;
      });
      assert.deepEqual(issues,[],width+"×"+height+" sound controls");
    }
    await page.setViewportSize({width:1280,height:720});
  }
  try {
    await page.goto(url.href);await key("pad",inline).waitFor();
    // A second touch can open the shelf while the first still holds the effect pad.
    await holdUntil(key("pad",inline),async()=>{
      assert.equal(await inline.locator(".ks-pad.held").count(),1);
      await band("shelf").evaluate(b=>b.click());
      assert.equal(await inline.locator(".ks-pad.held").count(),0);
    });
    await band("back").click();
    assert.equal(await inline.locator(".ks-target-name").innerText(),"Farma");
    assert.deepEqual(await inline.locator("[data-mode] .ks-key-name").allTextContents(),["Ozvěna","Ostrost","Chvění"]);
    assert.equal(await inline.locator(".ks-cue").isVisible(),false);
    assert.equal(await key("arm",inline).getAttribute("aria-label"),"Nahrát pohyb");
    assert.equal(await key("clear",inline).isVisible(),false);
    await checkBounds(inline);
    await band("track",6).click();
    await page.locator('#kids-band [data-k="pad"][data-row="2"]').click();
    const objectName=await page.evaluate(()=>App.KidsView.rowLabel(6,2));
    assert.ok((await key("pad",inline).getAttribute("aria-label")).includes(objectName));
    assert.equal(await inline.locator(".ks-sound-token svg").count(),1);
    // The effects preview plays exactly the picture the child just touched on
    // the score, even before any note has been put into this kit's pattern.
    await page.evaluate(()=>{
      window.previewHit=null;
      const original=window.priorKidAudition=App.KidsMusic.audition;
      App.KidsMusic.audition=function(part,row,...args){
        const track=App.P.tracks[App.KidsMusic.tracks[part]],k=App.KidsMusic.pitch(part,row)-36;
        window.previewHit={part,row,loaded:App.samples.has(track.kit.pads[k]?.id)};
        return original.call(this,part,row,...args);
      };
    });
    await holdUntil(key("pad",inline),()=>page.waitForFunction(()=>previewHit?.part===6 && previewHit.row===2 && previewHit.loaded && App.KidsMusic.levels()[6]>.001));
    await page.evaluate(()=>{App.KidsMusic.audition=window.priorKidAudition;});
    // Lock x while travelling up and down, then lock y while moving across.
    // The marker alongside each ruler must match the real puck and the audible parameter.
    for(const [id,bottom,top,xKey,yKey] of [["echo","Bez dozvuku","Doznívá","dly","rev"],["colour","Čistý","Drsný","macro2","macro1"],["motion","Klid","Silně","macro4","macro3"]]){
      await mode(id,inline).click();
      assert.deepEqual(await inline.locator(".ks-axis-y .ks-end").allTextContents(),[top,bottom]);
      const trial=async(x,y)=>{
        const r=await inline.locator(".ks-trail").boundingBox();
        await page.mouse.click(r.x+r.width*x,r.y+r.height*(1-y));
        return inline.evaluate((el,keys)=>{
          const i=App.KidsMusic.tracks[6];
          const vals=keys.map(k=>k.startsWith("macro")?App.Rack.getMacro(i,Number(k.slice(-1))-1):App.P.tracks[i][k]);
          const rect=s=>el.querySelector(s).getBoundingClientRect(),p=rect(".ks-puck"),h=rect(".ks-axis-x .ks-ruler>i"),v=rect(".ks-axis-y .ks-ruler>i");
          return {vals,xError:Math.abs((h.left+h.width/2)-(p.left+p.width/2)),yError:Math.abs((v.top+v.height/2)-(p.top+p.height/2))};
        },[xKey,yKey]);
      };
      const low=await trial(.2,0),high=await trial(.2,1),right=await trial(.8,1);
      assert.ok(low.vals[1]<.02 && high.vals[1]>.98 && Math.abs(high.vals[0]-low.vals[0])<.01,id+" vertical endpoints");
      assert.ok(Math.abs(high.vals[0]-right.vals[0])>.55 && Math.abs(high.vals[1]-right.vals[1])<.01,id+" horizontal endpoints");
      for(const sample of [low,high,right])assert.ok(sample.xError<3 && sample.yError<3,id+" ruler marker follows puck: "+JSON.stringify(sample));
    }
    await band("track",2).click();
    // Give the meters signal at several positions in the timbre sweep, including its bright half.
    for(const [r,c] of [[0,0],[2,2],[1,4],[3,6]]){
      await page.locator('#kids-band [data-k="note"][data-row="'+r+'"][data-col="'+c+'"]').click();
    }
    await mode("colour",inline).click();await key("arm",inline).click();
    assert.equal(await inline.locator(".ks-cue").innerText(),"Táhni a pusť");
    await key("arm",inline).click();
    assert.equal(await key("arm",inline).getAttribute("aria-pressed"),"false");
    await key("arm",inline).click();await band("sound").click();
    assert.equal(await mode("colour").getAttribute("aria-pressed"),"true");
    assert.equal(await key("arm").getAttribute("aria-pressed"),"true");
    await key("back").click();
    assert.equal(await mode("colour",inline).getAttribute("aria-pressed"),"true");
    await paintPath(inline);
    const first=await automation();
    for(const k of ["macro1","macro2"])assert.ok(first[k].points.length>=3 && extent(first[k])>.35,"inline colour movement "+k);
    assert.equal(await key("arm",inline).getAttribute("aria-pressed"),"false","lifting the finger ends the take");
    assert.ok((await inline.locator(".ks-trail polyline").getAttribute("points"))?.length);
    await band("play").click();
    await checkBounds(inline); // The recorded path adds a direct erase action at every size.
    assert.equal(await inline.locator(".ks-cue").isVisible(),false);
    await key("clear",inline).click();assert.deepEqual(await automation(),{});
    await band("undo").click();assert.deepEqual(await automation(),first);
    await mode("echo",inline).click();await band("sound").click();await key("pad").waitFor();
    assert.equal(await room.locator(".ks-target-name").innerText(),"Melodie");
    assert.equal(await room.locator("canvas[data-kid-screen]").count(),2);
    assert.deepEqual(await automation(),first);
    await checkBounds(room);
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
    await page.waitForFunction(()=>Array.from(document.querySelectorAll("#kids-sound canvas")).every(c=>+c.dataset.level<.001));
    for(const [action,param] of [["time","dtime"],["repeat","dfb"]]){
      const values=[];
      for(let i=0;i<3;i++){await key(action).click();values.push(await page.evaluate(k=>App.P.fx[k],param));}
      assert.equal(new Set(values).size,3);
    }
    const recordings={...first};
    for(const name of ["echo","motion"]) {
      await mode(name).click();
      if(await key("arm").getAttribute("aria-pressed")!=="true")await key("arm").click();
      await paintPath();
      const bank=await automation();
      const changed=Object.keys(bank).filter(k=>!recordings[k]);
      assert.equal(changed.length,2,name+" must record two independent musical parameters");
      for(const k of changed){
        assert.ok(bank[k].points.length>=3 && extent(bank[k])>.35,name+" "+k+" "+JSON.stringify(bank[k]));
        recordings[k]=bank[k];
      }
      if(await page.evaluate(()=>App.Seq.playing))await key("play").click();
    }
    const complete=await automation();
    assert.ok(complete.dly && complete.rev && complete.macro3 && complete.macro4);
    await mode("echo").click();await key("play").click();
    const pad=await key("pad").boundingBox();
    await page.mouse.move(pad.x+pad.width*.99,pad.y+pad.height*.01);await page.mouse.down();
    let live;
    try {
      live=await page.evaluate(async()=>{
        const original=App.SongCurves.schedule,live=[],offline=[];
        App.SongCurves.schedule=function(engine,P,ti,lane,...rest){
          if(ti===2 && lane?.rev)(engine===App.E?live:offline).push(lane.rev.points.map(p=>p.v));
          return original.call(this,engine,P,ti,lane,...rest);
        };
        try {
          await App.Seq.renderSong({project:App.P});
          const until=App.E.ctx.currentTime+.48;
          while(App.E.ctx.currentTime<until)await new Promise(requestAnimationFrame);
          return {live,offline,gain:App.E.tracks[2].params.rev.value};
        }finally{App.SongCurves.schedule=original;}
      });
    } finally{await page.mouse.up();}
    assert.ok(live.gain>.9 && live.live.length>=2 && live.live.every(v=>v.length===1 && v[0]>.95));
    assert.ok(live.offline.length && live.offline.every(v=>v.length>2 && Math.min(...v)<.4));
    assert.deepEqual(await automation(),complete);
    await key("play").click();await mode("motion").click();
    await key("reverse").click();
    const mirrored=await automation();
    assert.notDeepEqual(mirrored.macro3,complete.macro3);
    assert.deepEqual(mirrored.rev,complete.rev);
    await key("clear").click();
    const cleared=await automation();
    assert.ok(!cleared.macro3 && !cleared.macro4);
    assert.deepEqual(cleared.dly,complete.dly);
    await key("undo").click();
    assert.deepEqual(await automation(),mirrored);
    await key("back").click();
    await band("shelf").click();
    await band("save").click();
    const confirm=page.getByRole("dialog",{name:"Open band song?"});
    await holdUntil(band("slot",0),()=>confirm.waitFor());
    await confirm.getByRole("button",{name:"Open in console",exact:true}).click();
    await page.waitForFunction(()=>!App.Kids.active && !!App.P.tracks[2].automation[0].macro3);
    const transferred=await automation();
    assert.deepEqual(transferred,mirrored);
    const wet=await page.evaluate(async()=>{
      const P=App.sanitize(App.P),track=P.tracks[2],clip=track.automation[0];
      track.clips[0]=[{n:60,s:0,l:1,v:1,p:1}];
      Object.assign(track.syn,{aa:.001,ad:.04,as:.6,ar:.015});
      // Sample both ends of the actual exported echo trajectory. The returns
      // stem isolates echoes after the source and the dry strip have stopped.
      async function tail(high) {
        for(const key of ["dly","rev"]){
          const lane=App.P.tracks[2].automation[0][key];
          const values=lane.points.map(p=>p.v);
          clip[key]={mode:"step",points:[{s:0,v:high?Math.max(...values):Math.min(...values)}]};
        }
        const {full,cut}=await App.Seq.renderSong({project:P,stems:[{type:"returns"}]});
        let energy=0,peak=0,count=0;
        for(let c=0;c<full.numberOfChannels;c++){
          const data=full.getChannelData(c),sr=full.sampleRate;
          for(let i=cut+Math.round(.35*sr);i<cut+Math.round(1.4*sr);i++){
            const v=data[i];if(!Number.isFinite(v))throw Error("Non-finite echo stem");
            energy+=v*v;peak=Math.max(peak,Math.abs(v));count++;
          }
        }
        return {rms:Math.sqrt(energy/count),peak};
      }
      const low=await tail(false),high=await tail(true);
      // Measure the higher harmonics relative to the fundamental of a held
      // saw at A3. Rectify neither the signal nor its changing pitch.
      track.clips[0]=[{n:57,s:0,l:12,v:1,p:1}];
      Object.assign(track.syn,{w1:2,lv1:.5,lv2:0,sub:0,noise:0,fm:0,fenv:0,cut:18000,as:1,ldest:0});
      for(const k of ["macro1","macro3","macro4"])clip[k]={mode:"step",points:[{s:0,v:0}]};
      const shades=App.P.tracks[2].automation[0].macro2.points.map(p=>p.v);
      async function harmonics(value){
        clip.macro2={mode:"step",points:[{s:0,v:value}]};
        const {full,cut}=await App.Seq.renderSong({project:P,stems:[{type:"track",index:2}]});
        const d=full.getChannelData(0),sr=full.sampleRate,from=cut+Math.floor(sr*.22),length=4096;
        const power=h=>{
          let x=0,y=0;
          for(let i=0;i<length;i++){
            const v=d[from+i]*(.5-.5*Math.cos(2*Math.PI*i/length)),phase=2*Math.PI*i*220*h/sr;
            x+=Math.cos(phase)*v;y+=Math.sin(phase)*v;
          }
          return x*x+y*y;
        };
        let overtones=0;for(let h=8;h<=24;h++)overtones+=power(h);
        return overtones/power(1);
      }
      const bright=await harmonics(Math.min(...shades)),dark=await harmonics(Math.max(...shades));
      const {blob}=await App.ProjectFiles.blob(App.P),{raw}=await App.ProjectFiles.read(blob);
      return {low,high,bright,dark,portable:App.sanitize(raw).tracks[2].automation[0]};
    });
    assert.deepEqual(wet.portable,transferred);
    assert.ok(wet.high.rms>.00005 && wet.high.rms>3*wet.low.rms,JSON.stringify(wet));
    assert.ok(wet.bright>3*wet.dark,JSON.stringify([wet.bright,wet.dark]));
    assert.deepEqual(errors,[]);
    console.log("Kids sound room · two-axis drawing, measured scopes and freeze, live override, reverse, clear, undo, portable lanes · echo tail RMS "+wet.low.rms.toFixed(5)+"–"+wet.high.rms.toFixed(5)+" · high harmonic ratio "+(wet.bright/wet.dark).toFixed(1));
  } finally {await context.close();}
};
