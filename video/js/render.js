/* JZo Video AI – Bild-Renderer.
   Pass 1: Clip → Bildausschnitt/Zoom, Effekte, Farb-Nodes (wie DaVinci) → Zwischenbild
   Pass 2: Übergang zwischen zwei Zwischenbildern → WebGL-Leinwand
   Danach werden Sticker, Texte und Partikel (Feuer usw.) in 2D darübergezeichnet. */
(function (global) {
  'use strict';
  var MAXN = 6, NFX = 20;

  var VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }';

  var FS_CLIP = [
    'precision highp float;',
    'varying vec2 uv;',
    'uniform sampler2D tex; uniform vec2 outSize; uniform vec2 srcSize; uniform float fit;',
    'uniform vec4 xf; uniform vec2 xt; uniform float t; uniform float fx[' + NFX + '];',
    'uniform vec3 nLift[' + MAXN + ']; uniform vec3 nGamma[' + MAXN + ']; uniform vec3 nGain[' + MAXN + ']; uniform vec3 nOff[' + MAXN + '];',
    'uniform vec4 nA[' + MAXN + ']; uniform vec4 nB[' + MAXN + ']; uniform vec4 nC[' + MAXN + '];',
    'uniform float hasSrc;',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
    'vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }',
    'vec2 mapUV(vec2 q){',
    '  float oa = outSize.x/outSize.y; float sa = srcSize.x/srcSize.y;',
    '  vec2 c = vec2((q.x-0.5)*oa, q.y-0.5);',
    '  c -= xt; float cs = cos(-xf.y), sn = sin(-xf.y); c = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs) / xf.x;',
    '  vec2 sz; bool wide = sa > oa;',
    '  if (fit < 0.5) sz = wide ? vec2(oa, oa/sa) : vec2(sa, 1.0); else sz = wide ? vec2(sa, 1.0) : vec2(oa, oa/sa);',
    '  return vec2(c.x/sz.x + 0.5, c.y/sz.y + 0.5);',
    '}',
    'vec3 samp(vec2 q){ vec2 s = mapUV(q); if (s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0) return vec3(0.0); return texture2D(tex, s).rgb; }',
    'void main(){',
    '  vec2 q = uv; float T = t;',
    '  if (fx[10] > 0.0) q.x = q.x > 0.5 ? 1.0 - q.x : q.x;',
    '  if (fx[17] > 0.0) { vec2 d = abs(q-0.5); q = 0.5 + vec2(max(d.x,d.y*0.6), min(d.x,d.y)); q = mix(uv, q, fx[17]); }',
    '  if (fx[16] > 0.0) { vec2 d = q-0.5; float r = length(d); q = 0.5 + d*(1.0 - fx[16]*0.6*(0.5 - r*r)); }',
    '  if (fx[6] > 0.0) { float n = mix(220.0, 18.0, fx[6]); vec2 g = vec2(n*outSize.x/outSize.y, n); q = (floor(q*g)+0.5)/g; }',
    '  if (fx[2] > 0.0) { q.x += sin(q.y*30.0 + T*8.0)*0.002*fx[2] + (rnd(vec2(floor(q.y*120.0), floor(T*20.0)))-0.5)*0.006*fx[2]; }',
    '  if (fx[0] > 0.0) { float bt = floor(T*12.0); float row = floor(q.y*14.0);',
    '    float r = rnd(vec2(row, bt)); if (r < fx[0]*0.45) q.x += (rnd(vec2(bt,row+3.0))-0.5)*0.25*fx[0]; }',
    '  vec3 col;',
    '  float sh = fx[1]*0.012 + fx[0]*0.008*step(0.7, rnd(vec2(floor(T*10.0),1.0))) + fx[2]*0.004;',
    '  if (sh > 0.0) col = vec3(samp(q+vec2(sh,0.0)).r, samp(q).g, samp(q-vec2(sh,0.0)).b); else col = samp(q);',
    '  if (fx[5] > 0.0) { vec2 px = fx[5]*4.0/outSize; vec3 a = col;',
    '    for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) { if (i!=0||j!=0) a += samp(q + vec2(float(i),float(j))*px); }',
    '    col = a/25.0; }',
    /* Farb-Nodes, nacheinander wie in DaVinci (seriell) */
    '  for (int i=0;i<' + MAXN + ';i++) {',
    '    if (nC[i].w < 0.5) continue;',
    '    col *= exp2(nB[i].z);',
    '    col *= vec3(1.0 + nB[i].x*0.25, 1.0 + nB[i].y*-0.15, 1.0 - nB[i].x*0.25) * vec3(1.0 + nB[i].y*0.08, 1.0, 1.0 + nB[i].y*0.08);',
    '    col = col*nGain[i] + nLift[i]*(1.0-col);',
    '    col = pow(max(col, 0.0), 1.0/max(nGamma[i], vec3(0.05)));',
    '    col += nOff[i];',
    '    float L = dot(col, vec3(0.2126,0.7152,0.0722));',
    '    col += nC[i].x*0.35*smoothstep(0.4,1.0,L) + nC[i].y*0.35*(1.0-smoothstep(0.0,0.6,L));',
    '    col = (col - nA[i].y)*nA[i].x + nA[i].y;',
    '    L = dot(col, vec3(0.2126,0.7152,0.0722));',
    '    col = mix(vec3(L), col, nA[i].z);',
    '    if (nA[i].w != 0.0) col = hueRot(col, nA[i].w);',
    '  }',
    '  float lum = dot(col, vec3(0.2126,0.7152,0.0722));',
    '  if (fx[7] > 0.0) col = mix(col, vec3(lum), fx[7]);',
    '  if (fx[8] > 0.0) col = mix(col, vec3(lum*1.07, lum*0.74, lum*0.43)*1.1, fx[8]);',
    '  if (fx[18] > 0.0) { vec3 th = lum < 0.5 ? mix(vec3(0.0,0.0,0.6), vec3(0.0,0.9,0.2), lum*2.0) : mix(vec3(1.0,1.0,0.0), vec3(1.0,0.1,0.0), lum*2.0-1.0); col = mix(col, th, fx[18]); }',
    '  if (fx[12] > 0.0) { float lv = mix(12.0, 3.0, fx[12]); col = floor(col*lv+0.5)/lv; }',
    '  if (fx[15] > 0.0) col = hueRot(col, T*3.0*fx[15]);',
    '  if (fx[9] > 0.0) col = mix(col, 1.0-col, fx[9]);',
    '  if (fx[13] > 0.0) { vec2 c = vec2(0.85 + sin(T*0.7)*0.2, 0.8 + cos(T*0.5)*0.2); float d = 1.0 - smoothstep(0.0, 0.9, distance(uv, c)); col += vec3(1.0,0.45,0.15)*d*d*fx[13]*0.8; }',
    '  if (fx[3] > 0.0) col += (rnd(uv*outSize + fract(T)*100.0)-0.5)*0.25*fx[3];',
    '  if (fx[2] > 0.0) { col += (rnd(vec2(uv.y*outSize.y, floor(T*30.0)))-0.5)*0.08*fx[2]; col.b *= 1.0 - 0.1*fx[2]; }',
    '  if (fx[11] > 0.0) col *= 1.0 - fx[11]*0.35*(0.5+0.5*sin(uv.y*outSize.y*1.6));',
    '  if (fx[14] > 0.0) col += vec3(step(1.0 - fx[14]*0.35, rnd(vec2(floor(T*8.0), 7.0))))*0.8;',
    '  if (fx[4] > 0.0) { vec2 d = uv-0.5; col *= 1.0 - fx[4]*smoothstep(0.25, 0.85, length(d*vec2(outSize.x/outSize.y,1.0)*0.9)); }',
    '  if (fx[19] > 0.0) { float oa = outSize.x/outSize.y; float bar = oa > 1.0 ? (1.0 - oa/2.39)*0.5 : 0.1; if (uv.y < bar*fx[19] || uv.y > 1.0-bar*fx[19]) col = vec3(0.0); }',
    '  gl_FragColor = vec4(clamp(col,0.0,1.0)*hasSrc, 1.0);',
    '}'
  ].join('\n');

  var FS_MIX = [
    'precision highp float;',
    'varying vec2 uv; uniform sampler2D A; uniform sampler2D B; uniform float p; uniform int type; uniform float t; uniform vec2 outSize; uniform float fade;',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
    'vec4 a(vec2 q){ return texture2D(A, clamp(q,0.0,1.0)); } vec4 b(vec2 q){ return texture2D(B, clamp(q,0.0,1.0)); }',
    'vec4 blurA(vec2 q, float r){ vec4 s=vec4(0.0); for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++) s+=a(q+vec2(float(i),float(j))*r/outSize); return s/49.0; }',
    'vec4 blurB(vec2 q, float r){ vec4 s=vec4(0.0); for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++) s+=b(q+vec2(float(i),float(j))*r/outSize); return s/49.0; }',
    'void main(){',
    '  vec4 c; float e = p*p*(3.0-2.0*p);',
    '  if (type == 0) c = p < 0.5 ? a(uv) : b(uv);',
    '  else if (type == 1) c = mix(a(uv), b(uv), e);',
    '  else if (type == 2) c = p < 0.5 ? a(uv)*(1.0-p*2.0) : b(uv)*(p*2.0-1.0);',
    '  else if (type == 3) c = p < 0.5 ? mix(a(uv), vec4(1.0), p*2.0) : mix(vec4(1.0), b(uv), p*2.0-1.0);',
    '  else if (type == 4) c = uv.x > 1.0-e ? b(uv) : a(uv);',
    '  else if (type == 5) c = uv.x < e ? b(uv) : a(uv);',
    '  else if (type == 6) c = uv.y < e ? b(uv) : a(uv);',
    '  else if (type == 7) c = uv.x < 1.0-e ? a(uv+vec2(e,0.0)) : b(uv-vec2(1.0-e,0.0));',
    '  else if (type == 8) c = uv.x > e ? a(uv-vec2(e,0.0)) : b(uv+vec2(1.0-e,0.0));',
    '  else if (type == 9) { vec2 d = uv-0.5; c = p < 0.5 ? a(0.5 + d/(1.0+p*2.0)) : b(0.5 + d/(1.0+(1.0-p)*2.0)); }',
    '  else if (type == 10) { vec2 d = uv-0.5; c = p < 0.5 ? a(0.5 + d*(1.0+p*2.0)) : b(0.5 + d*(1.0+(1.0-p)*2.0)); }',
    '  else if (type == 11) { float k = sin(p*3.14159); float row = floor(uv.y*20.0); float off = (rnd(vec2(row, floor(t*25.0)))-0.5)*0.3*k; vec2 q = uv+vec2(off,0.0);',
    '    vec4 x = p < 0.5 ? a(q) : b(q); vec4 y = p < 0.5 ? a(q+vec2(0.02*k,0.0)) : b(q+vec2(0.02*k,0.0)); c = vec4(y.r, x.g, x.b, 1.0); }',
    '  else if (type == 12) { float r = length((uv-0.5)*vec2(outSize.x/outSize.y,1.0)); c = r < e*1.2 ? b(uv) : a(uv); }',
    '  else if (type == 13) { vec2 d = (uv-0.5)*vec2(outSize.x/outSize.y,1.0); float ang = (p<0.5?p:1.0-p)*6.2832; float s = 1.0 + sin(p*3.14159)*1.5;',
    '    d = vec2(d.x*cos(ang)-d.y*sin(ang), d.x*sin(ang)+d.y*cos(ang))*s; vec2 q = d/vec2(outSize.x/outSize.y,1.0)+0.5; c = p<0.5 ? a(q) : b(q); }',
    '  else if (type == 14) { float f = 1.0 - abs(p*2.0-1.0); c = mix(p<0.5?a(uv):b(uv), vec4(1.0), f*f); }',
    '  else if (type == 15) { float k = sin(p*3.14159); float n = mix(400.0, 12.0, k); vec2 g = vec2(n*outSize.x/outSize.y, n); vec2 q = (floor(uv*g)+0.5)/g; c = p<0.5?a(q):b(q); }',
    '  else if (type == 16) { float k = sin(p*3.14159)*6.0; c = mix(blurA(uv,k), blurB(uv,k), e); }',
    '  else if (type == 17) { float l = dot(b(uv).rgb, vec3(0.33)); float m = smoothstep(l-0.1, l+0.1, e*1.2-0.1); vec4 burn = vec4(1.0,0.5,0.1,1.0)*(1.0-abs(m-0.5)*2.0)*sin(p*3.14159); c = mix(a(uv), b(uv), m) + burn; }',
    '  else if (type == 18) c = (uv.x+uv.y)*0.5 < e*1.1-0.05 ? b(uv) : a(uv);',
    '  else if (type == 19) { float k = sin(p*3.14159); vec4 s = vec4(0.0); for (int i=0;i<9;i++) { float o = (float(i)/8.0-0.5)*0.12*k;',
    '      vec2 qa = uv+vec2(e*1.0+o,0.0); vec2 qb = uv-vec2((1.0-e)*1.0-o,0.0); s += uv.x < 1.0-e ? a(qa) : b(qb); } c = s/9.0; }',
    '  else c = a(uv);',
    '  gl_FragColor = vec4(c.rgb*fade, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i), nm = info.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    return { p: p, u: u };
  }

  /* Farbrad-Position (x/y) → RGB-Verschiebung */
  function wheelVec(w) {
    var a = Math.atan2(w.y, w.x), r = Math.min(1, Math.hypot(w.x, w.y));
    return [Math.cos(a) * r, Math.cos(a - 2.0944) * r, Math.cos(a + 2.0944) * r];
  }
  function nodeUniforms(nodes) {
    var L = new Float32Array(MAXN * 3), G = new Float32Array(MAXN * 3), N = new Float32Array(MAXN * 3), O = new Float32Array(MAXN * 3);
    var A = new Float32Array(MAXN * 4), B = new Float32Array(MAXN * 4), C = new Float32Array(MAXN * 4);
    for (var i = 0; i < MAXN; i++) {
      var n = nodes && nodes[i];
      for (var k = 0; k < 3; k++) { G[i * 3 + k] = 1; N[i * 3 + k] = 1; }
      A[i * 4] = 1; A[i * 4 + 2] = 1;
      if (!n || !n.on) continue;
      var lv = wheelVec(n.lift), gv = wheelVec(n.gamma), nv = wheelVec(n.gain), ov = wheelVec(n.offset);
      for (k = 0; k < 3; k++) {
        L[i * 3 + k] = n.lift.m * 0.4 + lv[k] * 0.12;
        G[i * 3 + k] = 1 + n.gamma.m * 0.6 + gv[k] * 0.25;
        N[i * 3 + k] = 1 + n.gain.m + nv[k] * 0.3;
        O[i * 3 + k] = n.offset.m * 0.25 + ov[k] * 0.08;
      }
      A[i * 4] = n.contrast; A[i * 4 + 1] = n.pivot; A[i * 4 + 2] = n.sat; A[i * 4 + 3] = n.hue * Math.PI / 180;
      B[i * 4] = n.temp; B[i * 4 + 1] = n.tint; B[i * 4 + 2] = n.exposure;
      C[i * 4] = n.highlights; C[i * 4 + 1] = n.shadows; C[i * 4 + 3] = 1;
    }
    return { L: L, G: G, N: N, O: O, A: A, B: B, C: C };
  }

  /* Bewegungs-Effekte → Zoom s, Drehung r, Verschiebung tx/ty */
  function motion(effects, lt, dur) {
    var s = 1, r = 0, tx = 0, ty = 0, pr = dur > 0 ? Math.max(0, Math.min(1, lt / dur)) : 0;
    var e = pr * pr * (3 - 2 * pr);
    (effects || []).forEach(function (f) {
      var a = f.amount, def = LIB.fxById(f.fx);
      if (!def || def.kind !== 'move') return;
      switch (f.fx) {
        case 'zoomIn': s *= 1 + 0.35 * a * e; break;
        case 'zoomOut': s *= 1 + 0.35 * a * (1 - e); break;
        case 'punch': var ph = (lt % 0.5) / 0.5; s *= 1 + 0.15 * a * Math.exp(-ph * 6); break;
        case 'kenburns': s *= 1.1 + 0.15 * a * e; tx += (e - 0.5) * 0.12 * a; ty += (e - 0.5) * 0.05 * a; break;
        case 'shake': tx += (Math.sin(lt * 7.3) + Math.sin(lt * 12.1) * 0.5) * 0.008 * a; ty += (Math.cos(lt * 6.1) + Math.sin(lt * 15.7) * 0.4) * 0.008 * a; r += Math.sin(lt * 5.3) * 0.006 * a; s *= 1 + 0.03 * a; break;
        case 'quake': tx += (Math.sin(lt * 41) + Math.sin(lt * 67)) * 0.012 * a; ty += (Math.cos(lt * 53) + Math.sin(lt * 71)) * 0.012 * a; s *= 1 + 0.06 * a; break;
        case 'wobble': r += Math.sin(lt * 2) * 0.05 * a; s *= 1 + 0.06 * a; break;
        case 'spinIn': var k = Math.max(0, 1 - lt / 0.6); k = k * k; r += k * Math.PI * a; s *= 1 + k * 1.5 * a; break;
        case 'bounceIn': var b = lt < 0.7 ? Math.exp(-lt * 6) * Math.cos(lt * 22) : 0; s *= 1 + b * 0.3 * a; break;
      }
    });
    return { s: s, r: r, tx: tx, ty: ty };
  }

  function Renderer(display) {
    this.display = display;               // sichtbare 2D-Leinwand (wird auch exportiert)
    this.ctx = display.getContext('2d');
    this.glc = document.createElement('canvas');
    var gl = this.glc.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true }) || this.glc.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL fehlt');
    this.gl = gl;
    this.pClip = program(gl, FS_CLIP);
    this.pMix = program(gl, FS_MIX);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = [this.tex(), this.tex()]; this.fbo = [null, null]; this.particles = {};
  }
  Renderer.prototype.tex = function () {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  };
  Renderer.prototype.resize = function (w, h) {
    if (this.display.width === w && this.display.height === h && this.fbo[0]) return;
    this.display.width = w; this.display.height = h; this.glc.width = w; this.glc.height = h;
    var gl = this.gl;
    for (var i = 0; i < 2; i++) {
      if (this.fbo[i]) { gl.deleteFramebuffer(this.fbo[i].f); gl.deleteTexture(this.fbo[i].t); }
      var t = this.tex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      var f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      this.fbo[i] = { f: f, t: t };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /* layer = { el, w, h, clip, lt (Zeit im Clip), dur, bypass } */
  Renderer.prototype.drawClip = function (layer, target) {
    var gl = this.gl, P = this.pClip, u = P.u, W = this.display.width, H = this.display.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[target].f);
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.p);
    var has = layer ? 1 : 0;   // noch nicht geladen → letztes Bild dieses Platzes weiterzeigen statt Schwarz
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.srcTex[target]);
    if (layer && layer.el) {
      try {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.el);
      } catch (e) { /* Bild noch nicht bereit */ }
    }
    gl.uniform1i(u.tex, 0);
    gl.uniform2f(u.outSize, W, H);
    gl.uniform2f(u.srcSize, (layer && layer.w) || W, (layer && layer.h) || H);
    gl.uniform1f(u.hasSrc, has);
    var clip = layer && layer.clip, fxv = new Float32Array(NFX), m = { s: 1, r: 0, tx: 0, ty: 0 };
    if (clip) {
      gl.uniform1f(u.fit, clip.fit === 'fill' ? 1 : 0);
      (clip.effects || []).forEach(function (f) { var d = LIB.fxById(f.fx); if (d && d.kind === 'shader') fxv[d.slot] = Math.max(fxv[d.slot], f.amount); });
      m = motion(clip.effects, layer.lt, layer.dur);
      var tr = clip.transform || { s: 1, x: 0, y: 0, r: 0 };
      m.s *= tr.s; m.tx += tr.x; m.ty += tr.y; m.r += tr.r * Math.PI / 180;
    }
    gl.uniform4f(u.xf, m.s, m.r, 0, 0); gl.uniform2f(u.xt, m.tx, m.ty);
    gl.uniform1f(u.t, layer ? layer.lt : 0);
    gl.uniform1fv(u.fx, fxv);
    var nu = nodeUniforms(clip && !layer.bypass ? clip.nodes : null);
    gl.uniform3fv(u.nLift, nu.L); gl.uniform3fv(u.nGamma, nu.G); gl.uniform3fv(u.nGain, nu.N); gl.uniform3fv(u.nOff, nu.O);
    gl.uniform4fv(u.nA, nu.A); gl.uniform4fv(u.nB, nu.B); gl.uniform4fv(u.nC, nu.C);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  /* frame = { a: layer, b: layer|null, type, p, t, fade, overlays, time, selected } */
  Renderer.prototype.render = function (frame) {
    var gl = this.gl, W = this.display.width, H = this.display.height;
    this.drawClip(frame.a, 0);
    if (frame.b) this.drawClip(frame.b, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    var P = this.pMix; gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo[0].t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (frame.b ? this.fbo[1] : this.fbo[0]).t);
    gl.uniform1i(P.u.A, 0); gl.uniform1i(P.u.B, 1);
    gl.uniform1f(P.u.p, frame.b ? frame.p : 0); gl.uniform1i(P.u.type, frame.b ? frame.type : 0);
    gl.uniform1f(P.u.t, frame.t || 0); gl.uniform2f(P.u.outSize, W, H); gl.uniform1f(P.u.fade, frame.fade == null ? 1 : frame.fade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    var c = this.ctx;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.drawImage(this.glc, 0, 0);
    var self = this;
    (frame.overlays || []).forEach(function (o) { self.drawOverlay(o, frame.time, o === frame.selected, frame.dt || 0); });
  };

  /* ---------- Overlays: Position aus Keyframes ---------- */
  function ovPos(o, time) {
    var lt = time - o.start, k = o.keys;
    if (!o.track || k.length === 1) return { x: k[0].x, y: k[0].y, s: k[0].s, lt: lt };
    if (lt <= k[0].t) return { x: k[0].x, y: k[0].y, s: k[0].s, lt: lt };
    for (var i = 1; i < k.length; i++) {
      if (lt <= k[i].t) {
        var f = (lt - k[i - 1].t) / Math.max(1e-6, k[i].t - k[i - 1].t);
        return { x: k[i - 1].x + (k[i].x - k[i - 1].x) * f, y: k[i - 1].y + (k[i].y - k[i - 1].y) * f, s: k[i - 1].s + (k[i].s - k[i - 1].s) * f, lt: lt };
      }
    }
    var l = k[k.length - 1]; return { x: l.x, y: l.y, s: l.s, lt: lt };
  }
  Renderer.ovPos = ovPos;

  Renderer.prototype.drawOverlay = function (o, time, selected, dt) {
    var c = this.ctx, W = this.display.width, H = this.display.height, pos = ovPos(o, time);
    var x = pos.x * W, y = pos.y * H, sz = pos.s * H * 0.18, lt = pos.lt;
    var fadeA = Math.min(1, lt / 0.15, (o.dur - lt) / 0.15);
    c.save();
    c.globalAlpha = Math.max(0, fadeA) * (o.opacity == null ? 1 : o.opacity);
    if (o.kind === 'sticker') this.drawSticker(o, x, y, sz, lt);
    else if (o.kind === 'text') this.drawText(o, x, y, sz, lt);
    else if (o.kind === 'fx') this.drawParticles(o, x, y, sz, lt, dt);
    c.restore();
    if (selected) {
      c.save(); c.strokeStyle = '#ff6a1a'; c.lineWidth = Math.max(2, H / 300); c.setLineDash([8, 6]);
      var hs = o.kind === 'text' ? sz * 1.6 : sz * 0.75;
      c.strokeRect(x - hs * (o.kind === 'text' ? 2.4 : 1), y - hs, hs * 2 * (o.kind === 'text' ? 2.4 : 1), hs * 2);
      c.restore();
    }
  };

  var IMG_CACHE = {};
  function img(src) {
    if (!IMG_CACHE[src]) { var i = new Image(); i.src = src; IMG_CACHE[src] = i; }
    return IMG_CACHE[src];
  }
  function animScale(anim, lt) {
    var r = { s: 1, r: 0, dx: 0, dy: 0 };
    switch (anim) {
      case 'pop': r.s = lt < 0.35 ? 1.25 * Math.sin(Math.min(1, lt / 0.35) * 2.2) / Math.sin(2.2) * (1 - 0.2 * lt / 0.35) : 1; r.s = Math.max(0, r.s); break;
      case 'bounce': r.dy = -Math.abs(Math.sin(lt * 4)) * 0.25; break;
      case 'pulse': r.s = 1 + Math.sin(lt * 6) * 0.1; break;
      case 'spin': r.r = lt * 2; break;
      case 'float': r.dy = Math.sin(lt * 2) * 0.12; r.dx = Math.sin(lt * 1.3) * 0.06; break;
      case 'shake': r.dx = Math.sin(lt * 50) * 0.04; r.dy = Math.cos(lt * 43) * 0.04; break;
      case 'wiggle': r.r = Math.sin(lt * 8) * 0.25; break;
    }
    return r;
  }
  Renderer.prototype.drawSticker = function (o, x, y, sz, lt) {
    var c = this.ctx, a = animScale(o.anim, lt);
    c.translate(x + a.dx * sz, y + a.dy * sz); c.rotate(a.r + (o.rot || 0) * Math.PI / 180); c.scale(a.s, a.s);
    if (o.src) {
      var im = img(o.src);
      if (im.complete && im.naturalWidth) { var ar = im.naturalWidth / im.naturalHeight, h = sz * 1.4; c.drawImage(im, -h * ar / 2, -h / 2, h * ar, h); }
    } else {
      c.font = Math.round(sz * 1.2) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(o.emoji || '⭐', 0, sz * 0.05);
    }
  };

  Renderer.prototype.drawText = function (o, x, y, sz, lt) {
    var c = this.ctx, txt = o.text || 'Text', st = o.style || 'clean', fs = Math.round(sz * 0.55), anim = o.anim || 'pop';
    var col = o.color || '#ffffff';
    if (anim === 'pop' && lt < 0.3) { var k = Math.sin(Math.min(1, lt / 0.3) * 2.2) / Math.sin(2.2); c.translate(x, y); c.scale(k, k); c.translate(-x, -y); }
    if (anim === 'fade') c.globalAlpha *= Math.min(1, lt / 0.6);
    if (anim === 'slide') { var e = Math.min(1, lt / 0.4); y += (1 - e * (2 - e)) * sz; c.globalAlpha *= e; }
    if (anim === 'type') txt = txt.slice(0, Math.floor(lt * 14));
    c.font = (st === 'impact' ? '900 ' : st === 'subtitle' ? '600 ' : '800 ') + fs + 'px -apple-system, "Helvetica Neue", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var lines = txt.split('\n'), lh = fs * 1.2, y0 = y - (lines.length - 1) * lh / 2;
    var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, c.measureText(l).width); });
    if (st === 'subtitle') { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - wmax / 2 - fs * 0.4, y0 - lh / 2 - fs * 0.15, wmax + fs * 0.8, lh * lines.length + fs * 0.3); }
    if (st === 'lower') {
      c.textAlign = 'left'; var bx = x - wmax / 2;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - fs * 0.6, y0 - lh / 2 - fs * 0.2, wmax + fs * 1.2, lh * lines.length + fs * 0.4);
      c.fillStyle = '#ff6a1a'; c.fillRect(bx - fs * 0.6, y0 - lh / 2 - fs * 0.2, fs * 0.18, lh * lines.length + fs * 0.4);
      x = bx;
    }
    lines.forEach(function (l, i) {
      var ly = y0 + i * lh;
      if (st === 'outline' || st === 'impact') { c.lineJoin = 'round'; c.lineWidth = fs * 0.16; c.strokeStyle = '#000'; c.strokeText(l, x, ly); }
      if (st === 'neon') { c.shadowColor = col; c.shadowBlur = fs * 0.6; }
      else if (st === 'clean') { c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = fs * 0.2; c.shadowOffsetY = fs * 0.05; }
      c.fillStyle = st === 'impact' ? '#ffd400' : col;
      c.fillText(l, x, ly);
      if (st === 'neon') { c.shadowBlur = fs * 0.2; c.fillStyle = '#fff'; c.globalAlpha *= 0.7; c.fillText(l, x, ly); }
      c.shadowBlur = 0; c.shadowOffsetY = 0;
    });
  };

  /* ---------- Partikel (Feuer, Funken, Rauch …) ---------- */
  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  var EMIT = {
    fire: { rate: 130, life: [0.5, 1.0], sp: [1.0, 1.8], spread: 0.3, size: [0.07, 0.13], up: 1, grav: -0.9, add: true, sway: 1 },
    handfire: { rate: 110, life: [0.4, 0.85], sp: [0.9, 1.5], spread: 0.28, size: [0.06, 0.11], up: 1, grav: -1.0, add: true, sway: 1 },
    sparks: { rate: 60, life: [0.4, 1.0], sp: [1.2, 2.6], spread: 1.2, size: [0.02, 0.05], up: 1, grav: 2.2, add: true },
    smoke: { rate: 25, life: [1.6, 3.0], sp: [0.2, 0.45], spread: 0.35, size: [0.3, 0.6], up: 1, grav: -0.1 },
    explosion: { burst: 140, life: [0.5, 1.4], sp: [0.8, 3.0], spread: 6.3, size: [0.15, 0.4], up: 0, grav: 0.4, add: true },
    magic: { rate: 40, life: [0.6, 1.4], sp: [0.1, 0.5], spread: 6.3, size: [0.04, 0.1], up: 0, grav: -0.15, add: true },
    hearts: { rate: 6, life: [1.5, 2.6], sp: [0.3, 0.6], spread: 0.6, size: [0.25, 0.45], up: 1, grav: -0.1, emoji: ['❤️', '💖', '💕'] },
    bubbles: { rate: 8, life: [2, 3.5], sp: [0.2, 0.45], spread: 0.8, size: [0.12, 0.3], up: 1, grav: -0.05 },
    confetti: { full: true, rate: 70, life: [3, 5], sp: [0.25, 0.5], size: [0.03, 0.05], grav: 0.1 },
    snow: { full: true, rate: 45, life: [5, 8], sp: [0.12, 0.25], size: [0.005, 0.014], grav: 0.02 },
    rain: { full: true, rate: 160, life: [0.6, 1.0], sp: [1.8, 2.4], size: [0.004, 0.006], grav: 0 },
    money: { full: true, rate: 8, life: [3, 5], sp: [0.2, 0.4], size: [0.1, 0.16], grav: 0.05, emoji: ['💸', '💵', '💰'] },
    emojirain: { full: true, rate: 8, life: [3, 5], sp: [0.2, 0.4], size: [0.1, 0.16], grav: 0.05, emoji: ['😂', '🤣', '😆'] }
  };
  Renderer.prototype.drawParticles = function (o, x, y, sz, lt, dt) {
    var c = this.ctx, W = this.display.width, H = this.display.height, type = o.type;
    if (type === 'lightning') return this.drawLightning(o, x, y, sz, lt);
    if (type === 'aura') return this.drawAura(x, y, sz, lt);
    var cfg = EMIT[type]; if (!cfg) return;
    var st = this.particles[o.id];
    var step = 1 / 60;
    if (!st || lt < st.lt - 0.001 || lt - st.lt > 0.5) {   // gesprungen → neu aufbauen (und vorwärmen)
      st = this.particles[o.id] = { ps: [], lt: cfg.full ? lt - 6 : Math.max(0, lt - (cfg.burst ? lt : 1.2)), acc: 0, rnd: rng(o.seed || 7), burst: false };
    }
    var R = st.rnd;
    function spawn() {
      var life = cfg.life[0] + R() * (cfg.life[1] - cfg.life[0]);
      var sp = cfg.sp[0] + R() * (cfg.sp[1] - cfg.sp[0]);
      var p = { age: 0, life: life, size: cfg.size[0] + R() * (cfg.size[1] - cfg.size[0]), rot: R() * 6.28, vr: (R() - 0.5) * 6, hue: R() };
      if (cfg.full) { p.x = R() * 1.2 - 0.1; p.y = -0.05; p.vx = (R() - 0.5) * 0.1 + (type === 'rain' ? 0.15 : 0); p.vy = sp; p.full = true; }
      else {
        var ang = cfg.up ? -Math.PI / 2 + (R() - 0.5) * cfg.spread : R() * 6.283;
        var off = (R() - 0.5) * (type === 'fire' ? 0.45 : type === 'handfire' ? 0.3 : 0.3);
        p.x = off; p.y = 0; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
      }
      if (cfg.emoji) p.e = cfg.emoji[Math.floor(R() * cfg.emoji.length)];
      st.ps.push(p);
    }
    var target = lt;
    while (st.lt < target) {
      var h = Math.min(step, target - st.lt);
      if (cfg.burst) { if (!st.burst) { for (var b = 0; b < cfg.burst; b++) spawn(); st.burst = true; } }
      else { st.acc += cfg.rate * (o.amount || 1) * h; while (st.acc >= 1) { spawn(); st.acc -= 1; } }
      for (var i = st.ps.length - 1; i >= 0; i--) {
        var p = st.ps[i]; p.age += h;
        if (p.age > p.life) { st.ps.splice(i, 1); continue; }
        p.vy += cfg.grav * h; p.x += p.vx * h * (p.full ? 1 : 1); p.y += p.vy * h; p.rot += p.vr * h;
        if (cfg.burst) { p.vx *= 0.97; p.vy *= 0.97; }
        if (p.full && type === 'snow') p.x += Math.sin(p.age * 2 + p.hue * 6) * 0.002;
        if (cfg.sway) { p.x += Math.sin(p.age * 9 + p.hue * 20) * 0.25 * h; p.x *= 1 - 1.5 * h; }
      }
      st.lt += h;
    }
    var scale = sz * 1.6;   // Partikel-Raum (1 = Effektgröße)
    c.save();
    if (cfg.add) c.globalCompositeOperation = 'lighter';
    var ga = c.globalAlpha;
    if (type === 'fire' || type === 'handfire') {   // weicher Lichtschein
      var g = c.createRadialGradient(x, y - scale * 0.2, 0, x, y - scale * 0.2, scale * 0.9);
      g.addColorStop(0, 'rgba(255,140,40,' + 0.35 * ga + ')'); g.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = g; c.fillRect(x - scale, y - scale * 1.2, scale * 2, scale * 2);
    }
    for (var j = 0; j < st.ps.length; j++) {
      var q = st.ps[j], k = q.age / q.life, px, py, r;
      if (q.full) { px = q.x * W; py = q.y * H; r = q.size * H; } else { px = x + q.x * scale; py = y + q.y * scale; r = q.size * scale; }
      if (type === 'fire' || type === 'handfire' || (type === 'explosion')) {
        var rr = r * (type === 'explosion' ? (1 - k * 0.5) : (1.15 - k * 0.85)) * 1.7;
        c.globalAlpha = ga * (k < 0.15 ? k / 0.15 : 1) * (1 - k) * 0.3;
        c.drawImage(flameSprite(k), px - rr, py - rr, rr * 2, rr * 2);
        c.globalAlpha = ga;
      } else if (type === 'sparks') {
        c.strokeStyle = 'rgba(255,' + Math.round(220 - k * 120) + ',120,' + (1 - k) * ga + ')'; c.lineWidth = Math.max(1, r * 0.5);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - q.vx * scale * 0.04, py - q.vy * scale * 0.04); c.stroke();
      } else if (type === 'smoke') {
        var sr = r * (0.6 + k * 1.4), sg = c.createRadialGradient(px, py, 0, px, py, sr);
        sg.addColorStop(0, 'rgba(150,150,150,' + 0.28 * Math.sin(k * 3.14) * ga + ')'); sg.addColorStop(1, 'rgba(120,120,120,0)');
        c.fillStyle = sg; c.beginPath(); c.arc(px, py, sr, 0, 6.283); c.fill();
      } else if (type === 'magic') {
        var tw = (0.5 + 0.5 * Math.sin(q.age * 20 + q.hue * 10)) * (1 - k);
        c.fillStyle = 'hsla(' + Math.round(40 + q.hue * 260) + ',100%,75%,' + tw * ga + ')';
        star(c, px, py, r * 1.4, r * 0.35);
      } else if (type === 'confetti') {
        c.save(); c.translate(px, py); c.rotate(q.rot); c.scale(1, Math.cos(q.age * 6 + q.hue * 6));
        c.fillStyle = 'hsl(' + Math.round(q.hue * 360) + ',90%,60%)'; c.fillRect(-r / 2, -r / 4, r, r / 2); c.restore();
      } else if (type === 'snow') {
        c.fillStyle = 'rgba(255,255,255,' + 0.9 * ga + ')'; c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill();
      } else if (type === 'rain') {
        c.strokeStyle = 'rgba(200,220,255,' + 0.55 * ga + ')'; c.lineWidth = Math.max(1, r * 0.6);
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - q.vx * H * 0.03, py - q.vy * H * 0.03); c.stroke();
      } else if (type === 'bubbles') {
        c.strokeStyle = 'rgba(255,255,255,' + 0.7 * (1 - k) * ga + ')'; c.lineWidth = Math.max(1, r * 0.08);
        c.fillStyle = 'hsla(' + Math.round(180 + q.hue * 120) + ',80%,80%,' + 0.15 * ga + ')';
        c.beginPath(); c.arc(px + Math.sin(q.age * 3) * r * 0.3, py, r, 0, 6.283); c.fill(); c.stroke();
      } else if (q.e) {
        c.save(); c.globalAlpha = ga * Math.min(1, (1 - k) * 3); c.translate(px, py); c.rotate(Math.sin(q.age * 2) * 0.3);
        c.font = Math.round(r) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(q.e, 0, 0); c.restore();
      }
    }
    c.restore();
  };
  /* vorberechnete weiche Flammen-Tropfen (schneller als Verläufe pro Teilchen) */
  var FLAME = [];
  function flameSprite(k) {
    var i = Math.min(7, Math.floor(k * 8));
    if (!FLAME[i]) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
      var cols = [[255, 250, 220], [255, 230, 140], [255, 190, 70], [255, 140, 30], [255, 100, 20], [235, 60, 10], [180, 40, 10], [90, 30, 20]][i];
      var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + cols + ',1)'); gr.addColorStop(0.4, 'rgba(' + cols + ',.55)'); gr.addColorStop(1, 'rgba(' + cols + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); FLAME[i] = cv;
    }
    return FLAME[i];
  }
  function star(c, x, y, R, r) {
    c.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
  }
  Renderer.prototype.drawLightning = function (o, x, y, sz, lt) {
    var c = this.ctx, slot = Math.floor(lt * 6), R = rng((o.seed || 3) * 1000 + slot);
    if (R() > 0.55 * (o.amount || 1) + 0.15) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var n = 0; n < 2; n++) {
      var px = x + (R() - 0.5) * sz * 2, py = y - sz * 2.2;
      c.strokeStyle = 'rgba(170,200,255,0.9)'; c.lineWidth = Math.max(2, sz * 0.04); c.shadowColor = '#8ab4ff'; c.shadowBlur = sz * 0.4;
      c.beginPath(); c.moveTo(px, py);
      for (var i = 1; i <= 10; i++) { var f = i / 10; c.lineTo(px + (x - px) * f + (R() - 0.5) * sz * 0.5, py + (y - py) * f); }
      c.stroke();
    }
    var g = c.createRadialGradient(x, y, 0, x, y, sz * 1.5); g.addColorStop(0, 'rgba(160,190,255,0.5)'); g.addColorStop(1, 'rgba(160,190,255,0)');
    c.fillStyle = g; c.fillRect(x - sz * 1.5, y - sz * 1.5, sz * 3, sz * 3);
    c.restore();
  };
  Renderer.prototype.drawAura = function (x, y, sz, lt) {
    var c = this.ctx; c.save(); c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var ph = (lt * 0.8 + i / 3) % 1, r = sz * (0.5 + ph * 1.2);
      c.strokeStyle = 'rgba(80,170,255,' + (1 - ph) * 0.7 + ')'; c.lineWidth = sz * 0.08 * (1 - ph) + 1;
      c.beginPath(); c.arc(x, y, r, 0, 6.283); c.stroke();
    }
    var g = c.createRadialGradient(x, y, 0, x, y, sz); g.addColorStop(0, 'rgba(120,200,255,' + (0.35 + 0.15 * Math.sin(lt * 8)) + ')'); g.addColorStop(1, 'rgba(60,120,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, sz, 0, 6.283); c.fill();
    c.restore();
  };

  global.Renderer = Renderer;
})(this);
