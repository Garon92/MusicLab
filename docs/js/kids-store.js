/* Independent songbook and draft. Audio lives in the project's usual sample store. */
(() => {
  "use strict";
  const prefix = "musiclab.kids.v1.", draftKey = prefix + "draft", modeKey = prefix + "mode";
  const size = 8, slotKey = index => prefix + "slot." + index;
  const validSlot = n => Number.isInteger(n) && n >= 0 && n < size;
  let adult = null, journal = null, remembered = null, slot = -1;
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
    return {project, slot:validSlot(data.slot) ? data.slot : -1};
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
  const draftText = (project, index) => '{"slot":' + index + ',"project":' + project + '}';
  function writeDraft(project, index = slot) {
    const next = draftText(project,index);
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

  // A saved version is still a regular project for older readers. Undo writes
  // only to that version's own key. In particular, an old WebKit tab whose
  // localStorage snapshot is one notification behind cannot erase a newer save.
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
  function changeShelf(edit, forward, project, index, saving=false) {
    const from=forward ? edit.before : edit.after, to=forward ? edit.after : edit.before;
    try {
      const state=slotState(edit.slot);
      if (state.value!==from || (!saving && !state.key)) return failure();
      // Undoing a newer save can expose this tab's earlier deletion again.
      // A different tab's replacement has its own key and cannot be restored over.
      if (edit.version && tag(state.base)!==edit.version && writtenOverrides.get(edit.slot)!==state.key) return failure();
      const key=saving ? slotKey(edit.slot) : state.key;
      const value=saving ? to : to===state.base ? null : to??"null";
      const previousDraft=localStorage.getItem(draftKey), previousLocal=lastDraft, previousVolatile=volatile;
      // A quota failure writing the draft must leave the shelf untouched. If
      // the shelf itself is full, put the earlier draft back before returning.
      if (!writeDraft(project,index)) return false;
      try { put(key,value); }
      catch {
        if (localStorage.getItem(draftKey)===lastDraft) put(draftKey,previousDraft);
        lastDraft=previousLocal;volatile=previousVolatile;return failure();
      }
      const keep=!saving && value!==null ? key : null;
      // Keep at most one outstanding override made by this tab per shelf space.
      // A notification also prunes an Undo written during the propagation gap.
      const previous=writtenOverrides.get(edit.slot);
      for (const unused of [previous,saving?state.key:null]) {
        if (unused && unused!==keep) {
          try { localStorage.removeItem(unused); } catch { /* The exclusive sweep can retry. */ }
        }
      }
      if (keep) writtenOverrides.set(edit.slot,keep); else writtenOverrides.delete(edit.slot);
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
    slot: () => slot,
    write:writeDraft,
    restore(project, index, edit, direction) {
      if (edit && !changeShelf(edit,direction > 0,project,index)) return false;
      if (!edit) writeDraft(project,index); // Undo also works in a memory-only session.
      slot = index;
      return true;
    }
  };

  function enter(makeBlank) {
    if (adult) return App.P;
    let raw = null;
    try { raw = localStorage.getItem(draftKey); } catch {}
    let draft;
    if (remembered && (volatile || raw === lastDraft)) draft = {project:remembered,slot};
    else {
      if (raw != null) {
        try { draft = readDraft(raw); } catch { failure(); }
      }
      draft ||= {project:makeBlank(),slot:-1};
      journal = App.makeHistory(store);
      lastDraft = raw; volatile = false;
    }
    adult = {project:App.P,history:App.swapHistory(journal)};
    slot = draft.slot;
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
    let before;
    try { before = slotState(index).value; } catch { return failure(); }
    if (preview && (previews[index]?.info !== preview || previews[index].raw !== before)) return failure();
    const edit = withoutTag(before) === after ? null : {slot:index,before,after:versioned(after)};
    if (edit ? !changeShelf(edit,true,after,index,true) : !writeDraft(after,index)) return false;
    slot = index;
    App.commit(false,edit);
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
    let state;
    try {
      state = slotState(index);
      if (!state.value) return false;
      // Only remove the version the child saw. Another tab can fill this
      // space with an entirely different song while the sheet is open.
      if (preview && (previews[index]?.info !== preview || previews[index].raw !== state.value)) return failure();
      if (!state.key) {
        // Older songbooks stored a plain project. Give it the version marker
        // needed for the same reversible deletion as current saves.
        put(slotKey(index),versioned(state.value));
        state = slotState(index);
      }
    } catch { return failure(); }
    const edit = {slot:index, before:state.value, after:null, version:tag(state.base)};
    const next = slot === index ? -1 : slot;
    if (!changeShelf(edit,true,JSON.stringify(App.P),next)) return false;
    slot = next;
    App.commit(false,edit);
    return true;
  }
  function replace(project, index) {
    if (!adult || !project) return false;
    slot = index;
    App.P = project;
    App.commit(true);
    return true;
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
      // After a reload the session Undo is gone. Reclaim a deleted record and
      // its recording during the existing exclusive, cross-tab cleanup.
      if (base!==null && value===null && !journal?.st.some(entry=>entry.shelfEdit?.slot===i)) {
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
      for (const entry of records || []) {
        projects.push(JSON.parse(entry.data));
        const edit = entry.shelfEdit;
        if (edit?.before) projects.push(soundProject(edit.before));
        if (edit?.after) projects.push(soundProject(edit.after));
      }
    }
    // Throwing on malformed or unreadable storage aborts this sweep before it
    // deletes anything. A later launch can retry once all roots are readable.
    return projects;
  }});
  App.KidsStore = {
    enter,leave,read,save,remove,slots,
    get active() { return !!adult; },
    get slot() { return slot; },
    get durable() { return !volatile; },
    load:index => replace(read(index),index),
    fresh:makeBlank => adult ? replace(makeBlank(),-1) : false,
    undo:() => !!adult && App.undo(),
    canUndo:() => !!adult && App.canUndo(),
    get lastRemoval() {
      const edit = journal?.st[journal.i]?.shelfEdit;
      return adult && edit?.version && edit.after===null ? edit.slot : -1;
    },
    preferred() {
      try { return localStorage.getItem(modeKey) === "kids"; } catch { return false; }
    },
    prefer(on) {
      try { put(modeKey,on ? "kids" : null); return true; } catch { return failure(); }
    }
  };
})();
