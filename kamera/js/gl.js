/* JZo M – Bildentwicklung per WebGL (Vorschau live + volle Auflösung, auch streifenweise für KI-Bilder).
   Ein Durchgang: Zuschnitt/Drehung → Schärfe → Weißabgleich/Belichtung → Lichter/Schatten →
   (Schwarzweiß) → Kontrastkurve → Farben/Tönung → Vignette → Korn → (Fokus-Peaking, nur Vorschau). */
(function (global) {
  'use strict';

  var VS = [
    'attribute vec2 aPos;',
    'uniform float uFlip;',
    'varying vec2 vUV;',
    'void main(){',
    '  vUV = vec2(aPos.x*0.5+0.5, uFlip > 0.5 ? aPos.y*0.5+0.5 : 0.5-aPos.y*0.5);',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vUV;',
    'uniform sampler2D uSrc;',
    'uniform vec2 uTexel;',
    'uniform vec4 uCrop;',
    'uniform float uRot;',
    'uniform vec2 uRegion;',
    'uniform vec2 uFull;',
    'uniform float uStep;',
    'uniform float uNeutral;',
    'uniform float uEv, uWarm, uTint, uCon, uHi, uSh, uFade, uSat, uVib, uGreen, uBlue, uRed;',
    'uniform vec3 uShC, uHiC, uMono, uToneS, uToneH;',
    'uniform float uShA, uHiA, uIsMono, uTone, uGrain, uCells, uVig, uSharp, uSeed;',
    'uniform vec4 uPeak;',
    'const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);',
    'vec2 srcUV(vec2 o){',
    '  vec2 c;',
    '  if (uRot < 0.5) c = o;',
    '  else if (uRot < 1.5) c = vec2(o.y, 1.0 - o.x);',
    '  else if (uRot < 2.5) c = vec2(1.0 - o.x, 1.0 - o.y);',
    '  else c = vec2(1.0 - o.y, o.x);',
    '  return uCrop.xy + c * uCrop.zw;',
    '}',
    'float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
    '  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);',
    '}',
    'float curve(float x, float k){',
    '  x = clamp(x, 0.0, 1.0); float e = 1.0 + k;',
    '  return x < 0.5 ? 0.5*pow(2.0*x, e) : 1.0 - 0.5*pow(2.0 - 2.0*x, e);',
    '}',
    'float bump(float h, float c, float w){ float d = abs(h - c); d = min(d, 1.0 - d); return max(0.0, 1.0 - d / w); }',
    'void main(){',
    '  vec2 uv = srcUV(vUV);',
    '  vec3 c = texture2D(uSrc, uv).rgb;',
    '  if (uNeutral > 0.5) { gl_FragColor = vec4(c, 1.0); return; }',
    '  vec2 g = vec2(vUV.x, uRegion.x + vUV.y * uRegion.y);',
    '  float aspect = uFull.x / uFull.y;',
    '  vec2 dx = vec2(uTexel.x * uStep, 0.0), dy = vec2(0.0, uTexel.y * uStep);',
    '  vec3 n1 = texture2D(uSrc, uv + dx).rgb, n2 = texture2D(uSrc, uv - dx).rgb, n3 = texture2D(uSrc, uv + dy).rgb, n4 = texture2D(uSrc, uv - dy).rgb;',
    '  vec3 v = c + (c - (n1 + n2 + n3 + n4) * 0.25) * uSharp * 1.6;',
    // Linear rechnen für Weißabgleich & Belichtung
    '  vec3 lin = pow(max(v, 0.0), vec3(2.2));',
    '  lin *= vec3(1.0 + uWarm * 0.45, 1.0 - uTint * 0.3, 1.0 - uWarm * 0.45);',
    '  lin *= exp2(uEv);',
    '  v = pow(lin, vec3(1.0/2.2));',
    // Lichter zurückholen (weiche Schulter) + Lichter/Schatten
    '  v = v / (1.0 + max(-uHi, 0.0) * 0.8 * max(v - 0.95, 0.0));',
    '  float l = dot(v, LUM);',
    '  float sm = 1.0 - smoothstep(0.0, 0.55, l), hm = smoothstep(0.45, 1.0, l);',
    '  float l2 = l + uSh * 0.22 * sm + uHi * 0.6 * hm * (1.0 - l);',
    '  v *= l > 0.001 ? max(l2, 0.0) / l : 1.0;',
    '  if (uIsMono > 0.5) v = vec3(dot(v, uMono));',
    '  v = vec3(curve(v.r, uCon), curve(v.g, uCon), curve(v.b, uCon));',
    '  v = uFade + v * (1.0 - uFade);',
    '  if (uIsMono < 0.5) {',
    '    float mx = max(v.r, max(v.g, v.b)), mn = min(v.r, min(v.g, v.b)), s = mx - mn, h = 0.0;',
    '    if (s > 0.0001) {',
    '      if (mx == v.r) h = mod((v.g - v.b) / s, 6.0) / 6.0;',
    '      else if (mx == v.g) h = ((v.b - v.r) / s + 2.0) / 6.0;',
    '      else h = ((v.r - v.g) / s + 4.0) / 6.0;',
    '    }',
    '    float sat01 = mx > 0.0 ? s / mx : 0.0;',
    '    float gw = bump(h, 0.28, 0.14), bw = bump(h, 0.6, 0.1), rw = bump(h, 0.04, 0.08);',
    '    float f = uSat * mix(1.0, uGreen, gw) * mix(1.0, uRed, rw) * (1.0 + uVib * (1.0 - sat01));',
    '    float lv = dot(v, LUM);',
    '    v = mix(vec3(lv), v, f);',
    '    v *= 1.0 - uBlue * 0.35 * bw * sat01;',
    '    float lt = clamp(dot(v, LUM), 0.0, 1.0);',
    '    v += (uShC - 0.5) * uShA * 0.7 * (1.0 - lt) * (1.0 - lt);',
    '    v += (uHiC - 0.5) * uHiA * 0.7 * lt * lt;',
    '  } else if (uTone > 0.0) {',
    '    float lt = clamp(v.r, 0.0, 1.0);',
    '    vec3 tc = mix(uToneS, uToneH, lt) * 2.0;',
    '    vec3 t = lt * tc; t *= lt / max(dot(t, LUM), 0.0001);',
    '    v = mix(v, t, clamp(uTone, 0.0, 1.0));',
    '  }',
    '  vec2 q = (g - 0.5) * vec2(aspect, 1.0);',
    '  float d = length(q) / length(vec2(aspect, 1.0) * 0.5);',
    '  v *= 1.0 - uVig * smoothstep(0.3, 1.0, d) * 0.7;',
    '  if (uGrain > 0.0) {',
    '    vec2 p = g * vec2(uCells, uCells / aspect) + uSeed;',
    '    float n = (vnoise(p) + vnoise(p * 2.13 + 17.0) * 0.6) / 1.6 * 2.0 - 1.0;',
    '    float lt = clamp(dot(v, LUM), 0.0, 1.0);',
    '    v += n * uGrain * 0.11 * (0.25 + 3.0 * lt * (1.0 - lt));',
    '  }',
    '  if (uPeak.a > 0.5) {',
    '    float gx = dot(n1 - n2, LUM), gy = dot(n3 - n4, LUM);',
    '    float e = sqrt(gx*gx + gy*gy);',
    '    if (e > 0.16) v = mix(v, uPeak.rgb, 0.85);',
    '  }',
    '  gl_FragColor = vec4(clamp(v, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function Pipeline(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    var gl = canvas.getContext('webgl', { preserveDrawingBuffer: !!opts.preserve, premultipliedAlpha: false, antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL nicht verfügbar');
    this.gl = gl;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.prog = p;
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    this.u = {};
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, ''); this.u[nm] = gl.getUniformLocation(p, nm); }
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.maxOut = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), vp[0], vp[1]);
    this.srcW = 0; this.srcH = 0;
  }

  // Quelle: <video>, ImageBitmap, <img>, <canvas> – oder {data, width, height} (RGBA-Rohdaten).
  Pipeline.prototype.setSource = function (src, w, h) {
    var gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (src && src.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.srcW = w || src.width || src.videoWidth; this.srcH = h || src.height || src.videoHeight;
  };

  /* P = Looks.params(...) oder null (= neutral, nur Zuschnitt/Drehung)
     G = { outW, outH, crop:[x,y,w,h] (0..1), rot:0..3, region:[y0,h] (0..1), fullW, fullH, flip, peak:[r,g,b] | null, seed } */
  Pipeline.prototype.draw = function (P, G) {
    var gl = this.gl, u = this.u, c = this.canvas;
    if (c.width !== G.outW) c.width = G.outW;
    if (c.height !== G.outH) c.height = G.outH;
    gl.viewport(0, 0, G.outW, G.outH);
    var crop = G.crop || [0, 0, 1, 1], rot = G.rot || 0, region = G.region || [0, 1];
    var fullW = G.fullW || G.outW, fullH = G.fullH || G.outH;
    // Wie viele Quellpixel auf ein Ausgabepixel kommen (für Schärfe/Peaking-Abstand)
    var step = Math.max(1, crop[2] * this.srcW / (rot % 2 ? fullH : fullW));
    gl.uniform1i(u.uSrc, 0);
    gl.uniform2f(u.uTexel, 1 / this.srcW, 1 / this.srcH);
    gl.uniform4f(u.uCrop, crop[0], crop[1], crop[2], crop[3]);
    gl.uniform1f(u.uRot, rot);
    gl.uniform2f(u.uRegion, region[0], region[1]);
    gl.uniform2f(u.uFull, fullW, fullH);
    gl.uniform1f(u.uStep, step);
    gl.uniform1f(u.uFlip, G.flip ? 1 : 0);
    gl.uniform1f(u.uNeutral, P ? 0 : 1);
    if (P) {
      gl.uniform1f(u.uEv, P.ev); gl.uniform1f(u.uWarm, P.warm); gl.uniform1f(u.uTint, P.tint);
      gl.uniform1f(u.uCon, Math.max(-0.9, P.con)); gl.uniform1f(u.uHi, P.hi); gl.uniform1f(u.uSh, P.sh);
      gl.uniform1f(u.uFade, P.fade); gl.uniform1f(u.uSat, P.sat); gl.uniform1f(u.uVib, P.vib);
      gl.uniform1f(u.uGreen, P.green); gl.uniform1f(u.uBlue, P.blue); gl.uniform1f(u.uRed, P.red);
      gl.uniform3fv(u.uShC, P.shC); gl.uniform1f(u.uShA, P.shA);
      gl.uniform3fv(u.uHiC, P.hiC); gl.uniform1f(u.uHiA, P.hiA);
      gl.uniform1f(u.uIsMono, P.mono ? 1 : 0); gl.uniform3fv(u.uMono, P.mono || [0.3, 0.59, 0.11]);
      gl.uniform3fv(u.uToneS, P.toneS); gl.uniform3fv(u.uToneH, P.toneH); gl.uniform1f(u.uTone, P.tone);
      // Korn: Größe relativ zum Bild (sieht in jeder Auflösung gleich aus), in der Vorschau gegen Flimmern begrenzt
      var cells = Math.min(2400 / (P.grainSize || 1), fullW * 0.7);
      gl.uniform1f(u.uGrain, P.grain); gl.uniform1f(u.uCells, cells);
      gl.uniform1f(u.uVig, P.vig); gl.uniform1f(u.uSharp, P.sharp);
      gl.uniform1f(u.uSeed, G.seed || 0);
      var pk = G.peak;
      gl.uniform4f(u.uPeak, pk ? pk[0] : 0, pk ? pk[1] : 0, pk ? pk[2] : 0, pk ? 1 : 0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  Pipeline.prototype.read = function (w, h, out) {
    var gl = this.gl;
    out = out || new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  };

  Pipeline.prototype.toBlob = function (q) {
    var c = this.canvas;
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('Bild konnte nicht erstellt werden')); }, 'image/jpeg', q || 0.92); });
  };

  // Größte Canvas-Fläche, die dieser Browser schafft (iPhone: meist 16,7 MP).
  var _maxArea = 0;
  function maxCanvasArea() {
    if (_maxArea) return _maxArea;
    var tests = [[8192, 8192], [7000, 7000], [6000, 6000], [5000, 5000], [4096, 4096], [3000, 3000]];
    for (var i = 0; i < tests.length; i++) {
      try {
        var c = document.createElement('canvas'); c.width = tests[i][0]; c.height = tests[i][1];
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(c.width - 1, c.height - 1, 1, 1);
        var d = x.getImageData(c.width - 1, c.height - 1, 1, 1).data;
        c.width = 1; c.height = 1;
        if (d[3] === 255) { _maxArea = tests[i][0] * tests[i][1]; return _maxArea; }
      } catch (e) { /* zu groß */ }
    }
    _maxArea = 3000 * 3000; return _maxArea;
  }

  global.Pipeline = Pipeline;
  global.maxCanvasArea = maxCanvasArea;
})(this);
