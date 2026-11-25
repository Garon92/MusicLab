/* Detect, correct and insert a reference melody. Render pitched grains and
   independently verify the key, velocity and round-robin mapping in the audio. */
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
function wav(notes,rate=24000,length=1) {
  const frames=Math.round(length*rate),b=Buffer.alloc(44+frames*2);
  b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WAVEfmt ",8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(frames*2,40);
  for(let j=0;j<frames;j++) {
    const t=j/rate, note=notes.find(([a,b])=>t>=a && t<b);
    if(note){const [a,e,hz]=note,env=Math.min(1,(t-a)*100,(e-t)*100);b.writeInt16LE(Math.round(12000*env*(Math.sin(2*Math.PI*hz*t)+.23*Math.sin(4*Math.PI*hz*t))),44+j*2);}
  }
  return b;
}
module.exports=async function samplerLab(reference) {
  const browser=reference.context().browser(),p=await browser.newPage({viewport:{width:1100,height:620}}),errors=[];
  p.on("pageerror",e=>errors.push(e.message));p.setDefaultTimeout(10000);let other;
  try {
    await p.goto(reference.url());await p.waitForFunction(()=>window.App?.P?.tracks[0].smp.zones);
    const button=text=>p.getByRole("button",{name:text,exact:true});
    const data=(name,hz)=>({name,mimeType:"audio/wav",buffer:wav([[0,1,hz]])});
    async function files(action,values){const event=p.waitForEvent("filechooser");await action();await(await event).setFiles(values);}
    const phrase={name:"Whistle.wav",mimeType:"audio/wav",buffer:wav([[.1,.55,220],[.65,1.08,268.05],[1.25,1.7,329.628]],24000,1.8)};
    // Audio on an empty sampler strip should default to a playable melodic instrument.
    await p.evaluate(()=>App.select(7,0));
    await button("AUDIO…").click();await files(()=>button("Import audio…").click(),phrase);
    await button("Transcribe…").click();
    await p.getByLabel("Pitch 3",{exact:true}).waitFor();
    const pitch=await p.locator(".transcript-table tbody tr").evaluateAll(rows=>rows.map(r=>+r.querySelector('[aria-label^="Pitch "]').value));
    assert.deepEqual(pitch,[57,60,64]);
    assert.match(await p.locator(".transcript-table tbody tr").nth(1).textContent(),/CHECK/);
    assert.equal(await p.getByLabel("Destination track").inputValue(),"1");
    await p.getByLabel("Destination track").selectOption("1");await p.getByLabel("Destination pattern").selectOption("3");
    await button("Source").first().click();await button("Note").last().click();
    await p.getByLabel("Pitch 2",{exact:true}).fill("62");await p.getByLabel("Pitch 2",{exact:true}).press("Tab");
    await button("Insert notes").click();
    const read=await p.evaluate(()=>App.P.tracks[1].clips[3]);
    assert.deepEqual(read.map(n=>n.n),[57,62,64]);assert.ok(Math.abs(read[0].s+(read[0].off||0)-.8)<.17);assert.ok(read[1].l>=3);
    await p.evaluate(()=>{const P=App.P,t=P.tracks[6];t.smp.id=P.audio.regions[0].takes[0].sample;App.select(6,0);App.commit();App.refresh();});
    const mode=p.getByRole("button",{name:/^SAMPLER MODE/});
    await mode.click();await p.getByText("GRAIN",{exact:true}).last().click();
    await p.waitForFunction(()=>App.P.tracks[6].smp.mode===2);
    const grain=await p.evaluate(async()=>{
      const P=App.P, d=P.tracks[6].smp;Object.assign(d,{gpos:.18,gspray:0,gsize:.14,gdens:33,root:60,ar:.025,aa:.002});
      const ctx=new OfflineAudioContext(2,48000,24000),E=App.Engine(ctx,()=>P,{offline:true});E.syncAll();
      E.play(6,60,.9,.18,.65);E.play(6,72,.9,1.02,.55);
      const full=await ctx.startRendering(),x=full.getChannelData(0);
      const pitch=(a,b)=>{let best=0,freq=0;
        for(let f=160;f<=600;f+=2){let re=0,im=0;for(let i=Math.round(a*24000);i<b*24000;i+=4){const phase=2*Math.PI*f*i/24000;re+=Math.cos(phase)*x[i];im+=Math.sin(phase)*x[i];}
          const power=re*re+im*im;if(power>best){best=power;freq=f;}}return freq;};
      let energy=0,peak=0;for(const x0 of x){energy+=x0*x0;peak=Math.max(peak,Math.abs(x0));}
      App.E?.syncTrack(6);App.commit();App.refresh();
      return {rms:Math.sqrt(energy/x.length),peak,hz:[pitch(.34,.64),pitch(1.17,1.47)]};
    });
    assert.ok(grain.rms>.012 && grain.peak<1 && Math.abs(grain.hz[0]-220)<19 && Math.abs(grain.hz[1]-440)<31,JSON.stringify(grain));
    // Change active grain position mid-note. The fixture's three plateaus contain different pitches.
    const shift=await p.evaluate(async()=>{
      const E=App.audio(), d=App.P.tracks[6].smp;
      const rec=await E.record(E.tracks[6].instrument);E.noteOn(6,60,.9);
      await new Promise(r=>setTimeout(r,300));d.gpos=.84;E.syncTrack(6);
      await new Promise(r=>setTimeout(r,380));E.noteOff(6,60);
      const buf=await rec.stop(), x=buf.getChannelData(0);
      const estimate=(a,b)=>{let power=0,hz=0;for(let f=160;f<=410;f+=2){
        let re=0,im=0;for(let i=Math.round(a*buf.sampleRate);i<b*buf.sampleRate;i+=4){const phase=2*Math.PI*f*i/buf.sampleRate;re+=Math.cos(phase)*x[i];im+=Math.sin(phase)*x[i];}
        const candidate=re*re+im*im;if(candidate>power){power=candidate;hz=f;}}return hz;};
      return [estimate(.11,.26),estimate(.48,.63)];
    });
    assert.ok(Math.abs(shift[0]-220)<30 && Math.abs(shift[1]-330)<35,JSON.stringify(shift));
    await mode.click();await p.getByText("ZONES",{exact:true}).last().click();await button("ZONES…").click();
    const mapped=[data("Glass_C4_v32_rr1.wav",220),data("Glass_C4_v32_rr2.wav",330),data("Glass_C4_v105.wav",440),data("Glass_G4_v105.wav",554)];
    await files(()=>button("Import samples…").click(),mapped);
    await p.waitForFunction(()=>App.P.tracks[6].smp.zones.length===4);
    const zones=await p.evaluate(()=>App.P.tracks[6].smp.zones);
    assert.deepEqual(zones.map(z=>[z.root,z.lo,z.hi,z.vl,z.vh]),[[60,0,63,1,68],[60,0,63,1,68],[60,0,63,69,127],[67,64,127,1,127]]);
    await button("Audition sample").click();await button("Close").click();
    const response=await p.evaluate(async()=>{
      const P=App.P,d=P.tracks[6].smp;d.shot=0;d.rev=0;
      const ctx=new OfflineAudioContext(2,57600,24000),E=App.Engine(ctx,()=>P,{offline:true});E.syncAll();
      [[60,.22],[60,.22],[60,.9],[67,.9]].forEach(([n,v],i)=>E.play(6,n,v,.21+i*.5,.38));
      const buf=await ctx.startRendering(),x=buf.getChannelData(0);
      return [0,1,2,3].map(i=>{let c=0;for(let j=Math.round((.31+i*.5)*24000);j<(.51+i*.5)*24000;j++)if(x[j]>0 && x[j-1]<=0)c++;return c*5;});
    });
    assert.ok(response.every((n,i)=>Math.abs(n-[220,330,440,554][i])<8),JSON.stringify(response));
    const dl=p.waitForEvent("download");await p.evaluate(()=>App.file("save"));
    const bytes=await fs.readFile(await(await dl).path()),json=JSON.parse(bytes);
    assert.equal(json.samples.length,5);
    const remap=await p.evaluate(()=>{
      const copy=App.sanitize(JSON.parse(JSON.stringify(App.P))),id=copy.tracks[6].smp.zones[0].sample,newId=App.uid();
      App.remapSample(copy,id,newId);
      return [copy.tracks[6].smp.zones[0].sample===newId,App.sampleIds(copy).has(newId),!App.sampleIds(copy).has(id)];
    });
    assert.deepEqual(remap,[true,true,true]);
    other=await browser.newPage();other.on("pageerror",e=>errors.push(e.message));await other.goto(reference.url());
    await other.waitForFunction(()=>window.App?.P);const file=other.waitForEvent("filechooser");await other.evaluate(()=>App.file("open"));
    await(await file).setFiles({name:"Melody.musiclab.json",mimeType:"application/json",buffer:bytes});
    await other.getByRole("button",{name:"Open project",exact:true}).click();
    await other.waitForFunction(()=>App.P.tracks[6].smp.zones.length===4 && App.P.tracks[6].smp.zones.every(z=>App.samples.has(z.sample)));
    assert.equal(await other.evaluate(()=>App.P.tracks[6].smp.mode),3);
    assert.deepEqual(await other.evaluate(()=>App.P.tracks[1].clips[3].map(n=>n.n)),[57,62,64]);
    assert.deepEqual(errors,[]);
    console.log("Sampler lab · transcript "+pitch.join("/")+" · grain RMS "+grain.rms.toFixed(4)+" peak "+grain.peak.toFixed(3)+" · scan "+shift.map(Math.round).join("/")+" Hz · zones "+response.join("/")+" Hz · portable project");
  }finally{await other?.close();await p.close();}
};
