/* ==========================================================================
   JZo Jam – Audio-Analyse
   Erkennt aus einer Aufnahme: Tonart + Modus, Tempo (BPM), Taktart,
   Akkordfolge und gespielte Einzeltöne. Reines JavaScript, läuft im
   Web Worker (Aufnahme-Analyse) und im Hauptthread (Live-Modus).
   Braucht JZoTheory (theory.js).
   ========================================================================== */
(function (root) {
  'use strict';

  var T = root.JZoTheory || (typeof require !== 'undefined' ? require('./theory.js') : null);

  /* ---------------- Grundbausteine ---------------- */

  // FFT (Radix-2, in-place)
  function fft(re, im) {
    var n = re.length, i, j, k;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var a = i + k, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci;
          var xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          var nr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }

  var windows = {};
  function hann(n) {
    if (!windows[n]) {
      var w = new Float32Array(n);
      for (var i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      windows[n] = w;
    }
    return windows[n];
  }

  // Auf ca. 11–12 kHz herunterrechnen (reicht für Tonhöhen, spart Rechenzeit)
  function downsample(x, sr, target) {
    target = target || 11025;
    var f = Math.max(1, Math.round(sr / target));
    if (f === 1) return { data: x, sr: sr };
    var n = Math.floor(x.length / f);
    var out = new Float32Array(n);
    // Zwei Mittelwert-Filter hintereinander als einfacher Tiefpass
    var tmp = new Float32Array(x.length);
    var acc = 0;
    for (var i = 0; i < x.length; i++) {
      acc += x[i];
      if (i >= f) acc -= x[i - f];
      tmp[i] = acc / f;
    }
    acc = 0;
    var tmp2 = new Float32Array(x.length);
    for (i = 0; i < x.length; i++) {
      acc += tmp[i];
      if (i >= f) acc -= tmp[i - f];
      tmp2[i] = acc / f;
    }
    for (i = 0; i < n; i++) out[i] = tmp2[i * f + f - 1];
    return { data: out, sr: sr / f };
  }

  /* ---------------- Chroma (welche der 12 Töne klingen) ---------------- */

  // Liefert für einen Ausschnitt: chroma[12], bass[12], rms
  function chromaFrame(x, offset, n, sr, re, im) {
    var w = hann(n);
    var sum = 0;
    for (var i = 0; i < n; i++) {
      var v = x[offset + i] || 0;
      sum += v * v;
      re[i] = v * w[i]; im[i] = 0;
    }
    var rms = Math.sqrt(sum / n);
    var chroma = new Float32Array(12), bass = new Float32Array(12);
    if (rms < 1e-5) return { chroma: chroma, bass: bass, rms: rms };
    fft(re, im);
    var half = n / 2;
    var mag = new Float32Array(half);
    var maxMag = 0;
    for (i = 1; i < half; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      if (mag[i] > maxMag) maxMag = mag[i];
    }
    var thr = maxMag * 0.02;
    var binHz = sr / n;
    var kMin = Math.max(2, Math.floor(38 / binHz));
    var kMax = Math.min(half - 2, Math.ceil(2600 / binHz));
    var peaks = [];
    for (var k = kMin; k <= kMax; k++) {
      var b = mag[k];
      if (b < thr || b <= mag[k - 1] || b < mag[k + 1]) continue;
      // Spitze genauer bestimmen (Parabel durch 3 Punkte)
      var a = mag[k - 1], c = mag[k + 1];
      var den = a - 2 * b + c;
      var p = den !== 0 ? 0.5 * (a - c) / den : 0;
      peaks.push({ f: (k + p) * binHz, w: b });
    }
    // Obertöne dämpfen: der 3., 5., 6. und 7. Oberton eines tieferen Tons
    // würde sonst als eigene Quinte/Terz gezählt (z. B. C → falsches G/E)
    for (var j = 0; j < peaks.length; j++) {
      for (var q = 0; q < j; q++) {
        if (peaks[q].w < peaks[j].w * 0.25) continue;
        var ratio = peaks[j].f / peaks[q].f, h = Math.round(ratio);
        if ((h === 3 || h === 5 || h === 6 || h === 7) && Math.abs(ratio - h) < 0.025 * h) {
          peaks[j].w *= 0.3;
          break;
        }
      }
    }
    peaks.forEach(function (pk) {
      var midi = 69 + 12 * Math.log(pk.f / 440) / Math.LN2;
      var nearest = Math.round(midi);
      var dev = Math.abs(midi - nearest);
      if (dev > 0.4) return;
      var weight = pk.w * (1 - dev);
      var pc = ((nearest % 12) + 12) % 12;
      if (pk.f <= 2600 && pk.f >= 55) chroma[pc] += weight;
      if (pk.f >= 38 && pk.f <= 230) bass[pc] += weight;
    });
    return { chroma: chroma, bass: bass, rms: rms };
  }

  function computeFrames(x, sr, n, hop) {
    var re = new Float32Array(n), im = new Float32Array(n);
    var frames = [];
    for (var off = 0; off + n <= x.length; off += hop) {
      var fr = chromaFrame(x, off, n, sr, re, im);
      fr.time = (off + n / 2) / sr;
      frames.push(fr);
    }
    // Pausen markieren: deutlich leiser als der Rest
    var maxRms = 0;
    frames.forEach(function (f) { if (f.rms > maxRms) maxRms = f.rms; });
    var thr = Math.max(0.0008, maxRms * 0.06);
    frames.forEach(function (f) { f.active = f.rms >= thr && sumArr(f.chroma) > 0; });
    return frames;
  }

  function sumArr(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function normalize(a) {
    var s = sumArr(a), out = new Float32Array(12);
    if (s > 0) for (var i = 0; i < 12; i++) out[i] = a[i] / s;
    return out;
  }

  function aggregate(frames) {
    var c = new Float32Array(12), b = new Float32Array(12), count = 0;
    frames.forEach(function (f) {
      if (!f.active) return;
      var nc = normalize(f.chroma), nb = normalize(f.bass);
      var bw = sumArr(f.bass) / (sumArr(f.chroma) || 1);
      for (var i = 0; i < 12; i++) { c[i] += nc[i]; b[i] += nb[i] * Math.min(1, bw * 3); }
      count++;
    });
    return { chroma: normalize(c), bass: normalize(b), count: count };
  }

  /* ---------------- Tonart + Modus ---------------- */

  function pearson(x, y) {
    var n = x.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  var modeTemplates = null;
  function getModeTemplates() {
    if (modeTemplates) return modeTemplates;
    modeTemplates = {};
    T.MODE_IDS.forEach(function (id) {
      var iv = T.SCALES[id].intervals;
      var t = new Float32Array(12);
      iv.forEach(function (i) { t[i] = 1; });
      t[0] += 1.2;          // Grundton
      t[iv[4]] += 0.5;      // Quinte des Modus
      t[iv[2]] += 0.35;     // Terz des Modus
      modeTemplates[id] = t;
    });
    return modeTemplates;
  }

  // Liefert alle 84 Kombinationen (12 Grundtöne × 7 Modi), beste zuerst
  // hint (optional): Gewicht je Ton als möglicher Grundton (aus der Akkordfolge)
  function detectKey(chroma, bass, hint) {
    var tpl = getModeTemplates();
    var bmax = Math.max.apply(null, Array.prototype.slice.call(bass)) || 1;
    var results = [];
    for (var tonic = 0; tonic < 12; tonic++) {
      var rot = new Float32Array(12);
      for (var i = 0; i < 12; i++) rot[i] = chroma[(i + tonic) % 12];
      T.MODE_IDS.forEach(function (id) {
        var score = pearson(rot, tpl[id]) + 0.3 * (bass[tonic] / bmax);
        if (hint) {
          var majorMode = T.SCALES[id].intervals[2] === 4;
          score += 0.35 * (majorMode ? hint.maj : hint.min)[tonic];
        }
        results.push({ tonic: tonic, scale: id, score: score });
      });
    }
    results.sort(function (a, b) { return b.score - a.score; });
    // Sicherheit grob als Softmax der Punktzahlen
    var top = results[0].score, z = 0;
    results.forEach(function (r) { r.w = Math.exp((r.score - top) / 0.06); z += r.w; });
    results.forEach(function (r) { r.confidence = r.w / z; delete r.w; });
    // Wie "tonal" ist das Ganze? Anteil der Energie in der besten 7-Ton-Leiter
    var best = results[0];
    var pcs = T.scalePcs(best);
    var fit = 0;
    pcs.forEach(function (pc) { fit += chroma[pc]; });
    results.fit = fit;
    return results;
  }

  function keySummary(res, max) {
    return res.slice(0, max || 5).map(function (r) {
      return { tonic: r.tonic, scale: r.scale, confidence: +r.confidence.toFixed(3) };
    });
  }

  // Tonart-Abschnitte (für Jamtracks/Songs mit Tonartwechsel)
  function keySections(frames, sr, hopSec, chords) {
    var winSec = 16, stepSec = 8;
    var per = Math.max(1, Math.round(winSec / hopSec));
    var step = Math.max(1, Math.round(stepSec / hopSec));
    if (frames.length < per * 1.5) return [];
    var raw = [];
    for (var s = 0; s + per <= frames.length; s += step) {
      var agg = aggregate(frames.slice(s, s + per));
      if (agg.count < per * 0.3) continue;
      var t0 = frames[s].time, t1 = frames[Math.min(frames.length - 1, s + per - 1)].time;
      var inWin = (chords || []).filter(function (c) { return c.end > t0 && c.start < t1; }).map(function (c) {
        return { root: c.root, quality: c.quality, start: Math.max(c.start, t0), end: Math.min(c.end, t1) };
      });
      var k = detectKey(agg.chroma, agg.bass, inWin.length ? tonicHint(inWin) : null)[0];
      raw.push({ tonic: k.tonic, scale: k.scale, start: frames[s].time, end: frames[Math.min(frames.length - 1, s + per - 1)].time });
    }
    var merged = [];
    raw.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && last.tonic === r.tonic && last.scale === r.scale) last.end = r.end;
      else merged.push(r);
    });
    // Einzelne kurze Ausreißer glätten
    for (var i = 1; i < merged.length - 1; i++) {
      var a = merged[i - 1], b = merged[i + 1];
      if (a.tonic === b.tonic && a.scale === b.scale && merged[i].end - merged[i].start < winSec) {
        a.end = b.end; merged.splice(i, 2); i--;
      }
    }
    return merged.length > 1 ? merged : [];
  }

  /* ---------------- Akkorde ---------------- */

  var CHORD_TYPES = ['', 'm', '7', 'maj7', 'm7', 'dim', 'sus4', 'sus2', '5'];
  var CHORD_PENALTY = { '': 1, 'm': 1, '7': 0.92, 'maj7': 0.9, 'm7': 0.92, 'dim': 0.88, 'sus4': 0.9, 'sus2': 0.9, '5': 0.92 };

  function chordTemplates() {
    var list = [];
    for (var r = 0; r < 12; r++) {
      CHORD_TYPES.forEach(function (q) {
        var t = new Float32Array(12);
        T.CHORDS[q].iv.forEach(function (i, idx) { t[(r + i) % 12] = idx === 0 ? 1.3 : 1; });
        var norm = Math.sqrt(sumArr(t.map(function (v) { return v * v; })));
        list.push({ root: r, quality: q, t: t, norm: norm });
      });
    }
    return list;
  }
  var CHORD_TPL = null;

  function matchChord(chroma, bass, keyPcs) {
    if (!CHORD_TPL) CHORD_TPL = chordTemplates();
    var cn = Math.sqrt(sumArr(chroma.map(function (v) { return v * v; })));
    if (!cn) return null;
    var bmax = Math.max.apply(null, Array.prototype.slice.call(bass)) || 0;
    var best = null;
    CHORD_TPL.forEach(function (tp) {
      var dot = 0;
      for (var i = 0; i < 12; i++) dot += chroma[i] * tp.t[i];
      var s = dot / (cn * tp.norm) * CHORD_PENALTY[tp.quality];
      if (bmax) s += 0.12 * bass[tp.root] / bmax;
      if (keyPcs) {
        var inKey = T.CHORDS[tp.quality].iv.every(function (i) { return keyPcs.indexOf((tp.root + i) % 12) >= 0; });
        if (inKey) s *= 1.04;
      }
      if (!best || s > best.score) best = { root: tp.root, quality: tp.quality, score: s };
    });
    return best;
  }

  function detectChords(frames, hopSec, keyPcs) {
    var smoothN = Math.max(1, Math.round(0.5 / hopSec));
    var labels = [];
    for (var i = 0; i < frames.length; i++) {
      if (!frames[i].active) { labels.push(null); continue; }
      var c = new Float32Array(12), b = new Float32Array(12);
      for (var j = Math.max(0, i - smoothN); j <= Math.min(frames.length - 1, i + smoothN); j++) {
        if (!frames[j].active) continue;
        var nc = normalize(frames[j].chroma), nb = normalize(frames[j].bass);
        for (var k = 0; k < 12; k++) { c[k] += nc[k]; b[k] += nb[k]; }
      }
      var m = matchChord(c, b, keyPcs);
      labels.push(m && m.score > 0.55 ? m.root + ':' + m.quality : null);
    }
    // Mehrheitsfilter gegen Flackern
    var win = Math.max(1, Math.round(0.4 / hopSec));
    var filt = labels.map(function (_, i) {
      var counts = {}, bestL = labels[i], bestC = 0;
      for (var j = Math.max(0, i - win); j <= Math.min(labels.length - 1, i + win); j++) {
        var l = labels[j] || '-';
        counts[l] = (counts[l] || 0) + 1;
        if (counts[l] > bestC) { bestC = counts[l]; bestL = l; }
      }
      return bestL === '-' ? null : bestL;
    });
    var segs = [];
    filt.forEach(function (l, i) {
      var t0 = frames[i].time - hopSec / 2, t1 = frames[i].time + hopSec / 2;
      var last = segs[segs.length - 1];
      if (last && last.label === l) last.end = t1;
      else segs.push({ label: l, start: t0, end: t1 });
    });
    // Zu kurze Schnipsel verwerfen und Gleiches zusammenfassen
    var minLen = 0.6;
    var out = [];
    segs.forEach(function (s) {
      if (!s.label || s.end - s.start < minLen) return;
      var last = out[out.length - 1];
      if (last && last.label === s.label) { last.end = s.end; return; }
      out.push(s);
    });
    return out.map(function (s) {
      var p = s.label.split(':');
      return { root: +p[0], quality: p[1], start: +s.start.toFixed(2), end: +s.end.toFixed(2) };
    });
  }

  // Grundton-Hinweis aus der Akkordfolge: wie lange klingt welcher Akkord,
  // der Startakkord zählt doppelt. Getrennt nach Dur- und Moll-Akkorden,
  // damit z. B. ein langer C-Dur-Akkord für "C Ionisch" spricht, nicht "C Dorisch".
  function tonicHint(chords) {
    var maj = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], min = maj.slice(), total = 0;
    chords.forEach(function (c, i) {
      var d = (c.end - c.start) * (i === 0 ? 2 : 1) * (i === chords.length - 1 ? 1.3 : 1);
      if (/^(m|dim|m7b5)/.test(c.quality) && c.quality.indexOf('maj') !== 0) min[c.root] += d;
      else if (c.quality !== '5' && c.quality.indexOf('sus') !== 0) maj[c.root] += d;
      else { maj[c.root] += d / 2; min[c.root] += d / 2; }
      total += d;
    });
    var max = Math.max.apply(null, maj.concat(min)) || 1;
    return { maj: maj.map(function (v) { return v / max; }), min: min.map(function (v) { return v / max; }) };
  }

  /* ---------------- Einzeltöne (Melodie) ---------------- */

  // YIN-Tonhöhenerkennung für einen Ausschnitt → {freq, clarity} oder null
  function yin(x, offset, w, sr, fmin, fmax) {
    var tauMin = Math.floor(sr / fmax), tauMax = Math.min(w - 1, Math.ceil(sr / fmin));
    var d = new Float32Array(tauMax + 1);
    for (var tau = 1; tau <= tauMax; tau++) {
      var s = 0;
      for (var i = 0; i < w; i++) {
        var diff = (x[offset + i] || 0) - (x[offset + i + tau] || 0);
        s += diff * diff;
      }
      d[tau] = s;
    }
    // kumulierte mittlere normierte Differenz
    var running = 0;
    var cm = new Float32Array(tauMax + 1);
    cm[0] = 1;
    for (tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      cm[tau] = running ? d[tau] * tau / running : 1;
    }
    var thr = 0.15, best = -1;
    for (tau = tauMin; tau <= tauMax; tau++) {
      if (cm[tau] < thr) {
        while (tau + 1 <= tauMax && cm[tau + 1] < cm[tau]) tau++;
        best = tau; break;
      }
    }
    if (best < 0) return null;
    var a = cm[best - 1] || cm[best], b = cm[best], c = cm[best + 1] || cm[best];
    var den = a - 2 * b + c;
    var p = den ? 0.5 * (a - c) / den : 0;
    return { freq: sr / (best + p), clarity: 1 - b };
  }

  function detectNotes(x, sr) {
    var w = 512, hop = 512;
    if (sr > 13000) { w = 1024; hop = 1024; }
    var hopSec = hop / sr;
    var maxRms = 0, rmsList = [];
    for (var off = 0; off + w * 2 <= x.length; off += hop) {
      var s = 0;
      for (var i = 0; i < w; i++) s += x[off + i] * x[off + i];
      var r = Math.sqrt(s / w);
      rmsList.push(r);
      if (r > maxRms) maxRms = r;
    }
    var thr = Math.max(0.001, maxRms * 0.08);
    var track = [];
    var voiced = 0, active = 0;
    rmsList.forEach(function (r, idx) {
      if (r < thr) { track.push(null); return; }
      active++;
      var y = yin(x, idx * hop, w, sr, 75, 1100);
      if (!y || y.clarity < 0.82) { track.push(null); return; }
      voiced++;
      track.push(Math.round(69 + 12 * Math.log(y.freq / 440) / Math.LN2));
    });
    var notes = [];
    var minFrames = Math.max(2, Math.round(0.08 / hopSec));
    var cur = null;
    track.forEach(function (m, i) {
      var r = rmsList[i];
      var prevR = i > 0 ? rmsList[i - 1] : 0;
      var onset = cur && m === cur.midi && r > prevR * 1.8 && r > thr * 2;
      if (cur && (m !== cur.midi || onset)) {
        if (cur.n >= minFrames) notes.push(cur);
        cur = null;
      }
      if (m != null && !cur) cur = { midi: m, startIdx: i, n: 0 };
      if (cur) cur.n++;
    });
    if (cur && cur.n >= minFrames) notes.push(cur);
    return {
      melodic: active ? voiced / active : 0,
      notes: notes.slice(0, 400).map(function (nt) {
        return { midi: nt.midi, start: +(nt.startIdx * hopSec).toFixed(2), dur: +(nt.n * hopSec).toFixed(2) };
      })
    };
  }

  /* ---------------- Tempo + Taktart ---------------- */

  function detectTempo(x, sr) {
    var n = 512, hop = 128;
    if (sr > 13000) { n = 1024; hop = 256; }
    var fps = sr / hop;
    var re = new Float32Array(n), im = new Float32Array(n), w = hann(n);
    var prev = null, flux = [];
    for (var off = 0; off + n <= x.length; off += hop) {
      for (var i = 0; i < n; i++) { re[i] = x[off + i] * w[i]; im[i] = 0; }
      fft(re, im);
      var cur = new Float32Array(n / 2), f = 0;
      for (i = 1; i < n / 2; i++) {
        cur[i] = Math.log(1 + 100 * Math.sqrt(re[i] * re[i] + im[i] * im[i]));
        if (prev) { var d = cur[i] - prev[i]; if (d > 0) f += d; }
      }
      flux.push(f);
      prev = cur;
    }
    if (flux.length < fps * 4) return null;
    // Gleitenden Mittelwert abziehen → nur echte Anschläge bleiben übrig
    var m = Math.round(fps * 0.4), env = new Float32Array(flux.length);
    var acc = 0;
    for (i = 0; i < flux.length; i++) {
      acc += flux[i];
      if (i >= m) acc -= flux[i - m];
      var mean = acc / Math.min(i + 1, m);
      env[i] = Math.max(0, flux[i] - mean);
    }
    var minLag = Math.floor(fps * 60 / 210), maxLag = Math.ceil(fps * 60 / 50);
    var maxLag8 = Math.min(env.length - 1, maxLag * 8);
    var ac = new Float32Array(maxLag8 + 1);
    for (var lag = 0; lag <= maxLag8; lag++) {
      var s = 0;
      for (i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
      ac[lag] = s / (env.length - lag);
    }
    if (!ac[0]) return null;
    var best = -1, bestScore = -Infinity;
    for (lag = minLag; lag <= maxLag; lag++) {
      var bpm = 60 * fps / lag;
      // Bevorzugt "normale" Tempi um 110 BPM, ohne andere auszuschließen
      var pref = Math.exp(-0.5 * Math.pow(Math.log(bpm / 110) / Math.LN2 / 0.9, 2));
      // Vielfache des Schlags stützen den Grundschlag
      var harm = ac[lag] + 0.5 * (ac[lag * 2] || 0) + 0.25 * (ac[lag * 4] || 0);
      var sc = harm * pref;
      if (sc > bestScore) { bestScore = sc; best = lag; }
    }
    var a = ac[best - 1], b = ac[best], c = ac[best + 1];
    var den = a - 2 * b + c;
    var p = den ? 0.5 * (a - c) / den : 0;
    var bpmVal = 60 * fps / (best + p);
    var confidence = Math.max(0, Math.min(1, (b / ac[0]) * 2.5));
    var L = best + p;
    // Taktart: Welche Zählzeit ist betont – jede 3. oder jede 4.?
    var phase = 0, phaseScore = -1;
    for (var ph = 0; ph < L; ph++) {
      var ps = 0;
      for (var t = ph; t < env.length; t += L) ps += env[Math.round(t)] || 0;
      if (ps > phaseScore) { phaseScore = ps; phase = ph; }
    }
    var beats = [];
    for (t = phase; t < env.length; t += L) {
      var mx = 0;
      for (var q = Math.round(t) - 2; q <= Math.round(t) + 2; q++) if (env[q] > mx) mx = env[q];
      beats.push(mx);
    }
    function accent(m) {
      var mean = beats.reduce(function (s1, v) { return s1 + v; }, 0) / beats.length || 1;
      var bestA = 0;
      for (var o = 0; o < m; o++) {
        var sum = 0, cnt = 0;
        for (var k = o; k < beats.length; k += m) { sum += beats[k]; cnt++; }
        if (cnt) bestA = Math.max(bestA, sum / cnt / mean);
      }
      return bestA;
    }
    var meter = beats.length >= 12 && accent(3) > accent(4) * 1.05 ? '3/4' : '4/4';
    return { bpm: Math.round(bpmVal), confidence: +confidence.toFixed(2), meter: meter };
  }

  /* ---------------- Gesamtanalyse ---------------- */

  function analyze(pcm, sampleRate) {
    var ds = downsample(pcm, sampleRate, 11025);
    var x = ds.data, sr = ds.sr;
    var n = sr > 13000 ? 8192 : 4096;
    var hop = n / 4;
    var hopSec = hop / sr;
    var frames = computeFrames(x, sr, n, hop);
    var agg = aggregate(frames);
    var result = { duration: +(pcm.length / sampleRate).toFixed(2), sampleRate: sampleRate };
    if (agg.count < 3) {
      result.empty = true;
      return result;
    }
    var keys = detectKey(agg.chroma, agg.bass);
    // Zweiter Durchgang: Akkordfolge verrät den Grundton (Startakkord, Häufigkeit)
    var firstChords = detectChords(frames, hopSec, T.scalePcs(keys[0]));
    if (firstChords.length) {
      var hint = tonicHint(firstChords);
      keys = detectKey(agg.chroma, agg.bass, hint);
    }
    result.key = { tonic: keys[0].tonic, scale: keys[0].scale };
    result.keyAlternatives = keySummary(keys, 6);
    result.keyFit = +keys.fit.toFixed(2);
    result.chroma = Array.prototype.map.call(agg.chroma, function (v) { return +v.toFixed(3); });
    result.chords = detectChords(frames, hopSec, T.scalePcs(result.key));
    result.keySections = keySections(frames, sr, hopSec, result.chords);
    var tempo = detectTempo(x, sr);
    if (tempo) { result.bpm = tempo.bpm; result.bpmConfidence = tempo.confidence; result.meter = tempo.meter; }
    var mel = detectNotes(x, sr);
    result.melodic = +mel.melodic.toFixed(2);
    result.notes = mel.notes;
    return result;
  }

  /* ---------------- Live-Modus ---------------- */

  // Hält eine "Erinnerung" an die letzten Sekunden und schätzt laufend
  function LiveAnalyzer(sampleRate) {
    this.sr = sampleRate;
    this.longC = new Float32Array(12); this.longB = new Float32Array(12);
    this.shortC = new Float32Array(12); this.shortB = new Float32Array(12);
    this.n = 4096;
    this.re = new Float32Array(this.n); this.im = new Float32Array(this.n);
    this.hint = { maj: new Float32Array(12), min: new Float32Array(12) };
    this.frames = 0;
  }
  // samples: die letzten ~0,4–0,7 s Audio (beliebige Abtastrate), dt: Sekunden seit letztem Aufruf
  LiveAnalyzer.prototype.push = function (samples, dt) {
    var ds = downsample(samples, this.sr, 11025);
    var x = ds.data, sr = ds.sr;
    var n = this.n;
    if (x.length < n) {
      var pad = new Float32Array(n); pad.set(x, n - x.length); x = pad;
    }
    var fr = chromaFrame(x, x.length - n, n, sr, this.re, this.im);
    var active = fr.rms > 0.002 && sumArr(fr.chroma) > 0;
    var kLong = Math.exp(-dt / 14), kShort = Math.exp(-dt / 1.2);
    var nc = normalize(fr.chroma), nb = normalize(fr.bass);
    var bw = Math.min(1, 3 * sumArr(fr.bass) / (sumArr(fr.chroma) || 1));
    for (var i = 0; i < 12; i++) {
      if (active) {
        this.longC[i] = this.longC[i] * kLong + nc[i] * (1 - kLong);
        this.longB[i] = this.longB[i] * kLong + nb[i] * bw * (1 - kLong);
      }
      this.shortC[i] = this.shortC[i] * kShort + (active ? nc[i] : 0) * (1 - kShort);
      this.shortB[i] = this.shortB[i] * kShort + (active ? nb[i] * bw : 0) * (1 - kShort);
    }
    if (active) this.frames++;
    var out = { level: fr.rms, active: active };
    for (i = 0; i < 12; i++) { this.hint.maj[i] *= kLong; this.hint.min[i] *= kLong; }
    if (this.lastChord) {
      var lc = this.lastChord, minor = /^(m|dim)/.test(lc.quality) && lc.quality.indexOf('maj') !== 0;
      (minor ? this.hint.min : this.hint.maj)[lc.root] += dt;
    }
    if (this.frames >= 8) {
      var hmax = Math.max(Math.max.apply(null, this.hint.maj), Math.max.apply(null, this.hint.min));
      var hint = hmax > 0 ? {
        maj: Array.prototype.map.call(this.hint.maj, function (v) { return v / hmax; }),
        min: Array.prototype.map.call(this.hint.min, function (v) { return v / hmax; })
      } : null;
      var keys = detectKey(normalize(this.longC), normalize(this.longB), hint);
      out.key = { tonic: keys[0].tonic, scale: keys[0].scale, confidence: keys[0].confidence };
      out.keyAlternatives = keySummary(keys, 4);
    }
    if (sumArr(this.shortC) > 0.2) {
      var ch = matchChord(normalize(this.shortC), normalize(this.shortB), out.key ? T.scalePcs(out.key) : null);
      if (ch && ch.score > 0.6) out.chord = { root: ch.root, quality: ch.quality };
    }
    this.lastChord = out.chord || null;
    if (active) {
      var w = Math.min(1024, Math.floor(ds.data.length / 2) - 1);
      var y = w > 200 ? yin(ds.data, ds.data.length - w * 2 + 1, w, sr, 75, 1100) : null;
      if (y && y.clarity > 0.85) out.note = Math.round(69 + 12 * Math.log(y.freq / 440) / Math.LN2);
    }
    return out;
  };
  LiveAnalyzer.prototype.reset = function () {
    this.longC.fill(0); this.longB.fill(0); this.shortC.fill(0); this.shortB.fill(0); this.frames = 0;
    this.hint.maj.fill(0); this.hint.min.fill(0); this.lastChord = null;
  };

  var api = {
    analyze: analyze, LiveAnalyzer: LiveAnalyzer, downsample: downsample,
    detectKey: detectKey, detectTempo: detectTempo, detectNotes: detectNotes, fft: fft
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JZoDSP = api;
})(typeof self !== 'undefined' ? self : this);
