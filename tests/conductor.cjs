"use strict";
const assert=require("node:assert/strict");
module.exports=async function conductor(main){
  const ctx=await main.context().browser().newContext({viewport:{width:1100,height:620}}), page=await ctx.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(main.url());await page.waitForFunction(()=>window.App?.P?.arrangement);
    await page.evaluate(()=>{
      const P=App.P;P.chain=[0,1,2];P.song=1;P.tracks[1].clips[1]=[{s:0,n:48,l:1,v:.8,p:1}];
      P.tracks[1].automation[1]={pan:{mode:"linear",points:[{s:0,v:0},{s:16,v:1}]}};
      P.harmony={follow:["off","root","off","off","off","off","off","off"],chords:[{root:0,type:"maj",bars:1},{root:5,type:"maj",bars:1},{root:7,type:"maj",bars:1}]};
      P.performance.take={origin:0,steps:48,events:[{t:0,at:0,p:0,offset:0},{t:1,at:16,p:1,offset:0}]};
      const buf=new AudioBuffer({length:44100,numberOfChannels:1,sampleRate:44100});
      buf.getChannelData(0).fill(.35,0,1323);const id=App.addBuffer("voice",buf);
      const reg={id:"sample1",name:"VOICE",track:6,at:16,len:.3,takes:[{sample:id,offset:0}],take:0,gain:1,mute:false,fin:0,fout:0,repeats:1,layer:""};
      P.audio.regions=[reg,{...reg,id:"cross2",name:"CROSS",at:14,len:.5}];App.commit();App.refresh();
    });
    const dlg=page.getByRole("dialog",{name:"Song arrangement"});
    const arrange=()=>page.getByRole("button",{name:"ARRANGE…",exact:true}).click();
    await arrange();
    await dlg.getByRole("button",{name:"Slot 02, pattern B"}).click();
    await dlg.getByRole("button",{name:"Slot 03, pattern C"}).click({modifiers:["Shift"]});
    await dlg.getByLabel("Section name").fill("Chorus");await dlg.getByRole("button",{name:"Name range"}).click();
    await dlg.getByLabel("Insert position").selectOption("before");await dlg.getByLabel("Empty bars").fill("4");
    await dlg.getByRole("button",{name:"Insert space"}).click();await dlg.getByRole("button",{name:"Apply arrangement"}).click();
    const shifted=await page.evaluate(()=>{
      const P=App.P;return [P.chain,P.arrangement.slots[1].steps,P.arrangement.sections[0],P.audio.regions.map(r=>[r.name,r.at,r.len,r.takes[0].offset]),
        App.Harmony.state(P,1,80)?.chord.root,App.Harmony.state(P,1,32),P.performance.take.events.find(e=>e.t===1&&e.p===1)?.at,P.tracks[1].automation[1].pan.points.length];
    });
    assert.deepEqual(shifted.slice(0,3),[[0,0,1,2],64,{first:2,count:2,name:"Chorus"}]);
    assert.deepEqual(shifted[3],[["VOICE",80,.3,0],["CROSS",14,.25,0],["CROSS",80,.25,.25]]);
    assert.deepEqual(shifted.slice(4),[5,null,80,2]);
    await arrange();
    const chart=await dlg.locator("canvas.arr-timeline").boundingBox();
    const chartX=step=>chart.x+83+(chart.width-86)*step/112, sectionY=chart.y+chart.height*1.5/13;
    await page.mouse.move(chartX(84),sectionY);await page.mouse.down();
    await page.mouse.move(chartX(2),sectionY,{steps:12});await page.mouse.up();
    await dlg.getByRole("button",{name:"Apply arrangement"}).click();
    assert.deepEqual(await page.evaluate(()=>[App.P.chain,App.P.audio.regions.find(r=>r.name==="VOICE").at]),[[1,2,0,0],0]);
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    assert.equal(await page.evaluate(()=>App.P.audio.regions.find(r=>r.name==="VOICE").at),80);
    await page.getByRole("button",{name:"UNDO",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>App.P.audio.regions.map(r=>r.at)),[16,14]);
    await arrange();await dlg.getByRole("button",{name:"Tempo & meter"}).click();
    const cue=async(bar,bpm,mode)=>{await dlg.getByLabel("Conductor bar").fill(String(bar));await dlg.getByLabel("Conductor BPM").fill(String(bpm));await dlg.getByLabel("Tempo transition").selectOption(mode);await dlg.getByRole("button",{name:"Set tempo"}).click();};
    await cue(1,120,"ramp");await cue(2,60,"hold");
    await dlg.getByLabel("Conductor meter").selectOption("0");await dlg.getByRole("button",{name:"Set meter"}).click();
    await dlg.getByLabel("Conductor bar").fill("3");await dlg.getByLabel("Conductor meter").selectOption("2");await dlg.getByRole("button",{name:"Set meter"}).click();
    await dlg.getByRole("button",{name:"Apply arrangement"}).click();
    const result=await page.evaluate(async()=>{
      const P=App.P,C=App.Conductor;P.harmony.follow.fill("off");P.tracks.forEach(t=>{t.clips=t.clips.map(()=>[]);t.dly=0;t.rev=0;});P.fx.comp=0;
      const template=P.audio.regions[0];P.audio.regions=[0,16,24].map(at=>({...template,id:App.uid(),at,len:.05}));P.click=1;App.commit();App.refresh();
      const E=App.audio();let clicks=[];const old=E.click;E.click=(t,strong)=>{clicks.push(strong);old(t,strong);};
      App.Seq.play(1);await new Promise(r=>setTimeout(r,330));const f=App.Seq.frame();App.Seq.stop();E.click=old;
      const {full,cut}=await App.Seq.renderSong();const data=full.getChannelData(0),sec=full.sampleRate;let energy=0;const attacks=[];
      for(let i=cut;i<data.length;i++){energy+=data[i]**2;if(Math.abs(data[i])>.012 && (!attacks.length || (i-cut)/sec-attacks.at(-1)>.09))attacks.push((i-cut)/sec);}
      const seq=P.tracks[1];seq.clips[0]=[{s:0,n:36,l:1,v:.8,p:1}];seq.clips[1]=[{s:0,n:38,l:1,v:.8,p:1}];seq.clips[2]=[{s:0,n:40,l:1,v:.8,p:1}];
      const {project:imported}=App.MidiImport.read(await App.Seq.midi().arrayBuffer(),"mapped.mid");
      const portable=App.sanitize(await App.ProjectFiles.pack(P));
      return {time:C.time(P,16),inverse:C.step(P,C.time(P,23.75)),bars:C.layout(P,P.chain).map(x=>x.end),bpm:C.bpm(P,8),click:clicks[0],pos:[f.bar,f.sig],rms:Math.sqrt(energy/(data.length-cut)),attacks,midiMeters:imported.arrangement.meters.map(x=>[x.at,x.sig]),midiEnd:C.time(imported,24),portable:JSON.stringify(portable.arrangement.tempo)===JSON.stringify(P.arrangement.tempo)};
    });
    assert.ok(Math.abs(result.time-4*Math.log(2))<.00001);assert.ok(Math.abs(result.inverse-23.75)<.00001);
    assert.deepEqual(result.bars,[16,24,40]);assert.equal(result.bpm,90);assert.equal(result.click,true);assert.deepEqual(result.pos,[1,0]);
    assert.deepEqual(result.midiMeters,[[16,0],[24,2]]);assert.ok(Math.abs(result.midiEnd-(result.time+2))<.0001);
    assert.equal(result.portable,true);assert.ok(result.rms>.002 && Number.isFinite(result.rms));
    assert.equal(result.attacks.length,3);assert.ok(Math.abs(result.attacks[1]-result.time)<.016);assert.ok(Math.abs(result.attacks[2]-result.time-2)<.016);
    assert.deepEqual(errors,[]);
    console.log("Arrangement · 4-bar ripple, split audio and takes · 4/4 → 2/4 → 4/4 · tempo ramp WAV "+result.time.toFixed(4)+" s, RMS "+result.rms.toFixed(4));
  }finally{await ctx.close();}
};
