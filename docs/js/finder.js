/* Navigate to the existing editor or control. Search is independent of the open dialog's draft. */
(() => {
  "use strict";
  const {h,btn}=App.UI;
  const normal=text=>String(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  let finder;
  function focusControl(el){
    if(!el)return;
    el.scrollIntoView({block:"nearest"});el.focus({preventScroll:true});el.classList.add("finder-hit");
    setTimeout(()=>el.classList.remove("finder-hit"),1400);
  }
  function within(label){
    const container=document.querySelector("dialog[open]:not(.find-dialog)");
    if(container)focusControl([...container.querySelectorAll("[aria-label]")].find(e=>normal(e.getAttribute("aria-label"))===normal(label)));
  }
  function sampler(open){
    const P=App.P;
    const i=P.tracks[P.sel.t].kind==="smp" ? P.sel.t :
      P.tracks.findIndex(t=>t.kind==="smp" && t.smp.id)>=0 ? P.tracks.findIndex(t=>t.kind==="smp" && t.smp.id):P.tracks.findIndex(t=>t.kind==="smp");
    if(i<0){App.Workspace.focus("dv");App.UI.msg("SELECT A TRACK AND CHOOSE SAMPLER IN DEVICE");return;}
    App.select(i,P.sel.p);open(i);
  }
  // Names and aliases lead to the same functions as each control at its normal location.
  function catalogue(){
    const rows=[],add=(label,path,aliases,run)=>rows.push({label,path,aliases,run});
    add("Song arrangement","Song / Arrange","timeline sections ripple insert move copy refrén sloka aranž přesun",()=>App.Song.open());
    add("Tempo & meter map","Song / Arrange","BPM conductor ramp time signature takt tempo mapa zrychlit",()=>App.Song.open("conductor"));
    add("Song chords","Song / Chords","harmony progression akordy bass voice leading",()=>App.Harmony.open());
    add("Audio timeline","Song / Audio","takes comp crossfade split trim nahrávka prolnutí střih",()=>App.AudioStudio.open());
    add("Loop overdubs","Song / Audio / Looper","looper layer record vrstva smyčka",()=>{App.AudioStudio.open();document.querySelector("dialog[open]") && [...document.querySelectorAll("dialog[open] button")].find(b=>b.textContent.trim().toLowerCase()==="looper")?.click();});
    add("Transcribe audio to notes","Song / Audio / Transcribe","audio midi hummed sing whistle melodie hlas přepis noty",()=>App.AudioStudio.openTranscription());
    add("Capture recent notes","Transport / Capture","retrospective recover playing zapomenuté nahrávání zpětně",()=>App.Retrospective.open());
    add("Clip launcher","Clip matrix / Live","launch scenes queue spustit klipy",()=>App.Live.open());
    add("Recorded launch events","Clip matrix / Live / Take","capture edit recorded live performance záznam klipů",()=>App.Live.open("take"));
    add("Phrase editing","Clip matrix / Phrase","length repeat resize overlay stretch copy prodloužit zkrátit opakovat",()=>App.Phrases.open());
    add("Batch edit & defaults","Clip matrix / Batch edit","clean reset selected tracks defaults notes batch quantize hromadně výchozí vyčistit",()=>App.Operations.open());
    add("Note rules & print pass","Edit / Rules","fill every fourth pass random seed probability conditions freeze podmínky náhoda",()=>App.Rules.open());
    add("Groove & timing","Edit / Groove","microtiming clap swing timing tleskání",()=>App.Groove.open());
    add("Clip automation","Edit / Automation","curve envelope fade automatizace křivka",()=>{App.Workspace.focus("ed");App.Automation.open();});
    add("Instrument patches","Device / Patch","patch presets settings předvolby zvuky",()=>App.Patches.open());
    add("Modulation matrix","Device / Mod","LFO macros mappings envelope modulace makra",()=>App.Rack.modulate());
    add("Sample warp & slices","Device / Sampler / Edit","warp tempo stretch audio slice transient řezy vzorku natáhnout",()=>sampler(i=>{App.AudioStudio.editSample(i);within("Source BPM");}));
    add("Multisample zones","Device / Sampler / Zones","key velocity layers round robin multisampler zóny vrstvy",()=>sampler(i=>App.SamplerLab.zones(i)));
    add("Granular sampler","Device / Sampler","grains density jitter granular zrno zrnka hustota",()=>sampler(i=>{App.Workspace.focus("dv");App.Dv.build();focusControl([...document.querySelectorAll("#dv [aria-label]")].find(e=>/PITCHED SAMPLE|sampler mode|playback mode/i.test(e.getAttribute("aria-label"))) || document.querySelector("#dv .pm.en"));App.UI.msg("CHOOSE GRAIN IN THE SAMPLER MODE CONTROL");}));
    add("Mixer routing & inserts","Master / Routing","inserts chain group bus compressor efekty sběrnice",()=>App.Rack.mixer());
    add("Sidechain","Master / Routing / Sidechain","ducking key source kompresor kopák",()=>{App.Rack.mixer();within("Sidechain key");});
    add("Settings scenes","Master / Routing / Scenes","mix snapshots morph transition scény nastavení přechod",()=>App.Scenes.open());
    add("Parametric EQ","Master / Routing / EQ","equalizer frequency Q resonance spectrum notch ekvalizér rezonance",()=>App.ParametricEQ.open(App.P.sel.t));
    add("Signal analysis","Signal / Full view","spectrum phase scope tuner spectrogram osciloskop ladička",()=>App.Workspace.focus("sg"));
    add("MIDI connections & learn","Transport / MIDI","hardware clock sync controller CC learn zařízení",()=>App.MidiIO.open());
    add("Material library","File / Material library","library save phrase audition break knihovna",()=>App.Library.open());
    for(const [label,cmd,aliases] of [["Open project","open","load JSON otevřít projekt"],["Save project","save","download portable uložit projekt"],["Import MIDI","import-midi","MIDI file import načíst"],["Export MIDI","mid","download SMF export not"],["Export audio","wav","render WAV bounce export zvuk"],["Export stems","stems","tracks WAV ZIP export stopy"],["Reset project","new","new clear project reset smazat celý projekt nový"],["Restore last reset","restore","backup recovery obnovit záloha"]]){
      if(cmd!=="restore" || App.hasRecovery())add(label,"File / "+label,aliases,()=>App.file(cmd));
    }
    const P=App.P;
    P.tracks.forEach((t,i)=>add(t.name,"Clip matrix / Track "+(i+1),"track stopa select "+(i+1),()=>App.select(i)));
    const active=document.querySelector("dialog[open]:not(.find-dialog)");
    for(const root of (active?[active]:[...document.querySelectorAll("#top,#dv,#fx")])){
      const path=active?active.getAttribute("aria-label"):({top:"Transport",dv:"Device / "+P.tracks[P.sel.t].name,fx:"Master"})[root.id];
      const seen=new Set();
      for(const el of root.querySelectorAll('[role="slider"],input:not([type=hidden]),select')){
        const label=el.getAttribute("aria-label");if(!label || el.disabled || !el.getClientRects().length || seen.has(label))continue;
        seen.add(label);add(label,path+" / Control",el.dataset.tip || "",()=>focusControl(el));
      }
    }
    return rows;
  }
  function search(entries,query){
    const text=normal(query);if(!text)return entries.slice(0,12);
    const words=text.split(" ");
    return entries.map((r,i)=>{
      const label=normal(r.label),path=normal(r.path),alias=normal(r.aliases);
      if(!words.every(w=>label.includes(w)||path.includes(w)||alias.includes(w)))return null;
      const score=(label===text?150:0)+(label.startsWith(text)?60:0)+(label.includes(text)?30:0)+words.reduce((s,w)=>s+(label.includes(w)?10:0)+(alias.split(" ").includes(w)?4:0),0);
      return {r,score,i};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,30).map(x=>x.r);
  }
  function open(){
    if(finder?.open){finder.querySelector("input").focus();return;}
    App.UI.closeMenu();App.releaseAll();
    const last=document.activeElement, sourceDialog=document.querySelector("dialog[open]"), entries=catalogue();
    const node=finder=h("dialog.console-dialog.find-dialog",{"aria-label":"Find command"}),body=h("div.dlg-body");
    const input=h("input.find-input",{type:"search","aria-label":"Search commands",placeholder:"Search commands, controls or tracks",autocomplete:"off",spellcheck:"false",role:"combobox","aria-controls":"find-results","aria-expanded":"true"});
    const list=h("div.find-list",{role:"listbox",id:"find-results","aria-label":"Matching commands"}),count=h("output.find-count",{"aria-live":"polite"});
    let matches=[],index=0,navigating=false;
    function highlight(){
      [...list.children].forEach((el,i)=>el.setAttribute("aria-selected",String(i===index)));
      const el=list.children[index];if(el){input.setAttribute("aria-activedescendant",el.id);el.scrollIntoView({block:"nearest"});}else input.removeAttribute("aria-activedescendant");
    }
    function go(i){
      const row=matches[i];if(!row)return;
      navigating=true;node.close();
      if(sourceDialog?.open && !row.path.endsWith("/ Control"))sourceDialog.close();
      try{row.run();}catch(e){App.UI.msg(e.message || "CONTROL UNAVAILABLE");}
    }
    function update(){
      index=0;matches=search(entries,input.value);list.replaceChildren();
      matches.forEach((r,i)=>{const option=h("div.find-option",{role:"option",id:"find-option-"+i},h("strong",{text:r.label}),h("small",{text:r.path}));option.onmousedown=e=>e.preventDefault();option.onclick=()=>go(i);list.append(option);});
      count.textContent=matches.length?"↑ ↓ Select · Enter open · Esc close":"No matching controls";highlight();
    }
    node.onkeydown=e=>{
      if(["ArrowUp","ArrowDown","Home","End"].includes(e.key) && matches.length){e.preventDefault();index=e.key==="Home"?0:e.key==="End"?matches.length-1:(index+(e.key==="ArrowDown"?1:-1)+matches.length)%matches.length;highlight();}
      if(e.key==="Enter"){e.preventDefault();go(index);}
    };
    input.oninput=update;
    body.append(h("h2",{text:"Find in console"}),input,list,count);node.append(body);document.body.append(node);node.showModal();update();input.focus();
    node.onclick=e=>{if(e.target===node)node.close();};
    node.addEventListener("close",()=>{node.remove();if(finder===node)finder=null;if(!navigating && last?.isConnected)last.focus({preventScroll:true});},{once:true});
  }
  document.querySelector(".find-console").onclick=open;
  window.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey) && !e.altKey && e.key.toLowerCase()==="k"){e.preventDefault();e.stopImmediatePropagation();open();}},true);
  App.Finder={open};
})();
