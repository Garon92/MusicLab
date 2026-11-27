/* Independent songbook and draft. Audio lives in the project's usual sample store. */
(() => {
  "use strict";
  const prefix = "musiclab.kids.v1.", draftKey = prefix + "draft", modeKey = prefix + "mode";
  const size = 8, slotKey = index => prefix + "slot." + index;
  const validSlot = n => Number.isInteger(n) && n >= 0 && n < size;
  let adult = null, journal = null, remembered = null;
  // All edits of an open song share its shelf destination, including edits made before its first save.
  let home = {slot:-1, version:null};
  const removals = new Map();
  let lastDraft = null, volatile = false;
  const previews = Array(size).fill(null);
  let previewRevision = 0;

  function soundProject(text) {
    const data = JSON.parse(text);
    if (data?.app !== "MUSICLAB" || data.v !== 3 || !Array.isArray(data.tracks)) throw Error("Invalid stored song");
    return App.sanitize(data);
  }
  function readDraft(text) {
    const data = JSON.parse(text);
    if (data?.project?.app !== "MUSICLAB" || data.project.v !== 3) throw Error("Invalid song draft");
    const project = App.sanitize(data.project);
    if (!project) throw Error("Invalid song draft");
    return {project, slot:validSlot(data.slot) ? data.slot : -1, version:data.version};
  }
  function failure() {
    window.dispatchEvent(new Event("kids-storage-error"));
    return false;
  }
  // Each shelf space has its own atomic record. Updating one never serializes or
  // rewrites its neighbours, even when another tab has its songbook open.
  function put(key, value) {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
  function writeDraft(project, index = linkedSlot(), version = home.version) {
    const next = '{"slot":'+index+',"version":'+JSON.stringify(index<0 ? null : version??null)+',"project":'+project+'}';
    if (next === lastDraft && !volatile) return true;
    try {
      put(draftKey,next);
      lastDraft = next; volatile = false;
      return true;
    } catch {
      volatile = true;
      return failure();
    }
  }

  // A saved version is a regular project for older readers. A deletion or its
  // restoration writes to that version's own key, even in a tab that has yet
  // to receive the storage event for a newer occupant of the shelf space.
  const overridePrefix=prefix+"undo.", writtenOverrides=new Map();
  const overrideKey=(index,version)=>overridePrefix+index+"."+version;
  const versionTag=/^\{"_bandShelfVersion":"([a-z0-9-]+)",/;
  const tag=raw=>raw?.match(versionTag)?.[1];
  const withoutTag=raw=>raw?.replace(versionTag,"{") ?? null;
  const versioned=raw=>'{"_bandShelfVersion":"'+crypto.getRandomValues(new Uint32Array(4)).join('-')+'",'+raw.slice(1);
  function slotState(index) {
    const base=localStorage.getItem(slotKey(index)), version=tag(base);
    const key=version ? overrideKey(index,version) : null;
    const override=key ? localStorage.getItem(key) : null;
    return {base,key,value:override===null ? base : override==="null" ? null : override};
  }
  function linkedSlot() {
    if (!validSlot(home.slot)) return -1;
    try {
      const state=slotState(home.slot);
      return state.value!==null && (tag(state.base)??null)===home.version ? home.slot : -1;
    } catch { return -1; }
  }
  function updateVersion(index, previous, version) {
    for (const entry of journal.st) {
      const dest=entry.destination;
      if (dest.slot===index && dest.version===previous) dest.version=version;
    }
  }
  function writeShelf(index, state, key, value, nextSlot, version, project=JSON.stringify(App.P)) {
    try {
      const previousDraft=localStorage.getItem(draftKey), previousLocal=lastDraft, previousVolatile=volatile;
      if (!writeDraft(project,nextSlot,version)) return false;
      try { put(key,value); }
      catch {
        if (localStorage.getItem(draftKey)===lastDraft) put(draftKey,previousDraft);
        lastDraft=previousLocal;volatile=previousVolatile;return failure();
      }
      const keep=key===state.key && value!==null ? key : null;
      for (const unused of [writtenOverrides.get(index),state.key]) {
        if (unused && unused!==keep) {
          try { localStorage.removeItem(unused); } catch { /* The exclusive sweep can retry. */ }
        }
      }
      if (keep) writtenOverrides.set(index,keep); else writtenOverrides.delete(index);
      return true;
    } catch { return failure(); }
  }
  window.addEventListener("storage",e=>{
    const match=e.key?.match(/^musiclab\.kids\.v1\.slot\.([0-7])$/), version=tag(e.oldValue);
    if (!match || !version || tag(e.newValue)===version) return;
    const i=Number(match[1]),unused=overrideKey(i,version);
    if (writtenOverrides.get(i)!==unused) return;
    try { localStorage.removeItem(unused);writtenOverrides.delete(i); } catch {}
  });
  const store = {
    destination: () => home,
    write:writeDraft,
    restore(project, destination) {
      home=destination;
      writeDraft(project); // Musical Undo and Redo also work in a memory-only session.
      return true;
    }
  };

  function enter(makeBlank) {
    if (adult) return App.P;
    let raw = null;
    try { raw = localStorage.getItem(draftKey); } catch {}
    let draft;
    if (remembered && (volatile || raw === lastDraft)) draft = {project:remembered};
    else {
      if (raw != null) {
        try { draft = readDraft(raw); } catch { failure(); }
      }
      draft ||= {project:makeBlank(),slot:-1};
      home={slot:draft.slot,version:draft.version??null};
      if (draft.version===undefined && validSlot(home.slot)) {
        try { home.version=tag(slotState(home.slot).base)??null; } catch { home.slot=-1; }
      }
      journal = App.makeHistory(store);
      lastDraft = raw; volatile = false;
    }
    adult = {project:App.P,history:App.swapHistory(journal)};
    App.P = draft.project;
    remembered = null;
    App.commit();
    return App.P;
  }
  function leave() {
    if (!adult) return false;
    App.flush();
    remembered = App.P;
    App.swapHistory(adult.history);
    App.P = adult.project;
    adult = null;
    return true;
  }

  function save(index, preview) {
    if (!adult || !validSlot(index)) return false;
    const after = JSON.stringify(App.P);
    let state;
    try { state=slotState(index); } catch { return failure(); }
    if (preview===null && state.value!==null) return failure();
    if (preview && (previews[index]?.info!==preview || previews[index].raw!==state.value)) return failure();
    const oldVersion=tag(state.base)??null;
    if (state.value!==null && index===home.slot && oldVersion!==home.version && !preview) return failure();
    const same=withoutTag(state.value)===after, next=same ? state.base : versioned(after), version=tag(next)??null;
    if (same ? !writeDraft(after,index,version) : !writeShelf(index,state,slotKey(index),next,index,version,after)) return false;
    // An in-place save also updates the destination of other visits to this song.
    if (state.value!==null && home.slot===index && home.version===oldVersion) {
      updateVersion(index,oldVersion,version);
    }
    home.slot=index;home.version=version;
    removals.delete(index);
    return true;
  }
  // A new name for a song on the shelf. Only its saved copy changes; when it is the open song, its name changes too,
  // and its other unsaved edits stay unsaved.
  function rename(index, name, preview) {
    if (!adult || !validSlot(index) || typeof name !== "string" || !name.trim()) return false;
    let state, project;
    try { state=slotState(index); } catch { return failure(); }
    if (state.value===null) return false;
    if (preview && (previews[index]?.info!==preview || previews[index].raw!==state.value)) return failure();
    try { project=soundProject(state.value); } catch { return failure(); }
    project.name=name.trim().toUpperCase().slice(0,28);
    const oldVersion=tag(state.base)??null, next=versioned(JSON.stringify(project)), version=tag(next);
    const open=linkedSlot()===index;
    if (open) App.P.name=project.name;
    if (!writeShelf(index,state,slotKey(index),next,open?index:linkedSlot(),open?version:home.version,JSON.stringify(App.P))) return false;
    updateVersion(index,oldVersion,version);
    if (open) home.version=version;
    removals.delete(index);
    return true;
  }
  function read(index) {
    if (!validSlot(index)) return null;
    try {
      const raw = slotState(index).value;
      return raw == null ? null : soundProject(raw);
    } catch { failure(); return null; }
  }
  function remove(index, preview) {
    if (!adult || !validSlot(index)) return false;
    try {
      const state=slotState(index);
      if (!state.value) return false;
      if (preview && (previews[index]?.info!==preview || previews[index].raw!==state.value)) return failure();
      const active=linkedSlot(), nextSlot=active===index ? -1 : active;
      let before=state.value, version=tag(state.base);
      if (state.key) {
        if (!writeShelf(index,state,state.key,"null",nextSlot,home.version)) return false;
      } else {
        // Prepare the deletion under a fresh version first. A failed write leaves
        // the plain legacy song visible and its existing draft link valid.
        before=versioned(before);version=tag(before);
        const mask=overrideKey(index,version);
        put(mask,"null");
        if (!writeShelf(index,state,slotKey(index),before,nextSlot,home.version)) {
          put(mask,null);
          return false;
        }
        writtenOverrides.set(index,mask);
        updateVersion(index,null,version);
      }
      removals.delete(index);
      removals.set(index,{version,before});
      return true;
    } catch { return failure(); }
  }
  function lastRemoval() {
    if (!adult) return -1;
    try {
      for (const index of [...removals.keys()].reverse()) {
        const state=slotState(index);
        if (tag(state.base)===removals.get(index).version && state.value===null) return index;
        removals.delete(index);
      }
    } catch { /* The storage may be temporarily unavailable. */ }
    return -1;
  }
  function restoreRemoval(expected) {
    const index=lastRemoval();
    if (index<0 || (expected!==undefined && expected!==index)) return false;
    try {
      const edit=removals.get(index),state=slotState(index);
      if (state.value!==null || tag(state.base)!==edit.version) return failure();
      const slot=home.slot===index && home.version===edit.version ? index : linkedSlot();
      if (!writeShelf(index,state,state.key,edit.before===state.base?null:edit.before,slot,home.version)) return false;
      removals.delete(index);
      return true;
    } catch { return failure(); }
  }
  function replace(project, index, version=null) {
    if (!adult || !project) return false;
    home={slot:index,version};
    App.P = project;
    App.commit(true);
    return true;
  }
  function load(index) {
    if (!validSlot(index)) return false;
    try {
      const state=slotState(index);
      return !!state.value && replace(soundProject(state.value),index,tag(state.base)??null);
    } catch { return failure(); }
  }

  function slots() {
    const library = new Map(App.KidsWorld.groups.flatMap(group=>group.sounds.map(sound=>[sound.sampleId,sound.id])));
    return Array.from({length:size}, (_,i) => {
      try {
        const raw = slotState(i).value;
        if (raw == null) { previews[i] = null; return null; }
        if (raw === previews[i]?.raw) return previews[i].info;
        const P = soundProject(raw), motif = Array(8).fill(0), banks = new Set(), counts = new Map();
        let notes = 0;
        for (const [ti,track] of P.tracks.entries()) {
          const part = App.KidsMusic.tracks.indexOf(ti);
          const hits = new Set();
          for (const [pat,clip] of track.clips.entries()) {
            if (clip.length) banks.add(pat);
            for (const n of clip) {
              hits.add(Math.floor(n.s / 2) % 8);
              if (!n.p || !n.v) continue;
              let sound;
              if (track.kind==="kit") {
                const pad=track.kit.pads[n.n-36];
                if (pad) sound=pad.src ? library.get(pad.id) : 0;
              } else if (track.kind==="smp") {
                if (track.smp.id) sound=library.get(track.smp.id) ?? (part===3 ? 3 : undefined);
              } else if (part>=0 && part<4) sound=part;
              if (sound!==undefined) counts.set(sound,(counts.get(sound)||0)+1);
            }
            notes += clip.length;
          }
          for (const step of hits) motif[step]++;
        }
        // Cover art follows the two most-used recorded sounds or band players.
        // The cover is derived from the notes each time the stored song changes.
        const sounds=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([sound])=>sound);
        const info = {slot:i,name:P.name,notes,patternCount:banks.size,motif,sounds,costumes:App.KidsMusic.costumes(P),revision:++previewRevision};
        previews[i] = {raw,info};
        return info;
      } catch { return null; }
    });
  }
  App.extendProject({storedProjects() {
    const projects = [];
    const draft = localStorage.getItem(draftKey);
    if (draft !== null) projects.push(readDraft(draft).project);
    const activeOverrides=new Set();
    for (let i=0;i<size;i++) {
      const {base,key,value}=slotState(i);
      // After a reload the session deletion history is gone. Reclaim a deleted record and
      // its recording during the existing exclusive, cross-tab cleanup.
      if (base!==null && value===null && removals.get(i)?.version!==tag(base)) {
        put(slotKey(i),null);
        continue;
      }
      if (key) activeOverrides.add(key);
      if (base!==null) projects.push(soundProject(base));
      if (value!==null && value!==base) projects.push(soundProject(value));
    }
    // This sweep runs with the tab lock held exclusively. Discard a late Undo
    // that arrived after its slot was overwritten and can no longer be read.
    for (let i=localStorage.length-1;i>=0;i--) {
      const key=localStorage.key(i);
      if (key?.startsWith(overridePrefix) && !activeOverrides.has(key))localStorage.removeItem(key);
    }
    if (adult) projects.push(adult.project);
    if (remembered) projects.push(remembered);
    for (const records of [adult?.history.st, journal?.st]) {
      for (const entry of records || []) projects.push(JSON.parse(entry.data));
    }
    for (const edit of removals.values()) projects.push(soundProject(edit.before));
    // Throwing on malformed or unreadable storage aborts this sweep before it
    // deletes anything. A later launch can retry once all roots are readable.
    return projects;
  }});
  App.KidsStore = {
    enter,leave,read,save,remove,restoreRemoval,slots,load,rename,
    get active() { return !!adult; },
    get slot() { return linkedSlot(); },
    get durable() { return !volatile; },
    fresh:makeBlank => adult ? replace(makeBlank(),-1) : false,
    undo:() => !!adult && App.undo(),
    canUndo:() => !!adult && App.canUndo(),
    redo:() => !!adult && App.redo(),
    canRedo:() => !!adult && App.canRedo(),
    get lastRemoval() { return lastRemoval(); },
    preferred() {
      try { return localStorage.getItem(modeKey) === "kids"; } catch { return false; }
    },
    prefer(on) {
      try { put(modeKey,on ? "kids" : null); return true; } catch { return failure(); }
    }
  };
})();
