/* The map of the console: every tool under the panel it lives in, with the key or the button that reaches it.
   Typing narrows the map, Enter goes there. It is independent of the draft in an open dialog. */
(() => {
  "use strict";
  const {h}=App.UI;
  const normal=text=>String(text).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  // Panels in the order they sit on the screen, then what the keyboard and the pointer do everywhere.
  const GROUPS=["Transport","Clip matrix","Song","Edit","Device","Master","Signal","File","View","Keys","Gestures","Tracks","Controls"];
  const CAP={Tracks:8,Controls:12};
  // Where each panel's tools stand on the map: four columns of about the same height.
  const COLUMNS=[["Transport","Song"],["Clip matrix","Edit","Master"],["Device","Signal","View","Keys"],["File","Gestures"]];
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
  // A button on the console, by the panel it is in and what it says.
  const press=(panel,text)=>[...document.querySelectorAll("#"+panel+" button")].find(b=>b.textContent.trim().toUpperCase().startsWith(text))?.click();
  function sampler(open){
    const P=App.P;
    const i=P.tracks[P.sel.t].kind==="smp" ? P.sel.t :
      P.tracks.findIndex(t=>t.kind==="smp" && t.smp.id)>=0 ? P.tracks.findIndex(t=>t.kind==="smp" && t.smp.id):P.tracks.findIndex(t=>t.kind==="smp");
    if(i<0){App.Workspace.focus("dv");App.UI.msg("SELECT A TRACK AND CHOOSE SAMPLER IN DEVICE");return;}
    App.select(i,P.sel.p);open(i);
  }
  function instrument(type){
    const P=App.P,ti=P.tracks[P.sel.t].kind==="syn"?P.sel.t:P.tracks.findIndex(t=>t.kind==="syn");
    if(ti<0){App.Workspace.focus("dv");App.UI.msg("CHOOSE SYNTH IN DEVICE TO DESIGN AN INSTRUMENT");return;}
    App.select(ti,P.sel.p);App.InstrumentLab.open(type,ti);
  }
  // Names and aliases lead to the same functions as each control at its normal location.
  function catalogue(){
    const rows=[];
    // path = panel / the button that opens it; key = the shortcut, shown in place of the button when there is one.
    const add=(label,path,aliases,run,key)=>{const parts=path.split(" / ");rows.push({label,path,group:parts[0],where:parts[1]||"",aliases,run,key});};
    // A line of the legend: something to know, not somewhere to go.
    const note=(group,label,key,aliases="")=>rows.push({label,path:group,group,where:"",aliases,key,info:true});
    const P=App.P,s=P.sel;

    add("Play / stop","Transport","start transport přehrát zastavit",()=>App.playToggle(),"SPACE");
    add("Stop, all sound off","Transport","panic all notes off ticho",()=>App.silence(),"ESC");
    add("Record notes","Transport / Rec","arm overdub nahrávat noty",()=>{App.recArm=!App.recArm;App.Top.sync();});
    add("Tape the output","Transport / Tape","record master bounce live nahrát zvuk",()=>App.tape());
    add("Capture recent notes","Transport / Capture","retrospective recover playing zapomenuté nahrávání zpětně",()=>App.Retrospective.open());
    add("Metronome","Transport / Click","click count metronom",()=>{P.click^=1;App.commit();App.Top.sync();});
    add("MIDI connections & learn","Transport / MIDI","hardware clock sync controller CC learn zařízení",()=>App.MidiIO.open());
    add("Undo","Transport","back zpět",()=>App.doUndo(-1),"CTRL/CMD Z");
    add("Redo","Transport","again znovu",()=>App.doUndo(1),"CTRL/CMD SHIFT Z");

    add("Clip launcher","Clip matrix / Live","launch scenes queue live session back to pattern song spustit klipy",()=>App.Live.open());
    add("Recorded launches","Clip matrix / Live","capture edit recorded live performance záznam klipů",()=>App.Live.open("take"));
    add("Batch edit & clean up","Clip matrix / Batch edit","clean reset selected tracks defaults notes batch quantize hromadně výchozí vyčistit",()=>App.Operations.open());
    add("Length, repeat, stretch","Clip matrix / Phrase","length repeat resize overlay stretch copy prodloužit zkrátit opakovat",()=>App.Phrases.open());
    add("Clear clip","Clip matrix / Right-click","delete erase empty smazat vyčistit klip",()=>App.clearClip(s.t,s.p));
    add("Duplicate clip","Clip matrix / Right-click","copy next cell kopie",()=>App.duplicateClip(s.t,s.p));
    add("Clear pattern","Clip matrix / Right-click","delete erase all tracks smazat pattern",()=>App.clearPattern(s.p));
    add("Duplicate pattern","Clip matrix / Right-click","copy variation kopie",()=>App.duplicatePattern(s.p));

    add("Song mode on / off","Song / Song","chain play pattern loop režim",()=>press("mx","SONG"));
    add("Add pattern to song","Song / Drag it","append chain slot přidat",()=>App.Song.insert(P.chain.length,s.p));
    add("Song arrangement","Song / Arrange","timeline sections ripple insert move copy refrén sloka aranž přesun",()=>App.Song.open());
    add("Tempo & meter map","Song / Arrange","BPM conductor ramp time signature takt tempo mapa zrychlit",()=>App.Song.open("conductor"));
    add("Song automation","Song / Arrange","continuous curves bend arrangement repeat stretch průběh obálka",()=>App.Song.open("automation"));
    add("Song chords","Song / Chords","harmony progression akordy bass voice leading",()=>App.Harmony.open());
    add("Audio timeline","Song / Audio","takes comp crossfade split trim microphone input delay latency offset nahrávka prolnutí střih zpoždění latence",()=>App.AudioStudio.open());
    add("Loop overdubs","Song / Audio","looper layer record vrstva smyčka",()=>{App.AudioStudio.open();[...document.querySelectorAll("dialog[open] button")].find(b=>b.textContent.trim().toLowerCase()==="looper")?.click();});
    add("Resample a range","Song / Audio","print bounce internal track group pre post tail sampler resampling",()=>App.AudioStudio.openResample());
    add("Audio to notes","Song / Audio","audio midi hummed sing whistle melodie hlas přepis noty",()=>App.AudioStudio.openTranscription());
    add("Spectral editor","Song / Audio","spectrogram selection isolate attenuate delta frequency spektrum",()=>App.AudioStudio.openSpectral());

    add("Draw notes","Edit / Draw","pencil tool kreslit",()=>press("ed","DRAW"));
    add("Select notes","Edit / Select","box marquee tool výběr",()=>press("ed","SELECT"));
    add("Clip automation","Edit / Automation","curve envelope fade automatizace křivka",()=>{App.Workspace.focus("ed");App.Automation.open();});
    add("Euclidean rhythm","Edit / Euclid","spread hits evenly generator rytmus",()=>press("ed","EUCLID"));
    add("Note values","Edit / Vel Prob Rpt Len","probability velocity repeat ratchet length note value default selected pravděpodobnost hlasitost délka noty výchozí",()=>{App.Workspace.focus("ed");document.querySelector("#ed .ed-note .pm")?.focus();});
    add("Cycle sequencer","Edit / Cycles","polymeter pitch gate accent rhythm phase generative polyrytmus",()=>App.Cycles.open());
    add("Groove & timing","Edit / Groove","microtiming clap swing timing tleskání",()=>App.Groove.open());
    add("Note rules & print pass","Edit / Rules","fill every fourth pass random seed probability conditions freeze podmínky náhoda",()=>App.Rules.open());

    add("Instrument patches","Device / Patch","patch presets settings předvolby zvuky",()=>App.Patches.open());
    add("Modulation matrix","Device / Modulation","LFO macros mappings envelope modulace makra",()=>App.Rack.modulate());
    add("Modular instrument","Device / Source","patch graph oscillator noise envelope resonator kabely modulární",()=>instrument("graph"));
    add("Wavetable instrument","Device / Source","resynthesis harmonic frames wave scan harmonické",()=>instrument("table"));
    add("Sample warp & slices","Device / Edit","warp tempo stretch audio slice transient řezy vzorku natáhnout",()=>sampler(i=>{App.AudioStudio.editSample(i);within("Source BPM");}));
    add("Multisample zones","Device / Mode","key velocity layers round robin multisampler zóny vrstvy",()=>sampler(i=>App.SamplerLab.zones(i)));
    add("Granular sampler","Device / Mode","grains density jitter granular zrno zrnka hustota",()=>sampler(i=>{App.Workspace.focus("dv");App.Dv.build();focusControl([...document.querySelectorAll("#dv [aria-label]")].find(e=>/PITCHED SAMPLE|sampler mode|playback mode/i.test(e.getAttribute("aria-label"))) || document.querySelector("#dv .pm.en"));App.UI.msg("CHOOSE GRAIN IN THE SAMPLER MODE CONTROL");}));

    add("Mixer routing & inserts","Master / Routing","inserts chain group bus compressor efekty sběrnice",()=>App.Rack.mixer());
    add("Parallel & band splits","Master / Routing","multiband crossover mid side branches paralelní pásma",()=>App.Rack.mixer());
    add("Sidechain","Master / Routing","ducking key source kompresor kopák",()=>{App.Rack.mixer();within("Sidechain key");});
    add("Parametric EQ","Master / EQ","equalizer frequency Q resonance spectrum notch ekvalizér rezonance",()=>App.ParametricEQ.open(App.P.sel.t));
    add("Setting scenes","Master / Scenes","mix snapshots morph transition scény nastavení přechod",()=>App.Scenes.open());
    add("Impulse response reverb","Master / IR","import room custom convolution kernel impuls odezva",()=>App.SignalWorkshop.openImpulse());

    add("Signal bench","Signal / Bench","measurement frequency response harmonics distortion delay transfer sweep měření",()=>App.SignalBench.open());

    for(const [label,cmd,aliases,key] of [["Open project","open","load JSON otevřít projekt"],["Save project","save","download portable uložit projekt","CTRL/CMD S"],["Import MIDI","import-midi","MIDI file import načíst"],["Export MIDI","mid","download SMF export not"],["Export audio","wav","render WAV bounce export zvuk"],["Export stems","stems","tracks WAV ZIP export stopy"],["Reset project","new","new clear project reset smazat celý projekt nový"],["Restore last reset","restore","backup recovery obnovit záloha"]]){
      if(cmd!=="restore" || App.hasRecovery())add(label,"File",aliases,()=>App.file(cmd),key);
    }
    add("Material library","File","library save phrase audition break knihovna",()=>App.Library.open());
    add("Project tuning","File","scala scl microtonal ratios cents temperament ladění",()=>App.InstrumentLab.tuning());

    for(const [id,name] of [["mx","Clip matrix"],["ed","Note editor"],["dv","Device"],["sg","Signal analysis"],["fx","Master"]])
      add("Expand "+name.toLowerCase(),"View","expand focus full view zoom scope spectrum tuner osciloskop zvětšit",()=>App.Workspace.focus(id));
    add("Full console","View","all panels back overview zpět",()=>App.Workspace.focus(""),"ESC");

    note("Keys","Play notes","A–K · W E T Y U","keyboard piano notes hrát klávesy");
    note("Keys","Octave down / up","Z · X","transpose keyboard oktáva");
    note("Keys","Select track","1–8 · UP DOWN","stopa");
    note("Keys","Select pattern","LEFT RIGHT","pattern");
    note("Keys","Fill notes while held","\\","conditional fill");
    note("Keys","This map","CTRL/CMD K","find search command hledat");

    note("Gestures","Any value","DRAG · WHEEL","knob slider parameter adjust hodnota");
    note("Gestures","Fine adjustment","SHIFT","precise slow jemně");
    note("Gestures","Type a value","CLICK IT","enter exact number zadat");
    note("Gestures","Reset a value","RIGHT-CLICK","default výchozí");
    note("Gestures","Reset a module","RIGHT-CLICK ITS NAME","default init whole module device strip výchozí modul");
    note("Gestures","Any list","CLICK · WHEEL","dropdown menu options seznam");
    note("Gestures","Object menu","RIGHT-CLICK","context menu clip pattern track slot pad nabídka");
    note("Gestures","Copy or move","DRAG THE GRIP","drag drop clip pattern slot pad track přetáhnout");
    note("Gestures","Rename","DOUBLE-CLICK","name track pad přejmenovat");
    note("Gestures","Mute / solo alone","ALT-CLICK","exclusive only sólo");
    note("Gestures","Load audio","DROP A FILE","sample import wav přetáhnout soubor");

    P.tracks.forEach((t,i)=>add(t.name,"Tracks / Track "+(i+1),"track stopa select "+(i+1),()=>App.select(i),String(i+1)));
    const active=document.querySelector("dialog[open]:not(.find-dialog)");
    for(const root of (active?[active]:[...document.querySelectorAll("#top,#dv,#fx")])){
      const place=active?active.getAttribute("aria-label"):({top:"Transport",dv:"Device",fx:"Master"})[root.id];
      const seen=new Set();
      for(const el of root.querySelectorAll('[role="slider"],[role="switch"],.pm.en,input:not([type=hidden]),select')){
        const label=(el.getAttribute("aria-label")||"").split(" · ")[0];if(!label || el.disabled || !el.getClientRects().length || seen.has(label))continue;
        seen.add(label);add(label,"Controls / "+place,el.dataset.tip || "",()=>focusControl(el));
      }
    }
    return rows;
  }
  function search(entries,query){
    const text=normal(query);if(!text)return entries;
    const words=text.split(" ");
    return entries.map((r,i)=>{
      const label=normal(r.label),path=normal(r.path+" "+(r.key||"")),alias=normal(r.aliases);
      if(!words.every(w=>label.includes(w)||path.includes(w)||alias.includes(w)))return null;
      const score=(label===text?150:0)+(label.startsWith(text)?60:0)+(label.includes(text)?30:0)+words.reduce((s,w)=>s+(label.includes(w)?10:0)+(alias.split(" ").includes(w)?4:0),0)-(r.info?200:0);
      return {r,score,i};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.r);
  }
  function open(){
    if(finder?.open){finder.querySelector("input").focus();return;}
    App.UI.closeMenu();App.releaseAll();
    const last=document.activeElement, sourceDialog=document.querySelector("dialog[open]"), entries=catalogue();
    const node=finder=App.Workspace.frame(h("dialog.console-dialog.find-dialog",{"aria-label":"Find command"}),"Find · map of the console"),body=h("div.dlg-body");
    const input=h("input.find-input",{type:"search","aria-label":"Search commands",placeholder:"Type a tool, a control or a track",autocomplete:"off",spellcheck:"false",role:"combobox","aria-controls":"find-results","aria-expanded":"true"});
    const map=h("div.find-map",{role:"listbox",id:"find-results","aria-label":"Matching commands"}),count=h("output.find-count",{"aria-live":"polite"});
    let order=[],index=0,navigating=false;
    // Everything fits one screen: groups flow into columns, and a long tail of matches is cut with a count.
    function render(){
      const query=input.value.trim(), all=search(entries,query).filter(r=>query || !CAP[r.group]), best=all.find(r=>!r.info);
      // The best matches that fit the window are shown; a broad query on a small window drops the weakest ones.
      let shown=all.length;
      paint(all,query);
      // Measured against the dialog's frame, not the body's own box: engines disagree on which of the two gives way.
      const over=()=>{
        const frame=node.getBoundingClientRect(), strip=parseFloat(getComputedStyle(node,"::after").height)||0, pad=parseFloat(getComputedStyle(body).paddingBottom)||0;
        return map.getBoundingClientRect().bottom>frame.bottom-strip-pad+1;
      };
      while(over() && shown>16){shown=Math.floor(shown*.85);paint(all.slice(0,shown),query);}
      if(shown<all.length)map.append(h("div.find-more",{text:"+ "+(all.length-shown)+" weaker matches · keep typing"}));
      index=Math.max(0,order.findIndex(o=>o.r===best));highlight();
    }
    function paint(hits,query){
      const boxes=new Map();
      order=[];map.replaceChildren();
      for(const group of GROUPS){
        let rows=hits.filter(r=>r.group===group);if(!rows.length)continue;
        const more=Math.max(0,rows.length-(CAP[group]||99));rows=rows.slice(0,CAP[group]||99);
        const box=h("section.find-group",{role:"group","aria-label":group},h("h3",{text:group}));
        for(const r of rows){
          const el=h("div.find-option"+(r.info?".info":""),{role:r.info?"note":"option"},h("strong",{text:r.label}),h("small",{text:r.key||r.where}));
          if(!r.info){
            const i=order.length;el.id="find-option-"+i;order.push({r,el});
            el.onmousedown=e=>e.preventDefault();el.onclick=()=>go(i);el.onpointermove=()=>{if(index!==i){index=i;highlight();}};
          }
          box.append(el);
        }
        if(more)box.append(h("div.find-more",{text:"+ "+more+" more · keep typing"}));
        boxes.set(group,{box,size:2.4+1.6*rows.length+(more?1.4:0)}); // height in text lines: heading, rows, the "more" line
      }
      // Each panel has its own column and keeps it while the map is narrowed, so a tool is always found in the same
      // place. The columns are laid out here, not by the browser, so the map is the same in every engine.
      // Matching tracks and controls, which only a query brings up, go under whichever column is shortest.
      const cols=COLUMNS.map(names=>names.map(g=>boxes.get(g)).filter(Boolean));
      for(const extra of ["Tracks","Controls"]){
        const x=boxes.get(extra);if(!x)continue;
        cols.reduce((short,c)=>c.reduce((t,y)=>t+y.size,0)<short.reduce((t,y)=>t+y.size,0)?c:short).push(x);
      }
      for(const c of cols)map.append(h("div.find-col",null,c.map(x=>x.box)));
    }
    function highlight(){
      order.forEach((o,i)=>o.el.setAttribute("aria-selected",String(i===index)));
      if(order.length)input.setAttribute("aria-activedescendant","find-option-"+index);else input.removeAttribute("aria-activedescendant");
      count.textContent=order.length?(index+1)+" / "+order.length:"NO MATCH";
      const r=order[index]?.r;
      tip.textContent=r?(r.label+" · "+r.group+(r.where?" › "+r.where:"")+(r.key?" · "+r.key:"")+" · ENTER = GO").toUpperCase():"NOTHING MATCHES · TRY ANOTHER WORD";
      App.UI.tip();
    }
    function go(i){
      const row=order[i]?.r;if(!row)return;
      navigating=true;node.close();
      if(sourceDialog?.open && row.group!=="Controls")sourceDialog.close();
      try{row.run();}catch(e){App.UI.msg(e.message || "CONTROL UNAVAILABLE");}
    }
    // Left and right step to the row at the same height in the neighbouring column.
    function sideways(dir){
      const here=order[index]?.el.getBoundingClientRect();if(!here)return;
      let pick=-1,far=Infinity;
      order.forEach((o,i)=>{
        const r=o.el.getBoundingClientRect(),dx=(r.left-here.left)*dir;
        if(dx<2)return;
        const d=dx*4+Math.abs(r.top-here.top);
        if(d<far){far=d;pick=i;}
      });
      if(pick>=0){index=pick;highlight();}
    }
    node.onkeydown=e=>{
      if(!order.length && e.key!=="Enter")return;
      if(["ArrowUp","ArrowDown","Home","End"].includes(e.key)){e.preventDefault();index=e.key==="Home"?0:e.key==="End"?order.length-1:(index+(e.key==="ArrowDown"?1:-1)+order.length)%order.length;highlight();}
      else if((e.key==="ArrowLeft"||e.key==="ArrowRight") && !input.value){e.preventDefault();sideways(e.key==="ArrowRight"?1:-1);}
      else if(e.key==="Enter"){e.preventDefault();go(index);}
    };
    input.oninput=render;
    map.addEventListener("wheel",e=>{e.preventDefault();if(!order.length)return;index=Math.min(Math.max(0,index+(e.deltaY>0?1:-1)),order.length-1);highlight();},{passive:false});
    const tip=h("p.dlg-tip");
    input._tip=()=>tip.textContent; // the strip describes where Enter goes, not the search field
    body.append(h("div.find-bar",null,input,count),map,tip);
    node.append(body);document.body.append(node);node.showModal();render();input.focus();App.Workspace.attend(node);
    let pressed=null;
    node.onpointerdown=e=>{pressed=e.target;};
    node.onclick=e=>{if(e.target===node && pressed===node)node.close();pressed=null;};
    node.addEventListener("close",()=>{node.remove();if(finder===node)finder=null;App.UI.tip();if(!navigating && last?.isConnected)last.focus({preventScroll:true});},{once:true});
  }
  document.querySelector(".find-console").onclick=open;
  window.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey) && !e.altKey && e.key.toLowerCase()==="k"){e.preventDefault();e.stopImmediatePropagation();open();}},true);
  App.Finder={open};
})();
