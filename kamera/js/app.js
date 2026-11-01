/* JZo M – Oberfläche: Sucher, Wählräder, Auslösen, Fotos, Entwickeln, KI-Auflösung, Menü. */
(function () {
  'use strict';
  var L = window.Looks;

  // ---------- Einstellungen (bleiben auf dem Gerät gespeichert) ----------
  var DEF = {
    look: 'standard', adjBy: {}, wb: 'auto', ev: 0, iso: 'A', time: 'A',
    frame: 0, cropMode: false, format: '3:2', res: 'L', quality: 0.92, timer: 0, sound: true,
    peak: 'off', histo: true, grid: 'off', level: true, mainF: 24, teleF: 77, lensId: null,
    aiFactor: 2, aiModel: 'slim', aiMax: 48
  };
  var S = (function () {
    var o = {}; try { o = JSON.parse(localStorage.getItem('jzo-m') || '{}') || {}; } catch (e) { o = {}; }
    var s = {}; for (var k in DEF) s[k] = (k in o) ? o[k] : JSON.parse(JSON.stringify(DEF[k]));
    if (!L.byId(s.look)) s.look = 'standard';
    return s;
  })();
  function save() { try { localStorage.setItem('jzo-m', JSON.stringify(S)); } catch (e) { /* privat */ } }
  function adjOf(st) { st.adjBy = st.adjBy || {}; return st.adjBy[st.look] || (st.adjBy[st.look] = {}); }
  function setOf(st) { return { look: st.look, adj: adjOf(st), wb: st.wb, ev: st.ev, iso: st.iso, time: st.time }; }
  function snap(st) { var o = JSON.parse(JSON.stringify(setOf(st))); o.seed = Math.round(Math.random() * 997); return o; }

  // ---------- Helfer ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mp(px) { return (px / 1e6).toFixed(1).replace('.', ',') + ' MP'; }
  function mb(b) { return b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  var toastT = 0;
  function toast(t, ms) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, ms || 2200); }
  function fileName(t, suffix) {
    var d = new Date(t); function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'JZoM_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + (suffix || '') + '.jpg';
  }
  function decode(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob).catch(function () { return viaImg(blob); });
    return viaImg(blob);
  }
  function viaImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 2000); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Dieses Bildformat kann der Browser nicht öffnen')); };
      im.src = u;
    });
  }
  function canvasBlob(c, q) { return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('Bild konnte nicht erstellt werden')); }, 'image/jpeg', q); }); }
  function makeThumb(src) {
    return decode(src).then(function (im) {
      var s = 360, c = document.createElement('canvas'); c.width = s; c.height = s;
      var w = im.width, hh = im.height, m = Math.min(w, hh), x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, (w - m) / 2, (hh - m) / 2, m, m, 0, 0, s, s);
      if (im.close) im.close();
      return canvasBlob(c, 0.8);
    });
  }
  function exifFor(set, w, hh, extra) {
    var lk = L.byId(set.look);
    return Exif.build({ desc: 'JZo M - Look ' + (lk ? lk.name : '') + (extra || ''), w: w, h: hh, date: new Date() });
  }

  // ---------- WebGL ----------
  var video = $('video'), view = $('view'), overlay = $('overlay'), finder = $('finder'), wrap = $('finder-wrap');
  var pipe = null, proc = null;
  function getPipe() { if (!pipe) pipe = new Pipeline(view, { preserve: false }); return pipe; }
  function getProc() { if (!proc) proc = new Pipeline(document.createElement('canvas'), { preserve: true }); return proc; }

  // ---------- Kamera ----------
  var stream = null, track = null, lenses = [], lens = null, camOn = false, camWanted = false;
  function stopCamera() {
    camOn = false;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; track = null;
  }
  function startCamera(deviceId) {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('Dieser Browser erlaubt keinen Kamerazugriff (bitte Safari verwenden).'));
    var v = { width: { ideal: 4032 }, height: { ideal: 3024 }, frameRate: { ideal: 30 } };
    if (deviceId) v.deviceId = { exact: deviceId }; else v.facingMode = { ideal: 'environment' };
    return navigator.mediaDevices.getUserMedia({ video: v, audio: false }).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
      return navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false });
    }).then(function (st) {
      stream = st; track = st.getVideoTracks()[0];
      video.srcObject = st;
      return video.play().catch(function () {});
    }).then(function () {
      camOn = true; camWanted = true; sizeDirty = true;
      return listLenses();
    });
  }
  function classify(label) {
    var l = (label || '').toLowerCase();
    if (/front|vorder|facetime|user|selfie/.test(l)) return 'front';
    if (/ultra/.test(l)) return 'ultra';
    if (/tele/.test(l)) return 'tele';
    if (/dual|triple|dreifach|zweifach/.test(l)) return 'virtual';
    return 'wide';
  }
  function focal(kind) { return kind === 'ultra' ? 13 : kind === 'tele' ? S.teleF : kind === 'front' ? 23 : S.mainF; }
  function listLenses() {
    return navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var cur = track && track.getSettings ? track.getSettings().deviceId : null;
      var vids = ds.filter(function (d) { return d.kind === 'videoinput'; });
      var list = vids.map(function (d) { return { id: d.deviceId, label: d.label, kind: classify(d.label) }; })
        .filter(function (d) { return d.kind !== 'virtual'; });
      // Pro Linsenart nur einen Eintrag (bevorzugt die gerade aktive)
      var byKind = {};
      list.forEach(function (d) { if (!byKind[d.kind] || d.id === cur) byKind[d.kind] = d; });
      list = Object.keys(byKind).map(function (k) { return byKind[k]; });
      var order = { ultra: 0, wide: 1, tele: 2, front: 3 };
      list.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
      list.forEach(function (d) { d.f = focal(d.kind); });
      lenses = list;
      lens = list.filter(function (d) { return d.id === cur; })[0] || list.filter(function (d) { return d.kind === 'wide'; })[0] || list[0] || { id: cur, kind: 'wide', f: S.mainF };
      if (vids.length === 1 && lens) { lens.f = S.mainF; }
      renderLenses(); renderAll();
    }).catch(function () { renderLenses(); });
  }
  function lensLabel(d) {
    if (d.kind === 'front') return '⟲';
    if (d.kind === 'ultra') return '0,5';
    if (d.kind === 'tele') return Math.round(S.teleF / S.mainF) + '×';
    return '1×';
  }
  function renderLenses() {
    var box = $('lenses'); box.innerHTML = '';
    if (lenses.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    lenses.forEach(function (d) {
      var b = h('button', 'lens-b' + (lens && d.id === lens.id ? ' on' : ''), esc(lensLabel(d)));
      b.type = 'button'; b.title = d.label + ' (' + d.f + ' mm)';
      b.onclick = function () {
        if (lens && d.id === lens.id) return;
        S.lensId = d.id; save();
        startCamera(d.id).then(function () { toast(d.kind === 'front' ? 'Selfie-Kamera' : d.f + ' mm'); }).catch(camError);
      };
      box.appendChild(b);
    });
  }
  function camError(e) {
    var msg = (e && e.name === 'NotAllowedError')
      ? 'Kamera-Zugriff nicht erlaubt. iPhone: Einstellungen → Apps → Safari → Kamera → „Erlauben“. Danach neu einschalten.'
      : 'Kamera konnte nicht gestartet werden: ' + (e && e.message ? e.message : e);
    $('start').hidden = false; $('start-msg').textContent = msg;
    toast('Kamera nicht verfügbar', 3000);
  }

  // ---------- Bewegungssensor: Wasserwaage + automatische Hoch-/Querformat-Erkennung ----------
  var tilt = { ok: false, dev: 0, flat: true };
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    var b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    var gx = Math.cos(b) * Math.sin(g), gy = -Math.sin(b), gz = -Math.cos(b) * Math.cos(g);
    tilt.flat = Math.abs(gz) > 0.92;
    if (!tilt.flat) { tilt.dev = Math.atan2(-gx, -gy) * 180 / Math.PI; tilt.ok = true; }
  }
  var motionAsked = false;
  function requestMotion() {
    if (motionAsked) return Promise.resolve(); motionAsked = true;
    var D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      return D.requestPermission().then(function (r) { if (r === 'granted') window.addEventListener('deviceorientation', onOri); }).catch(function () {});
    }
    window.addEventListener('deviceorientation', onOri);
    return Promise.resolve();
  }
  function uiAngle() { if (typeof window.orientation === 'number') return window.orientation; return (screen.orientation && screen.orientation.angle) || 0; }
  function relTilt() {
    var d = ((tilt.dev - uiAngle()) % 360 + 540) % 360 - 180;
    var k = Math.round(d / 90);
    return { k: ((k % 4) + 4) % 4, res: d - k * 90 };
  }
  var lastK = 0;
  function captureRot() {
    if (!tilt.ok) return 0;
    if (!tilt.flat) lastK = relTilt().k;
    return (4 - lastK) % 4;
  }

  // ---------- Ton ----------
  var actx = null;
  function unlockAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function shutterSound() {
    if (!actx || !S.sound) return;
    var t = actx.currentTime;
    [[0, 3600, 0.55], [0.06, 2400, 0.4]].forEach(function (c) {
      var n = Math.floor(actx.sampleRate * 0.035), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 5);
      var s = actx.createBufferSource(); s.buffer = buf;
      var f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = c[1]; f.Q.value = 0.8;
      var g = actx.createGain(); g.gain.value = c[2];
      s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t + c[0]);
    });
  }
  function beep(hi) {
    if (!actx || !S.sound) return;
    var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = hi ? 1760 : 1320; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.13);
  }

  // ---------- Sucher-Geometrie ----------
  function fmt() { return L.FORMATS.filter(function (f) { return f.id === S.format; })[0] || L.FORMATS[0]; }
  function resF() { return (L.RES.filter(function (r) { return r.id === S.res; })[0] || L.RES[0]).f; }
  function lensF() { return lens ? lens.f : S.mainF; }
  function geom() {
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    var F = fmt(), a = F.w / F.h; if (vh > vw) a = 1 / a;
    var va = vw / vh, cw = 1, ch = 1;
    if (va > a) cw = a / va; else ch = va / a;
    var base = [(1 - cw) / 2, (1 - ch) / 2, cw, ch], fr = null, lf = lensF();
    if (S.frame && S.frame > lf + 0.5) { var s = lf / S.frame; fr = [0.5 - cw * s / 2, 0.5 - ch * s / 2, cw * s, ch * s]; }
    return { vw: vw, vh: vh, base: base, frame: fr, crop: (S.cropMode && fr) ? fr : base };
  }
  function outSize(g) {
    var f = resF(), w = g.crop[2] * g.vw * f, hh = g.crop[3] * g.vh * f;
    return { w: Math.round(w), h: Math.round(hh) };
  }

  var sizeDirty = true, lastAsp = 0, viewW = 0, viewH = 0, dispW = 0, dispH = 0, dpr = 1;
  function layoutFinder(asp) {
    var W = wrap.clientWidth - 16, H = wrap.clientHeight - 8;
    if (W < 10 || H < 10) return;
    var w = W, hh = w / asp; if (hh > H) { hh = H; w = hh * asp; }
    dispW = Math.floor(w); dispH = Math.floor(hh);
    finder.style.width = dispW + 'px'; finder.style.height = dispH + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var k = Math.min(1, 1600 / (Math.max(dispW, dispH) * dpr));
    viewW = Math.round(dispW * dpr * k); viewH = Math.round(dispH * dpr * k);
    overlay.width = Math.round(dispW * dpr); overlay.height = Math.round(dispH * dpr);
    lastAsp = asp; sizeDirty = false; overlayDirty = true;
  }
  window.addEventListener('resize', function () { sizeDirty = true; });
  if (window.ResizeObserver) new ResizeObserver(function () { sizeDirty = true; }).observe(wrap);
  window.addEventListener('orientationchange', function () { setTimeout(function () { sizeDirty = true; }, 250); });

  // ---------- Live-Sucher ----------
  var PEAK = { rot: [1, 0.15, 0.1], blau: [0.25, 0.6, 1], gruen: [0.25, 1, 0.35], weiss: [1, 1, 1] };
  var paused = false, frameN = 0, overlayDirty = true;
  var hc = document.createElement('canvas'); hc.width = 64; hc.height = 40;
  var hx = hc.getContext('2d', { willReadFrequently: true });
  function loop() {
    requestAnimationFrame(loop);
    if (!camOn || paused || video.readyState < 2) return;
    var g = geom(); if (!g) return;
    var asp = (g.crop[2] * g.vw) / (g.crop[3] * g.vh);
    if (sizeDirty || Math.abs(asp - lastAsp) > 0.002) { layoutFinder(asp); renderStatus(); }
    if (!viewW) return;
    var p;
    try { p = getPipe(); } catch (e) { toast('WebGL fehlt – Vorschau nicht möglich'); paused = true; return; }
    p.setSource(video, g.vw, g.vh);
    frameN++;
    p.draw(L.params(setOf(S)), { outW: viewW, outH: viewH, crop: g.crop, rot: 0, peak: PEAK[S.peak] || null, seed: (frameN * 7.31) % 997 });
    if (S.histo && frameN % 5 === 0) drawHisto();
    if (overlayDirty || (S.level && tilt.ok)) drawOverlay(g);
  }
  function drawHisto() {
    var c = $('histo');
    hx.drawImage(view, 0, 0, hc.width, hc.height);
    var d = hx.getImageData(0, 0, hc.width, hc.height).data, bins = new Array(64).fill(0), mx = 1, i;
    for (i = 0; i < d.length; i += 4) { var l = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) | 0; bins[l >> 2]++; }
    for (i = 1; i < 63; i++) mx = Math.max(mx, bins[i]);
    var x = c.getContext('2d'), W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.moveTo(0, H);
    for (i = 0; i < 64; i++) x.lineTo(i * W / 63, H - Math.min(1, bins[i] / mx) * (H - 2));
    x.lineTo(W, H); x.fill();
    if (bins[63] > d.length / 4 * 0.02) { x.fillStyle = '#ff5a3c'; x.fillRect(W - 4, 0, 4, H); }
    if (bins[0] > d.length / 4 * 0.02) { x.fillStyle = '#3c8cff'; x.fillRect(0, 0, 4, H); }
  }
  function drawOverlay(g) {
    overlayDirty = false;
    var x = overlay.getContext('2d'), W = overlay.width, H = overlay.height, k = dpr;
    x.clearRect(0, 0, W, H);
    // Gitter
    if (S.grid !== 'off') {
      var nx = S.grid === '3' ? 3 : 6, ny = S.grid === '3' ? 3 : 4;
      x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = k * 0.8; x.beginPath();
      for (var i = 1; i < nx; i++) { x.moveTo(W * i / nx, 0); x.lineTo(W * i / nx, H); }
      for (var j = 1; j < ny; j++) { x.moveTo(0, H * j / ny); x.lineTo(W, H * j / ny); }
      x.stroke();
    }
    // Leuchtrahmen (wie im Messsucher)
    if (g.frame && !S.cropMode) {
      var b = g.base, f = g.frame;
      var rx = (f[0] - b[0]) / b[2] * W, ry = (f[1] - b[1]) / b[3] * H, rw = f[2] / b[2] * W, rh = f[3] / b[3] * H;
      x.save();
      x.shadowColor = 'rgba(255,230,170,.9)'; x.shadowBlur = 6 * k;
      x.strokeStyle = 'rgba(255,244,214,.95)'; x.lineWidth = 1.6 * k;
      x.strokeRect(rx, ry, rw, rh);
      var t = Math.min(rw, rh) * 0.06; x.lineWidth = 3 * k; x.beginPath();
      [[rx, ry, 1, 1], [rx + rw, ry, -1, 1], [rx, ry + rh, 1, -1], [rx + rw, ry + rh, -1, -1]].forEach(function (c) {
        x.moveTo(c[0] + c[2] * t, c[1]); x.lineTo(c[0], c[1]); x.lineTo(c[0], c[1] + c[3] * t);
      });
      x.stroke();
      x.shadowBlur = 0; x.fillStyle = 'rgba(255,244,214,.95)'; x.font = '600 ' + Math.round(11 * k) + 'px -apple-system, sans-serif';
      x.fillText(S.frame + ' mm', rx + 6 * k, ry + 15 * k);
      x.fillStyle = 'rgba(0,0,0,.18)';
      x.fillRect(0, 0, W, ry); x.fillRect(0, ry + rh, W, H - ry - rh); x.fillRect(0, ry, rx, rh); x.fillRect(rx + rw, ry, W - rx - rw, rh);
      x.restore();
    }
    // Wasserwaage
    if (S.level && tilt.ok && !tilt.flat) {
      var r = relTilt(), ok = Math.abs(r.res) < 1, len = Math.min(W, H) * 0.32;
      x.save(); x.translate(W / 2, H / 2);
      x.strokeStyle = ok ? 'rgba(125,220,138,.95)' : 'rgba(255,255,255,.8)'; x.lineWidth = 1.6 * k;
      x.beginPath(); x.moveTo(-len - 14 * k, 0); x.lineTo(-len, 0); x.moveTo(len, 0); x.lineTo(len + 14 * k, 0); x.stroke();
      x.rotate(r.res * Math.PI / 180);
      x.beginPath(); x.moveTo(-len, 0); x.lineTo(-10 * k, 0); x.moveTo(10 * k, 0); x.lineTo(len, 0); x.stroke();
      x.restore();
    }
  }

  // ---------- Wählräder ----------
  function wbObj() { return L.WB.filter(function (w) { return w.id === S.wb; })[0] || L.WB[0]; }
  var DIALS = [
    { id: 'look', label: 'Look', val: function () { return L.byId(S.look).name; } },
    { id: 'time', label: 'Zeit', val: function () { return S.time; } },
    { id: 'iso', label: 'ISO', val: function () { return String(S.iso); } },
    { id: 'ev', label: 'EV', val: function () { return L.evText(S.ev); } },
    { id: 'wb', label: 'WB', val: function () { return wbObj().short; } },
    { id: 'frame', label: 'Rahmen', val: function () { return S.frame ? S.frame + (S.cropMode ? ' ✂' : '') : '—'; } },
    { id: 'format', label: 'Format', val: function () { return S.format; } }
  ];
  var openDial = null;
  function renderDials() {
    var box = $('dials'); box.innerHTML = '';
    DIALS.forEach(function (d) {
      var b = h('button', 'dial' + (openDial === d.id ? ' on' : ''), '<b>' + esc(d.val()) + '</b><i>' + d.label + '</i>');
      b.type = 'button';
      b.onclick = function () { openDial = openDial === d.id ? null : d.id; renderDials(); renderPicker(true); };
      box.appendChild(b);
    });
  }
  function chip(label, on, fn, dis) {
    var b = h('button', 'chip' + (on ? ' on' : ''), label); b.type = 'button'; if (dis) b.disabled = true;
    b.onclick = fn; return b;
  }
  function renderPicker(scroll) {
    var pk = $('picker');
    if (!openDial) { pk.hidden = true; sizeDirty = true; return; }
    pk.hidden = false; pk.innerHTML = '';
    var row = h('div', 'chips'), desc = h('div', 'pick-desc');
    function set(k, v) { return function () { S[k] = v; save(); renderAll(); }; }
    if (openDial === 'look') {
      L.LOOKS.forEach(function (lk) { row.appendChild(chip(esc(lk.name), S.look === lk.id, set('look', lk.id))); });
      var cur = L.byId(S.look); desc.textContent = cur.desc + ' · Feinabstimmung: ◐ oben rechts';
    } else if (openDial === 'time') {
      L.TIME.forEach(function (t) { row.appendChild(chip(t, S.time === t, set('time', t))); });
      desc.textContent = S.time === 'A' ? 'A = Automatik. Zeiten sind simuliert (Helligkeit & Rauschen), das iPhone belichtet selbst.' : (S.iso === 'A' ? 'Mit ISO A: Helligkeit bleibt, Auto-ISO gleicht aus.' : 'Manuell: Zeit + ISO bestimmen die Helligkeit (simuliert).');
    } else if (openDial === 'iso') {
      L.ISO.forEach(function (v) { row.appendChild(chip(String(v), S.iso === v, set('iso', v))); });
      desc.textContent = S.time === 'A' ? 'Höhere ISO = mehr Korn/Rauschen, Helligkeit bleibt (Zeit-Automatik). Simuliert.' : 'Zeit + ISO manuell = Helligkeit simuliert wie an der echten Kamera.';
    } else if (openDial === 'ev') {
      L.EV.forEach(function (v) { row.appendChild(chip(L.evText(v), Math.abs(S.ev - v) < 0.01, set('ev', v))); });
      desc.textContent = 'Belichtungskorrektur in Drittelstufen.';
    } else if (openDial === 'wb') {
      L.WB.forEach(function (w) { row.appendChild(chip(w.short + '<small>' + w.name + '</small>', S.wb === w.id, set('wb', w.id))); });
      desc.textContent = 'Weißabgleich (Verschiebung gegenüber dem automatischen Abgleich).';
    } else if (openDial === 'frame') {
      var lf = lensF();
      L.FRAMES.forEach(function (f) {
        var lab = f ? f + ' mm' : 'Linse (' + lf + ' mm)';
        row.appendChild(chip(lab, S.frame === f || (f === 0 && S.frame && S.frame <= lf), set('frame', f), f && f <= lf + 0.5));
      });
      row.appendChild(chip(S.cropMode ? '✂ Zuschneiden: an' : '✂ Zuschneiden: aus', S.cropMode, function () { S.cropMode = !S.cropMode; save(); renderAll(); }));
      desc.textContent = S.cropMode ? 'Foto wird auf den Rahmen zugeschnitten (wie Digitalzoom). Weniger Pixel → danach KI-Auflösung nutzen.' : 'Leuchtrahmen wie im Messsucher – das Foto bleibt voll. „Zuschneiden“ für echten Ausschnitt.';
    } else if (openDial === 'format') {
      L.FORMATS.forEach(function (f) { row.appendChild(chip(f.name, S.format === f.id, set('format', f.id))); });
      desc.textContent = '3:2 ist das klassische Kleinbild-Format.';
    }
    pk.appendChild(row); pk.appendChild(desc);
    if (scroll) { var on = row.querySelector('.chip.on'); if (on) setTimeout(function () { on.scrollIntoView({ inline: 'center', block: 'nearest' }); }, 0); }
    sizeDirty = true;
  }
  function renderStatus() {
    var g = geom(), s = '<span class="lk">' + esc(L.byId(S.look).name) + '</span><span>' + esc(wbObj().short) + '</span>';
    if (g) { var o = outSize(g); s += '<span>' + S.res + ' · ' + mp(o.w * o.h) + '</span>'; }
    $('status').innerHTML = s;
    var t = [S.time === 'A' ? 'A' : S.time, 'ISO ' + S.iso, L.evText(S.ev), (S.frame && S.frame > lensF() ? S.frame : lensF()) + 'mm'];
    if (S.timer) t.push('⏱' + S.timer + 's');
    $('evf').textContent = t.join('   ');
    $('histo').hidden = !S.histo;
  }
  function renderAll() {
    var y = $('picker').querySelector('.chips'), sx = y ? y.scrollLeft : 0;
    renderDials(); renderPicker(false); renderStatus(); overlayDirty = true;
    y = $('picker').querySelector('.chips'); if (y) y.scrollLeft = sx;
  }

  // ---------- Auslösen ----------
  var busy = false;
  function shoot() {
    if (busy) return;
    unlockAudio();
    if (!camOn) { toast('Erst „Einschalten“ tippen'); return; }
    if (S.timer) { busy = true; countdown(S.timer).then(function () { busy = false; doShoot(); }); }
    else doShoot();
  }
  function countdown(n) {
    var el = $('countdown');
    return new Promise(function (res) {
      (function tick() {
        if (n <= 0) { el.textContent = ''; res(); return; }
        el.textContent = n; beep(n <= 2); n--; setTimeout(tick, 1000);
      })();
    });
  }
  function doShoot() {
    var g = geom(); if (!g) return;
    busy = true; $('shutter').classList.add('busy');
    shutterSound();
    var fl = $('flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
    var p, rot = captureRot(), o = outSize(g);
    try { p = getProc(); } catch (e) { toast('WebGL fehlt'); busy = false; return; }
    var k = Math.min(1, Math.sqrt(maxCanvasArea() / (o.w * o.h)), p.maxOut / Math.max(o.w, o.h));
    var cw = Math.floor(o.w * k), ch = Math.floor(o.h * k);
    var outW = rot % 2 ? ch : cw, outH = rot % 2 ? cw : ch;
    p.setSource(video, g.vw, g.vh);
    var set = snap(S), P = L.params(set), G = { outW: outW, outH: outH, crop: g.crop.slice(), rot: rot, seed: set.seed };
    var rec = { id: Store.uid(), t: Date.now(), w: outW, h: outH, src: 'kamera', set: set };
    p.draw(null, G);
    p.toBlob(0.95).then(function (b) {
      rec.orig = b; p.draw(P, G); return p.toBlob(S.quality);
    }).then(function (b) {
      return Exif.insert(b, exifFor(set, outW, outH));
    }).then(function (b) {
      rec.out = b; return makeThumb(b);
    }).then(function (th) {
      rec.thumb = th; return Store.put(rec);
    }).then(function () {
      setThumb(rec.thumb); toast('Gespeichert ✓ · ' + mp(outW * outH), 1400);
    }).catch(function (e) {
      toast('Fehler beim Speichern: ' + (e && e.message ? e.message : e), 4000);
    }).then(function () { busy = false; $('shutter').classList.remove('busy'); });
  }
  var thumbUrl = null;
  function setThumb(blob) {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = blob ? URL.createObjectURL(blob) : null;
    if (thumbUrl) $('gal-thumb').src = thumbUrl; else $('gal-thumb').removeAttribute('src');
  }

  // ---------- Ebenen ----------
  var layers = [];
  function layer(title, opt) {
    opt = opt || {};
    var el = h('div', 'layer' + (opt.sheet ? ' sheet' : ''));
    el.innerHTML = '<div class="l-head"><button class="ic l-x" type="button" aria-label="Schließen">✕</button><h2></h2>' + (opt.right || '') + '</div>' + (opt.body === false ? '' : '<div class="l-body"></div>');
    el.querySelector('h2').textContent = title;
    el.querySelector('.l-x').onclick = function () { closeLayer(el); };
    el._close = opt.onclose; el._sheet = !!opt.sheet;
    document.body.appendChild(el); layers.push(el); updatePause();
    return el;
  }
  function closeLayer(el) {
    if (el._close) { try { el._close(); } catch (e) { /* egal */ } }
    el.remove(); layers = layers.filter(function (x) { return x !== el; }); updatePause();
  }
  function updatePause() { paused = layers.some(function (l) { return !l._sheet; }); }

  function segSet(label, opts, cur, onPick, hint) {
    var box = h('div', 'set'); box.appendChild(h('div', 'lbl', esc(label)));
    var seg = h('div', 'seg');
    opts.forEach(function (o) {
      var b = h('button', o[0] === cur ? 'on' : '', esc(o[1])); b.type = 'button';
      b.onclick = function () { seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); onPick(o[0]); };
      seg.appendChild(b);
    });
    box.appendChild(seg);
    if (hint) box.appendChild(h('div', 'hint', hint));
    return box;
  }
  function sOpt(key, opts, after) { return function (v) { S[key] = v; save(); renderAll(); if (after) after(v); }; }

  // ---------- Menü ----------
  function openMenu() {
    var el = layer('Menü'), b = el.querySelector('.l-body');
    var g = geom();
    var gA = h('div', 'grp', '<h3>Aufnahme</h3>');
    gA.appendChild(segSet('Bildstil', [['x', 'Look & Feinabstimmung öffnen …']], null, function () { closeLayer(el); openStyle(); }));
    gA.appendChild(segSet('Auflösung', L.RES.map(function (r) {
      var t = r.name; if (g) { var o = { w: g.crop[2] * g.vw * r.f, h: g.crop[3] * g.vh * r.f }; t = r.id + ' · ' + mp(o.w * o.h); }
      return [r.id, t];
    }), S.res, sOpt('res'), 'Mehr Pixel nachträglich: Foto öffnen → „KI-Auflösung“.'));
    gA.appendChild(segSet('JPEG-Qualität', [[0.88, 'Gut'], [0.92, 'Hoch'], [0.96, 'Sehr hoch']], S.quality, sOpt('quality')));
    gA.appendChild(segSet('Format', L.FORMATS.map(function (f) { return [f.id, f.name]; }), S.format, sOpt('format')));
    gA.appendChild(segSet('Leuchtrahmen', [[false, 'Nur anzeigen'], [true, 'Zuschneiden']], S.cropMode, sOpt('cropMode')));
    gA.appendChild(segSet('Selbstauslöser', [[0, 'Aus'], [2, '2 s'], [12, '12 s']], S.timer, sOpt('timer')));
    gA.appendChild(segSet('Auslösegeräusch', [[true, 'An'], [false, 'Aus']], S.sound, sOpt('sound'), 'Hinweis: Ist der Lautlos-Schalter am iPhone an, bleibt es still.'));
    b.appendChild(gA);

    var gD = h('div', 'grp', '<h3>Anzeige</h3>');
    gD.appendChild(segSet('Fokus-Peaking', [['off', 'Aus'], ['rot', 'Rot'], ['blau', 'Blau'], ['gruen', 'Grün'], ['weiss', 'Weiß']], S.peak, sOpt('peak'), 'Markiert scharfe Kanten farbig – zeigt, wo die Schärfe liegt.'));
    gD.appendChild(segSet('Histogramm', [[true, 'An'], [false, 'Aus']], S.histo, sOpt('histo')));
    gD.appendChild(segSet('Gitter', [['off', 'Aus'], ['3', '3 × 3'], ['6', '6 × 4']], S.grid, sOpt('grid')));
    gD.appendChild(segSet('Wasserwaage', [[true, 'An'], [false, 'Aus']], S.level, sOpt('level', function (v) { if (v) requestMotion(); }), tilt.ok ? 'Bewegungssensor aktiv – Fotos werden auch automatisch richtig gedreht (hoch/quer).' : 'Bewegungssensor noch nicht freigegeben/verfügbar (am Mac normal).'));
    b.appendChild(gD);

    var gO = h('div', 'grp', '<h3>Objektive</h3>');
    gO.appendChild(segSet('Hauptkamera (1×) entspricht', [[24, '24 mm'], [26, '26 mm'], [28, '28 mm']], S.mainF, sOpt('mainF', function () { listLenses(); }), 'iPhone 14 Pro und neuer: 24 mm. Ältere Modelle: 26 mm.'));
    gO.appendChild(segSet('Tele-Kamera entspricht', [[48, '48 mm (2×)'], [77, '77 mm (3×)'], [120, '120 mm (5×)']], S.teleF, sOpt('teleF', function () { listLenses(); }), 'Wird für die Leuchtrahmen gebraucht (z. B. 90 mm auf der Tele-Linse).'));
    b.appendChild(gO);

    var gK = h('div', 'grp', '<h3>KI-Auflösung</h3>');
    gK.appendChild(segSet('Obergrenze', [[24, '24 MP'], [48, '48 MP'], [64, '64 MP']], S.aiMax, sOpt('aiMax'), 'Größere Bilder brauchen länger und mehr Speicher.'));
    b.appendChild(gK);

    var gI = h('div', 'grp info', '<h3>Info</h3>');
    var info = h('div', 'set');
    var cam = g ? g.vw + ' × ' + g.vh + ' (' + mp(g.vw * g.vh) + ')' : '– (Kamera aus)';
    info.innerHTML =
      '<p><b>Kamera liefert:</b> ' + cam + (lens ? ' · ' + esc(lens.label || '') : '') + '</p>' +
      '<p><b>Speichern:</b> Jedes Foto wird sofort in der App gesichert – nur auf diesem Gerät. In die Fotos-App: Foto öffnen → „Teilen“ → „Bild sichern“. Mehrere auf einmal: Fotos → „Auswählen“.</p>' +
      '<p><b>Wichtig:</b> Wer in Safari „Verlauf und Websitedaten löschen“ tippt, löscht auch die Fotos in der App. Gute Fotos also in die Fotos-App sichern.</p>' +
      '<p><b>Zeit & ISO</b> sind simuliert: Das iPhone belichtet selbst, die Räder ändern Helligkeit und Rauschen wie an einer echten Kamera. Echte Verschlusszeit/ISO lässt Safari nicht zu.</p>' +
      '<p><b>Looks</b> sind eigene Nachbauten im klassischen Messsucher-Stil – keine Original-Profile eines Kameraherstellers.</p>' +
      '<p><b>KI-Auflösung</b> rechnet komplett auf dem iPhone (kein Server, keine Kosten). Beim ersten Mal werden ca. 2–4 MB KI-Daten geladen.</p>' +
      '<p id="mem">Speicher: …</p>';
    gI.appendChild(info); b.appendChild(gI);
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      var m = el.querySelector('#mem'); if (m) m.innerHTML = '<b>Speicher:</b> ' + mb(e.usage || 0) + ' belegt' + (e.quota ? ' von ca. ' + mb(e.quota) : '');
    });
  }

  // ---------- Bildstil (Look + Feinabstimmung) – als Panel für Kamera und Entwickeln ----------
  var SLIDERS = [
    { k: 'con', n: 'Kontrast', min: -2, max: 2 },
    { k: 'hi', n: 'Lichter', min: -2, max: 2 },
    { k: 'sh', n: 'Schatten', min: -2, max: 2 },
    { k: 'sat', n: 'Sättigung', min: -2, max: 2, color: true },
    { k: 'warm', n: 'Wärme', min: -2, max: 2 },
    { k: 'sharp', n: 'Schärfe', min: -2, max: 2 },
    { k: 'grain', n: 'Korn', min: -2, max: 4 },
    { k: 'grainSize', n: 'Korngröße', min: -2, max: 3 },
    { k: 'vig', n: 'Vignette', min: -2, max: 4 },
    { k: 'tone', n: 'Tonung', min: -2, max: 2, mono: true }
  ];
  function fmtAdj(v) { v = Number(v) || 0; return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toString().replace('.', ','); }
  function stylePanel(box, st, onChange, withExposure) {
    function build() {
      box.innerHTML = '';
      var lk = L.byId(st.look);
      var row = h('div', 'chips'); row.style.padding = '2px 0 8px';
      L.LOOKS.forEach(function (x) { row.appendChild(chip(esc(x.name), st.look === x.id, function () { st.look = x.id; onChange(); build(); })); });
      box.appendChild(row);
      box.appendChild(h('div', 'pick-desc', esc(lk.desc)));
      if (withExposure) {
        var e = h('div', 'sl', '<span>Belichtung</span><input type="range" min="-3" max="3" step="0.333333"><output></output>');
        var ei = e.querySelector('input'), eo = e.querySelector('output'); ei.value = st.ev || 0; eo.textContent = L.evText(st.ev || 0);
        ei.oninput = function () { st.ev = Math.round(Number(ei.value) * 3) / 3; eo.textContent = L.evText(st.ev); onChange(); };
        box.appendChild(e);
        var w = h('div', 'chips'); w.style.padding = '4px 0 6px';
        L.WB.forEach(function (x) { w.appendChild(chip(x.short + '<small>' + x.name + '</small>', st.wb === x.id, function () { st.wb = x.id; onChange(); build(); })); });
        box.appendChild(w);
      }
      var a = adjOf(st);
      SLIDERS.forEach(function (s) {
        if (s.mono && !lk.p.mono) return;
        if (s.color && lk.p.mono) return;
        var r = h('div', 'sl', '<span>' + s.n + '</span><input type="range" min="' + s.min + '" max="' + s.max + '" step="0.5"><output></output>');
        var i = r.querySelector('input'), o = r.querySelector('output');
        i.value = a[s.k] || 0; o.textContent = fmtAdj(a[s.k] || 0);
        i.oninput = function () { a[s.k] = Number(i.value); o.textContent = fmtAdj(i.value); onChange(); };
        i.ondblclick = function () { a[s.k] = 0; i.value = 0; o.textContent = fmtAdj(0); onChange(); };
        box.appendChild(r);
      });
      var rb = h('div', 'row-btns'); rb.style.marginTop = '8px';
      var reset = h('button', 'btn', 'Feinabstimmung zurücksetzen'); reset.type = 'button';
      reset.onclick = function () { st.adjBy[st.look] = {}; onChange(); build(); };
      rb.appendChild(reset); box.appendChild(rb);
    }
    build();
  }
  function openStyle() {
    var el = layer('Bildstil', { sheet: true }), b = el.querySelector('.l-body');
    stylePanel(b, S, function () { save(); renderAll(); }, false);
  }

  // ---------- Fotos (Galerie) ----------
  function openGallery() {
    var el = layer('Fotos', { right: '<button class="btn" type="button" id="g-sel">Auswählen</button>' }), b = el.querySelector('.l-body');
    var urls = [], recs = [], selMode = false, sel = {};
    el._close = function () { urls.forEach(URL.revokeObjectURL); };
    var top = h('div', 'row-btns'); top.style.marginBottom = '12px';
    var imp = h('label', 'btn pri', '＋ Foto importieren<input type="file" accept="image/*" multiple hidden>');
    top.appendChild(imp);
    var bar = h('div', 'row-btns'); bar.hidden = true;
    var shareB = h('button', 'btn pri', 'Teilen / Sichern'), delB = h('button', 'btn warn', 'Löschen');
    shareB.type = delB.type = 'button'; bar.appendChild(shareB); bar.appendChild(delB);
    top.appendChild(bar);
    b.appendChild(top);
    var grid = h('div', 'grid'); b.appendChild(grid);
    imp.querySelector('input').onchange = function () {
      var files = Array.prototype.slice.call(this.files || []); this.value = '';
      if (files.length) importFiles(files).then(load);
    };
    el.querySelector('#g-sel').onclick = function () {
      selMode = !selMode; sel = {}; this.textContent = selMode ? 'Fertig' : 'Auswählen';
      imp.hidden = selMode; bar.hidden = !selMode; draw();
    };
    function selected() { return recs.filter(function (r) { return sel[r.id]; }); }
    function updBar() { var n = selected().length; shareB.textContent = 'Teilen / Sichern (' + n + ')'; delB.textContent = 'Löschen (' + n + ')'; shareB.disabled = delB.disabled = !n; }
    shareB.onclick = function () {
      var files = selected().map(function (r) { return new File([r.big || r.out], fileName(r.t, r.big ? '_KI' : ''), { type: 'image/jpeg' }); });
      shareFiles(files);
    };
    delB.onclick = function () {
      var s = selected(); if (!s.length) return;
      if (!confirm(s.length + ' Foto(s) wirklich löschen? Das kann nicht rückgängig gemacht werden.')) return;
      Promise.all(s.map(function (r) { return Store.del(r.id); })).then(function () { sel = {}; load(); refreshThumb(); });
    };
    function draw() {
      grid.innerHTML = ''; urls.forEach(URL.revokeObjectURL); urls = [];
      if (!recs.length) { grid.innerHTML = '<div class="empty">Noch keine Fotos.<br>Einschalten und auslösen – oder ein Foto importieren.</div>'; return; }
      recs.forEach(function (r) {
        var c = h('button', 'cell' + (sel[r.id] ? ' sel' : '')); c.type = 'button';
        var u = URL.createObjectURL(r.thumb || r.out); urls.push(u);
        c.innerHTML = '<img alt="" loading="lazy" src="' + u + '">' + (r.big ? '<span class="badge">KI ' + mp(r.bigW * r.bigH) + '</span>' : '');
        c.onclick = function () {
          if (selMode) { sel[r.id] = !sel[r.id]; c.classList.toggle('sel', !!sel[r.id]); updBar(); }
          else openViewer(r, load);
        };
        grid.appendChild(c);
      });
      updBar();
    }
    function load() { return Store.all().then(function (a) { recs = a; draw(); }); }
    load();
  }
  function refreshThumb() { return Store.all().then(function (a) { setThumb(a[0] ? a[0].thumb : null); }).catch(function () {}); }

  function shareFiles(files) {
    if (!files.length) return;
    if (navigator.canShare && navigator.canShare({ files: files })) {
      navigator.share({ files: files }).catch(function (e) { if (e && e.name !== 'AbortError') downloadFiles(files); });
    } else downloadFiles(files);
  }
  function downloadFiles(files) {
    files.forEach(function (f, i) {
      setTimeout(function () {
        var a = document.createElement('a'), u = URL.createObjectURL(f); a.href = u; a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 8000);
      }, i * 400);
    });
  }

  // ---------- Einzelansicht ----------
  function openViewer(rec, onChanged) {
    var el = layer(new Date(rec.t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }), { body: false });
    var showBig = !!rec.big, url = null;
    var stage = h('div', 'viewer-img', '<img alt="">'), info = h('div', 'v-info'), bar = h('div', 'v-bar');
    el.appendChild(stage); el.appendChild(info); el.appendChild(bar);
    el._close = function () { if (url) URL.revokeObjectURL(url); };
    function draw() {
      if (url) URL.revokeObjectURL(url);
      var blob = showBig && rec.big ? rec.big : rec.out;
      url = URL.createObjectURL(blob); stage.querySelector('img').src = url;
      var lk = L.byId(rec.set.look);
      var w = showBig && rec.big ? rec.bigW : rec.w, hh = showBig && rec.big ? rec.bigH : rec.h;
      info.textContent = (lk ? lk.name : '') + ' · ' + w + ' × ' + hh + ' · ' + mp(w * hh) + ' · ' + mb(blob.size) + (rec.src === 'import' ? ' · importiert' : '');
      bar.innerHTML = '';
      if (rec.big) {
        var t = h('div', 'seg');
        [[false, 'Standard'], [true, 'KI ' + mp(rec.bigW * rec.bigH)]].forEach(function (o) {
          var bt = h('button', showBig === o[0] ? 'on' : '', o[1]); bt.type = 'button';
          bt.onclick = function () { showBig = o[0]; draw(); }; t.appendChild(bt);
        });
        bar.appendChild(t);
      }
      function btn(t, cls, fn) { var x = h('button', 'btn ' + (cls || ''), t); x.type = 'button'; x.onclick = fn; bar.appendChild(x); }
      btn('Teilen / Sichern', 'pri', function () {
        shareFiles([new File([blob], fileName(rec.t, showBig && rec.big ? '_KI' : ''), { type: 'image/jpeg' })]);
      });
      btn('Entwickeln', '', function () { openEditor(rec, function () { showBig = false; draw(); onChanged && onChanged(); }); });
      btn('✨ KI-Auflösung', '', function () { openAI(rec, function () { showBig = true; draw(); onChanged && onChanged(); }); });
      btn('Löschen', 'warn', function () {
        if (!confirm('Dieses Foto wirklich löschen?')) return;
        Store.del(rec.id).then(function () { closeLayer(el); onChanged && onChanged(); refreshThumb(); });
      });
    }
    draw();
  }

  // ---------- Entwickeln (Look nachträglich ändern) ----------
  function openEditor(rec, done) {
    var el = layer('Entwickeln', { body: false, right: '<button class="btn pri" type="button" id="e-save">Sichern</button>' });
    var stage = h('div', 'edit-stage', '<canvas></canvas><span class="cmp" hidden>Vorher</span>'), panel = h('div', 'edit-panel');
    el.appendChild(stage); el.appendChild(panel);
    var cv = stage.querySelector('canvas'), ep = null, bm = null, raf = 0, before = false;
    var st = { look: rec.set.look, adjBy: {}, wb: rec.set.wb, ev: rec.set.ev, iso: rec.set.iso, time: rec.set.time, rot: 0 };
    st.adjBy[st.look] = JSON.parse(JSON.stringify(rec.set.adj || {}));
    // Andere Looks starten mit den Kamera-Feinabstimmungen
    Object.keys(S.adjBy).forEach(function (k) { if (!st.adjBy[k]) st.adjBy[k] = JSON.parse(JSON.stringify(S.adjBy[k])); });
    el._close = function () { cancelAnimationFrame(raf); if (ep) { var x = ep.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } if (bm && bm.close) bm.close(); };
    function sched() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }
    function render() {
      if (!bm || !ep) return;
      var W = stage.clientWidth - 12, H = stage.clientHeight - 12, iw = st.rot % 2 ? bm.height : bm.width, ih = st.rot % 2 ? bm.width : bm.height;
      var s = Math.min(W / iw, H / ih), dw = Math.max(1, Math.floor(iw * s)), dh = Math.max(1, Math.floor(ih * s));
      cv.style.width = dw + 'px'; cv.style.height = dh + 'px';
      var d = Math.min(window.devicePixelRatio || 1, 2), k = Math.min(1, iw / (dw * d));
      ep.draw(before ? null : L.params(setOf(st)), { outW: Math.round(dw * d * k), outH: Math.round(dh * d * k), rot: st.rot, seed: rec.set.seed || 0 });
    }
    window.addEventListener('resize', sched);
    var oldClose = el._close; el._close = function () { window.removeEventListener('resize', sched); oldClose(); };
    function holdOn() { before = true; stage.querySelector('.cmp').hidden = false; sched(); }
    function holdOff() { before = false; stage.querySelector('.cmp').hidden = true; sched(); }
    cv.addEventListener('pointerdown', holdOn); cv.addEventListener('pointerup', holdOff); cv.addEventListener('pointerleave', holdOff); cv.addEventListener('pointercancel', holdOff);
    var rotRow = h('div', 'row-btns'); rotRow.style.margin = '2px 0 8px';
    var rb = h('button', 'btn', '↻ Drehen'); rb.type = 'button'; rb.onclick = function () { st.rot = (st.rot + 1) % 4; sched(); };
    rotRow.appendChild(rb); rotRow.appendChild(h('span', 'hint', '<span style="color:var(--muted);font-size:12.5px;align-self:center">Bild gedrückt halten = Vorher</span>'));
    panel.appendChild(rotRow);
    var sp = h('div'); panel.appendChild(sp);
    stylePanel(sp, st, sched, true);
    decode(rec.orig || rec.out).then(function (b) {
      bm = b; ep = new Pipeline(cv, { preserve: false }); ep.setSource(bm, bm.width, bm.height); sched();
    }).catch(function (e) { toast(e.message, 3500); });
    el.querySelector('#e-save').onclick = function () {
      if (!bm) return;
      var btn = this; btn.disabled = true; btn.textContent = 'Speichere …';
      var p = getProc(), set = snap(st); set.seed = rec.set.seed || set.seed;
      var outW = st.rot % 2 ? bm.height : bm.width, outH = st.rot % 2 ? bm.width : bm.height;
      var G = { outW: outW, outH: outH, rot: st.rot, seed: set.seed };
      p.setSource(bm, bm.width, bm.height);
      var chain = Promise.resolve();
      if (st.rot) chain = chain.then(function () { p.draw(null, G); return p.toBlob(0.95).then(function (b) { rec.orig = b; }); });
      chain.then(function () {
        p.draw(L.params(set), G); return p.toBlob(S.quality);
      }).then(function (b) { return Exif.insert(b, exifFor(set, outW, outH)); }).then(function (b) {
        rec.out = b; rec.set = set; rec.w = outW; rec.h = outH;
        delete rec.big; delete rec.bigW; delete rec.bigH;
        return makeThumb(b);
      }).then(function (th) { rec.thumb = th; return Store.put(rec); }).then(function () {
        toast('Neu entwickelt ✓'); closeLayer(el); refreshThumb(); done && done();
      }).catch(function (e) { toast('Fehler: ' + e.message, 4000); btn.disabled = false; btn.textContent = 'Sichern'; });
    };
  }

  // ---------- KI-Auflösung ----------
  function openAI(rec, done) {
    var el = layer('✨ KI-Auflösung', { sheet: true }), b = el.querySelector('.l-body');
    var running = false, cancelled = false, lock = null;
    el._close = function () { cancelled = true; if (lock) lock.release().catch(function () {}); };
    function planFor() { return AI.plan(rec.w, rec.h, S.aiFactor, S.aiMax, 16384); }
    function build() {
      b.innerHTML = '';
      var pl = planFor();
      b.appendChild(h('div', 'set', '<div class="lbl">Jetzt: ' + rec.w + ' × ' + rec.h + ' · ' + mp(rec.w * rec.h) + '</div>' +
        '<div class="big">→ ' + pl.W + ' × ' + pl.H + ' · ' + mp(pl.W * pl.H) + '</div>' +
        (pl.scaled ? '<div class="hint">Begrenzt auf die Obergrenze (' + S.aiMax + ' MP, änderbar im Menü).</div>' : '')));
      b.appendChild(segSet('Faktor', [[2, '2× (doppelt)'], [4, '4× (vierfach)']], S.aiFactor, function (v) { S.aiFactor = v; if (v === 4) S.aiModel = 'slim'; save(); build(); }));
      b.appendChild(segSet('KI-Modell', S.aiFactor === 2 ? [['slim', 'Schnell'], ['medium', 'Detail (langsamer)']] : [['slim', 'Schnell']], S.aiModel, function (v) { S.aiModel = v; save(); build(); },
        'Die KI erfindet feine Details passend dazu. Am besten bei Ausschnitten (Leuchtrahmen) und kleinen Fotos. Der Look des Fotos wird danach wieder genau angewendet.'));
      var go = h('button', 'btn pri', 'Starten'); go.type = 'button'; go.style.width = '100%';
      b.appendChild(go);
      b.appendChild(h('div', 'hint', '<span style="color:var(--muted);font-size:12.5px">Dauert je nach Gerät 1–10 Minuten. Bitte App offen lassen.</span>'));
      go.onclick = start;
    }
    function start() {
      if (running) return; running = true; cancelled = false;
      b.innerHTML = '';
      var st = h('div', 'set', '<div class="lbl" id="ai-t">Vorbereitung …</div><div class="prog"><i></i></div><div class="hint" id="ai-h"></div>');
      var cancel = h('button', 'btn warn', 'Abbrechen'); cancel.type = 'button';
      cancel.onclick = function () { cancelled = true; };
      b.appendChild(st); b.appendChild(cancel);
      if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
      var t0 = Date.now();
      AI.upscale({
        blob: rec.orig || rec.out, params: rec.orig ? L.params(rec.set) : null, seed: rec.set.seed || 0,
        factor: S.aiFactor, model: S.aiModel, maxMP: S.aiMax, quality: Math.round(S.quality * 100),
        exif: function (w, hh) { return exifFor(rec.set, w, hh, ' - KI-Aufloesung'); },
        isCancelled: function () { return cancelled; },
        onProgress: function (f, txt) {
          st.querySelector('.prog i').style.width = Math.round(f * 100) + '%';
          st.querySelector('#ai-t').textContent = Math.round(f * 100) + ' % · ' + txt;
        }
      }).then(function (r) {
        rec.big = r.blob; rec.bigW = r.w; rec.bigH = r.h;
        return Store.put(rec).then(function () { return r; });
      }).then(function (r) {
        running = false; if (lock) { lock.release().catch(function () {}); lock = null; }
        b.innerHTML = '';
        b.appendChild(h('div', 'set', '<div class="lbl">Fertig ✓ in ' + AI.fmtTime((Date.now() - t0) / 1000) + '</div><div class="big">' + r.w + ' × ' + r.h + ' · ' + mp(r.w * r.h) + '</div><div class="hint">' + mb(r.blob.size) + (r.backend !== 'webgl' ? ' · ohne Grafikchip berechnet' : '') + '</div>'));
        var row = h('div', 'row-btns'), sh = h('button', 'btn pri', 'Teilen / Sichern'); sh.type = 'button';
        sh.onclick = function () { shareFiles([new File([r.blob], fileName(rec.t, '_KI'), { type: 'image/jpeg' })]); };
        row.appendChild(sh); b.appendChild(row);
        compare(b, rec, r);
        done && done();
      }).catch(function (e) {
        running = false; if (lock) { lock.release().catch(function () {}); lock = null; }
        if (cancelled) { toast('Abgebrochen'); build(); return; }
        b.innerHTML = '';
        b.appendChild(h('div', 'set', '<div class="lbl">Das hat leider nicht geklappt.</div><div class="hint">' + esc(e && e.message ? e.message : e) + '<br>Tipp: Kleinere Obergrenze (Menü → KI-Auflösung) oder Faktor 2× versuchen.</div>'));
        var again = h('button', 'btn', 'Zurück'); again.type = 'button'; again.onclick = build; b.appendChild(again);
      });
    }
    build();
  }
  // Vorher/Nachher-Ausschnitt in der Bildmitte
  function compare(box, rec, r) {
    var wrapC = h('div', 'cmp-wrap', '<figure><canvas></canvas><figcaption>Vorher (vergrößert)</figcaption></figure><figure><canvas></canvas><figcaption>KI</figcaption></figure>');
    box.appendChild(h('div', 'lbl', '<div style="margin-top:12px;font-weight:600">Ausschnitt aus der Bildmitte:</div>'));
    box.appendChild(wrapC);
    var cs = wrapC.querySelectorAll('canvas'), N = 360;
    var f = r.w / rec.w, side = Math.min(N, r.w, r.h);
    Promise.all([decode(rec.out), viaImg(r.blob)]).then(function (a) {
      var o = a[0], k = a[1];
      cs.forEach(function (c) { c.width = N; c.height = N; });
      var x0 = rec.w / 2 - side / f / 2, y0 = rec.h / 2 - side / f / 2;
      var c0 = cs[0].getContext('2d'); c0.imageSmoothingQuality = 'high';
      c0.drawImage(o, x0, y0, side / f, side / f, 0, 0, N, N);
      var X0 = r.w / 2 - side / 2, Y0 = r.h / 2 - side / 2, kw = k.naturalWidth || k.width, s = kw / r.w;
      cs[1].getContext('2d').drawImage(k, X0 * s, Y0 * s, side * s, side * s, 0, 0, N, N);
      if (o.close) o.close();
    }).catch(function () { wrapC.remove(); });
  }

  // ---------- Import ----------
  function importFiles(files) {
    var n = 0;
    toast('Importiere …', 60000);
    return files.reduce(function (pr, file) {
      return pr.then(function () {
        return decode(file).then(function (im) {
          var p = getProc(), w = im.width, hh = im.height;
          var k = Math.min(1, Math.sqrt(maxCanvasArea() / (w * hh)), p.maxTex / Math.max(w, hh), p.maxOut / Math.max(w, hh));
          var cw = Math.floor(w * k), ch = Math.floor(hh * k);
          var c = document.createElement('canvas'); c.width = cw; c.height = ch;
          var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, cw, ch);
          if (im.close) im.close();
          var set = snap(S), rec = { id: Store.uid(), t: Date.now(), w: cw, h: ch, src: 'import', set: set };
          p.setSource(c, cw, ch); p.draw(L.params(set), { outW: cw, outH: ch, seed: set.seed });
          return p.toBlob(S.quality).then(function (b) {
            rec.out = b; return canvasBlob(c, 0.95);
          }).then(function (orig) {
            rec.orig = orig; c.width = 1; c.height = 1;
            return rec.out;
          }).then(function (b) { return Exif.insert(b, exifFor(set, cw, ch)); }).then(function (b) {
            rec.out = b; return makeThumb(b);
          }).then(function (th) { rec.thumb = th; n++; return Store.put(rec); });
        }).catch(function (e) { toast(file.name + ': ' + e.message, 4000); });
      });
    }, Promise.resolve()).then(function () {
      toast(n ? n + ' Foto(s) importiert – mit Look „' + L.byId(S.look).name + '“. Ändern: Foto öffnen → Entwickeln.' : 'Nichts importiert', 3500);
      refreshThumb();
    });
  }

  // ---------- Start / Bedienung ----------
  $('power-btn').onclick = function () {
    unlockAudio();
    var b = this; b.disabled = true;
    $('start-msg').textContent = 'Kamera startet …';
    requestMotion().then(function () {
      return startCamera(S.lensId || null).catch(function (e) {
        if (S.lensId && !(e && e.name === 'NotAllowedError')) { S.lensId = null; save(); return startCamera(null); }
        throw e;
      });
    }).then(function () { $('start').hidden = true; }).catch(camError).then(function () { b.disabled = false; });
  };
  $('start-gal').onclick = openGallery;
  $('shutter').onclick = shoot;
  $('gal-btn').onclick = openGallery;
  $('menu-btn').onclick = openMenu;
  $('style-btn').onclick = openStyle;
  finder.addEventListener('dblclick', function () { if (openDial) { openDial = null; renderAll(); } });
  document.addEventListener('keydown', function (e) {
    if (layers.length || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); shoot(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (camOn) { stopCamera(); camWanted = true; } }
    else if (camWanted && !camOn && $('start').hidden) startCamera(S.lensId || null).catch(camError);
  });

  renderAll();
  refreshThumb();
  requestAnimationFrame(loop);
})();
