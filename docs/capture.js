(() => {
  'use strict';

  let ctx, ui, listeners, lastTake;
  let current = null;
  let phase = 'idle';
  let generation = 0;
  let started = 0;
  let clock = 0;

  const canCapture = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  function paint() {
    if (!ui) return;
    const recording = phase === 'recording';
    ui.mic.disabled = !canCapture() || phase === 'finishing';
    ui.mic.classList.toggle('cap-recording', recording);
    ui.mic.setAttribute('aria-pressed', String(recording));
    ui.mic.textContent = recording ? 'Zastavit a vložit' : phase === 'asking' ? 'Zrušit žádost' : 'Nahrát mikrofon';
    ui.wav.disabled = !lastTake || phase !== 'idle';
    ui.wav.title = lastTake ? 'Načíst poslední stereo záznam hlavního výstupu do sampleru' : 'Nejdřív pořiď stereo záznam tlačítkem REC';
    if (recording) {
      const seconds = Math.floor((performance.now() - started) / 1000);
      ui.status.textContent = 'REC ' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    } else if (phase === 'asking') ui.status.textContent = 'Čeká na mikrofon';
    else if (phase === 'finishing') ui.status.textContent = 'Načítání vzorku…';
    else if (!canCapture()) ui.status.textContent = 'Záznam mikrofonu není k dispozici';
    else ui.status.textContent = lastTake ? 'WAV připraven' : 'Připraven';
  }

  function setTake(blob) {
    lastTake = blob instanceof Blob && blob.size > 0 ? blob : null;
    paint();
  }

  function closeTracks(stream) {
    stream?.getTracks().forEach(track => track.stop());
  }

  function endClock() {
    clearInterval(clock);
    clock = 0;
  }

  function stop() {
    generation++;
    endClock();
    const session = current;
    current = null;
    if (session) {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
      closeTracks(session.stream);
      session.chunks.length = 0;
    }
    phase = 'idle';
    paint();
  }

  function errorMessage(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Přístup k mikrofonu nebyl povolen.';
    if (error?.name === 'NotFoundError') return 'Prohlížeč nenašel žádný mikrofon.';
    if (error?.name === 'NotReadableError') return 'Mikrofon se nepodařilo otevřít. Může ho používat jiná aplikace.';
    return 'Záznam mikrofonu se nepodařil.';
  }

  async function load(blob, filename, token) {
    if (token !== generation) return;
    phase = 'finishing';
    paint();
    try {
      if (!blob.size) throw new Error();
      await ctx.importFile(new File([blob], filename, { type: blob.type }));
    } catch {
      if (token === generation) ctx.notify('Vzorek se nepodařilo načíst do sampleru.');
    } finally {
      if (token === generation) { phase = 'idle'; paint(); }
    }
  }

  function finish() {
    if (phase !== 'recording' || !current) return;
    phase = 'finishing';
    endClock();
    paint();
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    // The recorder flushes the last packet in dataavailable before its stop event.
  }

  async function begin() {
    if (!canCapture() || phase !== 'idle') return;
    const token = ++generation;
    phase = 'asking';
    paint();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (token !== generation) { closeTracks(stream); return; }
      const mimeType = types.find(type => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const session = { stream, recorder, chunks: [] };
      current = session;
      recorder.addEventListener('dataavailable', event => {
        if (current === session && event.data.size) session.chunks.push(event.data);
      });
      recorder.addEventListener('error', event => {
        if (current !== session) return;
        stop();
        ctx.notify(errorMessage(event.error));
      });
      recorder.addEventListener('stop', () => {
        if (current !== session) return;
        current = null;
        endClock();
        closeTracks(stream);
        const type = recorder.mimeType || session.chunks[0]?.type || 'audio/webm';
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : type.includes('wav') ? 'wav' : 'webm';
        const blob = new Blob(session.chunks, { type });
        session.chunks.length = 0;
        load(blob, 'Mikrofon-' + stamp() + '.' + extension, token);
      }, { once: true });
      stream.getAudioTracks()[0]?.addEventListener('ended', finish, { once: true });
      recorder.start();
      started = performance.now();
      phase = 'recording';
      clock = setInterval(paint, 250);
      paint();
    } catch (error) {
      closeTracks(stream);
      if (token === generation) { stop(); ctx.notify(errorMessage(error)); }
    }
  }

  function mount(host, context) {
    stop();
    listeners?.abort();
    listeners = new AbortController();
    ctx = context;
    host.innerHTML = `<section class="cap-strip" aria-label="Odběr vzorku">
      <div class="cap-heading"><h3>Odběr vzorku</h3><output aria-live="off"></output></div>
      <div class="cap-controls"><button type="button" class="btn" data-capture-mic></button><button type="button" class="btn" data-capture-wav>Použít poslední WAV</button></div>
    </section>`;
    ui = { status: host.querySelector('.cap-heading output'), mic: host.querySelector('[data-capture-mic]'), wav: host.querySelector('[data-capture-wav]') };
    const options = { signal: listeners.signal };
    ui.mic.addEventListener('click', () => {
      if (phase === 'idle') begin();
      else if (phase === 'recording') finish();
      else if (phase === 'asking') stop();
    }, options);
    ui.wav.addEventListener('click', () => {
      if (phase === 'idle' && lastTake) load(lastTake, 'Master-' + stamp() + '.wav', ++generation);
    }, options);
    window.addEventListener('pagehide', stop, options);
    paint();
  }

  window.Capture = { mount, setTake, stop };
})();
