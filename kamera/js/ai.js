/* M1993 – KI-Auflösung („AI Resolution“): rechnet Fotos mit einem neuronalen Netz (ESRGAN/RDN,
   UpscalerJS-Modelle, MIT-Lizenz) auf 2× oder 4× hoch. Läuft komplett auf dem Gerät (TensorFlow.js + WebGL),
   kein Server, keine Kosten. Die Datei liegt im Ordner models/ und vendor/ und wird erst beim ersten Gebrauch geladen.

   Ablauf (streifenweise, damit auch 40–50 MP auf dem iPhone gehen – dort darf eine Canvas nur ~16,7 MP haben):
   Original (ohne Look) → KI in Kacheln → Streifen mit dem Look des Fotos entwickeln (WebGL) → direkt als JPEG kodieren. */
(function (global) {
  'use strict';

  var MODELS = {
    'slim-x2': { scale: 2, name: 'Schnell' },
    'slim-x4': { scale: 4, name: 'Schnell' },
    'medium-x2': { scale: 2, name: 'Detail' }
  };
  var TILE = 128, PAD = 14;
  var tfReady = null, loaded = {};

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('KI-Baustein konnte nicht geladen werden (Internet?)')); };
      document.head.appendChild(s);
    });
  }
  function initTF() {
    if (tfReady) return tfReady;
    tfReady = (global.tf ? Promise.resolve() : loadScript('vendor/tf.min.js')).then(function () {
      return global.tf.setBackend('webgl').catch(function () { return false; });
    }).then(function (ok) {
      if (ok === false || global.tf.getBackend() !== 'webgl') return global.tf.setBackend('cpu').then(function () { return 'cpu'; });
      return 'webgl';
    }).then(function (b) { return global.tf.ready().then(function () { return b; }); });
    tfReady.catch(function () { tfReady = null; });
    return tfReady;
  }
  function loadModel(id) {
    if (loaded[id]) return loaded[id];
    loaded[id] = initTF().then(function () { return global.tf.loadLayersModel('models/' + id + '/model.json'); });
    loaded[id].catch(function () { delete loaded[id]; });
    return loaded[id];
  }

  // Zielgröße berechnen (inkl. Begrenzung). Gibt auch zurück, ob vorher verkleinert werden muss.
  function plan(w, h, factor, maxMP, maxSide) {
    var s = 1;
    if (w * h * factor * factor > maxMP * 1e6) s = Math.sqrt(maxMP * 1e6 / (w * h * factor * factor));
    if (w * s * factor > maxSide) s = Math.min(s, maxSide / (w * factor));
    if (h * s * factor > maxSide) s = Math.min(s, maxSide / (h * factor));
    var sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
    return { sw: sw, sh: sh, W: sw * factor, H: sh * factor, scaled: s < 0.999 };
  }

  function decode(blob) {
    if (global.createImageBitmap) return createImageBitmap(blob).catch(function () { return viaImg(blob); });
    return viaImg(blob);
  }
  function viaImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('Bild konnte nicht gelesen werden')); };
      im.src = u;
    });
  }

  /* opts: { blob (Original ohne Look), params (Looks.params), seed, factor (2|4), model ('slim'|'medium'),
             maxMP, exif (Uint8Array), quality (0..100), onProgress(frac, text), isCancelled() } */
  function upscale(opts) {
    var id = (opts.model === 'medium' && opts.factor === 2 ? 'medium' : 'slim') + '-x' + opts.factor;
    var f = opts.factor, prog = opts.onProgress || function () {}, tf;
    var proc, enc, img, src, P;
    prog(0, 'KI wird geladen …');
    return Promise.all([loadModel(id), decode(opts.blob)]).then(function (r) {
      tf = global.tf; var model = r[0]; img = r[1];
      var canvas = document.createElement('canvas');
      proc = new global.Pipeline(canvas, { preserve: false });
      P = plan(img.width, img.height, f, opts.maxMP || 50, Math.min(proc.maxTex, proc.maxOut, 16384));
      // Quellpixel holen (ggf. vorher verkleinert)
      var c2 = document.createElement('canvas'); c2.width = P.sw; c2.height = P.sh;
      var x2 = c2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(img, 0, 0, P.sw, P.sh);
      src = x2.getImageData(0, 0, P.sw, P.sh).data; c2.width = 1; c2.height = 1;
      if (img.close) img.close();
      enc = new global.JPEGStream(opts.quality || 92);
      enc.begin(P.W, P.H, opts.exif ? opts.exif(P.W, P.H) : null);
      return run(model);
    });

    function run(model) {
      var sw = P.sw, sh = P.sh, W = P.W, H = P.H, IN = TILE + 2 * PAD;
      var cols = Math.ceil(sw / TILE), rows = Math.ceil(sh / TILE), total = cols * rows, done = 0, t0 = Date.now();
      var inBuf = new Float32Array(IN * IN * 3);
      var ty = 0, band = null, bandRows = 0;
      function tileInput(x0, y0) {
        var k = 0;
        for (var y = 0; y < IN; y++) {
          var sy = Math.min(sh - 1, Math.max(0, y0 - PAD + y));
          for (var x = 0; x < IN; x++) {
            var sx = Math.min(sw - 1, Math.max(0, x0 - PAD + x)), p = (sy * sw + sx) * 4;
            inBuf[k++] = src[p]; inBuf[k++] = src[p + 1]; inBuf[k++] = src[p + 2];
          }
        }
        return tf.tensor4d(inBuf, [1, IN, IN, 3]);
      }
      function nextBand() {
        if (opts.isCancelled && opts.isCancelled()) return Promise.reject(new Error('abgebrochen'));
        if (ty >= rows) return Promise.resolve();
        var y0 = ty * TILE, th = Math.min(TILE, sh - y0);
        bandRows = th * f;
        band = new Uint8ClampedArray(W * bandRows * 4);
        var tx = 0;
        function nextTile() {
          if (opts.isCancelled && opts.isCancelled()) return Promise.reject(new Error('abgebrochen'));
          if (tx >= cols) return Promise.resolve();
          var x0 = tx * TILE, tw = Math.min(TILE, sw - x0);
          var out = tf.tidy(function () {
            var y = model.predict(tileInput(x0, y0));
            return tf.slice(y, [0, PAD * f, PAD * f, 0], [1, th * f, tw * f, 3]);
          });
          return out.data().then(function (d) {
            out.dispose();
            var ow = tw * f, oh = th * f, ox = x0 * f;
            for (var y = 0; y < oh; y++) {
              var q = (y * W + ox) * 4, k = y * ow * 3;
              for (var x = 0; x < ow; x++, q += 4, k += 3) { band[q] = d[k]; band[q + 1] = d[k + 1]; band[q + 2] = d[k + 2]; band[q + 3] = 255; }
            }
            done++; tx++;
            var el = (Date.now() - t0) / 1000, rest = done > 2 ? el / done * (total - done) : null;
            prog(done / total * 0.98, rest === null ? 'KI rechnet …' : 'noch ca. ' + fmtTime(rest));
            return nextTile();
          });
        }
        return nextTile().then(function () {
          // Streifen mit Look entwickeln und kodieren
          var yG = y0 * f;
          proc.setSource({ data: new Uint8Array(band.buffer), width: W, height: bandRows }, W, bandRows);
          proc.draw(opts.params, { outW: W, outH: bandRows, flip: true, region: [yG / H, bandRows / H], fullW: W, fullH: H, seed: opts.seed || 0 });
          var px = proc.read(W, bandRows);
          enc.addRows(px, bandRows);
          band = null; ty++;
          return new Promise(function (r) { setTimeout(r, 0); }).then(nextBand);
        });
      }
      return nextBand().then(function () {
        prog(0.99, 'Datei wird erstellt …');
        var blob = enc.finish();
        proc.gl.getExtension('WEBGL_lose_context') && proc.gl.getExtension('WEBGL_lose_context').loseContext();
        prog(1, 'Fertig');
        return { blob: blob, w: W, h: H, scaled: P.scaled, backend: tf.getBackend() };
      });
    }
  }

  function fmtTime(s) {
    s = Math.round(s);
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60), r = s % 60;
    return m + ' min ' + (r < 10 ? '0' : '') + r + ' s';
  }

  global.AI = { upscale: upscale, plan: plan, MODELS: MODELS, initTF: initTF, fmtTime: fmtTime };
})(this);
