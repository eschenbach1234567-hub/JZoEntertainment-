/* JZo Video AI – Bild-Renderer.
   Pass 1: Clip → Bildausschnitt/Zoom, Effekte, Farb-Nodes (wie DaVinci) → Zwischenbild
   Pass 2: Übergang zwischen zwei Zwischenbildern → WebGL-Leinwand
   Danach werden Sticker, Texte und Partikel (Feuer usw.) in 2D darübergezeichnet. */
(function (global) {
  'use strict';
  var MAXN = 6;
  /* Jeder Bildeffekt bekommt automatisch einen Platz (4 Effekte je vec4 – spart Uniforms fürs iPhone) */
  var SLOT = {}, NFX = 0;
  LIB.FX.forEach(function (f) { if (f.kind === 'shader') SLOT[f.id] = NFX++; });
  var NV4 = Math.ceil(NFX / 4);
  function F(src) { return src.replace(/\$(\w+)/g, function (m, id) { var s = SLOT[id]; if (s == null) throw new Error('Effekt fehlt: ' + id); return 'fx4[' + (s >> 2) + '][' + (s & 3) + ']'; }); }

  var VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }';

  var FS_CLIP = F([
    'precision highp float;',
    'varying vec2 uv;',
    'uniform sampler2D tex; uniform vec4 sizes; uniform vec4 xform; uniform vec4 misc; uniform vec4 fx4[' + NV4 + '];',
    'uniform vec3 nLift[' + MAXN + ']; uniform vec3 nGamma[' + MAXN + ']; uniform vec3 nGain[' + MAXN + ']; uniform vec3 nOff[' + MAXN + '];',
    'uniform vec4 nA[' + MAXN + ']; uniform vec4 nB[' + MAXN + ']; uniform vec4 nC[' + MAXN + '];',
    'const vec3 LW = vec3(0.2126,0.7152,0.0722);',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
    'vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }',
    'vec2 rot(vec2 d, float a){ float c = cos(a), s = sin(a); return vec2(d.x*c - d.y*s, d.x*s + d.y*c); }',
    'vec2 mapUV(vec2 q){',
    '  vec2 outSize = sizes.xy; float oa = outSize.x/outSize.y; float sa = sizes.z/sizes.w;',
    '  vec2 c = vec2((q.x-0.5)*oa, q.y-0.5);',
    '  c -= xform.zw; c = rot(c, -xform.y) / xform.x;',
    '  vec2 sz; bool wide = sa > oa;',
    '  if (misc.x < 0.5) sz = wide ? vec2(oa, oa/sa) : vec2(sa, 1.0); else sz = wide ? vec2(sa, 1.0) : vec2(oa, oa/sa);',
    '  return vec2(c.x/sz.x + 0.5, c.y/sz.y + 0.5);',
    '}',
    'vec3 samp(vec2 q){ vec2 s = mapUV(q); if (s.x<0.0||s.x>1.0||s.y<0.0||s.y>1.0) return vec3(0.0); return texture2D(tex, s).rgb; }',
    'vec3 blur(vec2 q, float r){ vec2 px = r/sizes.xy; vec3 a = vec3(0.0);',
    '  for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) a += samp(q + vec2(float(i),float(j))*px); return a/25.0; }',
    'float lu(vec2 q){ return dot(samp(q), LW); }',
    'void main(){',
    '  vec2 outSize = sizes.xy; float T = misc.y; float asp = outSize.x/outSize.y;',
    '  vec2 q = uv;',
    /* ---- Verzerren / Spiegeln (Bildkoordinaten) ---- */
    '  if ($flip > 0.5) q.x = 1.0 - q.x;',
    '  if ($mirror > 0.0) q.x = q.x > 0.5 ? 1.0 - q.x : q.x;',
    '  if ($mirrorv > 0.0) q.y = q.y < 0.5 ? 1.0 - q.y : q.y;',
    '  if ($grid > 0.0) q = mix(q, fract(q*2.0), $grid);',
    '  if ($kaleido > 0.0) { vec2 d = abs(q-0.5); q = mix(q, 0.5 + vec2(max(d.x,d.y*0.6), min(d.x,d.y)), $kaleido); }',
    '  if ($fisheye > 0.0) { vec2 d = q-0.5; float r = length(d); q = 0.5 + d*(1.0 - $fisheye*0.6*(0.5 - r*r)); }',
    '  if ($pinch > 0.0) { vec2 d = q-0.5; float r = length(d); q = 0.5 + d*(1.0 + $pinch*0.9*(0.5 - r)); }',
    '  if ($swirl > 0.0) { vec2 d = (q-0.5)*vec2(asp,1.0); float r = length(d); d = rot(d, $swirl*4.0*max(0.0, 0.6-r)*(1.0+0.3*sin(T))); q = d/vec2(asp,1.0)+0.5; }',
    '  if ($ripple > 0.0) { vec2 d = q-0.5; float r = length(d); q += d/(r+0.0001)*sin(r*45.0 - T*6.0)*0.007*$ripple; }',
    '  if ($wave > 0.0) { q.x += sin(q.y*12.0 + T*3.0)*0.015*$wave; q.y += sin(q.x*10.0 + T*2.0)*0.01*$wave; }',
    '  if ($heat > 0.0) q += vec2(sin(q.y*90.0 + T*14.0), cos(q.x*70.0 + T*11.0))*0.0025*$heat;',
    '  vec2 crtQ = q;',
    '  if ($crt > 0.0) { vec2 d = q-0.5; q = 0.5 + d*(1.0 + $crt*0.35*dot(d,d)); crtQ = q; }',
    '  if ($pixelate > 0.0) { float n = mix(220.0, 18.0, $pixelate); vec2 g = vec2(n*asp, n); q = (floor(q*g)+0.5)/g; }',
    '  if ($dither > 0.0) { float n = mix(400.0, 120.0, $dither); vec2 g = vec2(n*asp, n); q = (floor(q*g)+0.5)/g; }',
    '  if ($interlace > 0.0) q.x += mod(floor(uv.y*outSize.y*0.5), 2.0)*0.004*$interlace*sin(T*30.0);',
    '  if ($vhs > 0.0) q.x += sin(q.y*30.0 + T*8.0)*0.002*$vhs + (rnd(vec2(floor(q.y*120.0), floor(T*20.0)))-0.5)*0.006*$vhs;',
    '  if ($glitch > 0.0) { float bt = floor(T*12.0); float row = floor(q.y*14.0);',
    '    if (rnd(vec2(row, bt)) < $glitch*0.45) q.x += (rnd(vec2(bt,row+3.0))-0.5)*0.25*$glitch; }',
    '  if ($datamosh > 0.0) { vec2 b = floor(q*vec2(16.0,9.0)); if (rnd(b + floor(T*6.0)) < $datamosh*0.3) q += (vec2(rnd(b+1.0+floor(T*6.0)), rnd(b+2.0))-0.5)*0.1; }',
    '  if ($signal > 0.0) { float band = rnd(vec2(floor(uv.y*24.0), floor(T*9.0))); if (band < $signal*0.25) q.x += (band-0.1)*0.6; }',
    /* ---- Abtasten (mit Unschärfe-, Prisma- und Farbversatz-Effekten) ---- */
    '  vec3 col;',
    '  float sh = $rgbsplit*0.012 + $glitch*0.008*step(0.7, rnd(vec2(floor(T*10.0),1.0))) + $vhs*0.004;',
    '  if ($chroma > 0.0) { vec2 d = (q-0.5)*$chroma*0.04; col = vec3(samp(q+d).r, samp(q).g, samp(q-d).b); }',
    '  else if (sh > 0.0) col = vec3(samp(q+vec2(sh,0.0)).r, samp(q).g, samp(q-vec2(sh,0.0)).b);',
    '  else col = samp(q);',
    '  if ($prism > 0.0) { vec2 o = vec2(0.03,0.015)*$prism; col = mix(col, samp(q+o)*vec3(1.0,0.35,0.35) + col*vec3(0.35,1.0,0.35) + samp(q-o)*vec3(0.35,0.35,1.0), 0.75); }',
    '  if ($blur > 0.0) col = blur(q, $blur*4.0);',
    '  if ($tiltshift > 0.0) { float r = smoothstep(0.08, 0.42, abs(q.y-0.5))*$tiltshift*5.0; if (r > 0.2) col = blur(q, r); }',
    '  if ($vignetteblur > 0.0) { float r = smoothstep(0.2, 0.75, length((q-0.5)*vec2(asp,1.0)))*$vignetteblur*6.0; if (r > 0.2) col = blur(q, r); }',
    '  if ($zoomblur > 0.0) { vec3 a = vec3(0.0); for (int i=0;i<12;i++) a += samp(0.5 + (q-0.5)*(1.0 - float(i)*0.012*$zoomblur)); col = a/12.0; }',
    '  if ($motionblur > 0.0) { vec3 a = vec3(0.0); for (int i=0;i<12;i++) a += samp(q + vec2((float(i)/11.0-0.5)*0.06*$motionblur, 0.0)); col = a/12.0; }',
    '  if ($spinblur > 0.0) { vec3 a = vec3(0.0); vec2 d = (q-0.5)*vec2(asp,1.0); for (int i=0;i<12;i++) a += samp(rot(d, (float(i)/11.0-0.5)*0.12*$spinblur)/vec2(asp,1.0)+0.5); col = a/12.0; }',
    '  if ($glow > 0.0) { vec3 b = blur(q, 3.0 + $glow*6.0); col += max(b - 0.5, 0.0)*2.2*$glow; }',
    '  if ($sharpen > 0.0) col += (col - blur(q, 1.2))*$sharpen*1.6;',
    '  if ($edge + $sketch + $neonedge + $emboss > 0.0) {',
    '    vec2 px = 1.5/outSize; float gx = lu(q+vec2(px.x,0.0)) - lu(q-vec2(px.x,0.0)); float gy = lu(q+vec2(0.0,px.y)) - lu(q-vec2(0.0,px.y));',
    '    float e = clamp(length(vec2(gx,gy))*3.0, 0.0, 1.0);',
    '    if ($edge > 0.0) col = mix(col, floor(col*4.0+0.5)/4.0*(1.0 - smoothstep(0.25, 0.5, e)), $edge);',
    '    if ($sketch > 0.0) col = mix(col, vec3(1.0 - smoothstep(0.04, 0.35, e))*vec3(1.0,0.98,0.93), $sketch);',
    '    if ($neonedge > 0.0) col = mix(col, e*2.0*(0.5+0.5*cos(6.2832*(uv.x*0.7 + T*0.2) + vec3(0.0,2.0,4.0))), $neonedge);',
    '    if ($emboss > 0.0) col = mix(col, vec3(0.5 + (gx + gy)*2.5), $emboss);',
    '  }',
    /* ---- Farb-Nodes, nacheinander wie in DaVinci (seriell) ---- */
    '  for (int i=0;i<' + MAXN + ';i++) {',
    '    if (nC[i].w < 0.5) continue;',
    '    col *= exp2(nB[i].z);',
    '    col *= vec3(1.0 + nB[i].x*0.25, 1.0 + nB[i].y*-0.15, 1.0 - nB[i].x*0.25) * vec3(1.0 + nB[i].y*0.08, 1.0, 1.0 + nB[i].y*0.08);',
    '    col = col*nGain[i] + nLift[i]*(1.0-col);',
    '    col = pow(max(col, 0.0), 1.0/max(nGamma[i], vec3(0.05)));',
    '    col += nOff[i];',
    '    float L = dot(col, LW);',
    '    col += nC[i].x*0.35*smoothstep(0.4,1.0,L) + nC[i].y*0.35*(1.0-smoothstep(0.0,0.6,L));',
    '    col = (col - nA[i].y)*nA[i].x + nA[i].y;',
    '    L = dot(col, LW);',
    '    col = mix(vec3(L), col, nA[i].z);',
    '    if (nA[i].w != 0.0) col = hueRot(col, nA[i].w);',
    '  }',
    /* ---- Farbeffekte ---- */
    '  float lum = dot(clamp(col,0.0,1.0), LW);',
    '  if ($bw > 0.0) col = mix(col, vec3(lum), $bw);',
    '  if ($sepia > 0.0) col = mix(col, vec3(lum*1.07, lum*0.74, lum*0.43)*1.1, $sepia);',
    '  if ($duotone > 0.0) col = mix(col, mix(vec3(0.04,0.12,0.35), vec3(1.0,0.6,0.2), smoothstep(0.05,0.95,lum)), $duotone);',
    '  if ($colorkeep > 0.0) { float k = smoothstep(0.08, 0.25, col.r - max(col.g, col.b)); col = mix(col, mix(vec3(lum), col*vec3(1.15,0.9,0.9), k), $colorkeep); }',
    '  if ($thermal > 0.0) { vec3 th = lum < 0.5 ? mix(vec3(0.0,0.0,0.6), vec3(0.0,0.9,0.2), lum*2.0) : mix(vec3(1.0,1.0,0.0), vec3(1.0,0.1,0.0), lum*2.0-1.0); col = mix(col, th, $thermal); }',
    '  if ($nightvision > 0.0) { vec3 nv = vec3(0.1,1.0,0.25)*(lum*1.6 + 0.05) + (rnd(uv*outSize + fract(T)*50.0)-0.5)*0.15; nv *= 1.0 - smoothstep(0.35, 0.75, length((uv-0.5)*vec2(asp,1.0))); col = mix(col, nv, $nightvision); }',
    '  if ($infrared > 0.0) col = mix(col, vec3(col.g*1.15 + 0.08, col.r*0.75, col.b*0.95 + 0.05), $infrared);',
    '  if ($crossproc > 0.0) col = mix(col, vec3(smoothstep(0.0,1.0,col.r)*1.08, col.g*1.12 - 0.03, col.b*0.7 + 0.14), $crossproc);',
    '  if ($posterize > 0.0) { float lv = mix(12.0, 3.0, $posterize); col = floor(col*lv+0.5)/lv; }',
    '  if ($dither > 0.0) { float b = rnd(floor(uv*outSize/3.0)); col = mix(col, floor(col*4.0 + b*0.9)/4.0, $dither); }',
    '  if ($halftone > 0.0) { float cs = 7.0; vec2 g = uv*outSize/cs; vec2 f = fract(g)-0.5; float rr = sqrt(clamp(1.0-lum,0.0,1.0))*0.62;',
    '    float dotv = smoothstep(rr-0.06, rr+0.06, length(f)); col = mix(col, mix(col*0.35, vec3(1.0,0.98,0.92), dotv), $halftone); }',
    '  if ($huecycle > 0.0) col = hueRot(col, T*3.0*$huecycle);',
    '  if ($invert > 0.0) col = mix(col, 1.0-col, $invert);',
    /* ---- Licht ---- */
    '  if ($lightleak > 0.0) { vec2 c = vec2(0.85 + sin(T*0.7)*0.2, 0.8 + cos(T*0.5)*0.2); float d = 1.0 - smoothstep(0.0, 0.9, distance(uv, c)); col += vec3(1.0,0.45,0.15)*d*d*$lightleak*0.8; }',
    '  if ($lensflare > 0.0) { vec2 lp = vec2(0.15 + 0.7*fract(T*0.06), 0.78); vec2 dd = (uv-lp)*vec2(asp,1.0); float d = length(dd);',
    '    vec3 fl = vec3(1.0,0.85,0.6)*(0.02/(d+0.02))*0.6 + vec3(1.0,0.6,0.3)*exp(-abs(dd.y)*90.0)*0.35*(1.0-min(1.0,abs(dd.x)));',
    '    vec2 gp = 1.0 - lp; float g1 = length((uv-mix(lp,gp,0.6))*vec2(asp,1.0)); fl += vec3(0.4,0.7,1.0)*smoothstep(0.06,0.04,g1)*0.25 + vec3(0.6,1.0,0.5)*smoothstep(0.03,0.02,length((uv-gp)*vec2(asp,1.0)))*0.3;',
    '    col += fl*$lensflare; }',
    '  if ($lightrays > 0.0) { vec2 sp = vec2(0.2, 1.15); vec2 d = uv - sp; float a = atan(d.y, d.x); float rays = pow(0.5+0.5*sin(a*38.0 + sin(a*11.0 + T*0.8)*2.0), 6.0);',
    '    col += vec3(1.0,0.92,0.75)*rays*$lightrays*0.4*max(0.0, 1.0 - length(d)*0.8); }',
    /* ---- Film & Glitch-Überlagerungen ---- */
    '  if ($grain > 0.0) col += (rnd(uv*outSize + fract(T)*100.0)-0.5)*0.25*$grain;',
    '  if ($filmdamage > 0.0) { float fr = floor(T*24.0); float xr = rnd(vec2(fr, 1.3)); col -= step(abs(uv.x - xr), 0.0012)*step(0.45, rnd(vec2(fr,2.7)))*0.5*$filmdamage;',
    '    vec2 cell = floor(uv*vec2(60.0,34.0)); col -= step(0.996, rnd(cell + fr))*0.6*$filmdamage; col *= 1.0 - $filmdamage*0.12*rnd(vec2(fr, 4.1)); }',
    '  if ($flicker > 0.0) col *= 1.0 + (rnd(vec2(floor(T*18.0), 9.0))-0.5)*0.45*$flicker;',
    '  if ($tvstatic > 0.0) col = mix(col, vec3(rnd(uv*outSize + fract(T*7.0)*91.0)), $tvstatic*0.7);',
    '  if ($signal > 0.0 && rnd(vec2(floor(uv.y*24.0), floor(T*9.0))) < $signal*0.12) col = vec3(rnd(uv*outSize + T))*0.7;',
    '  if ($vhs > 0.0) { col += (rnd(vec2(uv.y*outSize.y, floor(T*30.0)))-0.5)*0.08*$vhs; col.b *= 1.0 - 0.1*$vhs; }',
    '  if ($scanlines > 0.0) col *= 1.0 - $scanlines*0.35*(0.5+0.5*sin(uv.y*outSize.y*1.6));',
    '  if ($interlace > 0.0) col *= 1.0 - 0.25*$interlace*mod(floor(uv.y*outSize.y*0.5), 2.0);',
    '  if ($strobe > 0.0) col += vec3(step(1.0 - $strobe*0.35, rnd(vec2(floor(T*8.0), 7.0))))*0.8;',
    '  if ($vignette > 0.0) { vec2 d = uv-0.5; col *= 1.0 - $vignette*smoothstep(0.25, 0.85, length(d*vec2(asp,1.0)*0.9)); }',
    '  if ($crt > 0.0) { col *= 1.0 - $crt*0.3*(0.5+0.5*sin(uv.y*outSize.y*2.0)); col *= 1.0 - $crt*smoothstep(0.3, 0.75, length((uv-0.5)*vec2(asp,1.0)*0.8));',
    '    if (crtQ.x < 0.0 || crtQ.x > 1.0 || crtQ.y < 0.0 || crtQ.y > 1.0) col = vec3(0.0); }',
    '  if ($cinebars > 0.0) { float bar = asp > 1.0 ? (1.0 - asp/2.39)*0.5 : 0.1; if (uv.y < bar*$cinebars || uv.y > 1.0-bar*$cinebars) col = vec3(0.0); }',
    '  gl_FragColor = vec4(clamp(col,0.0,1.0)*misc.z, 1.0);',
    '}'
  ].join('\n'));

  var FS_MIX = [
    'precision highp float;',
    'varying vec2 uv; uniform sampler2D A; uniform sampler2D B; uniform float p; uniform int type; uniform float t; uniform vec2 outSize; uniform float fade;',
    'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
    'vec4 a(vec2 q){ return texture2D(A, clamp(q,0.0,1.0)); } vec4 b(vec2 q){ return texture2D(B, clamp(q,0.0,1.0)); }',
    'vec2 rot(vec2 d, float an){ float c = cos(an), s = sin(an); return vec2(d.x*c - d.y*s, d.x*s + d.y*c); }',
    'vec4 blurA(vec2 q, float r){ vec4 s=vec4(0.0); for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++) s+=a(q+vec2(float(i),float(j))*r/outSize); return s/49.0; }',
    'vec4 blurB(vec2 q, float r){ vec4 s=vec4(0.0); for(int i=-3;i<=3;i++) for(int j=-3;j<=3;j++) s+=b(q+vec2(float(i),float(j))*r/outSize); return s/49.0; }',
    'void main(){',
    '  vec4 c; float e = p*p*(3.0-2.0*p); float asp = outSize.x/outSize.y; float k = sin(p*3.14159);',
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
    '  else if (type == 11) { float row = floor(uv.y*20.0); float off = (rnd(vec2(row, floor(t*25.0)))-0.5)*0.3*k; vec2 q = uv+vec2(off,0.0);',
    '    vec4 x = p < 0.5 ? a(q) : b(q); vec4 y = p < 0.5 ? a(q+vec2(0.02*k,0.0)) : b(q+vec2(0.02*k,0.0)); c = vec4(y.r, x.g, x.b, 1.0); }',
    '  else if (type == 12) { float r = length((uv-0.5)*vec2(asp,1.0)); c = r < e*0.6*sqrt(asp*asp+1.0) ? b(uv) : a(uv); }',
    '  else if (type == 13) { vec2 d = (uv-0.5)*vec2(asp,1.0); float ang = (p<0.5?p:1.0-p)*6.2832; float s = 1.0 + k*1.5;',
    '    d = rot(d, ang)*s; vec2 q = d/vec2(asp,1.0)+0.5; c = p<0.5 ? a(q) : b(q); }',
    '  else if (type == 14) { float f = 1.0 - abs(p*2.0-1.0); c = mix(p<0.5?a(uv):b(uv), vec4(1.0), f*f); }',
    '  else if (type == 15) { float n = mix(400.0, 12.0, k); vec2 g = vec2(n*asp, n); vec2 q = (floor(uv*g)+0.5)/g; c = p<0.5?a(q):b(q); }',
    '  else if (type == 16) { c = mix(blurA(uv,k*6.0), blurB(uv,k*6.0), e); }',
    '  else if (type == 17) { float l = dot(b(uv).rgb, vec3(0.33)); float m = smoothstep(l-0.1, l+0.1, e*1.2-0.1); vec4 burn = vec4(1.0,0.5,0.1,1.0)*(1.0-abs(m-0.5)*2.0)*k; c = mix(a(uv), b(uv), m) + burn; }',
    '  else if (type == 18) c = (uv.x+uv.y)*0.5 < e*1.1-0.05 ? b(uv) : a(uv);',
    '  else if (type == 19) { vec4 s = vec4(0.0); for (int i=0;i<9;i++) { float o = (float(i)/8.0-0.5)*0.12*k;',
    '      s += uv.x < 1.0-e ? a(uv+vec2(e+o,0.0)) : b(uv-vec2(1.0-e-o,0.0)); } c = s/9.0; }',
    '  else if (type == 20) { vec2 d = abs(uv-0.5)*2.0; c = max(d.x,d.y) < e ? b(uv) : a(uv); }',
    '  else if (type == 21) { float an = atan(uv.x-0.5, uv.y-0.5)/6.2832 + 0.5; c = an < e ? b(uv) : a(uv); }',
    '  else if (type == 22) c = abs(uv.x-0.5) < e*0.5 ? b(uv) : a(uv);',
    '  else if (type == 23) c = abs(uv.y-0.5) < e*0.5 ? b(uv) : a(uv);',
    '  else if (type == 24) { vec2 h = (uv-vec2(0.5,0.47))*vec2(asp,1.0)*2.2/(e*3.2+0.001); float x2 = h.x*h.x;',
    '    float f = pow(x2 + h.y*h.y - 1.0, 3.0) - x2*h.y*h.y*h.y; c = f < 0.0 ? b(uv) : a(uv); }',
    '  else if (type == 25) { vec2 d = uv-0.5; float r = length(d); vec2 off = d/(r+0.001)*sin(r*50.0 - p*30.0)*0.025*k; c = mix(a(uv+off), b(uv+off), e); }',
    '  else if (type == 26) { vec2 d = (uv-0.5)*vec2(asp,1.0); float r = length(d); d = rot(d, k*7.0*max(0.0, 0.7-r)); vec2 q = d/vec2(asp,1.0)+0.5; c = mix(a(q), b(q), e); }',
    '  else if (type == 27) c = uv.y < e ? b(uv+vec2(0.0,1.0-e)) : a(uv-vec2(0.0,e));',
    '  else if (type == 28) c = uv.y > 1.0-e ? b(uv-vec2(0.0,1.0-e)) : a(uv+vec2(0.0,e));',
    '  else if (type == 29) c = rnd(floor(uv*vec2(16.0,9.0))) < e ? b(uv) : a(uv);',
    '  else if (type == 30) c = fract(uv.y*10.0) < e ? b(uv) : a(uv);',
    '  else if (type == 31) { vec2 g = floor(uv*vec2(8.0,4.5)); float o = mod(g.x+g.y, 2.0); float th = o < 0.5 ? clamp(e*2.0,0.0,1.0) : clamp(e*2.0-1.0,0.0,1.0); c = fract(uv.y*4.5) < th ? b(uv) : a(uv); }',
    '  else if (type == 32) { vec2 off = vec2(dot(a(uv).rgb, vec3(0.33)) - 0.5)*0.08*k; c = mix(a(uv + off*e), b(uv - off*(1.0-e)), e); }',
    '  else if (type == 33) c = p < 0.5 ? a(uv) + b(uv)*p*2.0 : a(uv)*(2.0-p*2.0) + b(uv);',
    '  else if (type == 34) { vec4 s = vec4(0.0); for (int i=0;i<10;i++) { vec2 q = 0.5 + (uv-0.5)*(1.0 - float(i)*0.025*k); s += mix(a(q), b(q), e); } c = s/10.0; }',
    '  else if (type == 35) { c = mix(a(uv), b(uv), e) + vec4(1.0,0.55,0.2,1.0)*k*1.2*smoothstep(0.0, 1.0, 1.0 - distance(uv, vec2(e*1.4-0.2, 0.7))); }',
    '  else if (type == 36) { float m = smoothstep(e*1.3-0.3, e*1.3, uv.x); c = mix(b(uv), a(uv), m); }',
    '  else if (type == 37) c = abs(uv.x-0.5)*asp + abs(uv.y-0.5) < e*(asp*0.5+0.5) ? b(uv) : a(uv);',
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
        case 'zoomSnap': var zs = 1 - Math.min(1, lt / 0.15); s *= 1 + 0.35 * a * (1 - zs * zs * zs); break;
        case 'heartbeat': var hb = lt % 1; s *= 1 + 0.08 * a * (Math.exp(-hb * 18) + 0.7 * Math.exp(-Math.max(0, hb - 0.22) * 18) * (hb > 0.22 ? 1 : 0)); break;
        case 'panLeft': s *= 1 + 0.25 * a; tx += (0.5 - e) * 0.2 * a; break;
        case 'panRight': s *= 1 + 0.25 * a; tx += (e - 0.5) * 0.2 * a; break;
        case 'drift': s *= 1 + 0.08 * a; tx += Math.sin(lt * 0.6) * 0.025 * a; ty += Math.sin(lt * 0.45 + 1) * 0.018 * a; r += Math.sin(lt * 0.35) * 0.01 * a; break;
        case 'tilt': r += 0.12 * a; s *= 1 + 0.12 * a; break;
        case 'spinSlow': r += lt * 0.35 * a; s *= 1 + 0.35 * a; break;
        case 'slideInTop': var si = Math.max(0, 1 - lt / 0.45); ty += si * si * 1.0 * a; break;
        case 'slideInLeft': var sl = Math.max(0, 1 - lt / 0.45); tx -= sl * sl * 1.8 * a; break;
        case 'slideOutRight': var so = Math.max(0, 1 - (dur - lt) / 0.45); tx += so * so * 1.8 * a; break;
        case 'zoomOutEnd': var zo = Math.max(0, 1 - (dur - lt) / 0.6); s *= 1 - zo * zo * 0.95 * a; r += zo * zo * 1.5 * a; break;
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
    gl.uniform4f(u.sizes, W, H, (layer && layer.w) || W, (layer && layer.h) || H);
    var clip = layer && layer.clip, fxv = new Float32Array(NV4 * 4), m = { s: 1, r: 0, tx: 0, ty: 0 };
    if (clip && clip.disabled) has = 0;
    gl.uniform4f(u.misc, clip && clip.fit === 'fill' ? 1 : 0, layer ? layer.lt : 0, has, 0);
    if (clip) {
      (clip.effects || []).forEach(function (f) { var s = SLOT[f.fx]; if (s != null) fxv[s] = Math.max(fxv[s], f.amount); });
      m = motion(clip.effects, layer.lt, layer.dur);
      var tr = clip.transform || { s: 1, x: 0, y: 0, r: 0 };
      m.s *= tr.s; m.tx += tr.x; m.ty += tr.y; m.r += tr.r * Math.PI / 180;
    }
    gl.uniform4f(u.xform, m.s, m.r, m.tx, m.ty);
    gl.uniform4fv(u.fx4, fxv);
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
    if (anim === 'zoom') { var zk = Math.min(1, lt / 0.45), zs = 1 + (1 - zk * (2 - zk)) * 2.5; c.globalAlpha *= zk; c.translate(x, y); c.scale(zs, zs); c.translate(-x, -y); }
    if (anim === 'bounce') { y -= Math.abs(Math.sin(lt * 4)) * sz * 0.15; }
    if (anim === 'glitch' && Math.sin(lt * 37) > 0.6) { x += (Math.sin(lt * 91) * 0.06) * sz; }
    if (st === 'trailer') txt = txt.toUpperCase();
    var family = st === 'script' ? '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive' : st === 'trailer' ? '"Didot", "Times New Roman", Georgia, serif' : '-apple-system, "Helvetica Neue", Arial, sans-serif';
    c.font = (st === 'impact' ? '900 ' : st === 'subtitle' ? '600 ' : st === 'script' ? '400 ' : st === 'trailer' ? '500 ' : '800 ') + Math.round(fs * (st === 'script' ? 1.25 : 1)) + 'px ' + family;
    if (st === 'trailer' && 'letterSpacing' in c) c.letterSpacing = Math.round(fs * 0.25) + 'px';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var lines = txt.split('\n'), lh = fs * 1.2, y0 = y - (lines.length - 1) * lh / 2;
    var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, c.measureText(l).width); });
    if (st === 'box') { c.fillStyle = '#fff'; c.fillRect(x - wmax / 2 - fs * 0.45, y0 - lh / 2 - fs * 0.15, wmax + fs * 0.9, lh * lines.length + fs * 0.3); }
    if (st === 'subtitle') { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - wmax / 2 - fs * 0.4, y0 - lh / 2 - fs * 0.15, wmax + fs * 0.8, lh * lines.length + fs * 0.3); }
    if (st === 'lower') {
      c.textAlign = 'left'; var bx = x - wmax / 2;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx - fs * 0.6, y0 - lh / 2 - fs * 0.2, wmax + fs * 1.2, lh * lines.length + fs * 0.4);
      c.fillStyle = '#ff6a1a'; c.fillRect(bx - fs * 0.6, y0 - lh / 2 - fs * 0.2, fs * 0.18, lh * lines.length + fs * 0.4);
      x = bx;
    }
    var grad = null;
    if (st === 'gradient') { grad = c.createLinearGradient(0, y0 - lh / 2, 0, y0 + lh * (lines.length - 0.5)); grad.addColorStop(0, '#ffd27a'); grad.addColorStop(0.5, '#ff9a3d'); grad.addColorStop(1, '#ff5a1a'); }
    lines.forEach(function (l, i) {
      var ly = y0 + i * lh;
      if (anim === 'wave') {   // Buchstaben einzeln auf und ab
        var tw = c.measureText(l).width, cx0 = c.textAlign === 'left' ? x : x - tw / 2, save = c.textAlign; c.textAlign = 'left';
        for (var ci = 0; ci < l.length; ci++) {
          var ch = l.charAt(ci), cw = c.measureText(ch).width, wy = ly + Math.sin(lt * 6 - ci * 0.5) * fs * 0.15;
          if (st === 'outline' || st === 'impact') { c.lineJoin = 'round'; c.lineWidth = fs * 0.16; c.strokeStyle = '#000'; c.strokeText(ch, cx0, wy); }
          c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = fs * 0.15;
          c.fillStyle = grad || (st === 'impact' ? '#ffd400' : st === 'box' ? '#111' : col); c.fillText(ch, cx0, wy); cx0 += cw;
        }
        c.shadowBlur = 0; c.textAlign = save; return;
      }
      if (st === 'shadow3d') { for (var d3 = 6; d3 >= 1; d3--) { c.fillStyle = 'rgba(0,0,0,' + (0.5 - d3 * 0.05) + ')'; c.fillText(l, x + d3 * fs * 0.025, ly + d3 * fs * 0.025); } c.fillStyle = '#ff6a1a'; c.fillText(l, x + fs * 0.03, ly + fs * 0.03); }
      if (st === 'glitchtext') { var go = (Math.sin(lt * 40) > 0.3 ? 1 : 0.4) * fs * 0.06; c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,0,60,0.8)'; c.fillText(l, x - go, ly); c.fillStyle = 'rgba(0,220,255,0.8)'; c.fillText(l, x + go, ly); c.globalCompositeOperation = 'source-over'; }
      if (st === 'trailer') { c.shadowColor = 'rgba(255,190,120,0.6)'; c.shadowBlur = fs * 0.4; }
      if (st === 'gradient') { c.lineJoin = 'round'; c.lineWidth = fs * 0.1; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(l, x, ly); }
      if (st === 'outline' || st === 'impact') { c.lineJoin = 'round'; c.lineWidth = fs * 0.16; c.strokeStyle = '#000'; c.strokeText(l, x, ly); }
      if (st === 'neon') { c.shadowColor = col; c.shadowBlur = fs * 0.6; }
      else if (st === 'clean') { c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = fs * 0.2; c.shadowOffsetY = fs * 0.05; }
      c.fillStyle = grad || (st === 'impact' ? '#ffd400' : st === 'box' ? '#111' : col);
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
    emojirain: { full: true, rate: 8, life: [3, 5], sp: [0.2, 0.4], size: [0.1, 0.16], grav: 0.05, emoji: ['😂', '🤣', '😆'] },
    embers: { rate: 35, life: [1.2, 2.6], sp: [0.25, 0.6], spread: 1.0, size: [0.012, 0.03], up: 1, grav: -0.15, add: true, sway: 1 },
    fireworks: { periodic: 0.9, burstN: 70, life: [0.9, 1.6], sp: [0.5, 1.3], size: [0.012, 0.022], grav: 0.45, add: true },
    likes: { rate: 5, life: [1.5, 2.6], sp: [0.35, 0.65], spread: 0.6, size: [0.22, 0.38], up: 1, grav: -0.1, emoji: ['👍', '❤️', '🔥', '😍'] },
    notes: { rate: 4, life: [1.8, 3], sp: [0.25, 0.5], spread: 0.9, size: [0.2, 0.32], up: 1, grav: -0.05, emoji: ['🎵', '🎶'], sway: 1 },
    butterflies: { rate: 2, life: [3, 4.5], sp: [0.2, 0.4], spread: 1.6, size: [0.22, 0.32], up: 1, grav: 0, emoji: ['🦋'], sway: 1 },
    balloons: { rate: 2, life: [3, 4.5], sp: [0.3, 0.5], spread: 0.5, size: [0.35, 0.5], up: 1, grav: -0.05, emoji: ['🎈'] },
    leaves: { full: true, rate: 4, life: [4, 6], sp: [0.15, 0.3], size: [0.06, 0.1], grav: 0.02, emoji: ['🍂', '🍁'] },
    petals: { full: true, rate: 7, life: [4, 6], sp: [0.12, 0.25], size: [0.035, 0.06], grav: 0.02, emoji: ['🌸', '💮'] },
    goldrain: { full: true, rate: 45, life: [2.5, 4], sp: [0.3, 0.55], size: [0.006, 0.014], grav: 0.05, add: true },
    fog: { area: true, rate: 2.5, life: [6, 10], sp: [0.02, 0.05], size: [0.35, 0.7], grav: 0 },
    dust: { area: true, rate: 25, life: [2, 4], sp: [0.01, 0.03], size: [0.002, 0.005], grav: -0.005, add: true },
    twinkle: { area: true, rate: 30, life: [1, 2.5], sp: [0, 0], size: [0.006, 0.014], grav: 0, add: true },
    bokeh: { area: true, rate: 5, life: [2.5, 4.5], sp: [0.01, 0.04], size: [0.03, 0.08], grav: -0.01, add: true }
  };
  Renderer.prototype.drawParticles = function (o, x, y, sz, lt, dt) {
    var c = this.ctx, W = this.display.width, H = this.display.height, type = o.type;
    if (type === 'lightning') return this.drawLightning(o, x, y, sz, lt);
    if (type === 'aura') return this.drawAura(x, y, sz, lt);
    if (type === 'matrix') return this.drawMatrix(o, lt);
    var cfg = EMIT[type]; if (!cfg) return;
    var st = this.particles[o.id];
    var step = 1 / 60;
    if (!st || lt < st.lt - 0.001 || lt - st.lt > 0.5) {   // gesprungen → neu aufbauen (und vorwärmen)
      st = this.particles[o.id] = { ps: [], lt: cfg.full || cfg.area ? lt - 6 : Math.max(0, lt - (cfg.burst ? lt : 1.2)), acc: 0, rnd: rng(o.seed || 7), burst: false };
    }
    var R = st.rnd;
    function spawn() {
      var life = cfg.life[0] + R() * (cfg.life[1] - cfg.life[0]);
      var sp = cfg.sp[0] + R() * (cfg.sp[1] - cfg.sp[0]);
      var p = { age: 0, life: life, size: cfg.size[0] + R() * (cfg.size[1] - cfg.size[0]), rot: R() * 6.28, vr: (R() - 0.5) * 6, hue: R() };
      if (cfg.area) { p.x = R(); p.y = R(); var an = R() * 6.283; p.vx = Math.cos(an) * sp; p.vy = Math.sin(an) * sp * 0.4; p.full = true; }
      else if (cfg.full) { p.x = R() * 1.2 - 0.1; p.y = -0.05; p.vx = (R() - 0.5) * 0.1 + (type === 'rain' ? 0.15 : 0); p.vy = sp; p.full = true; }
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
      else if (cfg.periodic) {
        st.acc += h;
        if (st.acc >= cfg.periodic / (o.amount || 1) || !st.burst) {
          st.acc = 0; st.burst = true;
          var cx = (R() - 0.5) * 1.6, cy = -0.4 - R() * 0.7, hue = R();
          for (var fb = 0; fb < cfg.burstN; fb++) {
            var fa = R() * 6.283, fs = cfg.sp[0] + R() * (cfg.sp[1] - cfg.sp[0]);
            st.ps.push({ age: 0, life: cfg.life[0] + R() * (cfg.life[1] - cfg.life[0]), size: cfg.size[0] + R() * (cfg.size[1] - cfg.size[0]), x: cx, y: cy, vx: Math.cos(fa) * fs, vy: Math.sin(fa) * fs, hue: hue + (R() - 0.5) * 0.08, rot: 0, vr: 0 });
          }
        }
      }
      else { st.acc += cfg.rate * (o.amount || 1) * h; while (st.acc >= 1) { spawn(); st.acc -= 1; } }
      for (var i = st.ps.length - 1; i >= 0; i--) {
        var p = st.ps[i]; p.age += h;
        if (p.age > p.life) { st.ps.splice(i, 1); continue; }
        p.vy += cfg.grav * h; p.x += p.vx * h * (p.full ? 1 : 1); p.y += p.vy * h; p.rot += p.vr * h;
        if (cfg.burst || cfg.periodic) { p.vx *= 0.97; p.vy *= 0.97; }
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
      } else if (type === 'embers') {
        c.globalAlpha = ga * (1 - k) * (0.6 + 0.4 * Math.sin(q.age * 15 + q.hue * 9));
        c.drawImage(flameSprite(0.3 + k * 0.5), px - r * 2, py - r * 2, r * 4, r * 4); c.globalAlpha = ga;
      } else if (type === 'fireworks') {
        c.fillStyle = 'hsla(' + Math.round(((q.hue % 1) + 1) % 1 * 360) + ',100%,' + Math.round(65 + (1 - k) * 25) + '%,' + (1 - k) * ga + ')';
        c.beginPath(); c.arc(px, py, Math.max(1, r * (1 - k * 0.5)), 0, 6.283); c.fill();
      } else if (type === 'goldrain' || type === 'twinkle' || type === 'dust') {
        var tk = type === 'dust' ? 0.6 : (0.5 + 0.5 * Math.sin(q.age * 9 + q.hue * 20));
        c.fillStyle = (type === 'goldrain' ? 'rgba(255,205,90,' : 'rgba(255,250,235,') + tk * Math.sin(k * 3.14) * ga + ')';
        if (type === 'dust') { c.beginPath(); c.arc(px, py, Math.max(1, r), 0, 6.283); c.fill(); } else star(c, px, py, r * 1.6, r * 0.4);
      } else if (type === 'bokeh') {
        var bc = ['255,200,120', '255,150,200', '150,200,255', '255,240,180'][Math.floor(q.hue * 4)];
        var bg = c.createRadialGradient(px, py, r * 0.6, px, py, r);
        bg.addColorStop(0, 'rgba(' + bc + ',' + 0.35 * Math.sin(k * 3.14) * ga + ')'); bg.addColorStop(1, 'rgba(' + bc + ',0)');
        c.fillStyle = bg; c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill();
      } else if (type === 'fog') {
        var fr = r * (1 + k * 0.5), fg = c.createRadialGradient(px, py, 0, px, py, fr);
        fg.addColorStop(0, 'rgba(225,228,232,' + 0.22 * Math.sin(k * 3.14) * ga + ')'); fg.addColorStop(1, 'rgba(225,228,232,0)');
        c.fillStyle = fg; c.beginPath(); c.arc(px, py, fr, 0, 6.283); c.fill();
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
  Renderer.prototype.drawMatrix = function (o, lt) {
    var c = this.ctx, W = this.display.width, H = this.display.height, cs = Math.max(10, Math.round(H * 0.032)), cols = Math.ceil(W / cs);
    var chars = 'アイウエオカキクケコサシスセソ0123456789JZO';
    c.save(); c.font = cs + 'px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
    for (var i = 0; i < cols; i++) {
      var R = rng((o.seed || 5) + i * 7919), sp = 0.25 + R() * 0.5, off = R() * 2, head = ((lt * sp + off) % 1.6) * H;
      for (var j = 0; j < 18; j++) {
        var y = head - j * cs; if (y < -cs || y > H + cs) continue;
        var ch = chars.charAt(Math.floor(rng(i * 131 + Math.floor(lt * 8) + j * 17)() * chars.length));
        c.fillStyle = j === 0 ? 'rgba(220,255,220,' + c.globalAlpha + ')' : 'rgba(40,255,90,' + (1 - j / 18) * 0.85 * (o.amount || 1) + ')';
        c.fillText(ch, i * cs + cs / 2, y);
      }
    }
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
