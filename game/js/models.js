/* JZo World – 3D-Modelle: Materialien, Spielfigur (Jan), Autos, Flugzeuge */
import * as THREE from 'three';
import { merge, place, creased, tint, clamp, smooth, DEG, canvasTex } from './util.js';

/* ---------- Materialien ---------- */
export let MAT = null;
let HIGH = true;
const paintCache = new Map();

export function initMaterials(high) {
  HIGH = high;
  paintCache.clear();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => (high ? new THREE.MeshPhysicalMaterial(o) : std({ color: o.color, metalness: o.metalness, roughness: o.roughness, transparent: !!o.transparent, opacity: o.opacity ?? 1 }));
  MAT = {
    glass: phys({ color: 0x0a0f15, metalness: 0.3, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02 }),
    canopy: phys({ color: 0x3a4a58, metalness: 0.5, roughness: 0.02, transparent: true, opacity: 0.5, clearcoat: 1 }),
    trim: std({ color: 0x141414, roughness: 0.65, metalness: 0.2 }),
    tire: std({ color: 0x171717, roughness: 0.9 }),
    rim: std({ color: 0xb9bdc3, metalness: 1, roughness: 0.2 }),
    darkRim: std({ color: 0x2a2c30, metalness: 0.9, roughness: 0.3 }),
    chrome: std({ color: 0xe0e0e0, metalness: 1, roughness: 0.07 }),
    metal: std({ color: 0x8d9299, metalness: 0.8, roughness: 0.4 }),
    head: std({ color: 0xffffff, emissive: 0xfff2dd, emissiveIntensity: 2.5 }),
    tail: std({ color: 0x400000, emissive: 0xff1418, emissiveIntensity: 1.6 }),
    navR: std({ color: 0x300000, emissive: 0xff2020, emissiveIntensity: 3 }),
    navG: std({ color: 0x003000, emissive: 0x20ff40, emissiveIntensity: 3 }),
    strobe: std({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 0 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    nitro: new THREE.MeshBasicMaterial({ color: 0x4f8bff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    propDisc: new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    intake: std({ color: 0x050505, roughness: 1 }),
    // Spielfigur
    skin: std({ color: 0xd8a088, roughness: 0.6 }),
    hair: std({ color: 0x2a221e, roughness: 0.85 }),
    beard: std({ color: 0x3a2d26, roughness: 0.95 }),
    hoodie: std({ color: 0x3c4046, roughness: 0.92 }),
    hoodieDark: std({ color: 0x30343a, roughness: 0.95 }),
    white: std({ color: 0xf2f2f2, roughness: 0.5 }),
    jeans: std({ color: 0x27303f, roughness: 0.85 }),
    shoe: std({ color: 0x1d1d1f, roughness: 0.6 }),
    frame: std({ color: 0x1b2436, roughness: 0.35, metalness: 0.6 }),
    eye: std({ color: 0x1a120e, roughness: 0.3 }),
    lip: std({ color: 0xa8645a, roughness: 0.6 }),
    helmet: std({ color: 0xd9d9d0, roughness: 0.4 }),
    visor: std({ color: 0x111111, roughness: 0.05, metalness: 0.8 }),
  };
  return MAT;
}

export function paint(color, opts = {}) {
  const key = color + '|' + (opts.matte ? 1 : 0) + '|' + (opts.metal || 0);
  if (paintCache.has(key)) return paintCache.get(key);
  let m;
  if (opts.matte) m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.05 });
  else if (HIGH) m = new THREE.MeshPhysicalMaterial({ color, metalness: opts.metal ?? 0.55, roughness: opts.rough ?? 0.32, clearcoat: 1, clearcoatRoughness: 0.05 });
  else m = new THREE.MeshStandardMaterial({ color, metalness: opts.metal ?? 0.55, roughness: opts.rough ?? 0.3 });
  paintCache.set(key, m);
  return m;
}

/* Sammelt Geometrien je Material und baut daraus wenige Meshes (spart Zeichenaufrufe) */
class Parts {
  constructor() { this.map = new Map(); }
  add(mat, geo) { if (!this.map.has(mat)) this.map.set(mat, []); this.map.get(mat).push(geo); return geo; }
  build(group, shadow = true) {
    for (const [mat, geos] of this.map) {
      const mesh = new THREE.Mesh(merge(geos), mat);
      mesh.castShadow = shadow && !mat.transparent;
      mesh.receiveShadow = !mat.transparent;
      group.add(mesh);
    }
    return group;
  }
  buildColored(colorOf) {
    const all = [];
    for (const [mat, geos] of this.map) for (const g of geos) all.push(tint(g.index ? g.toNonIndexed() : g, colorOf(mat)));
    return merge(all, true);
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

/* ---------- Spielfigur: Jan ---------- */
export function buildCharacter() {
  const root = new THREE.Group();
  const M = MAT;
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };

  // Oberkörper (Kapuzenpulli, kräftige Statur)
  const torso = new THREE.Group();
  torso.position.y = 0.92;
  root.add(torso);
  const body = mk(new THREE.CapsuleGeometry(0.235, 0.32, 6, 16), M.hoodie);
  body.scale.set(1.28, 1, 0.92); body.position.y = 0.3; torso.add(body);
  const belly = mk(sph(0.23, 18, 12), M.hoodie); belly.scale.set(1.15, 0.95, 0.95); belly.position.set(0, 0.17, -0.06); torso.add(belly);
  const hem = mk(cyl(0.29, 0.28, 0.08, 18), M.hoodieDark); hem.scale.z = 0.86; hem.position.y = 0.0; torso.add(hem);
  // Reißverschluss + Kordeln (weiß)
  const zip = mk(box(0.022, 0.5, 0.02), M.white); zip.position.set(0, 0.28, -0.262); zip.rotation.x = -0.12; torso.add(zip);
  const pull = mk(box(0.03, 0.06, 0.012), M.white); pull.position.set(0, 0.4, -0.27); torso.add(pull);
  for (const s of [-1, 1]) {
    const cord = mk(cyl(0.009, 0.009, 0.24, 6), M.white); cord.position.set(s * 0.075, 0.5, -0.215); cord.rotation.x = -0.12; torso.add(cord);
    const tip = mk(cyl(0.016, 0.016, 0.045, 8), M.white); tip.position.set(s * 0.075, 0.37, -0.232); torso.add(tip);
  }
  // Kapuze im Nacken
  const hood = mk(new THREE.TorusGeometry(0.15, 0.065, 8, 16), M.hoodie); hood.rotation.x = Math.PI / 2 - 0.4; hood.position.set(0, 0.6, 0.06); hood.scale.set(1.25, 1, 1); torso.add(hood);

  // Kopf
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  const neck = mk(cyl(0.075, 0.085, 0.12, 12), M.skin); neck.position.y = -0.04; head.add(neck);
  const skull = mk(sph(0.128, 24, 18), M.skin); skull.scale.set(1.06, 1.12, 1.06); skull.position.y = 0.13; head.add(skull);
  const jaw = mk(sph(0.118, 20, 14), M.skin); jaw.scale.set(1.1, 0.8, 1.0); jaw.position.set(0, 0.06, -0.012); head.add(jaw);
  const chin2 = mk(sph(0.09, 16, 10), M.skin); chin2.scale.set(1.25, 0.7, 1.0); chin2.position.set(0, 0.02, -0.02); head.add(chin2);
  const hair = mk(new THREE.SphereGeometry(0.137, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.43), M.hair);
  hair.scale.set(1.07, 1.1, 1.1); hair.position.set(0, 0.155, 0.012); hair.rotation.x = 0.22; head.add(hair);
  const hairBack = mk(new THREE.SphereGeometry(0.136, 20, 12, 0, Math.PI, 0, Math.PI * 0.62), M.hair);
  hairBack.scale.set(1.07, 1.1, 1.08); hairBack.position.set(0, 0.13, 0.01); hairBack.rotation.y = Math.PI / 2; hairBack.rotation.z = 0; head.add(hairBack);
  for (const s of [-1, 1]) {
    const ear = mk(sph(0.03, 10, 8), M.skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(s * 0.138, 0.12, 0.0); head.add(ear);
    const eye = mk(sph(0.014, 10, 8), M.eye); eye.position.set(s * 0.046, 0.14, -0.128); head.add(eye);
    const brow = mk(box(0.05, 0.011, 0.012), M.hair); brow.position.set(s * 0.048, 0.178, -0.13); brow.rotation.z = s * -0.08; head.add(brow);
    // Brille: dünner, eckiger Rahmen
    const lx = s * 0.05, ly = 0.14, lz = -0.142;
    for (const [w, h, x, y] of [[0.066, 0.006, 0, 0.022], [0.066, 0.006, 0, -0.019], [0.006, 0.047, -0.033, 0.0015], [0.006, 0.047, 0.033, 0.0015]]) {
      const f = mk(box(w, h, 0.006), M.frame); f.position.set(lx + x, ly + y, lz); head.add(f);
    }
    const temple = mk(box(0.005, 0.006, 0.14), M.frame); temple.position.set(s * 0.134, 0.158, -0.075); head.add(temple);
  }
  const bridge = mk(box(0.03, 0.005, 0.006), M.frame); bridge.position.set(0, 0.155, -0.143); head.add(bridge);
  const nose = mk(sph(0.024, 10, 8), M.skin); nose.scale.set(0.9, 1.25, 1.1); nose.position.set(0, 0.105, -0.142); head.add(nose);
  const stache = mk(new THREE.TorusGeometry(0.035, 0.0075, 6, 12, Math.PI), M.beard); stache.position.set(0, 0.072, -0.128); stache.rotation.x = 0.15; head.add(stache);
  const lip = mk(box(0.04, 0.006, 0.01), M.lip); lip.position.set(0, 0.06, -0.128); head.add(lip);
  const goatee = mk(sph(0.03, 10, 8), M.beard); goatee.scale.set(1.2, 0.9, 0.5); goatee.position.set(0, 0.022, -0.115); head.add(goatee);

  // Arme
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.33, 0.55, 0); torso.add(pivot);
    const up = mk(new THREE.CapsuleGeometry(0.085, 0.25, 4, 10), M.hoodie); up.position.y = -0.17; pivot.add(up);
    const low = mk(new THREE.CapsuleGeometry(0.075, 0.24, 4, 10), M.hoodie); low.position.y = -0.43; pivot.add(low);
    const cuff = mk(cyl(0.07, 0.07, 0.05, 10), M.hoodieDark); cuff.position.y = -0.58; pivot.add(cuff);
    const hand = mk(sph(0.055, 12, 10), M.skin); hand.scale.set(0.85, 1.15, 0.9); hand.position.y = -0.65; pivot.add(hand);
    pivot.rotation.z = s * 0.1;
    arms.push(pivot);
  }
  // Beine
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.125, 0.92, 0); root.add(pivot);
    const leg = mk(new THREE.CapsuleGeometry(0.105, 0.62, 4, 10), M.jeans); leg.position.y = -0.42; pivot.add(leg);
    const shoe = mk(box(0.13, 0.09, 0.28), M.shoe); shoe.position.set(0, -0.86, -0.05); pivot.add(shoe);
    const sole = mk(box(0.135, 0.025, 0.29), M.white); sole.position.set(0, -0.9, -0.05); pivot.add(sole);
    legs.push(pivot);
  }
  const hips = mk(cyl(0.25, 0.24, 0.16, 16), M.jeans); hips.scale.z = 0.8; hips.position.y = 0.92; root.add(hips);

  root.userData = { torso, head, arms, legs, phase: 0 };
  return root;
}

export function animateCharacter(ch, speed, dt, air) {
  const u = ch.userData;
  if (air) {
    u.legs[0].rotation.x = -0.3; u.legs[1].rotation.x = 0.2;
    u.arms[0].rotation.x = -2.6; u.arms[1].rotation.x = -2.6;
    return;
  }
  u.phase += dt * (2 + speed * 1.55);
  const amp = clamp(speed / 4, 0, 1) * (speed > 5 ? 0.85 : 0.55);
  const s = Math.sin(u.phase);
  u.legs[0].rotation.x = s * amp; u.legs[1].rotation.x = -s * amp;
  u.arms[0].rotation.x = -s * amp * 0.9; u.arms[1].rotation.x = s * amp * 0.9;
  u.torso.position.y = 0.92 + Math.abs(Math.cos(u.phase)) * amp * 0.05 + Math.sin(performance.now() / 700) * 0.004;
  u.torso.rotation.x = speed > 5 ? -0.12 : 0;
}

export function buildParachute() {
  const g = new THREE.Group();
  const tex = canvasTex(256, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f4f4f4' : '#e8432b'; c.fillRect((i * w) / 8, 0, w / 8 + 1, h); } });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.set(1.3, 0.75, 0.8);
  canopy.position.y = 3.2;
  canopy.castShadow = true;
  g.add(canopy);
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    pts.push(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(Math.cos(a) * 1.85 * 1.3, 4.2, Math.sin(a) * 1.85 * 0.8));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  return g;
}

/* ---------- Autos ---------- */
function extrudeProfile(points, width, bevel, taperFn) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 6 });
  geo.translate(0, 0, -width / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setZ(i, z * taperFn(x, y));
  }
  geo.rotateY(Math.PI / 2); // Profil-Vorderseite (+x) zeigt nach -z (vorne)
  return creased(geo, 38);
}

function wheel(r, w, rimMat, P) {
  // Rad als eigene Gruppe (dreht sich), Achse entlang x
  const g = new THREE.Group();
  const tire = new THREE.Mesh(cyl(r, r, w, 22).rotateZ(Math.PI / 2), MAT.tire);
  tire.castShadow = true;
  g.add(tire);
  const rimGeo = merge([
    cyl(r * 0.68, r * 0.68, w + 0.02, 18).rotateZ(Math.PI / 2),
    ...[0, 1, 2, 3, 4].map((i) => place(box(w + 0.04, r * 1.2, 0.06), 0, 0, 0, i * (Math.PI / 5) * 2, 0, 0)),
  ]);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  g.add(rim);
  const hub = new THREE.Mesh(cyl(r * 0.18, r * 0.18, w + 0.06, 10).rotateZ(Math.PI / 2), MAT.chrome);
  g.add(hub);
  return g;
}

export function buildCar(def, opts = {}) {
  const s = def.body;
  const L = s.L, W = s.W;
  const P = new Parts();
  const body = paint(def.color, { matte: def.matte });
  const lower = [
    [-L / 2, s.clr + 0.14], [-L / 2 + 0.12, s.clr], [L / 2 - 0.3, s.clr], [L / 2, s.clr + 0.16],
    [L / 2, s.noseH], [s.beltF, s.beltH], [s.beltR, s.beltH + 0.02], [-L / 2, s.tailH],
  ];
  const sideTaper = (x, y) => {
    const f = smooth(L / 2 - 0.8, L / 2, x), r = smooth(-L / 2 + 0.6, -L / 2, x), b = smooth(s.clr + 0.3, s.clr, y);
    return (1 - (s.boxy ? 0.03 : 0.12) * f) * (1 - 0.05 * r) * (1 - 0.06 * b);
  };
  P.add(body, extrudeProfile(lower, W - 0.16, 0.08, sideTaper));
  // Glas-Kabine
  const cabW = W - (s.boxy ? 0.2 : 0.32);
  const cab = [[s.beltF + 0.04, s.beltH - 0.08], [s.roofF, s.roofH], [s.roofR, s.roofH - 0.01], [s.cabR ?? s.beltR - 0.02, s.beltH - 0.08]];
  const cabTaper = (x, y) => 1 - (s.boxy ? 0.06 : 0.2) * clamp((y - s.beltH) / (s.roofH - s.beltH), 0, 1);
  P.add(MAT.glass, extrudeProfile(cab, cabW, 0.04, cabTaper));
  // Dach in Wagenfarbe
  const rw = cabW * (s.boxy ? 0.94 : 0.8) + 0.04;
  const roof = place(box(Math.abs(s.roofF - s.roofR) - 0.08, 0.05, rw), 0, s.roofH + 0.025, 0, 0, Math.PI / 2, 0);
  roof.translate(0, 0, -((s.roofF + s.roofR) / 2));
  P.add(body, roof);
  if (s.pillars) {
    // A-Säulen (Geländewagen)
    for (const sd of [-1, 1]) P.add(body, place(box(0.09, s.roofH - s.beltH, 0.09), sd * (cabW / 2 - 0.02), (s.roofH + s.beltH) / 2, -s.beltF, 0, 0, 0));
    for (const sd of [-1, 1]) P.add(body, place(box(0.09, s.roofH - s.beltH, 0.12), sd * (cabW / 2 - 0.04), (s.roofH + s.beltH) / 2, -(s.roofF + s.roofR) / 2 + 0.3, 0, 0, 0));
  }
  // Spiegel
  for (const sd of [-1, 1]) P.add(body, place(box(0.22, 0.1, 0.12), sd * (W / 2 + 0.03), s.beltH + 0.05, -(s.beltF - 0.15)));
  // Scheinwerfer + Rückleuchten
  for (const sd of [-1, 1]) P.add(MAT.head, place(box(0.32, 0.07, 0.14), sd * (W / 2 - 0.36), s.noseH - 0.06, -(L / 2 - 0.08), s.headTilt || -0.25, 0, 0));
  P.add(MAT.tail, place(box(W - 0.35, 0.06, 0.06), 0, s.tailH - 0.13, L / 2 + 0.03));
  // Unterboden / Diffusor
  P.add(MAT.trim, place(box(W - 0.3, 0.12, L - 0.6), 0, s.clr + 0.05, 0));
  if (s.grille) P.add(def.chromeGrille ? MAT.chrome : MAT.trim, place(box(W * 0.62, (s.noseH - s.clr) * 0.55, 0.06), 0, (s.noseH + s.clr) / 2 + 0.05, -(L / 2 + 0.07)));
  if (s.bumper) { P.add(MAT.trim, place(box(W + 0.05, 0.22, 0.2), 0, s.clr + 0.18, -(L / 2 + 0.05))); P.add(MAT.trim, place(box(W + 0.05, 0.22, 0.2), 0, s.clr + 0.18, L / 2 + 0.05)); }
  if (s.intakes) for (const sd of [-1, 1]) P.add(MAT.intake, place(box(0.05, 0.22, 0.65), sd * (W / 2 - 0.02), s.beltH - 0.28, -(s.beltR + 0.15) - 0.1));
  if (s.wing) {
    P.add(MAT.trim, place(box(W - 0.25, 0.04, 0.32), 0, s.tailH + 0.28, L / 2 - 0.3));
    for (const sd of [-1, 1]) P.add(MAT.trim, place(box(0.04, 0.3, 0.12), sd * 0.5, s.tailH + 0.14, L / 2 - 0.28));
  }
  if (s.bed) {
    P.add(MAT.trim, place(box(W - 0.3, 0.55, L / 2 + s.beltR - 0.2), 0, s.beltH - 0.27 + 0.01, (-(s.beltR) + L / 2) / 2 + 0.05));
  }
  if (s.lightbar) P.add(MAT.head, place(box(W * 0.6, 0.06, 0.08), 0, s.roofH + 0.1, -(s.roofF - 0.15)));
  if (s.exhaust) for (const sd of [-1, 1]) P.add(MAT.chrome, place(cyl(0.05, 0.05, 0.18, 10), sd * 0.35, s.clr + 0.2, L / 2 + 0.06, Math.PI / 2, 0, 0));
  if (s.hatch) P.add(MAT.trim, place(box(0.7, 0.06, 0.7), 0, s.roofH + 0.06, -(s.roofF + s.roofR) / 2));
  if (s.spare) P.add(MAT.tire, place(cyl(0.38, 0.38, 0.25, 16), 0, s.tailH - 0.15, L / 2 + 0.15, Math.PI / 2, 0, 0));

  if (opts.simple) {
    // Einfache Version für Verkehr (ein Mesh mit Vertex-Farben, Räder fest)
    for (const [z, sd] of [[-s.wf, -1], [-s.wf, 1], [-s.wr, -1], [-s.wr, 1]]) {
      P.add(MAT.tire, place(cyl(s.wheelR, s.wheelR, s.wheelW, 12), sd * (W / 2 - s.wheelW / 2 + 0.02), s.wheelR, z, 0, 0, Math.PI / 2));
    }
    return P.buildColored((m) => (m === body ? 0xffffff : m === MAT.glass ? 0x0c1116 : m === MAT.head ? 0xfff8e8 : m === MAT.tail ? 0xff2020 : m === MAT.chrome ? 0xcccccc : 0x1a1a1a));
  }

  const g = new THREE.Group();
  P.build(g);
  const wheels = [];
  for (const [z, sd, front] of [[-s.wf, -1, true], [-s.wf, 1, true], [-s.wr, -1, false], [-s.wr, 1, false]]) {
    const holder = new THREE.Group();
    holder.position.set(sd * (W / 2 - s.wheelW / 2 + 0.02), s.wheelR, z);
    const w = wheel(s.wheelR, s.wheelW, def.darkRims ? MAT.darkRim : MAT.rim);
    holder.add(w);
    g.add(holder);
    wheels.push({ holder, spin: w, front });
  }
  // Nitro-Flammen
  const flames = [];
  for (const sd of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 10).rotateX(Math.PI / 2), MAT.nitro);
    f.position.set(sd * 0.35, s.clr + 0.2, L / 2 + 0.5);
    f.visible = false;
    g.add(f); flames.push(f);
  }
  g.userData = { wheels, flames };
  return g;
}

/* ---------- Flugzeuge ---------- */
function lathe(profile, len, R, sx = 1, sy = 1, segs = 22) {
  // profile: [[t, r]] t=0 Heck … 1 Nase
  const pts = profile.map(([t, r]) => new THREE.Vector2(Math.max(r * R, 0.001), t * len - len / 2));
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateX(-Math.PI / 2);
  g.scale(sx, sy, 1);
  return g;
}

function wingHalf(side, o) {
  // o: span (halbe Spannweite), root, tip, sweep, le (z der Vorderkante an der Wurzel), t (Dicke), y, dih (Grad), x0 (Wurzel-x)
  const s = side;
  const pts = [[0, o.le], [s * o.span, o.le + o.sweep], [s * o.span, o.le + o.sweep + o.tip], [0, o.le + o.root]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: o.t, bevelEnabled: true, bevelThickness: Math.min(0.04, o.t * 0.3), bevelSize: Math.min(0.06, o.t * 0.4), bevelSegments: 2 });
  g.rotateX(Math.PI / 2);
  g.translate(0, o.t / 2, 0);
  g.rotateZ(s * (o.dih || 0) * DEG);
  g.translate(s * (o.x0 || 0), o.y || 0, 0);
  return g;
}

function fin(o) {
  // o: h, root, tip, sweep, z (Wurzel-Vorderkante), t, x, y, cant (Grad, nach außen)
  const pts = [[o.z, 0], [o.z + o.sweep, o.h], [o.z + o.sweep + o.tip, o.h], [o.z + o.root, 0]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: o.t, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.04, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(o.t / 2, 0, 0);
  if (o.cant) g.rotateZ(-Math.sign(o.x || 1) * o.cant * DEG);
  g.translate(o.x || 0, o.y || 0, 0);
  return g;
}

function nacelle(r, len, x, y, z, P, bodyMat, opts = {}) {
  P.add(bodyMat, place(cyl(r * (opts.taper ?? 0.9), r, len, 18), x, y, z, Math.PI / 2, 0, 0));
  P.add(MAT.intake, place(cyl(r * 0.85, r * 0.85, 0.05, 16), x, y, z - len / 2 - 0.01, Math.PI / 2, 0, 0));
  if (opts.nozzle) P.add(MAT.metal, place(cyl(r * 0.75, r * 0.85, 0.5, 16), x, y, z + len / 2 + 0.2, Math.PI / 2, 0, 0));
}

function star(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
    if (i) s.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, -Math.sin(a) * rr);
  }
  return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
}

/* Baut ein Flugzeug nach Definition. Vorne = -z, rechts = +x, oben = +y */
export function buildAircraft(def) {
  const P = new Parts();
  const g = new THREE.Group();
  const bodyMat = paint(def.color, { metal: def.metal, rough: def.rough, matte: def.matte });
  const accent = def.accent ? paint(def.accent) : bodyMat;
  const props = [], flames = [], navStrobe = [], sweepers = [];
  const gear = new THREE.Group();
  const a = def.model;

  // Rumpf
  const fus = lathe(a.profile, a.len, a.R, a.sx || 1, a.sy || 1);
  if (a.upsweep) {
    const p = fus.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > a.upsweep[0]) p.setY(i, p.getY(i) + (z - a.upsweep[0]) * a.upsweep[1]); }
    fus.computeVertexNormals();
  }
  P.add(bodyMat, fus);
  if (a.noseCone) P.add(a.noseConeMat === 'dark' ? MAT.trim : bodyMat, place(new THREE.ConeGeometry(a.noseCone[0], a.noseCone[1], 16).rotateX(-Math.PI / 2), 0, a.noseCone[2] || 0, -a.len / 2 - a.noseCone[1] / 2 + 0.05));
  // Cockpit / Kabinenfenster
  if (a.canopy) {
    const [cz, cl, cw, ch, cy] = a.canopy;
    const can = new THREE.Mesh(place(sph(1, 22, 14), 0, 0, 0, 0, 0, 0, cw / 2, ch, cl / 2), MAT.canopy);
    can.position.set(0, cy, cz);
    g.add(can);
    // Pilot mit Helm
    const helmet = new THREE.Mesh(sph(0.16, 14, 10), MAT.helmet); helmet.position.set(0, cy + ch * 0.25, cz + cl * 0.05); g.add(helmet);
    const visor = new THREE.Mesh(place(sph(0.12, 12, 8), 0, 0, 0, 0, 0, 0, 1, 0.6, 0.6), MAT.visor); visor.position.set(0, cy + ch * 0.25, cz + cl * 0.05 - 0.1); g.add(visor);
    if (a.twoSeat) { const h2 = helmet.clone(); h2.position.z += cl * 0.32; g.add(h2); }
  }
  if (a.windshield) {
    const [wz, wy, ww, wh] = a.windshield;
    P.add(MAT.glass, place(box(ww, wh, 0.9), 0, wy, wz, -0.75, 0, 0));
  }
  if (a.windows) {
    const [z0, z1, y, n, xr, sz] = a.windows;
    for (let i = 0; i < n; i++) {
      const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
      for (const sd of [-1, 1]) P.add(MAT.glass, place(box(0.06, sz, sz * 0.8), sd * xr, y, z));
    }
  }
  if (a.stripe) {
    const [y, z0, z1, xr, h] = a.stripe;
    for (const sd of [-1, 1]) P.add(accent, place(box(0.04, h, z1 - z0), sd * xr, y, (z0 + z1) / 2));
  }

  // Flügel
  for (const w of a.wings || []) {
    if (w.swing) {
      for (const sd of [-1, 1]) {
        const piv = new THREE.Group();
        piv.position.set(sd * w.x0, w.y, w.pivotZ);
        const geo = wingHalf(sd, { ...w, x0: 0, y: 0, le: -w.root * 0.3 });
        const m = new THREE.Mesh(geo, bodyMat); m.castShadow = true; piv.add(m);
        g.add(piv);
        sweepers.push({ piv, side: sd, min: w.sweepMin, max: w.sweepMax });
      }
      continue;
    }
    for (const sd of [-1, 1]) P.add(w.mat === 'accent' ? accent : bodyMat, wingHalf(sd, w));
    if (w.winglet) for (const sd of [-1, 1]) P.add(bodyMat, fin({ h: w.winglet, root: w.tip, tip: w.tip * 0.5, sweep: w.tip * 0.6, z: w.le + w.sweep, t: 0.1, x: sd * (w.span + (w.x0 || 0)), y: (w.y || 0) + Math.sin((w.dih || 0) * DEG) * w.span, cant: 8 }));
    if (w.nav) {
      const tipX = w.span + (w.x0 || 0), tipY = (w.y || 0) + Math.sin((w.dih || 0) * DEG) * w.span, tipZ = w.le + w.sweep + w.tip * 0.4;
      P.add(MAT.navG, place(sph(0.09, 8, 6), tipX + 0.05, tipY, tipZ));
      P.add(MAT.navR, place(sph(0.09, 8, 6), -tipX - 0.05, tipY, tipZ));
    }
    if (w.rails) for (const sd of [-1, 1]) P.add(MAT.metal, place(cyl(0.07, 0.07, w.tip * 1.6, 8), sd * (w.span + (w.x0 || 0) + 0.06), w.y || 0, w.le + w.sweep + w.tip * 0.5, Math.PI / 2, 0, 0));
    if (w.struts) for (const sd of [-1, 1]) P.add(MAT.metal, place(cyl(0.04, 0.04, w.struts[0], 6), sd * w.struts[1], w.struts[2], w.le + w.root * 0.4, 0, 0, sd * w.struts[3]));
  }
  for (const f of a.fins || []) P.add(f.mat === 'accent' ? accent : bodyMat, fin(f));
  for (const st of a.strakes || []) for (const sd of [-1, 1]) {
    const shape = new THREE.Shape([new THREE.Vector2(0, st.z0), new THREE.Vector2(sd * st.w, st.z1), new THREE.Vector2(0, st.z1)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); geo.translate(sd * st.x, st.y + 0.04, 0);
    P.add(bodyMat, geo);
  }
  for (const b of a.boxes || []) P.add(b.mat === 'dark' ? MAT.intake : b.mat === 'trim' ? MAT.trim : bodyMat, place(box(b.w, b.h, b.d), b.x, b.y, b.z, b.rx || 0, 0, 0));
  for (const b of a.mirrorBoxes || []) for (const sd of [-1, 1]) P.add(b.mat === 'dark' ? MAT.intake : bodyMat, place(box(b.w, b.h, b.d), sd * b.x, b.y, b.z, b.rx || 0, 0, 0));
  if (a.insignia === 'star') for (const sd of [-1, 1]) {
    const s = star(0.5); const m = new THREE.Mesh(s, paint(0xc81e1e, { metal: 0.1 }));
    m.rotation.y = sd * Math.PI / 2; m.position.set(sd * 0.09, a.insigniaPos[1], a.insigniaPos[2]); g.add(m);
  }
  if (a.roundel) for (const sd of [-1, 1]) {
    const [x, y, z, r] = a.roundel;
    P.add(paint(0x23324a), place(cyl(r, r, 0.03, 20), sd * x, y + 0.04, z));
    P.add(paint(0xe6e6e6), place(cyl(r * 0.45, r * 0.45, 0.04, 20), sd * x, y + 0.045, z));
  }

  // Triebwerke
  for (const e of a.jets || []) {
    for (const x of e.xs) {
      if (e.nacelle) nacelle(e.r, e.len, x, e.y, e.z, P, e.mat === 'accent' ? accent : bodyMat, { nozzle: true, taper: 0.85 });
      if (e.pylon) P.add(bodyMat, place(box(Math.abs(x) - e.pylon, 0.15, e.len * 0.5), Math.sign(x) * (Math.abs(x) + e.pylon) / 2, e.y, e.z));
      const nz = e.nozzleZ ?? e.z + e.len / 2 + 0.2;
      if (!e.nacelle) P.add(MAT.metal, place(cyl(e.r * 0.8, e.r, 0.9, 16), x, e.y, nz - 0.3, Math.PI / 2, 0, 0));
      P.add(MAT.intake, place(cyl(e.r * 0.6, e.r * 0.6, 0.04, 14), x, e.y, nz + 0.16, Math.PI / 2, 0, 0));
      if (e.ab) {
        const fl = new THREE.Group();
        const outer = new THREE.Mesh(new THREE.ConeGeometry(e.r * 0.75, 4, 14, 1, true).rotateX(Math.PI / 2), MAT.flame);
        outer.position.z = 2;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(e.r * 0.5, 2.2, 12, 1, true).rotateX(Math.PI / 2), MAT.flameCore);
        inner.position.z = 1.1;
        fl.add(outer, inner);
        fl.position.set(x, e.y, nz + 0.2);
        fl.visible = false;
        g.add(fl); flames.push(fl);
      }
    }
  }
  for (const pr of a.props || []) {
    for (const x of pr.xs) {
      if (pr.nacelle) nacelle(pr.nacelle[0], pr.nacelle[1], x, pr.y, pr.z + pr.nacelle[1] / 2, P, bodyMat, { taper: 0.7 });
      const hub = new THREE.Group();
      hub.position.set(x, pr.y, pr.z - 0.1);
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(pr.spinner, pr.spinner * 2.2, 14).rotateX(-Math.PI / 2), MAT.chrome);
      spinner.position.z = -pr.spinner * 0.6;
      hub.add(spinner);
      const blades = new THREE.Group();
      for (let i = 0; i < pr.blades; i++) {
        const b = new THREE.Mesh(box(0.16, pr.r, 0.05), MAT.trim);
        b.geometry.translate(0, pr.r / 2, 0);
        b.rotation.z = (i / pr.blades) * Math.PI * 2;
        blades.add(b);
      }
      hub.add(blades);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(pr.r, 32), MAT.propDisc);
      disc.visible = false;
      hub.add(disc);
      g.add(hub);
      props.push({ blades, disc });
    }
  }

  // Fahrwerk
  for (const w of a.gear || []) {
    const [x, z, len, r] = w;
    const strut = new THREE.Mesh(cyl(0.06, 0.06, len, 8), MAT.metal);
    strut.position.set(x, -a.gearY + r + len / 2, z);
    const tire = new THREE.Mesh(cyl(r, r, r * 0.8, 14).rotateZ(Math.PI / 2), MAT.tire);
    tire.position.set(x, -a.gearY + r, z);
    tire.castShadow = true;
    gear.add(strut, tire);
  }
  g.add(gear);
  // Blitzlicht am Heck
  const strobe = new THREE.Mesh(sph(0.1, 8, 6), MAT.strobe.clone());
  strobe.position.set(0, a.strobeY ?? 1.5, a.len / 2 - 0.3);
  g.add(strobe); navStrobe.push(strobe);

  P.build(g);
  g.userData = { props, flames, gear, navStrobe, sweepers };
  return g;
}

/* Einfache Silhouette für Vorschaubilder im Menü */
export function vehicleIcon(def) {
  return def.kind === 'plane' ? (def.cls === 'jet' ? '✈︎' : def.cls === 'cargo' ? '✈︎' : '🛩') : def.cls === 'offroad' ? '🚙' : def.cls === 'pickup' ? '🛻' : '🏎';
}
