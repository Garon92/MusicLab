(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const paths = {
    folder: '<path d="M3 7V5h6l2 3h10v12H3z"/>',
    chev: '<path d="m6 10 6 6 6-6"/>',
    play: '<path d="m6 4 14 8-14 8z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="1.4" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5v14m10-14v14" stroke-width="4"/>',
    pen: '<path d="m4 16 12-12 4 4L8 20l-5 1z"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    sequence: '<path d="M3 5h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4zM3 14h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4z"/>',
    arrange: '<path d="M4 3v18m0-16h10v3H4m4 3h12v3H8zm-4 6h11v3H4"/>',
    harm: '<path d="M3 16a3 3 0 1 0 3 3V5l13-2v13a3 3 0 1 1-3-3"/>',
    synth: '<path d="M2 13h4l3-9 5 17 3-10h5"/>',
    sample: '<path d="M3 10v4m3-7v10m3-13v16m3-11v6m3-8v10m3-13v16m3-10v4"/>',
    mix: '<path d="M5 3v6m0 5v7m7-18v10m0 5v3m7-18v3m0 5v10"/><rect x="2.5" y="9" width="5" height="4" rx="1"/><rect x="9.5" y="13" width="5" height="4" rx="1"/><rect x="16.5" y="6" width="5" height="4" rx="1"/>',
    nodes:
      '<path d="m5 7 14 10M5 17 19 7"/><circle cx="5" cy="7" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="19" cy="17" r="2"/>',
    scope: '<rect x="2" y="4" width="20" height="15" rx="2"/><path d="M4 12h3l3-5 4 9 3-5h3"/>',
    io: '<path d="M8 3v5m8-5v5M5 8h14v3a7 7 0 0 1-14 0zM12 18v4"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 7-7"/>',
    undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
    shuffle:
      '<path d="M3 6h3c5 0 6 12 11 12h4m-4-4 4 4-4 4M3 18h3c2 0 3-2 5-5m2-4c2-3 3-3 5-3h3m-4-4 4 4-4 4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15m-8 3v8m4-8v8"/>',
    keys: '<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M7 5v8m4-8v14m5-14v8"/>',
    fx: '<path d="m4 18 6-13h5m-8 8h6m1 0 6 8m0-8-6 8"/>',
    tools: '<path d="m3 16 13-13 6 6L9 22zm10-9 3 3M9 11l3 3m-7 1 3 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    al: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  };
  function icon(name) {
    return (
      '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.grid) + "</svg>"
    );
  }
  function replaceIcons(parent = document) {
    parent.querySelectorAll("i[data-i]").forEach((i) => {
      i.outerHTML = icon(i.dataset.i);
    });
  }
  const views = {
    centrala: {
      nav: "Centrála",
      title: "Signálová centrála",
      icon: "grid",
      panels: ["radar", "analysis", "seq", "synth", "mix", "arr"],
    },
    sekvencer: {
      nav: "Sekvencer",
      title: "Krokový sekvencer",
      icon: "sequence",
      panels: ["seq*", "radar", "arr"],
    },
    aranzer: { nav: "Aranžér", title: "Aranžér", icon: "arrange", panels: ["arr", "radar", "seq*"] },
    algoritmy: {
      nav: "Algoritmy",
      title: "Algoritmická laboratoř",
      icon: "nodes",
      panels: ["gen", "mod", "seq*"],
    },
    harmonie: {
      nav: "Harmonie",
      title: "Harmonická laboratoř",
      icon: "harm",
      panels: ["harmony*", "keys", "synth"],
    },
    synteza: {
      nav: "Syntezátor",
      title: "Zvuková syntéza",
      icon: "synth",
      panels: ["synth", "analysis", "keys", "mod"],
    },
    sampler: {
      nav: "Sampler",
      title: "Vzorkovací stanice",
      icon: "sample",
      panels: ["sample*", "mix", "analysis"],
    },
    mix: { nav: "Mixáž a FX", title: "Mixáž a efekty", icon: "mix", panels: ["mix", "fx", "analysis*"] },
    analyza: {
      nav: "Analýza",
      title: "Analýza signálu",
      icon: "scope",
      panels: ["analysis*", "tools", "io"],
    },
    midi: { nav: "MIDI a vstupy", title: "MIDI a vstupy", icon: "io", panels: ["io", "tools", "keys*"] },
  };
  const storageKey = "musiclab.workstation.v2";
  const panels = {};
  let projectName = "Noční signál",
    tempo = 112,
    swing = 0,
    mode = "pattern",
    bank = 0,
    track = "drums",
    activeView;
  let initialized = false,
    loading = false,
    engineReady = false,
    saveTimer,
    noticeTimer,
    previousFocus;
  let playing = false,
    starting = false,
    token = 0,
    playInterval,
    frame = 0,
    scheduled = [],
    nextTime = 0,
    nextStep = 0,
    bar = 0,
    section = 0,
    repeat = 0;
  let pausedPosition = null,
    recording = false,
    recordBusy = false,
    finishAfterStart = false,
    recStarted = 0;
  let displayedBank = 0,
    renderedSection = -1,
    restoreVersion = 0;
  let cachedPatterns, arrangement;
  const drumNotes = [36, 38, 42, 39];

  function modulePanel(key, title, glyph, options = "") {
    const el = document.createElement("section");
    el.className = "panel unit";
    el.id = "unit-" + key;
    el.innerHTML =
      '<header class="unit-head">' +
      icon(glyph) +
      "<h2>" +
      title +
      "</h2>" +
      options +
      '</header><div class="unit-body"></div>';
    $("#parking").append(el);
    panels[key] = el;
    return el.lastElementChild;
  }
  function uiButton(name, id, label) {
    return (
      '<button class="icon-btn" id="' +
      id +
      '" type="button" title="' +
      label +
      '" aria-label="' +
      label +
      '">' +
      icon(name) +
      "</button>"
    );
  }
  function nav() {
    const nodes = Object.entries(views).map(
      ([id, view], i) =>
        (i === 0
          ? '<div class="nav-group">Řízení</div>'
          : i === 3
            ? '<div class="nav-group">Nástroje</div>'
            : i === 8
              ? '<div class="nav-group">Systém</div>'
              : "") +
        '<a class="nav-link" href="#' +
        id +
        '" title="' +
        view.nav +
        '" aria-label="' +
        view.nav +
        '">' +
        icon(view.icon) +
        "<span>" +
        view.nav +
        "</span></a>",
    );
    $("#navigation").innerHTML = nodes.join("");
  }
  function route(scroll = true) {
    const aliases = { rytmus: "sekvencer", melodie: "sekvencer", zvuk: "synteza" };
    const id = location.hash.slice(1).split("/")[0];
    activeView = Object.hasOwn(views, id) ? id : Object.hasOwn(aliases, id) ? aliases[id] : "centrala";
    const view = views[activeView];
    LiveKeys.releaseAll();
    for (const el of Object.values(panels)) $("#parking").append(el);
    for (const key of view.panels) {
      const wide = key.endsWith("*"),
        el = panels[key.replace("*", "")];
      el.classList.toggle("wide", wide);
      $("#rack").append(el);
    }
    $("#view-name").textContent = view.title;
    document.title = view.title + " · MusicLab";
    for (const a of $("#navigation").querySelectorAll("a")) {
      if (a.hash === "#" + activeView) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    Signal.refresh();
    Radar.draw();
    Generator.refresh();
    Arranger.refresh();
    if (scroll) {
      $("#main").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function notify(text) {
    clearTimeout(noticeTimer);
    $("#notice").textContent = text;
    if (text)
      noticeTimer = setTimeout(() => {
        $("#notice").textContent = "";
      }, 4400);
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/[\\/:*?"<>|]/g, "-");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function unlock() {
    await Engine.start();
    engineReady = true;
  }
  async function preview(fn) {
    const ticket = token;
    try {
      await unlock();
      if (ticket === token) await fn();
    } catch {
      notify("Zvukový výstup se nepodařilo spustit.");
    }
  }
  const routed = Object.create(Engine);
  routed.note = (name, midi, time, duration = 0.3, velocity = 1) => {
    Engine.note(name, midi, time, duration, velocity);
    Devices.send(name, midi, time, duration, velocity);
  };
  routed.drum = (index, time, velocity = 1) => {
    Engine.drum(index, time, velocity);
    Devices.send("drums", drumNotes[index], time, 0.09, velocity);
  };

  function snapshot(includeAudio = false) {
    return {
      format: "MusicLab",
      version: 2,
      name: projectName,
      tempo,
      swing,
      mode,
      bank,
      track,
      patterns: Patterns.getData(),
      arrangement: Arranger.getData(),
      harmony: Harmony.getData(),
      synth: Signal.getSynth(),
      mixer: Mixer.getData(),
      performance: LiveKeys.getData(),
      sampler: Sampler.getData(includeAudio),
      generator: Generator.getData(),
      modulation: Modulation.getData(),
    };
  }
  function saveNow() {
    if (!initialized || loading) return;
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
      $("#saved").textContent = "Uloženo lokálně";
    } catch {
      $("#saved").textContent = "Uložení nedostupné";
      notify("Projekt nelze místně uložit. Kopii můžeš stáhnout v nabídce Projekt.");
    }
  }
  function changed() {
    if (!initialized || loading) return;
    $("#saved").textContent = "Ukládání…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 180);
  }
  function patternChanged() {
    cachedPatterns = Patterns.getData();
    Radar.update(cachedPatterns, displayedBank);
    Generator.refresh();
    $("#pat-undo").disabled = !Patterns.canUndo();
    changed();
  }
  function clampNumber(n, lo, hi) {
    return Number.isFinite(n) && n >= lo && n <= hi;
  }
  function validateProject(p) {
    if (
      !p ||
      p.format !== "MusicLab" ||
      p.version !== 2 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 64 ||
      !Number.isInteger(p.tempo) ||
      !clampNumber(p.tempo, 35, 270) ||
      !Number.isInteger(p.swing) ||
      !clampNumber(p.swing, 0, 70) ||
      !["song", "pattern"].includes(p.mode) ||
      !Number.isInteger(p.bank) ||
      p.bank < 0 ||
      p.bank > 3 ||
      !["drums", "bass", "lead"].includes(p.track)
    )
      return false;
    const s = p.synth;
    if (
      (p.generator && !Generator.validate(p.generator)) ||
      (p.modulation && !Modulation.validate(p.modulation))
    )
      return false;
    return (
      Patterns.validate(p.patterns) &&
      Arranger.validate(p.arrangement) &&
      Harmony.validate(p.harmony) &&
      Mixer.validate(p.mixer) &&
      LiveKeys.validate(p.performance) &&
      Sampler.validate(p.sampler) &&
      !!s &&
      ["sine", "triangle", "sawtooth", "square"].includes(s.wave) &&
      clampNumber(s.cutoff, 30, 18000) &&
      clampNumber(s.resonance, 0.2, 24) &&
      clampNumber(s.attack, 0.001, 2) &&
      clampNumber(s.release, 0.005, 5)
    );
  }
  async function applyProject(p) {
    if (!validateProject(p)) throw Error("Soubor nemá podporovaný formát projektu MusicLab.");
    if (recording || recordBusy) throw Error("Před načtením projektu dokonči záznam WAV.");
    const revision = ++restoreVersion;
    stop();
    loading = true;
    $("#main").inert = true;
    try {
      await Sampler.loadData(p.sampler);
      if (revision !== restoreVersion) return;
      projectName = p.name.trim();
      tempo = p.tempo;
      swing = p.swing;
      mode = p.mode;
      bank = p.bank;
      track = p.track;
      Patterns.loadData(p.patterns);
      Patterns.setTrack(track);
      Arranger.loadData(p.arrangement);
      Harmony.loadData(p.harmony);
      Signal.setSynth(p.synth);
      Mixer.loadData(p.mixer);
      LiveKeys.loadData(p.performance);
      Generator.loadData(p.generator ?? Generator.defaults());
      Modulation.loadData(p.modulation ?? Modulation.defaults());
      arrangement = Arranger.getData();
      cachedPatterns = Patterns.getData();
      showBank(bank);
      syncSettings();
    } finally {
      if (revision === restoreVersion) {
        loading = false;
        $("#main").inert = false;
      }
    }
  }
  function migrateLegacy() {
    function old(key) {
      try {
        return JSON.parse(localStorage.getItem("musiclab." + key));
      } catch {
        return null;
      }
    }
    const oldR = old("sequence.v1.rhythm"),
      oldM = old("sequence.v1.melody"),
      oldS = old("sound.v1");
    const rowsOK = (rows, n) =>
      Array.isArray(rows) &&
      rows.length === n &&
      rows.every(
        (row) => Array.isArray(row) && row.length === 8 && row.every((x) => typeof x === "boolean"),
      );
    const data = Patterns.getData(),
      a = data.banks[0];
    const silence = "0".repeat(16);
    const extend = (row) => row.map((v) => (v ? "10" : "00")).join("");
    if (rowsOK(oldR, 4)) a.drums = oldR.map(extend);
    if (rowsOK(oldM, 5)) {
      a.lead = Array(8).fill(silence);
      [2, 3, 5, 6, 7].forEach((row, i) => {
        a.lead[row] = extend(oldM[i]);
      });
    }
    if (rowsOK(oldM, 5) || rowsOK(oldR, 4)) a.bass = Array(8).fill(silence);
    Patterns.loadData(data);
    if (old("muted") === true) Mixer.loadData({ ...Mixer.getData(), masterMute: true });
    if (clampNumber(old("tempo"), 35, 270)) tempo = old("tempo");
    if ([3, 4, 5].includes(oldS?.octave)) LiveKeys.loadData({ ...LiveKeys.getData(), octave: oldS.octave });
    if (["sine", "square", "triangle", "sawtooth"].includes(oldS?.wave))
      Signal.setSynth({ ...Signal.getSynth(), wave: oldS.wave });
  }

  function showBank(i) {
    displayedBank = i;
    Patterns.setBank(i);
    Radar.update(cachedPatterns, i);
    Generator.refresh();
    $("#bank-state").textContent = "PATTERN " + "ABCD"[i];
    $("#pat-undo").disabled = !Patterns.canUndo();
  }
  function chooseBank(i) {
    if (mode === "song") {
      mode = "pattern";
      $("#mode").value = mode;
      pausedPosition = null;
    }
    bank = i;
    showBank(i);
    changed();
  }
  function setPosition(b = 0, s = 0) {
    $("#position").textContent =
      String(b + 1).padStart(3, "0") +
      ":" +
      String(1 + Math.floor(s / 4)).padStart(2, "0") +
      ":" +
      String(1 + (s % 4)).padStart(2, "0");
  }
  function syncSettings() {
    $("#tempo").value = tempo;
    $("#swing").value = swing;
    $("#mode").value = mode;
    $("#project-name").textContent = projectName;
    Arranger.refresh();
    Mixer.tempoChanged();
    calcDelays();
    syncTransport();
  }
  function syncTransport() {
    const active = playing || starting;
    $("#play").innerHTML =
      icon(active ? "pause" : "play") + "<span>" + (active ? "Pauza" : "Spustit") + "</span>";
    $("#play").setAttribute("aria-label", active ? "Pozastavit" : "Spustit přehrávání");
    $("#run-state").innerHTML =
      "<b></b> " + (recording ? "RECORDING" : playing ? "RUNNING" : pausedPosition ? "PAUZA" : "STANDBY");
    $("#run-state").classList.toggle("active", playing || recording);
    $("#rec").setAttribute("aria-pressed", String(recording));
    $("#rec").disabled = recordBusy;
    $("#rec").setAttribute("aria-label", recording ? "Dokončit a stáhnout WAV" : "Spustit záznam WAV");
    $("#rec").title = recording ? "Dokončit a stáhnout WAV" : "Nahrávat hlavní výstup do WAV";
  }
  function resumePoint() {
    return (
      scheduled.find((item) => item.time >= Engine.now())?.cursor ?? { nextStep, bar, section, repeat }
    );
  }
  function stop(pause = false) {
    if (pause && playing) pausedPosition = resumePoint();
    else if (!pause) pausedPosition = null;
    ++token;
    starting = false;
    playing = false;
    clearInterval(playInterval);
    scheduled = [];
    Engine.silence();
    Modulation.resetPlayback();
    Devices.panic();
    LiveKeys.releaseAll();
    Patterns.highlight(-1);
    Harmony.resetPlayback();
    Sampler.resetPlayback();
    Radar.highlight(-1);
    if (!pause) {
      Arranger.highlight(-1);
      renderedSection = -1;
    }
    if (!pause) {
      nextStep = bar = section = repeat = 0;
      setPosition();
      if (cachedPatterns) showBank(bank);
    }
    syncTransport();
  }
  function schedule() {
    const now = Engine.now();
    while (scheduled.length > 1 && scheduled[1].time <= now) scheduled.shift();
    if (nextTime < now - 0.08) nextTime = now + 0.01;
    while (nextTime < now + 0.085) {
      const arrangementIndex = mode === "song" ? Math.min(section, arrangement.length - 1) : -1;
      const currentBank = arrangementIndex >= 0 ? arrangement[arrangementIndex].bank : bank;
      if (Patterns.getBank() !== currentBank) Patterns.setBank(currentBank);
      const duration = (15 / tempo) * (1 + ((nextStep % 2 ? -1 : 1) * swing) / 200);
      const cursor = { nextStep, bar, section, repeat };
      Modulation.tick(nextStep, nextTime, duration, bar * 16 + nextStep);
      Patterns.tick(nextStep, nextTime, duration);
      Harmony.tick(nextStep, nextTime, duration, bar);
      Sampler.tick(nextStep, nextTime, duration);
      scheduled.push({
        step: nextStep,
        time: nextTime,
        bar,
        bank: currentBank,
        section: arrangementIndex,
        cursor,
      });
      nextTime += duration;
      nextStep++;
      if (nextStep === 16) {
        nextStep = 0;
        bar++;
        if (mode === "song" && ++repeat >= arrangement[section].repeats) {
          repeat = 0;
          section = (section + 1) % arrangement.length;
        }
      }
    }
  }
  async function play(from = null) {
    if (starting || playing) {
      if (from === null) {
        stop(true);
        return;
      }
      stop();
    }
    const state = from ?? pausedPosition ?? { nextStep: 0, bar: 0, section: 0, repeat: 0 };
    const run = ++token;
    starting = true;
    syncTransport();
    try {
      await unlock();
      if (run !== token) return;
      ({ nextStep, bar, section, repeat } = state);
      section = Math.min(section, arrangement.length - 1);
      pausedPosition = null;
      nextTime = Engine.now() + 0.035;
      playing = true;
      starting = false;
      syncTransport();
      schedule();
      playInterval = setInterval(schedule, 25);
    } catch {
      if (run === token) {
        stop();
        notify("Zvukový výstup se nepodařilo spustit.");
      }
    }
  }
  function visualFrame(ts) {
    if (playing) {
      const now = Engine.now();
      while (scheduled.length && scheduled[0].time <= now) {
        const s = scheduled.shift();
        setPosition(s.bar, s.step);
        if (s.bank !== displayedBank) {
          displayedBank = s.bank;
          Radar.update(cachedPatterns, s.bank);
          $("#bank-state").textContent = "PATTERN " + "ABCD"[s.bank];
          Generator.refresh();
          $("#pat-undo").disabled = !Patterns.canUndo();
        }
        if (s.section >= 0 || renderedSection !== s.section) {
          renderedSection = s.section;
          Arranger.highlight(s.section, s.cursor.repeat, s.step);
        }
        Patterns.highlight(s.step);
        Harmony.highlight(s.step);
        Sampler.highlight?.(s.step);
        Radar.highlight(s.step);
      }
    }
    if (ts - frame > 65) {
      frame = ts;
      if (engineReady) {
        const levels = Engine.meters();
        Mixer.refreshMeters(levels);
        const peak = levels.master;
        const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
        $("#out-db").textContent = db > -68 ? Math.round(db) + " dB" : "−∞ dB";
        [...$("#side-meter").children].forEach((el, i) => el.classList.toggle("on", db > -60 + i * 3));
        $(".status-led").classList.add("live");
        $("#engine-state").textContent = (Engine.sampleRate() / 1000).toLocaleString("cs-CZ") + " kHz";
      }
      if (recording) {
        const sec = Math.floor((performance.now() - recStarted) / 1000);
        $("#rec span").textContent =
          String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
      }
    }
    requestAnimationFrame(visualFrame);
  }
  async function record() {
    if (recordBusy) return;
    recordBusy = true;
    syncTransport();
    try {
      if (recording) {
        const blob = await Engine.recordStop();
        Capture.setTake(blob);
        recording = false;
        $("#rec span").textContent = "REC";
        download(
          blob,
          projectName + "-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".wav",
        );
        notify("Stereo záznam WAV je připravený ke stažení.");
      } else {
        await unlock();
        await Engine.recordStart();
        recording = true;
        recStarted = performance.now();
      }
    } catch (e) {
      notify(e.message || "Záznam se nepodařil.");
    } finally {
      recordBusy = false;
      syncTransport();
      if (finishAfterStart) {
        finishAfterStart = false;
        if (recording) await record();
      }
    }
  }
  function playFrom(index) {
    stop();
    mode = "song";
    $("#mode").value = mode;
    changed();
    const startBar = arrangement.slice(0, index).reduce((n, item) => n + item.repeats, 0);
    play({ nextStep: 0, bar: startBar, section: index, repeat: 0 });
  }
  let taps = [];
  function tap() {
    const now = performance.now();
    if (!taps.length || now - taps.at(-1) > 1800) taps = [];
    taps.push(now);
    if (taps.length > 7) taps.shift();
    if (taps.length > 1) {
      const n = Math.round((60000 * (taps.length - 1)) / (now - taps[0]));
      if (clampNumber(n, 35, 270)) {
        tempo = n;
        syncSettings();
        changed();
      }
    }
  }
  function calcDelays() {
    if (!$("#delay-times")) return;
    $("#delay-times").innerHTML = [
      ["1/4", 1],
      ["1/8", 0.5],
      ["1/16", 0.25],
      ["1/8 ·", 0.75],
      ["1/8 T", 1 / 3],
      ["1/16 T", 1 / 6],
    ]
      .map(
        ([name, ratio]) => "<div>" + name + "<b>" + Math.round((60000 / tempo) * ratio) + " ms</b></div>",
      )
      .join("");
  }
  function toolsPanel(host) {
    host.innerHTML =
      '<div class="tools-grid"><section><h3>Referenční oscilátor</h3><label>Frekvence <input id="ref-hz" type="number" value="440" min="20" max="16000" step="0.1"> Hz</label><div class="inline"><button id="ref-play" class="btn">' +
      icon("play") +
      ' Kalibrační tón</button><output id="ref-note">A4 · 0 ct</output></div></section><section><h3>Časy delaye</h3><div id="delay-times" class="calc-list"></div></section></div>';
    const field = $("#ref-hz"),
      names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "B♭", "H"];
    field.oninput = () => {
      const hz = field.valueAsNumber,
        m = 69 + 12 * Math.log2(hz / 440),
        n = Math.round(m);
      $("#ref-note").textContent = clampNumber(hz, 20, 16000)
        ? names[(n + 120) % 12] + (Math.floor(n / 12) - 1) + " · " + Math.round((m - n) * 100) + " ct"
        : "—";
    };
    $("#ref-play").onclick = () => {
      if (!field.reportValidity() || !field.value) return;
      preview(() => Engine.referenceTone(field.valueAsNumber));
    };
    calcDelays();
  }
  function setupPanels() {
    const shared = {
      engine: routed,
      unlock,
      preview,
      notify,
      changed,
      getTempo: () => tempo,
      getPlaying: () => playing,
    };
    const radar = modulePanel(
      "radar",
      "Rytmický radar",
      "radar",
      '<span class="panel-code">POLÁRNÍ MAPA</span>',
    );
    Radar.mount(radar, chooseBank);
    const seq = modulePanel(
      "seq",
      "Krokový sekvencer",
      "sequence",
      '<div class="head-actions"><span class="panel-code" id="bank-state">PATTERN A</span>' +
        uiButton("undo", "pat-undo", "Vrátit úpravu stopy") +
        uiButton("shuffle", "pat-random", "Vygenerovat variaci stopy") +
        uiButton("trash", "pat-clear", "Vymazat vybranou stopu") +
        "</div>",
    );
    Patterns.mount(seq, {
      ...shared,
      Engine: routed,
      changed: patternChanged,
      trackChanged: (value) => {
        track = value;
        $("#pat-undo").disabled = !Patterns.canUndo();
        changed();
      },
      previewDrum: (i) => preview(() => routed.drum(i)),
      previewNote: (t, n) => preview(() => routed.note(t, n)),
    });
    $("#pat-undo").onclick = () => Patterns.undo();
    $("#pat-random").onclick = () => Patterns.randomize();
    $("#pat-clear").onclick = () => Patterns.clear();
    const sh = document.createElement("div");
    $("#parking").append(sh);
    Signal.mount(sh, { engine: Engine, changed });
    panels.analysis = sh.querySelector(".sg-analyzer");
    panels.synth = sh.querySelector(".sg-synthesizer");
    const arr = modulePanel("arr", "Aranžér", "arrange");
    Arranger.mount(arr, {
      ...shared,
      playFrom,
      changed: () => {
        arrangement = Arranger.getData();
        if (mode === "song") {
          stop();
        }
        changed();
      },
    });
    Harmony.mount(modulePanel("harmony", "Harmonie a progrese", "harm"), shared);
    const sampleHost = modulePanel("sample", "Sampler a řezy", "sample");
    Sampler.mount(sampleHost, shared);
    const captureHost = document.createElement("div");
    sampleHost.parentElement.append(captureHost);
    Capture.mount(captureHost, { notify, importFile: (file) => Sampler.importFile(file) });
    Mixer.mount(modulePanel("mix", "Mixážní pult", "mix"), modulePanel("fx", "Efektový rack", "fx"), {
      ...shared,
      engine: Engine,
    });
    LiveKeys.mount(modulePanel("keys", "Klaviatura a pady", "keys"), {
      ...shared,
      engine: Engine,
      sendKey: (on, n, v) => Devices.liveKey(on, n, v),
      sendDrum: (i, v) => Devices.send("drums", drumNotes[i], undefined, 0.08, v),
    });
    Devices.mount(modulePanel("io", "Směrování vstupů a výstupů", "io"), {
      ...shared,
      engine: Engine,
      download,
      snapshot,
      confirmImport: async () => confirm("Nahradit čtyři banky patternů notami ze souboru MIDI?"),
      importPatterns: (data, bpm) => {
        stop();
        Patterns.loadData(data);
        if (bpm) tempo = Math.max(35, Math.min(270, bpm));
        patternChanged();
        syncSettings();
        notify("MIDI bylo načteno do bank A–D.");
      },
    });
    Generator.mount(modulePanel("gen", "Generátor pulsů", "radar"), {
      ...shared,
      getBank: () => Patterns.getBank(),
    });
    Modulation.mount(modulePanel("mod", "Modulační matice", "nodes"), {
      ...shared,
      engine: Engine,
      getSynth: () => Signal.getSynth(),
      getMix: () => Mixer.getData(),
    });
    toolsPanel(modulePanel("tools", "Kalibrace a časování", "tools"));
    cachedPatterns = Patterns.getData();
    arrangement = Arranger.getData();
    showBank(bank);
  }
  function menu(open) {
    $("#project-actions").hidden = !open;
    $("#project-menu").setAttribute("aria-expanded", String(open));
  }
  function rename() {
    previousFocus = document.activeElement;
    $("#name-field").value = projectName;
    $("#name-dialog").showModal();
    $("#name-field").select();
  }
  function setupEvents() {
    $("#play").onclick = () => play();
    $("#stop").onclick = () => {
      stop();
      if (recording && !recordBusy) record();
      else if (recordBusy && !recording) finishAfterStart = true;
    };
    $("#rec").onclick = record;
    $("#tap").onclick = tap;
    for (const [id, min, max] of [
      ["tempo", 35, 270],
      ["swing", 0, 70],
    ])
      $("#" + id).addEventListener("change", (event) => {
        const value = event.target.valueAsNumber;
        if (Number.isInteger(value) && clampNumber(value, min, max)) {
          if (id === "tempo") tempo = value;
          else swing = value;
          changed();
        }
        syncSettings();
      });
    $("#mode").onchange = (e) => {
      const newMode = e.target.value;
      stop();
      mode = newMode;
      if (mode === "song") showBank(arrangement[0].bank);
      changed();
    };
    $("#project-menu").onclick = () => menu($("#project-actions").hidden);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".project-wrap")) menu(false);
    });
    $("#project-actions").onclick = (e) => {
      const op = e.target.closest("[data-action]")?.dataset.action;
      if (!op) return;
      menu(false);
      if (op === "rename") rename();
      if (op === "export") {
        try {
          download(
            new Blob([JSON.stringify(snapshot(true))], { type: "application/json" }),
            projectName + ".musiclab.json",
          );
        } catch {
          notify("Projekt se nepodařilo exportovat.");
        }
      }
      if (op === "import") $("#project-file").click();
    };
    $("#project-name").onclick = rename;
    $("#name-dialog").onclose = () => {
      if ($("#name-dialog").returnValue === "ok") {
        projectName = $("#name-field").value.trim() || projectName;
        $("#project-name").textContent = projectName;
        changed();
      }
      previousFocus?.focus?.();
    };
    $("#project-file").onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const incoming = JSON.parse(await file.text());
        if (!validateProject(incoming)) throw Error("Neplatný projekt MusicLab.");
        if (!confirm("Načíst projekt „" + incoming.name + "“ a nahradit aktuální pracovní plochu?")) return;
        await applyProject(incoming);
        saveNow();
        notify("Projekt byl načten.");
      } catch (err) {
        notify(err instanceof SyntaxError ? "Soubor neobsahuje platný JSON." : err.message);
      }
    };
    if (!document.fullscreenEnabled) $("#fullscreen").hidden = true;
    $("#fullscreen").onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        notify("Celá obrazovka není k dispozici.");
      }
    };
    $(".skip").onclick = (e) => {
      e.preventDefault();
      $("#main").focus();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        menu(false);
        return;
      }
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.repeat ||
        e.target.closest("input,select,textarea,button,a,dialog,[contenteditable]") ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        play();
      }
    });
    window.addEventListener("hashchange", () => route());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        LiveKeys.releaseAll();
        saveNow();
      }
    });
    window.addEventListener("pagehide", () => {
      saveNow();
      stop();
      Devices.stopMic();
      Capture.stop();
    });
    window.addEventListener("beforeunload", (e) => {
      if (recording) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }
  async function boot() {
    replaceIcons();
    nav();
    setupPanels();
    setupEvents();
    $("#side-meter").innerHTML = "<i></i>".repeat(20);
    let restored = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        await applyProject(JSON.parse(raw));
        restored = true;
      }
    } catch {
      notify("Místní projekt se nepodařilo obnovit.");
    }
    if (!restored) {
      migrateLegacy();
      cachedPatterns = Patterns.getData();
      showBank(bank);
    }
    syncSettings();
    route(false);
    initialized = true;
    requestAnimationFrame(visualFrame);
  }
  boot().catch((error) => {
    console.error(error);
    notify("Stanici se nepodařilo inicializovat.");
  });
})();
