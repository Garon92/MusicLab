"use strict";
const assert = require("node:assert/strict");

module.exports = async function checkAutomation(mainPage) {
  const context = await mainPage.context().browser().newContext({viewport:{width:1100,height:620}});
  try {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(mainPage.url());
    await page.getByRole("button", {name:"AUTOMATION", exact:true}).click();
    const toolbar = page.locator(".auto-toolbar"), graph = page.locator("#auto-graph");
    await toolbar.getByRole("button", {name:/shape/i}).click();
    await page.getByLabel("Curve shape").selectOption("sine");
    await page.getByLabel("Cycles", {exact:true}).fill("2");
    await page.getByRole("button", {name:"Write whole lane"}).click();
    const curve = await page.evaluate(() => App.P.tracks[0].automation[0].vol);
    assert.deepEqual([curve.points.length, curve.points[0].v, curve.points[4].v], [17,0,1]);

    await page.getByRole("button", {name:"Automation target"}).click();
    await page.getByRole("menuitem", {name:"Pan"}).click();
    const box = await graph.boundingBox();
    await graph.click({position:{x:85,y:20}});
    await graph.click({position:{x:box.width*.75,y:box.height*.8}});
    const points = () => page.evaluate(() => App.P.tracks[0].automation[0].pan?.points.length || 0);
    assert.equal(await points(), 2);
    await graph.press("Delete");
    assert.equal(await points(), 1);
    await graph.press("Control+z");
    assert.equal(await points(), 2);
    await graph.press("Home");
    await toolbar.getByRole("button", {name:/delete point/i}).click();
    assert.equal(await points(), 1);

    // A sustained sine makes step-pan changes and fader motion measurable
    // without depending on random sample content or the timing of browser UI.
    const result = await page.evaluate(async () => {
      const rms = (buf, start, end, channel = 0) => {
        const d = buf.getChannelData(channel), a = Math.round(start*buf.sampleRate), b = Math.round(end*buf.sampleRate);
        let energy = 0;
        for (let i=a; i<b; i++) energy += d[i] * d[i];
        return Math.sqrt(energy / (b-a));
      };
      const P = App.newProject(), T = P.tracks[1];
      Object.assign(P, {bpm:240, swing:66, song:1, chain:[0,1]});
      P.fx.comp = 0; P.fx.rsize = .2;
      Object.assign(T, {vol:.5, dly:0, rev:0});
      Object.assign(T.syn, {w1:0, lv1:.56, lv2:0, sub:0, noise:0, cut:18000, res:0, fenv:0, ftrk:0, aa:.001, ad:.01, as:1, ar:.005, ldest:0});
      for (const p of [0,1]) T.clips[p] = [{s:0,n:84,l:16,v:.8,p:1}];
      T.automation[0] = {
        vol:{mode:"linear", points:[{s:0,v:0},{s:16,v:.95}]},
        pan:{mode:"step", points:[{s:0,v:0},{s:8,v:1}]}
      };
      App.P = P; App.commit(); App.refresh();
      const wav = await App.Seq.bounce();
      const measure = (b, t = 0) => [rms(b,.40+t,.44+t), rms(b,.40+t,.44+t,1), rms(b,.82+t,.90+t,1),
        rms(b,1.12+t,1.25+t), rms(b,1.12+t,1.25+t,1)];
      const E = App.audio();
      await E.ctx.resume();
      const tape = await E.record(E.out);
      App.Seq.play(0);
      await new Promise(resolve => setTimeout(resolve,1750));
      App.Seq.stop();
      const recording = await tape.stop();
      let switchTime = 0;
      for (let t=.25; t<1.10; t+=.005) {
        if (rms(recording,t,t+.008,1)>.008 && rms(recording,t,t+.008)<.004) { switchTime=t; break; }
      }
      const live = switchTime ? measure(recording,switchTime-.5) : [];
      T.automation[0] = {filter:{mode:"step", points:[{s:0,v:.15},{s:8,v:1}]}};
      const filtered = await App.Seq.bounce();
      return {early:rms(wav,.06,.09), offline:measure(wav), live, filter:[rms(filtered,.2,.3),rms(filtered,.7,.8)]};
    });
    const [l,r,late,nextL,nextR] = result.offline;
    assert.ok(l > result.early*8 && r < 1e-6 && late > 3*l, "rendered pan jump and volume fade");
    assert.ok(nextL > .01 && Math.abs(nextL/nextR-1) < .01, "next pattern restored the fixed mixer pan");
    assert.equal(result.live.length, 5, "recorded stereo transition");
    assert.ok(Math.abs(result.live[0]/l-1)<.20 && Math.abs(result.live[2]/late-1)<.15, "live and offline fade levels");
    assert.ok(result.live[1]<1e-6 && Math.abs(result.live[3]/result.live[4]-1)<.01, "live pan and pattern boundary");
    assert.ok(result.filter[1] > result.filter[0]*40, "low-pass sweep changes measured audio");
    // Compare a sixteen-bar render across its scheduling boundaries against
    // the same Web Audio graph scheduled up front, including a note which
    // sustains across the first suspension. Then measure a delayed echo which
    // crosses that boundary after the source voice has already ended.
    const continuity = await page.evaluate(async () => {
      const P = App.P, T = P.tracks[1], prototype = OfflineAudioContext.prototype;
      P.song = 0; P.sel.p = 0; P.pats[0].bars = 16;
      T.dly = 0;
      T.clips[0] = [{s:97,n:60,l:125,v:.8,p:1},{s:198,n:67,l:56,v:.6,p:1}];
      T.automation[0] = {vol:{mode:"linear",points:[{s:0,v:.2},{s:256,v:.85}]}};
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "suspend");
      let rendered, reference, windows = 0;
      try {
        if (descriptor?.value) Object.defineProperty(prototype,"suspend",{...descriptor,value:function(t) {
          windows++; return descriptor.value.call(this,t);
        }});
        rendered = await App.Seq.bounceWav();
        if (descriptor?.value) Object.defineProperty(prototype,"suspend",{...descriptor,value:undefined});
        reference = await App.Seq.bounceWav();
      } finally { if (descriptor) Object.defineProperty(prototype,"suspend",descriptor); }
      const a = new Uint8Array(await rendered.blob.arrayBuffer()), b = new Uint8Array(await reference.blob.arrayBuffer());
      let mismatch = 0;
      for (let i=0; i<a.length; i++) if (a[i]!==b[i]) mismatch++;
      T.clips[0] = [{s:122,n:60,l:1,v:.8,p:1}];
      T.automation[0] = {}; T.dly = 1; P.fx.dtime = 9; P.fx.dfb = .58;
      const wet = await App.Seq.bounce(), signal = wet.getChannelData(0);
      const energyAt = t => {
        let sum = 0; const start = Math.round(t*wet.sampleRate), samples = Math.round(.03*wet.sampleRate);
        for (let i=start; i<start+samples; i++) sum += signal[i]*signal[i];
        return Math.sqrt(sum/samples);
      };
      return {windows, supported:!!descriptor?.value, mismatch, bytes:a.length, referenceBytes:b.length,
        source:energyAt(7.65), gap:energyAt(7.92), echo:energyAt(8.15)};
    });
    assert.ok(!continuity.supported || continuity.windows > 0, "long render used scheduler windows");
    assert.equal(continuity.bytes, continuity.referenceBytes);
    assert.equal(continuity.mismatch, 0, "sample-identical voices and automation across render windows");
    assert.ok(continuity.source > .01 && continuity.gap < .001 && continuity.echo > .01, "delay echo survived the scheduler window");
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
};
