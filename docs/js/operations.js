/* MUSICLAB · scope-aware editing. The preview and Apply run the same transformations. */
(() => {
  "use strict";
  const { h, btn } = App.UI;
  const number = (key, label, initial, min, max) => ({ key, label, initial, min, max });
  const list = (key, label, values) => ({ key, label, initial: values[0][0], values });
  const percent = (key, label, initial, min = 0) => number(key, label + " (%)", initial, min, 100);
  const byCount = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  const round = n => Math.round(n * 1000) / 1000;
  const noteValues = [["v","Velocity"], ["p","Probability"], ["r","Repeats"], ["l","Length"]];
  const mixerValues = [["vol","Level"], ["pan","Pan"], ["dly","Delay send"], ["rev","Reverb send"], ["drive","Drive"], ["mute","Mute"], ["solo","Solo"]];
  const fxGroups = {
    delay:["dtime","dfb","dtone","dwid"], reverb:["rsize","rdamp"], eq:["low","mid","high"], output:["comp","vol"]
  };
  const mixGroups = { levels:["vol","pan"], switches:["mute","solo"], sends:["dly","rev","drive"] };
  const operations = {
    quantize: { group:"Notes", label:"Quantize starts", hint:"Move attacks towards the chosen grid within each pattern.", fields:() => [
      list("grid","Grid", [["2","1/8 note"],["4","1/4 note"],["8","1/2 note"],["beat","Beat"],["bar","Bar"]]), percent("strength","Strength",100)
    ] },
    scale: { group:"Notes", label:"Snap pitch to scale", hint:"Snap melodic instruments to the project key and scale.", fields:() => [
      list("tie","Equal distance", [["down","Lower note"],["up","Higher note"]])
    ] },
    values: { group:"Notes", label:"Set note values", hint:"Give the targeted notes the same value.", fields:v => [
      list("attribute","Attribute",noteValues), v.attribute === "p" ? percent("probability","Probability",100) :
        v.attribute === "r" ? number("repeats","Attacks",2,1,8) :
        v.attribute === "l" ? number("length","Length (steps)",1,1,App.MAX_STEPS) : percent("velocity","Velocity",80,2)
    ] },
    ramp: { group:"Notes", label:"Velocity ramp", hint:"Shape each phrase from its first attack to its last. Chords share a level.", fields:() => [
      percent("start","First attack",35,2), percent("end","Last attack",95,2)
    ] },
    accents: { group:"Notes", label:"Rhythmic accents", hint:"Blend existing velocities towards two levels. The rhythm restarts at each bar.", fields:() => [
      list("rhythm","Rhythm",[["downbeat","Bar downbeat"],["pulse","Every beat"],["backbeat","Backbeat"],["offbeat","Offbeats"],["tresillo","Tresillo · 3+3+2"]]),
      percent("blend","Blend",75), percent("accent","Accented velocity",100,2), percent("ghost","Other velocity",55,2)
    ] },
    normalize: { group:"Notes", label:"Normalize velocity", hint:"Set the loudest selected note in each clip to the target and scale the others proportionally.", fields:() => [
      percent("peak","Peak velocity",90,2)
    ] },
    humanize: { group:"Notes", label:"Humanize velocity", hint:"Vary each note by up to the chosen number of percentage points.", fields:() => [
      number("depth","Variation (± points)",12,0,60)
    ] },
    legato: { group:"Notes", label:"Legato", hint:"Set each duration to the following attack. The last attack runs to the pattern end.", fields:() => [
      list("voice","Next attack", [["any","Any pitch"],["same","Same pitch"]]), number("gap","Gap (steps)",0,0,8)
    ] },
    duplicates: { group:"Clean up", label:"Remove duplicate notes", hint:"Keep the loudest note on each identical pitch and step. An unselected note takes priority." },
    overlaps: { group:"Clean up", label:"Trim overlapping notes", hint:"Shorten a note where a later attack on the same pitch starts." },
    silent: { group:"Clean up", label:"Remove zero-chance notes", hint:"Remove notes whose probability is zero." },
    clear: { group:"Clean up", label:"Clear material", hint:"Erase the chosen material in the target.", fields:v => [
      list("material","Material", [["notes","Notes"],["curves","Automation"],["both","Notes + automation"]]),
      ...(v.material && v.material !== "notes" ? [list("lane","Automation lane",[
        ["all","All parameters"],["vol","Level"],["pan","Pan"],["filter","Filter"],["dly","Delay send"],["rev","Reverb send"],["cutoff","Voice cutoff"],
        ...[1,2,3,4].map(n=>["macro"+n,"Macro "+n])
      ])] : [])
    ] },
    setMix: { group:"Mix", label:"Set track control", kind:"tracks", hint:"Apply one mixer value to every targeted track.", fields:v => [
      list("control","Control",mixerValues),
      v.control === "pan" ? number("pan","Pan (−100 L / +100 R)",0,-100,100) :
        v.control === "vol" || !v.control ? number("db","Level (dB)",-6,-80,0) :
        ["solo","mute"].includes(v.control) ? list("switch","State",[["off","Off"],["on","On"]]) : percent("amount","Amount",0)
    ] },
    spread: { group:"Mix", label:"Spread stereo pan", kind:"tracks", hint:"Place tracks across the stereo field in track order.", fields:() => [percent("width","Stereo width",75)] },
    noteDefaults: { group:"Defaults", label:"Note expression", hint:"Restore note velocity to 80%, probability to 100% and repeats to one." },
    mixDefaults: { group:"Defaults", label:"Track mixer", kind:"tracks", hint:"Restore the chosen mixer section to its original track settings.", fields:() => [
      list("section","Section",[["all","Whole mixer strip"],["levels","Level + pan"],["sends","Sends + drive"],["switches","Mute + solo"]])
    ] },
    device: { group:"Defaults", label:"Instrument patch", kind:"tracks", hint:"Restore the active device on each track. Loaded samples and their pad assignments stay in place." },
    master: { group:"Defaults", label:"Master effects", kind:"master", hint:"Restore the selected section of the master effects rack.", fields:() => [
      list("section","Section",[["all","Whole master rack"],["delay","Delay"],["reverb","Reverb"],["eq","Equalizer"],["output","Compression + output"]])
    ] }
  };

  function nearestPitch(P, n, preferUp) {
    if (App.inScale(P, n)) return n;
    for (let distance = 1; distance <= 12; distance++) {
      const dir = preferUp ? distance : -distance;
      for (const pitch of [n + dir,n - dir])
        if (pitch >= 0 && pitch <= 127 && App.inScale(P, pitch)) return pitch;
    }
    return n;
  }

  function accented(rhythm, step, bar, beat) {
    const position = step % bar;
    switch (rhythm) {
      case "pulse": return position % beat === 0;
      case "backbeat": return position % (2 * beat) === beat;
      case "offbeat": return position % beat === beat / 2;
      // Tresillo counts eighths in groups of 3, 3 and 2. Short measures reset this cycle.
      case "tresillo": return [0,6,12].includes(position % 16);
      default: return position === 0;
    }
  }

  // Cache the next distinct onset for every pitch (or the entire clip for legato).
  function following(clip, samePitch) {
    const groups = new Map(), lookup = new Map();
    for (const note of clip) {
      const key = samePitch ? note.n : 0;
      if (!groups.has(key)) groups.set(key,new Set());
      groups.get(key).add(note.s);
    }
    for (const [key, starts] of groups) {
      const sorted = [...starts].sort((a,b) => a-b);
      for (let i = 1; i < sorted.length; i++) lookup.set(key * App.MAX_STEPS + sorted[i-1],sorted[i]);
    }
    return note => lookup.get((samePitch ? note.n : 0) * App.MAX_STEPS + note.s);
  }
  function randomAt(seed, t, p, i) {
    let x = (seed ^ Math.imul((t*8+p)*4000+i+1, 2654435761)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  const allIndices = Array.from({length:8}, (_,i) => i);
  function targets(P, state) {
    const {t,p} = P.sel, {scope} = state;
    if (scope === "selection" || scope === "clip") return { tracks:[t], patterns:[p] };
    if (scope === "pattern") return { tracks:allIndices, patterns:[p] };
    if (scope === "track") return { tracks:[t], patterns:allIndices };
    if (scope === "song") return { tracks:allIndices, patterns:[...new Set(P.chain)] };
    if (scope === "custom") return { tracks:[...state.tracks].sort((a,b)=>a-b), patterns:[...state.patterns].sort((a,b)=>a-b) };
    return { tracks:allIndices, patterns:allIndices };
  }

  function processNotes(P, trackIndex, pi, state, selected, apply, result) {
    const {id, values:v} = state, track = P.tracks[trackIndex], clip = track.clips[pi];
    const group = selected ? clip.filter(n => selected.has(n)) : clip;
    if (!group.length || (id === "clear" && v.material === "curves") ||
        (id === "scale" && (track.kind === "kit" || (track.kind === "smp" && track.smp.mode === 1)))) return;
    const steps = App.Live.length(P,trackIndex,pi);
    // A shorter visible pattern can contain dormant notes. They retain their stored phrase extent.
    const extent = Math.min(App.MAX_STEPS, clip.reduce((end,n) => Math.max(end,n.s + n.l),steps));
    const boundary = n => n.s < steps ? steps : Math.max(extent,n.s+1);
    const next = id === "overlaps" || id === "legato" ? following(clip,id === "overlaps" || v.voice === "same") : null;
    const removal = new Set();
    if (id === "duplicates") {
      const winners = new Map(), attack = n => n.s+"/"+n.n+"/"+(n.off||0);
      for (const note of clip) {
        const key = attack(note), keep = winners.get(key);
        const protectedNote = selected && !selected.has(note), protectedKeep = selected && keep && !selected.has(keep);
        if (!keep || protectedNote && !protectedKeep || !!protectedNote === !!protectedKeep && note.v > keep.v) winners.set(key,note);
      }
      for (const note of group) if (winners.get(attack(note)) !== note) removal.add(note);
    } else if (id === "silent" || id === "clear") {
      for (const note of group) if (id === "clear" ? v.material !== "curves" : note.p === 0) removal.add(note);
    }
    const before = result.notes;
    if (removal.size) {
      result.notes += removal.size;
      if (apply) {
        const retained = clip.filter(note => !removal.has(note));
        clip.splice(0,clip.length,...retained);
      }
    } else if (!["clear","silent","duplicates"].includes(id)) {
      let low = Infinity, high = -Infinity, peak = 0;
      for (const n of group) { low = Math.min(low,n.s); high = Math.max(high,n.s); peak = Math.max(peak,n.v); }
      const beat = App.beatSteps(P), bar = App.spb(P);
      const grid = v.grid === "beat" ? beat : v.grid === "bar" ? bar : Number(v.grid);
      for (const [i,n] of group.entries()) {
        let patch;
        switch (id) {
          case "quantize": {
            const end = boundary(n);
            const nearest = Math.min(Math.floor((end-1)/grid),Math.round((n.s+(n.off||0))/grid)) * grid;
            const s = Math.round(n.s + (nearest-n.s)*v.strength/100);
            patch = s === n.s ? {} : {s,l:Math.min(n.l,end-s)};
            if (n.off && v.strength) patch.off=round(n.off*(1-v.strength/100));
            break;
          }
          case "scale": patch = {n:nearestPitch(P,n.n,v.tie === "up")}; break;
          case "values": {
            const value = {v:v.velocity/100, p:v.probability/100, r:v.repeats, l:Math.min(v.length,boundary(n)-n.s)}[v.attribute];
            patch = {[v.attribute]:value};
            break;
          }
          case "ramp": patch = {v:round((v.start+(v.end-v.start)*(high===low ? 0 : (n.s-low)/(high-low)))/100)}; break;
          case "accents": {
            const target = (accented(v.rhythm,n.s,bar,beat) ? v.accent : v.ghost) / 100;
            patch = {v:v.blend === 0 ? n.v : round(n.v + (target - n.v) * v.blend/100)};
            break;
          }
          case "normalize": patch = {v:round(App.clamp(n.v/peak*v.peak/100,.02,1))}; break;
          case "humanize": patch = {v:round(App.clamp(n.v + (randomAt(state.seed,trackIndex,pi,i)*2-1)*v.depth/100,.02,1))}; break;
          case "legato": patch = {l:Math.max(1,Math.min(next(n) ?? boundary(n),boundary(n))-n.s-v.gap)}; break;
          case "overlaps": patch = {l:Math.min(n.l,(next(n) ?? Infinity)-n.s)}; break;
          case "noteDefaults": patch = {v:.8,p:1,r:1}; break;
          default: continue;
        }
        const keys = Object.keys(patch).filter(key => patch[key] !== (key === "r" ? n.r || 1 : n[key]));
        if (!keys.length) continue;
        result.notes++;
        if (!result.example) {
          const key = keys[0], prev = key === "r" ? n.r || 1 : n[key];
          const format = value => key === "n" ? App.noteName(value) : key === "s" ? "step " + (value+1) :
            key === "l" ? byCount(value,"step") : key === "r" ? byCount(value,"hit") : Math.round(value*100) + "%";
          result.example = track.name + " / " + App.PATS[pi] + " · " + format(prev) + " → " + format(patch[key]);
        }
        if (apply) for (const key of keys) {
          if (key === "off" && !patch.off) delete n.off;
          else if (key === "r" && patch[key] === 1) delete n.r;
          else n[key] = patch[key];
        }
      }
      if (apply && result.notes !== before && ["quantize","scale"].includes(id)) clip.sort((a,b) => a.s-b.s || a.n-b.n);
    }
    return result.notes !== before;
  }

  function patchDefaults(track, factory) {
    if (track.kind === "syn") return {syn:factory.syn, arp:factory.arp};
    if (track.kind === "smp") {
      const {id,warpSource,warpSpec,markers,slices,zones}=track.smp;
      return {smp:{...factory.smp,id,warpSource,warpSpec,zones,...(markers?.length ? {markers,slices} : {})}};
    }
    return {kit:{pads:factory.kit.pads.map((pad,i) => {
      const current = track.kit.pads[i];
      return current.id ? {...pad,id:current.id,src:current.src,name:current.name,dec:current.src ? App.DEF.pad.dec.max : pad.dec} : pad;
    })}};
  }
  function execute(P, state, apply = false) {
    const {id, values:v} = state, kind = operations[id].kind, target = targets(P,state);
    const result = {notes:0,lanes:0,clips:0,tracks:0,controls:0,example:""};
    if (kind === "master") {
      if ((v.section==="reverb" || v.section==="all") && P.impulse?.sample) {
        result.controls++;
        if (apply) P.impulse.sample="";
      }
      const keys = fxGroups[v.section] || Object.keys(App.DEF.fx);
      for (const key of keys) if (P.fx[key] !== App.DEF.fx[key].def) {
        result.controls++;
        if (apply) P.fx[key] = App.DEF.fx[key].def;
      }
      return result;
    }
    if (kind === "tracks") {
      const factory = ["mixDefaults","device"].includes(id) ? App.newProject() : null;
      for (const [i,ti] of target.tracks.entries()) {
        const tr = P.tracks[ti];
        let patch;
        if (id === "device") patch = patchDefaults(tr,factory.tracks[ti]);
        if (id === "mixDefaults") {
          const keys = mixGroups[v.section] || Object.keys(App.DEF.trk);
          patch = Object.fromEntries(keys.map(key => [key,factory.tracks[ti][key]]));
        }
        if (id === "setMix") {
          const val = v.control === "pan" ? v.pan/100 : v.control === "vol" ? 10**(v.db/40) :
            ["solo","mute"].includes(v.control) ? +(v.switch === "on") : v.amount/100;
          patch = {[v.control]:val};
        }
        if (id === "spread") patch = {pan:round((target.tracks.length === 1 ? 0 : 2*i/(target.tracks.length-1)-1)*v.width/100)};
        // Test patch fields independently to preserve every unrelated object and sample reference.
        const keys = Object.keys(patch).filter(k => JSON.stringify(tr[k]) !== JSON.stringify(patch[k]));
        if (keys.length) {
          result.tracks++;
          if (!result.example) {
            const key = keys[0], def = App.DEF.trk[key];
            result.example = tr.name + (def ? " · "+def.l+" "+App.fmt(def,tr[key])+" → "+App.fmt(def,patch[key]) : " · "+tr.kind.toUpperCase());
          }
          if (apply) for (const k of keys) tr[k] = patch[k];
        }
      }
      return result;
    }
    const selected = state.scope === "selection" ? App.Ed.selected() : null;
    for (const ti of target.tracks) for (const pi of target.patterns) {
      let changed = processNotes(P,ti,pi,state,selected,apply,result);
      if (id === "clear" && v.material !== "notes") {
        const bank = P.tracks[ti].automation;
        const lanes = Object.keys(bank?.[pi] || {}).filter(k => v.lane === "all" || k === v.lane);
        if (lanes.length) {
          result.lanes += lanes.length;
          changed = true;
          if (apply) for (const key of lanes) delete bank[pi][key];
        }
      }
      if (changed) result.clips++;
    }
    return result;
  }

  function summary(result) {
    return [[result.notes,"note"],[result.lanes,"lane"],[result.clips,"clip"],[result.tracks,"track"],[result.controls,"control"]]
      .filter(([n]) => n).map(([n,label]) => byCount(n,label)).join(" · ");
  }
  function options(select, entries, value) {
    select.replaceChildren(...entries.map(([key,label]) => h("option",{value:key,text:label})));
    select.value = value;
  }
  function open() {
    const P = App.P, {t,p} = P.sel;
    const node = App.Workspace.begin("Batch edit");
    node.classList.add("process-dialog");
    const state = {group:"Notes", id:"quantize", values:{}, scope:"clip", seed:Math.floor(Math.random()*4294967296), tracks:new Set([t]), patterns:new Set([p])};
    const selection = App.Ed.selected();
    const remembered = {notes:selection.size ? "selection" : "clip", tracks:"track", master:"master"};
    const body = h("div.dlg-body");
    const categories = h("div.ops-tabs", {role:"group","aria-label":"Batch edit category"});
    const action = h("select", {"aria-label":"Operation"});
    const scope = h("select", {"aria-label":"Target"});
    const fields = h("div.ops-fields"), scopeControls = h("div.ops-masks");
    const description = h("p.ops-description");
    const preview = h("strong"), example = h("span");
    const previewBox = h("div.ops-preview",{role:"status","aria-live":"polite"},preview,example);
    const cancel = btn("Cancel", "Close without applying", () => node.close());
    const applyButton = btn("Apply", "Apply the previewed operation as one undo step", apply, "confirm-action");
    const row = (title, control) => h("label.ops-field",null,h("span",{text:title}),control);

    function renderPreview() {
      const invalid = [...fields.querySelectorAll("input")].some(input => !input.validity.valid || !input.value.trim());
      const result = invalid ? null : execute(P,state);
      const brief = result && summary(result);
      preview.textContent = invalid ? "Enter a value in range" : brief || "No changes";
      let detail = result?.example || "";
      const target = targets(P,state);
      if (!detail && state.scope === "selection") detail = byCount(App.Ed.selected().size,"selected note");
      else if (!detail && state.scope === "master") detail = "Master rack";
      else if (!detail) {
        const tracks = byCount(target.tracks.length,"track");
        detail = operations[state.id].kind === "tracks" ? tracks : tracks + " × " + byCount(target.patterns.length,"pattern");
      }
      example.textContent = detail;
      applyButton.disabled = !brief || P !== App.P;
    }
    function apply() {
      if (applyButton.disabled || P !== App.P) return;
      const result = execute(P,state,true), brief = summary(result);
      if (!brief) { renderPreview(); return; }
      App.commit();
      App.refresh();
      node.close();
      App.UI.msg(operations[state.id].label.toUpperCase() + " · " + brief.toUpperCase());
    }
    function scopes() {
      const kind = operations[state.id].kind;
      if (kind === "master") return [["master","Master rack"]];
      if (kind === "tracks") return [["track","Current track · "+P.tracks[t].name],["custom","Choose tracks…"],["all","All tracks"]];
      const arr = [["clip","Current clip · "+P.tracks[t].name+" / "+App.PATS[p]],["pattern","Current pattern · "+App.PATS[p]+" / all tracks"],
        ["track","Current track · "+P.tracks[t].name+" / all patterns"],["custom","Choose tracks and patterns…"]];
      if (selection.size && (state.id !== "clear" || state.values.material === "notes"))
        arr.unshift(["selection","Selected notes · "+selection.size]);
      if (P.chain.length) arr.push(["song","Song patterns · "+[...new Set(P.chain)].map(i=>App.PATS[i]).join(" ")]);
      arr.push(["all","All tracks and patterns"]);
      return arr;
    }
    function mask(title, keys, selected, label, tip) {
      const container = h("div.ops-mask",{role:"group","aria-label":title});
      const choices = h("div.ops-choices");
      const all = btn("All","Toggle all "+title.toLowerCase(),() => {
        if (selected.size === keys.length) selected.clear();
        else keys.forEach(k => selected.add(k));
        const enabled = String(selected.size === keys.length);
        all.setAttribute("aria-pressed",enabled);
        for (const button of choices.children) button.setAttribute("aria-pressed",enabled);
        renderPreview();
      });
      all.setAttribute("aria-pressed",String(selected.size === keys.length));
      for (const k of keys) {
        const b = btn(label(k),tip(k),() => {
          if (selected.has(k)) selected.delete(k); else selected.add(k);
          b.setAttribute("aria-pressed",String(selected.has(k)));
          all.setAttribute("aria-pressed",String(selected.size === keys.length));
          renderPreview();
        });
        b.setAttribute("aria-pressed",String(selected.has(k)));
        b.setAttribute("aria-label",tip(k));
        b.title = tip(k);
        choices.append(b);
      }
      container.append(h("span",{text:title}),choices,all);
      return container;
    }
    function renderMasks() {
      scopeControls.replaceChildren();
      if (state.scope !== "custom") return;
      scopeControls.append(mask("Tracks",allIndices,state.tracks,k=>String(k+1),k=>"Track "+(k+1)+" · "+P.tracks[k].name));
      if (operations[state.id].kind !== "tracks") scopeControls.append(mask("Patterns",allIndices,state.patterns,k=>App.PATS[k],k=>"Pattern "+App.PATS[k]));
    }
    function renderScope() {
      const entries = scopes(), kind = operations[state.id].kind || "notes";
      state.scope = entries.some(([key]) => key === remembered[kind]) ? remembered[kind] : entries[0][0];
      options(scope,entries,state.scope);
      scope.disabled = entries.length === 1;
      renderMasks();
    }
    function renderFields() {
      fields.replaceChildren();
      const op = operations[state.id], v = state.values;
      const specs = op.fields?.(v) || [];
      for (const spec of specs) {
        if (v[spec.key] === undefined) v[spec.key] = spec.initial;
        if (spec.values) {
          const input = h("select",{"aria-label":spec.label});
          options(input,spec.values,v[spec.key]);
          input.onchange = () => {
            v[spec.key] = input.value;
            renderFields(); renderScope(); renderPreview();
            [...fields.querySelectorAll("select")].find(el => el.getAttribute("aria-label") === spec.label)?.focus();
          };
          fields.append(row(spec.label,input));
        } else {
          const input = h("input",{type:"number",min:spec.min,max:spec.max,step:1,required:true,value:v[spec.key],"aria-label":spec.label});
          input.oninput = () => { v[spec.key] = input.valueAsNumber; renderPreview(); };
          fields.append(row(spec.label,input));
        }
      }
      if (state.id === "humanize") fields.append(btn("Reroll","Preview another variation",() => {
        state.seed = Math.floor(Math.random()*4294967296); renderPreview();
      }));
      description.textContent = op.hint;
      if (state.id === "scale") description.textContent += " " + App.NOTES[P.key] + " " + App.SCALES[P.scale][0] + ".";
    }
    function renderAction() {
      state.values = {};
      const entries = Object.entries(operations).filter(([,op]) => op.group === state.group);
      options(action,entries.map(([id,op]) => [id,op.label]),state.id);
      for (const tab of categories.children) tab.setAttribute("aria-pressed", String(tab.textContent === state.group));
      renderFields(); renderScope(); renderPreview();
    }
    action.onchange = () => { state.id = action.value; renderAction(); };
    scope.onchange = () => {
      state.scope = scope.value;
      remembered[operations[state.id].kind || "notes"] = state.scope;
      renderMasks(); renderPreview();
    };
    for (const group of ["Notes","Clean up","Mix","Defaults"]) {
      categories.append(btn(group,"Show "+group.toLowerCase()+" operations",() => {
        state.group = group;
        state.id = Object.keys(operations).find(id => operations[id].group === group);
        renderAction();
      }));
    }
    body.append(h("h2",{text:"Batch edit"}),categories,h("div.ops-route",null,row("Operation",action),row("Target",scope)),
      scopeControls,fields,description,previewBox,h("div.dlg-buttons",null,cancel,applyButton));
    node.append(body); renderAction(); node.showModal(); action.focus();
  }
  App.Operations = {open};
})();
