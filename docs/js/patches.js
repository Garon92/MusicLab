/* Device patches change instrument settings. Per-track levels and clips are independent. */
(() => {
  "use strict";
  const {h,btn} = App.UI;
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = "musiclab.instrument-patches.1";
  const names = {syn:"Synth", kit:"Drums", smp:"Sampler"};
  const recipes = {
    syn: [
      ["Sub bass", "Sine fundamental, short release, mono glide", {w1:0,w2:1,lv2:.12,cut:550,res:.6,aa:.003,as:.8,ar:.07,mode:1,glide:.035}],
      ["Acid lead", "Sawtooth, resonant filter envelope, mono glide", {w1:2,cut:420,res:10,fenv:3.5,fd:.18,fs:.04,aa:.002,ad:.2,as:.65,ar:.09,mode:1,glide:.065}],
      ["Glass keys", "FM transients with a long bell-like decay", {w1:0,w2:0,semi2:12,lv2:.13,fm:.32,cut:8500,aa:.002,ad:.9,as:.09,ar:.62}],
      ["Wide pad", "Detuned oscillators, slow attack, drifting filter", {w1:2,w2:2,lv2:.48,fine2:11,cut:1600,res:.7,aa:.48,ad:.8,as:.7,ar:1.4,lrate:.22,ldest:2,ldep:.14}],
      ["Dub chord", "Short, filtered polyphonic stab", {w1:3,w2:2,semi2:12,lv2:.18,cut:660,res:2.6,fenv:1.8,fd:.18,aa:.004,ad:.22,as:.15,ar:.32}],
      ["Pulse arpeggio", "Square-wave pluck, two-octave rising sixteenths", {w1:3,cut:2100,res:2,aa:.002,ad:.15,as:.28,ar:.09}, {mode:1,rate:1,oct:2,gate:.58}]
    ],
    kit: [
      ["Tight machine", "Short kick and hats, dry snare", {tune:54,dec:.24,sweep:25}, {tune:205,ndec:.10}, {ndec:.032}, {ndec:.18}],
      ["Deep machine", "Low long kick, dark snare, open cymbal", {tune:46,dec:.85,sweep:19}, {col:1150,ndec:.24}, {col:6200,ndec:.06}, {ndec:.52}],
      ["Broken beat", "Punchy mid kick, bright snare, short metallic hats", {tune:62,dec:.23,swt:.026}, {tune:220,col:2700,ndec:.15}, {col:10000,ndec:.035}, {col:8800,ndec:.23}]
    ],
    smp: [
      ["One shot", "Play the current region to its end", {mode:0,shot:1,loop:0,rev:0}],
      ["Gated keys", "Transpose the sample and release with the key", {mode:0,shot:0,loop:0,rev:0,aa:.005,ar:.16}],
      ["Looped pad", "Sustain the region with a slow fade in and out", {mode:0,shot:0,loop:1,rev:0,aa:.32,ar:.8}],
      ["Chop to 8", "Map eight equal slices across the pads", {mode:1,slices:8,shot:1,loop:0,rev:0}],
      ["Reverse swell", "Play backwards with a soft attack", {mode:0,shot:1,loop:0,rev:1,aa:.12,ar:.26}]
    ]
  };
  function saveable(t) {
    if (t.kind === "syn") return {syn:clone(t.syn), arp:clone(t.arp)};
    if (t.kind === "smp") {
      const {id,st,en,root,markers,warpSource,warpSpec,zones,...smp} = t.smp;
      return {smp};
    }
    return {kit:{pads:t.kit.pads.map(p => {
      const {id,src,st,en,name,...params} = p; return params;
    })}};
  }
  function factory(t, recipe) {
    const [, , params,extra,hat,open] = recipe;
    if (t.kind === "syn") return {syn:{...App.defs(App.DEF.syn),...params}, arp:{...App.defs(App.DEF.arp),...extra}};
    if (t.kind === "smp") return saveable({kind:"smp",smp:{...App.defs(App.DEF.smp),...params}});
    const kit = App.newKit(t.kit.pads.length);
    [params,extra,hat,open].forEach((body,i) => Object.assign(kit.pads[[0,1,3,4][i]],body));
    return saveable({kind:"kit",kit});
  }
  function readLibrary() {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return Array.isArray(stored) ? stored.filter(x => x && typeof x.name === "string" && Object.hasOwn(names,x.kind) && x.sound) : [];
    } catch { return []; }
  }
  function writeLibrary(list) {
    try { localStorage.setItem(key,JSON.stringify(list)); return true; }
    catch { App.UI.msg("PATCH LIBRARY COULD NOT BE SAVED IN THIS BROWSER"); return false; }
  }
  function open() {
    const P = App.P, ti = P.sel.t, T = P.tracks[ti], kind = T.kind;
    const node = App.Workspace.begin("Instrument patches"), library = readLibrary();
    const body = h("div.dlg-body.patch-editor");
    const list = h("select",{"aria-label":"Instrument patch"}), caption = h("p.patch-description.dlg-tip");
    const name = h("input", {type:"text", maxlength:32, placeholder:"Patch name", "aria-label":"New patch name"});
    let entries = [];
    function populate() {
      list.replaceChildren(); entries = [];
      const addGroup = (label, options) => {
        if (!options.length) return;
        const group = h("optgroup", {label});
        for (const entry of options) {
          group.append(h("option", {value:entries.length, text:entry.name})); entries.push(entry);
        }
        list.append(group);
      };
      addGroup("Factory", recipes[kind].map(r => ({name:r[0],text:r[1],sound:()=>factory(T,r)})));
      addGroup("This project", P.tracks.flatMap((t,i) => i === ti || t.kind !== kind ? [] : [{
        name:"Track "+App.pad2(i+1)+" · "+t.name, text:"Copy this track’s instrument settings and sample assignments.", source:t
      }]));
      addGroup("My patches", library.filter(x=>x.kind===kind).map(x=>({name:x.name,text:"Saved settings · uses this track’s audio",sound:()=>x.sound,saved:x})));
    }
    function update() {
      const entry = entries[Number(list.value)];
      caption.textContent = entry.text;
      forget.hidden = !entry.saved;
      save.disabled = !name.value.trim();
    }
    const save = btn("Save current sound", "Save the active device settings to this browser", () => {
      const label = name.value.trim();
      if (!label) return;
      if (library.some(x=>x.kind===kind && x.name.toLowerCase()===label.toLowerCase())) {
        caption.textContent = "A patch with that name already exists."; name.focus(); return;
      }
      const entry = {name:label,kind,sound:saveable(T)};
      if (!writeLibrary([...library,entry])) return;
      library.push(entry); name.value = ""; populate();
      list.value = String(entries.findIndex(e=>e.saved===entry)); update();
    });
    const forget = btn("Remove saved patch", "Remove this entry from the local library", () => {
      const entry = entries[Number(list.value)].saved;
      if (!entry) return;
      const updated = library.filter(x=>x!==entry);
      if (!writeLibrary(updated)) return;
      library.splice(library.indexOf(entry),1); populate(); update();
    });
    const apply = btn("Load patch", "Apply to the selected instrument in one undo step", () => {
      if (App.P !== P) {node.close(); return;}
      const entry = entries[Number(list.value)];
      App.releaseAll();
      if (entry.source) {
        T[kind] = clone(entry.source[kind]);
        if (kind === "syn") T.arp = clone(entry.source.arp);
      } else {
        const sound = entry.sound();
        if (kind === "kit") {
          T.kit.pads.forEach((pad,i) => {
            const {name,id,src,st,en} = pad;
            Object.assign(pad,sound.kit.pads[i],{name,id,src,st,en});
          });
        } else if (kind === "smp") {
          const {id,st,en,root,warpSource,warpSpec,markers,slices} = T.smp;
          Object.assign(T.smp,sound.smp,{id,st,en,root,warpSource,warpSpec});
          T.smp.markers = T.smp.slices === slices ? markers : [];
        } else {
          Object.assign(T.syn,App.defs(App.DEF.syn),sound.syn,{graph:App.InstrumentLab.graphOf(sound.syn.graph),frames:App.InstrumentLab.framesOf(sound.syn.frames)}); Object.assign(T.arp,sound.arp);
        }
      }
      App.commit(); App.refresh(); node.close(); App.UI.msg("PATCH LOADED · "+entry.name);
    },"confirm-action");
    list.onchange = update; name.oninput = update;
    body.append(h("h2",{text:"Instrument patches"}),h("div.arr-summary",{text:App.pad2(ti+1)+" "+T.name+" / "+names[kind]}),
      h("label.patch-field",null,"Load sound",list),caption,forget,
      h("label.patch-field",null,"Save settings in this browser",h("span.arr-row",null,name,save)),
      h("div.dlg-buttons",null,apply));
    node.classList.add("patch-dialog"); node.append(body); populate(); update(); node.showModal();
  }
  App.Patches = {open};
})();
