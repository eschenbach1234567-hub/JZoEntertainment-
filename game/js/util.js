/* JZo World – Hilfsfunktionen: Mathe, Rauschen, Geometrie-Zusammenfügen, Canvas-Texturen */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const DEG = Math.PI / 180;

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function makeNoise(seed) {
  function h(x, y) {
    let k = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    k = Math.imul(k ^ (k >>> 13), 1274126177);
    k ^= k >>> 16;
    return (k >>> 0) / 4294967296;
  }
  function n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, oct = 5) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 17.1, y * f - i * 9.3); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  }
  function ridge(x, y, oct = 5) {
    let s = 0, a = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(n(x * f + i * 31.7, y * f + i * 7.7)); s += a * r * r; norm += a; a *= 0.5; f *= 2.1; }
    return s / norm;
  }
  return { n, fbm, ridge, h };
}

/* Färbt eine Geometrie einheitlich (für zusammengefügte Modelle mit Vertex-Farben) */
export function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* Fügt beliebige Geometrien zusammen (vereinheitlicht Attribute vorher) */
export function merge(geos, withColor = false) {
  const list = geos.filter(Boolean).map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.normal) x.computeVertexNormals();
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', x.attributes.position);
    out.setAttribute('normal', x.attributes.normal);
    const n = x.attributes.position.count;
    out.setAttribute('uv', x.attributes.uv || new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (withColor) {
      if (!x.attributes.color) tint(x, 0xffffff);
      out.setAttribute('color', x.attributes.color);
    }
    return out;
  });
  if (!list.length) return new THREE.BufferGeometry();
  const m = mergeGeometries(list, false);
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

export function creased(geo, angle = 35) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('normal');
  return toCreasedNormals(g, angle * DEG);
}

/* Transformiert eine Geometrie mit Position / Drehung (Euler in Grad oder Radiant) / Skalierung */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

/* --- Canvas-Texturen --- */
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = opts.aniso || 4;
  if (opts.nomip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.needsUpdate = true;
  return t;
}

export function noiseFill(g, w, h, base, amp, seed = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (r() - 0.5) * amp;
    d[i] = clamp(base[0] + v, 0, 255); d[i + 1] = clamp(base[1] + v, 0, 255); d[i + 2] = clamp(base[2] + v, 0, 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return canvasTex(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

export function cloudTex(seed = 3) {
  const r = rng(seed);
  return canvasTex(256, 256, (g, w) => {
    g.clearRect(0, 0, w, w);
    for (let i = 0; i < 36; i++) {
      const x = w * (0.2 + r() * 0.6), y = w * (0.3 + r() * 0.45), rad = w * (0.08 + r() * 0.16);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const sh = 225 + Math.floor(r() * 30);
      gr.addColorStop(0, `rgba(${sh},${sh},${sh + 5},0.55)`);
      gr.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  });
}
