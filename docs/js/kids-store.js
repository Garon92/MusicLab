/* Independent songbook and draft. Audio lives in the project's usual sample store. */
(() => {
  "use strict";
  const prefix = "musiclab.kids.v1.", draftKey = prefix + "draft", modeKey = prefix + "mode";
  const size = 8, slotKey = index => prefix + "slot." + index;
  const validSlot = n => Number.isInteger(n) && n >= 0 && n < size;
  let adult = null, journal = null, remembered = null, slot = -1;
  let lastDraft = null, volatile = false;
  const previews = Array(size).fill(null);

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

  // Fail a stale undo cleanly if somebody else has since replaced that shelf
  // space. On a full store, restore the smaller previous record before returning.
  function changeShelf(edit, forward, project, index) {
    const key = slotKey(edit.slot), from = forward ? edit.before : edit.after, to = forward ? edit.after : edit.before;
    try {
      if (localStorage.getItem(key) !== from) return failure();
      put(key,to);
      if (writeDraft(project,index)) return true;
      if (localStorage.getItem(key) === to) put(key,from);
    } catch { failure(); }
    return false;
  }
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

  function save(index) {
    if (!adult || !validSlot(index)) return false;
    const after = JSON.stringify(App.P);
    let before;
    try { before = localStorage.getItem(slotKey(index)); } catch { return failure(); }
    const edit = before === after ? null : {slot:index,before,after};
    if (edit ? !changeShelf(edit,true,after,index) : !writeDraft(after,index)) return false;
    slot = index;
    App.commit(false,edit);
    return true;
  }
  function read(index) {
    if (!validSlot(index)) return null;
    try {
      const raw = localStorage.getItem(slotKey(index));
      return raw == null ? null : soundProject(raw);
    } catch { failure(); return null; }
  }
  function replace(project, index) {
    if (!adult || !project) return false;
    slot = index;
    App.P = project;
    App.commit(true);
    return true;
  }

  function slots() {
    return Array.from({length:size}, (_,i) => {
      try {
        const raw = localStorage.getItem(slotKey(i));
        if (raw == null) { previews[i] = null; return null; }
        if (raw === previews[i]?.raw) return previews[i].info;
        const P = soundProject(raw), motif = Array(8).fill(0), banks = new Set();
        let notes = 0;
        for (const track of P.tracks) {
          const hits = new Set();
          for (const [pat,clip] of track.clips.entries()) {
            if (clip.length) banks.add(pat);
            for (const n of clip) hits.add(Math.floor(n.s / 2) % 8);
            notes += clip.length;
          }
          for (const step of hits) motif[step]++;
        }
        const info = {slot:i,name:P.name,notes,patternCount:banks.size,motif};
        previews[i] = {raw,info};
        return info;
      } catch { return null; }
    });
  }
  App.extendProject({storedProjects() {
    const projects = [];
    const draft = localStorage.getItem(draftKey);
    if (draft !== null) projects.push(readDraft(draft).project);
    for (let i = 0; i < size; i++) {
      const song = localStorage.getItem(slotKey(i));
      if (song !== null) projects.push(soundProject(song));
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
    enter,leave,read,save,slots,
    get active() { return !!adult; },
    get slot() { return slot; },
    get durable() { return !volatile; },
    load:index => replace(read(index),index),
    fresh:makeBlank => adult ? replace(makeBlank(),-1) : false,
    undo:() => !!adult && App.undo(),
    canUndo:() => !!adult && App.canUndo(),
    preferred() {
      try { return localStorage.getItem(modeKey) === "kids"; } catch { return false; }
    },
    prefer(on) {
      try { put(modeKey,on ? "kids" : null); return true; } catch { return failure(); }
    }
  };
})();
