/* ==========================================================================
   JZo Jam Studio – Bedienoberfläche
   Aufnahme, Live-Erkennung (Jam), Skalen, Akkorde, gespeicherte Ideen.
   ========================================================================== */
(function () {
  'use strict';

  var T = window.JZoTheory, D = window.JZoDSP, S = window.JZoStore;
  var VERSION = '1.1.0';
  var MAX_REC_SEC = 15 * 60;

  /* ---------------- Kleine Helfer ---------------- */

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtDate(ts, withYear) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + (withYear ? d.getFullYear() : '') + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2600);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- Einstellungen (merkt sich das Gerät) ---------------- */

  var prefs = {
    german: false,
    key: { tonic: 9, scale: 'aeolian' },
    chordType: 'triad',
    tuning: 'std',
    progBpm: 90,
    progression: []
  };
  try {
    var saved = JSON.parse(localStorage.getItem('jzo-jam-prefs') || 'null');
    if (saved) Object.keys(prefs).forEach(function (k) { if (saved[k] != null) prefs[k] = saved[k]; });
  } catch (e) { /* kein Speicher verfügbar – Standardwerte */ }
  if (!T.SCALES[prefs.key.scale]) prefs.key = { tonic: 9, scale: 'aeolian' };
  if (!T.TUNINGS[prefs.tuning]) prefs.tuning = 'std';
  T.settings.tuning = prefs.tuning;
  function savePrefs() {
    try { localStorage.setItem('jzo-jam-prefs', JSON.stringify(prefs)); } catch (e) { /* egal */ }
  }
  T.settings.german = prefs.german;

  function keyFlats(key) { return T.keyFlats(key); }
  function chordLabel(ch, key) { return T.chordName(ch, key ? keyFlats(key) : false); }

  /* ---------------- Klang-Ausgabe ---------------- */

  var ctx = null, master = null;
  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createDynamicsCompressor();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // iOS: Ton auch bei Stummschalter hörbar (Safari 17+)
  function setSession(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* älteres iOS */ }
  }

  // Gezupfte Saite (Karplus-Strong), einmal berechnet und dann wiederverwendet
  var pluckCache = {};
  function pluckBuffer(midi) {
    if (pluckCache[midi]) return pluckCache[midi];
    var sr = ctx.sampleRate, len = Math.floor(sr * 2.4);
    var buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    var N = Math.max(2, Math.round(sr / f));
    var ring = new Float32Array(N), i;
    for (i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (i = 1; i < N; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
    var decay = 0.996 + Math.min(0.0035, (60 - midi) * 0.0001);
    var p = 0;
    for (i = 0; i < len; i++) {
      var nx = (p + 1) % N;
      var v = ring[p];
      ring[p] = decay * 0.5 * (v + ring[nx]);
      out[i] = v * 0.5 * Math.min(1, (len - i) / 3000);
      p = nx;
    }
    pluckCache[midi] = buf;
    return buf;
  }
  var playing = [];
  function playMidi(midi, when, gain) {
    var s = ctx.createBufferSource();
    s.buffer = pluckBuffer(midi);
    var g = ctx.createGain();
    g.gain.value = gain == null ? 0.5 : gain;
    s.connect(g); g.connect(master);
    s.start(when);
    playing.push(s);
    s.onended = function () { var i = playing.indexOf(s); if (i >= 0) playing.splice(i, 1); };
  }
  function strum(root, quality, when, gain) {
    var ms = T.chordMidis(root, quality);
    ms.forEach(function (m, i) { playMidi(m, when + i * 0.018, (gain || 0.42)); });
  }
  var timers = [];
  function stopSound() {
    playing.slice().forEach(function (s) { try { s.stop(); } catch (e) { /* schon aus */ } });
    playing = [];
    timers.forEach(clearTimeout); timers = [];
    if (progPlayer.onStop) { var f = progPlayer.onStop; progPlayer.onStop = null; f(); }
  }
  function playChordNow(ch) {
    ensureCtx(); setSession('playback');
    strum(ch.root, ch.quality, ctx.currentTime + 0.02);
  }
  function playMidiSeq(midis, step) {
    ensureCtx(); setSession('playback'); stopSound();
    var t0 = ctx.currentTime + 0.05;
    midis.forEach(function (m, i) { playMidi(m, t0 + i * step, 0.55); });
  }

  // Akkordfolge abspielen: je Akkord ein Takt, Anschlag auf 1 und 3
  var progPlayer = { onStop: null };
  function playProgression(chords, bpm, onChord, onStop) {
    ensureCtx(); setSession('playback'); stopSound();
    var beat = 60 / (bpm || 90);
    var t0 = ctx.currentTime + 0.08;
    chords.forEach(function (ch, i) {
      var t = t0 + i * 4 * beat;
      strum(ch.root, ch.quality, t, 0.45);
      strum(ch.root, ch.quality, t + 2 * beat, 0.32);
      if (onChord) timers.push(setTimeout(function () { onChord(i); }, (t - ctx.currentTime) * 1000));
    });
    progPlayer.onStop = onStop || null;
    timers.push(setTimeout(stopSound, (chords.length * 4 * beat + 1.5) * 1000));
  }

  // Metronom
  var metro = { on: false, bpm: 100, beats: 4, next: 0, beat: 0, timer: null, btn: null };
  function metroTick() {
    while (metro.next < ctx.currentTime + 0.12) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = metro.beat % metro.beats === 0 ? 1600 : 1000;
      g.gain.setValueAtTime(0.0001, metro.next);
      g.gain.exponentialRampToValueAtTime(0.5, metro.next + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, metro.next + 0.06);
      o.connect(g); g.connect(master);
      o.start(metro.next); o.stop(metro.next + 0.08);
      metro.next += 60 / metro.bpm;
      metro.beat++;
    }
  }
  function metroStart(bpm, beats, btn) {
    ensureCtx(); setSession('playback');
    metroStop();
    metro.on = true; metro.bpm = bpm; metro.beats = beats; metro.beat = 0;
    metro.next = ctx.currentTime + 0.1; metro.btn = btn;
    metro.timer = setInterval(metroTick, 25);
    if (btn) btn.textContent = '⏹ Metronom aus';
  }
  function metroStop() {
    if (metro.timer) clearInterval(metro.timer);
    metro.timer = null; metro.on = false;
    if (metro.btn) metro.btn.textContent = '🥁 Metronom';
    metro.btn = null;
  }

  /* ---------------- Mikrofon ---------------- */

  var workletLoaded = false;
  function MicSession(onChunk) { this.onChunk = onChunk; }
  MicSession.prototype.start = function () {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('Dieses Gerät/dieser Browser erlaubt hier kein Mikrofon. Bitte Safari verwenden.'));
    }
    ensureCtx();
    setSession('play-and-record');
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    }).then(function (stream) {
      self.stream = stream;
      if (ctx.state === 'suspended') return ctx.resume();
    }).then(function () {
      var factor = ctx.sampleRate >= 44100 ? 2 : 1;
      self.sampleRate = ctx.sampleRate / factor;
      self.src = ctx.createMediaStreamSource(self.stream);
      self.mute = ctx.createGain();
      self.mute.gain.value = 0;
      if (ctx.audioWorklet && window.AudioWorkletNode) {
        var load = workletLoaded ? Promise.resolve() : ctx.audioWorklet.addModule('js/recorder-worklet.js').then(function () { workletLoaded = true; });
        return load.then(function () {
          self.node = new AudioWorkletNode(ctx, 'jzo-recorder', { processorOptions: { factor: factor } });
          self.node.port.onmessage = function (e) { self.onChunk(e.data); };
          self.src.connect(self.node); self.node.connect(self.mute); self.mute.connect(ctx.destination);
        });
      }
      // Ältere Geräte: ScriptProcessor
      self.node = ctx.createScriptProcessor(4096, 1, 1);
      self.node.onaudioprocess = function (e) {
        var inp = e.inputBuffer.getChannelData(0);
        var out = new Float32Array(Math.floor(inp.length / factor));
        for (var i = 0; i < out.length; i++) {
          var s = 0;
          for (var k = 0; k < factor; k++) s += inp[i * factor + k];
          out[i] = s / factor;
        }
        self.onChunk(out);
      };
      self.src.connect(self.node); self.node.connect(self.mute); self.mute.connect(ctx.destination);
    }).catch(function (err) {
      self.stop();
      throw err;
    });
  };
  MicSession.prototype.stop = function () {
    try { if (this.src) this.src.disconnect(); } catch (e) { /* ok */ }
    try { if (this.node) { this.node.disconnect(); if (this.node.port) this.node.port.onmessage = null; } } catch (e) { /* ok */ }
    try { if (this.mute) this.mute.disconnect(); } catch (e) { /* ok */ }
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    setSession('playback');
  };

  function micErrorText(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      return 'Kein Zugriff aufs Mikrofon. iPhone: Einstellungen → Safari → Mikrofon → „Erlauben“ (bzw. beim Nachfragen „Erlauben“ tippen).';
    }
    if (n === 'NotFoundError') return 'Kein Mikrofon gefunden.';
    return 'Mikrofon konnte nicht gestartet werden: ' + (err && err.message || err);
  }

  // Bildschirm während der Aufnahme anlassen (sonst stoppt iOS das Mikrofon)
  var wakeLock = null;
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; l.addEventListener('release', function () { wakeLock = null; }); }).catch(function () {});
      } else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) { /* nicht unterstützt */ }
  }

  // Ringpuffer der letzten Sekunde für die Live-Anzeige
  function Recent(sec) { this.sec = sec; this.chunks = []; this.len = 0; }
  Recent.prototype.push = function (c, sr) {
    this.chunks.push(c); this.len += c.length;
    while (this.chunks.length > 1 && this.len - this.chunks[0].length >= sr * this.sec) this.len -= this.chunks.shift().length;
  };
  Recent.prototype.get = function () {
    var out = new Float32Array(this.len), o = 0;
    this.chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  };
  function rms(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / (a.length || 1)); }
  function levelPct(r) { return Math.min(100, Math.max(0, (20 * Math.log10(r + 1e-6) + 60) / 60 * 100)); }

  /* ---------------- WAV ---------------- */

  function encodeWav(int16Chunks, sampleRate) {
    var n = 0;
    int16Chunks.forEach(function (c) { n += c.length; });
    var buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    var out = new Int16Array(buf, 44, n), o = 0;
    int16Chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return buf;
  }
  function toInt16(f) {
    var out = new Int16Array(f.length);
    for (var i = 0; i < f.length; i++) { var s = Math.max(-1, Math.min(1, f[i])); out[i] = s < 0 ? s * 32768 : s * 32767; }
    return out;
  }
  function int16ToFloat(chunks) {
    var n = 0; chunks.forEach(function (c) { n += c.length; });
    var out = new Float32Array(n), o = 0;
    chunks.forEach(function (c) { for (var i = 0; i < c.length; i++) out[o++] = c[i] / 32768; });
    return out;
  }

  /* ---------------- Analyse (im Hintergrund) ---------------- */

  function runAnalysis(pcm, sampleRate) {
    return new Promise(function (resolve, reject) {
      var fallback = function () {
        setTimeout(function () {
          try { resolve(D.analyze(pcm, sampleRate)); } catch (e) { reject(e); }
        }, 30);
      };
      var w;
      try { w = new Worker('js/analysis-worker.js'); } catch (e) { fallback(); return; }
      w.onmessage = function (e) {
        w.terminate();
        if (e.data.ok) resolve(e.data.result); else reject(new Error(e.data.error));
      };
      w.onerror = function (e) { e.preventDefault(); w.terminate(); fallback(); };
      w.postMessage({ pcm: pcm, sampleRate: sampleRate, german: T.settings.german });
    });
  }

  function applyAnalysis(idea, result) {
    idea.analysis = result;
    idea.status = 'done';
    idea.duration = result.duration;
    if (result.key) idea.key = { tonic: result.key.tonic, scale: result.key.scale };
    if (result.bpm) idea.bpm = result.bpm;
    if (result.meter) idea.meter = result.meter;
    return idea;
  }

  function analyzeAndSave(idea, pcm, sampleRate, container) {
    renderIdea(container, idea);
    return runAnalysis(pcm, sampleRate).then(function (result) {
      applyAnalysis(idea, result);
      return S.putIdea(idea);
    }).catch(function (err) {
      idea.status = 'error';
      idea.error = String(err && err.message || err);
      return S.putIdea(idea);
    }).then(function () {
      if (container.dataset.ideaId === idea.id) renderIdea(container, idea);
      if (idea.key) setKey(idea.key, true);
      refreshIdeas();
    });
  }

  /* ---------------- AUFNAHME ---------------- */

  var rec = null;
  function startRecording() {
    stopSound(); metroStop();
    if (jam.session) stopJam();
    var btn = $('mic-btn');
    btn.classList.add('busy');
    var state = { chunks: [], samples: 0, recent: new Recent(0.75), live: null, lastLive: 0, started: 0 };
    var session = new MicSession(function (chunk) {
      if (!rec) return;
      state.chunks.push(toInt16(chunk));
      state.samples += chunk.length;
      state.recent.push(chunk, session.sampleRate);
      $('rec-meter').style.width = levelPct(rms(chunk)) + '%';
    });
    session.start().then(function () {
      rec = state;
      rec.session = session;
      rec.started = performance.now();
      rec.live = new D.LiveAnalyzer(session.sampleRate);
      btn.classList.remove('busy');
      btn.classList.add('recording');
      btn.setAttribute('aria-label', 'Aufnahme stoppen');
      $('rec-hint').innerHTML = 'Läuft … Tippe zum <b>Stoppen</b>.';
      $('rec-live').classList.remove('hidden');
      $('rec-result').innerHTML = '';
      keepAwake(true);
      rec.timer = setInterval(recTick, 200);
    }).catch(function (err) {
      btn.classList.remove('busy');
      toast(micErrorText(err), 6000);
    });
  }
  function recTick() {
    if (!rec) return;
    var sec = (performance.now() - rec.started) / 1000;
    $('rec-time').textContent = fmtTime(sec);
    var now = performance.now();
    var dt = rec.lastLive ? (now - rec.lastLive) / 1000 : 0.2;
    rec.lastLive = now;
    var out = rec.live.push(rec.recent.get(), dt);
    if (out.key) $('rec-live-key').textContent = T.keyName(out.key);
    $('rec-live-chord').textContent = out.chord ? chordLabel(out.chord, out.key) : '–';
    $('rec-live-note').textContent = out.note != null ? T.noteName(out.note, out.key ? keyFlats(out.key) : false) : '–';
    if (sec >= MAX_REC_SEC) { toast('Maximale Länge (15 Min.) erreicht – Aufnahme gespeichert.'); stopRecording(); }
  }
  function stopRecording() {
    if (!rec) return;
    var r = rec;
    rec = null;
    clearInterval(r.timer);
    r.session.stop();
    keepAwake(false);
    var btn = $('mic-btn');
    btn.classList.remove('recording');
    btn.setAttribute('aria-label', 'Aufnahme starten');
    $('rec-meter').style.width = '0';
    $('rec-live').classList.add('hidden');
    $('rec-hint').innerHTML = 'Tippe auf den Knopf und spiel los.<br>Jede Aufnahme wird <b>automatisch gespeichert</b>.';
    var sr = r.session.sampleRate;
    var dur = r.samples / sr;
    if (dur < 1.5) { toast('Das war zu kurz – nichts gespeichert.'); $('rec-time').textContent = '00:00'; return; }
    var now = Date.now();
    var idea = {
      id: uid(), type: 'recording', name: 'Idee ' + fmtDate(now), created: now,
      duration: +dur.toFixed(2), sampleRate: sr, hasAudio: true, status: 'analyzing', memo: '',
      tuning: prefs.tuning
    };
    var wav = encodeWav(r.chunks, sr);
    var pcm = int16ToFloat(r.chunks);
    r.chunks = null;
    // Zuerst sichern, dann analysieren – so geht keine Idee verloren
    S.persist();
    S.putAudio(idea.id, wav).then(function () { return S.putIdea(idea); }).then(function () {
      toast('✔ Aufnahme gespeichert');
      refreshIdeas();
      setTimeout(function () { $('rec-result').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
      return analyzeAndSave(idea, pcm, sr, $('rec-result'));
    }).catch(function (err) {
      toast('Speichern hat nicht geklappt: ' + (err && err.message || err), 6000);
    });
  }
  $('mic-btn').addEventListener('click', function () {
    if (rec) stopRecording(); else startRecording();
  });

  // Datei analysieren
  $('file-input').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    stopSound();
    var box = $('rec-result');
    box.dataset.ideaId = '';
    box.innerHTML = '<div class="card"><div class="spinner">Datei wird geladen …</div></div>';
    ensureCtx();
    file.arrayBuffer().then(function (ab) {
      return new Promise(function (resolve, reject) {
        var p = ctx.decodeAudioData(ab, resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
    }).then(function (audio) {
      var len = Math.min(audio.length, Math.floor(audio.sampleRate * 600));
      var factor = audio.sampleRate >= 44100 ? 2 : 1;
      var sr = audio.sampleRate / factor;
      var mono = new Float32Array(Math.floor(len / factor));
      for (var ch = 0; ch < audio.numberOfChannels; ch++) {
        var d = audio.getChannelData(ch);
        for (var i = 0; i < mono.length; i++) {
          var s = 0;
          for (var k = 0; k < factor; k++) s += d[i * factor + k];
          mono[i] += s / factor / audio.numberOfChannels;
        }
      }
      var now = Date.now();
      var idea = {
        id: uid(), type: 'file', name: file.name.replace(/\.[^.]+$/, ''), created: now,
        duration: +(mono.length / sr).toFixed(2), sampleRate: sr, hasAudio: true, status: 'analyzing', memo: '',
        tuning: prefs.tuning
      };
      var wav = encodeWav([toInt16(mono)], sr);
      S.persist();
      return S.putAudio(idea.id, wav).then(function () { return S.putIdea(idea); }).then(function () {
        refreshIdeas();
        return analyzeAndSave(idea, mono, sr, box);
      });
    }).catch(function (err) {
      box.innerHTML = '<div class="notice">Diese Datei konnte nicht gelesen werden (' + esc(err && err.message || err) + '). Am besten MP3, M4A oder WAV verwenden.</div>';
    });
  });

  /* ---------------- IDEE ANZEIGEN (Ergebnis) ---------------- */

  var objectUrls = [];
  function freeUrls() { objectUrls.forEach(function (u) { URL.revokeObjectURL(u); }); objectUrls = []; }

  var TYPE_ICON = { recording: '🎙️', file: '📄', progression: '🎸', live: '📡' };

  function renderIdea(container, idea) {
    container.dataset.ideaId = idea.id;
    var a = idea.analysis || {};
    var key = idea.key;
    var flats = key ? keyFlats(key) : false;
    var h = '<div class="card">';
    h += '<input class="name-input" data-act="name" value="' + esc(idea.name) + '" aria-label="Name der Idee">';
    h += '<div class="muted small">' + TYPE_ICON[idea.type] + ' ' + fmtDate(idea.created, true) +
      (idea.duration ? ' · ' + fmtTime(idea.duration) : '') + '</div>';
    if (idea.hasAudio) h += '<audio controls preload="metadata" data-audio></audio>';

    if (idea.status === 'analyzing') {
      h += '<div class="spinner">Wird analysiert … (Tonart, Tempo, Akkorde, Töne)</div></div>';
      container.innerHTML = h;
      bindIdea(container, idea);
      return;
    }
    if (idea.status === 'error') {
      h += '<div class="notice">Die Analyse hat nicht geklappt (' + esc(idea.error) + '). Die Aufnahme ist aber gespeichert.</div>';
    }
    if (a.empty) {
      h += '<div class="notice">Es war fast nichts zu hören. Die Aufnahme ist gespeichert, aber für die Erkennung bitte etwas lauter / näher am Mikrofon spielen.</div>';
    }

    if (key) {
      h += '<div class="section-title">Tonart &amp; Modus</div>';
      h += '<div class="result-key">' + esc(T.keyName(key)) + '</div>';
      h += '<div class="result-sub">' + esc(T.SCALE_INFO[key.scale] || '') + '</div>';
      if (a.keyAlternatives && a.keyAlternatives.length) {
        h += '<div class="section-title">Auch möglich (tippen zum Wechseln)</div><div class="chips">';
        a.keyAlternatives.slice(0, 5).forEach(function (k, i) {
          var on = k.tonic === key.tonic && k.scale === key.scale;
          h += '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="key" data-i="' + i + '">' +
            esc(T.keyName(k)) + '<small>' + Math.round(k.confidence * 100) + '%</small></button>';
        });
        h += '</div>';
      }
      h += '<div class="key-select" data-scope="idea"></div>';
      if (a.keyFit != null && a.keyFit < 0.72) {
        h += '<div class="notice">Hier sind viele Töne außerhalb einer einzelnen Tonleiter (typisch für Blues oder viel Chromatik). Probier zusätzlich die <b>Moll-Pentatonik</b> oder <b>Blues-Skala</b> auf dem gleichen Grundton.</div>';
      }
      if (a.keySections && a.keySections.length) {
        h += '<div class="section-title">Tonart-Wechsel im Verlauf</div><ol class="history">';
        a.keySections.forEach(function (s, i) {
          h += '<li><span class="t">' + fmtTime(s.start) + '–' + fmtTime(s.end) + '</span><button type="button" class="chip" data-act="section" data-i="' + i + '">' + esc(T.keyName(s)) + '</button></li>';
        });
        h += '</ol>';
      }
    }

    if (idea.bpm || idea.type === 'recording' || idea.type === 'file') {
      var bpm = idea.bpm || 90;
      h += '<div class="stat-row">';
      h += '<div class="stat"><span class="lbl">Tempo</span><span class="stepper"><button type="button" data-act="bpm-" aria-label="langsamer">−</button><b>' + bpm + '</b><button type="button" data-act="bpm+" aria-label="schneller">+</button></span> <span class="muted small">BPM</span></div>';
      h += '<div class="stat"><span class="lbl">Takt</span><button type="button" class="chip" data-act="meter">' + esc(idea.meter || '4/4') + '</button></div>';
      h += '</div>';
      if (a.bpmConfidence != null && a.bpmConfidence < 0.35) h += '<p class="muted small">Tempo unsicher (wenig klarer Rhythmus) – mit −/+ anpassen.</p>';
      h += '<button type="button" class="btn ghost small-btn" data-act="metro">🥁 Metronom</button>';
    }

    // Erkannte Akkorde
    if (a.chords && a.chords.length) {
      h += '<div class="section-title">Erkannte Akkordfolge</div><div class="chord-seq">';
      a.chords.slice(0, 60).forEach(function (c, i) {
        h += '<button type="button" class="chip" data-act="chord" data-i="' + i + '">' + esc(chordLabel(c, key)) + '<small>' + fmtTime(c.start) + '</small></button>';
      });
      h += '</div><div class="btn-row"><button type="button" class="btn ghost small-btn" data-act="take-prog">In „Meine Progression“ übernehmen</button></div>';
    } else if (idea.type === 'recording' || idea.type === 'file') {
      h += '<p class="muted small">Keine klaren Akkorde erkannt.</p>';
    }

    // Gespeicherte Progression
    if (idea.progression && idea.progression.length) {
      h += '<div class="section-title">Progression</div><div class="chord-seq">';
      idea.progression.forEach(function (c, i) {
        h += '<button type="button" class="chip" data-act="pchord" data-i="' + i + '">' + esc(chordLabel(c, key)) + '</button>';
      });
      h += '</div><div class="btn-row"><button type="button" class="btn small-btn" data-act="play-prog">▶ Abspielen</button>' +
        '<button type="button" class="btn ghost small-btn" data-act="edit-prog">Bearbeiten</button></div>';
    }

    // Live-Verlauf
    if (idea.history && idea.history.length) {
      h += '<div class="section-title">Erkannte Tonarten</div><ol class="history">';
      idea.history.forEach(function (s) {
        h += '<li><span class="t">' + fmtTime(s.t) + '</span>' + esc(T.keyName(s)) + '</li>';
      });
      h += '</ol>';
    }

    // Melodie / Einzeltöne
    if (a.notes && a.notes.length) {
      if (a.melodic >= 0.35) {
        var notes = a.notes.slice(0, 64);
        var tid = idea.tuning || prefs.tuning;
        var tab = T.melodyToTab(notes.map(function (n) { return n.midi; }), tid);
        h += '<div class="section-title">Gespielte Töne (Melodie)</div>';
        h += '<p class="small">' + notes.map(function (n) { return esc(T.noteName(n.midi, flats)); }).join(' ') + '</p>';
        h += '<div class="tuning-select" data-scope="idea"></div>';
        h += '<pre class="tab">' + esc(T.tabText(tab, 16, tid)) + '</pre>';
        h += '<button type="button" class="btn ghost small-btn" data-act="play-mel">▶ Töne anhören</button>';
        if (a.notes.length > 64) h += '<p class="muted small">Gezeigt: die ersten 64 Töne.</p>';
      } else {
        h += '<p class="muted small">Einzeltöne werden gezeigt, wenn du eine Melodie / ein Solo spielst (bei vollen Akkorden geht das nicht zuverlässig).</p>';
      }
    }

    h += '<div class="btn-row">';
    if (key) {
      h += '<button type="button" class="btn small-btn" data-act="go-scale">🎼 Skala zeigen</button>';
      h += '<button type="button" class="btn small-btn" data-act="go-chords">🎸 Passende Akkorde</button>';
    }
    h += '<button type="button" class="btn ghost small-btn" data-act="share">📤 Teilen / Sichern</button>';
    h += '</div>';

    h += '<div class="section-title">Notizen</div><textarea class="memo" data-act="memo" placeholder="z. B. Strophe, Kapodaster 2, Stimmung Drop D …">' + esc(idea.memo || '') + '</textarea>';
    h += '<div class="btn-row"><button type="button" class="btn danger small-btn" data-act="delete">Löschen</button></div>';
    h += '</div>';
    container.innerHTML = h;
    bindIdea(container, idea);
  }

  function bindIdea(container, idea) {
    function save() { return S.putIdea(idea).then(refreshIdeas); }
    var audio = container.querySelector('[data-audio]');
    if (audio) {
      S.getAudio(idea.id).then(function (buf) {
        if (!buf) return;
        var url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        objectUrls.push(url);
        audio.src = url;
      });
    }
    var ks = container.querySelector('.key-select[data-scope="idea"]');
    if (ks) {
      renderKeySelect(ks, idea.key, function (k) {
        idea.key = k; save(); setKey(k, true); renderIdea(container, idea);
      }, 'Tonart von Hand ändern:');
    }
    var ts = container.querySelector('.tuning-select[data-scope="idea"]');
    if (ts) {
      renderTuningSelect(ts, idea.tuning || prefs.tuning, function (id) {
        idea.tuning = id; save(); renderIdea(container, idea);
      }, 'Tab für Stimmung:');
    }
    var nameInp = container.querySelector('[data-act="name"]');
    if (nameInp) nameInp.addEventListener('change', function () { idea.name = nameInp.value.trim() || idea.name; save(); });
    var memo = container.querySelector('[data-act="memo"]');
    var memoT;
    if (memo) memo.addEventListener('input', function () {
      clearTimeout(memoT);
      memoT = setTimeout(function () { idea.memo = memo.value; save(); }, 600);
    });
    container.querySelectorAll('button[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act, i = +b.dataset.i, a = idea.analysis || {};
        if (act === 'key') {
          var k = a.keyAlternatives[i];
          idea.key = { tonic: k.tonic, scale: k.scale }; save(); setKey(idea.key, true); renderIdea(container, idea);
        } else if (act === 'section') {
          var s = a.keySections[i];
          setKey({ tonic: s.tonic, scale: s.scale }); showView('scales');
        } else if (act === 'bpm-' || act === 'bpm+') {
          idea.bpm = Math.max(30, Math.min(260, (idea.bpm || 90) + (act === 'bpm+' ? 1 : -1)));
          b.parentNode.querySelector('b').textContent = idea.bpm;
          if (metro.on) { metro.bpm = idea.bpm; }
          clearTimeout(b._t); b._t = setTimeout(save, 500);
        } else if (act === 'meter') {
          var order = ['4/4', '3/4', '6/8'];
          idea.meter = order[(order.indexOf(idea.meter || '4/4') + 1) % order.length];
          b.textContent = idea.meter; save();
        } else if (act === 'metro') {
          if (metro.on && metro.btn === b) metroStop();
          else metroStart(idea.bpm || 90, idea.meter === '3/4' ? 3 : idea.meter === '6/8' ? 6 : 4, b);
        } else if (act === 'chord') {
          playChordNow(a.chords[i]);
        } else if (act === 'pchord') {
          playChordNow(idea.progression[i]);
        } else if (act === 'take-prog') {
          prefs.progression = compressChords(a.chords).slice(0, 12);
          if (idea.key) setKey(idea.key);
          if (idea.bpm) prefs.progBpm = idea.bpm;
          savePrefs(); renderChords(); showView('chords');
          toast('Übernommen – du kannst sie jetzt bearbeiten und abspielen.');
        } else if (act === 'play-prog') {
          playProgression(idea.progression, idea.bpm || 90);
        } else if (act === 'edit-prog') {
          prefs.progression = idea.progression.slice();
          if (idea.key) setKey(idea.key);
          if (idea.bpm) prefs.progBpm = idea.bpm;
          savePrefs(); renderChords(); showView('chords');
        } else if (act === 'play-mel') {
          var step = idea.bpm ? 30 / idea.bpm : 0.28;
          playMidiSeq(a.notes.slice(0, 64).map(function (n) { return n.midi; }), Math.max(0.15, Math.min(0.5, step)));
        } else if (act === 'go-scale') {
          setKey(idea.key); showView('scales');
        } else if (act === 'go-chords') {
          setKey(idea.key); showView('chords');
        } else if (act === 'share') {
          shareIdea(idea);
        } else if (act === 'delete') {
          if (!confirm('„' + idea.name + '“ wirklich löschen? Das kann nicht rückgängig gemacht werden.')) return;
          S.deleteIdea(idea.id).then(function () {
            toast('Gelöscht.');
            container.innerHTML = ''; container.dataset.ideaId = '';
            refreshIdeas();
            if (container === $('idea-body')) closeSheet('idea-sheet');
          });
        }
      });
    });
  }

  // Akkordfolge ohne direkte Wiederholungen; wiederkehrendes Muster erkennen
  function compressChords(chords) {
    var seq = [];
    (chords || []).forEach(function (c) {
      var last = seq[seq.length - 1];
      if (!last || last.root !== c.root || last.quality !== c.quality) seq.push({ root: c.root, quality: c.quality });
    });
    // Kürzestes Muster finden, das sich wiederholt (z. B. C G Am F C G Am F → C G Am F)
    for (var len = 2; len <= Math.min(8, Math.floor(seq.length / 2)); len++) {
      var ok = true;
      for (var i = len; i < seq.length; i++) {
        if (seq[i].root !== seq[i % len].root || seq[i].quality !== seq[i % len].quality) { ok = false; break; }
      }
      if (ok) return seq.slice(0, len);
    }
    return seq;
  }

  function ideaText(idea) {
    var lines = ['JZo Jam – ' + idea.name, fmtDate(idea.created, true)];
    var key = idea.key;
    if (key) lines.push('Tonart: ' + T.keyName(key));
    if (idea.bpm) lines.push('Tempo: ' + idea.bpm + ' BPM, ' + (idea.meter || '4/4'));
    var a = idea.analysis || {};
    if (a.chords && a.chords.length) lines.push('Akkorde: ' + compressChords(a.chords).map(function (c) { return chordLabel(c, key); }).join(' – '));
    if (idea.progression && idea.progression.length) lines.push('Progression: ' + idea.progression.map(function (c) { return chordLabel(c, key); }).join(' – '));
    if (a.notes && a.notes.length && a.melodic >= 0.35) {
      var tid = idea.tuning || prefs.tuning;
      lines.push('', 'Melodie (' + T.tuningLabel(tid) + '):', T.tabText(T.melodyToTab(a.notes.slice(0, 64).map(function (n) { return n.midi; }), tid), 16, tid));
    }
    if (idea.memo) lines.push('', 'Notizen: ' + idea.memo);
    return lines.join('\n');
  }

  function shareIdea(idea) {
    var text = ideaText(idea);
    var getAudio = idea.hasAudio ? S.getAudio(idea.id) : Promise.resolve(null);
    getAudio.then(function (buf) {
      var safe = idea.name.replace(/[^\wäöüÄÖÜß .-]+/g, '_').trim() || 'Idee';
      var files = buf ? [new File([buf], safe + '.wav', { type: 'audio/wav' })] : [];
      if (navigator.share) {
        var data = { title: idea.name, text: text };
        if (files.length && navigator.canShare && navigator.canShare({ files: files })) data.files = files;
        return navigator.share(data).catch(function (e) { if (e && e.name !== 'AbortError') throw e; });
      }
      // Ohne Teilen-Funktion (z. B. am PC): herunterladen
      if (files.length) downloadBlob(files[0], files[0].name);
      downloadBlob(new Blob([text], { type: 'text/plain' }), safe + '.txt');
    }).catch(function (err) { toast('Teilen ging nicht: ' + (err && err.message || err)); });
  }
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- JAM (Live-Erkennung) ---------------- */

  var jam = { session: null, live: null, recent: null, timer: null, last: 0, started: 0, current: null, cand: null, candSince: 0, history: [] };

  function startJam() {
    stopSound(); metroStop();
    if (rec) { toast('Erst die Aufnahme stoppen.'); return; }
    var btn = $('jam-btn');
    btn.disabled = true;
    var session = new MicSession(function (chunk) {
      if (!jam.session) return;
      jam.recent.push(chunk, session.sampleRate);
      $('jam-meter').style.width = levelPct(rms(chunk)) + '%';
    });
    jam.recent = new Recent(0.75);
    session.start().then(function () {
      jam.session = session;
      if (!jam.live) { jam.live = new D.LiveAnalyzer(session.sampleRate); jam.started = performance.now(); }
      jam.last = 0;
      btn.disabled = false;
      btn.textContent = '⏹ Zuhören stoppen';
      keepAwake(true);
      jam.timer = setInterval(jamTick, 150);
    }).catch(function (err) {
      btn.disabled = false;
      toast(micErrorText(err), 6000);
    });
  }
  function stopJam() {
    if (!jam.session) return;
    clearInterval(jam.timer);
    jam.session.stop();
    jam.session = null;
    keepAwake(false);
    $('jam-btn').textContent = '▶ Zuhören starten';
    $('jam-meter').style.width = '0';
  }
  function resetJam() {
    if (jam.live) jam.live.reset();
    jam.live = jam.session ? new D.LiveAnalyzer(jam.session.sampleRate) : null;
    jam.started = performance.now();
    jam.current = null; jam.cand = null; jam.history = [];
    $('jam-key').textContent = '–'; $('jam-info').textContent = ''; $('jam-alt').textContent = '';
    $('jam-chord').textContent = '–'; $('jam-note').textContent = '–';
    $('jam-conf').style.width = '0';
    $('jam-use').disabled = true; $('jam-save').disabled = true;
    renderJamHistory();
  }
  function sameKey(a, b) { return a && b && a.tonic === b.tonic && a.scale === b.scale; }
  function jamTick() {
    var now = performance.now();
    var dt = jam.last ? (now - jam.last) / 1000 : 0.15;
    jam.last = now;
    var out = jam.live.push(jam.recent.get(), dt);
    var shown = jam.current || out.key;
    $('jam-chord').textContent = out.chord ? chordLabel(out.chord, shown) : '–';
    $('jam-note').textContent = out.note != null ? T.noteName(out.note, shown ? keyFlats(shown) : false) : '–';
    if (!out.key) { $('jam-info').textContent = out.active ? 'Hört zu …' : 'Warte auf Musik …'; return; }
    // Neue Tonart erst übernehmen, wenn sie ~3 Sekunden stabil ist
    if (!sameKey(out.key, jam.cand)) { jam.cand = out.key; jam.candSince = now; }
    if (!sameKey(jam.cand, jam.current) && (now - jam.candSince > 3000 || !jam.current)) {
      jam.current = { tonic: jam.cand.tonic, scale: jam.cand.scale };
      jam.history.push({ tonic: jam.current.tonic, scale: jam.current.scale, t: (now - jam.started) / 1000 });
      renderJamHistory();
    }
    if (jam.current) {
      $('jam-key').textContent = T.keyName(jam.current);
      $('jam-info').textContent = T.SCALE_INFO[jam.current.scale];
      $('jam-conf').style.width = Math.round((out.key.confidence || 0) * 100) + '%';
      $('jam-alt').textContent = 'Auch möglich: ' + out.keyAlternatives.filter(function (k) { return !sameKey(k, jam.current); }).slice(0, 2).map(function (k) { return T.keyName(k); }).join(', ');
      $('jam-use').disabled = false; $('jam-save').disabled = false;
    }
  }
  function renderJamHistory() {
    var ol = $('jam-history');
    if (!jam.history.length) { ol.innerHTML = '<li class="muted">Noch nichts erkannt.</li>'; return; }
    ol.innerHTML = jam.history.map(function (h) {
      return '<li><span class="t">' + fmtTime(h.t) + '</span>' + esc(T.keyName(h)) + '</li>';
    }).join('');
  }
  $('jam-btn').addEventListener('click', function () { if (jam.session) stopJam(); else startJam(); });
  $('jam-reset').addEventListener('click', resetJam);
  $('jam-use').addEventListener('click', function () { if (jam.current) { setKey(jam.current); showView('scales'); } });
  $('jam-save').addEventListener('click', function () {
    if (!jam.history.length) return;
    var now = Date.now();
    var last = jam.history[jam.history.length - 1];
    var idea = {
      id: uid(), type: 'live', name: 'Jam ' + fmtDate(now), created: now, hasAudio: false, status: 'done',
      key: { tonic: last.tonic, scale: last.scale }, history: jam.history.slice(), memo: ''
    };
    S.persist();
    S.putIdea(idea).then(function () { toast('✔ Verlauf gespeichert (unter „Ideen“)'); refreshIdeas(); });
  });

  /* ---------------- Tonart-Auswahl (überall gleich) ---------------- */

  function renderKeySelect(el, key, onChange, label) {
    var flats = keyFlats(key);
    var h = label ? '<span class="lbl" style="flex-basis:100%">' + esc(label) + '</span>' : '';
    h += '<select aria-label="Grundton">';
    for (var pc = 0; pc < 12; pc++) {
      h += '<option value="' + pc + '"' + (pc === key.tonic ? ' selected' : '') + '>' + esc(T.noteName(pc, flats)) + '</option>';
    }
    h += '</select><select aria-label="Skala / Modus"><optgroup label="Modi">';
    T.SCALE_IDS.forEach(function (id, i) {
      if (i === 7) h += '</optgroup><optgroup label="Weitere Skalen">';
      h += '<option value="' + id + '"' + (id === key.scale ? ' selected' : '') + '>' + esc(T.SCALES[id].name) + '</option>';
    });
    h += '</optgroup></select>';
    el.innerHTML = h;
    if (label) el.style.flexWrap = 'wrap';
    var sels = el.querySelectorAll('select');
    function changed() { onChange({ tonic: +sels[0].value, scale: sels[1].value }); }
    sels[0].addEventListener('change', changed);
    sels[1].addEventListener('change', changed);
  }

  function renderTuningSelect(el, current, onChange, label) {
    var h = '<span class="lbl">' + esc(label || 'Stimmung') + '</span><select aria-label="Stimmung">';
    var group = null;
    T.TUNING_IDS.forEach(function (id) {
      var t = T.TUNINGS[id];
      if (t.group !== group) { h += (group ? '</optgroup>' : '') + '<optgroup label="' + esc(t.group) + '">'; group = t.group; }
      h += '<option value="' + id + '"' + (id === current ? ' selected' : '') + '>' + esc(T.tuningLabel(id)) + '</option>';
    });
    h += '</optgroup></select>';
    el.innerHTML = h;
    el.querySelector('select').addEventListener('change', function () { onChange(this.value); });
  }

  function setTuning(id) {
    prefs.tuning = id;
    T.settings.tuning = id;
    savePrefs();
    scalePos = 0;
    renderAllTuningSelects();
    renderScales(); renderChords(); renderKeysView();
    toast('Stimmung: ' + T.tuningLabel(id));
  }
  function renderAllTuningSelects() {
    document.querySelectorAll('.tuning-select[data-scope="global"]').forEach(function (el) {
      renderTuningSelect(el, prefs.tuning, setTuning);
    });
  }

  var scalePos = 0;
  function setKey(k, quiet) {
    var changed = !sameKey(k, prefs.key);
    prefs.key = { tonic: k.tonic, scale: k.scale };
    savePrefs();
    if (changed) scalePos = 0;
    renderHeader();
    renderScales();
    renderChords();
    renderKeysView();
    if (!quiet && changed) toast('Tonart: ' + T.keyName(prefs.key));
  }
  function renderHeader() { $('key-chip').textContent = T.keyName(prefs.key); }
  $('key-chip').addEventListener('click', function () { showView('scales'); });

  /* ---------------- SKALEN ---------------- */

  var INTERVAL_NAMES = ['1', 'b2', '2', 'b3', '3', '4', '#4/b5', '5', 'b6', '6', 'b7', '7'];

  function renderScales() {
    var key = prefs.key, flats = keyFlats(key);
    document.querySelectorAll('.key-select[data-scope="scales"]').forEach(function (el) { renderKeySelect(el, key, setKey); });
    $('scale-info').textContent = T.SCALE_INFO[key.scale] || '';
    $('scale-notes').innerHTML = T.SCALES[key.scale].intervals.map(function (iv, i) {
      return '<span class="' + (i === 0 ? 'root' : '') + '"><b>' + esc(T.noteName(key.tonic + iv, flats)) + '</b><small>' + INTERVAL_NAMES[iv] + '</small></span>';
    }).join('');
    var positions = T.scalePositions(key, prefs.tuning);
    if (scalePos >= positions.length) scalePos = 0;
    $('positions').innerHTML = positions.map(function (p, i) {
      return '<button type="button" class="chip' + (i === scalePos ? ' on' : '') + '" data-i="' + i + '">Lage ' + (i + 1) + '<small>Bund ' + p.minFret + '–' + p.maxFret + '</small></button>';
    }).join('');
    $('positions').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { scalePos = +b.dataset.i; renderScales(); });
    });
    var pos = positions[scalePos];
    $('scale-tab').textContent = T.tabText(pos.notes, 12, prefs.tuning);
    $('fretboard').innerHTML = fretboardSvg(key, pos);
  }
  $('scale-play').addEventListener('click', function () {
    var pos = T.scalePositions(prefs.key, prefs.tuning)[scalePos];
    var up = pos.notes.map(function (n) { return n.midi; });
    playMidiSeq(up.concat(up.slice(0, -1).reverse()), 0.2);
  });

  // pos = gewählte Lage (hervorgehoben); ohne pos sind alle Skalentöne hervorgehoben
  function fretboardSvg(key, pos) {
    var st = T.strings(prefs.tuning), ns = st.length;
    var frets = 15, left = 50, fw = 46, top = 18, sg = 26;
    var W = left + frets * fw + 12, H = top + (ns - 1) * sg + 34;
    var mid = top + (ns - 1) * sg / 2;
    var pcs = T.scalePcs(key), flats = keyFlats(key);
    var inPos = {};
    if (pos) pos.notes.forEach(function (n) { inPos[n.string + ':' + n.fret] = true; });
    var s = '<svg class="fretboard" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Arial, sans-serif">';
    s += '<rect x="' + left + '" y="' + (top - 6) + '" width="' + (frets * fw) + '" height="' + ((ns - 1) * sg + 12) + '" rx="4" fill="#1b1410"/>';
    [3, 5, 7, 9, 15].forEach(function (f) {
      s += '<circle cx="' + (left + (f - 0.5) * fw) + '" cy="' + mid + '" r="5" fill="#3a2d22"/>';
    });
    s += '<circle cx="' + (left + 11.5 * fw) + '" cy="' + (mid - sg) + '" r="5" fill="#3a2d22"/>';
    s += '<circle cx="' + (left + 11.5 * fw) + '" cy="' + (mid + sg) + '" r="5" fill="#3a2d22"/>';
    for (var f = 0; f <= frets; f++) {
      var x = left + f * fw;
      s += '<line x1="' + x + '" y1="' + (top - 6) + '" x2="' + x + '" y2="' + (top + (ns - 1) * sg + 6) + '" stroke="' + (f === 0 ? '#e9e6df' : '#5a5045') + '" stroke-width="' + (f === 0 ? 4 : 1.5) + '"/>';
      if (f > 0) s += '<text x="' + (left + (f - 0.5) * fw) + '" y="' + (H - 6) + '" fill="#7d7a73" font-size="11" text-anchor="middle">' + f + '</text>';
    }
    for (var str = 0; str < ns; str++) {
      var y = top + (ns - 1 - str) * sg;
      s += '<line x1="' + left + '" y1="' + y + '" x2="' + (left + frets * fw) + '" y2="' + y + '" stroke="#b9b2a6" stroke-width="' + (str < ns / 2 ? 1.9 : 1.4) + '"/>';
      s += '<text x="2" y="' + (y + 4) + '" fill="#7d7a73" font-size="12">' + esc(T.stringLabel(str, prefs.tuning)) + '</text>';
      for (f = 0; f <= frets; f++) {
        var midi = st[str] + f, pc = T.mod12(midi);
        if (pcs.indexOf(pc) < 0) continue;
        var cx = f === 0 ? left - 13 : left + (f - 0.5) * fw;
        var isRoot = pc === key.tonic, act = !pos || inPos[str + ':' + f];
        var fill = act ? (isRoot ? '#ff6a1a' : '#ffb35c') : (isRoot ? '#5a2a10' : '#2c2c2c');
        var tc = act ? '#111' : (isRoot ? '#ffb35c' : '#9a978f');
        s += '<circle cx="' + cx + '" cy="' + y + '" r="10.5" fill="' + fill + '"' + (act ? '' : ' stroke="#444" stroke-width="1"') + '/>';
        s += '<text x="' + cx + '" y="' + (y + 4) + '" fill="' + tc + '" font-size="10" font-weight="700" text-anchor="middle">' + esc(T.noteName(pc, flats)) + '</text>';
      }
    }
    return s + '</svg>';
  }

  /* ---------------- AKKORDE ---------------- */

  function chordDiagram(root, quality) {
    var v = T.chordVoicing(root, quality, prefs.tuning);
    if (!v) return '<div class="muted small" style="padding:20px 0">kein Griffbild</div>';
    var ns = v.length;
    var played = v.filter(function (f) { return f != null && f > 0; });
    var maxF = played.length ? Math.max.apply(null, played) : 0;
    var minF = played.length ? Math.min.apply(null, played) : 0;
    var base = maxF <= 4 ? 1 : minF;
    var l = 14, t = 16, sw = ns > 6 ? 9 : 10, fh = 16;
    var W = l + (ns - 1) * sw + 22, H = 92;
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Arial, sans-serif">';
    for (var f = 0; f <= 4; f++) {
      s += '<line x1="' + l + '" y1="' + (t + f * fh) + '" x2="' + (l + (ns - 1) * sw) + '" y2="' + (t + f * fh) + '" stroke="' + (f === 0 && base === 1 ? '#e9e6df' : '#5a5045') + '" stroke-width="' + (f === 0 && base === 1 ? 3 : 1) + '"/>';
    }
    for (var i = 0; i < ns; i++) s += '<line x1="' + (l + i * sw) + '" y1="' + t + '" x2="' + (l + i * sw) + '" y2="' + (t + 4 * fh) + '" stroke="#9a948a" stroke-width="1"/>';
    if (base > 1) s += '<text x="' + (l + (ns - 1) * sw + 4) + '" y="' + (t + fh * 0.7) + '" fill="#9a978f" font-size="10">' + base + '</text>';
    v.forEach(function (fr, i) {
      var x = l + i * sw;
      if (fr == null) s += '<text x="' + x + '" y="' + (t - 4) + '" fill="#9a978f" font-size="10" text-anchor="middle">×</text>';
      else if (fr === 0) s += '<circle cx="' + x + '" cy="' + (t - 7) + '" r="3" fill="none" stroke="#9a978f"/>';
      else {
        var row = fr - base + 1;
        s += '<circle cx="' + x + '" cy="' + (t + (row - 0.5) * fh) + '" r="4.4" fill="#ffb35c"/>';
      }
    });
    return s + '</svg>';
  }

  function renderChords() {
    var key = prefs.key, flats = keyFlats(key);
    document.querySelectorAll('.key-select[data-scope="chords"]').forEach(function (el) { renderKeySelect(el, key, setKey); });
    document.querySelectorAll('#chord-type button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === prefs.chordType); });
    var dia = T.diatonicChords(key);
    $('chords-from').textContent = dia.scaleId !== key.scale
      ? 'Akkorde aus ' + T.noteName(key.tonic + (T.SCALES[dia.scaleId].intervals[0]), flats) + ' ' + T.SCALES[dia.scaleId].short + ' (passt zur ' + T.SCALES[key.scale].name + ')'
      : '';
    $('diatonic').innerHTML = dia.chords.map(function (c, i) {
      var q = prefs.chordType === 'seventh' ? c.seventh : c.triad;
      return '<div class="chord-card" role="button" tabindex="0" data-i="' + i + '"><div class="roman">' + esc(c.roman) + '</div>' +
        '<div class="name">' + esc(T.noteName(c.root, flats) + q) + '</div>' + chordDiagram(c.root, q) +
        '<button type="button" class="add" data-add="' + i + '" aria-label="Zur Progression hinzufügen">＋</button></div>';
    }).join('');
    $('diatonic').querySelectorAll('.chord-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        var c = dia.chords[+card.dataset.i];
        var ch = { root: c.root, quality: prefs.chordType === 'seventh' ? c.seventh : c.triad };
        if (e.target.dataset.add != null) {
          prefs.progression.push(ch); savePrefs(); renderMyProg();
          toast(chordLabel(ch, key) + ' hinzugefügt', 1200);
        } else playChordNow(ch);
      });
    });
    var sugg = T.progressionsFor(key);
    $('suggestions').innerHTML = sugg.length ? sugg.map(function (p, i) {
      return '<div class="sugg"><div class="sugg-head"><span class="sugg-name">' + esc(p.name) + '</span><span class="sugg-roman">' + esc(p.roman) + '</span></div>' +
        '<div class="sugg-chords">' + p.chords.map(function (c) { return esc(chordLabel(c, key)); }).join(' – ') + '</div>' +
        '<div class="btn-row"><button type="button" class="btn small-btn" data-play="' + i + '">▶</button><button type="button" class="btn ghost small-btn" data-take="' + i + '">Übernehmen</button></div></div>';
    }).join('') : '<p class="muted">Für diese Skala gibt es keine Vorschläge.</p>';
    $('suggestions').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.play != null) playProgression(sugg[+b.dataset.play].chords, prefs.progBpm);
        else { prefs.progression = sugg[+b.dataset.take].chords.slice(); savePrefs(); renderMyProg(); toast('In „Meine Progression“ übernommen'); }
      });
    });
    renderMyProg();
  }

  function renderMyProg(activeIdx) {
    var key = prefs.key, el = $('my-prog');
    if (!prefs.progression.length) {
      el.innerHTML = '<span class="empty">Noch leer – tippe bei einem Akkord oben auf ＋ oder übernimm einen Vorschlag.</span>';
    } else {
      el.innerHTML = prefs.progression.map(function (c, i) {
        return '<button type="button" class="chip' + (i === activeIdx ? ' on' : '') + '" data-i="' + i + '">' + esc(chordLabel(c, key)) + ' <small>✕</small></button>';
      }).join('');
      el.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () { prefs.progression.splice(+b.dataset.i, 1); savePrefs(); renderMyProg(); });
      });
    }
    $('prog-bpm').value = prefs.progBpm;
    $('prog-bpm-val').textContent = prefs.progBpm + ' BPM';
  }

  document.querySelectorAll('#chord-type button').forEach(function (b) {
    b.addEventListener('click', function () { prefs.chordType = b.dataset.v; savePrefs(); renderChords(); });
  });
  $('prog-bpm').addEventListener('input', function () {
    prefs.progBpm = +this.value; $('prog-bpm-val').textContent = prefs.progBpm + ' BPM'; savePrefs();
  });
  $('prog-play').addEventListener('click', function () {
    var btn = this;
    if (btn.dataset.on) { stopSound(); return; }
    if (!prefs.progression.length) { toast('Erst Akkorde hinzufügen.'); return; }
    btn.dataset.on = '1'; btn.textContent = '⏹ Stopp';
    playProgression(prefs.progression, prefs.progBpm, function (i) { renderMyProg(i); }, function () {
      delete btn.dataset.on; btn.textContent = '▶ Abspielen'; renderMyProg();
    });
  });
  $('prog-clear').addEventListener('click', function () { prefs.progression = []; savePrefs(); renderMyProg(); });
  $('prog-save').addEventListener('click', function () {
    if (!prefs.progression.length) { toast('Erst Akkorde hinzufügen.'); return; }
    var now = Date.now(), key = prefs.key;
    var idea = {
      id: uid(), type: 'progression', created: now, hasAudio: false, status: 'done', memo: '',
      name: prefs.progression.map(function (c) { return chordLabel(c, key); }).join(' ') + ' (' + T.keyName(key) + ')',
      key: { tonic: key.tonic, scale: key.scale }, bpm: prefs.progBpm, meter: '4/4',
      progression: prefs.progression.slice()
    };
    S.persist();
    S.putIdea(idea).then(function () { toast('✔ Progression gespeichert (unter „Ideen“)'); refreshIdeas(); });
  });

  /* ---------------- TONARTEN (Übersicht + Blatt) ---------------- */

  var keysMode = null;   // null = Modus der aktuellen Tonart, 'all' = alle
  function renderKeysView() {
    if (!$('keys-list')) return;
    var key = prefs.key;
    var mode = keysMode || key.scale;
    var chips = '<button type="button" class="chip' + (mode === 'all' ? ' on' : '') + '" data-m="all">Alle</button>';
    T.SCALE_IDS.forEach(function (id) {
      chips += '<button type="button" class="chip' + (mode === id ? ' on' : '') + '" data-m="' + id + '">' + esc(T.SCALES[id].short) + '</button>';
    });
    $('keys-modes').innerHTML = chips;
    $('keys-modes').querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { keysMode = b.dataset.m; renderKeysView(); });
    });
    var ids = mode === 'all' ? T.SCALE_IDS : [mode];
    var h = '';
    ids.forEach(function (id) {
      if (ids.length > 1) h += '<div class="keys-group">' + esc(T.SCALES[id].name) + '</div>';
      for (var pc = 0; pc < 12; pc++) {
        var k = { tonic: pc, scale: id }, fl = keyFlats(k);
        var on = pc === key.tonic && id === key.scale;
        h += '<button type="button" class="key-row' + (on ? ' on' : '') + '" data-t="' + pc + '" data-s="' + id + '"><b>' + esc(T.keyName(k)) + '</b><span>' +
          T.scalePcs(k).map(function (n) { return esc(T.noteName(n, fl)); }).join(' ') + '</span></button>';
      }
    });
    $('keys-list').innerHTML = h;
    $('keys-list').querySelectorAll('.key-row').forEach(function (b) {
      b.addEventListener('click', function () {
        setKey({ tonic: +b.dataset.t, scale: b.dataset.s }, true);
        setTimeout(function () { $('sheet').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
      });
    });
    renderSheet();
  }

  function renderSheet() {
    var key = prefs.key, flats = keyFlats(key), tid = prefs.tuning;
    var positions = T.scalePositions(key, tid);
    var dia = T.diatonicChords(key);
    var sugg = T.progressionsFor(key);
    var h = '<div class="card">';
    h += '<div class="sheet-title">' + esc(T.keyName(key)) + '</div>';
    h += '<div class="muted small">' + esc(T.SCALES[key.scale].name) + ' · Stimmung: ' + esc(T.tuningLabel(tid)) + '</div>';
    h += '<p class="scale-info">' + esc(T.SCALE_INFO[key.scale] || '') + '</p>';
    h += '<div class="scale-notes">' + T.SCALES[key.scale].intervals.map(function (iv, i) {
      return '<span class="' + (i === 0 ? 'root' : '') + '"><b>' + esc(T.noteName(key.tonic + iv, flats)) + '</b><small>' + INTERVAL_NAMES[iv] + '</small></span>';
    }).join('') + '</div>';
    h += '<div class="btn-row no-print"><button type="button" class="btn small-btn" data-sheet="print">🖨 Als PDF / Drucken</button>' +
      '<button type="button" class="btn ghost small-btn" data-sheet="share">📤 Als Text teilen</button></div>';
    h += '</div>';

    h += '<div class="card"><h3>Griffbrett</h3><div class="fretboard-wrap">' + fretboardSvg(key, null) + '</div>' +
      '<p class="muted small">Orange = Grundton.</p></div>';

    h += '<div class="card"><h3>Tonleiter – alle Lagen</h3>';
    positions.forEach(function (p, i) {
      h += '<div class="pos-block"><div class="pos-head"><b>Lage ' + (i + 1) + ' · Bund ' + p.minFret + '–' + p.maxFret + '</b>' +
        '<button type="button" class="btn ghost small-btn no-print" data-pos="' + i + '">▶</button></div>' +
        '<pre class="tab">' + esc(T.tabText(p.notes, 12, tid)) + '</pre></div>';
    });
    h += '</div>';

    h += '<div class="card"><h3>Akkorde der Tonart</h3>';
    if (dia.scaleId !== key.scale) {
      h += '<p class="muted small">Akkorde aus ' + esc(T.noteName(key.tonic, flats) + ' ' + T.SCALES[dia.scaleId].short) + ' (passt zur ' + esc(T.SCALES[key.scale].name) + ')</p>';
    }
    [['triad', 'Dreiklänge'], ['seventh', 'Vierklänge']].forEach(function (kind) {
      h += '<div class="sheet-sub">' + kind[1] + '</div><div class="chord-grid">';
      dia.chords.forEach(function (c, i) {
        var q = c[kind[0]];
        h += '<div class="chord-card" role="button" tabindex="0" data-chord="' + i + '" data-kind="' + kind[0] + '"><div class="roman">' + esc(c.roman) + '</div>' +
          '<div class="name">' + esc(T.noteName(c.root, flats) + q) + '</div>' + chordDiagram(c.root, q) + '</div>';
      });
      h += '</div>';
    });
    h += '<p class="muted small no-print">Tippen = anhören</p></div>';

    h += '<div class="card"><h3>Chord Progressions</h3>';
    h += sugg.length ? sugg.map(function (p, i) {
      return '<div class="sugg"><div class="sugg-head"><span class="sugg-name">' + esc(p.name) + '</span><span class="sugg-roman">' + esc(p.roman) + '</span></div>' +
        '<div class="sugg-chords">' + p.chords.map(function (c) { return esc(chordLabel(c, key)); }).join(' – ') + '</div>' +
        '<div class="btn-row no-print"><button type="button" class="btn small-btn" data-play="' + i + '">▶</button>' +
        '<button type="button" class="btn ghost small-btn" data-take="' + i + '">In „Meine Progression“</button></div></div>';
    }).join('') : '<p class="muted">Für diese Skala gibt es keine Vorschläge.</p>';
    h += '</div>';

    var el = $('sheet');
    el.innerHTML = h;
    el.querySelectorAll('[data-pos]').forEach(function (b) {
      b.addEventListener('click', function () {
        var up = positions[+b.dataset.pos].notes.map(function (n) { return n.midi; });
        playMidiSeq(up.concat(up.slice(0, -1).reverse()), 0.2);
      });
    });
    el.querySelectorAll('[data-chord]').forEach(function (c) {
      c.addEventListener('click', function () {
        var ch = dia.chords[+c.dataset.chord];
        playChordNow({ root: ch.root, quality: ch[c.dataset.kind] });
      });
    });
    el.querySelectorAll('[data-play]').forEach(function (b) {
      b.addEventListener('click', function () { playProgression(sugg[+b.dataset.play].chords, prefs.progBpm); });
    });
    el.querySelectorAll('[data-take]').forEach(function (b) {
      b.addEventListener('click', function () {
        prefs.progression = sugg[+b.dataset.take].chords.slice(); savePrefs(); renderMyProg();
        toast('In „Meine Progression“ übernommen (Reiter Akkorde)');
      });
    });
    el.querySelector('[data-sheet="print"]').addEventListener('click', function () { window.print(); });
    el.querySelector('[data-sheet="share"]').addEventListener('click', function () {
      var lines = ['JZo Jam – ' + T.keyName(key), T.SCALES[key.scale].name + ' · ' + T.tuningLabel(tid),
        'Töne: ' + T.scalePcs(key).map(function (n) { return T.noteName(n, flats); }).join(' '), ''];
      positions.forEach(function (p, i) { lines.push('Lage ' + (i + 1) + ' (Bund ' + p.minFret + '–' + p.maxFret + ')', T.tabText(p.notes, 24, tid), ''); });
      lines.push('Akkorde: ' + dia.chords.map(function (c) { return c.roman + ' ' + T.noteName(c.root, flats) + c.triad; }).join(', '), '');
      sugg.forEach(function (p) { lines.push(p.name + ': ' + p.chords.map(function (c) { return chordLabel(c, key); }).join(' – ')); });
      var text = lines.join('\n');
      if (navigator.share) navigator.share({ title: T.keyName(key), text: text }).catch(function () {});
      else downloadBlob(new Blob([text], { type: 'text/plain' }), T.keyName(key) + '.txt');
    });
  }

  /* ---------------- IDEEN ---------------- */

  function refreshIdeas() {
    return S.allIdeas().then(function (list) {
      var el = $('ideas-list');
      if (!list.length) {
        el.innerHTML = '<div class="empty-state"><div class="big">🎶</div><p>Noch keine Ideen gespeichert.</p><p class="small">Nimm im Reiter „Aufnahme“ etwas auf – es landet automatisch hier.</p></div>';
      } else {
        el.innerHTML = list.map(function (idea) {
          var meta = [fmtDate(idea.created, true)];
          if (idea.duration) meta.push(fmtTime(idea.duration));
          if (idea.bpm) meta.push(idea.bpm + ' BPM');
          if (idea.status === 'analyzing') meta.push('wird analysiert …');
          return '<button type="button" class="idea" data-id="' + esc(idea.id) + '"><span class="idea-ico">' + (TYPE_ICON[idea.type] || '🎵') + '</span>' +
            '<span class="idea-main"><span class="idea-name">' + esc(idea.name) + '</span><span class="idea-meta">' + esc(meta.join(' · ')) + '</span></span>' +
            (idea.key ? '<span class="idea-key">' + esc(T.keyName(idea.key)) + '</span>' : '') + '</button>';
        }).join('');
        el.querySelectorAll('.idea').forEach(function (b) {
          b.addEventListener('click', function () { openIdea(b.dataset.id); });
        });
      }
      return S.estimate();
    }).then(function (est) {
      if (est && est.usage != null) {
        $('storage-info').textContent = 'Belegter Speicher: ' + (est.usage / 1048576).toFixed(1) + ' MB';
      }
    }).catch(function (err) {
      $('ideas-list').innerHTML = '<div class="notice">Der Speicher konnte nicht geöffnet werden (' + esc(err && err.message || err) + '). Im privaten Safari-Modus funktioniert das Speichern nicht.</div>';
    });
  }

  function openIdea(id) {
    S.getIdea(id).then(function (idea) {
      if (!idea) return;
      freeUrls();
      renderIdea($('idea-body'), idea);
      openSheet('idea-sheet');
    });
  }

  function openSheet(id) { $(id).classList.remove('hidden'); $(id).scrollTop = 0; }
  function closeSheet(id) {
    $(id).classList.add('hidden');
    if (id === 'idea-sheet') {
      var au = $('idea-body').querySelector('audio');
      if (au) au.pause();
      $('idea-body').dataset.ideaId = '';
      metroStop();
    }
  }
  $('idea-back').addEventListener('click', function () { closeSheet('idea-sheet'); });

  /* ---------------- Einstellungen ---------------- */

  function renderSettings() {
    document.querySelectorAll('#naming button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.v === 'de') === prefs.german);
    });
    $('version-info').textContent = 'JZo Jam Studio · Version ' + VERSION;
  }
  document.querySelectorAll('#naming button').forEach(function (b) {
    b.addEventListener('click', function () {
      prefs.german = b.dataset.v === 'de';
      T.settings.german = prefs.german;
      savePrefs();
      renderSettings(); renderHeader(); renderAllTuningSelects(); renderScales(); renderChords(); renderKeysView(); refreshIdeas();
    });
  });
  $('settings-btn').addEventListener('click', function () { renderSettings(); openSheet('settings-sheet'); });
  $('settings-back').addEventListener('click', function () { closeSheet('settings-sheet'); });

  /* ---------------- Reiter ---------------- */

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    document.querySelectorAll('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === name); });
    closeSheet('idea-sheet');
    closeSheet('settings-sheet');
    window.scrollTo(0, 0);
    if (name === 'ideas') refreshIdeas();
  }
  document.querySelectorAll('#tabbar button').forEach(function (b) {
    b.addEventListener('click', function () { showView(b.dataset.view); });
  });

  // Wenn die App in den Hintergrund geht, Mikrofon sauber beenden
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rec) stopRecording();
      if (jam.session) stopJam();
      metroStop();
    }
  });

  /* ---------------- Start ---------------- */

  renderHeader();
  renderAllTuningSelects();
  renderScales();
  renderChords();
  renderKeysView();
  refreshIdeas();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* offline-Modus nicht verfügbar */ });
  }

  // Für automatische Tests
  window.JZoApp = { showView: showView, setKey: setKey, compressChords: compressChords };
})();
