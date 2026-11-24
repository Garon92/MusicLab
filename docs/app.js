(() => {
  "use strict";

  const labs = [
    {
      id: "rytmus", mode: "rhythm", name: "Rytmická dílna", icon: "grid",
      blurb: "Naklikej údery čtyř nástrojů a postav si vlastní bicí smyčku.",
      intro: "Kliknutím do políčka přidáš nebo odebereš úder. Čísla označují čtyři doby, pluska jsou přesně mezi nimi.",
      quests: [
        { id: "tleskani", name: "Tleskni na dva a čtyři", task: "Do řádku Tlesknutí dej úder jen pod čísla 2 a 4. Pusť smyčku, počítej nahlas do čtyř a tleskej s ní." },
        { id: "pulzy", name: "Dvakrát tolik činelů", task: "Nech kopák na číslech 1 a 3. Do řádku Hi-hat dej úder na každé číslo. Za hry přidej i všechna pluska. Co se zrychlilo a co drží původní tempo?" }
      ]
    },
    {
      id: "melodie", mode: "melody", name: "Melodická zahrada", icon: "note",
      blurb: "Zasaď pět různých tónů do mřížky a nech svou melodii zaznít.",
      intro: "Každý sloupec je jeden krok melodie. Čím výš políčko rozsvítíš, tím vyšší tón uslyšíš. Prázdný sloupec udělá pauzu.",
      quests: [
        { id: "schody", name: "Po tónových schodech", task: "Vyber vzor Schody a sleduj, jak melodie stoupá a klesá. Přesuň nejvyšší tón na spodní řádek. Kde se melodie změnila nejvíc?" },
        { id: "rozhovor", name: "Hudební rozhovor", task: "Vymaž mřížku. Jeden hráč vymyslí začátek do prvních čtyř sloupců, druhý odpoví tóny v posledních čtyřech. Pusťte si rozhovor a vyměňte se." }
      ]
    },
    {
      id: "zvuk", mode: "sound", name: "Zvuková laboratoř", icon: "wave",
      blurb: "Proměň tvar zvukové vlny a poslouchej, jak se mění barva tónu.",
      intro: "Vyber tvar vlny a zahraj tón. Na displeji uvidíš, jak vlna kmitá, a v uších poznáš, jakou má zvuk barvu.",
      quests: [
        { id: "barva", name: "Jeden tón, dvě barvy", task: "Zvol Sinus a zahraj C. Pak přepni na Obdélník a zahraj stejné C. Který zvuk by se víc hodil k píšťalce a který do videohry?" },
        { id: "oktava", name: "Vlna pod lupou", task: "Nastav střední oktávu a zahraj levé C. Zapamatuj si číslo v Hz. Přepni na vysokou oktávu a zahraj stejné tlačítko. Kolikrát rychleji teď vlna kmitá?" }
      ]
    }
  ];

  const main = document.querySelector("main");
  const muteButton = document.getElementById("mute");
  const notice = document.getElementById("notice");
  let instrument = null;
  let playing = false;
  let demo = false;
  let pending = false;
  let version = 0;
  let ticker;
  let animation;
  let noticeTimer;
  let tempo = read("tempo", 100);
  if (!Number.isInteger(tempo) || tempo < 50 || tempo > 180) tempo = 100;
  let muted = read("muted", false) === true;
  const savedQuests = read("quests", []);
  const completed = new Set(Array.isArray(savedQuests) ? savedQuests.filter(item => typeof item === "string") : []);

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem("musiclab." + key)) ?? fallback; }
    catch { return fallback; }
  }

  function store(key, value) {
    try { localStorage.setItem("musiclab." + key, JSON.stringify(value)); }
    catch { /* Edits remain available for this visit. */ }
  }

  function icon(name) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function notify(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    if (message) noticeTimer = setTimeout(() => { notice.textContent = ""; }, 3400);
  }

  function syncMute() {
    LabAudio.setVolume(muted ? 0 : 0.65);
    muteButton.innerHTML = icon(muted ? "mute" : "volume") + "<span>" + (muted ? "Zvuk vypnutý" : "Zvuk zapnutý") + "</span>";
    muteButton.setAttribute("aria-label", "Ztlumit zvuk");
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.title = muted ? "Zapnout zvuk" : "Vypnout zvuk";
  }

  function syncPlay() {
    const button = main.querySelector("[data-play], [data-demo]");
    if (!button) return;
    const active = playing || pending;
    const isDemo = button.hasAttribute("data-demo");
    const label = isDemo ? (active ? "Zastavit ukázku" : "Pustit ukázku") : (active ? "Zastavit" : "Přehrát smyčku");
    button.innerHTML = icon(active ? "stop" : isDemo ? "headphones" : "play") + "<span>" + label + "</span>";
  }

  function stop() {
    version++;
    clearInterval(ticker);
    cancelAnimationFrame(animation);
    playing = pending = demo = false;
    LabAudio.silence();
    instrument?.resetPlayback();
    syncPlay();
  }

  function demoStep(n, when) {
    const step = n % 8;
    if (step === 0 || step === 4) LabAudio.playDrum(0, when);
    if (step === 2 || step === 6) LabAudio.playDrum(1, when);
    if (step % 2 === 0 || n >= 8) LabAudio.playDrum(2, when);
    const notes = [60, null, 64, 67, null, 69, 67, null, 64, 62, 60, null, 67, 64, 60, null];
    if (notes[n] !== null) LabAudio.playNote(notes[n], when, { duration: 0.31 });
  }

  async function togglePlay(isDemo) {
    if (playing || pending) { stop(); return; }
    const run = ++version;
    pending = true;
    syncPlay();
    try {
      await LabAudio.start();
      if (run !== version) return;
      pending = false;
      playing = true;
      demo = isDemo;
      let nextTime = LabAudio.now() + 0.035;
      let count = 0;
      const scheduled = [];
      const schedule = () => {
        const now = LabAudio.now();
        if (demo && count === 16) {
          if (now > nextTime + 0.12) stop();
          return;
        }
        if (nextTime < now) nextTime = now + 0.01;
        while (nextTime <= now + 0.10 && (!demo || count < 16)) {
          const step = count % 8;
          if (demo) demoStep(count, nextTime);
          else instrument.tick(step, nextTime);
          scheduled.push({ step, time: nextTime });
          nextTime += 30 / (demo ? 108 : tempo);
          count++;
        }
      };
      const highlight = () => {
        if (run !== version) return;
        const now = LabAudio.now();
        while (scheduled.length && scheduled[0].time <= now) {
          const hit = scheduled.shift();
          instrument?.highlight(hit.step);
        }
        animation = requestAnimationFrame(highlight);
      };
      schedule();
      ticker = setInterval(schedule, 25);
      highlight();
    } catch {
      if (run === version) {
        stop();
        notify("Zvuk se nepodařilo spustit. Zkus ho znovu zapnout v prohlížeči.");
      }
    }
  }

  async function preview(fn, value) {
    const run = version;
    try {
      await LabAudio.start();
      if (run === version) fn(value);
    } catch { notify("Zvuk se nepodařilo přehrát. Zkus to znovu."); }
  }

  const context = {
    isPlaying: () => playing,
    notify,
    playDrum: LabAudio.playDrum,
    playNote: LabAudio.playNote,
    previewDrum: index => preview(LabAudio.playDrum, index),
    previewNote: midi => preview(LabAudio.playNote, midi)
  };

  function renderHome() {
    main.replaceChildren(document.getElementById("home").content.cloneNode(true));
    main.querySelector("#cards").innerHTML = labs.map(lab =>
      '<a class="experiment" href="#' + lab.id + '">' +
      '<img class="poster ' + lab.mode + '" src="./assets/poster-' + lab.mode + '.webp" alt="" width="1200" height="520">' +
      '<div class="card-copy"><h3>' + lab.name + '</h3><p>' + lab.blurb + '</p>' +
      '<span class="card-play">' + icon("play") + '</span></div></a>'
    ).join("");
    main.querySelector("[data-demo]").addEventListener("click", () => togglePlay(true));
  }

  function renderChallenges() {
    const groups = labs.map(lab => {
      const quests = lab.quests.map(quest => {
        const done = completed.has(quest.id);
        return '<article class="quest"><h3>' + quest.name + '</h3><p>' + quest.task + '</p>' +
          (done ? '<span class="completed">' + icon("check") + ' Vyzkoušeno</span>' : '') +
          '<a class="outline-button" href="#' + lab.id + '/' + quest.id + '">' + icon("play") + (done ? 'Zopakovat' : 'Zkusit výzvu') + '</a></article>';
      }).join("");
      return '<section class="challenge-group"><div class="group-heading ' + lab.mode + '">' + icon(lab.icon) + '<h2>' + lab.name + '</h2></div>' + quests + '</section>';
    });
    main.innerHTML = '<section class="challenge-header"><div class="eyebrow">' + icon("spark") + ' Pro jednoho i pro dva</div>' +
      '<h1>Hudební výzvy<span class="heading-dot">.</span></h1><p>Vyber si malý pokus a vyzkoušej, co uslyšíš. U každé výzvy si můžeš označit, že už ji máš za sebou.</p></section>' +
      '<div class="challenge-layout">' + groups.join("") + '</div>';
  }

  function renderLab(lab, questId) {
    const quest = lab.quests.find(item => item.id === questId) ?? lab.quests[0];
    const fromChallenges = Boolean(questId);
    const back = '<a class="back" href="#' + (fromChallenges ? "vyzvy" : "experimenty") + '">' + icon("back") + (fromChallenges ? "Všechny výzvy" : "Všechny experimenty") + '</a>';
    main.innerHTML = back +
      '<section class="lab-banner"><div class="intro-copy"><h1>' + lab.name + '</h1><p>' + lab.intro + '</p></div>' +
      '<img src="./assets/poster-' + lab.mode + '.webp" alt=""></section>' +
      '<section class="instrument-panel" aria-label="Hudební nástroj"><div class="transport"><button class="primary" data-play></button>' +
      '<div class="tempo-control"><label for="tempo">Tempo</label><input type="range" id="tempo" min="50" max="180" value="' + tempo + '" aria-describedby="tempo-hint">' +
      '<output for="tempo">' + tempo + ' BPM</output><span class="sr-only" id="tempo-hint">Počet dob za minutu</span></div></div><div id="instrument"></div></section>' +
      '<aside class="mission"><div><h2 class="mission-heading">' + icon("spark") + 'Výzva · ' + quest.name + '</h2><p>' + quest.task + '</p></div><button class="outline-button" data-done></button></aside>';
    const tempoInput = main.querySelector("#tempo");
    tempoInput.addEventListener("input", () => {
      tempo = Number(tempoInput.value);
      main.querySelector("output").value = tempo + " BPM";
      store("tempo", tempo);
    });
    main.querySelector("[data-play]").addEventListener("click", () => togglePlay(false));
    syncPlay();
    const done = main.querySelector("[data-done]");
    function syncDone() {
      const marked = completed.has(quest.id);
      done.innerHTML = (marked ? icon("check") : "") + (marked ? "Vyzkoušeno" : "Označit jako vyzkoušené");
      done.setAttribute("aria-pressed", String(marked));
    }
    done.addEventListener("click", () => {
      if (completed.has(quest.id)) completed.delete(quest.id);
      else completed.add(quest.id);
      store("quests", [...completed]);
      syncDone();
    });
    syncDone();
    const host = main.querySelector("#instrument");
    if (lab.mode === "sound") {
      instrument = SoundLab;
      instrument.mount(host, context);
    } else {
      instrument = Sequencer;
      instrument.mount(host, lab.mode, context);
    }
  }

  function route(focus = true) {
    stop();
    instrument?.unmount();
    instrument = null;
    notify("");
    const [path, quest] = location.hash.slice(1).split("/");
    const lab = labs.find(item => item.id === path);
    const challenges = path === "vyzvy";
    document.querySelectorAll("[data-nav]").forEach(link => {
      if (link.dataset.nav === (challenges || (lab && quest) ? "challenges" : "home")) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (lab) renderLab(lab, quest);
    else if (challenges) renderChallenges();
    else renderHome();
    document.title = (lab?.name ?? (challenges ? "Hudební výzvy" : "Hudební laboratoř")) + " · MusicLab";
    if (focus) main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  muteButton.addEventListener("click", () => {
    muted = !muted;
    store("muted", muted);
    syncMute();
  });
  document.querySelector(".skip").addEventListener("click", event => {
    event.preventDefault();
    main.focus();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
  window.addEventListener("pagehide", stop);
  window.addEventListener("hashchange", () => route());
  syncMute();
  route(false);
})();
