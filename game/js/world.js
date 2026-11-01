/* JZo World – die vier Welten: Gelände, Städte, Flughäfen, Brücken, Bäume, Verkehr, Karte */
import * as THREE from 'three';
import { makeNoise, rng, clamp, lerp, smooth, merge, place, tint, canvasTex, noiseFill, radialTex, DEG } from './util.js';
import { buildCar } from './models.js';

/* ---------- Welt-Definitionen (alles frei erfunden) ---------- */
export const WORLDS = [
  {
    id: 'neon', name: 'Neon Bay', tag: '80er-Küstenstadt', seed: 11,
    desc: 'Palmen, Pastell-Hotels, Neonlichter, Strand und türkises Meer. Miami-Gefühl.',
    grad: 'linear-gradient(135deg,#ff5fa8 0%,#ffa66b 45%,#2fd0c6 100%)',
    water: 0, hasWater: true, hour: 18.7, fog: 0.000065, fogColor: 0xb7cde0, shallow: 0x3fd8c8, deep: 0x0a4a6a, sunAz: 1.2,
    snow: 99999, ground: { grass: 0x6f8f45, dry: 0x9a9a5a, sand: 0xe6d3a3, rock: 0x7d7468, city: 0x6a6a64 },
    raw: (N) => (x, z) => {
      const coast = 1800 + 400 * N.fbm(z / 3000, 0.5, 3);
      const d = coast - x;
      let h;
      if (d > 0) {
        h = 1.5 + Math.min(d, 400) / 400 * 3.5 + N.fbm(x / 900, z / 900, 4) * 3 * smooth(200, 800, d);
        h += smooth(-4500, -9000, x) * 260 * N.ridge(x / 2600, z / 2600, 5);
      } else h = -1 - Math.min(-d, 2000) * 0.012;
      const ir = Math.hypot(x - 4800, (z + 2600) * 0.8);
      h = lerp(h, 3.5 + N.fbm(x / 300, z / 300, 2), smooth(950, 650, ir));
      return h;
    },
    flats: [
      { x: -200, z: 0, hw: 1760, hl: 2380, h: 4, blend: 250, city: true },
      { x: -4970, z: 200, hw: 400, hl: 1700, h: 4, blend: 300, city: true },
      { x: -3300, z: 12, hw: 1500, hl: 40, h: 4, blend: 150 },
    ],
    cities: [{ x0: -1900, x1: 1500, z0: -2300, z1: 2300, block: 120, road: 16, h: 4, style: 'neon' }],
    runways: [{ x: -5200, z: 200, len: 3000, w: 50, rot: 0, h: 4, side: 1, main: true }],
    highways: [{ pts: [[-4700, 12], [-1900, 12]], w: 18 }],
    suburbs: [{ x0: -8500, x1: -2300, z0: -7000, z1: 7000, n: 420, style: 'villa' }, { x0: 3950, x1: 5650, z0: -3700, z1: -1500, n: 45, style: 'villa' }],
    trees: { palm: 2600, round: 900 },
    extras: 'neon',
  },
  {
    id: 'steel', name: 'Steel Harbor', tag: 'Wolkenkratzer-Metropole', seed: 23,
    desc: 'Riesige Hochhäuser auf einer Insel, Flüsse, Hängebrücken und ein Hafen. New-York-Gefühl.',
    grad: 'linear-gradient(135deg,#1d2b44 0%,#56708f 50%,#e0a458 100%)',
    water: 0, hasWater: true, hour: 9.5, fog: 0.00008, fogColor: 0xb3c1cf, shallow: 0x2a6e74, deep: 0x0d2e3e, haze: 1.3, sunAz: 0.3,
    snow: 99999, ground: { grass: 0x5b7340, dry: 0x7b7a55, sand: 0xbfb08a, rock: 0x6c6862, city: 0x5c5c5a },
    raw: (N) => (x, z) => {
      let land = 8 + N.fbm(x / 1800, z / 1800, 4) * 5 + smooth(4500, 9500, Math.abs(x)) * N.ridge(x / 2500, z / 2500, 4) * 380;
      const rxW = -1500 + 140 * Math.sin(z / 1300), rxE = 1450 + 110 * Math.sin(z / 1700 + 1);
      const sz = 4300 + 300 * N.fbm(x / 2000, 1.5, 3);
      const m = Math.max(smooth(390, 270, Math.abs(x - rxW)), smooth(330, 220, Math.abs(x - rxE)), smooth(sz - 100, sz + 250, z));
      return lerp(land, -12, m);
    },
    flats: [
      { x: -50, z: -300, hw: 1000, hl: 4250, h: 8, blend: 90, city: true },
      { x: 3250, z: -650, hw: 1300, hl: 2650, h: 8, blend: 300, city: true },
      { x: 6600, z: -60, hw: 1700, hl: 380, h: 8, blend: 300, city: true },
    ],
    cities: [
      { x0: -1000, x1: 1000, z0: -4500, z1: 3900, block: 80, road: 14, h: 8, style: 'steel' },
      { x0: 1960, x1: 4450, z0: -3184, z1: 1900, block: 80, road: 14, h: 8, style: 'borough' },
    ],
    runways: [{ x: 6600, z: -300, len: 3000, w: 55, rot: Math.PI / 2, h: 8, side: -1, main: true }],
    bridges: [
      { a: [880, -1774], b: [2060, -1774], w: 26, h: 28, base: 8, ramp: 320 },
      { a: [880, 1422], b: [2060, 1422], w: 26, h: 28, base: 8, ramp: 320 },
      { a: [-2350, -552], b: [-1000, -552], w: 26, h: 28, base: 8, ramp: 320 },
    ],
    highways: [{ pts: [[4450, -300], [5000, -300], [5100, -150]], w: 18 }, { pts: [[-2350, -552], [-4200, -552], [-6000, -900]], w: 16 }],
    suburbs: [{ x0: -7000, x1: -2200, z0: -6000, z1: 4000, n: 380, style: 'industry' }, { x0: 4600, x1: 8500, z0: -6000, z1: 6000, n: 260, style: 'house' }],
    trees: { round: 2600 },
    extras: 'steel',
  },
  {
    id: 'sierra', name: 'Sierra Sol', tag: 'Sonne, Wüste & Berge', seed: 37,
    desc: 'Küstenstadt mit Hügeln, dahinter Wüste, Tafelberge, hohe Gebirge und eine Militär-Luftwaffenbasis. Kalifornien-Gefühl.',
    grad: 'linear-gradient(135deg,#f6c453 0%,#f07b3f 50%,#8a4fbf 100%)',
    water: 0, hasWater: true, hour: 13.5, fog: 0.00005, fogColor: 0xd5d9df, shallow: 0x3cb4c4, deep: 0x0b3d5c, haze: 1.1, sunAz: -0.6,
    snow: 1500, ground: { grass: 0x8d8a4a, dry: 0xb5a167, sand: 0xe2cfa0, rock: 0x8c7462, city: 0x77736c, desert: 0xd3a46c },
    raw: (N) => (x, z) => {
      const coast = -6200 + 400 * N.fbm(z / 2500, 3.3, 3);
      const d = x - coast;
      if (d < 0) return -2 - Math.min(-d, 2500) * 0.01;
      let base = 10 + Math.min(d, 3000) * 0.004 + N.fbm(x / 700, z / 700, 4) * 6;
      const hills = smooth(-2700, -1300, x) * smooth(2700, 1300, x) * 280 * (0.35 + 0.65 * N.ridge(x / 1400, z / 1400, 5));
      const desert = smooth(800, 2600, x);
      const hd = 62 + 16 * N.fbm(x / 420, z / 420, 3) + smooth(0.27, 0.33, N.fbm(x / 2300 + 5, z / 2300, 4)) * 150;
      let h = lerp(base + hills, hd, desert);
      h += smooth(-3000, -7200, z) * 1700 * (0.3 + 0.7 * N.ridge(x / 2600, z / 2600, 6));
      return lerp(1.2 + d * 0.01, h, smooth(70, 420, d));
    },
    flats: [
      { x: -3600, z: 0, hw: 1350, hl: 1560, h: 12, blend: 320, city: true },
      { x: -3600, z: 3420, hw: 1700, hl: 420, h: 12, blend: 300, city: true },
      { x: 5430, z: 600, hw: 420, hl: 2050, h: 70, blend: 650, city: true },
    ],
    cities: [{ x0: -4900, x1: -2300, z0: -1500, z1: 1500, block: 130, road: 18, h: 12, style: 'sierra' }],
    runways: [
      { x: -3600, z: 3300, len: 3000, w: 50, rot: Math.PI / 2, h: 12, side: 1, main: true },
      { x: 5200, z: 600, len: 3600, w: 60, rot: 0, h: 70, side: 1, military: true },
    ],
    highways: [{ pts: [[-2300, 4], [-1200, 200], [300, -100], [2400, 300], [4700, 600], [5430, 600]], w: 18 }, { pts: [[-3600, 1500], [-3600, 3000]], w: 16 }],
    suburbs: [{ x0: -6000, x1: -2000, z0: -3300, z1: 2400, n: 650, style: 'villa' }, { x0: 900, x1: 4000, z0: -2500, z1: 3000, n: 30, style: 'shack' }],
    trees: { palm: 1500, cactus: 1600, shrub: 1800, pine: 700 },
    extras: 'sierra',
  },
  {
    id: 'alpen', name: 'Alpenhorn', tag: 'Alpental mit Fliegerhorst', seed: 53,
    desc: 'Ein Tal zwischen schneebedeckten Gipfeln, ein Bergsee, ein kleines Dorf und ein Militär-Flugplatz. Perfekt für Tiefflug durchs Tal.',
    grad: 'linear-gradient(135deg,#9fd2ff 0%,#f4f7fb 45%,#4a7a52 100%)',
    water: 590, hasWater: true, hour: 10.5, fog: 0.000055, fogColor: 0xc7d6e6, shallow: 0x3a8aa0, deep: 0x123c55, sunAz: 0.2,
    snow: 1950, cloudH: [3300, 4300], ground: { grass: 0x55803a, dry: 0x7f8a4c, sand: 0x9a8f70, rock: 0x7a746e, city: 0x6a6c63 },
    raw: (N) => (x, z) => {
      const x0 = 300 * Math.sin(z / 2500), dx = Math.abs(x - x0);
      let h = 600 + smooth(1100, 4200, dx) * (1800 + 1000 * N.ridge(x / 2000, z / 2000, 5));
      h += N.fbm(x / 500, z / 500, 5) * 30 * smooth(800, 2000, dx) + N.fbm(x / 1500, z / 1500, 3) * 12;
      h -= smooth(3600, 4400, z) * smooth(1500, 800, dx) * 48;
      return h;
    },
    flats: [
      { x: 0, z: 1800, hw: 650, hl: 900, h: 606, blend: 300, city: true },
      { x: 570, z: -3300, hw: 420, hl: 1850, h: 606, blend: 420, city: true },
    ],
    cities: [{ x0: -600, x1: 600, z0: 1000, z1: 2600, block: 70, road: 11, h: 606, style: 'alpen' }],
    runways: [{ x: 450, z: -3300, len: 3000, w: 45, rot: 0, h: 606, side: 1, main: true, military: true }],
    highways: [{ pts: [[700, -2350], [420, -800], [120, 500], [0, 1000]], w: 12 }, { pts: [[0, 2600], [150, 3400], [-400, 5200]], w: 11 }],
    suburbs: [{ x0: -1500, x1: 1500, z0: -6000, z1: 6000, n: 170, style: 'farm' }],
    trees: { pine: 9000, round: 500 },
    extras: 'alpen',
  },
];

/* ---------- Gebäude-Material mit prozeduralen Fenstern (nachts beleuchtet) ---------- */
function buildingMaterial(uni) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uni.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute float aStyle; attribute float aSeed;
varying vec3 vBW; varying vec3 vBN; varying float vStyle; varying float vSeed;`).replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vBW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
  vBN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
#else
  vBW = (modelMatrix * vec4(position, 1.0)).xyz;
  vBN = normalize(mat3(modelMatrix) * normal);
#endif
  vStyle = aStyle; vSeed = aSeed;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uNight;
varying vec3 vBW; varying vec3 vBN; varying float vStyle; varying float vSeed;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`).replace('#include <color_fragment>', `#include <color_fragment>
  float jzWin = 0.0, jzLit = 0.0, jzR = 0.0;
  {
    float wall = 1.0 - step(0.6, abs(vBN.y));
    vec2 fc = vec2(abs(vBN.x) > 0.5 ? vBW.z : vBW.x, vBW.y);
    vec2 cs = vStyle < 0.5 ? vec2(3.2, 3.6) : vStyle < 1.5 ? vec2(1.6, 3.6) : vStyle < 2.5 ? vec2(2.6, 3.4) : vec2(3.0, 3.0);
    vec2 cell = floor(fc / cs); vec2 f = fract(fc / cs);
    float w;
    if (vStyle < 0.5) w = step(0.14, f.x) * step(f.x, 0.86) * step(0.28, f.y) * step(f.y, 0.86);
    else if (vStyle < 1.5) w = step(0.05, f.x) * step(0.1, f.y) * step(f.y, 0.95);
    else if (vStyle < 2.5) w = step(0.1, f.x) * step(f.x, 0.9) * step(0.38, f.y) * step(f.y, 0.82);
    else w = step(0.3, f.x) * step(f.x, 0.7) * step(0.32, f.y) * step(f.y, 0.78);
    vec2 fw = fwidth(fc) / cs;
    float aa = clamp(1.6 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
    jzWin = mix(0.45, w, aa) * wall;
    jzR = bHash(cell + vSeed);
    jzLit = step(0.6, bHash(cell * 1.37 + vSeed * 3.1));
    vec3 glass = mix(vec3(0.03, 0.045, 0.06), vec3(0.13, 0.18, 0.23), jzR);
    if (vStyle > 0.5 && vStyle < 1.5) glass = mix(vec3(0.06, 0.1, 0.13), vec3(0.22, 0.32, 0.38), jzR) * (0.6 + diffuseColor.rgb * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, jzWin);
    diffuseColor.rgb *= mix(1.0, 0.5, step(0.6, vBN.y));
  }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.07, jzWin);`).replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.6, jzWin);`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += jzWin * jzLit * uNight * mix(vec3(1.0, 0.76, 0.48), vec3(0.75, 0.86, 1.0), step(0.72, jzR)) * (0.22 + 0.85 * jzR);`);
  };
  return m;
}

/* ---------- Texturen ---------- */
function roadTex(style) {
  return canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, [52, 54, 58], 22, 3);
    g.fillStyle = 'rgba(235,235,235,0.9)';
    g.fillRect(5, 0, 3, h); g.fillRect(w - 8, 0, 3, h);
    if (style === 'us') { g.fillStyle = '#e8b829'; g.fillRect(w / 2 - 4, 0, 2.5, h); g.fillRect(w / 2 + 1.5, 0, 2.5, h); }
    else { g.fillStyle = 'rgba(235,235,235,0.9)'; g.fillRect(w / 2 - 1.5, 0, 3, h * 0.5); }
  }, { repeat: true, aniso: 8 });
}
function runwayTex(len, wid) {
  const H = 4096, W = 256, sc = H / len;
  return canvasTex(W, H, (g) => {
    noiseFill(g, W, H, [60, 62, 66], 18, 7);
    g.fillStyle = 'rgba(30,30,30,0.35)';
    for (let i = 0; i < 40; i++) g.fillRect(W * 0.35 + Math.random() * W * 0.3, H * 0.04 + Math.random() * H * 0.08, 6, 120);
    for (let i = 0; i < 40; i++) g.fillRect(W * 0.35 + Math.random() * W * 0.3, H * 0.88 + Math.random() * H * 0.08, 6, 120);
    g.fillStyle = '#eaeaea';
    const px = W / wid;
    g.fillRect(px * 1, 0, px * 0.9, H); g.fillRect(W - px * 1.9, 0, px * 0.9, H);
    for (let y = 400 * sc; y < H - 400 * sc; y += 50 * sc) g.fillRect(W / 2 - px * 0.45, y, px * 0.9, 30 * sc);
    for (const end of [0, 1]) {
      const y0 = end ? H - 60 * sc : 6 * sc;
      for (let i = 0; i < 12; i++) { const x = px * 3 + i * ((W - px * 6) / 12); if (Math.abs(x + px - W / 2) < px * 3) continue; g.fillRect(x, y0, px * 1.8, 54 * sc); }
      const ya = end ? H - 330 * sc : 280 * sc;
      g.fillRect(W / 2 - px * 9, ya, px * 4, 50 * sc); g.fillRect(W / 2 + px * 5, ya, px * 4, 50 * sc);
      for (let k = 1; k < 4; k++) {
        const yt = end ? H - (330 + k * 150) * sc : (280 + k * 150) * sc;
        g.fillRect(W / 2 - px * 8, yt, px * 1.5, 22 * sc); g.fillRect(W / 2 + px * 6.5, yt, px * 1.5, 22 * sc);
      }
    }
  }, { aniso: 8 });
}
function detailTex() {
  return canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, [236, 236, 236], 18, 11);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,120,120'},0.035)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 14, 0, 7); g.fill();
    }
  }, { repeat: true, aniso: 8 });
}

/* ---------- Baum-Geometrien (Vertex-Farben) ---------- */
function treeGeos() {
  const palm = [];
  let y = 0, x = 0;
  for (let i = 0; i < 6; i++) {
    palm.push(tint(place(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 1.6, 7), x, y + 0.8, 0), 0x7a6248));
    y += 1.55; x += 0.12 + i * 0.05;
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(0.9, 4.2, 1, 3);
    const p = leaf.attributes.position;
    for (let k = 0; k < p.count; k++) { const ly = p.getY(k) + 2.1; p.setZ(k, -ly * ly * 0.09); p.setX(k, p.getX(k) * (1 - ly / 5)); p.setY(k, ly); }
    leaf.computeVertexNormals();
    place(leaf, x, y, 0, -1.25, a, 0);
    palm.push(tint(leaf, i % 2 ? 0x3f7a2e : 0x4c8a35));
  }
  palm.push(tint(place(new THREE.SphereGeometry(0.35, 6, 5), x, y - 0.2, 0), 0x5d4a2a));
  const round = [
    tint(place(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 7), 0, 1.6, 0), 0x5e4a36),
    tint(place(new THREE.IcosahedronGeometry(2.6, 1), 0, 4.6, 0, 0, 0, 0, 1, 0.85, 1), 0x4c7a33),
    tint(place(new THREE.IcosahedronGeometry(1.8, 1), 1.2, 5.6, 0.6), 0x588a3a),
  ];
  const pine = [
    tint(place(new THREE.CylinderGeometry(0.18, 0.3, 3, 6), 0, 1.5, 0), 0x4e3b2a),
    tint(place(new THREE.ConeGeometry(2.6, 5, 8), 0, 4.5, 0), 0x2c4f2a),
    tint(place(new THREE.ConeGeometry(2.0, 4.2, 8), 0, 7.0, 0), 0x31582d),
    tint(place(new THREE.ConeGeometry(1.3, 3.4, 8), 0, 9.3, 0), 0x36612f),
  ];
  const cactus = [
    tint(place(new THREE.CylinderGeometry(0.32, 0.36, 4.5, 8), 0, 2.25, 0), 0x4f7a3c),
    tint(place(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 7), 0.75, 2.7, 0), 0x4f7a3c),
    tint(place(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 7), 0.45, 1.95, 0, 0, 0, Math.PI / 2), 0x4f7a3c),
    tint(place(new THREE.CylinderGeometry(0.2, 0.2, 1.2, 7), -0.7, 3.0, 0), 0x4f7a3c),
    tint(place(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 7), -0.45, 2.45, 0, 0, 0, Math.PI / 2), 0x4f7a3c),
  ];
  const shrub = [tint(place(new THREE.IcosahedronGeometry(1.1, 0), 0, 0.6, 0, 0, 0, 0, 1.3, 0.75, 1.1), 0x7d7a45)];
  return { palm: merge(palm, true), round: merge(round, true), pine: merge(pine, true), cactus: merge(cactus, true), shrub: merge(shrub, true) };
}

function prismGeo() {
  const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

/* ---------- Welt ---------- */
export class World {
  constructor(def, Q, scene) {
    this.def = def; this.Q = Q; this.scene = scene;
    this.group = new THREE.Group();
    this.half = 10000;
    this.water = def.water;
    this.hasWater = def.hasWater;
    this.uni = { uNight: { value: 0 } };
    this.N = makeNoise(def.seed);
    this.r = rng(def.seed * 13 + 5);
    this.boxes = []; this.hash = new Map();
    this.roadRects = []; this.roadSegs = []; this.grids = [];
    this.buildings = []; this.roofs = []; this.neon = [];
    this.trees = { palm: [], round: [], pine: [], cactus: [], shrub: [] };
    this.lamps = []; this.runwayLights = [];
    this.planeSlots = []; this.carSlots = []; this.spawns = {};
    this.bridges = (def.bridges || []).map((b) => {
      const ax = b.a[0], az = b.a[1], bx = b.b[0], bz = b.b[1];
      const L = Math.hypot(bx - ax, bz - az);
      return { ...b, ax, az, L, ux: (bx - ax) / L, uz: (bz - az) / L };
    });
    this.mats = [];

    this.buildTerrain();
    for (const c of def.cities) this.genCity(c);
    for (const rw of def.runways) this.genAirport(rw);
    for (const hw of def.highways || []) this.genHighway(hw);
    for (const b of this.bridges) this.genBridge(b);
    for (const s of def.suburbs || []) this.genSuburb(s);
    this.genExtras();
    this.genTrees();
    this.buildInstances();
    this.traffic = new Traffic(this, Q.traffic);
    this.group.add(this.traffic.group);
    this.buildMap();
    scene.add(this.group);
  }

  /* --- Gelände --- */
  flatInfo(x, z, raw) {
    let h = raw, cityW = 1;
    for (const f of this.def.flats) {
      const dx = Math.max(Math.abs(x - f.x) - f.hw, 0), dz = Math.max(Math.abs(z - f.z) - f.hl, 0);
      const w = smooth(0, f.blend, Math.hypot(dx, dz));
      h = lerp(f.h, h, w);
      if (f.city) cityW = Math.min(cityW, smooth(0, 30, Math.hypot(dx, dz)));
    }
    return [h, cityW];
  }

  buildTerrain() {
    const seg = this.Q.terrainSeg, half = this.half, step = (half * 2) / seg;
    this.seg = seg; this.step = step;
    const raw = this.def.raw(this.N);
    const n1 = seg + 1;
    const H = new Float32Array(n1 * n1), CW = new Float32Array(n1 * n1);
    for (let r = 0; r < n1; r++) for (let c = 0; c < n1; c++) {
      const x = -half + c * step, z = -half + r * step;
      const [h, cw] = this.flatInfo(x, z, raw(x, z));
      H[r * n1 + c] = h; CW[r * n1 + c] = cw;
    }
    this.H = H;
    const geo = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const G = this.def.ground, N = this.N;
    const cGrass = new THREE.Color(G.grass), cDry = new THREE.Color(G.dry), cSand = new THREE.Color(G.sand), cRock = new THREE.Color(G.rock),
      cSnow = new THREE.Color(0xf4f7fb), cCity = new THREE.Color(G.city), cDesert = new THREE.Color(G.desert || G.dry), cMud = new THREE.Color(0x6d6450);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const r = Math.floor(i / n1), c = i % n1;
      const h = H[i];
      pos.setY(i, h);
      const x = -half + c * step, z = -half + r * step;
      const hx = H[r * n1 + Math.min(c + 1, seg)] - H[r * n1 + Math.max(c - 1, 0)];
      const hz = H[Math.min(r + 1, seg) * n1 + c] - H[Math.max(r - 1, 0) * n1 + c];
      const slope = Math.hypot(hx, hz) / (2 * step);
      const n = N.fbm(x / 700, z / 700, 3) * 0.5 + 0.5;
      tmp.copy(cGrass).lerp(cDry, clamp(n * 1.2 - 0.2, 0, 1));
      if (this.def.id === 'sierra') tmp.lerp(cDesert, smooth(600, 2200, x));
      const rel = h - this.water;
      if (this.hasWater && rel < 4.5) tmp.lerp(cSand, smooth(4.5, 2.5, rel));
      if (this.hasWater && rel < -0.5) tmp.lerp(cMud, smooth(-0.5, -6, rel));
      tmp.lerp(cRock, smooth(0.35, 0.75, slope));
      const sn = this.def.snow + N.fbm(x / 400, z / 400, 3) * 200;
      tmp.lerp(cSnow, smooth(sn, sn + 120, h) * (1 - smooth(0.9, 1.3, slope) * 0.6));
      tmp.lerp(cCity, 1 - CW[i]);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      uv.setXY(i, uv.getX(i) * (half / 18), uv.getY(i) * (half / 18));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTex(), roughness: 0.96, metalness: 0 });
    this.mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // Tiefen-Textur fürs Wasser (flach = türkis, tief = dunkel)
    const dd = new Uint8Array(n1 * n1);
    for (let i = 0; i < n1 * n1; i++) dd[i] = clamp(((this.water - H[i]) / 30) * 255, 0, 255);
    this.depthTex = new THREE.DataTexture(dd, n1, n1, THREE.RedFormat, THREE.UnsignedByteType);
    this.depthTex.magFilter = THREE.LinearFilter; this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.needsUpdate = true;
  }

  heightAt(x, z) {
    const half = this.half, step = this.step, seg = this.seg, n1 = seg + 1;
    const fx = clamp((x + half) / step, 0, seg - 1e-4), fz = clamp((z + half) / step, 0, seg - 1e-4);
    const c = Math.floor(fx), r = Math.floor(fz), u = fx - c, v = fz - r;
    const H = this.H;
    const ha = H[r * n1 + c], hd = H[r * n1 + c + 1], hb = H[(r + 1) * n1 + c], hc = H[(r + 1) * n1 + c + 1];
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  bridgeAt(x, z) {
    for (const b of this.bridges) {
      const px = x - b.ax, pz = z - b.az;
      const s = px * b.ux + pz * b.uz, t = -px * b.uz + pz * b.ux;
      if (s >= 0 && s <= b.L && Math.abs(t) <= b.w / 2) return b.base + (b.h - b.base) * smooth(0, b.ramp, Math.min(s, b.L - s));
    }
    return -1e9;
  }
  groundAt(x, z) { return Math.max(this.heightAt(x, z), this.bridgeAt(x, z)); }
  isWater(x, z) { return this.hasWater && this.groundAt(x, z) < this.water - 0.3; }
  isRoad(x, z) {
    for (const r of this.roadRects) {
      const dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx * r.c - dz * r.s) <= r.hw && Math.abs(dx * r.s + dz * r.c) <= r.hl) return true;
    }
    for (const g of this.grids) {
      if (x < g.x0 - g.road || x > g.xs[g.xs.length - 1] + g.road || z < g.z0 - g.road || z > g.zs[g.zs.length - 1] + g.road) continue;
      const P = g.block + g.road;
      const mx = (((x - g.x0) % P) + P) % P, mz = (((z - g.z0) % P) + P) % P;
      if (mx < g.road / 2 + 0.5 || mx > P - g.road / 2 - 0.5 || mz < g.road / 2 + 0.5 || mz > P - g.road / 2 - 0.5) return true;
    }
    for (const s of this.roadSegs) {
      const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz;
      const t = clamp(((x - s.ax) * vx + (z - s.az) * vz) / L2, 0, 1);
      if (Math.hypot(x - s.ax - vx * t, z - s.az - vz * t) < s.w / 2 + 0.5) return true;
    }
    return this.bridgeAt(x, z) > -1e8;
  }

  /* --- Kollision mit Gebäuden (Raster-Hash) --- */
  addBox(minX, maxX, minZ, maxZ, top) {
    const b = { minX, maxX, minZ, maxZ, top };
    this.boxes.push(b);
    const C = 100;
    for (let i = Math.floor(minX / C); i <= Math.floor(maxX / C); i++) for (let j = Math.floor(minZ / C); j <= Math.floor(maxZ / C); j++) {
      const k = i * 100003 + j;
      if (!this.hash.has(k)) this.hash.set(k, []);
      this.hash.get(k).push(b);
    }
  }
  near(x, z) { return this.hash.get(Math.floor(x / 100) * 100003 + Math.floor(z / 100)) || []; }
  collide(p, r, y) {
    let best = null, bd = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.hash.get((Math.floor(p.x / 100) + i) * 100003 + Math.floor(p.z / 100) + j);
      if (!list) continue;
      for (const b of list) {
        if (p.y > b.top) continue;
        const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let push;
        if (d2 > 1e-6) { const d = Math.sqrt(d2); push = { x: (dx / d) * (r - d), z: (dz / d) * (r - d) }; }
        else {
          const opts = [[b.minX - r - p.x, 0], [b.maxX + r - p.x, 0], [0, b.minZ - r - p.z], [0, b.maxZ + r - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          push = { x: opts[0][0], z: opts[0][1] };
        }
        const m = Math.hypot(push.x, push.z);
        if (m > bd) { bd = m; best = push; }
      }
    }
    return best;
  }
  hitBuilding(p, r) {
    for (const b of this.near(p.x, p.z)) {
      if (p.y < b.top && p.x > b.minX - r && p.x < b.maxX + r && p.z > b.minZ - r && p.z < b.maxZ + r) return true;
    }
    return false;
  }

  /* --- Stadt --- */
  addBuilding(x, z, w, d, h, color, style, opts = {}) {
    const base = opts.base ?? Math.min(this.heightAt(x - w / 2, z - d / 2), this.heightAt(x + w / 2, z + d / 2), this.heightAt(x - w / 2, z + d / 2), this.heightAt(x + w / 2, z - d / 2)) - 0.5;
    const top = base + h + (opts.sunk || 0);
    this.buildings.push({ x, z, w, d, h: top - base, base, color, style, seed: this.r() * 100 });
    if (!opts.nocollide) this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, top);
    if (opts.roof) this.roofs.push({ x, z, w: w + 0.8, d: d + 0.8, h: opts.roof, base: top, color: opts.roofColor || 0x8a3b2a, rot: opts.roofRot || 0 });
    return top;
  }
  roadStrip(x, z, w, len, alongX, y, list) {
    const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / w));
    if (alongX) g.rotateY(Math.PI / 2);
    g.translate(x, y, z);
    list.push(g);
  }

  genCity(c) {
    const r = this.r, P = c.block + c.road;
    const xs = [], zs = [];
    for (let x = c.x0; x <= c.x1 + 0.1; x += P) xs.push(x);
    for (let z = c.z0; z <= c.z1 + 0.1; z += P) zs.push(z);
    const g = { ...c, xs, zs };
    this.grids.push(g);
    this.roadGeos = this.roadGeos || [];
    const zMid = (zs[0] + zs[zs.length - 1]) / 2, zLen = zs[zs.length - 1] - zs[0] + c.road;
    const xMid = (xs[0] + xs[xs.length - 1]) / 2, xLen = xs[xs.length - 1] - xs[0] + c.road;
    for (const x of xs) this.roadStrip(x, zMid, c.road, zLen, false, c.h + 0.09, this.roadGeos);
    for (const z of zs) this.roadStrip(xMid, z, c.road, xLen, true, c.h + 0.07, this.roadGeos);
    this.curbs = this.curbs || []; this.parks = this.parks || [];
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    const thin = this.Q.cityDensity;
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const bx0 = xs[i] + c.road / 2, bx1 = xs[i + 1] - c.road / 2, bz0 = zs[j] + c.road / 2, bz1 = zs[j + 1] - c.road / 2;
      const bw = bx1 - bx0, bd = bz1 - bz0, mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
      this.curbs.push({ x: mx, z: mz, w: bw, d: bd, y: c.h });
      const dn = Math.min(1, Math.hypot((mx - cx) / hx, (mz - cz) / hz));
      if (r() < (c.style === 'alpen' ? 0.12 : 0.07) || (c.style === 'neon' && i === xs.length - 2 && r() < 0.3)) {
        this.parks.push({ x: mx, z: mz, w: bw - 5, d: bd - 5, y: c.h + 0.2 });
        for (let k = 0; k < (bw * bd) / 500; k++) this.trees[c.style === 'neon' || c.style === 'sierra' ? 'palm' : 'round'].push([bx0 + 4 + r() * (bw - 8), bz0 + 4 + r() * (bd - 8), 0.8 + r() * 0.5]);
        continue;
      }
      this.cityBlock(c, i, j, xs, bx0, bz0, bw, bd, dn, thin);
      // Straßenlaternen + Palmen am Straßenrand
      this.lamps.push([bx0 - 1.5, bz0 - 1.5, c.h], [bx1 + 1.5, bz1 + 1.5, c.h]);
      if ((c.style === 'neon' || c.style === 'sierra') && r() < 0.8) {
        for (let k = 1; k < 4; k++) this.trees.palm.push([bx0 + (bw * k) / 4, bz0 - 2.2, 0.75 + r() * 0.35]);
      }
      if (c.style === 'borough' && r() < 0.5) for (let k = 1; k < 3; k++) this.trees.round.push([bx0 + (bw * k) / 3, bz0 - 2.2, 0.6 + r() * 0.3]);
    }
  }

  cityBlock(c, i, j, xs, bx0, bz0, bw, bd, dn, thin) {
    const r = this.r, base = c.h + 0.2, S = c.style;
    const pastel = [0xf6c1cf, 0xa8e6df, 0xfbe7b2, 0xf5f5f0, 0xc9b8f0, 0xffd3a8, 0xb9e3f6, 0xf0f0e8];
    const grey = [0x8d8f93, 0x9c9a94, 0x6e7378, 0xb0aaa0, 0x7c6f64, 0xa39b8b, 0x5f6a72];
    const brick = [0x8a4a3a, 0x7a4636, 0x9a5b45, 0x6e3f33, 0xa86d52];
    const glassC = [0x6f8fa8, 0x88a6bc, 0x5c7891, 0x9fb6c4, 0x4f6f86, 0x7fa0a0];
    const beige = [0xe8dcc4, 0xf2ece0, 0xd9c7a7, 0xefe6d2, 0xcfbfa2, 0xffffff];
    const nx = S === 'alpen' ? 2 : bw > 100 ? 2 : r() < 0.6 ? 1 : 2, nz = S === 'alpen' ? 2 : bd > 100 ? 2 : r() < 0.6 ? 1 : 2;
    const pick = (a) => a[Math.floor(r() * a.length)];
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      if (thin < 1 && r() > thin) continue;
      const lw = bw / nx, ld = bd / nz;
      const sb = S === 'alpen' ? 5 + r() * 4 : 2.5 + r() * 4;
      const w = lw - sb * 2, d = ld - sb * 2;
      if (w < 6 || d < 6) continue;
      const x = bx0 + lw * (a + 0.5), z = bz0 + ld * (b + 0.5);
      let h, col, st, roof = 0;
      if (S === 'neon') {
        const beach = i === xs.length - 2;
        if (beach) { h = 22 + r() * 60; st = 2; col = pick(pastel); }
        else if (r() < 0.1 * (1 - dn) + 0.025) { h = 60 + r() * 110; st = 1; col = pick([0xf5f5f0, 0xa8e6df, 0xc0e8f0]); }
        else { h = 8 + r() * 20; st = r() < 0.75 ? 2 : 0; col = pick(pastel); }
        const top = this.addBuilding(x, z, w, d, h, col, st, { base });
        if (h < 90 && r() < 0.45) this.neon.push({ x, z, w, d, y: top - 1.2 - r() * 3, color: pick([0xff2fa0, 0x29e6ff, 0xb44dff, 0xff7a1f, 0x3dff9b]) });
        continue;
      }
      if (S === 'steel') {
        const k = Math.pow(1 - dn, 1.6);
        h = 18 + r() * 25 + k * r() * 320 + (r() < 0.04 ? 120 : 0);
        if (h > 120) { st = r() < 0.6 ? 1 : 0; col = st ? pick(glassC) : pick(grey); }
        else if (h > 45) { st = 0; col = pick(grey); }
        else { st = 3; col = pick(brick); }
        const top = this.addBuilding(x, z, w, d, h, col, st, { base });
        if (h > 140 && r() < 0.5) this.addBuilding(x, z, w * 0.6, d * 0.6, 12 + r() * 30, col, st, { base: top, nocollide: false });
        continue;
      }
      if (S === 'borough') { h = 10 + r() * 22 + (r() < 0.06 ? 40 : 0); st = r() < 0.6 ? 3 : 0; col = st === 3 ? pick(brick) : pick(grey); this.addBuilding(x, z, w, d, h, col, st, { base }); continue; }
      if (S === 'sierra') {
        if (dn < 0.38) { h = 35 + r() * (1 - dn) * 210; st = r() < 0.65 ? 1 : 0; col = st ? pick(glassC) : pick(beige); }
        else { h = 6 + r() * 14; st = 3; col = pick(beige); }
        this.addBuilding(x, z, w, d, h, col, st, { base });
        continue;
      }
      if (S === 'alpen') {
        h = 6 + r() * 4; st = 3; col = pick([0xf3eee2, 0xfaf6ec, 0xe9dfc8, 0xf6e7d2]);
        roof = 3 + r() * 2;
        this.addBuilding(x, z, Math.min(w, 16), Math.min(d, 13), h, col, st, { base, roof, roofColor: pick([0x7a2f22, 0x5a4034, 0x8f3d26, 0x3e3f44]), roofRot: r() < 0.5 ? 0 : Math.PI / 2 });
      }
    }
  }

  genSuburb(s) {
    const r = this.r;
    let n = Math.round(s.n * this.Q.cityDensity);
    for (let k = 0, tries = 0; k < n && tries < n * 8; tries++) {
      const x = lerp(s.x0, s.x1, r()), z = lerp(s.z0, s.z1, r());
      const h = this.heightAt(x, z);
      if (h < this.water + 2.5) continue;
      if (Math.abs(this.heightAt(x + 12, z) - h) > 2.5 || Math.abs(this.heightAt(x, z + 12) - h) > 2.5) continue;
      if (this.flatInfo(x, z, 0)[1] < 1) continue;
      if (this.isRoad(x, z) || this.near(x, z).some((b) => x > b.minX - 25 && x < b.maxX + 25 && z > b.minZ - 25 && z < b.maxZ + 25)) continue;
      k++;
      if (s.style === 'villa') {
        const w = 14 + r() * 14, d = 12 + r() * 10;
        this.addBuilding(x, z, w, d, 5 + r() * 5, [0xf5f0e6, 0xf6d9c4, 0xe9f1f2, 0xfff6e0, 0xf2c6b4][Math.floor(r() * 5)], 2, { roof: r() < 0.6 ? 2.5 : 0, roofColor: 0xb4583a, roofRot: r() < 0.5 ? 0 : Math.PI / 2 });
        if (r() < 0.6) this.trees[this.def.id === 'steel' ? 'round' : 'palm'].push([x + w / 2 + 4, z, 0.8 + r() * 0.4]);
      } else if (s.style === 'industry') {
        const w = 30 + r() * 50, d = 25 + r() * 35;
        this.addBuilding(x, z, w, d, 8 + r() * 10, [0x8a8d90, 0x9b8b7b, 0x767a7e, 0xa49c90][Math.floor(r() * 4)], 3);
      } else if (s.style === 'shack') {
        this.addBuilding(x, z, 8 + r() * 8, 6 + r() * 6, 3.5 + r() * 2, 0xc9b28c, 3, { roof: 1.2, roofColor: 0x6e5a48 });
      } else {
        const w = 10 + r() * 6, d = 9 + r() * 5;
        this.addBuilding(x, z, w, d, 5 + r() * 4, [0xf3eee2, 0xfaf6ec, 0xe9dfc8, 0xd7d0c0][Math.floor(r() * 4)], 3, { roof: 3 + r() * 2, roofColor: [0x7a2f22, 0x5a4034, 0x3e3f44][Math.floor(r() * 3)], roofRot: r() < 0.5 ? 0 : Math.PI / 2 });
      }
    }
  }

  /* --- Flughafen --- */
  genAirport(rw) {
    const dir = { x: Math.sin(rw.rot), z: Math.cos(rw.rot) }, perp = { x: Math.cos(rw.rot), z: -Math.sin(rw.rot) };
    const P = (along, across) => ({ x: rw.x + dir.x * along + perp.x * across * rw.side, z: rw.z + dir.z * along + perp.z * across * rw.side });
    const y = rw.h;
    // Startbahn
    const tex = runwayTex(rw.len, rw.w);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(m);
    const g = new THREE.PlaneGeometry(rw.w, rw.len).rotateX(-Math.PI / 2).rotateY(rw.rot);
    const mesh = new THREE.Mesh(g, m); mesh.position.set(rw.x, y + 0.1, rw.z); mesh.receiveShadow = true;
    this.group.add(mesh);
    this.roadRects.push({ x: rw.x, z: rw.z, hw: rw.w / 2 + 4, hl: rw.len / 2, c: Math.cos(rw.rot), s: Math.sin(rw.rot) });
    // Rollweg + Vorfeld
    const conc = new THREE.MeshStandardMaterial({ color: 0xa9a59c, roughness: 0.9, map: detailTex(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.mats.push(conc);
    const slab = (along, across, wAcross, lAlong, yy) => {
      const c = P(along, across);
      const gg = new THREE.PlaneGeometry(wAcross, lAlong).rotateX(-Math.PI / 2).rotateY(rw.rot);
      const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * wAcross / 20, uv.getY(i) * lAlong / 20);
      const ms = new THREE.Mesh(gg, conc); ms.position.set(c.x, y + yy, c.z); ms.receiveShadow = true; this.group.add(ms);
      this.roadRects.push({ x: c.x, z: c.z, hw: wAcross / 2, hl: lAlong / 2, c: Math.cos(rw.rot), s: Math.sin(rw.rot) });
    };
    slab(0, 125, 24, rw.len - 80, 0.08);
    slab(0, 260, 230, Math.min(1500, rw.len * 0.55), 0.06);
    for (const a of [-rw.len / 2 + 60, 0, rw.len / 2 - 60]) slab(a, 70, 110, 24, 0.07);
    for (const a of [-300, 300]) slab(a, 150, 30, 24, 0.075);
    // Befeuerung
    for (let a = -rw.len / 2; a <= rw.len / 2; a += 60) for (const s of [-1, 1]) { const p = P(a, s * (rw.w / 2 + 1.5) * rw.side); this.runwayLights.push([p.x, y + 0.3, p.z, 0]); }
    for (const e of [-1, 1]) for (let k = -6; k <= 6; k++) { const p = P(e * (rw.len / 2 + 2), (k * rw.w) / 13); this.runwayLights.push([p.x, y + 0.3, p.z, e > 0 ? 2 : 1]); }
    // Gebäude: Terminal, Tower, Hangars
    const cosR = Math.abs(Math.cos(rw.rot)) > 0.5;
    const t = P(-80, 420);
    const tw = cosR ? 40 : 320, td = cosR ? 320 : 40;
    this.addBuilding(t.x, t.z, tw, td, rw.military ? 14 : 22, rw.military ? 0x8e8f86 : 0xdfe6ea, rw.military ? 0 : 1, { base: y });
    const tower = P(420, 410);
    this.addBuilding(tower.x, tower.z, 10, 10, 34, 0xd9d9d4, 0, { base: y });
    this.addBuilding(tower.x, tower.z, 15, 15, 6, 0x5d7c8c, 1, { base: y + 34 });
    this.hangars = this.hangars || [];
    for (let k = 0; k < 3; k++) {
      const h = P(-700 + k * 85 - (rw.len > 3200 ? 200 : 0), 430);
      this.hangars.push({ x: h.x, z: h.z, y, rot: rw.rot, mil: rw.military });
      this.addBox(h.x - 36, h.x + 36, h.z - 36, h.z + 36, y + 22);
    }
    // Stellplätze für Flugzeuge (Nase zur Startbahn) + Autos
    const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
    const toRunway = yawTo(-perp.x * rw.side, -perp.z * rw.side);
    if (rw.main || !this.planeSlots.length) {
      const slots = rw.main ? this.planeSlots : [];
      let a = -560;
      for (let k = 0; k < 10; k++) { const p = P(a, 235); slots.push({ x: p.x, z: p.z, yaw: toRunway }); a += 70 + (k % 3) * 8; }
      for (let k = 0; k < 14; k++) { const p = P(-560 + k * 9.5, 345); this.carSlots.push({ x: p.x, z: p.z, yaw: toRunway }); }
      const ft = P(-575, 300);
      this.spawns.airport = { x: ft.x, z: ft.z, yaw: yawTo(dir.x, dir.z) };
    }
    if (rw.military && !rw.main) {
      this.milSlots = [];
      let a = -500;
      for (let k = 0; k < 10; k++) { const p = P(a, 235); this.milSlots.push({ x: p.x, z: p.z, yaw: toRunway }); a += 60; }
    }
    this.runways = this.runways || [];
    const th = P(-rw.len / 2 + 90, 0), th2 = P(rw.len / 2 - 90, 0);
    const app = P(-rw.len / 2 - 6500, 0);
    this.runways.push({ ...rw, dir, perp, start: { x: th.x, z: th.z, yaw: yawTo(dir.x, dir.z) }, start2: { x: th2.x, z: th2.z, yaw: yawTo(-dir.x, -dir.z) },
      approach: { x: app.x, z: app.z, yaw: yawTo(dir.x, dir.z), alt: y + 420 } });
  }

  /* --- Landstraßen (folgen dem Gelände) --- */
  genHighway(hw) {
    const pts = hw.pts, w = hw.w;
    const pos = [], uv = [], idx = [];
    let dist = 0, vi = 0;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      this.roadSegs.push({ ax, az, bx, bz, w });
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      const n = Math.max(1, Math.ceil(L / 12));
      for (let k = 0; k <= n; k++) {
        if (s > 0 && k === 0) continue;
        const t = k / n, x = ax + ux * L * t, z = az + uz * L * t;
        for (const sd of [-1, 1]) {
          const px = x + nx * sd * w / 2, pz = z + nz * sd * w / 2;
          const h = Math.max(this.groundAt(px, pz), this.groundAt(x, z), this.groundAt(px - nx * sd * w / 4, pz - nz * sd * w / 4)) + 0.18;
          pos.push(px, h, pz); uv.push(sd < 0 ? 0 : 1, (dist + L * t) / w);
        }
        if (vi > 0) { const a = vi - 2, b = vi - 1, c = vi, d = vi + 1; idx.push(a, c, b, b, c, d); }
        vi += 2;
      }
      dist += L;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.roadGeos = this.roadGeos || [];
    this.roadGeos.push(g.toNonIndexed());
  }

  genBridge(b) {
    const pos = [], uv = [], under = [];
    const n = Math.ceil(b.L / 10);
    const nx = -b.uz, nz = b.ux;
    for (let k = 0; k <= n; k++) {
      const s = (b.L * k) / n, x = b.ax + b.ux * s, z = b.az + b.uz * s;
      const h = b.base + (b.h - b.base) * smooth(0, b.ramp, Math.min(s, b.L - s)) + 0.05;
      for (const sd of [-1, 1]) { pos.push(x + nx * sd * b.w / 2, h, z + nz * sd * b.w / 2); uv.push(sd < 0 ? 0 : 1, s / b.w); under.push(x + nx * sd * b.w / 2, h - 1.6, z + nz * sd * b.w / 2); }
    }
    const idx = [];
    for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    top.setIndex(idx); top.computeVertexNormals();
    this.roadGeos.push(top.toNonIndexed());
    // Unterseite + Seitenwände
    const parts = [];
    const ug = new THREE.BufferGeometry(); ug.setAttribute('position', new THREE.Float32BufferAttribute(under, 3));
    ug.setIndex(idx.map((v, i) => idx[i - (i % 3) + (2 - (i % 3))])); ug.computeVertexNormals(); parts.push(ug.toNonIndexed());
    for (const sd of [0, 1]) {
      const wall = [], wi = [];
      for (let k = 0; k <= n; k++) { const t = pos.slice((k * 2 + sd) * 3, (k * 2 + sd) * 3 + 3); wall.push(t[0], t[1] + 1.1, t[2], t[0], t[1] - 1.6, t[2]); }
      for (let k = 0; k < n; k++) { const a = k * 2; if (sd) wi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wall, 3)); wg.setIndex(wi); wg.computeVertexNormals(); parts.push(wg.toNonIndexed());
    }
    // Pylone + Seile
    const towerGeos = [], cable = [];
    const towerH = b.h + 70;
    for (const f of [0.28, 0.72]) {
      const s = b.L * f, x = b.ax + b.ux * s, z = b.az + b.uz * s;
      for (const sd of [-1, 1]) {
        const tx = x + nx * sd * (b.w / 2 + 2), tz = z + nz * sd * (b.w / 2 + 2);
        towerGeos.push(place(new THREE.BoxGeometry(4, towerH + 15, 4), tx, towerH / 2 - 15, tz));
        this.addBox(tx - 2.5, tx + 2.5, tz - 2.5, tz + 2.5, towerH);
      }
      towerGeos.push(place(new THREE.BoxGeometry(4, 4, 4), x, towerH - 4, z, 0, Math.atan2(nx, nz), 0, 1, 1, b.w / 4 + 1.5));
    }
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const s = (b.L * k) / 60, x = b.ax + b.ux * s + nx * sd * (b.w / 2 + 2), z = b.az + b.uz * s + nz * sd * (b.w / 2 + 2);
        const f = s / b.L;
        let h;
        if (f < 0.28) h = lerp(b.h + 2, towerH, Math.pow(f / 0.28, 1.6));
        else if (f > 0.72) h = lerp(b.h + 2, towerH, Math.pow((1 - f) / 0.28, 1.6));
        else { const m = (f - 0.5) / 0.22; h = b.h + 6 + (towerH - b.h - 6) * m * m; }
        pts.push(new THREE.Vector3(x, h, z));
        if (k % 3 === 0) cable.push(new THREE.Vector3(x, h, z), new THREE.Vector3(x, b.base + (b.h - b.base) * smooth(0, b.ramp, Math.min(s, b.L - s)) + 1, z));
      }
      for (let k = 0; k < pts.length - 1; k++) cable.push(pts[k], pts[k + 1]);
    }
    const sm = new THREE.MeshStandardMaterial({ color: this.def.id === 'steel' ? 0x7c5f4a : 0xb0453a, roughness: 0.6, metalness: 0.4 });
    const deck = new THREE.MeshStandardMaterial({ color: 0x6d6f73, roughness: 0.8 });
    this.mats.push(sm, deck);
    const t = new THREE.Mesh(merge(towerGeos), sm); t.castShadow = true; this.group.add(t);
    const d = new THREE.Mesh(merge(parts), deck); d.castShadow = true; d.receiveShadow = true; this.group.add(d);
    this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cable), new THREE.LineBasicMaterial({ color: 0x3a3a3a })));
  }

  /* --- Wahrzeichen je Welt --- */
  genExtras() {
    const r = this.r, id = this.def.extras;
    this.extraGeos = [];
    if (id === 'steel') {
      // Art-Deco-Turm mit Spitze
      const x = 47, z = -2000 + 47, y = 8.2;
      let top = this.addBuilding(x, z, 60, 60, 220, 0xb9b3a6, 0, { base: y });
      top = this.addBuilding(x, z, 44, 44, 90, 0xb9b3a6, 0, { base: top });
      top = this.addBuilding(x, z, 28, 28, 50, 0xc4beb0, 0, { base: top });
      this.extraGeos.push([place(new THREE.ConeGeometry(9, 40, 8), x, top + 20, z), 0xcfc9bb], [place(new THREE.CylinderGeometry(0.8, 1.2, 70, 6), x, top + 70, z), 0xdddddd]);
      this.addBox(x - 3, x + 3, z - 3, z + 3, top + 105);
      // Hafenkräne
      for (let k = 0; k < 6; k++) {
        const cx = 2200 + k * 90, cz = 1960, cy = this.heightAt(cx, cz);
        this.extraGeos.push([place(new THREE.BoxGeometry(3, 45, 3), cx, cy + 22, cz), 0xd8622b], [place(new THREE.BoxGeometry(3, 3, 60), cx, cy + 45, cz + 18), 0xd8622b]);
        this.addBox(cx - 2, cx + 2, cz - 2, cz + 2, cy + 47);
      }
    }
    if (id === 'sierra') {
      // Buchstaben am Hang
      const word = 'SIERRA SOL';
      const x0 = -2350, z0 = -2050;
      const tex = canvasTex(1024, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#f4f4f4'; g.font = 'bold 118px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, w / 2, h / 2 + 6);
      });
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 });
      this.mats.push(m);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(560, 70), m);
      const hy = this.heightAt(x0, z0);
      sign.position.set(x0, hy + 30, z0); sign.rotation.y = -Math.PI / 2 + 0.25; sign.rotation.x = -0.15;
      sign.castShadow = true;
      this.group.add(sign);
      // Militärbasis-Hangars mit Tarnfarbe sind in genAirport
    }
    if (id === 'neon') {
      // Riesenrad am Strand
      const x = 1625, z = -600, y = this.heightAt(x, z);
      const wheel = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(28, 0.8, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3fae, emissiveIntensity: 0.6 }));
      wheel.add(ring);
      const spokes = [];
      for (let k = 0; k < 16; k++) spokes.push(place(new THREE.BoxGeometry(0.4, 56, 0.4), 0, 0, 0, 0, 0, (k / 16) * Math.PI));
      wheel.add(new THREE.Mesh(merge(spokes), new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.6, roughness: 0.4 })));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshStandardMaterial({ color: [0xff4fa3, 0x2fd7ff, 0xffd23f, 0x9b5cff][k % 4], emissive: [0xff4fa3, 0x2fd7ff, 0xffd23f, 0x9b5cff][k % 4], emissiveIntensity: 0.4 }));
        cab.position.set(Math.cos(a) * 28, Math.sin(a) * 28, 0);
        wheel.add(cab);
      }
      wheel.position.set(x, y + 32, z); wheel.rotation.y = Math.PI / 2;
      this.group.add(wheel);
      this.ferris = wheel;
      this.ferrisMat = ring.material;
      this.extraGeos.push([place(new THREE.BoxGeometry(2, 34, 6), x, y + 16, z), 0xdddddd]);
      this.addBox(x - 3, x + 3, z - 30, z + 30, y + 62);
      // Rettungsschwimmer-Häuschen
      for (let k = 0; k < 8; k++) {
        const zz = -2100 + k * 560, xx = 1700 + 200 * this.N.fbm(zz / 3000, 0.5, 3) * 0 + 60, yy = Math.max(this.heightAt(xx, zz), 1);
        this.extraGeos.push([place(new THREE.BoxGeometry(4, 3, 4), xx, yy + 4, zz), [0xff8fc0, 0x6fe0d8, 0xffd36b][k % 3]], [place(new THREE.BoxGeometry(0.3, 4, 0.3), xx, yy + 1.5, zz), 0xeeeeee]);
      }
    }
    if (id === 'alpen') {
      // Kirche mit Zwiebelturm
      const x = 0, z = 1800 - 40, y = 606.2;
      this.addBuilding(x, z, 16, 30, 12, 0xf6f1e6, 3, { base: y, roof: 7, roofColor: 0x7a2f22 });
      const top = this.addBuilding(x, z - 19, 8, 8, 32, 0xf6f1e6, 3, { base: y });
      this.extraGeos.push([place(new THREE.SphereGeometry(4.2, 16, 12), x, top + 3, z - 19, 0, 0, 0, 1, 1.25, 1), 0x2f5a3a], [place(new THREE.ConeGeometry(1.4, 7, 10), x, top + 10, z - 19), 0x2f5a3a]);
    }
    if (this.extraGeos.length) {
      const g = merge(this.extraGeos.map(([geo, c]) => tint(geo, c)), true);
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
      this.mats.push(m);
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh);
    }
  }

  genTrees() {
    const r = this.r, N = this.N, T = this.def.trees, Q = this.Q.trees;
    const tryAdd = (type, n, ok) => {
      let k = 0;
      for (let tries = 0; k < n * Q && tries < n * Q * 6; tries++) {
        const x = (r() - 0.5) * 19000, z = (r() - 0.5) * 19000;
        const h = this.heightAt(x, z);
        if (h < this.water + 1.8) continue;
        if (!ok(x, z, h)) continue;
        if (this.flatInfo(x, z, 0)[1] < 1 || this.isRoad(x, z)) continue;
        if (this.near(x, z).some((b) => x > b.minX - 3 && x < b.maxX + 3 && z > b.minZ - 3 && z < b.maxZ + 3)) continue;
        this.trees[type].push([x, z, 0.7 + r() * 0.6]);
        k++;
      }
    };
    const id = this.def.id;
    if (T.palm) tryAdd('palm', T.palm, (x, z, h) => (id === 'neon' ? h < 40 && (x > -4000 || r() < 0.3) : x < -1800 && h < 120));
    if (T.round) tryAdd('round', T.round, (x, z, h) => (id === 'alpen' ? h < 700 : N.fbm(x / 900, z / 900, 3) > -0.05));
    if (T.pine) tryAdd('pine', T.pine, (x, z, h) => (id === 'alpen' ? h > 620 && h < 1850 + N.fbm(x / 300, z / 300, 2) * 150 && N.fbm(x / 1200, z / 1200, 3) > -0.25 : h > 400 && h < 1350));
    if (T.cactus) tryAdd('cactus', T.cactus, (x, z, h) => x > 900 && h < 300);
    if (T.shrub) tryAdd('shrub', T.shrub, (x, z, h) => x > -2600 && h < 400);
  }

  /* --- Instanzen erzeugen (wenige Zeichenaufrufe für tausende Objekte) --- */
  buildInstances() {
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const Q = this.Q;
    // Straßen
    if (this.roadGeos && this.roadGeos.length) {
      const m = new THREE.MeshStandardMaterial({ map: roadTex(this.def.id === 'alpen' ? 'eu' : 'us'), roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.mats.push(m);
      const rm = new THREE.Mesh(merge(this.roadGeos), m); rm.receiveShadow = true; this.group.add(rm);
    }
    // Gehwege / Parks
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const inst = (geo, mat, list, fn, shadow = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { fn(it, i); im.setMatrixAt(i, M4); });
      im.castShadow = shadow; im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
      return im;
    };
    const curbMat = new THREE.MeshStandardMaterial({ color: 0xb7b2a9, roughness: 0.9, map: detailTex() });
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x4f7a36, roughness: 1 });
    this.mats.push(curbMat, parkMat);
    inst(unit, curbMat, this.curbs || [], (c) => M4.compose(p.set(c.x, c.y - 0.3, c.z), q.identity(), s.set(c.w, 0.5, c.d)), false);
    inst(unit, parkMat, this.parks || [], (c) => M4.compose(p.set(c.x, c.y, c.z), q.identity(), s.set(c.w, 0.06, c.d)), false);
    // Gebäude
    if (this.buildings.length) {
      const bg = unit.clone();
      const n = this.buildings.length;
      const st = new Float32Array(n), sd = new Float32Array(n);
      this.buildings.forEach((b, i) => { st[i] = b.style; sd[i] = b.seed; });
      bg.setAttribute('aStyle', new THREE.InstancedBufferAttribute(st, 1));
      bg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
      const bm = buildingMaterial(this.uni);
      this.mats.push(bm);
      const im = inst(bg, bm, this.buildings, (b) => M4.compose(p.set(b.x, b.base, b.z), q.identity(), s.set(b.w, b.h, b.d)));
      this.buildings.forEach((b, i) => im.setColorAt(i, col.set(b.color)));
      im.instanceColor.needsUpdate = true;
    }
    if (this.roofs.length) {
      const rg = prismGeo();
      const rm = new THREE.MeshStandardMaterial({ roughness: 0.75 });
      this.mats.push(rm);
      const im = inst(rg, rm, this.roofs, (b) => { e.set(0, b.rot, 0); q.setFromEuler(e); M4.compose(p.set(b.x, b.base, b.z), q, b.rot ? s.set(b.d, b.h, b.w) : s.set(b.w, b.h, b.d)); });
      this.roofs.forEach((b, i) => im.setColorAt(i, col.set(b.color)));
      im.instanceColor.needsUpdate = true;
    }
    if (this.hangars && this.hangars.length) {
      const hg = new THREE.CylinderGeometry(36, 36, 72, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      const hm = new THREE.MeshStandardMaterial({ color: 0x9da3a6, roughness: 0.55, metalness: 0.6 });
      this.mats.push(hm);
      inst(hg, hm, this.hangars, (h) => { e.set(0, h.rot + Math.PI / 2, 0); q.setFromEuler(e); M4.compose(p.set(h.x, h.y - 14, h.z), q, s.set(1, 1, 1)); });
    }
    // Neon-Leisten
    if (this.neon.length) {
      const list = [];
      for (const n of this.neon) {
        list.push({ x: n.x, y: n.y, z: n.z - n.d / 2 - 0.2, sx: n.w + 0.6, sz: 0.3, c: n.color }, { x: n.x, y: n.y, z: n.z + n.d / 2 + 0.2, sx: n.w + 0.6, sz: 0.3, c: n.color },
          { x: n.x - n.w / 2 - 0.2, y: n.y, z: n.z, sx: 0.3, sz: n.d + 0.6, c: n.color }, { x: n.x + n.w / 2 + 0.2, y: n.y, z: n.z, sx: 0.3, sz: n.d + 0.6, c: n.color });
      }
      this.neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.mats.push(this.neonMat);
      const im = inst(new THREE.BoxGeometry(1, 0.45, 1), this.neonMat, list, (b) => M4.compose(p.set(b.x, b.y, b.z), q.identity(), s.set(b.sx, 1, b.sz)), false);
      list.forEach((b, i) => im.setColorAt(i, col.set(b.c)));
      im.instanceColor.needsUpdate = true;
    }
    // Bäume
    const tg = treeGeos();
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    this.mats.push(treeMat);
    for (const type in this.trees) {
      const list = this.trees[type];
      if (!list.length) continue;
      const rr = rng(list.length + type.length);
      inst(tg[type], treeMat, list, (t) => { e.set(0, rr() * 6.28, 0); q.setFromEuler(e); M4.compose(p.set(t[0], this.groundAt(t[0], t[1]) - 0.2, t[1]), q, s.setScalar(t[2])); }, Q.treeShadow);
    }
    // Laternen
    if (this.lamps.length) {
      const pole = merge([place(new THREE.CylinderGeometry(0.12, 0.16, 8, 6), 0, 4, 0), place(new THREE.BoxGeometry(0.15, 0.15, 2.2), 0, 7.9, -1.0)]);
      const pm = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.5 });
      this.lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
      this.poolMat = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,210,150,0.9)', 'rgba(255,190,120,0)'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.mats.push(pm, this.lampMat, this.poolMat);
      const yawOf = (l) => Math.atan2(-l[0] + 0, 1) * 0;
      inst(pole, pm, this.lamps, (l) => { e.set(0, l[0] % 2 ? Math.PI : 0, 0); q.setFromEuler(e); M4.compose(p.set(l[0], l[2], l[1]), q, s.setScalar(1)); }, false);
      inst(new THREE.BoxGeometry(0.5, 0.18, 0.9), this.lampMat, this.lamps, (l) => { const sg = l[0] % 2 ? -1 : 1; M4.compose(p.set(l[0], l[2] + 7.75, l[1] - 2.0 * sg), q.identity(), s.setScalar(1)); }, false);
      inst(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), this.poolMat, this.lamps, (l) => { const sg = l[0] % 2 ? -1 : 1; M4.compose(p.set(l[0], l[2] + 0.25, l[1] - 2.0 * sg), q.identity(), s.setScalar(1)); }, false);
      void yawOf;
    }
    if (this.runwayLights.length) {
      this.rwyMat = [new THREE.MeshBasicMaterial({ color: 0xfff1d0 }), new THREE.MeshBasicMaterial({ color: 0x30ff60 }), new THREE.MeshBasicMaterial({ color: 0xff3030 })];
      this.mats.push(...this.rwyMat);
      for (let t = 0; t < 3; t++) {
        const list = this.runwayLights.filter((l) => l[3] === t);
        inst(new THREE.SphereGeometry(0.35, 6, 4), this.rwyMat[t], list, (l) => M4.compose(p.set(l[0], l[1], l[2]), q.identity(), s.setScalar(1)), false);
      }
    }
  }

  /* --- Übersichtskarte --- */
  buildMap() {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = -this.half + ((x + 0.5) / S) * this.half * 2, wz = -this.half + ((y + 0.5) / S) * this.half * 2;
      const h = this.heightAt(wx, wz);
      let r, gg, b;
      if (this.hasWater && h < this.water - 0.3) { const d = clamp((this.water - h) / 20, 0, 1); r = 40 - d * 20; gg = 120 - d * 50; b = 170 - d * 40; }
      else {
        const rel = h - (this.def.id === 'alpen' ? 600 : 0);
        const t = clamp(rel / 1500, 0, 1);
        r = 92 + t * 110; gg = 122 + t * 70; b = 76 + t * 120;
        if (this.def.id === 'sierra' && wx > 900) { r = 190; gg = 160; b = 110; }
        if (h > this.def.snow) { r = gg = b = 235; }
      }
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const k = S / (this.half * 2), X = (v) => (v + this.half) * k;
    g.fillStyle = 'rgba(70,70,74,0.9)';
    for (const gr of this.grids) g.fillRect(X(gr.x0 - gr.road), X(gr.z0 - gr.road), (gr.x1 - gr.x0 + gr.road * 2) * k, (gr.z1 - gr.z0 + gr.road * 2) * k);
    g.fillStyle = 'rgba(200,200,205,0.85)';
    for (const b of this.buildings) if (b.h > 4) g.fillRect(X(b.x - b.w / 2), X(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
    g.strokeStyle = '#f2d36b'; g.lineWidth = 2;
    for (const s of this.roadSegs) { g.beginPath(); g.moveTo(X(s.ax), X(s.az)); g.lineTo(X(s.bx), X(s.bz)); g.stroke(); }
    for (const b of this.bridges) { g.beginPath(); g.moveTo(X(b.a[0]), X(b.a[1])); g.lineTo(X(b.b[0]), X(b.b[1])); g.stroke(); }
    g.fillStyle = '#222';
    for (const r of this.roadRects) {
      g.save(); g.translate(X(r.x), X(r.z)); g.rotate(-Math.atan2(r.s, r.c)); g.fillRect(-r.hw * k, -r.hl * k, Math.max(2, r.hw * 2 * k), r.hl * 2 * k); g.restore();
    }
    this.mapCanvas = c;
  }

  randomRoadPoint() {
    const g = this.grids[0], r = this.r;
    const i = 1 + Math.floor(r() * (g.xs.length - 2)), j = 1 + Math.floor(r() * (g.zs.length - 2));
    return { x: g.xs[i] + g.road / 4, z: g.zs[j] + (g.block + g.road) / 2, yaw: 0 };
  }
  cityCenter(lane = false) {
    const g = this.grids[0];
    const i = Math.floor(g.xs.length / 2), j = Math.floor(g.zs.length / 2);
    return { x: lane ? g.xs[i] - g.road / 4 : g.xs[i] + g.road / 2 + 3, z: g.zs[j] + (g.block + g.road) / 2, yaw: Math.PI };
  }

  update(dt, env, focus, player) {
    const n = env.night;
    this.uni.uNight.value = n;
    if (this.lampMat) { this.lampMat.color.setRGB(1, 0.86, 0.62).multiplyScalar(0.4 + n * 4); this.poolMat.opacity = n * 0.55; }
    if (this.neonMat) this.neonMat.color.setScalar(0.7 + n * 3.2);
    if (this.rwyMat) { const k = 0.4 + n * 5; this.rwyMat[0].color.setRGB(1, 0.94, 0.8).multiplyScalar(k); this.rwyMat[1].color.setRGB(0.2, 1, 0.4).multiplyScalar(k); this.rwyMat[2].color.setRGB(1, 0.2, 0.2).multiplyScalar(k); }
    if (this.ferris) { this.ferris.children[0].rotation.z += dt * 0.05; this.ferris.rotation.z += 0; this.ferrisMat.emissiveIntensity = 0.3 + n * 3; this.ferris.rotateZ(dt * 0.04); }
    this.traffic.update(dt, focus, player);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats) { if (m.map) m.map.dispose(); m.dispose(); }
    this.depthTex.dispose();
    this.traffic.dispose();
  }
}

/* ---------- Verkehr ---------- */
const TRAFFIC_TYPES = [
  { body: { L: 4.6, W: 1.85, clr: 0.15, noseH: 0.78, beltF: 0.95, beltH: 0.98, beltR: -1.3, tailH: 1.0, roofH: 1.45, roofF: 0.25, roofR: -0.95, wf: 1.4, wr: -1.35, wheelR: 0.33, wheelW: 0.24 }, color: 0xffffff },
  { body: { L: 4.8, W: 1.95, clr: 0.25, noseH: 0.95, beltF: 1.05, beltH: 1.12, beltR: -2.2, cabR: -2.25, tailH: 1.15, roofH: 1.75, roofF: 0.45, roofR: -2.2, wf: 1.5, wr: -1.45, wheelR: 0.38, wheelW: 0.26, boxy: true }, color: 0xffffff },
  { body: { L: 4.3, W: 1.78, clr: 0.15, noseH: 0.75, beltF: 0.9, beltH: 0.95, beltR: -1.7, cabR: -1.75, tailH: 1.0, roofH: 1.48, roofF: 0.2, roofR: -1.65, wf: 1.3, wr: -1.3, wheelR: 0.31, wheelW: 0.22 }, color: 0xffffff },
];
const TCOL = [0xd9d9d9, 0x1d1e22, 0x7a7d82, 0x9b1b1b, 0x173d78, 0xf2f2ee, 0x3c5a3a, 0xe0b830, 0x5a3b2a, 0xb0b8c0, 0x2e7fbf];

class Traffic {
  constructor(world, count) {
    this.world = world;
    this.group = new THREE.Group();
    this.cars = [];
    this.meshes = [];
    const grid = world.grids.find((g) => g.xs.length > 2 && g.zs.length > 2);
    if (!grid || !count) return;
    this.g = grid;
    const r = rng(world.def.seed + 99);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 });
    this.mat = mat;
    const per = Math.ceil(count / TRAFFIC_TYPES.length);
    TRAFFIC_TYPES.forEach((t, ti) => {
      const geo = buildCar({ body: t.body, color: 0xffffff }, { simple: true });
      const im = new THREE.InstancedMesh(geo, mat, per);
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      this.meshes.push(im);
      for (let k = 0; k < per; k++) {
        im.setColorAt(k, new THREE.Color(TCOL[Math.floor(r() * TCOL.length)]));
        const c = { im, k, speed: 11 + r() * 6, v: 0, wait: 0 };
        this.spawn(c, r);
        this.cars.push(c);
      }
      im.instanceColor.needsUpdate = true;
    });
    this.lane = grid.road * 0.24;
    this.M = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }
  spawn(c, r) {
    const g = this.g;
    const alongX = r() < 0.5;
    c.dir = alongX ? [r() < 0.5 ? 1 : -1, 0] : [0, r() < 0.5 ? 1 : -1];
    c.i = 1 + Math.floor(r() * (g.xs.length - 2)); c.j = 1 + Math.floor(r() * (g.zs.length - 2));
    // Startpunkt zwischen Knoten (i,j) und dem nächsten in Fahrtrichtung
    const lane = g.road * 0.24;
    const nx = g.xs[c.i], nz = g.zs[c.j];
    c.x = nx + c.dir[0] * (g.block / 2) + -c.dir[1] * lane; c.z = nz + c.dir[1] * (g.block / 2) + c.dir[0] * lane;
    c.ti = c.i + c.dir[0]; c.tj = c.j + c.dir[1];
    c.turn = null;
  }
  update(dt, focus, player) {
    if (!this.g) return;
    const g = this.g, lane = this.lane, H = g.h + 0.1;
    const r = Math.random;
    for (const c of this.cars) {
      // Hindernis voraus? (Spieler)
      let block = false;
      if (player) {
        const dx = player.x - c.x, dz = player.z - c.z;
        const ahead = dx * (c.turn ? c.hx : c.dir[0]) + dz * (c.turn ? c.hz : c.dir[1]);
        const side = Math.abs(dx * (c.turn ? c.hz : c.dir[1]) - dz * (c.turn ? c.hx : c.dir[0]));
        if (ahead > 0 && ahead < 14 && side < 3.2) block = true;
      }
      if (c.wait > 0) { c.wait -= dt; block = true; }
      c.v += ((block ? 0 : c.speed) - c.v) * Math.min(1, dt * (block ? 4 : 1.2));
      let step = c.v * dt;
      if (c.turn) {
        const t = c.turn;
        t.t += step / t.len;
        const u = Math.min(t.t, 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
        const nx = a * t.p0[0] + b * t.p1[0] + d * t.p2[0], nz = a * t.p0[1] + b * t.p1[1] + d * t.p2[1];
        const hx = nx - c.x, hz = nz - c.z, hl = Math.hypot(hx, hz);
        if (hl > 1e-4) { c.hx = hx / hl; c.hz = hz / hl; }
        c.x = nx; c.z = nz;
        if (t.t >= 1) { c.turn = null; c.dir = t.d2; c.i = t.ni; c.j = t.nj; c.ti = c.i + c.dir[0]; c.tj = c.j + c.dir[1]; }
      } else {
        c.x += c.dir[0] * step; c.z += c.dir[1] * step; c.hx = c.dir[0]; c.hz = c.dir[1];
        const tx = g.xs[c.ti], tz = g.zs[c.tj];
        const rem = c.dir[0] ? (tx - c.x) * c.dir[0] : (tz - c.z) * c.dir[1];
        if (rem <= g.road / 2 + 1) {
          // Kreuzung: Richtung wählen
          const opts = [];
          const d1 = c.dir;
          const cand = [d1, [-d1[1], d1[0]], [d1[1], -d1[0]]];
          for (const d of cand) { const ni = c.ti + d[0], nj = c.tj + d[1]; if (ni >= 0 && ni < g.xs.length && nj >= 0 && nj < g.zs.length) opts.push(d); }
          if (!opts.length) opts.push([-d1[0], -d1[1]]);
          const d2 = opts[Math.floor(r() * opts.length)];
          const nx = tx, nz = tz;
          const R = (d) => [-d[1] * lane, d[0] * lane];
          const r1 = R(d1), r2 = R(d2);
          const p0 = [c.x, c.z];
          const p2 = [nx + r2[0] + d2[0] * (g.road / 2 + 1), nz + r2[1] + d2[1] * (g.road / 2 + 1)];
          const straight = d1[0] === d2[0] && d1[1] === d2[1];
          const p1 = straight ? [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2] : d1[0] === -d2[0] && d1[1] === -d2[1] ? [nx + d1[0] * g.road, nz + d1[1] * g.road] : [nx + r1[0] + r2[0], nz + r1[1] + r2[1]];
          const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
          c.turn = { p0, p1, p2, t: 0, len: Math.max(len, 1), d2, ni: c.ti, nj: c.tj };
        }
      }
      const yaw = Math.atan2(-c.hx, -c.hz);
      this.e.set(0, yaw, 0); this.q.setFromEuler(this.e);
      this.M.compose(this.p.set(c.x, H, c.z), this.q, this.s);
      c.im.setMatrixAt(c.k, this.M);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
  /* Kollision des Spieler-Autos mit Verkehr */
  bump(p, radius) {
    let hit = null;
    for (const c of this.cars) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
      if (d < radius + 1.9 && d > 1e-3 && Math.abs(p.y - this.g.h) < 3) {
        const push = radius + 1.9 - d;
        hit = { x: (dx / d) * push, z: (dz / d) * push };
        c.wait = 3;
      }
    }
    return hit;
  }
  dispose() {
    for (const im of this.meshes) im.geometry.dispose();
    if (this.mat) this.mat.dispose();
  }
}
