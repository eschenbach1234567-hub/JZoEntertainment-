/* JZo Video AI – Oberfläche: Medien, Schnitt (Timeline), Farbe (Nodes),
   Effekte, KI und Export. Alles läuft im Browser, nichts wird hochgeladen. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(t) { t = Math.max(0, t); var m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * 10); return m + ':' + (s < 10 ? '0' : '') + s + ',' + f; }
  function fmtS(t) { return (Math.round(t * 10) / 10).toFixed(1).replace('.', ',') + ' s'; }

  var ASPECTS = { '16:9': [960, 540], '9:16': [540, 960], '1:1': [720, 720], '4:5': [720, 900] };

  var S = {
    project: null, media: {}, els: {}, time: 0, playing: false, pps: 60, sel: null, page: 'edit',
    selNode: {}, undo: [], redo: [], dirty: true, bypass: false, fxCat: 'glitch', gradeClip: null,
    aiModel: null, aiEffect: null, exporting: null, lastSetScroll: -1
  };
  var R = null;            // Renderer
  var view = $('#view');

  /* ======================= Projekt-Grundlagen ======================= */
  function newProject(aspect) {
    return { id: Store.uid(), name: 'Neues Projekt', aspect: aspect || '16:9', clips: [], audio: [], overlays: [], fadeOut: 0, updated: Date.now() };
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
    return t >= (S.clipsEnd || 0) && cs.length ? null : cs[0] || null;
  }
  function findClip(id) { return S.project.clips.filter(function (c) { return c.id === id; })[0]; }
  function findOv(id) { return S.project.overlays.filter(function (c) { return c.id === id; })[0]; }
  function findAudio(id) { return S.project.audio.filter(function (c) { return c.id === id; })[0]; }
  function selClip() { return S.sel && S.sel.type === 'clip' ? findClip(S.sel.id) : null; }
  function selOv() { return S.sel && S.sel.type === 'ov' ? findOv(S.sel.id) : null; }
  function curClip() { return selClip() || clipAt(S.time); }

  function pushUndo() {
    S.undo.push(JSON.stringify(S.project));
    if (S.undo.length > 80) S.undo.shift();
    S.redo = [];
    updateUndoBtns();
  }
  function restore(json) {
    var p = JSON.parse(json); S.project = p; layout();
    if (S.sel && !(selClip() || selOv() || (S.sel.type === 'audio' && findAudio(S.sel.id)))) S.sel = null;
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
  /* nach jeder Änderung: neu berechnen, speichern, neu zeichnen */
  function commit(panelToo) {
    layout(); save(); renderTimeline(); S.dirty = true; updateUndoBtns();
    if (panelToo) renderPanel();
  }

  /* ======================= Medien ======================= */
  function mediaUrl(m) { if (!m.url) m.url = URL.createObjectURL(m.blob); return m.url; }
  function libSrc(src) { if (!src) return ''; if (/^https?:|^data:|^blob:/.test(src)) return src; return src.charAt(0) === '/' ? '..' + src : src; }

  var pool = $('#media-pool');
  function elFor(item) {      // Video-/Bild-/Ton-Element für einen Clip
    if (S.els[item.id]) return S.els[item.id];
    var m = S.media[item.mediaId]; if (!m) return null;
    var el;
    if (m.kind === 'image') { el = new Image(); el.src = mediaUrl(m); }
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
  function dropEl(id) { var el = S.els[id]; if (!el) return; try { el.pause(); } catch (e) {} if (el.parentNode) el.parentNode.removeChild(el); delete S.els[id]; }

  /* Ton läuft über WebAudio: damit klappen Lautstärke (auch auf dem iPhone) und der Export mit Ton. */
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
  function setVol(el, v) { if (el._gain) el._gain.gain.value = v; else el.volume = clamp(v, 0, 1); }

  function readMeta(file) {
    return new Promise(function (resolve) {
      var kind = /^image\//.test(file.type) ? 'image' : /^audio\//.test(file.type) || /\.(mp3|m4a|wav|aac|aiff?)$/i.test(file.name) ? 'audio' : 'video';
      var url = URL.createObjectURL(file), rec = { id: Store.uid(), name: file.name.replace(/\.[^.]+$/, ''), kind: kind, blob: file, created: Date.now(), url: url };
      var done = function () { resolve(rec); };
      var thumbOf = function (src, w, h) {
        try { var c = document.createElement('canvas'), th = 72; c.height = th; c.width = Math.round(th * w / h) || 128; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); rec.thumb = c.toDataURL('image/jpeg', 0.7); } catch (e) {}
      };
      if (kind === 'image') {
        var im = new Image(); im.onload = function () { rec.w = im.naturalWidth; rec.h = im.naturalHeight; rec.duration = 4; thumbOf(im, rec.w, rec.h); done(); };
        im.onerror = done; im.src = url; return;
      }
      var v = document.createElement(kind === 'audio' ? 'audio' : 'video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
      var to = setTimeout(done, 8000);
      v.onloadedmetadata = function () {
        rec.duration = isFinite(v.duration) ? v.duration : 10; rec.w = v.videoWidth; rec.h = v.videoHeight;
        if (kind === 'audio') { clearTimeout(to); return done(); }
        v.currentTime = Math.min(0.5, rec.duration / 3);
      };
      v.onseeked = function () { clearTimeout(to); thumbOf(v, rec.w || 16, rec.h || 9); v.removeAttribute('src'); v.load(); done(); };
      v.onerror = function () { clearTimeout(to); rec.bad = true; done(); };
      v.src = url;
    });
  }
  function importFiles(files) {
    if (!files || !files.length) return;
    toast('Wird importiert …', 6000);
    var list = Array.prototype.slice.call(files);
    var chain = Promise.resolve(), added = 0;
    pushUndo();
    list.forEach(function (f) {
      chain = chain.then(function () { return readMeta(f); }).then(function (rec) {
        if (rec.bad) { toast('„' + f.name + '“ kann dieses Gerät nicht abspielen.'); return; }
        var store = { id: rec.id, name: rec.name, kind: rec.kind, blob: rec.blob, duration: rec.duration, w: rec.w, h: rec.h, thumb: rec.thumb, created: rec.created };
        S.media[rec.id] = rec;
        added++;
        if (rec.kind === 'audio') S.project.audio.push({ id: Store.uid(), mediaId: rec.id, start: S.project.audio.length ? 0 : 0, in: 0, out: rec.duration, speed: 1, volume: 0.8 });
        else S.project.clips.push(makeClip(rec));
        return Store.put('media', store).catch(function () { toast('Achtung: Datei zu groß zum Speichern auf dem Gerät.'); });
      });
    });
    chain.then(function () {
      commit(true);
      if (added) toast(added === 1 ? '1 Datei in die Timeline gelegt' : added + ' Dateien in die Timeline gelegt');
    });
  }
  function makeClip(m) {
    return { id: Store.uid(), mediaId: m.id, in: 0, out: m.kind === 'image' ? 4 : m.duration, speed: 1, volume: 1, fit: 'fit',
      transform: { s: 1, x: 0, y: 0, r: 0 }, effects: [], nodes: [LIB.node('Node 1')], transition: null };
  }

  /* ======================= Wiedergabe & Bild ======================= */
  function srcTime(c, t) {
    var m = S.media[c.mediaId], st = c.in + (t - c._start) * (c.speed || 1);
    return clamp(st, 0, Math.max(0, ((m && m.duration) || 1e9) - 0.04));
  }
  function trDur(c) { return c.transition && c.transition.type !== 'cut' ? Math.min(c.transition.dur || 0.8, clipDur(c)) : 0; }
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
    var m = S.media[c.mediaId], el = elFor(c); if (!m || !el) return null;
    var ready = m.kind === 'image' ? (el.complete && el.naturalWidth) : el.readyState >= 2;
    return { el: ready ? el : null, w: m.w || 16, h: m.h || 9, clip: c, lt: t - c._start, dur: clipDur(c), bypass: S.bypass && S.page === 'color' };
  }
  function activeOverlays(t) { return S.project.overlays.filter(function (o) { return t >= o.start && t < o.start + o.dur; }); }

  function syncMedia(t) {
    var fi = frameInfo(t), want = {};
    if (fi.a) want[fi.a.id] = fi.a; if (fi.b) want[fi.b.id] = fi.b;
    // nächsten Clip vorladen
    var cs = S.project.clips;
    cs.forEach(function (c, i) {
      var el = elFor(c); if (!el || !(el instanceof HTMLMediaElement)) return;
      if (want[c.id]) {
        var exp = srcTime(c, t);
        setVol(el, c.volume == null ? 1 : c.volume);
        if (S.playing) {
          el.playbackRate = c.speed || 1;
          if (Math.abs(el.currentTime - exp) > 0.3) el.currentTime = exp;
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
      if (on && S.playing) {
        var exp = a.in + (t - a.start) * (a.speed || 1), lt = t - a.start, d = clipDur(a);
        var v = (a.volume == null ? 0.8 : a.volume) * Math.min(1, a.fadeIn ? lt / a.fadeIn : 1, a.fadeOut ? (d - lt) / a.fadeOut : 1);
        setVol(el, Math.max(0, v));
        if (Math.abs(el.currentTime - exp) > 0.3) el.currentTime = exp;
        if (el.paused) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () {}); }
      } else if (!el.paused) el.pause();
    });
    return fi;
  }

  function draw() {
    var t = S.time, fi = syncMedia(t), tt = total();
    var fade = 1;
    if (S.project.fadeOut && tt > 0) fade = clamp((tt - t) / S.project.fadeOut, 0, 1);
    R.render({
      a: fi.b ? layerFor(fi.a, t) : layerFor(fi.a, t), b: fi.b ? layerFor(fi.b, t) : null, p: fi.p, type: fi.type, t: t, fade: fade,
      overlays: activeOverlays(t), time: t, selected: S.exporting ? null : selOv()
    });
    if (fi.b && !fi.a) { /* Einblenden aus Schwarz beim ersten Clip */ }
  }

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    if (S.playing) {
      var end = S.exporting ? S.exporting.to : total();
      S.time += dt;
      if (S.time >= end) { S.time = end; if (S.exporting) finishExport(); else setPlaying(false); }
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
        var p = el.play(); if (p && p.then) p.then(function () { if (!S.playing || !el._want) el.pause(); }).catch(function () {});
      }
    });
  }
  function setPlaying(on) {
    if (on) {
      if (!S.project.clips.length && !S.project.overlays.length && !S.project.audio.length) { toast('Erst ein Video importieren (Reiter „Medien“).'); return; }
      if (S.time >= total() - 0.05) S.time = 0;
      S.project.clips.forEach(elFor); S.project.audio.forEach(elFor);
      unlockMedia();
    }
    S.playing = on;
    $('#play-btn').classList.toggle('on', on);
    $('#play-btn').setAttribute('aria-label', on ? 'Pause' : 'Abspielen');
    if (!on) Object.keys(S.els).forEach(function (k) { var el = S.els[k]; if (el instanceof HTMLMediaElement && !el.paused) el.pause(); });
    S.dirty = true;
  }
  function seek(t) { S.time = clamp(t, 0, total()); S.dirty = true; followPlayhead(); }
  function updateTime() { $('#time').textContent = fmt(S.time) + ' / ' + fmt(total()); }

  function sizeView() {
    var a = ASPECTS[S.project.aspect] || ASPECTS['16:9'];
    if (!S.exporting) R.resize(a[0], a[1]);
    var st = $('.stage'), maxW = st.clientWidth, maxH = st.clientHeight;
    var sc = Math.min(maxW / a[0], maxH / a[1]);
    view.style.width = Math.floor(a[0] * sc) + 'px'; view.style.height = Math.floor(a[1] * sc) + 'px';
    S.dirty = true;
  }

  /* ======================= Timeline ======================= */
  var tl = $('#tl'), tlInner = $('#tl-inner');
  function pad() { return tl.clientWidth / 2; }
  function followPlayhead() {
    var x = Math.round(S.time * S.pps);
    if (Math.abs(tl.scrollLeft - x) >= 1) { S.lastSetScroll = x; tl.scrollLeft = x; }
  }
  tl.addEventListener('scroll', function () {
    if (S.playing) { if (Math.abs(tl.scrollLeft - S.lastSetScroll) > 3) setPlaying(false); else return; }
    if (Math.abs(tl.scrollLeft - S.lastSetScroll) < 1) return;
    S.lastSetScroll = -1;
    S.time = clamp(tl.scrollLeft / S.pps, 0, total()); S.dirty = true;
  }, { passive: true });

  function lanesFor(items) {   // überlappende Overlays auf mehrere Zeilen verteilen
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
  function renderTimeline() {
    var P = pad(), T = total(), W = Math.max(T, 1) * S.pps;
    tlInner.style.width = (W + P * 2) + 'px';
    var nl = lanesFor(S.project.overlays), html = '';
    // Zeitlineal
    var stepS = S.pps > 120 ? 1 : S.pps > 40 ? 2 : S.pps > 15 ? 5 : 10;
    html += '<div class="ruler">';
    for (var s = 0; s <= T + stepS; s += stepS) html += '<span style="left:' + (P + s * S.pps) + 'px">' + (s >= 60 ? Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : s + 's') + '</span>';
    html += '</div>';
    var LH = innerWidth < 980 ? 24 : 30;
    html += '<div class="lane lane-ov" style="height:' + (nl * LH + 4) + 'px"><span class="lane-tag">T</span>';
    S.project.overlays.forEach(function (o) {
      var sel = S.sel && S.sel.id === o.id;
      html += '<div class="blk ov k-' + o.kind + (sel ? ' sel' : '') + '" data-ov="' + o.id + '" style="left:' + (P + o.start * S.pps) + 'px;width:' + Math.max(8, o.dur * S.pps) + 'px;top:' + (o._lane * LH + 2) + 'px">' +
        '<span class="lbl">' + esc(ovLabel(o)) + (o.track ? ' 📍' : '') + '</span>' + (sel ? '<i class="hdl r" data-h="ov-r"></i>' : '') + '</div>';
    });
    html += '</div><div class="lane lane-v"><span class="lane-tag">V1</span>';
    S.project.clips.forEach(function (c, i) {
      var m = S.media[c.mediaId] || {}, sel = S.sel && S.sel.id === c.id, w = clipDur(c) * S.pps;
      var fxn = (c.effects || []).length, graded = (c.nodes || []).some(function (n) { return JSON.stringify(n) !== JSON.stringify(LIB.node(n.name)); });
      html += '<div class="blk clip' + (sel ? ' sel' : '') + '" data-clip="' + c.id + '" style="left:' + (P + c._start * S.pps) + 'px;width:' + Math.max(6, w - 2) + 'px;' + (m.thumb ? 'background-image:url(' + m.thumb + ')' : '') + '">' +
        '<span class="lbl">' + esc(m.name || 'Clip') + ((c.speed || 1) !== 1 ? ' · ' + c.speed + '×' : '') + '</span>' +
        '<span class="badges">' + (fxn ? '<b>✨' + fxn + '</b>' : '') + (graded ? '<b>🎨</b>' : '') + '</span>' +
        (trDur(c) ? '<span class="trmark" title="Übergang">◆</span>' : '') +
        (sel ? '<i class="hdl l" data-h="clip-l"></i><i class="hdl r" data-h="clip-r"></i>' : '') + '</div>';
    });
    if (!S.project.clips.length) html += '<div class="lane-empty" style="left:' + P + 'px">Videos & Fotos hier – über „Medien“ importieren</div>';
    html += '</div><div class="lane lane-a"><span class="lane-tag">A1</span>';
    S.project.audio.forEach(function (a) {
      var m = S.media[a.mediaId] || {}, sel = S.sel && S.sel.id === a.id;
      html += '<div class="blk aud' + (sel ? ' sel' : '') + '" data-aud="' + a.id + '" style="left:' + (P + a.start * S.pps) + 'px;width:' + Math.max(6, clipDur(a) * S.pps) + 'px">' +
        '<span class="lbl">🎵 ' + esc(m.name || 'Musik') + '</span>' + (sel ? '<i class="hdl l" data-h="aud-l"></i><i class="hdl r" data-h="aud-r"></i>' : '') + '</div>';
    });
    html += '</div>';
    tlInner.innerHTML = html;
    followPlayhead();
  }

  // Antippen & Ziehen in der Timeline
  var drag = null;
  tlInner.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('[data-h]'), blk = e.target.closest('.blk');
    if (h) {
      e.preventDefault(); e.stopPropagation();
      var b = h.closest('.blk'), id = b.dataset.clip || b.dataset.ov || b.dataset.aud;
      pushUndo();
      drag = { kind: h.dataset.h, id: id, x0: e.clientX, orig: clone(b.dataset.clip ? findClip(id) : b.dataset.ov ? findOv(id) : findAudio(id)) };
      tlInner.setPointerCapture(e.pointerId);
      return;
    }
    if (blk && blk.classList.contains('sel') && (blk.dataset.ov || blk.dataset.aud)) {
      var id2 = blk.dataset.ov || blk.dataset.aud;
      pushUndo();
      drag = { kind: blk.dataset.ov ? 'ov-move' : 'aud-move', id: id2, x0: e.clientX, orig: clone(blk.dataset.ov ? findOv(id2) : findAudio(id2)), moved: false };
      tlInner.setPointerCapture(e.pointerId);
    }
  });
  tlInner.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dt = (e.clientX - drag.x0) / S.pps, o = drag.orig, it, m;
    if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
    switch (drag.kind) {
      case 'clip-l': it = findClip(drag.id); it.in = clamp(o.in + dt * o.speed, 0, o.out - 0.2); break;
      case 'clip-r': it = findClip(drag.id); m = S.media[it.mediaId];
        it.out = clamp(o.out + dt * o.speed, o.in + 0.2, m.kind === 'image' ? 600 : m.duration); break;
      case 'ov-r': it = findOv(drag.id); it.dur = Math.max(0.2, o.dur + dt); break;
      case 'ov-move': it = findOv(drag.id); it.start = Math.max(0, o.start + dt); break;
      case 'aud-move': it = findAudio(drag.id); it.start = Math.max(0, o.start + dt); break;
      case 'aud-l': it = findAudio(drag.id); var nin = clamp(o.in + dt, 0, o.out - 0.2); it.start = Math.max(0, o.start + (nin - o.in)); it.in = nin; break;
      case 'aud-r': it = findAudio(drag.id); it.out = clamp(o.out + dt, o.in + 0.2, S.media[it.mediaId].duration); break;
    }
    layout(); renderTimeline(); S.dirty = true;
  });
  function endDrag() {
    if (!drag) return;
    var d = drag; drag = null;
    if ((d.kind === 'ov-move' || d.kind === 'aud-move') && !d.moved) { S.undo.pop(); updateUndoBtns(); return; }
    commit(true);
  }
  tlInner.addEventListener('pointerup', endDrag);
  tlInner.addEventListener('pointercancel', endDrag);
  tlInner.addEventListener('click', function (e) {
    if (e.target.closest('[data-h]')) return;
    var b = e.target.closest('.blk');
    if (!b) { if (S.sel) { S.sel = null; renderTimeline(); renderPanel(); S.dirty = true; } return; }
    if (b.dataset.clip) select('clip', b.dataset.clip);
    else if (b.dataset.ov) select('ov', b.dataset.ov);
    else select('audio', b.dataset.aud);
  });
  function select(type, id) {
    S.sel = { type: type, id: id };
    if (type === 'clip') { var c = findClip(id); if (c && (S.time < c._start || S.time >= c._start + clipDur(c))) seek(c._start + 0.01); }
    if (type === 'ov') { var o = findOv(id); if (o && (S.time < o.start || S.time >= o.start + o.dur)) seek(o.start + 0.01); }
    if (S.page === 'media' || S.page === 'export') showPage('edit');
    else if (S.page === 'fx' && type !== 'clip') showPage('edit');
    renderTimeline(); renderPanel(); S.dirty = true;
  }
  function zoomTl(f) { S.pps = clamp(S.pps * f, 8, 400); renderTimeline(); }
  tl.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTl(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }, { passive: false });

  /* ======================= Schnitt-Aktionen ======================= */
  function splitAt() {
    var c = clipAt(S.time);
    if (!c || S.time <= c._start + 0.05 || S.time >= c._start + clipDur(c) - 0.05) { toast('Abspielkopf auf einen Clip stellen (nicht an den Rand).'); return; }
    pushUndo();
    var cut = srcTime(c, S.time), n = clone(c);
    n.id = Store.uid(); n.in = cut; n.transition = null; c.out = cut;
    S.project.clips.splice(S.project.clips.indexOf(c) + 1, 0, n);
    S.sel = { type: 'clip', id: n.id };
    commit(true); toast('Geteilt ✂️');
  }
  function deleteSel() {
    if (!S.sel) { toast('Erst etwas in der Timeline antippen.'); return; }
    pushUndo();
    var id = S.sel.id, arr = S.sel.type === 'clip' ? S.project.clips : S.sel.type === 'ov' ? S.project.overlays : S.project.audio;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr.splice(i, 1); break; }
    dropEl(id); S.sel = null; commit(true); toast('Gelöscht');
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
    c.transition = tr.type === 0 ? null : { type: tr.id, dur: tr.dur || 0.8 };
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

  /* Ein Effekt-Kachel-„Paket“ anwenden: auf Clip (oder an Bildposition) */
  function applyPayload(p, clip, pos) {
    var c = clip || curClip(), needClip = ['fx', 'pack', 'tr', 'look'].indexOf(p.t) >= 0;
    if (needClip && !c) { toast('Erst ein Video importieren.'); return; }
    pushUndo();
    var msg = '';
    switch (p.t) {
      case 'fx': addFx(c, p.id); msg = LIB.fxById(p.id).name + ' auf Clip'; break;
      case 'pack': addPack(c, p.id); msg = 'Paket „' + LIB.find(S.lib.PACKS, p.id).name + '“'; break;
      case 'tr': setTransition(c, p.id); msg = 'Übergang am Anfang des Clips'; break;
      case 'look': applyLook(c, p.id); msg = 'Look „' + LIB.find(S.lib.LOOKS, p.id).name + '“'; break;
      case 'part':
        var pd = LIB.find(LIB.PARTICLES, p.id);
        addOverlay('fx', { type: p.id }, pos);
        msg = pd.name + ' eingefügt' + (p.id === 'handfire' ? ' – spule durchs Video und zieh das Feuer immer auf die Hand, die App bewegt es dazwischen mit' : pd.full ? '' : ' – im Bild verschieben');
        break;
      case 'sticker': addOverlay('sticker', { emoji: p.emoji, src: p.src, anim: p.anim || 'pop' }, pos); msg = 'Sticker eingefügt'; break;
      case 'text': addOverlay('text', { text: 'Dein Text', style: p.style, anim: 'pop', color: '#ffffff' }, pos); msg = 'Text eingefügt – unten bearbeiten'; break;
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
    if (t.closest('#view')) { var r = view.getBoundingClientRect(); return applyPayload(p, null, { x: clamp((x - r.left) / r.width, 0, 1), y: clamp((y - r.top) / r.height, 0, 1) }); }
  }
  function bindTiles(root, getPayload) {
    $$('.tile', root).forEach(function (tile) {
      var p = getPayload(tile), label = tile.textContent.trim();
      var down = null, timer = null, dragging = false;
      tile.addEventListener('mousedown', function (e) { down = { x: e.clientX, y: e.clientY }; e.preventDefault(); });
      window.addEventListener('mousemove', function (e) {
        if (!down) return;
        if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { dragging = true; startGhost(p, e.clientX, e.clientY, label); }
        if (dragging) moveGhost(e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', function (e) {
        if (!down) return; down = null;
        if (dragging) { dragging = false; endGhost(e.clientX, e.clientY); } else applyPayload(p);
      });
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

  /* ======================= Vorschau: Overlays verschieben ======================= */
  var ptrs = {}, ovDrag = null;
  function viewPos(e) { var r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  function hitOverlay(p) {
    var list = activeOverlays(S.time), H = view.height, W = view.width;
    for (var i = list.length - 1; i >= 0; i--) {
      var o = list[i], q = Renderer.ovPos(o, S.time), r = q.s * 0.18 * 0.8 * (o.kind === 'text' ? 2.2 : 1);
      var full = o.kind === 'fx' && (LIB.find(LIB.PARTICLES, o.type) || {}).full;
      if (full) continue;
      var dx = (p.x - q.x) * W / H, dy = p.y - q.y;
      if (Math.abs(dx) < r * (o.kind === 'text' ? 2 : 1) && Math.abs(dy) < Math.max(r, 0.08)) return o;
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
    var q = Renderer.ovPos(o, S.time);
    ovDrag = { o: o, p0: p, q0: q, moved: false };
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
      if (!o.track) { o.keys = [{ t: 0, x: nx, y: ny, s: o.keys[0].s }]; } else upsertKey(o, lt, nx, ny, q.s);
    }
    ovDrag.moved = true; S.dirty = true;
  });
  function viewUp(e) {
    delete ptrs[e.pointerId];
    if (!ovDrag || Object.keys(ptrs).length) return;
    if (!ovDrag.moved) { S.undo.pop(); updateUndoBtns(); }
    else { commit(false); if (ovDrag.o.track) renderPanel(); }
    ovDrag = null;
  }
  view.addEventListener('pointerup', viewUp);
  view.addEventListener('pointercancel', viewUp);

  /* ======================= Panels (Seiten) ======================= */
  function showPage(p) {
    S.page = p;
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.page === p); });
    document.body.dataset.page = p;
    renderPanel(); S.dirty = true;
  }
  function renderPanel() {
    var el = $('#panel');
    ({ media: pMedia, edit: pEdit, color: pColor, fx: pFx, ai: pAI, export: pExport })[S.page](el);
  }

  /* Bausteine für Regler */
  function slider(label, val, min, max, step, onInput, fmtFn) {
    var id = 'r' + Math.random().toString(36).slice(2, 8);
    var row = document.createElement('label'); row.className = 'sl';
    row.innerHTML = '<span>' + label + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output>' + (fmtFn ? fmtFn(val) : val) + '</output>';
    var inp = $('input', row), out = $('output', row), started = false;
    inp.addEventListener('pointerdown', function () { pushUndo(); started = true; });
    inp.addEventListener('keydown', function () { if (!started) { pushUndo(); started = true; } });
    inp.addEventListener('input', function () { if (!started) { pushUndo(); started = true; } var v = parseFloat(inp.value); out.textContent = fmtFn ? fmtFn(v) : v; onInput(v); S.dirty = true; });
    inp.addEventListener('change', function () { started = false; commit(false); });
    row.addEventListener('dblclick', function () { /* Doppeltipp: nichts – Zurücksetzen über Knöpfe */ });
    return row;
  }
  function pct(v) { return Math.round(v * 100) + ' %'; }
  function sgn(v) { return (v > 0 ? '+' : '') + (Math.round(v * 100) / 100).toString().replace('.', ','); }
  function card(title, inner) { var d = document.createElement('div'); d.className = 'card'; d.innerHTML = (title ? '<h3>' + title + '</h3>' : '') + (inner || ''); return d; }

  /* ---------- Medien ---------- */
  function pMedia(el) {
    el.innerHTML = '';
    var c1 = card('Importieren', '<div class="btn-row"><label class="btn primary file-btn">🎬 Videos & Fotos<input type="file" id="imp-v" accept="video/*,image/*" multiple></label>' +
      '<label class="btn file-btn">🎵 Musik / Ton<input type="file" id="imp-a" accept="audio/*,.mp3,.m4a,.wav,.aac" multiple></label></div>' +
      '<p class="muted small">Alles bleibt auf deinem Gerät. Neue Dateien landen automatisch hinten in der Timeline.</p>');
    el.appendChild(c1);
    $('#imp-v', c1).onchange = function () { importFiles(this.files); this.value = ''; };
    $('#imp-a', c1).onchange = function () { importFiles(this.files); this.value = ''; };

    var c2 = card('Projekt', '<label class="fld"><span>Name</span><input id="pj-name" value="' + esc(S.project.name) + '"></label>' +
      '<div class="fld"><span>Format</span><div class="seg" id="pj-aspect">' + Object.keys(ASPECTS).map(function (a) {
        return '<button type="button" data-a="' + a + '" class="' + (S.project.aspect === a ? 'on' : '') + '">' + a + (a === '9:16' ? ' 📱' : a === '16:9' ? ' 🖥️' : '') + '</button>';
      }).join('') + '</div></div>' +
      '<div class="btn-row"><button class="btn" id="pj-new" type="button">＋ Neues Projekt</button></div><div id="pj-list" class="list"></div>');
    el.appendChild(c2);
    $('#pj-name', c2).oninput = function () { S.project.name = this.value || 'Projekt'; save(); $('#pj-title').textContent = S.project.name; };
    $$('#pj-aspect button', c2).forEach(function (b) { b.onclick = function () { pushUndo(); S.project.aspect = b.dataset.a; sizeView(); commit(true); }; });
    $('#pj-new', c2).onclick = function () {
      var a = S.project.aspect; S.project = newProject(a); S.undo = []; S.redo = []; S.sel = null; S.time = 0;
      Object.keys(S.els).forEach(dropEl); commit(true); sizeView(); $('#pj-title').textContent = S.project.name; toast('Neues Projekt angelegt');
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

    var ids = Object.keys(S.media);
    var c3 = card('Medien auf dem Gerät (' + ids.length + ')', '<div class="mgrid">' + ids.map(function (id) {
      var m = S.media[id];
      return '<div class="mitem" data-m="' + id + '"><div class="mthumb" style="' + (m.thumb ? 'background-image:url(' + m.thumb + ')' : '') + '">' + (m.kind === 'audio' ? '🎵' : '') + '<small>' + (m.kind === 'image' ? 'Foto' : fmtS(m.duration || 0)) + '</small></div>' +
        '<span>' + esc(m.name) + '</span><div class="mact"><button class="btn sm" data-add="' + id + '">＋ Timeline</button><button class="btn sm ghost" data-mdel="' + id + '" aria-label="Löschen">🗑</button></div></div>';
    }).join('') + '</div>' + (ids.length ? '' : '<p class="muted">Noch nichts importiert.</p>'));
    el.appendChild(c3);
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
  }
  function openProject(id) {
    Store.get('projects', id).then(function (p) {
      if (!p) return;
      Object.keys(S.els).forEach(dropEl);
      S.project = p; S.undo = []; S.redo = []; S.sel = null; S.time = 0;
      $('#pj-title').textContent = p.name; sizeView(); commit(true); toast('„' + p.name + '“ geöffnet');
    });
  }

  /* ---------- Schnitt / Inspektor ---------- */
  function pEdit(el) {
    el.innerHTML = '';
    var c = selClip(), o = selOv(), a = S.sel && S.sel.type === 'audio' ? findAudio(S.sel.id) : null;
    if (!c && !o && !a) {
      var d = card('Schnitt', '<p>Tippe in der Timeline einen <b>Clip</b> an, um ihn zu bearbeiten. Die Zeitleiste wischen = spulen.</p>' +
        '<div class="btn-row"><button class="btn" id="q-split">✂️ Am Abspielkopf teilen</button><button class="btn" id="q-text">𝐓 Text</button><button class="btn" id="q-imp">＋ Medien</button></div>' +
        '<p class="muted small">Tipp: Mit „Effekte“ kannst du Glitches, Zooms, Feuer & Sticker direkt auf Clips ziehen. Mit <b>✨ KI</b> sagst du einfach, was passieren soll.</p>');
      el.appendChild(d);
      $('#q-split', d).onclick = splitAt; $('#q-imp', d).onclick = function () { showPage('media'); };
      $('#q-text', d).onclick = function () { applyPayload({ t: 'text', style: 'outline' }); showPage('edit'); };
      return;
    }
    if (c) {
      var m = S.media[c.mediaId] || {};
      var d1 = card('Clip: ' + esc(m.name || ''), '<div class="btn-row">' +
        '<button class="btn" id="e-split">✂️ Teilen</button><button class="btn" id="e-dup">⧉ Duplizieren</button>' +
        '<button class="btn" id="e-left" aria-label="Nach vorne">◀</button><button class="btn" id="e-right" aria-label="Nach hinten">▶</button><button class="btn danger" id="e-del">🗑 Löschen</button></div>');
      el.appendChild(d1);
      $('#e-split', d1).onclick = splitAt; $('#e-dup', d1).onclick = duplicateSel; $('#e-del', d1).onclick = deleteSel;
      $('#e-left', d1).onclick = function () { moveClip(-1); }; $('#e-right', d1).onclick = function () { moveClip(1); };
      var d2 = card('Länge & Tempo');
      var maxD = m.kind === 'image' ? 30 : (m.duration || 1);
      d2.appendChild(slider('Start', c.in, 0, maxD, 0.01, function (v) { c.in = Math.min(v, c.out - 0.2); layout(); renderTimeline(); }, fmtS));
      d2.appendChild(slider(m.kind === 'image' ? 'Dauer' : 'Ende', c.out, 0.2, maxD, 0.01, function (v) { c.out = Math.max(v, c.in + 0.2); layout(); renderTimeline(); }, fmtS));
      var sp = document.createElement('div'); sp.className = 'fld';
      sp.innerHTML = '<span>Tempo</span><div class="seg">' + [0.25, 0.5, 1, 1.5, 2, 4].map(function (v) { return '<button type="button" data-sp="' + v + '" class="' + ((c.speed || 1) === v ? 'on' : '') + '">' + String(v).replace('.', ',') + '×</button>'; }).join('') + '</div>';
      d2.appendChild(sp);
      $$('[data-sp]', sp).forEach(function (b) { b.onclick = function () { pushUndo(); c.speed = parseFloat(b.dataset.sp); commit(true); }; });
      if (m.kind !== 'image') d2.appendChild(slider('Lautstärke', c.volume == null ? 1 : c.volume, 0, 2, 0.01, function (v) { c.volume = v; }, pct));
      el.appendChild(d2);

      var d3 = card('Bild');
      var fit = document.createElement('div'); fit.className = 'fld';
      fit.innerHTML = '<span>Ausschnitt</span><div class="seg"><button type="button" data-fit="fit" class="' + (c.fit !== 'fill' ? 'on' : '') + '">Ganzes Bild</button><button type="button" data-fit="fill" class="' + (c.fit === 'fill' ? 'on' : '') + '">Bild füllen</button></div>';
      d3.appendChild(fit);
      $$('[data-fit]', fit).forEach(function (b) { b.onclick = function () { pushUndo(); c.fit = b.dataset.fit; commit(true); }; });
      var tr = c.transform || (c.transform = { s: 1, x: 0, y: 0, r: 0 });
      d3.appendChild(slider('Zoom', tr.s, 0.5, 3, 0.01, function (v) { tr.s = v; }, pct));
      d3.appendChild(slider('Position ↔', tr.x, -1, 1, 0.005, function (v) { tr.x = v; }, sgn));
      d3.appendChild(slider('Position ↕', tr.y, -1, 1, 0.005, function (v) { tr.y = v; }, sgn));
      d3.appendChild(slider('Drehung', tr.r, -180, 180, 1, function (v) { tr.r = v; }, function (v) { return v + '°'; }));
      el.appendChild(d3);

      var d4 = card('Übergang am Clip-Anfang', '<div class="seg wrap" id="trsel">' + S.lib.TRANSITIONS.map(function (t) {
        var on = (!c.transition && t.type === 0) || (c.transition && c.transition.type === t.id);
        return '<button type="button" data-tr="' + t.id + '" class="' + (on ? 'on' : '') + '">' + t.icon + ' ' + esc(t.name) + '</button>';
      }).join('') + '</div>');
      el.appendChild(d4);
      $$('[data-tr]', d4).forEach(function (b) { b.onclick = function () { pushUndo(); setTransition(c, b.dataset.tr); commit(true); seek(Math.max(0, c._start - (trDur(c) / 2) - 0.3)); }; });
      if (c.transition) d4.appendChild(slider('Dauer', c.transition.dur, 0.2, 3, 0.05, function (v) { c.transition.dur = v; renderTimeline(); }, fmtS));
      if (S.project.clips.indexOf(c) === 0 && c.transition) d4.appendChild(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Beim ersten Clip wird aus Schwarz eingeblendet.' }));

      el.appendChild(fxListCard(c));
    }
    if (o) {
      var title = o.kind === 'text' ? 'Text' : o.kind === 'sticker' ? 'Sticker' : (LIB.find(LIB.PARTICLES, o.type) || {}).name || 'Effekt';
      var d5 = card(esc(title), '<div class="btn-row"><button class="btn" id="o-dup">⧉ Duplizieren</button><button class="btn danger" id="o-del">🗑 Löschen</button></div>');
      el.appendChild(d5);
      $('#o-dup', d5).onclick = duplicateSel; $('#o-del', d5).onclick = deleteSel;
      if (o.kind === 'text') {
        var tx = document.createElement('div');
        tx.innerHTML = '<label class="fld"><span>Text</span><textarea id="o-text" rows="2">' + esc(o.text) + '</textarea></label>' +
          '<div class="fld"><span>Stil</span><div class="seg wrap">' + LIB.TEXT_STYLES.map(function (s) { return '<button type="button" data-st="' + s.id + '" class="' + (o.style === s.id ? 'on' : '') + '">' + s.icon + ' ' + s.name + '</button>'; }).join('') + '</div></div>' +
          '<div class="fld"><span>Farbe</span><div class="colors">' + ['#ffffff', '#ffd400', '#ff6a1a', '#ff2d55', '#34c759', '#0a84ff', '#bf5af2', '#000000'].map(function (cl) { return '<button type="button" data-col="' + cl + '" style="background:' + cl + '" class="' + (o.color === cl ? 'on' : '') + '" aria-label="Farbe ' + cl + '"></button>'; }).join('') + '</div></div>' +
          '<div class="fld"><span>Animation</span><div class="seg wrap">' + LIB.TEXT_ANIMS.map(function (a) { return '<button type="button" data-an="' + a[0] + '" class="' + (o.anim === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') + '</div></div>';
        d5.appendChild(tx);
        var ta = $('#o-text', tx), tstart = false;
        ta.oninput = function () { if (!tstart) { pushUndo(); tstart = true; } o.text = ta.value; S.dirty = true; renderTimeline(); };
        ta.onchange = function () { tstart = false; commit(false); };
        $$('[data-st]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.style = b.dataset.st; commit(true); }; });
        $$('[data-col]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.color = b.dataset.col; commit(true); }; });
        $$('[data-an]', tx).forEach(function (b) { b.onclick = function () { pushUndo(); o.anim = b.dataset.an; commit(true); }; });
      }
      if (o.kind === 'sticker') {
        var an = document.createElement('div'); an.className = 'fld';
        an.innerHTML = '<span>Animation</span><div class="seg wrap">' + LIB.STICKER_ANIMS.map(function (a) { return '<button type="button" data-an="' + a[0] + '" class="' + (o.anim === a[0] ? 'on' : '') + '">' + a[1] + '</button>'; }).join('') + '</div>';
        d5.appendChild(an);
        $$('[data-an]', an).forEach(function (b) { b.onclick = function () { pushUndo(); o.anim = b.dataset.an; commit(true); }; });
      }
      if (o.kind === 'fx') d5.appendChild(slider('Stärke', o.amount || 1, 0.2, 2, 0.05, function (v) { o.amount = v; delete R.particles[o.id]; }, pct));
      var k0 = Renderer.ovPos(o, S.time);
      d5.appendChild(slider('Größe', k0.s, 0.15, 6, 0.01, function (v) { upsertKey(o, S.time - o.start, Renderer.ovPos(o, S.time).x, Renderer.ovPos(o, S.time).y, v); }, pct));
      d5.appendChild(slider('Dauer', o.dur, 0.3, Math.max(20, o.dur), 0.1, function (v) { o.dur = v; renderTimeline(); }, fmtS));
      var full = o.kind === 'fx' && (LIB.find(LIB.PARTICLES, o.type) || {}).full;
      if (!full) {
        var kf = document.createElement('div'); kf.className = 'kf-box';
        kf.innerHTML = '<label class="sw"><input type="checkbox" id="o-track"' + (o.track ? ' checked' : '') + '><span></span> <b>Bewegung folgen</b> (Keyframes)</label>' +
          '<p class="muted small">' + (o.track ? '📍 ' + o.keys.length + ' Punkt(e) gesetzt. So geht\'s: Video an eine Stelle spulen → ' + (o.kind === 'fx' ? 'Effekt' : 'Element') + ' im Bild auf die Hand/das Objekt ziehen → weiterspulen → wieder hinziehen. Dazwischen bewegt die App es automatisch.' : 'Einschalten, wenn das Element einer Bewegung folgen soll (z. B. Feuer auf der Hand).') + '</p>' +
          (o.track && o.keys.length > 1 ? '<button class="btn sm" id="o-kclear">Punkte zurücksetzen</button>' : '');
        d5.appendChild(kf);
        $('#o-track', kf).onchange = function () { pushUndo(); o.track = this.checked; var q = Renderer.ovPos(o, S.time); o.keys = [{ t: o.track ? Math.max(0, S.time - o.start) : 0, x: q.x, y: q.y, s: q.s }]; commit(true); };
        var kc = $('#o-kclear', kf); if (kc) kc.onclick = function () { pushUndo(); var q = Renderer.ovPos(o, S.time); o.keys = [{ t: 0, x: q.x, y: q.y, s: q.s }]; commit(true); };
      }
      var hint = document.createElement('p'); hint.className = 'muted small'; hint.textContent = full ? 'Dieser Effekt liegt über dem ganzen Bild.' : 'Im Vorschaubild ziehen = verschieben, mit zwei Fingern = größer/kleiner.';
      d5.appendChild(hint);
    }
    if (a) {
      var am = S.media[a.mediaId] || {};
      var d6 = card('🎵 ' + esc(am.name || 'Musik'), '<div class="btn-row"><button class="btn" id="a-dup">⧉ Duplizieren</button><button class="btn danger" id="a-del">🗑 Löschen</button></div><p class="muted small">In der Timeline den markierten Block ziehen = verschieben, an den Rändern ziehen = kürzen.</p>');
      el.appendChild(d6);
      $('#a-dup', d6).onclick = duplicateSel; $('#a-del', d6).onclick = deleteSel;
      d6.appendChild(slider('Lautstärke', a.volume == null ? 0.8 : a.volume, 0, 2, 0.01, function (v) { a.volume = v; }, pct));
      d6.appendChild(slider('Einblenden', a.fadeIn || 0, 0, 5, 0.1, function (v) { a.fadeIn = v; }, fmtS));
      d6.appendChild(slider('Ausblenden', a.fadeOut || 0, 0, 5, 0.1, function (v) { a.fadeOut = v; }, fmtS));
    }
  }
  function fxListCard(c) {
    var d = card('Effekte auf diesem Clip');
    if (!c.effects.length) { d.innerHTML += '<p class="muted small">Noch keine. Im Reiter „Effekte“ antippen oder auf den Clip ziehen.</p>'; return d; }
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

  /* ---------- Farbe (wie DaVinci: Nodes, Farbräder, Looks) ---------- */
  var gradeClipboard = null;
  function pColor(el) {
    el.innerHTML = '';
    var c = curClip();
    if (!c) { el.appendChild(card('Farbe', '<p>Erst ein Video importieren – dann kannst du hier wie in DaVinci Resolve graden.</p>')); return; }
    if (!c.nodes.length) c.nodes.push(LIB.node('Node 1'));
    var ni = clamp(S.selNode[c.id] || 0, 0, c.nodes.length - 1); S.selNode[c.id] = ni;
    var n = c.nodes[ni], m = S.media[c.mediaId] || {};
    var head = card('', '<div class="color-head"><b>🎨 ' + esc(m.name || 'Clip') + '</b><label class="sw"><input type="checkbox" id="c-byp"' + (S.bypass ? ' checked' : '') + '><span></span> Vorher</label></div>' +
      '<div class="nodes" id="nodes">' + c.nodes.map(function (x, i) {
        return (i ? '<i class="nlink"></i>' : '') + '<button type="button" class="node' + (i === ni ? ' sel' : '') + (x.on ? '' : ' off') + '" data-n="' + i + '"><small>' + ('0' + (i + 1)).slice(-2) + '</small>' + esc(x.name) + '</button>';
      }).join('') + (c.nodes.length < 6 ? '<button type="button" class="node add" id="n-add" aria-label="Node hinzufügen">＋</button>' : '') + '</div>' +
      '<div class="btn-row"><button class="btn sm" id="n-add2">＋ Node</button><button class="btn sm" id="n-tog">' + (n.on ? '⏸ Node aus' : '▶ Node an') + '</button><button class="btn sm" id="n-ren">✎ Name</button><button class="btn sm" id="n-reset">↺ Zurücksetzen</button><button class="btn sm danger" id="n-del">🗑 Node löschen</button></div>' +
      '<canvas id="scope" width="320" height="110" aria-label="Waveform"></canvas>');
    el.appendChild(head);
    $('#c-byp', head).onchange = function () { S.bypass = this.checked; S.dirty = true; };
    $$('[data-n]', head).forEach(function (b) { b.onclick = function () { S.selNode[c.id] = +b.dataset.n; renderPanel(); }; });
    function addNode() { if (c.nodes.length >= 6) return toast('Maximal 6 Nodes'); pushUndo(); c.nodes.splice(ni + 1, 0, LIB.node('Node ' + (c.nodes.length + 1))); S.selNode[c.id] = ni + 1; commit(true); }
    var na = $('#n-add', head); if (na) na.onclick = addNode; $('#n-add2', head).onclick = addNode;
    $('#n-tog', head).onclick = function () { pushUndo(); n.on = !n.on; commit(true); };
    $('#n-ren', head).onclick = function () { var v = prompt('Name für den Node:', n.name); if (v) { pushUndo(); n.name = v.slice(0, 18); commit(true); } };
    $('#n-reset', head).onclick = function () { pushUndo(); c.nodes[ni] = LIB.node(n.name); commit(true); };
    $('#n-del', head).onclick = function () {
      pushUndo();
      if (c.nodes.length === 1) c.nodes[0] = LIB.node('Node 1'); else { c.nodes.splice(ni, 1); S.selNode[c.id] = Math.max(0, ni - 1); }
      commit(true); toast('Node gelöscht');
    };

    var wheels = card('Farbräder', '<div class="wheels">' + [['lift', 'Lift (Schatten)'], ['gamma', 'Gamma (Mitten)'], ['gain', 'Gain (Lichter)'], ['offset', 'Offset (alles)']].map(function (w) {
      return '<div class="wheel" data-w="' + w[0] + '"><canvas width="120" height="120"></canvas><span>' + w[1] + '</span></div>';
    }).join('') + '</div><p class="muted small">Punkt im Rad ziehen = Farbe verschieben. Doppeltippen = zurück auf Mitte.</p>');
    el.appendChild(wheels);
    $$('.wheel', wheels).forEach(function (wd) {
      var key = wd.dataset.w, cv = $('canvas', wd);
      drawWheel(cv, n[key]);
      wheelInput(cv, n[key], function () { drawWheel(cv, n[key]); S.dirty = true; });
      wd.appendChild(slider('', n[key].m, -1, 1, 0.01, function (v) { n[key].m = v; }, sgn));
    });

    var prim = card('Grundkorrektur');
    [['exposure', 'Belichtung', -3, 3, 0.01, sgn], ['contrast', 'Kontrast', 0.3, 2.5, 0.01, pct], ['pivot', 'Pivot', 0.1, 0.9, 0.005, sgn],
      ['sat', 'Sättigung', 0, 2, 0.01, pct], ['hue', 'Farbton', -180, 180, 1, function (v) { return v + '°'; }],
      ['temp', 'Temperatur', -1, 1, 0.01, sgn], ['tint', 'Tönung (Grün/Magenta)', -1, 1, 0.01, sgn],
      ['highlights', 'Lichter', -1, 1, 0.01, sgn], ['shadows', 'Schatten', -1, 1, 0.01, sgn]].forEach(function (r) {
      prim.appendChild(slider(r[1], n[r[0]], r[2], r[3], r[4], function (v) { n[r[0]] = v; }, r[5]));
    });
    el.appendChild(prim);

    var looks = card('Looks (auf diesen Node)', '<div class="tiles">' + S.lib.LOOKS.map(function (l) { return '<button type="button" class="tile" data-look="' + l.id + '"><i>' + l.icon + '</i>' + esc(l.name) + '</button>'; }).join('') + '</div>');
    el.appendChild(looks);
    bindTiles(looks, function (t) { return { t: 'look', id: t.dataset.look }; });

    var tools = card('Grade übertragen', '<div class="btn-row"><button class="btn" id="g-copy">📋 Kopieren</button><button class="btn" id="g-paste"' + (gradeClipboard ? '' : ' disabled') + '>📥 Einfügen</button><button class="btn" id="g-all">🎬 Auf alle Clips</button></div>');
    el.appendChild(tools);
    $('#g-copy', tools).onclick = function () { gradeClipboard = clone(c.nodes); toast('Grade kopiert'); renderPanel(); };
    $('#g-paste', tools).onclick = function () { if (!gradeClipboard) return; pushUndo(); c.nodes = clone(gradeClipboard); commit(true); toast('Grade eingefügt'); };
    $('#g-all', tools).onclick = function () { pushUndo(); var g = clone(c.nodes); S.project.clips.forEach(function (x) { x.nodes = clone(g); }); commit(true); toast('Auf alle Clips übertragen'); };
    S.dirty = true;
  }
  var WHEEL_BG = null;
  function drawWheel(cv, w) {
    var c = cv.getContext('2d'), N = cv.width, r = N / 2 - 4;
    if (!WHEEL_BG) {
      var t = document.createElement('canvas'); t.width = t.height = N; var tc = t.getContext('2d'), id = tc.createImageData(N, N);
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        var dx = (x - N / 2) / r, dy = (N / 2 - y) / r, d = Math.hypot(dx, dy), i = (y * N + x) * 4;
        if (d > 1) continue;
        var a = Math.atan2(dy, dx), rr = Math.cos(a), gg = Math.cos(a - 2.0944), bb = Math.cos(a + 2.0944), k = d * 0.55;
        id.data[i] = 128 + 127 * (rr * k); id.data[i + 1] = 128 + 127 * (gg * k); id.data[i + 2] = 128 + 127 * (bb * k); id.data[i + 3] = 255;
      }
      tc.putImageData(id, 0, 0); WHEEL_BG = t;
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
      var r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width - 0.5) * 2 * (cv.width / 2) / (cv.width / 2 - 4), y = -((e.clientY - r.top) / r.height - 0.5) * 2 * (cv.width / 2) / (cv.width / 2 - 4);
      var d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
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
    var sc = scopeC.getContext('2d'); sc.drawImage(view, 0, 0, 160, 90);
    var d; try { d = sc.getImageData(0, 0, 160, 90).data; } catch (e) { return; }
    var c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.fillStyle = '#16171a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.08)'; for (var g = 0; g <= 4; g++) { c.beginPath(); c.moveTo(0, H * g / 4); c.lineTo(W, H * g / 4); c.stroke(); }
    var cw = W / 3 / 160;
    for (var ch = 0; ch < 3; ch++) {
      c.fillStyle = ['rgba(255,70,70,.35)', 'rgba(70,255,110,.35)', 'rgba(80,150,255,.4)'][ch];
      for (var i = 0; i < d.length; i += 8) {
        var px = (i / 4) % 160; c.fillRect(ch * W / 3 + px * cw, H - 2 - d[i + ch] / 255 * (H - 4), 1.2, 1.2);
      }
    }
  }

  /* ---------- Effekte ---------- */
  var FX_CATS = [['glitch', '⚡ Glitch'], ['motion', '🔍 Zoom & Bewegung'], ['look', '🎞️ Looks'], ['packs', '📦 Pakete'], ['tr', '🔀 Übergänge'],
    ['part', '🔥 Feuer & Partikel'], ['stick', '😎 Sticker'], ['text', '𝐓 Text']];
  function pFx(el) {
    el.innerHTML = '';
    var c = curClip();
    var top = card('', '<div class="chips">' + FX_CATS.map(function (k) { return '<button type="button" data-cat="' + k[0] + '" class="' + (S.fxCat === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>' +
      '<p class="muted small">' + (S.fxCat === 'part' || S.fxCat === 'stick' || S.fxCat === 'text' ? 'Antippen = am Abspielkopf einfügen. Gedrückt halten & ins Bild ziehen = genau dort platzieren.' :
        'Antippen = auf ' + (c ? 'den markierten Clip' : 'den Clip') + ' anwenden. Gedrückt halten & auf einen Clip in der Timeline ziehen.') + '</p>');
    el.appendChild(top);
    $$('[data-cat]', top).forEach(function (b) { b.onclick = function () { S.fxCat = b.dataset.cat; renderPanel(); }; });
    var html = '', getP;
    var tile = function (attrs, icon, name, extra) { return '<button type="button" class="tile" ' + attrs + '><i>' + icon + '</i>' + esc(name) + (extra || '') + '</button>'; };
    switch (S.fxCat) {
      case 'glitch': case 'motion': case 'look':
        html = LIB.FX.filter(function (f) { return f.cat === S.fxCat; }).map(function (f) { return tile('data-fx="' + f.id + '"', f.icon, f.name); }).join('');
        getP = function (t) { return { t: 'fx', id: t.dataset.fx }; }; break;
      case 'packs':
        html = S.lib.PACKS.map(function (p) { return tile('data-pk="' + p.id + '"', p.icon || '📦', p.name, p.custom ? '<em>Admin</em>' : ''); }).join('');
        getP = function (t) { return { t: 'pack', id: t.dataset.pk }; }; break;
      case 'tr':
        html = S.lib.TRANSITIONS.map(function (p) { return tile('data-tr="' + p.id + '"', p.icon, p.name, p.custom ? '<em>Admin</em>' : ''); }).join('');
        getP = function (t) { return { t: 'tr', id: t.dataset.tr }; }; break;
      case 'part':
        html = LIB.PARTICLES.map(function (p) { return tile('data-pt="' + p.id + '"', p.icon, p.name); }).join('');
        getP = function (t) { return { t: 'part', id: t.dataset.pt }; }; break;
      case 'stick':
        html = S.lib.STICKERS.map(function (s, i) { return tile('data-si="' + i + '"', s.src ? '<img src="' + esc(s.src) + '" alt="">' : s.emoji, s.src ? s.name : '', s.custom ? '<em>Admin</em>' : ''); }).join('') +
          '<label class="tile file-btn"><i>🖼️</i>Eigenes Bild<input type="file" id="st-up" accept="image/*"></label>';
        getP = function (t) { var s = S.lib.STICKERS[+t.dataset.si]; return { t: 'sticker', emoji: s.emoji, src: s.src, anim: s.anim }; }; break;
      case 'text':
        html = LIB.TEXT_STYLES.map(function (s) { return tile('data-ts="' + s.id + '"', s.icon, s.name); }).join('');
        getP = function (t) { return { t: 'text', style: t.dataset.ts }; }; break;
    }
    var grid = card('', '<div class="tiles big">' + html + '</div>');
    el.appendChild(grid);
    bindTiles(grid, getP);
    var up = $('#st-up', grid);
    if (up) up.onchange = function () {
      var f = this.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { applyPayload({ t: 'sticker', src: r.result, anim: 'pop' }); }; r.readAsDataURL(f);
    };
    if (c && ['glitch', 'motion', 'look', 'packs'].indexOf(S.fxCat) >= 0) el.appendChild(fxListCard(c));
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
    var selBefore = S.sel;
    var r = AI.run(text, aiApi);
    if (!r.done.length) { S.undo.pop(); S.sel = selBefore; }
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
    'Übergang Whip Pan', 'Text "JZo Entertainment"', 'Konfetti', 'Zeitlupe', 'Retro VHS', 'Flügel wachsen lassen (Higgsfield)'];
  function pAI(el) {
    el.innerHTML = '';
    var c = curClip();
    var a = card('✨ Sag einfach, was passieren soll', '<form id="ai-form" class="ai-form"><textarea id="ai-in" rows="2" placeholder="z. B. „Mach einen Glitch und einen Beat-Zoom auf den Clip“ – du kannst auch das Mikrofon der Tastatur benutzen"></textarea>' +
      '<button class="btn primary big" type="submit">✨ Ausführen</button></form>' +
      '<div class="chips ex">' + EXAMPLES.map(function (x) { return '<button type="button" data-ex="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
      '<p class="muted small">Wirkt auf ' + (selClip() ? 'den markierten Clip' : c ? 'den Clip am Abspielkopf' : '–') + ' (oder „auf alle Clips“ dazusagen).</p>' +
      '<div class="ai-log">' + aiLog.slice(0, 5).map(function (l) {
        return '<div class="ai-entry"><b>„' + esc(l.q) + '“</b>' + (l.done.length ? '<ul>' + l.done.map(function (d) { return '<li>✅ ' + esc(d) + '</li>'; }).join('') + '</ul>' : '<p>' + (l.empty ? 'Erst ein Video importieren.' : l.gen ? 'Das kann nur generative KI – siehe unten 👇' : 'Das habe ich nicht verstanden. Probier z. B. eines der Beispiele.') + '</p>') + '</div>';
      }).join('') + '</div>');
    el.appendChild(a);
    $('#ai-form', a).onsubmit = function (e) { e.preventDefault(); runAI($('#ai-in', a).value); };
    $$('[data-ex]', a).forEach(function (b) { b.onclick = function () { $('#ai-in', a).value = b.dataset.ex.replace(' (Higgsfield)', ''); runAI(b.dataset.ex.replace(' (Higgsfield)', '')); }; });

    var models = S.lib.AI_MODELS, mod = modelFor(S.aiModel), eff = LIB.find(S.lib.AI_EFFECTS, S.aiEffect);
    var g = card('🤖 Generative KI – Higgsfield, Kling, Seedance …',
      '<p class="muted small">Für Effekte, die echt aussehen sollen (Feuer, das die Hand verfolgt, Flügel, Explosionen, Foto zum Leben erwecken). Die App bereitet alles vor, du bestätigst beim Anbieter mit deinem Konto.</p>' +
      '<div class="fld"><span>Modell</span><div class="models">' + models.map(function (m) {
        return '<button type="button" class="model' + (m.id === mod.id ? ' on' : '') + '" data-mod="' + esc(m.id) + '"><b>' + esc(m.name) + '</b><small>' + esc(m.kind || '') + '</small></button>';
      }).join('') + '</div>' + (mod.note ? '<p class="muted small">' + esc(mod.note) + '</p>' : '') + '</div>' +
      '<div class="fld"><span>KI-Effekt</span><div class="tiles">' + S.lib.AI_EFFECTS.map(function (x) { return '<button type="button" class="tile' + (eff && eff.id === x.id ? ' on' : '') + '" data-ae="' + esc(x.id) + '"><i>' + (x.icon || '✨') + '</i>' + esc(x.name) + '</button>'; }).join('') + '</div></div>' +
      '<label class="fld"><span>Beschreibung für die KI (Englisch funktioniert am besten)</span><textarea id="ai-prompt" rows="3">' + esc(eff ? eff.prompt : '') + '</textarea></label>' +
      '<ol class="steps">' +
      '<li><b>Clip sichern:</b> <button class="btn sm" id="g-orig"' + (c ? '' : ' disabled') + '>Originaldatei</button> <button class="btn sm" id="g-cut"' + (c ? '' : ' disabled') + '>Nur geschnittener Teil</button> <button class="btn sm" id="g-frame"' + (c ? '' : ' disabled') + '>Standbild</button></li>' +
      '<li><b>Beschreibung kopieren & ' + esc(mod.name) + ' öffnen:</b> <button class="btn sm primary" id="g-open">📋 Kopieren & öffnen</button></li>' +
      '<li><b>Dort:</b> Clip/Bild hochladen, Beschreibung einfügen, erzeugen, Ergebnis speichern.</li>' +
      '<li><b>Zurückholen:</b> <label class="btn sm file-btn">📥 KI-Ergebnis importieren<input type="file" id="g-imp" accept="video/*,image/*"></label> <span class="muted small">' + (selClip() ? 'ersetzt den markierten Clip (Schnitt-Länge, Farbe & Effekte bleiben)' : 'kommt hinten in die Timeline') + '</span></li></ol>');
    el.appendChild(g);
    $$('[data-mod]', g).forEach(function (b) { b.onclick = function () { S.aiModel = b.dataset.mod; renderPanel(); }; });
    $$('[data-ae]', g).forEach(function (b) { b.onclick = function () { S.aiEffect = b.dataset.ae; var x = LIB.find(S.lib.AI_EFFECTS, S.aiEffect); if (x && x.model) S.aiModel = modelFor(x.model).id; renderPanel(); }; });
    $('#g-open', g).onclick = function () {
      var txt = $('#ai-prompt', g).value.trim();
      if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Beschreibung kopiert – beim Anbieter einfügen'); }, function () {});
      window.open(mod.url, '_blank', 'noopener');
    };
    if (c) {
      $('#g-orig', g).onclick = function () { var m = S.media[c.mediaId]; shareBlob(m.blob, (m.blob.name || (m.name + (m.kind === 'image' ? '.jpg' : '.mp4')))); };
      $('#g-cut', g).onclick = function () { startExport({ from: c._start, to: c._start + clipDur(c), raw: true, name: 'clip-fuer-ki' }); };
      $('#g-frame', g).onclick = function () { saveFrame(); };
    }
    $('#g-imp', g).onchange = function () {
      var f = this.files[0]; if (!f) return; this.value = '';
      var target = selClip();
      readMeta(f).then(function (rec) {
        if (rec.bad) return toast('Datei kann nicht abgespielt werden.');
        S.media[rec.id] = rec;
        Store.put('media', { id: rec.id, name: rec.name, kind: rec.kind, blob: rec.blob, duration: rec.duration, w: rec.w, h: rec.h, thumb: rec.thumb, created: rec.created });
        pushUndo();
        if (target) { dropEl(target.id); target.mediaId = rec.id; target.in = 0; target.out = rec.kind === 'image' ? 4 : rec.duration; toast('Clip durch KI-Ergebnis ersetzt'); }
        else { S.project.clips.push(makeClip(rec)); toast('KI-Ergebnis hinten angefügt'); }
        commit(true);
      });
    };
  }

  /* ---------- Export ---------- */
  var lastExport = null;
  function pExport(el) {
    el.innerHTML = '';
    var a = card('Video erstellen', '<div class="fld"><span>Qualität</span><div class="seg" id="ex-q">' +
      [['720', '720p (schnell)'], ['1080', '1080p (Full HD)']].map(function (q) { return '<button type="button" data-q="' + q[0] + '" class="' + ((S.exQ || '1080') === q[0] ? 'on' : '') + '">' + q[1] + '</button>'; }).join('') + '</div></div>');
    a.appendChild(slider('Am Ende ausblenden', S.project.fadeOut || 0, 0, 4, 0.1, function (v) { S.project.fadeOut = v; }, fmtS));
    var b = document.createElement('div');
    b.innerHTML = '<button class="btn primary big" id="ex-go">🎬 Video erstellen (' + fmt(total()) + ')</button>' +
      '<p class="muted small">Das Video wird in Echtzeit aufgenommen – <b>Bildschirm anlassen und die App nicht verlassen</b>, bis es fertig ist. Danach kannst du es in Fotos sichern oder direkt teilen (Instagram, WhatsApp …).</p>' +
      '<div class="btn-row"><button class="btn" id="ex-frame">📸 Standbild sichern</button></div>' +
      (lastExport ? '<div class="result"><video controls playsinline src="' + lastExport.url + '"></video><div class="btn-row"><button class="btn primary" id="ex-share">📤 Sichern / Teilen</button><a class="btn" download="' + esc(lastExport.name) + '" href="' + lastExport.url + '">⬇️ Herunterladen</a></div></div>' : '');
    a.appendChild(b); el.appendChild(a);
    $$('[data-q]', a).forEach(function (x) { x.onclick = function () { S.exQ = x.dataset.q; renderPanel(); }; });
    $('#ex-go', a).onclick = function () { startExport({ from: 0, to: total() }); };
    $('#ex-frame', a).onclick = saveFrame;
    var sh = $('#ex-share', a); if (sh) sh.onclick = function () { shareBlob(lastExport.blob, lastExport.name); };
  }
  function pickMime() {
    var opts = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < opts.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    return '';
  }
  function startExport(o) {
    if (!S.project.clips.length && !S.project.overlays.length) return toast('Nichts zum Exportieren.');
    if (!window.MediaRecorder || !view.captureStream) return toast('Dieser Browser kann leider keine Videos aufnehmen. Bitte Safari oder Chrome aktuell halten.');
    if (S.playing) setPlaying(false);
    var asp = ASPECTS[S.project.aspect], q = (S.exQ || '1080') === '1080' ? 1080 : 720, sc = q / Math.min(asp[0], asp[1]);
    var w = Math.round(asp[0] * sc / 2) * 2, h = Math.round(asp[1] * sc / 2) * 2;
    ensureAudio();
    var mime = pickMime();
    S.exporting = { from: o.from, to: o.to, chunks: [], name: (o.name || (S.project.name || 'video').replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'video') + (mime.indexOf('mp4') >= 0 ? '.mp4' : '.webm'), mime: mime, raw: o.raw };
    R.resize(w, h);
    var savedSel = S.sel; if (o.raw) S.sel = null;
    var stream = view.captureStream(30);
    if (exportDest) exportDest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
    var rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: q === 1080 ? 12e6 : 6e6 } : undefined); }
    catch (e) { S.exporting = null; sizeView(); return toast('Aufnahme konnte nicht starten: ' + e.message); }
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
    S.time = o.from; S.project.clips.forEach(elFor); S.project.audio.forEach(elFor); unlockMedia();
    S.dirty = true;
    setTimeout(function () { if (!S.exporting) return; rec.start(250); S.playing = true; }, 700);   // kurz warten, bis alle Clips an der richtigen Stelle stehen
  }
  function finishExport() {
    S.playing = false; Object.keys(S.els).forEach(function (k) { var el = S.els[k]; if (el.pause) el.pause(); });
    var ex = S.exporting; if (ex && ex.rec && ex.rec.state !== 'inactive') setTimeout(function () { ex.rec.stop(); }, 150);
  }
  $('#exp-cancel').onclick = function () { if (S.exporting) { S.exporting.cancel = true; finishExport(); } };
  function saveFrame() {
    view.toBlob(function (b) { if (b) shareBlob(b, 'standbild.jpg'); }, 'image/jpeg', 0.92);
  }
  function shareBlob(blob, name) {
    var file = null;
    try { file = new File([blob], name, { type: blob.type || 'application/octet-stream' }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function () {});
    } else {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
  }

  /* ======================= Hinweis-Meldung ======================= */
  var toastT = null;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }

  /* ======================= Bibliothek aus dem Admin-Bereich ======================= */
  function loadLibrary() {
    S.lib = { PACKS: LIB.PACKS.slice(), TRANSITIONS: LIB.TRANSITIONS.slice(), LOOKS: LIB.LOOKS.slice(), STICKERS: LIB.STICKERS.slice(), AI_MODELS: LIB.AI_MODELS.slice(), AI_EFFECTS: LIB.AI_EFFECTS.slice() };
    return fetch('data/library.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
      (d.packs || []).forEach(function (p, i) { if (p && p.name && p.items && p.items.length) S.lib.PACKS.push({ id: 'cp' + i, name: p.name, icon: p.icon || '⭐', custom: true, items: p.items.filter(function (it) { return LIB.fxById(it.fx); }).map(function (it) { return { fx: it.fx, amount: clamp(+it.amount || 0.5, 0, 1) }; }) }); });
      (d.transitions || []).forEach(function (t, i) { var base = LIB.find(LIB.TRANSITIONS, t.base); if (t && t.name && base) S.lib.TRANSITIONS.push({ id: 'ct' + i, name: t.name, icon: t.icon || base.icon, type: base.type, dur: +t.duration || 0.8, custom: true }); });
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
  function init() {
    try { R = new Renderer(view); }
    catch (e) { $('.stage').innerHTML = '<p class="err">Dieses Gerät unterstützt leider kein WebGL – die Vorschau kann nicht angezeigt werden.</p>'; return; }
    $$('.tabbar button').forEach(function (b) { b.onclick = function () { showPage(b.dataset.page); }; });
    $('#ai-btn').onclick = function () { showPage('ai'); setTimeout(function () { var i = $('#ai-in'); if (i) i.focus(); }, 50); };
    $('#play-btn').onclick = function () { setPlaying(!S.playing); };
    $('#start-btn').onclick = function () { setPlaying(false); seek(0); };
    $('#end-btn').onclick = function () { setPlaying(false); seek(total()); };
    $('#split-btn').onclick = splitAt; $('#del-btn').onclick = deleteSel;
    $('#undo-btn').onclick = undo; $('#redo-btn').onclick = redo;
    $('#zin-btn').onclick = function () { zoomTl(1.4); }; $('#zout-btn').onclick = function () { zoomTl(1 / 1.4); };
    document.addEventListener('keydown', function (e) {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
      var k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
      if (k === ' ') { e.preventDefault(); setPlaying(!S.playing); }
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && k === 'b' || k === 'b' && !mod) { e.preventDefault(); splitAt(); }
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
      else if (k === 'arrowleft') { e.preventDefault(); seek(S.time - (e.shiftKey ? 1 : 1 / 30)); }
      else if (k === 'arrowright') { e.preventDefault(); seek(S.time + (e.shiftKey ? 1 : 1 / 30)); }
      else if (k === 'home') seek(0);
      else if (k === 'end') seek(total());
    });
    window.addEventListener('resize', function () { sizeView(); renderTimeline(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S.playing && !S.exporting) setPlaying(false); });

    Promise.all([loadLibrary(), Store.all('media').catch(function () { return []; }), Store.all('projects').catch(function () { return []; })]).then(function (r) {
      r[1].forEach(function (m) { S.media[m.id] = m; });
      var ps = r[2], lastId = null;
      try { lastId = localStorage.getItem('jzo-video-last'); } catch (e) {}
      ps.sort(function (a, b) { return b.updated - a.updated; });
      S.project = ps.filter(function (p) { return p.id === lastId; })[0] || ps[0] || newProject('16:9');
      ['clips', 'audio', 'overlays'].forEach(function (k) { S.project[k] = (S.project[k] || []).filter(function (it) { return k === 'overlays' || S.media[it.mediaId]; }); });
      $('#pj-title').textContent = S.project.name;
      layout(); sizeView(); renderTimeline(); updateUndoBtns();
      showPage(S.project.clips.length ? 'edit' : 'media');
      requestAnimationFrame(loop);
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.JZoVideo = { S: S, importFiles: importFiles, applyPayload: applyPayload, runAI: runAI, showPage: showPage, seek: seek, select: select, startExport: startExport };
  init();
})();
