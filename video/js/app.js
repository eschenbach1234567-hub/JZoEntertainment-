/* JZo Video AI – Oberfläche, aufgebaut wie DaVinci Resolve:
   Seiten Media · Edit · Effects · Color · Fairlight · Deliver (+ KI),
   Resolve-Tastenkürzel, Timeline mit Spuren T/V1/A1.
   Alles läuft im Browser, nichts wird hochgeladen. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtS(t) { return (Math.round(t * 10) / 10).toFixed(1).replace('.', ',') + ' s'; }
  function fps() { return (S.project && S.project.fps) || 30; }
  function tc(t) {   // Timecode wie in Resolve: HH:MM:SS:FF
    var f = Math.round(Math.max(0, t) * fps()), F = fps(), fr = f % F, s = Math.floor(f / F);
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60) + ':' + p2(fr);
  }
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var CMD = IS_MAC ? '⌘' : 'Strg+', ALT = IS_MAC ? '⌥' : 'Alt+';

  var ASPECTS = { '16:9': [960, 540], '9:16': [540, 960], '1:1': [720, 720], '4:5': [720, 900], '2.39:1': [1032, 432] };
  var PAGES = [['media', 'Media', '🗂️'], ['edit', 'Edit', '🎞️'], ['fx', 'Effects', '✨'], ['color', 'Color', '🎨'], ['audio', 'Fairlight', '🎚️'], ['export', 'Deliver', '🚀'], ['ai', 'KI', '🤖']];

  var S = {
    project: null, media: {}, els: {}, time: 0, playing: false, rate: 1, pps: 60, sel: null, page: 'edit',
    selNode: {}, undo: [], redo: [], dirty: true, bypass: false, libCat: 'fx-glitch', libQ: '',
    aiModel: null, aiEffect: null, exporting: null, lastSetScroll: -1, tool: 'select', snap: true, desk: false, clipboard: null
  };
  var R = null;
  var view = $('#view');

  /* ======================= Projekt-Grundlagen ======================= */
  function newProject(aspect) {
    return { id: Store.uid(), name: 'Neues Projekt', aspect: aspect || '16:9', fps: 30, clips: [], audio: [], overlays: [], markers: [], io: {},
      trk: { t: {}, v: {}, a: {} }, master: 1, fadeOut: 0, updated: Date.now() };
  }
  function fixProject(p) {
    p.markers = p.markers || []; p.io = p.io || {}; p.trk = p.trk || { t: {}, v: {}, a: {} }; p.fps = p.fps || 30; if (p.master == null) p.master = 1;
    ['clips', 'audio', 'overlays'].forEach(function (k) { p[k] = p[k] || []; });
    return p;
  }
  function clipDur(c) { return (c.out - c.in) / (c.speed || 1); }
  function layout() {
    var t = 0;
    S.project.clips.forEach(function (c) { c._start = t; t += clipDur(c); });
    S.clipsEnd = t;
  }
  function total() {
    var t = S.clipsEnd || 0;
    S.project.overlays.forEach(function (o) { t = Math.max(t, o.start + o.dur); });
    S.project.audio.forEach(function (a) { t = Math.max(t, a.start + clipDur(a)); });
    return t;
  }
  function clipAt(t) {
    var cs = S.project.clips;
    for (var i = 0; i < cs.length; i++) if (t >= cs[i]._start && t < cs[i]._start + clipDur(cs[i])) return cs[i];
    return null;
  }
  function findClip(id) { return S.project.clips.filter(function (c) { return c.id === id; })[0]; }
  function findOv(id) { return S.project.overlays.filter(function (c) { return c.id === id; })[0]; }
  function findAudio(id) { return S.project.audio.filter(function (c) { return c.id === id; })[0]; }
  function selClip() { return S.sel && S.sel.type === 'clip' ? findClip(S.sel.id) : null; }
  function selOv() { return S.sel && S.sel.type === 'ov' ? findOv(S.sel.id) : null; }
  function selAudio() { return S.sel && S.sel.type === 'audio' ? findAudio(S.sel.id) : null; }
  function curClip() { return selClip() || clipAt(S.time) || (S.project.clips.length && S.time >= S.clipsEnd ? S.project.clips[S.project.clips.length - 1] : S.project.clips[0]) || null; }
  function clipName(c) { if (!c) return ''; if (c.gen) return (LIB.find(LIB.GENERATORS, c.gen.type) || {}).name || 'Generator'; return (S.media[c.mediaId] || {}).name || 'Clip'; }

  function pushUndo() {
    S.undo.push(JSON.stringify(S.project));
    if (S.undo.length > 100) S.undo.shift();
    S.redo = [];
    updateUndoBtns();
  }
  function restore(json) {
    S.project = fixProject(JSON.parse(json)); layout();
    if (S.sel && !(selClip() || selOv() || selAudio())) S.sel = null;
    commit(true);
  }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.project)); restore(S.undo.pop()); toast('Rückgängig'); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.project)); restore(S.redo.pop()); toast('Wiederholt'); }
  function updateUndoBtns() { $('#undo-btn').disabled = !S.undo.length; $('#redo-btn').disabled = !S.redo.length; }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      S.project.updated = Date.now();
      var data = JSON.parse(JSON.stringify(S.project, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }));
      Store.put('projects', data).catch(function () { toast('Speichern fehlgeschlagen – Speicher voll?'); });
      try { localStorage.setItem('jzo-video-last', S.project.id); } catch (e) {}
    }, 500);
  }
  function commit(panelToo) {
    layout(); save(); renderTimeline(); S.dirty = true; updateUndoBtns();
    if (panelToo) renderPanel();
  }

  /* ======================= Medien ======================= */
  function mediaUrl(m) { if (!m.url) m.url = URL.createObjectURL(m.blob); return m.url; }
  function libSrc(src) { if (!src) return ''; if (/^https?:|^data:|^blob:/.test(src)) return src; return src.charAt(0) === '/' ? '..' + src : src; }

  var pool = $('#media-pool');
  function elFor(item) {
    if (item.gen) return genCanvas(item, 0);
    if (S.els[item.id]) return S.els[item.id];
    var m = S.media[item.mediaId]; if (!m) return null;
    var el;
    if (m.kind === 'image') { el = new Image(); el.decoding = 'async'; el.src = mediaUrl(m); el.onload = function () { S.dirty = true; }; }
    else {
      el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
      el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto'; el.src = mediaUrl(m);
      el.addEventListener('seeked', function () { S.dirty = true; });
      el.addEventListener('loadeddata', function () { S.dirty = true; });
      pool.appendChild(el);
      connectAudio(el);
    }
    S.els[item.id] = el;
    return el;
  }
  function dropEl(id) { var el = S.els[id]; if (!el) return; try { el.pause && el.pause(); } catch (e) {} if (el.parentNode) el.parentNode.removeChild(el); delete S.els[id]; }

  /* Generatoren: Bilder ohne Videodatei (Farbe, Verlauf, Countdown …) */
  var GEN = {};
  function genCanvas(c, lt) {
    var g = c.gen, key = JSON.stringify(g) + S.project.aspect, e = GEN[c.id];
    var anim = g.type === 'animgrad' || g.type === 'countdown' || g.type === 'noise';
    if (!e) { e = GEN[c.id] = { cv: document.createElement('canvas') }; }
    if (e.key === key && !anim) return e.cv;
    var a = ASPECTS[S.project.aspect] || ASPECTS['16:9'], W = Math.round(a[0] * 0.67), H = Math.round(a[1] * 0.67), cv = e.cv;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var x = cv.getContext('2d'), c1 = g.c1 || '#ff6a1a', c2 = g.c2 || '#1b1b1b';
    switch (g.type) {
      case 'solid': x.fillStyle = c1; x.fillRect(0, 0, W, H); break;
      case 'black': x.fillStyle = '#000'; x.fillRect(0, 0, W, H); break;
      case 'gradient': var gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2); x.fillStyle = gr; x.fillRect(0, 0, W, H); break;
      case 'animgrad':
        var t2 = lt || 0, ga = x.createLinearGradient(W / 2 + Math.cos(t2 * 0.6) * W, H / 2 + Math.sin(t2 * 0.6) * H, W / 2 - Math.cos(t2 * 0.6) * W, H / 2 - Math.sin(t2 * 0.6) * H);
        ga.addColorStop(0, c1); ga.addColorStop(0.5, '#8b5cf6'); ga.addColorStop(1, c2); x.fillStyle = ga; x.fillRect(0, 0, W, H); break;
      case 'bars':
        ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].forEach(function (col, i) { x.fillStyle = col; x.fillRect(i * W / 7, 0, W / 7 + 1, H * 0.7); });
        ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'].forEach(function (col, i) { x.fillStyle = col; x.fillRect(i * W / 7, H * 0.7, W / 7 + 1, H * 0.08); });
        x.fillStyle = '#00214c'; x.fillRect(0, H * 0.78, W / 4, H * 0.22); x.fillStyle = '#fff'; x.fillRect(W / 4, H * 0.78, W / 4, H * 0.22); x.fillStyle = '#131313'; x.fillRect(W / 2, H * 0.78, W / 2, H * 0.22); break;
      case 'noise':
        var id = x.createImageData(W, H), d = id.data;
        for (var i = 0; i < d.length; i += 4) { var v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
        x.putImageData(id, 0, 0); break;
      case 'countdown':
        var t3 = lt || 0, dur = clipDur(c), n = Math.max(1, Math.ceil(dur - t3)), fr = 1 - ((dur - t3) % 1);
        x.fillStyle = '#222'; x.fillRect(0, 0, W, H);
        x.fillStyle = '#3a3a3a'; x.beginPath(); x.moveTo(W / 2, H / 2); x.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + fr * Math.PI * 2); x.fill();
        x.strokeStyle = '#bbb'; x.lineWidth = H / 90; x.beginPath(); x.arc(W / 2, H / 2, H * 0.33, 0, 6.283); x.stroke(); x.beginPath(); x.arc(W / 2, H / 2, H * 0.4, 0, 6.283); x.stroke();
        x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
        x.fillStyle = '#fff'; x.font = '700 ' + Math.round(H * 0.42) + 'px -apple-system, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), W / 2, H / 2 + H * 0.02); break;
    }
    e.key = key;
    return cv;
  }

  /* Ton läuft über WebAudio: Lautstärke klappt so auch am iPhone, und der Export bekommt den Ton. */
  var AC = null, master = null, exportDest = null;
  function ensureAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
    AC = new Ctx(); master = AC.createGain(); master.connect(AC.destination);
    try { exportDest = AC.createMediaStreamDestination(); master.connect(exportDest); } catch (e) { exportDest = null; }
    Object.keys(S.els).forEach(function (k) { connectAudio(S.els[k]); });
  }
  function connectAudio(el) {
    if (!AC || el._gain || !(el instanceof HTMLMediaElement)) return;
    try { var src = AC.createMediaElementSource(el), g = AC.createGain(); src.connect(g); g.connect(master); el._gain = g; } catch (e) {}
  }
  function setVol(el, v) { v = Math.max(0, v * (S.project.master == null ? 1 : S.project.master)); if (el._gain) el._gain.gain.value = v; else el.volume = clamp(v, 0, 1); }

  /* iPhone-Videos (.mov/HEVC), MP4, QuickTime, HEIC-Fotos usw. */
  var VIDEO_EXT = /\.(mp4|m4v|mov|qt|hevc|3gp|webm|mkv|avi)$/i, IMAGE_EXT = /\.(heic|heif|jpe?g|png|gif|webp|tiff?|bmp|avif)$/i, AUDIO_EXT = /\.(mp3|m4a|wav|aac|aiff?|caf|flac|ogg|opus)$/i;
  var ACCEPT_V = 'video/*,image/*,.mp4,.m4v,.mov,.qt,.hevc,.heic,.heif,.jpg,.jpeg,.png';
  var ACCEPT_A = 'audio/*,.mp3,.m4a,.wav,.aac,.aif,.aiff,.caf,.flac';
  function kindOf(file) {
    var t = file.type || '';
    if (/^image\//.test(t) || (!t && IMAGE_EXT.test(file.name))) return 'image';
    if (/^audio\//.test(t) || (!/^video\//.test(t) && AUDIO_EXT.test(file.name))) return 'audio';
    return 'video';
  }
  function readMeta(file) {
    return new Promise(function (resolve) {
      var kind = kindOf(file);
      var url = URL.createObjectURL(file), rec = { id: Store.uid(), name: file.name.replace(/\.[^.]+$/, ''), kind: kind, blob: file, created: Date.now(), url: url, ext: (file.name.match(/\.(\w+)$/) || [, ''])[1].toLowerCase() };
      var done = function () { resolve(rec); };
      var thumbOf = function (src, w, h) {
        try { var c = document.createElement('canvas'), th = 72; c.height = th; c.width = Math.round(th * w / h) || 128; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); rec.thumb = c.toDataURL('image/jpeg', 0.7); } catch (e) {}
      };
      if (kind === 'image') {
        var im = new Image(); im.onload = function () { rec.w = im.naturalWidth; rec.h = im.naturalHeight; rec.duration = 4; thumbOf(im, rec.w, rec.h); done(); };
        im.onerror = function () { rec.bad = true; done(); }; im.src = url; return;
      }
      var v = document.createElement(kind === 'audio' ? 'audio' : 'video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
      var to = setTimeout(function () { if (!rec.duration) rec.bad = true; done(); }, 15000);
      v.onloadedmetadata = function () {
        rec.duration = isFinite(v.duration) ? v.duration : 10; rec.w = v.videoWidth; rec.h = v.videoHeight;
        if (kind === 'audio' || !rec.w) { clearTimeout(to); if (kind === 'video' && !rec.w) rec.kind = 'audio'; return done(); }
        v.currentTime = Math.min(0.5, rec.duration / 3);
      };
      v.onseeked = function () { clearTimeout(to); thumbOf(v, rec.w || 16, rec.h || 9); v.removeAttribute('src'); v.load(); done(); };
      v.onerror = function () { clearTimeout(to); rec.bad = true; done(); };
      v.src = url;
    });
  }
  function badMsg(f) {
    var safari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Edg/.test(navigator.userAgent);
    if (/\.(heic|heif|mov|hevc)$/i.test(f.name) && !safari) return '„' + f.name + '“: HEIC-/HEVC-Dateien vom iPhone bitte in Safari öffnen – dieser Browser kann sie nicht lesen.';
    return '„' + f.name + '“ kann dieses Gerät nicht abspielen (Format/Codec nicht unterstützt).';
  }
  function storeRec(rec) {
    return Store.put('media', { id: rec.id, name: rec.name, kind: rec.kind, blob: rec.blob, duration: rec.duration, w: rec.w, h: rec.h, thumb: rec.thumb, created: rec.created, ext: rec.ext })
      .catch(function () { toast('Achtung: Datei zu groß zum Speichern auf dem Gerät – sie bleibt nur bis zum Schließen.'); });
  }
  function importFiles(files) {
    if (!files || !files.length) return;
    toast('Wird importiert …', 8000);
    var list = Array.prototype.slice.call(files), chain = Promise.resolve(), added = 0, firstAspect = null;
    pushUndo();
    list.forEach(function (f) {
      chain = chain.then(function () { return readMeta(f); }).then(function (rec) {
        if (rec.bad) { toast(badMsg(f), 6000); return; }
        S.media[rec.id] = rec; added++;
        if (rec.kind === 'audio') S.project.audio.push({ id: Store.uid(), mediaId: rec.id, start: 0, in: 0, out: rec.duration, speed: 1, volume: 0.8 });
        else { if (!S.project.clips.length && !firstAspect && rec.w && rec.h) firstAspect = rec.w / rec.h; S.project.clips.push(makeClip(rec)); }
        return storeRec(rec);
      });
    });
    chain.then(function () {
      // Wie Resolve: das erste Video bestimmt das Format (Hochkant-iPhone-Video → 9:16)
      if (firstAspect && S.project.clips.length === list.length) {
        var asp = firstAspect < 0.7 ? '9:16' : firstAspect < 0.9 ? '4:5' : firstAspect < 1.2 ? '1:1' : '16:9';
        if (asp !== S.project.aspect) { S.project.aspect = asp; sizeView(); toast('Format automatisch auf ' + asp + ' gestellt (wie das Video)', 3500); }
      }
      commit(true);
      if (added) setTimeout(function () { toast(added === 1 ? '1 Datei in die Timeline gelegt' : added + ' Dateien in die Timeline gelegt'); }, firstAspect ? 1800 : 0);
    });
  }
  function makeClip(m) {
    return { id: Store.uid(), mediaId: m.id, in: 0, out: m.kind === 'image' ? 4 : m.duration, speed: 1, volume: 1, fit: 'fit',
      transform: { s: 1, x: 0, y: 0, r: 0 }, effects: [], nodes: [LIB.node('Node 1')], transition: null };
  }
  function makeGen(type) {
    return { id: Store.uid(), gen: { type: type, c1: '#ff6a1a', c2: '#1b1b1b' }, in: 0, out: type === 'countdown' ? 3 : 5, speed: 1, volume: 0, fit: 'fill',
      transform: { s: 1, x: 0, y: 0, r: 0 }, effects: [], nodes: [LIB.node('Node 1')], transition: null };
  }

  /* ======================= Wiedergabe & Bild ======================= */
  function srcTime(c, t) {
    var m = S.media[c.mediaId], st = c.in + (t - c._start) * (c.speed || 1);
    return clamp(st, 0, Math.max(0, ((m && m.duration) || 1e9) - 0.04));
  }
  function trDur(c) { return c.transition && c.transition.type !== 'cut' ? Math.min(c.transition.dur || 1, clipDur(c)) : 0; }
  function frameInfo(t) {
    var cs = S.project.clips;
    for (var i = 0; i < cs.length; i++) {
      var d = trDur(cs[i]); if (!d) continue;
      var a0 = i === 0 ? 0 : cs[i]._start - d / 2;
      if (t >= a0 && t < a0 + d) {
        var tr = LIB.find(S.lib.TRANSITIONS, cs[i].transition.type) || LIB.TRANSITIONS[1];
        return { a: i > 0 ? cs[i - 1] : null, b: cs[i], p: (t - a0) / d, type: tr.type };
      }
    }
    return { a: clipAt(t), b: null };
  }
  function layerFor(c, t) {
    if (!c) return null;
    var hidden = S.project.trk.v.hide;
    if (c.gen) { var cv = genCanvas(c, t - c._start); return { el: cv, w: cv.width, h: cv.height, clip: c, lt: t - c._start, dur: clipDur(c), bypass: S.bypass, hidden: hidden }; }
    var m = S.media[c.mediaId], el = elFor(c); if (!m || !el) return null;
    var ready = m.kind === 'image' ? (el.complete && el.naturalWidth) : el.readyState >= 2;
    return { el: ready ? el : null, w: m.w || 16, h: m.h || 9, clip: c, lt: t - c._start, dur: clipDur(c), bypass: S.bypass };
  }
  function activeOverlays(t) { return S.project.trk.t.hide ? [] : S.project.overlays.filter(function (o) { return t >= o.start && t < o.start + o.dur; }); }

  function syncMedia(t) {
    var fi = frameInfo(t), want = {}, live = S.playing && S.rate > 0;
    if (fi.a) want[fi.a.id] = fi.a; if (fi.b) want[fi.b.id] = fi.b;
    S.project.clips.forEach(function (c) {
      if (c.gen) return;
      var el = elFor(c); if (!el || !(el instanceof HTMLMediaElement)) return;
      if (want[c.id]) {
        var exp = srcTime(c, t);
        setVol(el, (c.disabled || S.project.trk.v.mute) ? 0 : (c.volume == null ? 1 : c.volume));
        if (live) {
          el.playbackRate = clamp((c.speed || 1) * S.rate, 0.0625, 16);
          if (Math.abs(el.currentTime - exp) > 0.3 * Math.max(1, S.rate)) el.currentTime = exp;
          if (el.paused) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - exp) > 0.03 && !el.seeking) el.currentTime = exp;
        }
      } else {
        if (!el.paused) el.pause();
        if (t > c._start - 1.5 && t < c._start && Math.abs(el.currentTime - c.in) > 0.1 && !el.seeking) el.currentTime = c.in;
      }
    });
    S.project.audio.forEach(function (a) {
      var el = elFor(a); if (!el) return;
      var on = t >= a.start && t < a.start + clipDur(a);
      if (on && live) {
        var exp = a.in + (t - a.start) * (a.speed || 1), lt = t - a.start, d = clipDur(a);
        var v = S.project.trk.a.mute ? 0 : (a.volume == null ? 0.8 : a.volume) * Math.min(1, a.fadeIn ? lt / a.fadeIn : 1, a.fadeOut ? (d - lt) / a.fadeOut : 1);
        setVol(el, Math.max(0, v));
        el.playbackRate = clamp((a.speed || 1) * S.rate, 0.0625, 16);
        if (Math.abs(el.currentTime - exp) > 0.3 * Math.max(1, S.rate)) el.currentTime = exp;
        if (el.paused) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else if (!el.paused) el.pause();
    });
    return fi;
  }

  function draw() {
    var t = S.time, fi = syncMedia(t), tt = total(), fade = 1;
    if (S.project.fadeOut && tt > 0) fade = clamp((tt - t) / S.project.fadeOut, 0, 1);
    var la = layerFor(fi.a, t), lb = fi.b ? layerFor(fi.b, t) : null;
    if (S.project.trk.v.hide) { la = la && { el: null, clip: { disabled: true }, lt: 0, dur: 1 }; lb = null; }
    R.render({ a: la, b: lb, p: fi.p, type: fi.type, t: t, fade: fade, overlays: activeOverlays(t), time: t, selected: S.exporting ? null : selOv() });
  }

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (S.playing) {
      var end = S.exporting ? S.exporting.to : total();
      S.time += dt * S.rate;
      if (S.time >= end) { S.time = end; if (S.exporting) finishExport(); else setPlaying(false); }
      if (S.time <= 0 && S.rate < 0) { S.time = 0; setPlaying(false); }
      S.dirty = true;
      followPlayhead();
      if (S.exporting) $('#exp-bar').style.width = clamp((S.time - S.exporting.from) / Math.max(0.01, S.exporting.to - S.exporting.from) * 100, 0, 100) + '%';
    }
    if (S.dirty) { S.dirty = false; draw(); updateTime(); if (S.page === 'color') scope(); }
  }

  function unlockMedia() {   // iPhone: jedes Video einmal im Tipp-Moment freischalten
    ensureAudio();
    Object.keys(S.els).forEach(function (k) {
      var el = S.els[k];
      if (el instanceof HTMLMediaElement && !el._unlocked) {
        el._unlocked = true;
        var p = el.play(); if (p && p.then) p.then(function () { if (!S.playing) el.pause(); }).catch(function () {});
      }
    });
  }
  function setPlaying(on, rate) {
    if (on) {
      if (!S.project.clips.length && !S.project.overlays.length && !S.project.audio.length) { toast('Erst ein Video importieren (Seite „Media“).'); return; }
      S.rate = rate || 1;
      if (S.rate > 0 && S.time >= total() - 0.05) S.time = 0;
      S.project.clips.forEach(elFor); S.project.audio.forEach(elFor);
      unlockMedia();
    } else S.rate = 1;
    S.playing = on;
    $('#play-btn').classList.toggle('on', on);
    $('#play-btn').setAttribute('aria-label', on ? 'Stopp' : 'Abspielen');
    $('#rate').textContent = on && S.rate !== 1 ? (S.rate > 0 ? '▶ ' : '◀ ') + Math.abs(S.rate) + '×' : '';
    if (!on) Object.keys(S.els).forEach(function (k) { var el = S.els[k]; if (el instanceof HTMLMediaElement && !el.paused) el.pause(); });
    S.dirty = true;
  }
  function shuttle(dir) {   // J / L wie in Resolve: mehrfach drücken = schneller
    if (!S.playing || Math.sign(S.rate) !== dir) return setPlaying(true, dir);
    setPlaying(true, clamp(S.rate * 2, -8, 8));
  }
  function seek(t) { S.time = clamp(t, 0, Math.max(total(), 0)); S.dirty = true; followPlayhead(true); }
  function updateTime() { $('#time').textContent = tc(S.time); $('#dur').textContent = tc(total()); }

  function sizeView() {
    var a = ASPECTS[S.project.aspect] || ASPECTS['16:9'];
    if (!S.exporting) R.resize(a[0], a[1]);
    var st = $('.stage'), maxW = st.clientWidth - 8, maxH = st.clientHeight - 8;
    var sc = Math.min(maxW / a[0], maxH / a[1]);
    view.style.width = Math.max(10, Math.floor(a[0] * sc)) + 'px'; view.style.height = Math.max(10, Math.floor(a[1] * sc)) + 'px';
    Object.keys(GEN).forEach(function (k) { GEN[k].key = null; });
    S.dirty = true;
  }

  /* ======================= Timeline ======================= */
  var tl = $('#tl'), tlInner = $('#tl-inner');
  var HEAD = 92;   // Breite der Spurköpfe (Desktop)
  function pad() { return S.desk ? HEAD : tl.clientWidth / 2; }
  function xOf(t) { return pad() + t * S.pps; }
  function tAt(clientX) { var r = tlInner.getBoundingClientRect(); return Math.max(0, (clientX - r.left - pad()) / S.pps); }
  function followPlayhead(force) {
    if (S.desk) {
      var ph = $('#ph'); if (ph) ph.style.left = xOf(S.time) + 'px';
      var x = xOf(S.time), vis0 = tl.scrollLeft + HEAD, vis1 = tl.scrollLeft + tl.clientWidth - 30;
      if (x < vis0 || x > vis1) { var nx = S.playing && S.rate > 0 ? x - HEAD - 20 : x - tl.clientWidth / 2; S.lastSetScroll = Math.max(0, nx); tl.scrollLeft = Math.max(0, nx); }
      return;
    }
    var sx = Math.round(S.time * S.pps);
    if (Math.abs(tl.scrollLeft - sx) >= 1) { S.lastSetScroll = sx; tl.scrollLeft = sx; }
  }
  tl.addEventListener('scroll', function () {
    if (S.desk) return;
    if (S.playing) { if (Math.abs(tl.scrollLeft - S.lastSetScroll) > 3) setPlaying(false); else return; }
    if (Math.abs(tl.scrollLeft - S.lastSetScroll) < 1) return;
    S.lastSetScroll = -1;
    S.time = clamp(tl.scrollLeft / S.pps, 0, total()); S.dirty = true;
  }, { passive: true });

  function lanesFor(items) {
    var lanes = [];
    items.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (o) {
      for (var i = 0; i < lanes.length; i++) if (lanes[i] <= o.start + 0.001) { lanes[i] = o.start + o.dur; o._lane = i; return; }
      o._lane = lanes.length; lanes.push(o.start + o.dur);
    });
    return Math.max(1, lanes.length);
  }
  function ovLabel(o) {
    if (o.kind === 'text') return '𝐓 ' + (o.text || 'Text');
    if (o.kind === 'sticker') return (o.emoji || '🖼️') + ' Sticker';
    var p = LIB.find(LIB.PARTICLES, o.type); return (p ? p.icon + ' ' + p.name : 'Effekt');
  }
  function head(id, label, btns) {
    return '<span class="lane-tag"><b>' + label + '</b>' + (btns || '') + '</span>';
  }
  function trkBtn(trk, key, on, icon, offIcon, title) {
    return '<button type="button" class="tb' + (on ? ' off' : '') + '" data-trk="' + trk + '" data-key="' + key + '" title="' + title + '">' + (on ? offIcon : icon) + '</button>';
  }
  function renderTimeline() {
    var P = pad(), T = total(), W = Math.max(T, 1) * S.pps, trk = S.project.trk;
    tlInner.style.width = (W + P + (S.desk ? tl.clientWidth * 0.6 : P)) + 'px';
    var LH = S.desk ? 30 : 24, nl = lanesFor(S.project.overlays), html = '';
    var stepS = S.pps > 160 ? 1 : S.pps > 60 ? 2 : S.pps > 25 ? 5 : S.pps > 10 ? 10 : 30;
    html += '<div class="ruler" id="ruler">';
    for (var s = 0; s <= T + stepS * 4; s += stepS) html += '<span style="left:' + (P + s * S.pps) + 'px">' + (S.desk ? tc(s).slice(3, 8) : (s >= 60 ? Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : s + 's')) + '</span>';
    var io = S.project.io;
    if (io.in != null || io.out != null) { var i0 = io.in || 0, i1 = io.out != null ? io.out : T; html += '<i class="io-range" style="left:' + xOf(i0) + 'px;width:' + Math.max(2, (i1 - i0) * S.pps) + 'px"></i>'; }
    S.project.markers.forEach(function (m) { html += '<i class="marker" style="left:' + xOf(m.t) + 'px" title="Marker ' + tc(m.t) + '"></i>'; });
    html += '</div>';
    html += '<div class="lane lane-ov' + (trk.t.hide ? ' hid' : '') + '" style="height:' + (nl * LH + 4) + 'px">' + head('t', 'T1', S.desk ? trkBtn('t', 'hide', trk.t.hide, '👁', '🚫', 'Spur aus-/einblenden') : '');
    S.project.overlays.forEach(function (o) {
      var sel = S.sel && S.sel.id === o.id;
      html += '<div class="blk ov k-' + o.kind + (sel ? ' sel' : '') + '" data-ov="' + o.id + '" style="left:' + (P + o.start * S.pps) + 'px;width:' + Math.max(8, o.dur * S.pps) + 'px;top:' + (o._lane * LH + 2) + 'px">' +
        '<span class="lbl">' + esc(ovLabel(o)) + (o.track ? ' 📍' : '') + '</span>' + (sel ? '<i class="hdl r" data-h="ov-r"></i>' : '') + '</div>';
    });
    html += '</div><div class="lane lane-v' + (trk.v.hide ? ' hid' : '') + '">' + head('v', 'V1', S.desk ? trkBtn('v', 'hide', trk.v.hide, '👁', '🚫', 'Video aus-/einblenden') + trkBtn('v', 'mute', trk.v.mute, '🔊', '🔇', 'Clip-Ton stumm') : '');
    S.project.clips.forEach(function (c) {
      var m = S.media[c.mediaId] || {}, sel = S.sel && S.sel.id === c.id, w = clipDur(c) * S.pps;
      var fxn = (c.effects || []).length, graded = (c.nodes || []).some(function (n) { return JSON.stringify(n) !== JSON.stringify(LIB.node(n.name)); });
      var bg = c.gen ? 'background:' + (c.gen.type === 'gradient' || c.gen.type === 'animgrad' ? 'linear-gradient(90deg,' + c.gen.c1 + ',' + c.gen.c2 + ')' : c.gen.type === 'solid' ? c.gen.c1 : '#444') : (m.thumb ? 'background-image:url(' + m.thumb + ')' : '');
      html += '<div class="blk clip' + (sel ? ' sel' : '') + (c.disabled ? ' dis' : '') + '" data-clip="' + c.id + '" style="left:' + (P + c._start * S.pps) + 'px;width:' + Math.max(6, w - 2) + 'px;' + bg + '">' +
        '<span class="lbl">' + esc(clipName(c)) + ((c.speed || 1) !== 1 ? ' · ' + c.speed + '×' : '') + '</span>' +
        '<span class="badges">' + (fxn ? '<b>fx ' + fxn + '</b>' : '') + (graded ? '<b>🎨</b>' : '') + '</span>' +
        (trDur(c) ? '<span class="trmark" title="Übergang" style="width:' + Math.max(8, trDur(c) * S.pps / (S.project.clips.indexOf(c) ? 2 : 1)) + 'px"></span>' : '') +
        (sel ? '<i class="hdl l" data-h="clip-l"></i><i class="hdl r" data-h="clip-r"></i>' : '') + '</div>';
    });
    if (!S.project.clips.length) html += '<div class="lane-empty" style="left:' + P + 'px">Videos & Fotos hier – über „Media“ importieren</div>';
    html += '</div><div class="lane lane-a">' + head('a', 'A1', S.desk ? trkBtn('a', 'mute', trk.a.mute, '🔊', '🔇', 'Musik stumm') : '');
    S.project.audio.forEach(function (a) {
      var m = S.media[a.mediaId] || {}, sel = S.sel && S.sel.id === a.id;
      html += '<div class="blk aud' + (sel ? ' sel' : '') + '" data-aud="' + a.id + '" style="left:' + (P + a.start * S.pps) + 'px;width:' + Math.max(6, clipDur(a) * S.pps) + 'px">' +
        '<span class="lbl">🎵 ' + esc(m.name || 'Musik') + '</span>' + (sel ? '<i class="hdl l" data-h="aud-l"></i><i class="hdl r" data-h="aud-r"></i>' : '') + '</div>';
    });
    html += '</div>';
    if (S.desk) html += '<div class="ph" id="ph"><i></i></div>';
    tlInner.innerHTML = html;
    // wie in Resolve: V1/A1 unten immer im Blick, Titel-Spuren darüber
    var lv = $('.lane-a', tlInner); if (lv) tl.scrollTop = Math.max(0, lv.offsetTop + lv.offsetHeight + 6 - tl.clientHeight);
    followPlayhead();
  }

  /* Einrasten (Snapping, Taste N) */
  function snapPoints(exceptId) {
    var pts = [0, S.time];
    S.project.clips.forEach(function (c) { pts.push(c._start, c._start + clipDur(c)); });
    S.project.overlays.forEach(function (o) { if (o.id !== exceptId) pts.push(o.start, o.start + o.dur); });
    S.project.audio.forEach(function (a) { if (a.id !== exceptId) pts.push(a.start, a.start + clipDur(a)); });
    S.project.markers.forEach(function (m) { pts.push(m.t); });
    return pts;
  }
  function snapT(t, exceptId, len) {
    if (!S.snap) return t;
    var pts = snapPoints(exceptId), th = 10 / S.pps, best = t, bd = th;
    pts.forEach(function (p) {
      if (Math.abs(p - t) < bd) { bd = Math.abs(p - t); best = p; }
      if (len != null && Math.abs(p - (t + len)) < bd) { bd = Math.abs(p - (t + len)); best = p - len; }
    });
    return best;
  }

  var drag = null;
  tlInner.addEventListener('pointerdown', function (e) {
    var tb = e.target.closest('[data-trk]');
    if (tb) { e.stopPropagation(); return; }
    if (e.target.closest('#ruler') && (S.desk || e.pointerType === 'mouse')) {   // Abspielkopf im Lineal ziehen
      e.preventDefault(); if (S.playing) setPlaying(false);
      drag = { kind: 'scrub' }; tlInner.setPointerCapture(e.pointerId); seek(tAt(e.clientX)); return;
    }
    var h = e.target.closest('[data-h]'), blk = e.target.closest('.blk');
    if (S.tool === 'blade') return;
    if (h) {
      e.preventDefault(); e.stopPropagation();
      var b = h.closest('.blk'), id = b.dataset.clip || b.dataset.ov || b.dataset.aud;
      pushUndo();
      drag = { kind: h.dataset.h, id: id, x0: e.clientX, orig: clone(b.dataset.clip ? findClip(id) : b.dataset.ov ? findOv(id) : findAudio(id)) };
      tlInner.setPointerCapture(e.pointerId);
      return;
    }
    if (blk && (blk.classList.contains('sel') || e.pointerType === 'mouse') && (blk.dataset.ov || blk.dataset.aud)) {
      var id2 = blk.dataset.ov || blk.dataset.aud;
      pushUndo();
      drag = { kind: blk.dataset.ov ? 'ov-move' : 'aud-move', id: id2, x0: e.clientX, orig: clone(blk.dataset.ov ? findOv(id2) : findAudio(id2)), moved: false };
      tlInner.setPointerCapture(e.pointerId);
    }
  });
  tlInner.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (drag.kind === 'scrub') { seek(tAt(e.clientX)); return; }
    var dt = (e.clientX - drag.x0) / S.pps, o = drag.orig, it, m;
    if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
    if (!drag.moved) return;
    switch (drag.kind) {
      case 'clip-l': it = findClip(drag.id); it.in = clamp(o.in + dt * o.speed, 0, o.out - 0.2); break;
      case 'clip-r': it = findClip(drag.id); m = S.media[it.mediaId];
        var endT = snapT(o._start + (o.out - o.in) / o.speed + dt, drag.id);
        it.out = clamp(o.in + (endT - o._start) * o.speed, o.in + 0.2, (!m || m.kind === 'image') ? 600 : m.duration); break;
      case 'ov-r': it = findOv(drag.id); it.dur = Math.max(0.2, snapT(o.start + o.dur + dt, drag.id) - o.start); break;
      case 'ov-move': it = findOv(drag.id); it.start = Math.max(0, snapT(o.start + dt, drag.id, o.dur)); break;
      case 'aud-move': it = findAudio(drag.id); it.start = Math.max(0, snapT(o.start + dt, drag.id, (o.out - o.in) / (o.speed || 1))); break;
      case 'aud-l': it = findAudio(drag.id); var nin = clamp(o.in + dt, 0, o.out - 0.2); it.start = Math.max(0, o.start + (nin - o.in)); it.in = nin; break;
      case 'aud-r': it = findAudio(drag.id); it.out = clamp(o.out + dt, o.in + 0.2, S.media[it.mediaId].duration); break;
    }
    layout(); renderTimeline(); S.dirty = true;
  });
  function endDrag() {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.kind === 'scrub') return;
    if (!d.moved) { S.undo.pop(); updateUndoBtns(); if (d.kind === 'ov-move' || d.kind === 'aud-move') return; }
    commit(true);
  }
  tlInner.addEventListener('pointerup', endDrag);
  tlInner.addEventListener('pointercancel', endDrag);
  tlInner.addEventListener('click', function (e) {
    var tb = e.target.closest('[data-trk]');
    if (tb) { pushUndo(); var tr = S.project.trk[tb.dataset.trk]; tr[tb.dataset.key] = !tr[tb.dataset.key]; commit(false); return; }
    if (e.target.closest('[data-h]') || e.target.closest('#ruler')) return;
    var b = e.target.closest('.blk');
    if (S.tool === 'blade' && b) { splitAt(tAt(e.clientX), b.dataset.clip || b.dataset.ov || b.dataset.aud); return; }
    if (!b) {
      if (S.desk && e.target.closest('.lane')) seek(tAt(e.clientX));
      if (S.sel) { S.sel = null; renderTimeline(); renderPanel(); S.dirty = true; }
      return;
    }
    if (b.dataset.clip) select('clip', b.dataset.clip, S.desk ? tAt(e.clientX) : null);
    else if (b.dataset.ov) select('ov', b.dataset.ov);
    else select('audio', b.dataset.aud);
  });
  function select(type, id, at) {
    S.sel = { type: type, id: id };
    if (at != null) seek(at);
    else if (type === 'clip') { var c = findClip(id); if (c && (S.time < c._start || S.time >= c._start + clipDur(c))) seek(c._start + 0.01); }
    else if (type === 'ov') { var o = findOv(id); if (o && (S.time < o.start || S.time >= o.start + o.dur)) seek(o.start + 0.01); }
    if (S.page === 'media' || S.page === 'export') showPage('edit');
    else if (!S.desk && S.page === 'fx' && type !== 'clip') showPage('edit');
    renderTimeline(); renderPanel(); S.dirty = true;
  }
  function zoomTl(f) { S.pps = clamp(S.pps * f, 4, 600); renderTimeline(); }
  function zoomFit() { var T = Math.max(total(), 1); S.pps = clamp((tl.clientWidth - pad() - 40) / T, 4, 600); renderTimeline(); }
  tl.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey || e.altKey) { e.preventDefault(); zoomTl(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }, { passive: false });

  function setTool(t) { S.tool = t; document.body.classList.toggle('blade', t === 'blade'); $$('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); }); }
  function setSnap(v) { S.snap = v; $('#snap-btn').classList.toggle('on', v); }

  /* ======================= Schnitt-Aktionen ======================= */
  function splitAt(t, onlyId) {
    t = t == null ? S.time : t;
    var done = 0, newSel = null;
    pushUndo();
    S.project.clips.slice().forEach(function (c) {
      if (onlyId && c.id !== onlyId) return;
      if (t <= c._start + 0.05 || t >= c._start + clipDur(c) - 0.05) return;
      var cut = srcTime(c, t), n = clone(c);
      n.id = Store.uid(); n.in = cut; n.transition = null; c.out = cut;
      S.project.clips.splice(S.project.clips.indexOf(c) + 1, 0, n); newSel = newSel || n.id; done++;
    });
    S.project.overlays.slice().forEach(function (o) {
      if ((onlyId && o.id !== onlyId) || (!onlyId && selClip())) return;
      if (t <= o.start + 0.05 || t >= o.start + o.dur - 0.05) return;
      var n = clone(o), lt = t - o.start, q = Renderer.ovPos(o, t);
      n.id = Store.uid(); n.start = t; n.dur = o.dur - lt;
      n.keys = [{ t: 0, x: q.x, y: q.y, s: q.s }].concat(o.keys.filter(function (k) { return k.t > lt; }).map(function (k) { return { t: k.t - lt, x: k.x, y: k.y, s: k.s }; }));
      if (!n.track) n.keys = n.keys.slice(0, 1);
      o.dur = lt; S.project.overlays.push(n); done++;
    });
    S.project.audio.slice().forEach(function (a) {
      if ((onlyId && a.id !== onlyId) || (!onlyId && selClip())) return;
      if (t <= a.start + 0.05 || t >= a.start + clipDur(a) - 0.05) return;
      var n = clone(a), cut = a.in + (t - a.start) * (a.speed || 1);
      n.id = Store.uid(); n.start = t; n.in = cut; a.out = cut; S.project.audio.push(n); done++;
    });
    if (!done) { S.undo.pop(); updateUndoBtns(); toast('An dieser Stelle gibt es nichts zu teilen.'); return; }
    if (newSel) S.sel = { type: 'clip', id: newSel };
    commit(true); toast('Geteilt ✂️');
  }
  function deleteSel() {
    if (!S.sel) { toast('Erst etwas in der Timeline anklicken.'); return; }
    pushUndo();
    var id = S.sel.id, arr = S.sel.type === 'clip' ? S.project.clips : S.sel.type === 'ov' ? S.project.overlays : S.project.audio;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr.splice(i, 1); break; }
    dropEl(id); delete GEN[id]; S.sel = null; commit(true); toast('Gelöscht');
  }
  function duplicateSel() {
    if (!S.sel) return;
    pushUndo();
    var id = S.sel.id, n;
    if (S.sel.type === 'clip') { var c = findClip(id); n = clone(c); n.id = Store.uid(); S.project.clips.splice(S.project.clips.indexOf(c) + 1, 0, n); }
    else if (S.sel.type === 'ov') { var o = findOv(id); n = clone(o); n.id = Store.uid(); n.start = o.start + o.dur; S.project.overlays.push(n); }
    else { var a = findAudio(id); n = clone(a); n.id = Store.uid(); n.start = a.start + clipDur(a); S.project.audio.push(n); }
    S.sel.id = n.id; commit(true); toast('Dupliziert');
  }
  function moveClip(dir) {
    var c = selClip(); if (!c) return;
    var cs = S.project.clips, i = cs.indexOf(c), j = i + dir; if (j < 0 || j >= cs.length) return;
    pushUndo(); cs.splice(i, 1); cs.splice(j, 0, c); layout(); seek(c._start + 0.01); commit(true);
  }
  function copySel(cut) {
    if (!S.sel) return toast('Erst etwas anklicken.');
    var it = selClip() || selOv() || selAudio();
    S.clipboard = { type: S.sel.type, item: clone(it) };
    toast(cut ? 'Ausgeschnitten' : 'Kopiert');
    if (cut) deleteSel();
  }
  function paste() {
    var cb = S.clipboard; if (!cb) return toast('Zwischenablage ist leer.');
    pushUndo();
    var n = clone(cb.item); n.id = Store.uid();
    if (cb.type === 'clip') {
      var c = clipAt(S.time), idx = c ? S.project.clips.indexOf(c) + (S.time > c._start + clipDur(c) / 2 ? 1 : 0) : S.project.clips.length;
      S.project.clips.splice(idx, 0, n);
    } else if (cb.type === 'ov') { n.start = S.time; S.project.overlays.push(n); }
    else { n.start = S.time; S.project.audio.push(n); }
    S.sel = { type: cb.type, id: n.id }; commit(true); toast('Eingefügt');
  }
  function pasteAttributes() {   // ⌥V wie in Resolve: Effekte, Grade, Bewegung übernehmen
    var cb = S.clipboard, c = selClip() || clipAt(S.time);
    if (!cb || cb.type !== 'clip') return toast('Erst einen Clip kopieren (' + CMD + 'C).');
    if (!c) return;
    pushUndo();
    c.effects = clone(cb.item.effects || []); c.nodes = clone(cb.item.nodes || []); c.transform = clone(cb.item.transform || { s: 1, x: 0, y: 0, r: 0 }); c.speed = cb.item.speed || 1;
    commit(true); toast('Attribute eingefügt (Effekte, Farbe, Bewegung, Tempo)');
  }
  function toggleDisable() {
    var c = selClip() || clipAt(S.time); if (!c) return;
    pushUndo(); c.disabled = !c.disabled; commit(true); toast(c.disabled ? 'Clip deaktiviert (D)' : 'Clip aktiviert');
  }
  function addDefaultTransition() {
    var cs = S.project.clips; if (!cs.length) return;
    var best = null, bd = 1e9;
    cs.forEach(function (c) { var d = Math.abs(c._start - S.time); if (d < bd) { bd = d; best = c; } });
    pushUndo(); best.transition = { type: 'fade', dur: 1 }; S.sel = { type: 'clip', id: best.id };
    commit(true); toast('Cross Dissolve hinzugefügt');
  }
  function trimToPlayhead(side) {
    var c = clipAt(S.time); if (!c) return;
    pushUndo();
    var cut = srcTime(c, S.time);
    if (side === 'start') c.in = Math.min(cut, c.out - 0.1); else c.out = Math.max(cut, c.in + 0.1);
    commit(true); if (side === 'start') seek(c._start);
  }
  function editPoints() {
    var pts = [0];
    S.project.clips.forEach(function (c) { pts.push(c._start, c._start + clipDur(c)); });
    S.project.overlays.forEach(function (o) { pts.push(o.start, o.start + o.dur); });
    S.project.audio.forEach(function (a) { pts.push(a.start, a.start + clipDur(a)); });
    return pts.sort(function (a, b) { return a - b; });
  }
  function jumpEdit(dir, list) {
    var pts = list || editPoints(), t = S.time;
    if (dir > 0) { for (var i = 0; i < pts.length; i++) if (pts[i] > t + 0.01) return seek(pts[i]); }
    else { for (var j = pts.length - 1; j >= 0; j--) if (pts[j] < t - 0.01) return seek(pts[j]); }
  }
  function toggleMarker() {
    pushUndo();
    var ms = S.project.markers, f = 1 / fps();
    for (var i = 0; i < ms.length; i++) if (Math.abs(ms[i].t - S.time) < f) { ms.splice(i, 1); commit(false); return toast('Marker entfernt'); }
    ms.push({ t: S.time }); ms.sort(function (a, b) { return a.t - b.t; }); commit(false); toast('Marker gesetzt (M)');
  }
  function setIO(k) { pushUndo(); S.project.io[k] = S.time; if (S.project.io.in != null && S.project.io.out != null && S.project.io.out < S.project.io.in) { var x = S.project.io.in; S.project.io.in = S.project.io.out; S.project.io.out = x; } commit(false); toast((k === 'in' ? 'In' : 'Out') + '-Punkt ' + tc(S.time)); }
  function markClip() { var c = clipAt(S.time); if (!c) return; pushUndo(); S.project.io = { in: c._start, out: c._start + clipDur(c) }; commit(false); toast('Clip markiert (X)'); }
  function nudge(dir) {
    var o = selOv() || selAudio(); if (!o) return;
    pushUndo(); o.start = Math.max(0, o.start + dir / fps()); commit(false);
  }
  function speedPrompt() {
    var c = selClip() || clipAt(S.time); if (!c) return;
    var v = prompt('Geschwindigkeit in % (100 = normal, 50 = Zeitlupe, 200 = doppelt):', Math.round((c.speed || 1) * 100));
    if (!v) return; v = parseFloat(String(v).replace(',', '.')); if (!(v > 0)) return;
    pushUndo(); c.speed = clamp(v / 100, 0.1, 16); commit(true);
  }

  /* ======================= Effekte anwenden ======================= */
  function addFx(c, id, amount) {
    var d = LIB.fxById(id); if (!c || !d) return;
    var ex = c.effects.filter(function (f) { return f.fx === id; })[0];
    if (ex) ex.amount = amount != null ? amount : Math.min(1, ex.amount + 0.2);
    else c.effects.push({ fx: id, amount: amount != null ? amount : d.def });
  }
  function addPack(c, id, amount) {
    var p = LIB.find(S.lib.PACKS, id); if (!p || !c) return;
    p.items.forEach(function (it) { addFx(c, it.fx, amount != null ? Math.min(1, it.amount * (amount / 0.6)) : it.amount); });
  }
  function setTransition(c, id) {
    var tr = LIB.find(S.lib.TRANSITIONS, id); if (!c || !tr) return;
    c.transition = tr.type === 0 ? null : { type: tr.id, dur: tr.dur || 1 };
  }
  function applyLook(c, id, intoNode) {
    var lk = LIB.find(S.lib.LOOKS, id); if (!c || !lk) return;
    var idx = intoNode != null ? intoNode : (S.selNode[c.id] || 0);
    if (!c.nodes.length) c.nodes.push(LIB.node('Node 1'));
    var name = c.nodes[idx] ? c.nodes[idx].name : lk.name;
    c.nodes[idx] = LIB.node(name, lk.node);
  }
  function adjustColor(c, adj) {
    if (!c.nodes.length) c.nodes.push(LIB.node('Node 1'));
    var n = c.nodes[S.selNode[c.id] || 0] || c.nodes[0];
    if (adj.temp) n.temp = clamp(n.temp + adj.temp, -1, 1);
    if (adj.exposure) n.exposure = clamp(n.exposure + adj.exposure, -3, 3);
    if (adj.sat) n.sat = clamp(n.sat + adj.sat, 0, 2);
    if (adj.contrast) n.contrast = clamp(n.contrast + adj.contrast, 0.3, 2.5);
  }
  function addOverlay(kind, opts, pos) {
    var o = { id: Store.uid(), kind: kind, start: S.time, dur: 3, keys: [{ t: 0, x: pos ? pos.x : (kind === 'sticker' ? 0.75 : 0.5), y: pos ? pos.y : (kind === 'sticker' ? 0.3 : kind === 'fx' ? 0.62 : 0.5), s: 1 }], track: false, seed: Math.floor(Math.random() * 1e6) };
    for (var k in opts) o[k] = opts[k];
    if (kind === 'fx') { o.dur = 4; o.amount = 1; if (o.type === 'handfire') { o.track = true; o.keys[0].s = 0.8; } if (o.type === 'explosion') o.dur = 2; }
    if (kind === 'text') { o.keys[0].y = pos ? pos.y : (o.style === 'subtitle' ? 0.85 : o.style === 'lower' ? 0.8 : 0.5); }
    var end = total(); if (end > 0 && o.start >= end - 0.1) o.start = Math.max(0, end - o.dur);
    S.project.overlays.push(o);
    S.sel = { type: 'ov', id: o.id };
    return o;
  }
  function insertGen(type) {
    var g = makeGen(type), c = clipAt(S.time), idx = c ? S.project.clips.indexOf(c) + 1 : S.project.clips.length;
    S.project.clips.splice(idx, 0, g); S.sel = { type: 'clip', id: g.id }; layout(); return g;
  }

  /* Ein Bibliotheks-Eintrag anwenden: auf Clip (oder an Bildposition) */
  function applyPayload(p, clip, pos) {
    var c = clip || (S.page === 'color' ? clipAt(S.time) || curClip() : curClip()), needClip = ['fx', 'pack', 'tr', 'look'].indexOf(p.t) >= 0;
    if (needClip && !c) { toast('Erst ein Video importieren.'); return; }
    pushUndo();
    var msg = '';
    switch (p.t) {
      case 'fx': addFx(c, p.id); msg = LIB.fxById(p.id).name + ' auf „' + clipName(c) + '“'; break;
      case 'pack': addPack(c, p.id); msg = 'Paket „' + LIB.find(S.lib.PACKS, p.id).name + '“'; break;
      case 'tr': setTransition(c, p.id); msg = 'Übergang am Anfang von „' + clipName(c) + '“'; break;
      case 'look': applyLook(c, p.id); msg = 'Look „' + LIB.find(S.lib.LOOKS, p.id).name + '“'; break;
      case 'gen': var g = insertGen(p.id); seek(g._start + 0.01); msg = (LIB.find(LIB.GENERATORS, p.id) || {}).name + ' eingefügt'; break;
      case 'part':
        var pd = LIB.find(LIB.PARTICLES, p.id);
        addOverlay('fx', { type: p.id }, pos);
        msg = pd.name + ' eingefügt' + (p.id === 'handfire' ? ' – spule durchs Video und zieh das Feuer immer auf die Hand, die App bewegt es dazwischen mit' : pd.full ? '' : ' – im Bild verschieben');
        break;
      case 'sticker': addOverlay('sticker', { emoji: p.emoji, src: p.src, anim: p.anim || 'pop' }, pos); msg = 'Sticker eingefügt'; break;
      case 'text': addOverlay('text', { text: 'Dein Text', style: p.style, anim: p.style === 'trailer' ? 'zoom' : 'pop', color: '#ffffff' }, pos); msg = 'Titel eingefügt – im Inspector bearbeiten'; break;
    }
    if (c && needClip) S.sel = { type: 'clip', id: c.id };
    commit(true);
    toast(msg, p.id === 'handfire' ? 6000 : 2200);
  }

  /* ---- Kacheln ziehbar machen (Maus sofort, Finger nach kurzem Halten) ---- */
  var ghost = null, dragPayload = null;
  function startGhost(p, x, y, label) {
    dragPayload = p; ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.textContent = label; document.body.appendChild(ghost); moveGhost(x, y);
  }
  function moveGhost(x, y) {
    if (!ghost) return; ghost.style.left = x + 'px'; ghost.style.top = y + 'px';
    $$('.drop-hover').forEach(function (e) { e.classList.remove('drop-hover'); });
    var t = document.elementFromPoint(x, y), b = t && (t.closest('.blk.clip') || t.closest('#view'));
    if (b) b.classList.add('drop-hover');
  }
  function endGhost(x, y) {
    if (!ghost) return;
    ghost.remove(); ghost = null; $$('.drop-hover').forEach(function (e) { e.classList.remove('drop-hover'); });
    var t = document.elementFromPoint(x, y), p = dragPayload; dragPayload = null;
    if (!t) return;
    var b = t.closest('.blk.clip');
    if (b) return applyPayload(p, findClip(b.dataset.clip));
    if (t.closest('.lane-ov') || t.closest('.lane-v')) { if (p.t === 'part' || p.t === 'sticker' || p.t === 'text' || p.t === 'gen') { seek(tAt(x)); return applyPayload(p); } }
    if (t.closest('#view')) { var r = view.getBoundingClientRect(); return applyPayload(p, null, { x: clamp((x - r.left) / r.width, 0, 1), y: clamp((y - r.top) / r.height, 0, 1) }); }
  }
  var mouseDrag = null;
  window.addEventListener('mousemove', function (e) {
    var d = mouseDrag; if (!d) return;
    if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.dragging = true; startGhost(d.p, e.clientX, e.clientY, d.label); }
    if (d.dragging) moveGhost(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', function (e) {
    var d = mouseDrag; if (!d) return; mouseDrag = null;
    if (d.dragging) endGhost(e.clientX, e.clientY); else applyPayload(d.p);
  });
  function bindTiles(root, getPayload) {
    $$('.tile', root).forEach(function (tile) {
      if (tile.classList.contains('file-btn')) return;
      var p = getPayload(tile), label = tile.textContent.trim(), timer = null, dragging = false, down = null;
      tile.addEventListener('mousedown', function (e) { mouseDrag = { p: p, x: e.clientX, y: e.clientY, label: label }; e.preventDefault(); });
      tile.addEventListener('touchstart', function (e) {
        var t = e.touches[0]; down = { x: t.clientX, y: t.clientY, moved: false };
        timer = setTimeout(function () { dragging = true; tile.classList.add('lifted'); startGhost(p, down.x, down.y - 30, label); if (navigator.vibrate) navigator.vibrate(15); }, 320);
      }, { passive: true });
      tile.addEventListener('touchmove', function (e) {
        var t = e.touches[0];
        if (dragging) { e.preventDefault(); moveGhost(t.clientX, t.clientY - 30); down.lx = t.clientX; down.ly = t.clientY - 30; return; }
        if (Math.hypot(t.clientX - down.x, t.clientY - down.y) > 8) { down.moved = true; clearTimeout(timer); }
      }, { passive: false });
      tile.addEventListener('touchend', function (e) {
        clearTimeout(timer); tile.classList.remove('lifted');
        if (dragging) { dragging = false; e.preventDefault(); endGhost(down.lx == null ? down.x : down.lx, down.ly == null ? down.y : down.ly); }
        else if (down && !down.moved) { e.preventDefault(); applyPayload(p); }
        down = null;
      });
    });
  }

  /* ======================= Viewer: Overlays verschieben ======================= */
  var ptrs = {}, ovDrag = null;
  function viewPos(e) { var r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  function hitOverlay(p) {
    var list = activeOverlays(S.time), H = view.height, W = view.width;
    for (var i = list.length - 1; i >= 0; i--) {
      var o = list[i], q = Renderer.ovPos(o, S.time), r = q.s * 0.18 * 0.8;
      var full = o.kind === 'fx' && (LIB.find(LIB.PARTICLES, o.type) || {}).full;
      if (full) continue;
      var dx = (p.x - q.x) * W / H, dy = p.y - q.y;
      if (Math.abs(dx) < r * (o.kind === 'text' ? 4 : 1.1) && Math.abs(dy) < Math.max(r, 0.08)) return o;
    }
    return null;
  }
  function upsertKey(o, lt, x, y, s) {
    if (!o.track) { o.keys = [{ t: 0, x: x, y: y, s: s }]; return; }
    lt = Math.round(lt * 20) / 20;
    for (var i = 0; i < o.keys.length; i++) if (Math.abs(o.keys[i].t - lt) < 0.06) { o.keys[i].x = x; o.keys[i].y = y; o.keys[i].s = s; return; }
    o.keys.push({ t: lt, x: x, y: y, s: s }); o.keys.sort(function (a, b) { return a.t - b.t; });
  }
  view.addEventListener('pointerdown', function (e) {
    ptrs[e.pointerId] = viewPos(e);
    var ids = Object.keys(ptrs);
    if (ids.length === 2 && ovDrag) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; ovDrag.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); ovDrag.s0 = Renderer.ovPos(ovDrag.o, S.time).s; return; }
    var p = ptrs[e.pointerId], o = hitOverlay(p);
    if (!o) { if (selOv()) { S.sel = null; renderTimeline(); renderPanel(); S.dirty = true; } return; }
    if (S.playing) setPlaying(false);
    view.setPointerCapture(e.pointerId);
    if (!S.sel || S.sel.id !== o.id) { S.sel = { type: 'ov', id: o.id }; renderTimeline(); renderPanel(); }
    pushUndo();
    ovDrag = { o: o, p0: p, q0: Renderer.ovPos(o, S.time), moved: false };
    S.dirty = true;
  });
  view.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = viewPos(e);
    if (!ovDrag) return;
    var o = ovDrag.o, ids = Object.keys(ptrs), lt = S.time - o.start, q = Renderer.ovPos(o, S.time);
    if (ids.length >= 2 && ovDrag.pinch0) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], s = clamp(ovDrag.s0 * Math.hypot(a.x - b.x, a.y - b.y) / ovDrag.pinch0, 0.15, 6);
      upsertKey(o, lt, q.x, q.y, s);
    } else {
      var p = ptrs[e.pointerId], nx = clamp(ovDrag.q0.x + p.x - ovDrag.p0.x, -0.2, 1.2), ny = clamp(ovDrag.q0.y + p.y - ovDrag.p0.y, -0.2, 1.2);
      if (!o.track) o.keys = [{ t: 0, x: nx, y: ny, s: o.keys[0].s }]; else upsertKey(o, lt, nx, ny, q.s);
    }
    ovDrag.moved = true; S.dirty = true;
  });
  view.addEventListener('wheel', function (e) {   // Maus: Mausrad über ausgewähltem Element = Größe
    var o = selOv(); if (!o || !e.altKey) return; e.preventDefault();
    var q = Renderer.ovPos(o, S.time); upsertKey(o, S.time - o.start, q.x, q.y, clamp(q.s * (e.deltaY < 0 ? 1.08 : 0.93), 0.15, 6)); S.dirty = true; save();
  }, { passive: false });
  function viewUp(e) {
    delete ptrs[e.pointerId];
    if (!ovDrag || Object.keys(ptrs).length) return;
    if (!ovDrag.moved) { S.undo.pop(); updateUndoBtns(); }
    else { commit(false); if (ovDrag.o.track) renderPanel(); }
    ovDrag = null;
  }
  view.addEventListener('pointerup', viewUp);
  view.addEventListener('pointercancel', viewUp);

  /* ======================= Seiten (wie Resolve) ======================= */
  function showPage(p) {
    S.page = p;
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.page === p); });
    document.body.dataset.page = p;
    if (p !== 'color') S.bypass = false;
    renderPanel(); S.dirty = true;
    setTimeout(sizeView, 0);
  }
  /* Abschnitt in einen Bereich legen: Desktop links/rechts/unten wie Resolve, Handy alles untereinander */
  var AREA = {};
  function put(area, node) {
    if (S.desk) (area === 'left' ? AREA.left : area === 'bottom' ? AREA.bottom : AREA.right).appendChild(node);
    else AREA.right.appendChild(node);
    return node;
  }
  function renderPanel() {
    AREA = { left: $('#left'), right: $('#panel'), bottom: $('#bottom') };
    var keepL = AREA.left.scrollTop, keepR = AREA.right.scrollTop;
    AREA.left.innerHTML = ''; AREA.right.innerHTML = ''; AREA.bottom.innerHTML = '';
    ({ media: pMedia, edit: pEdit, color: pColor, fx: pFx, ai: pAI, export: pExport, audio: pAudio })[S.page]();
    AREA.left.scrollTop = keepL; AREA.right.scrollTop = keepR;
  }

  /* Bausteine */
  function slider(label, val, min, max, step, onInput, fmtFn) {
    var row = document.createElement('label'); row.className = 'sl';
    row.innerHTML = '<span>' + label + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output>' + (fmtFn ? fmtFn(val) : val) + '</output>';
    var inp = $('input', row), out = $('output', row), started = false;
    inp.addEventListener('pointerdown', function () { pushUndo(); started = true; });
    inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (!started) { pushUndo(); started = true; } });
    inp.addEventListener('input', function () { if (!started) { pushUndo(); started = true; } var v = parseFloat(inp.value); out.textContent = fmtFn ? fmtFn(v) : v; onInput(v); S.dirty = true; });
    inp.addEventListener('change', function () { started = false; commit(false); });
    return row;
  }
  function pct(v) { return Math.round(v * 100) + ' %'; }
  function sgn(v) { return (v > 0 ? '+' : '') + (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function card(title, inner, cls) { var d = document.createElement('div'); d.className = 'card' + (cls ? ' ' + cls : ''); d.innerHTML = (title ? '<h3>' + title + '</h3>' : '') + (inner || ''); return d; }

  /* ---------- Media ---------- */
  function pMedia() {
    var ids = Object.keys(S.media);
    var c1 = put('left', card('Media Pool – Importieren', '<div class="btn-row"><label class="btn primary file-btn">🎬 Videos & Fotos<input type="file" id="imp-v" accept="' + ACCEPT_V + '" multiple></label>' +
      '<label class="btn file-btn">🎵 Musik / Ton<input type="file" id="imp-a" accept="' + ACCEPT_A + '" multiple></label></div>' +
      '<p class="muted small">Unterstützt: <b>iPhone-Videos (HEVC/.mov)</b>, <b>MP4</b>, <b>QuickTime (.mov)</b>, M4V, Fotos inkl. <b>HEIC</b>, JPG, PNG und Musik (MP3, M4A, WAV, AIFF). ' +
      (S.desk ? 'Am Mac kannst du Dateien auch einfach aus dem Finder hierher ziehen. ' : '') + 'Alles bleibt auf deinem Gerät.</p>'));
    $('#imp-v', c1).onchange = function () { importFiles(this.files); this.value = ''; };
    $('#imp-a', c1).onchange = function () { importFiles(this.files); this.value = ''; };

    var c3 = put('left', card('Clips (' + ids.length + ')', '<div class="mgrid">' + ids.map(function (id) {
      var m = S.media[id];
      return '<div class="mitem" data-m="' + id + '"><div class="mthumb" style="' + (m.thumb ? 'background-image:url(' + m.thumb + ')' : '') + '">' + (m.kind === 'audio' ? '🎵' : '') + '<small>' + (m.kind === 'image' ? (m.ext || 'Foto').toUpperCase() : tc(m.duration || 0).slice(3)) + '</small></div>' +
        '<span>' + esc(m.name) + '</span><div class="mact"><button class="btn sm" data-add="' + id + '">＋ Timeline</button><button class="btn sm ghost" data-mdel="' + id + '" aria-label="Löschen">🗑</button></div></div>';
    }).join('') + '</div>' + (ids.length ? '' : '<p class="muted">Noch nichts importiert.</p>')));
    $$('[data-add]', c3).forEach(function (b) { b.onclick = function () {
      var m = S.media[b.dataset.add]; pushUndo();
      if (m.kind === 'audio') S.project.audio.push({ id: Store.uid(), mediaId: m.id, start: S.time, in: 0, out: m.duration, speed: 1, volume: 0.8 });
      else S.project.clips.push(makeClip(m));
      commit(true); toast('Zur Timeline hinzugefügt');
    }; });
    $$('[data-mdel]', c3).forEach(function (b) { b.onclick = function () {
      var id = b.dataset.mdel;
      if (S.project.clips.some(function (c) { return c.mediaId === id; }) || S.project.audio.some(function (c) { return c.mediaId === id; })) { toast('Wird im Projekt noch benutzt – erst aus der Timeline löschen.'); return; }
      if (!confirm('Datei aus der App löschen? (Das Original in deinen Fotos bleibt.)')) return;
      Store.del('media', id).then(function () { delete S.media[id]; renderPanel(); });
    }; });

    var c2 = put('right', card('Projekt', '<label class="fld"><span>Name</span><input id="pj-name" value="' + esc(S.project.name) + '"></label>' +
      '<div class="fld"><span>Format</span><div class="seg wrap" id="pj-aspect">' + Object.keys(ASPECTS).map(function (a) {
        return '<button type="button" data-a="' + a + '" class="' + (S.project.aspect === a ? 'on' : '') + '">' + a + (a === '9:16' ? ' 📱' : a === '16:9' ? ' 🖥️' : '') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="fld"><span>Bildrate (Timeline)</span><div class="seg" id="pj-fps">' + [24, 25, 30, 50, 60].map(function (f) { return '<button type="button" data-f="' + f + '" class="' + (fps() === f ? 'on' : '') + '">' + f + '</button>'; }).join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn" id="pj-new" type="button">＋ Neues Projekt</button></div><div id="pj-list" class="list"></div>'));
    $('#pj-name', c2).oninput = function () { S.project.name = this.value || 'Projekt'; save(); $('#pj-title').textContent = S.project.name; };
    $$('#pj-aspect button', c2).forEach(function (b) { b.onclick = function () { pushUndo(); S.project.aspect = b.dataset.a; sizeView(); commit(true); }; });
    $$('#pj-fps button', c2).forEach(function (b) { b.onclick = function () { pushUndo(); S.project.fps = +b.dataset.f; commit(true); }; });
    $('#pj-new', c2).onclick = function () {
      var a = S.project.aspect; S.project = newProject(a); S.undo = []; S.redo = []; S.sel = null; S.time = 0;
      Object.keys(S.els).forEach(dropEl); GEN = {}; commit(true); sizeView(); $('#pj-title').textContent = S.project.name; toast('Neues Projekt angelegt');
    };
    Store.all('projects').then(function (ps) {
      ps.sort(function (a, b) { return b.updated - a.updated; });
      $('#pj-list', c2).innerHTML = ps.map(function (p) {
        return '<div class="li' + (p.id === S.project.id ? ' cur' : '') + '"><span>' + esc(p.name) + '<small>' + new Date(p.updated).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + p.aspect + '</small></span>' +
          (p.id === S.project.id ? '<em>geöffnet</em>' : '<button class="btn sm" data-open="' + p.id + '">Öffnen</button><button class="btn sm ghost" data-del="' + p.id + '" aria-label="Löschen">🗑</button>') + '</div>';
      }).join('');
      $$('[data-open]', c2).forEach(function (b) { b.onclick = function () { openProject(b.dataset.open); }; });
      $$('[data-del]', c2).forEach(function (b) { b.onclick = function () { if (confirm('Projekt wirklich löschen?')) Store.del('projects', b.dataset.del).then(function () { renderPanel(); }); }; });
    });
  }
  function openProject(id) {
    Store.get('projects', id).then(function (p) {
      if (!p) return;
      Object.keys(S.els).forEach(dropEl); GEN = {};
      S.project = fixProject(p); S.undo = []; S.redo = []; S.sel = null; S.time = 0;
      $('#pj-title').textContent = p.name; sizeView(); commit(true); toast('„' + p.name + '“ geöffnet');
    });
  }

  /* ---------- Edit: Inspector (rechts) + Effects Library (links, Desktop) ---------- */
  function pEdit() {
    if (S.desk) library('left');
    inspector('right');
  }
  function inspector(area) {
    var c = selClip(), o = selOv(), a = selAudio();
    if (!c && !o && !a) {
      var d = put(area, card('Inspector', '<p>Klicke in der Timeline einen <b>Clip</b> an, um ihn hier zu bearbeiten.</p>' +
        '<div class="btn-row"><button class="btn" id="q-split">✂️ Teilen am Playhead</button><button class="btn" id="q-text">𝐓 Titel</button><button class="btn" id="q-imp">＋ Medien</button></div>' +
        '<p class="muted small">' + (S.desk ? 'Tastenkürzel wie in DaVinci Resolve – Übersicht mit dem ⌨️-Knopf oben.' : 'Tipp: Unter „Effects“ kannst du Glitches, Zooms, Feuer & Sticker direkt auf Clips ziehen.') + '</p>'));
      $('#q-split', d).onclick = function () { splitAt(); }; $('#q-imp', d).onclick = function () { showPage('media'); };
      $('#q-text', d).onclick = function () { applyPayload({ t: 'text', style: 'outline' }); };
      return;
    }
    if (c) {
      var m = S.media[c.mediaId] || {};
      var d1 = put(area, card('Clip: ' + esc(clipName(c)) + (c.disabled ? ' <em class="tag">deaktiviert</em>' : ''), '<div class="btn-row">' +
        '<button class="btn" id="e-split">✂️ Teilen</button><button class="btn" id="e-dup">⧉ Duplizieren</button>' +
        '<button class="btn" id="e-left" aria-label="Nach vorne">◀</button><button class="btn" id="e-right" aria-label="Nach hinten">▶</button>' +
        '<button class="btn" id="e-dis">' + (c.disabled ? '👁 Aktivieren' : '🚫 Deaktivieren') + '</button><button class="btn danger" id="e-del">🗑 Löschen</button></div>'));
      $('#e-split', d1).onclick = function () { splitAt(S.time, c.id); }; $('#e-dup', d1).onclick = duplicateSel; $('#e-del', d1).onclick = deleteSel;
      $('#e-left', d1).onclick = function () { moveClip(-1); }; $('#e-right', d1).onclick = function () { moveClip(1); };
      $('#e-dis', d1).onclick = toggleDisable;
      if (c.gen) {
        var gc = document.createElement('div'); gc.className = 'fld';
        gc.innerHTML = '<span>Farben</span><div class="btn-row"><input type="color" id="g-c1" value="' + c.gen.c1 + '"><input type="color" id="g-c2" value="' + c.gen.c2 + '"></div>';
        d1.appendChild(gc);
        $('#g-c1', gc).oninput = function () { c.gen.c1 = this.value; S.dirty = true; renderTimeline(); save(); };
        $('#g-c2', gc).oninput = function () { c.gen.c2 = this.value; S.dirty = true; renderTimeline(); save(); };
      }
      var d2 = put(area, card('Länge & Tempo'));
      var maxD = (c.gen || m.kind === 'image') ? 60 : (m.duration || 1);
      d2.appendChild(slider('Start', c.in, 0, maxD, 0.01, function (v) { c.in = Math.min(v, c.out - 0.2); layout(); renderTimeline(); }, fmtS));
      d2.appendChild(slider((c.gen || m.kind === 'image') ? 'Dauer' : 'Ende', c.out, 0.2, maxD, 0.01, function (v) { c.out = Math.max(v, c.in + 0.2); layout(); renderTimeline(); }, fmtS));
      var sp = document.createElement('div'); sp.className = 'fld';
      sp.innerHTML = '<span>Tempo (Retime, Taste R)</span><div class="seg wrap">' + [0.25, 0.5, 0.75, 1, 1.5, 2, 4].map(function (v) { return '<button type="button" data-sp="' + v + '" class="' + ((c.speed || 1) === v ? 'on' : '') + '">' + Math.round(v * 100) + ' %</button>'; }).join('') + '</div>';
      d2.appendChild(sp);
      $$('[data-sp]', sp).forEach(function (b) { b.onclick = function () { pushUndo(); c.speed = parseFloat(b.dataset.sp); commit(true); }; });
      if (!c.gen && m.kind === 'video') d2.appendChild(slider('Lautstärke', c.volume == null ? 1 : c.volume, 0, 2, 0.01, function (v) { c.volume = v; }, pct));

      var d3 = put(area, card('Transform'));
      var fit = document.createElement('div'); fit.className = 'fld';
      fit.innerHTML = '<span>Bildanpassung</span><div class="seg"><button type="button" data-fit="fit" class="' + (c.fit !== 'fill' ? 'on' : '') + '">Einpassen</button><button type="button" data-fit="fill" class="' + (c.fit === 'fill' ? 'on' : '') + '">Füllen</button></div>';
      d3.appendChild(fit);
      $$('[data-fit]', fit).forEach(function (b) { b.onclick = function () { pushUndo(); c.fit = b.dataset.fit; commit(true); }; });
      var tr = c.transform || (c.transform = { s: 1, x: 0, y: 0, r: 0 });
      d3.appendChild(slider('Zoom', tr.s, 0.5, 3, 0.01, function (v) { tr.s = v; }, pct));
      d3.appendChild(slider('Position X', tr.x, -1, 1, 0.005, function (v) { tr.x = v; }, sgn));
      d3.appendChild(slider('Position Y', tr.y, -1, 1, 0.005, function (v) { tr.y = v; }, sgn));
      d3.appendChild(slider('Drehung', tr.r, -180, 180, 1, function (v) { tr.r = v; }, function (v) { return v + '°'; }));

      var cur = c.transition ? LIB.find(S.lib.TRANSITIONS, c.transition.type) : null;
      var d4 = put(area, card('Übergang am Clip-Anfang', '<p class="small">Aktuell: <b>' + (cur ? cur.icon + ' ' + esc(cur.name) : '✂️ Harter Schnitt') + '</b> · alle Übergänge unter „Effects → Video-Übergänge“ (' + CMD + 'T = Cross Dissolve)</p>' +
        '<div class="seg wrap">' + ['cut', 'fade', 'dipblack', 'whip', 'zoomIn', 'glitch', 'flash'].map(function (id) {
          var t = LIB.find(S.lib.TRANSITIONS, id), on = (!c.transition && id === 'cut') || (c.transition && c.transition.type === id);
          return '<button type="button" data-tr="' + id + '" class="' + (on ? 'on' : '') + '">' + t.icon + ' ' + esc(t.name) + '</button>';
        }).join('') + '</div>'));
      $$('[data-tr]', d4).forEach(function (b) { b.onclick = function () { pushUndo(); setTransition(c, b.dataset.tr); commit(true); seek(Math.max(0, c._start - (trDur(c) / 2) - 0.3)); }; });
      if (c.transition) d4.appendChild(slider('Dauer', c.transition.dur, 0.2, 3, 0.05, function (v) { c.transition.dur = v; renderTimeline(); }, fmtS));
      put(area, fxListCard(c));
    }
    if (o) {
      var title = o.kind === 'text' ? 'Titel' : o.kind === 'sticker' ? 'Sticker' : (LIB.find(LIB.PARTICLES, o.type) || {}).name || 'Effekt';
      var d5 = put(area, card(esc(title), '<div class="btn-row"><button class="btn" id="o-dup">⧉ Duplizieren</button><button class="btn danger" id="o-del">🗑 Löschen</button></div>'));
      $('#o-dup', d5).onclick = duplicateSel; $('#o-del', d5).onclick = deleteSel;
      if (o.kind === 'text') {
        var tx = document.createElement('div');
        tx.innerHTML = '<label class="fld"><span>Text</span><textarea id="o-text" rows="2">' + esc(o.text) + '</textarea></label>' +
          '<div class="fld"><span>Stil</span><div class="seg wrap">' + LIB.TEXT_STYLES.map(function (s) { return '<button type="button" data-st="' + s.id + '" class="' + (o.style === s.id ? 'on' : '') + '">' + s.icon + ' ' + s.name + '</button>'; }).join('') + '</div></div>' +
          '<div class="fld"><span>Farbe</span><div class="colors">' + ['#ffffff', '#ffd400', '#ff6a1a', '#ff2d55', '#34c759', '#0a84ff', '#bf5af2', '#000000'].map(function (cl) { return '<button type="button" data-col="' + cl + '" style="background:' + cl + '" class="' + (o.color === cl ? 'on' : '') + '" aria-label="Farbe ' + cl + '"></button>'; }).join('') + '<input type="color" id="o-col" value="' + (o.color || '#ffffff') + '"></div></div>' +
          '<div class="fld"><span>Animation</span><div class="seg wrap">' + LIB.TEXT_ANIMS.map(function (a) { return '<button type="button" data-an="' + a[0] + '" class="' + (o.anim === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') + '</div></div>';
        d5.appendChild(tx);
        var ta = $('#o-text', tx), tstart = false;
        ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
        ta.oninput = function () { if (!tstart) { pushUndo(); tstart = true; } o.text = ta.value; S.dirty = true; renderTimeline(); };
        ta.onchange = function () { tstart = false; commit(false); };
        $$('[data-st]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.style = b.dataset.st; commit(true); }; });
        $$('[data-col]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.color = b.dataset.col; commit(true); }; });
        $('#o-col', tx).onchange = function () { pushUndo(); o.color = this.value; commit(true); };
        $$('[data-an]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.anim = b.dataset.an; commit(true); }; });
      }
      if (o.kind === 'sticker') {
        var an = document.createElement('div'); an.className = 'fld';
        an.innerHTML = '<span>Animation</span><div class="seg wrap">' + LIB.STICKER_ANIMS.map(function (a) { return '<button type="button" data-an="' + a[0] + '" class="' + (o.anim === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') + '</div>';
        d5.appendChild(an);
        $$('[data-an]', an).forEach(function (b) { b.onclick = function () { pushUndo(); o.anim = b.dataset.an; commit(true); }; });
      }
      if (o.kind === 'fx') d5.appendChild(slider('Stärke', o.amount || 1, 0.2, 2, 0.05, function (v) { o.amount = v; delete R.particles[o.id]; }, pct));
      d5.appendChild(slider('Größe', Renderer.ovPos(o, S.time).s, 0.15, 6, 0.01, function (v) { var q = Renderer.ovPos(o, S.time); upsertKey(o, S.time - o.start, q.x, q.y, v); }, pct));
      d5.appendChild(slider('Deckkraft', o.opacity == null ? 1 : o.opacity, 0, 1, 0.01, function (v) { o.opacity = v; }, pct));
      d5.appendChild(slider('Dauer', o.dur, 0.3, Math.max(30, o.dur), 0.1, function (v) { o.dur = v; renderTimeline(); }, fmtS));
      var full = o.kind === 'fx' && (LIB.find(LIB.PARTICLES, o.type) || {}).full;
      if (!full) {
        var kf = document.createElement('div'); kf.className = 'kf-box';
        kf.innerHTML = '<label class="sw"><input type="checkbox" id="o-track"' + (o.track ? ' checked' : '') + '><span></span> <b>Bewegung folgen</b> (Keyframes)</label>' +
          '<p class="muted small">' + (o.track ? '◆ ' + o.keys.length + ' Keyframe(s). So geht\'s: Playhead an eine Stelle → ' + (o.kind === 'fx' ? 'Effekt' : 'Element') + ' im Viewer auf die Hand/das Objekt ziehen → weiterspulen → wieder hinziehen. Dazwischen wird automatisch bewegt.' : 'Einschalten, wenn das Element einer Bewegung folgen soll (z. B. Feuer auf der Hand).') + '</p>' +
          (o.track && o.keys.length > 1 ? '<button class="btn sm" id="o-kclear">Keyframes zurücksetzen</button>' : '');
        d5.appendChild(kf);
        $('#o-track', kf).onchange = function () { pushUndo(); o.track = this.checked; var q = Renderer.ovPos(o, S.time); o.keys = [{ t: o.track ? Math.max(0, S.time - o.start) : 0, x: q.x, y: q.y, s: q.s }]; commit(true); };
        var kc = $('#o-kclear', kf); if (kc) kc.onclick = function () { pushUndo(); var q = Renderer.ovPos(o, S.time); o.keys = [{ t: 0, x: q.x, y: q.y, s: q.s }]; commit(true); };
      }
      var hint = document.createElement('p'); hint.className = 'muted small';
      hint.textContent = full ? 'Dieser Effekt liegt über dem ganzen Bild.' : 'Im Viewer ziehen = verschieben, zwei Finger (oder ' + ALT + 'Mausrad) = größer/kleiner.';
      d5.appendChild(hint);
    }
    if (a) {
      var am = S.media[a.mediaId] || {};
      var d6 = put(area, card('🎵 ' + esc(am.name || 'Musik'), '<div class="btn-row"><button class="btn" id="a-dup">⧉ Duplizieren</button><button class="btn danger" id="a-del">🗑 Löschen</button></div><p class="muted small">Markierten Block in der Timeline ziehen = verschieben, an den Rändern ziehen = kürzen.</p>'));
      $('#a-dup', d6).onclick = duplicateSel; $('#a-del', d6).onclick = deleteSel;
      d6.appendChild(slider('Lautstärke', a.volume == null ? 0.8 : a.volume, 0, 2, 0.01, function (v) { a.volume = v; }, pct));
      d6.appendChild(slider('Einblenden', a.fadeIn || 0, 0, 5, 0.1, function (v) { a.fadeIn = v; }, fmtS));
      d6.appendChild(slider('Ausblenden', a.fadeOut || 0, 0, 5, 0.1, function (v) { a.fadeOut = v; }, fmtS));
    }
  }
  function fxListCard(c) {
    var d = card('Effekte auf diesem Clip');
    if (!c.effects.length) { d.innerHTML += '<p class="muted small">Noch keine. Aus der Effects Library anklicken oder auf den Clip ziehen.</p>'; return d; }
    c.effects.forEach(function (f, i) {
      var def = LIB.fxById(f.fx); if (!def) return;
      var row = slider(def.icon + ' ' + def.name, f.amount, 0, 1, 0.01, function (v) { f.amount = v; }, pct);
      var x = document.createElement('button'); x.className = 'xbtn'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Effekt entfernen');
      x.onclick = function (e) { e.preventDefault(); pushUndo(); c.effects.splice(i, 1); commit(true); };
      row.appendChild(x); d.appendChild(row);
    });
    var clr = document.createElement('button'); clr.className = 'btn sm ghost'; clr.textContent = 'Alle Effekte entfernen';
    clr.onclick = function () { pushUndo(); c.effects = []; commit(true); };
    d.appendChild(clr);
    return d;
  }

  /* ---------- Effects Library (aufgebaut wie in Resolve) ---------- */
  function libCats() {
    return [['tr', '🔀 Video-Übergänge'], ['title', '𝐓 Titel'], ['gen', '🟧 Generatoren']]
      .concat(LIB.FX_CATS.map(function (c) { return ['fx-' + c[0], (LIB.FX.filter(function (f) { return f.cat === c[0]; })[0] || {}).icon + ' ' + c[1]]; }))
      .concat([['packs', '📦 Effekt-Pakete'], ['part', '🔥 Partikel (Fusion)'], ['stick', '😎 Sticker & Cliparts']]);
  }
  function libItems(cat) {
    switch (cat) {
      case 'tr': return S.lib.TRANSITIONS.map(function (p) { return { p: { t: 'tr', id: p.id }, icon: p.icon, name: p.name, sub: p.cat, custom: p.custom }; });
      case 'title': return LIB.TEXT_STYLES.map(function (s) { return { p: { t: 'text', style: s.id }, icon: s.icon, name: s.name }; });
      case 'gen': return LIB.GENERATORS.map(function (g) { return { p: { t: 'gen', id: g.id }, icon: g.icon, name: g.name }; });
      case 'packs': return S.lib.PACKS.map(function (p) { return { p: { t: 'pack', id: p.id }, icon: p.icon || '📦', name: p.name, custom: p.custom }; });
      case 'part': return LIB.PARTICLES.map(function (p) { return { p: { t: 'part', id: p.id }, icon: p.icon, name: p.name }; });
      case 'stick': return S.lib.STICKERS.map(function (s) { return { p: { t: 'sticker', emoji: s.emoji, src: s.src, anim: s.anim }, icon: s.src ? '<img src="' + esc(s.src) + '" alt="">' : s.emoji, name: s.src ? s.name : '', custom: s.custom, raw: true }; });
      case 'looks': return S.lib.LOOKS.map(function (l) { return { p: { t: 'look', id: l.id }, icon: l.icon, name: l.name, custom: l.custom }; });
    }
    if (cat.indexOf('fx-') === 0) return LIB.FX.filter(function (f) { return f.cat === cat.slice(3); }).map(function (f) { return { p: { t: 'fx', id: f.id }, icon: f.icon, name: f.name }; });
    return [];
  }
  function library(area) {
    var cats = libCats(), q = S.libQ.trim().toLowerCase(), items;
    if (q) {
      items = [];
      cats.concat([['looks', '']]).forEach(function (c) { libItems(c[0]).forEach(function (it) { if (it.name && it.name.toLowerCase().indexOf(q) >= 0) items.push(it); }); });
    } else items = libItems(S.libCat);
    var c = curClip();
    var top = put(area, card(S.desk ? 'Effects Library' : '', '<input type="search" id="lib-q" class="search" placeholder="🔍 Effekt suchen (z. B. Glitch, Zoom, Feuer)" value="' + esc(S.libQ) + '">' +
      '<div class="chips' + (S.desk ? ' wrap' : '') + '">' + cats.map(function (k) { return '<button type="button" data-cat="' + k[0] + '" class="' + (!q && S.libCat === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small">' + (['part', 'stick', 'title', 'gen'].indexOf(S.libCat) >= 0 && !q ? 'Anklicken = am Playhead einfügen. Ziehen = genau an eine Stelle im Viewer oder in der Timeline.' :
        'Anklicken = auf ' + (c ? '„' + esc(clipName(c)) + '“' : 'den Clip') + ' anwenden. Oder auf einen Clip in der Timeline ziehen.') + '</p>', 'lib-head'));
    var qi = $('#lib-q', top);
    qi.addEventListener('keydown', function (e) { e.stopPropagation(); });
    qi.oninput = function () { S.libQ = this.value; var pos = this.selectionStart; renderPanel(); var n = $('#lib-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    $$('[data-cat]', top).forEach(function (b) { b.onclick = function () { S.libCat = b.dataset.cat; S.libQ = ''; renderPanel(); }; });
    var html = items.map(function (it, i) { return '<button type="button" class="tile" data-i="' + i + '" title="' + esc(it.name) + '"><i>' + (it.raw ? it.icon : esc(it.icon)) + '</i>' + esc(it.name) + (it.custom ? '<em>Admin</em>' : it.sub ? '<em class="sub">' + esc(it.sub) + '</em>' : '') + '</button>'; }).join('');
    if (!q && S.libCat === 'stick') html += '<label class="tile file-btn"><i>🖼️</i>Eigenes Bild<input type="file" id="st-up" accept="image/*,.heic,.png"></label>';
    var grid = put(area, card('', items.length || !q ? '<div class="tiles big">' + html + '</div>' : '<p class="muted">Nichts gefunden.</p>'));
    bindTiles(grid, function (t) { return items[+t.dataset.i].p; });
    var up = $('#st-up', grid);
    if (up) up.onchange = function () {
      var f = this.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { applyPayload({ t: 'sticker', src: r.result, anim: 'pop' }); }; r.readAsDataURL(f);
    };
    return grid;
  }
  function pFx() {
    library(S.desk ? 'left' : 'right');
    if (S.desk) inspector('right');
    else { var c = curClip(); if (c && S.libCat.indexOf('fx-') === 0 || (c && S.libCat === 'packs')) put('right', fxListCard(c)); }
  }

  /* ---------- Color (wie Resolve: Nodes oben rechts, Räder unten, LUTs links) ---------- */
  var gradeClipboard = null;
  function pColor() {
    var c = colorClip();
    if (!c) { put('right', card('Color', '<p>Erst ein Video importieren – dann kannst du hier wie in DaVinci Resolve graden.</p>')); return; }
    if (!c.nodes.length) c.nodes.push(LIB.node('Node 1'));
    var ni = clamp(S.selNode[c.id] || 0, 0, c.nodes.length - 1); S.selNode[c.id] = ni;
    var n = c.nodes[ni];
    var head = put('right', card('', '<div class="color-head"><b>🎨 ' + esc(clipName(c)) + '</b><label class="sw" title="Grades umgehen (⇧D)"><input type="checkbox" id="c-byp"' + (S.bypass ? ' checked' : '') + '><span></span> Bypass</label></div>' +
      '<div class="nodes" id="nodes"><span class="nio">◀ In</span>' + c.nodes.map(function (x, i) {
        return '<i class="nlink"></i><button type="button" class="node' + (i === ni ? ' sel' : '') + (x.on ? '' : ' off') + '" data-n="' + i + '"><small>' + ('0' + (i + 1)).slice(-2) + '</small>' + esc(x.name) + '</button>';
      }).join('') + '<i class="nlink"></i><span class="nio">Out ▶</span></div>' +
      '<div class="btn-row"><button class="btn sm" id="n-add" title="' + ALT + 'S">＋ Serieller Node</button><button class="btn sm" id="n-tog" title="' + CMD + 'D">' + (n.on ? '⏸ Node aus' : '▶ Node an') + '</button><button class="btn sm" id="n-ren">✎ Name</button><button class="btn sm" id="n-reset">↺ Node zurücksetzen</button><button class="btn sm danger" id="n-del">🗑 Node löschen</button></div>' +
      '<canvas id="scope" width="320" height="110" aria-label="RGB-Parade"></canvas><p class="muted small center">RGB-Parade</p>'));
    $('#c-byp', head).onchange = function () { S.bypass = this.checked; S.dirty = true; };
    $$('[data-n]', head).forEach(function (b) { b.onclick = function () { S.selNode[c.id] = +b.dataset.n; renderPanel(); }; });
    $('#n-add', head).onclick = addNode;
    $('#n-tog', head).onclick = toggleNode;
    $('#n-ren', head).onclick = function () { var v = prompt('Name für den Node:', n.name); if (v) { pushUndo(); n.name = v.slice(0, 18); commit(true); } };
    $('#n-reset', head).onclick = function () { pushUndo(); c.nodes[ni] = LIB.node(n.name); commit(true); };
    $('#n-del', head).onclick = deleteNode;

    var wheels = put('bottom', card('Primaries – Farbräder', '<div class="wheels">' + [['lift', 'Lift'], ['gamma', 'Gamma'], ['gain', 'Gain'], ['offset', 'Offset']].map(function (w) {
      return '<div class="wheel" data-w="' + w[0] + '"><span>' + w[1] + '</span><canvas width="120" height="120"></canvas></div>';
    }).join('') + '</div><p class="muted small">Punkt im Rad ziehen = Farbe verschieben, Doppelklick = Mitte. Regler darunter = Helligkeit (wie das Rad am Rand in Resolve).</p>', 'wheels-card'));
    $$('.wheel', wheels).forEach(function (wd) {
      var key = wd.dataset.w, cv = $('canvas', wd);
      drawWheel(cv, n[key]);
      wheelInput(cv, n[key], function () { drawWheel(cv, n[key]); S.dirty = true; });
      wd.appendChild(slider('', n[key].m, -1, 1, 0.01, function (v) { n[key].m = v; }, sgn));
    });
    var prim = put('bottom', card('Primaries – Regler', '', 'prim-card'));
    [['exposure', 'Belichtung', -3, 3, 0.01, sgn], ['contrast', 'Kontrast', 0.3, 2.5, 0.01, pct], ['pivot', 'Pivot', 0.1, 0.9, 0.005, sgn],
      ['sat', 'Sättigung', 0, 2, 0.01, pct], ['hue', 'Farbton', -180, 180, 1, function (v) { return v + '°'; }],
      ['temp', 'Temperatur', -1, 1, 0.01, sgn], ['tint', 'Tönung', -1, 1, 0.01, sgn],
      ['highlights', 'Lichter', -1, 1, 0.01, sgn], ['shadows', 'Schatten', -1, 1, 0.01, sgn]].forEach(function (r) {
      prim.appendChild(slider(r[1], n[r[0]], r[2], r[3], r[4], function (v) { n[r[0]] = v; }, r[5]));
    });

    var looks = put('left', card('LUTs & Looks (auf Node ' + ('0' + (ni + 1)).slice(-2) + ')', '<div class="tiles">' + S.lib.LOOKS.map(function (l) { return '<button type="button" class="tile" data-look="' + l.id + '"><i>' + l.icon + '</i>' + esc(l.name) + (l.custom ? '<em>Admin</em>' : '') + '</button>'; }).join('') + '</div>'));
    bindTiles(looks, function (t) { return { t: 'look', id: t.dataset.look }; });
    var tools = put('left', card('Grade übertragen', '<div class="btn-row"><button class="btn" id="g-copy">📋 Kopieren</button><button class="btn" id="g-paste"' + (gradeClipboard ? '' : ' disabled') + '>📥 Einfügen</button><button class="btn" id="g-all">🎬 Auf alle Clips</button><button class="btn danger" id="g-reset">↺ Alles zurücksetzen</button></div>'));
    $('#g-copy', tools).onclick = function () { gradeClipboard = clone(c.nodes); toast('Grade kopiert'); renderPanel(); };
    $('#g-paste', tools).onclick = function () { if (!gradeClipboard) return; pushUndo(); c.nodes = clone(gradeClipboard); commit(true); toast('Grade eingefügt'); };
    $('#g-all', tools).onclick = function () { pushUndo(); var g = clone(c.nodes); S.project.clips.forEach(function (x) { x.nodes = clone(g); }); commit(true); toast('Auf alle Clips übertragen'); };
    $('#g-reset', tools).onclick = resetGrade;
    S.dirty = true;
  }
  function colorClip() { return clipAt(S.time) || curClip(); }
  function addNode() {
    var c = colorClip(); if (!c) return;
    if (c.nodes.length >= 6) return toast('Maximal 6 Nodes');
    var ni = S.selNode[c.id] || 0;
    pushUndo(); c.nodes.splice(ni + 1, 0, LIB.node('Node ' + (c.nodes.length + 1))); S.selNode[c.id] = ni + 1; commit(true); toast('Serieller Node hinzugefügt');
  }
  function toggleNode() { var c = colorClip(); if (!c) return; var n = c.nodes[S.selNode[c.id] || 0]; if (!n) return; pushUndo(); n.on = !n.on; commit(true); toast(n.on ? 'Node an' : 'Node aus'); }
  function deleteNode() {
    var c = colorClip(); if (!c) return; var ni = S.selNode[c.id] || 0;
    pushUndo();
    if (c.nodes.length === 1) c.nodes[0] = LIB.node('Node 1'); else { c.nodes.splice(ni, 1); S.selNode[c.id] = Math.max(0, ni - 1); }
    commit(true); toast('Node gelöscht');
  }
  function resetGrade() { var c = colorClip(); if (!c) return; pushUndo(); c.nodes = [LIB.node('Node 1')]; S.selNode[c.id] = 0; commit(true); toast('Grade zurückgesetzt'); }
  var WHEEL_BG = null;
  function drawWheel(cv, w) {
    var c = cv.getContext('2d'), N = cv.width, r = N / 2 - 4;
    if (!WHEEL_BG) {
      var t = document.createElement('canvas'); t.width = t.height = N; var tc2 = t.getContext('2d'), id = tc2.createImageData(N, N);
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        var dx = (x - N / 2) / r, dy = (N / 2 - y) / r, d = Math.hypot(dx, dy), i = (y * N + x) * 4;
        if (d > 1) continue;
        var a = Math.atan2(dy, dx), k = d * 0.55;
        id.data[i] = 128 + 127 * (Math.cos(a) * k); id.data[i + 1] = 128 + 127 * (Math.cos(a - 2.0944) * k); id.data[i + 2] = 128 + 127 * (Math.cos(a + 2.0944) * k); id.data[i + 3] = 255;
      }
      tc2.putImageData(id, 0, 0); WHEEL_BG = t;
    }
    c.clearRect(0, 0, N, N); c.drawImage(WHEEL_BG, 0, 0);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.beginPath(); c.arc(N / 2, N / 2, r, 0, 6.283); c.stroke();
    c.beginPath(); c.moveTo(N / 2 - 6, N / 2); c.lineTo(N / 2 + 6, N / 2); c.moveTo(N / 2, N / 2 - 6); c.lineTo(N / 2, N / 2 + 6); c.stroke();
    var px = N / 2 + w.x * r, py = N / 2 - w.y * r;
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.arc(px, py, 7, 0, 6.283); c.fill(); c.stroke();
  }
  function wheelInput(cv, w, onCh) {
    var active = false, lastTap = 0;
    function set(e) {
      var r = cv.getBoundingClientRect(), k = (cv.width / 2) / (cv.width / 2 - 4);
      var x = ((e.clientX - r.left) / r.width - 0.5) * 2 * k, y = -((e.clientY - r.top) / r.height - 0.5) * 2 * k;
      var d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
      if (e.shiftKey) { x *= 0.3; y *= 0.3; }
      w.x = x; w.y = y; onCh();
    }
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', function (e) {
      var now = Date.now();
      pushUndo();
      if (now - lastTap < 300) { w.x = 0; w.y = 0; onCh(); commit(false); lastTap = 0; return; }
      lastTap = now; active = true; cv.setPointerCapture(e.pointerId); set(e);
    });
    cv.addEventListener('pointermove', function (e) { if (active) set(e); });
    cv.addEventListener('pointerup', function () { if (active) { active = false; commit(false); } });
  }
  var scopeT = 0, scopeC = null;
  function scope() {
    var cv = $('#scope'); if (!cv) return;
    var now = performance.now(); if (now - scopeT < 120) return; scopeT = now;
    if (!scopeC) { scopeC = document.createElement('canvas'); scopeC.width = 160; scopeC.height = 90; }
    var sc = scopeC.getContext('2d', { willReadFrequently: true }); sc.drawImage(view, 0, 0, 160, 90);
    var d; try { d = sc.getImageData(0, 0, 160, 90).data; } catch (e) { return; }
    var c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.fillStyle = '#16171a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.08)'; for (var g = 0; g <= 4; g++) { c.beginPath(); c.moveTo(0, H * g / 4); c.lineTo(W, H * g / 4); c.stroke(); }
    var cw = W / 3 / 160;
    for (var ch = 0; ch < 3; ch++) {
      c.fillStyle = ['rgba(255,70,70,.35)', 'rgba(70,255,110,.35)', 'rgba(80,150,255,.4)'][ch];
      for (var i = 0; i < d.length; i += 8) { var px = (i / 4) % 160; c.fillRect(ch * W / 3 + px * cw, H - 2 - d[i + ch] / 255 * (H - 4), 1.2, 1.2); }
    }
  }

  /* ---------- Fairlight (Ton) ---------- */
  function pAudio() {
    var trk = S.project.trk;
    var mx = put('right', card('Mixer', '<div class="mix">' +
      '<label class="sw"><input type="checkbox" id="m-v"' + (trk.v.mute ? '' : ' checked') + '><span></span> V1 – Ton der Videos</label>' +
      '<label class="sw"><input type="checkbox" id="m-a"' + (trk.a.mute ? '' : ' checked') + '><span></span> A1 – Musik</label></div>'));
    mx.appendChild(slider('Master', S.project.master == null ? 1 : S.project.master, 0, 2, 0.01, function (v) { S.project.master = v; }, pct));
    $('#m-v', mx).onchange = function () { pushUndo(); trk.v.mute = !this.checked; commit(false); };
    $('#m-a', mx).onchange = function () { pushUndo(); trk.a.mute = !this.checked; commit(false); };
    var vc = put('right', card('Clip-Lautstärken (V1)'));
    var any = false;
    S.project.clips.forEach(function (c) {
      var m = S.media[c.mediaId]; if (!m || m.kind !== 'video') return; any = true;
      vc.appendChild(slider(esc(m.name).slice(0, 16), c.volume == null ? 1 : c.volume, 0, 2, 0.01, function (v) { c.volume = v; }, pct));
    });
    if (!any) vc.innerHTML += '<p class="muted small">Keine Videos mit Ton in der Timeline.</p>';
    var ac = put(S.desk ? 'left' : 'right', card('Musik (A1)', '<label class="btn file-btn">🎵 Musik importieren<input type="file" id="imp-a2" accept="' + ACCEPT_A + '" multiple></label>'));
    $('#imp-a2', ac).onchange = function () { importFiles(this.files); this.value = ''; };
    S.project.audio.forEach(function (a) {
      var m = S.media[a.mediaId] || {}, box = document.createElement('div'); box.className = 'abox';
      box.innerHTML = '<b>🎵 ' + esc(m.name || 'Musik') + '</b> <span class="muted small">ab ' + tc(a.start) + '</span>';
      box.appendChild(slider('Lautstärke', a.volume == null ? 0.8 : a.volume, 0, 2, 0.01, function (v) { a.volume = v; }, pct));
      box.appendChild(slider('Einblenden', a.fadeIn || 0, 0, 5, 0.1, function (v) { a.fadeIn = v; }, fmtS));
      box.appendChild(slider('Ausblenden', a.fadeOut || 0, 0, 5, 0.1, function (v) { a.fadeOut = v; }, fmtS));
      ac.appendChild(box);
    });
  }

  /* ---------- KI ---------- */
  var aiLog = [];
  var aiApi = {
    clips: function () { return S.project.clips; }, sel: selClip,
    addFx: addFx, addPack: addPack, look: function (c, id) { applyLook(c, id); }, adjust: adjustColor,
    transition: setTransition, speed: function (c, v) { c.speed = v; },
    clearFx: function (c) { c.effects = []; }, resetColor: function (c) { c.nodes = [LIB.node('Node 1')]; },
    particle: function (id) { addOverlay('fx', { type: id }); }, text: function (t, st) { addOverlay('text', { text: t, style: st, anim: 'pop', color: '#ffffff' }); },
    sticker: function (e) { addOverlay('sticker', { emoji: e, anim: 'pop' }); }
  };
  function runAI(text) {
    if (!text.trim()) return;
    pushUndo();
    var selBefore = S.sel, r = AI.run(text, aiApi);
    if (!r.done.length) { S.undo.pop(); S.sel = selBefore; updateUndoBtns(); }
    if (r.done.length) commit(false);
    aiLog.unshift({ q: text, done: r.done, gen: r.gen, empty: r.empty });
    if (r.gen) { S.aiEffect = r.gen; var ge = LIB.find(S.lib.AI_EFFECTS, r.gen); if (ge) S.aiModel = modelFor(ge.model).id; }
    renderPanel();
    if (r.done.length) toast('✨ ' + r.done[0]);
  }
  function modelFor(key) {
    var ms = S.lib.AI_MODELS;
    return ms.filter(function (m) { return m.id === key || (m.name || '').toLowerCase() === String(key || '').toLowerCase(); })[0] || ms[0];
  }
  var EXAMPLES = ['Glitch auf den Clip', 'Dynamic Zoom rein', 'Feuer in der Hand', 'Kinolook auf alle Clips', 'Wärmer und mehr Kontrast',
    'Übergang Whip Pan', 'Text "JZo Entertainment"', 'Konfetti', 'Zeitlupe', 'Retro VHS', 'Lens Flare und Glow', 'Flügel wachsen lassen (Higgsfield)'];
  function pAI() {
    var c = curClip();
    var a = put('left', card('✨ Sag einfach, was passieren soll', '<form id="ai-form" class="ai-form"><textarea id="ai-in" rows="2" placeholder="z. B. „Mach einen Glitch und einen Beat-Zoom auf den Clip“ – du kannst auch das Diktier-Mikrofon benutzen"></textarea>' +
      '<button class="btn primary big" type="submit">✨ Ausführen</button></form>' +
      '<div class="chips ex">' + EXAMPLES.map(function (x) { return '<button type="button" data-ex="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<p class="muted small">Wirkt auf ' + (selClip() ? 'den markierten Clip' : c ? 'den Clip am Playhead' : '–') + ' (oder „auf alle Clips“ dazusagen).</p>' +
      '<div class="ai-log">' + aiLog.slice(0, 5).map(function (l) {
        return '<div class="ai-entry"><b>„' + esc(l.q) + '“</b>' + (l.done.length ? '<ul>' + l.done.map(function (d) { return '<li>✅ ' + esc(d) + '</li>'; }).join('') + '</ul>' : '<p>' + (l.empty ? 'Erst ein Video importieren.' : l.gen ? 'Das kann nur generative KI – siehe „Generative KI“ 👉' : 'Das habe ich nicht verstanden. Probier z. B. eines der Beispiele.') + '</p>') + '</div>';
      }).join('') + '</div>'));
    var ain = $('#ai-in', a); ain.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAI(ain.value); } });
    $('#ai-form', a).onsubmit = function (e) { e.preventDefault(); runAI(ain.value); };
    $$('[data-ex]', a).forEach(function (b) { b.onclick = function () { var v = b.dataset.ex.replace(' (Higgsfield)', ''); ain.value = v; runAI(v); }; });

    var models = S.lib.AI_MODELS, mod = modelFor(S.aiModel), eff = LIB.find(S.lib.AI_EFFECTS, S.aiEffect);
    var g = put('right', card('🤖 Generative KI – Higgsfield, Kling, Seedance …',
      '<p class="muted small">Für Effekte, die echt aussehen sollen (Feuer, das die Hand verfolgt, Flügel, Explosionen, Foto zum Leben erwecken). Die App bereitet alles vor, du bestätigst beim Anbieter mit deinem Konto.</p>' +
      '<div class="fld"><span>Modell</span><div class="models">' + models.map(function (m) {
        return '<button type="button" class="model' + (m.id === mod.id ? ' on' : '') + '" data-mod="' + esc(m.id) + '"><b>' + esc(m.name) + '</b><small>' + esc(m.kind || '') + '</small></button>';
      }).join('') + '</div>' + (mod.note ? '<p class="muted small">' + esc(mod.note) + '</p>' : '') + '</div>' +
      '<div class="fld"><span>KI-Effekt</span><div class="tiles">' + S.lib.AI_EFFECTS.map(function (x) { return '<button type="button" class="tile' + (eff && eff.id === x.id ? ' on' : '') + '" data-ae="' + esc(x.id) + '"><i>' + (x.icon || '✨') + '</i>' + esc(x.name) + '</button>'; }).join('') + '</div></div>' +
      '<label class="fld"><span>Beschreibung für die KI (Englisch funktioniert am besten)</span><textarea id="ai-prompt" rows="3">' + esc(eff ? eff.prompt : '') + '</textarea></label>' +
      '<ol class="steps">' +
      '<li><b>Clip sichern:</b> <button class="btn sm" id="g-orig"' + (c && !c.gen ? '' : ' disabled') + '>Originaldatei</button> <button class="btn sm" id="g-cut"' + (c ? '' : ' disabled') + '>Nur geschnittener Teil</button> <button class="btn sm" id="g-frame"' + (c ? '' : ' disabled') + '>Standbild</button></li>' +
      '<li><b>Beschreibung kopieren & ' + esc(mod.name) + ' öffnen:</b> <button class="btn sm primary" id="g-open">📋 Kopieren & öffnen</button></li>' +
      '<li><b>Dort:</b> Clip/Bild hochladen, Beschreibung einfügen, erzeugen, Ergebnis speichern.</li>' +
      '<li><b>Zurückholen:</b> <label class="btn sm file-btn">📥 KI-Ergebnis importieren<input type="file" id="g-imp" accept="' + ACCEPT_V + '"></label> <span class="muted small">' + (selClip() ? 'ersetzt den markierten Clip (Länge, Farbe & Effekte bleiben)' : 'kommt hinten in die Timeline') + '</span></li></ol>'));
    $('#ai-prompt', g).addEventListener('keydown', function (e) { e.stopPropagation(); });
    $$('[data-mod]', g).forEach(function (b) { b.onclick = function () { S.aiModel = b.dataset.mod; renderPanel(); }; });
    $$('[data-ae]', g).forEach(function (b) { b.onclick = function () { S.aiEffect = b.dataset.ae; var x = LIB.find(S.lib.AI_EFFECTS, S.aiEffect); if (x && x.model) S.aiModel = modelFor(x.model).id; renderPanel(); }; });
    $('#g-open', g).onclick = function () {
      var txt = $('#ai-prompt', g).value.trim();
      if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Beschreibung kopiert – beim Anbieter einfügen'); }, function () {});
      window.open(mod.url, '_blank', 'noopener');
    };
    if (c) {
      if (!c.gen) $('#g-orig', g).onclick = function () { var m = S.media[c.mediaId]; shareBlob(m.blob, (m.blob.name || (m.name + (m.kind === 'image' ? '.jpg' : '.mp4')))); };
      $('#g-cut', g).onclick = function () { startExport({ from: c._start, to: c._start + clipDur(c), raw: true, name: 'clip-fuer-ki' }); };
      $('#g-frame', g).onclick = saveFrame;
    }
    $('#g-imp', g).onchange = function () {
      var f = this.files[0]; if (!f) return; this.value = '';
      var target = selClip();
      readMeta(f).then(function (rec) {
        if (rec.bad) return toast(badMsg(f), 6000);
        S.media[rec.id] = rec; storeRec(rec);
        pushUndo();
        if (target) { dropEl(target.id); delete target.gen; target.mediaId = rec.id; target.in = 0; target.out = rec.kind === 'image' ? 4 : rec.duration; toast('Clip durch KI-Ergebnis ersetzt'); }
        else { S.project.clips.push(makeClip(rec)); toast('KI-Ergebnis hinten angefügt'); }
        commit(true);
      });
    };
  }

  /* ---------- Deliver (Export) ---------- */
  var lastExport = null;
  function pExport() {
    var io = S.project.io, hasIO = io.in != null || io.out != null;
    var a = put('left', card('Render-Einstellungen', '<div class="fld"><span>Auflösung</span><div class="seg" id="ex-q">' +
      [['720', '720p'], ['1080', '1080p (Full HD)'], ['2160', '4K (langsam)']].map(function (q) { return '<button type="button" data-q="' + q[0] + '" class="' + ((S.exQ || '1080') === q[0] ? 'on' : '') + '">' + q[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="fld"><span>Bereich</span><div class="seg"><button type="button" data-r="all" class="' + (S.exRange !== 'io' ? 'on' : '') + '">Ganze Timeline</button><button type="button" data-r="io" class="' + (S.exRange === 'io' ? 'on' : '') + '"' + (hasIO ? '' : ' disabled') + '>In/Out-Bereich (I/O)</button></div></div>'));
    a.appendChild(slider('Am Ende ausblenden', S.project.fadeOut || 0, 0, 4, 0.1, function (v) { S.project.fadeOut = v; }, fmtS));
    $$('[data-q]', a).forEach(function (x) { x.onclick = function () { S.exQ = x.dataset.q; renderPanel(); }; });
    $$('[data-r]', a).forEach(function (x) { x.onclick = function () { S.exRange = x.dataset.r; renderPanel(); }; });
    var range = S.exRange === 'io' && hasIO ? { from: io.in || 0, to: io.out != null ? io.out : total() } : { from: 0, to: total() };
    var b = put('right', card('Render', '<button class="btn primary big" id="ex-go">🚀 Video rendern (' + tc(range.to - range.from) + ')</button>' +
      '<p class="muted small">Format: <b>' + (pickMime().indexOf('mp4') >= 0 ? 'MP4 (H.264)' : 'WebM') + '</b>. Das Video wird in Echtzeit aufgenommen – <b>Bildschirm anlassen und die App nicht verlassen</b>, bis es fertig ist. Danach in Fotos sichern oder direkt teilen.</p>' +
      '<div class="btn-row"><button class="btn" id="ex-frame">📸 Standbild sichern</button></div>' +
      (lastExport ? '<div class="result"><video controls playsinline src="' + lastExport.url + '"></video><div class="btn-row"><button class="btn primary" id="ex-share">📤 Sichern / Teilen</button><a class="btn" download="' + esc(lastExport.name) + '" href="' + lastExport.url + '">⬇️ Herunterladen</a></div></div>' : '')));
    $('#ex-go', b).onclick = function () { startExport(range); };
    $('#ex-frame', b).onclick = saveFrame;
    var sh = $('#ex-share', b); if (sh) sh.onclick = function () { shareBlob(lastExport.blob, lastExport.name); };
  }
  function pickMime() {
    var opts = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < opts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    return '';
  }
  function startExport(o) {
    if (!S.project.clips.length && !S.project.overlays.length) return toast('Nichts zum Exportieren.');
    if (!window.MediaRecorder || !view.captureStream) return toast('Dieser Browser kann leider keine Videos aufnehmen. Bitte Safari aktuell halten.');
    if (S.playing) setPlaying(false);
    var asp = ASPECTS[S.project.aspect], q = +(S.exQ || '1080'), sc = q / Math.min(asp[0], asp[1]);
    var w = Math.round(asp[0] * sc / 2) * 2, h = Math.round(asp[1] * sc / 2) * 2;
    ensureAudio();
    var mime = pickMime();
    S.exporting = { from: o.from, to: o.to, chunks: [], name: (o.name || (S.project.name || 'video').replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'video') + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm'), mime: mime, raw: o.raw };
    R.resize(w, h); Object.keys(GEN).forEach(function (k) { GEN[k].key = null; });
    var savedSel = S.sel; S.sel = null;
    var stream = view.captureStream(fps());
    if (exportDest) exportDest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
    var rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: q >= 2160 ? 40e6 : q >= 1080 ? 12e6 : 6e6 } : undefined); }
    catch (e) { S.exporting = null; S.sel = savedSel; sizeView(); return toast('Aufnahme konnte nicht starten: ' + e.message); }
    S.exporting.rec = rec; S.exporting.savedSel = savedSel;
    rec.ondataavailable = function (e) { if (e.data && e.data.size) S.exporting.chunks.push(e.data); };
    rec.onstop = function () {
      var ex = S.exporting; S.exporting = null; $('#exp-overlay').classList.add('hidden');
      S.sel = ex.savedSel; sizeView(); renderTimeline();
      if (ex.cancel) return toast('Export abgebrochen');
      var blob = new Blob(ex.chunks, { type: (ex.mime || 'video/webm').split(';')[0] });
      if (lastExport) URL.revokeObjectURL(lastExport.url);
      lastExport = { blob: blob, url: URL.createObjectURL(blob), name: ex.name };
      if (ex.raw) shareBlob(blob, ex.name);
      showPage('export'); toast('Fertig! 🎉 Jetzt sichern oder teilen.');
    };
    $('#exp-overlay').classList.remove('hidden'); $('#exp-bar').style.width = '0%';
    S.time = o.from; S.rate = 1; S.project.clips.forEach(elFor); S.project.audio.forEach(elFor); unlockMedia();
    S.dirty = true;
    setTimeout(function () { if (!S.exporting) return; rec.start(250); S.playing = true; }, 700);
  }
  function finishExport() {
    S.playing = false; Object.keys(S.els).forEach(function (k) { var el = S.els[k]; if (el.pause) el.pause(); });
    var ex = S.exporting; if (ex && ex.rec && ex.rec.state !== 'inactive') setTimeout(function () { ex.rec.stop(); }, 150);
  }
  $('#exp-cancel').onclick = function () { if (S.exporting) { S.exporting.cancel = true; finishExport(); } };
  function saveFrame() { view.toBlob(function (b) { if (b) shareBlob(b, 'standbild.jpg'); }, 'image/jpeg', 0.92); }
  function shareBlob(blob, name) {
    var file = null;
    try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && !S.desk) {
      navigator.share({ files: [file], title: name }).catch(function () {});
    } else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  }

  /* ======================= Meldungen, Einstellungen, Tastenkürzel ======================= */
  var toastT = null;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }
  function modal(html) {
    var m = $('#modal'); $('#modal-body').innerHTML = html; m.classList.remove('hidden');
    return $('#modal-body');
  }
  $('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').classList.add('hidden'); });

  var KEYS = [
    ['Wiedergabe', [['Leertaste', 'Abspielen / Stopp'], ['J / K / L', 'Rückwärts / Stopp / Vorwärts (mehrmals = schneller)'], ['← / →', '1 Frame zurück / vor'], ['⇧← / ⇧→', '1 Sekunde zurück / vor'],
      ['↑ / ↓', 'Vorheriger / nächster Schnittpunkt'], ['Pos1 / Ende', 'Anfang / Ende der Timeline'], [CMD + 'F  oder  P', 'Viewer im Vollbild']]],
    ['Schnitt (Edit)', [['A', 'Auswahl-Werkzeug'], ['B', 'Klingen-Werkzeug (Blade)'], [CMD + 'B  oder  ' + CMD + '\\', 'Am Playhead teilen'], ['⌫ / Entf', 'Löschen (Ripple)'],
      ['D', 'Clip aktivieren / deaktivieren'], ['N', 'Einrasten (Snapping) an/aus'], [CMD + 'T  oder  ⇧T', 'Standard-Übergang (Cross Dissolve)'], ['R', 'Geschwindigkeit ändern (Retime)'],
      [CMD + '⇧[ / ' + CMD + '⇧]', 'Anfang / Ende bis Playhead trimmen'], [', / .', 'Ausgewähltes Element 1 Frame verschieben'], ['V', 'Clip am Playhead auswählen'], ['Esc', 'Auswahl aufheben']]],
    ['Bearbeiten', [[CMD + 'Z / ' + CMD + '⇧Z', 'Rückgängig / Wiederholen'], [CMD + 'C / ' + CMD + 'X / ' + CMD + 'V', 'Kopieren / Ausschneiden / Einfügen'], [ALT + 'V', 'Attribute einfügen (Effekte, Grade, Bewegung)'], [CMD + 'S', 'Speichern (passiert auch automatisch)']]],
    ['Marker & In/Out', [['M', 'Marker setzen / entfernen'], ['⇧↑ / ⇧↓', 'Vorheriger / nächster Marker'], ['I / O', 'In-Punkt / Out-Punkt'], ['X', 'Clip markieren (In/Out um den Clip)'], [ALT + 'X', 'In/Out löschen']]],
    ['Timeline-Ansicht', [[CMD + '+ / ' + CMD + '−', 'Hinein- / Herauszoomen'], ['⇧Z', 'Ganze Timeline einpassen'], [CMD + '/' + ALT + ' + Mausrad', 'Zoomen']]],
    ['Seiten', [['⇧2', 'Media'], ['⇧3 / ⇧4', 'Edit'], ['⇧5', 'Effects'], ['⇧6', 'Color'], ['⇧7', 'Fairlight'], ['⇧8', 'Deliver']]],
    ['Color', [[ALT + 'S', 'Seriellen Node hinzufügen'], [CMD + 'D', 'Aktuellen Node an/aus'], ['⇧D', 'Bypass (vorher/nachher)'], [CMD + 'Pos1', 'Grade zurücksetzen'], ['⇧ beim Ziehen im Farbrad', 'Feinjustierung']]]
  ];
  function showKeys() {
    modal('<h2>⌨️ Tastenkürzel (wie DaVinci Resolve)</h2>' + KEYS.map(function (g) {
      return '<h3>' + g[0] + '</h3><table class="keys">' + g[1].map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('') + '</table>';
    }).join('') + '<p class="muted small">Hinweis: In einem normalen Safari-Fenster belegt Safari selbst ' + CMD + 'T (neuer Tab) – nimm dort ⇧T, oder öffne die App über das Dock.</p><button class="btn primary" data-close>Schließen</button>');
  }
  function showSettings() {
    var theme = document.documentElement.dataset.theme || 'light';
    var b = modal('<h2>⚙️ Einstellungen</h2><div class="fld"><span>Design</span><div class="seg"><button type="button" data-th="light" class="' + (theme === 'light' ? 'on' : '') + '">☀️ Hell</button><button type="button" data-th="dark" class="' + (theme === 'dark' ? 'on' : '') + '">🌙 Dunkel (wie Resolve)</button></div></div>' +
      '<div class="btn-row"><button class="btn" id="st-keys">⌨️ Tastenkürzel ansehen</button></div><p class="muted small">JZo Entertainment Video AI · Alles wird nur auf diesem Gerät gespeichert.</p><button class="btn primary" data-close>Schließen</button>');
    $$('[data-th]', b).forEach(function (x) { x.onclick = function () { setTheme(x.dataset.th); showSettings(); }; });
    $('#st-keys', b).onclick = showKeys;
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('jzo-video-theme', t); } catch (e) {}
    var m = $('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#1e1f22' : '#f6f5f2';
    WHEEL_BG = null; if (S.page === 'color') renderPanel();
  }
  function fullscreen() {
    var st = $('.stage');
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var f = st.requestFullscreen || st.webkitRequestFullscreen;
    if (f) f.call(st); else document.body.classList.toggle('cinema');
    setTimeout(sizeView, 200);
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(sizeView, 100); }); });

  function onKey(e) {
    var tg = e.target;
    if (tg && (/TEXTAREA|SELECT/.test(tg.tagName) || (tg.tagName === 'INPUT' && !/range|checkbox|button|file/.test(tg.type)))) return;
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape') $('#modal').classList.add('hidden'); return; }
    var k = e.key, kl = k.toLowerCase(), mod = e.metaKey || e.ctrlKey, sh = e.shiftKey, alt = e.altKey, code = e.code || '';
    var h = function (fn) { e.preventDefault(); fn(); };
    if (S.exporting) return;
    // Seiten wie Resolve: ⇧2 … ⇧8
    if (sh && !mod && !alt && /^Digit[2-8]$/.test(code)) return h(function () { showPage({ 2: 'media', 3: 'edit', 4: 'edit', 5: 'fx', 6: 'color', 7: 'audio', 8: 'export' }[code.slice(5)]); });
    if (mod && !alt) {
      if (kl === 'z') return h(function () { sh ? redo() : undo(); });
      if (kl === 'y') return h(redo);
      if (kl === 'b' || k === '\\') return h(function () { splitAt(); });
      if (kl === 'c') return h(function () { copySel(false); });
      if (kl === 'x') return h(function () { copySel(true); });
      if (kl === 'v') return h(paste);
      if (kl === 't') return h(addDefaultTransition);
      if (kl === 's') return h(function () { save(); toast('Gespeichert'); });
      if (kl === 'f') return h(fullscreen);
      if (kl === 'd') return h(function () { if (S.page === 'color') toggleNode(); else duplicateSel(); });
      if (k === '=' || k === '+') return h(function () { zoomTl(1.4); });
      if (k === '-') return h(function () { zoomTl(1 / 1.4); });
      if (k === 'Home') return h(resetGrade);
      if (sh && (k === '[' || k === '{' || code === 'BracketLeft')) return h(function () { trimToPlayhead('start'); });
      if (sh && (k === ']' || k === '}' || code === 'BracketRight')) return h(function () { trimToPlayhead('end'); });
      return;
    }
    if (alt && !mod) {
      if (code === 'KeyV') return h(pasteAttributes);
      if (code === 'KeyX') return h(function () { pushUndo(); S.project.io = {}; commit(false); toast('In/Out gelöscht'); });
      if (code === 'KeyI') return h(function () { pushUndo(); delete S.project.io.in; commit(false); });
      if (code === 'KeyO') return h(function () { pushUndo(); delete S.project.io.out; commit(false); });
      if (code === 'KeyS') return h(function () { if (S.page !== 'color') showPage('color'); addNode(); });
      if (code === 'KeyP') return h(function () { if (S.page !== 'color') showPage('color'); addNode(); toast('Parallele Nodes gibt es hier nicht – als serieller Node hinzugefügt'); });
      return;
    }
    switch (k) {
      case ' ': return h(function () { setPlaying(!S.playing); });
      case 'ArrowLeft': return h(function () { if (S.playing) setPlaying(false); seek(S.time - (sh ? 1 : 1 / fps())); });
      case 'ArrowRight': return h(function () { if (S.playing) setPlaying(false); seek(S.time + (sh ? 1 : 1 / fps())); });
      case 'ArrowUp': return h(function () { if (S.playing) setPlaying(false); jumpEdit(-1, sh ? S.project.markers.map(function (m) { return m.t; }) : null); });
      case 'ArrowDown': return h(function () { if (S.playing) setPlaying(false); jumpEdit(1, sh ? S.project.markers.map(function (m) { return m.t; }) : null); });
      case 'Home': return h(function () { setPlaying(false); seek(0); });
      case 'End': return h(function () { setPlaying(false); seek(total()); });
      case 'Backspace': case 'Delete': return h(deleteSel);
      case 'Escape': return h(function () { if (document.body.classList.contains('cinema')) { document.body.classList.remove('cinema'); sizeView(); } S.sel = null; setTool('select'); renderTimeline(); renderPanel(); S.dirty = true; });
      case ',': return h(function () { nudge(-1); });
      case '.': return h(function () { nudge(1); });
      case '?': return h(showKeys);
    }
    if (sh) {
      if (kl === 'z') return h(zoomFit);
      if (kl === 'd') return h(function () { S.bypass = !S.bypass; S.dirty = true; if (S.page === 'color') renderPanel(); toast(S.bypass ? 'Bypass an (ohne Grade)' : 'Bypass aus'); });
      if (kl === 't') return h(addDefaultTransition);
      return;
    }
    switch (kl) {
      case 'j': return h(function () { shuttle(-1); });
      case 'k': return h(function () { setPlaying(false); });
      case 'l': return h(function () { shuttle(1); });
      case 'a': return h(function () { setTool('select'); toast('Auswahl-Werkzeug (A)'); });
      case 'b': return h(function () { setTool('blade'); toast('Klinge (B) – auf einen Clip klicken zum Teilen'); });
      case 'n': return h(function () { setSnap(!S.snap); toast('Einrasten ' + (S.snap ? 'an' : 'aus')); });
      case 'm': return h(toggleMarker);
      case 'i': return h(function () { setIO('in'); });
      case 'o': return h(function () { setIO('out'); });
      case 'x': return h(markClip);
      case 'd': return h(toggleDisable);
      case 'r': return h(speedPrompt);
      case 'v': return h(function () { var c = clipAt(S.time); if (c) select('clip', c.id); });
      case 'p': return h(fullscreen);
    }
  }

  /* ======================= Bibliothek aus dem Admin-Bereich ======================= */
  function loadLibrary() {
    S.lib = { PACKS: LIB.PACKS.slice(), TRANSITIONS: LIB.TRANSITIONS.slice(), LOOKS: LIB.LOOKS.slice(), STICKERS: LIB.STICKERS.slice(), AI_MODELS: LIB.AI_MODELS.slice(), AI_EFFECTS: LIB.AI_EFFECTS.slice() };
    return fetch('data/library.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      (d.packs || []).forEach(function (p, i) { if (p && p.name && p.items && p.items.length) S.lib.PACKS.push({ id: 'cp' + i, name: p.name, icon: p.icon || '⭐', custom: true, items: p.items.filter(function (it) { return LIB.fxById(it.fx); }).map(function (it) { return { fx: it.fx, amount: clamp(+it.amount || 0.5, 0, 1) }; }) }); });
      (d.transitions || []).forEach(function (t, i) { var base = LIB.find(LIB.TRANSITIONS, t.base); if (t && t.name && base) S.lib.TRANSITIONS.push({ id: 'ct' + i, name: t.name, icon: t.icon || base.icon, type: base.type, dur: +t.duration || 1, cat: 'Eigene', custom: true }); });
      (d.looks || []).forEach(function (l, i) {
        if (!l || !l.name) return;
        S.lib.LOOKS.push({ id: 'cl' + i, name: l.name, icon: l.icon || '🎨', custom: true, node: {
          temp: +l.temp || 0, tint: +l.tint || 0, exposure: +l.exposure || 0, contrast: l.contrast != null ? +l.contrast : 1, sat: l.saturation != null ? +l.saturation : 1, hue: +l.hue || 0,
          lift: { x: 0, y: 0, m: +l.shadows || 0 }, gain: { x: 0, y: 0, m: +l.highlights || 0 } } });
      });
      (d.stickers || []).forEach(function (s, i) { if (s && s.image) S.lib.STICKERS.push({ id: 'cs' + i, name: s.name || 'Sticker', src: libSrc(s.image), anim: s.anim || 'pop', custom: true }); });
      var ms = (d.aiModels || []).filter(function (m) { return m && m.name && m.url; });
      if (ms.length) S.lib.AI_MODELS = ms.map(function (m, i) { return { id: m.id || ('m' + i), name: m.name, provider: m.provider || '', kind: m.kind || '', url: m.url, note: m.note || '' }; });
      (d.aiEffects || []).forEach(function (x, i) { if (x && x.name && x.prompt) S.lib.AI_EFFECTS.push({ id: 'ca' + i, name: x.name, icon: x.icon || '✨', model: x.model || '', prompt: x.prompt }); });
    }).catch(function () {});
  }

  /* ======================= Start ======================= */
  function checkDesk() {
    var d = window.matchMedia('(min-width: 980px)').matches;
    document.body.classList.toggle('desk', d);
    if (d !== S.desk) { S.desk = d; if (S.project) { renderTimeline(); renderPanel(); } }
  }
  function init() {
    try { var th = localStorage.getItem('jzo-video-theme'); if (th) setTheme(th); } catch (e) {}
    try { R = new Renderer(view); }
    catch (e) { $('.stage').innerHTML = '<p class="err">Die Vorschau kann auf diesem Gerät nicht starten (WebGL). Bitte Safari aktualisieren.<br><small>' + esc(e.message) + '</small></p>'; return; }
    $('.tabbar').innerHTML = PAGES.map(function (p) { return '<button type="button" data-page="' + p[0] + '"><i>' + p[2] + '</i>' + p[1] + '</button>'; }).join('');
    $$('.tabbar button').forEach(function (b) { b.onclick = function () { showPage(b.dataset.page); }; });
    $('#ai-btn').onclick = function () { showPage('ai'); setTimeout(function () { var i = $('#ai-in'); if (i) i.focus(); }, 50); };
    $('#set-btn').onclick = showSettings; $('#keys-btn').onclick = showKeys;
    $('#play-btn').onclick = function () { setPlaying(!S.playing); };
    $('#rev-btn').onclick = function () { shuttle(-1); };
    $('#start-btn').onclick = function () { setPlaying(false); seek(0); };
    $('#end-btn').onclick = function () { setPlaying(false); seek(total()); };
    $('#prev-btn').onclick = function () { jumpEdit(-1); }; $('#next-btn').onclick = function () { jumpEdit(1); };
    $('#full-btn').onclick = fullscreen;
    $('#split-btn').onclick = function () { splitAt(); }; $('#del-btn').onclick = deleteSel;
    $('#undo-btn').onclick = undo; $('#redo-btn').onclick = redo;
    $('#zin-btn').onclick = function () { zoomTl(1.4); }; $('#zout-btn').onclick = function () { zoomTl(1 / 1.4); };
    $('#fit-btn').onclick = zoomFit;
    $$('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });
    $('#snap-btn').onclick = function () { setSnap(!S.snap); };
    $('#mark-btn').onclick = toggleMarker;
    document.addEventListener('keydown', onKey);
    // Dateien aus dem Finder hineinziehen
    document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); document.body.classList.add('dropping'); } });
    document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
    document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); document.body.classList.remove('dropping'); importFiles(e.dataTransfer.files); } });
    window.addEventListener('resize', function () { checkDesk(); sizeView(); renderTimeline(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.playing && !S.exporting) setPlaying(false); });
    checkDesk();

    Promise.all([loadLibrary(), Store.all('media').catch(function () { return []; }), Store.all('projects').catch(function () { return []; })]).then(function (r) {
      r[1].forEach(function (m) { S.media[m.id] = m; });
      var ps = r[2], lastId = null;
      try { lastId = localStorage.getItem('jzo-video-last'); } catch (e) {}
      ps.sort(function (a, b) { return b.updated - a.updated; });
      S.project = fixProject(ps.filter(function (p) { return p.id === lastId; })[0] || ps[0] || newProject('16:9'));
      S.project.clips = S.project.clips.filter(function (c) { return c.gen || S.media[c.mediaId]; });
      S.project.audio = S.project.audio.filter(function (c) { return S.media[c.mediaId]; });
      $('#pj-title').textContent = S.project.name;
      layout(); sizeView(); renderTimeline(); updateUndoBtns(); setSnap(true); setTool('select');
      showPage(S.project.clips.length ? 'edit' : 'media');
      requestAnimationFrame(loop);
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.JZoVideo = { S: S, importFiles: importFiles, applyPayload: applyPayload, runAI: runAI, showPage: showPage, seek: seek, select: select, startExport: startExport, splitAt: splitAt };
  init();
})();
