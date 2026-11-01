/* JZo World – Effekte (Feuer, Rauch, Kondensstreifen, Überschall-Kegel) und Ton */
import * as THREE from 'three';
import { radialTex, clamp, lerp } from './util.js';

export class Particles {
  constructor(scene, n = 260) {
    this.scene = scene;
    this.fireTex = radialTex('rgba(255,240,200,1)', 'rgba(255,90,0,0)');
    this.smokeTex = radialTex('rgba(120,120,120,0.85)', 'rgba(90,90,90,0)');
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const fire = i % 2 === 0;
      const m = new THREE.SpriteMaterial({ map: fire ? this.fireTex : this.smokeTex, transparent: true, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, fire, life: 0, max: 1, v: new THREE.Vector3(), size: 1, grow: 1 });
    }
    this.i = 0;
  }
  emit(fire, pos, vel, size, life, grow = 1.5, color = null) {
    for (let k = 0; k < this.pool.length; k++) {
      this.i = (this.i + 1) % this.pool.length;
      const p = this.pool[this.i];
      if (p.fire !== fire) continue;
      p.s.position.copy(pos); p.v.copy(vel); p.size = size; p.life = 0; p.max = life; p.grow = grow;
      p.s.material.color.set(color || 0xffffff);
      p.s.visible = true;
      return;
    }
  }
  explode(pos, big = 1) {
    for (let k = 0; k < 40 * big; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 25, (Math.random() - 0.5) * 30).multiplyScalar(big);
      this.emit(true, pos, v, 6 * big + Math.random() * 6, 0.8 + Math.random() * 0.8, 3);
    }
    for (let k = 0; k < 40 * big; k++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 14, (Math.random() - 0.5) * 12);
      this.emit(false, pos, v, 8 * big, 3 + Math.random() * 3, 4, 0x333333);
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.life += dt;
      if (p.life >= p.max) { p.s.visible = false; continue; }
      const t = p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 1.2);
      if (!p.fire) p.v.y += dt * 2;
      const sz = p.size * (1 + t * p.grow);
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.fire ? 1 - t : (1 - t) * 0.7;
    }
  }
}

/* Band-Spur (z. B. Wirbel an den Flügelspitzen) */
export class Trail {
  constructor(scene, n = 80, width = 0.5, color = 0xffffff) {
    this.n = n; this.w = width;
    this.pts = []; this.sides = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.strength = 0;
  }
  push(p, side, strength) {
    this.pts.unshift({ p: p.clone(), s: side.clone(), a: strength });
    if (this.pts.length > this.n) this.pts.pop();
  }
  fade(dt) { for (const q of this.pts) q.a *= Math.exp(-dt * 1.5); }
  update() {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      if (!q) { this.col.fill(0); break; }
      const w = this.w * (1 + i * 0.03);
      for (const sd of [0, 1]) {
        const o = (i * 2 + sd) * 3;
        this.pos[o] = q.p.x + q.s.x * w * (sd ? 1 : -1); this.pos[o + 1] = q.p.y + q.s.y * w * (sd ? 1 : -1); this.pos[o + 2] = q.p.z + q.s.z * w * (sd ? 1 : -1);
        const c = (i * 2 + sd) * 4;
        this.col[c] = this.col[c + 1] = this.col[c + 2] = 1;
        this.col[c + 3] = i < this.pts.length ? q.a * (1 - i / n) * 0.55 : 0;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.pts.length = 0; this.col.fill(0); this.geo.attributes.color.needsUpdate = true; }
}

export function vaporCone() {
  const g = new THREE.ConeGeometry(4, 9, 24, 1, true).rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false;
  return m;
}

/* ---------- Ton (alles synthetisch, keine Dateien) ---------- */
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.7; this.on = true; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? this.vol : 0; this.master.connect(ctx.destination);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    // Motor (Auto / Propeller)
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 800;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.o1.connect(this.engF); this.o2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.master);
    this.o1.start(); this.o2.start();
    // Jet
    this.jetN = noise(); this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'bandpass'; this.jetF.Q.value = 0.7;
    this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
    this.jetN.connect(this.jetF); this.jetF.connect(this.jetG); this.jetG.connect(this.master);
    this.whine = ctx.createOscillator(); this.whine.type = 'sine'; this.whG = ctx.createGain(); this.whG.gain.value = 0;
    this.whine.connect(this.whG); this.whG.connect(this.master); this.whine.start();
    this.abN = noise(); this.abF = ctx.createBiquadFilter(); this.abF.type = 'lowpass'; this.abF.frequency.value = 220;
    this.abG = ctx.createGain(); this.abG.gain.value = 0; this.abN.connect(this.abF); this.abF.connect(this.abG); this.abG.connect(this.master);
    // Wind
    this.wN = noise(); this.wF = ctx.createBiquadFilter(); this.wF.type = 'lowpass'; this.wF.frequency.value = 500;
    this.wG = ctx.createGain(); this.wG.gain.value = 0; this.wN.connect(this.wF); this.wF.connect(this.wG); this.wG.connect(this.master);
    // Reifenquietschen
    this.sqN = noise(); this.sqF = ctx.createBiquadFilter(); this.sqF.type = 'bandpass'; this.sqF.frequency.value = 2400; this.sqF.Q.value = 6;
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0; this.sqN.connect(this.sqF); this.sqF.connect(this.sqG); this.sqG.connect(this.master);
    // Warnton
    this.beepO = ctx.createOscillator(); this.beepO.frequency.value = 1100; this.beepG = ctx.createGain(); this.beepG.gain.value = 0;
    this.beepO.connect(this.beepG); this.beepG.connect(this.master); this.beepO.start();
  }
  setVolume(v, on) { this.vol = v; this.on = on; if (this.master) this.master.gain.value = on ? v : 0; }
  set(param, v, t = 0.08) { if (param) param.setTargetAtTime(v, this.ctx.currentTime, t); }
  update(s) {
    if (!this.ctx) return;
    const z = (p) => this.set(p, 0);
    if (s.type === 'car') {
      // Gänge simulieren
      const v = Math.abs(s.speed), gears = [0, 14, 26, 38, 52, 68, 90, 999];
      let gI = 1; while (v > gears[gI] && gI < 7) gI++;
      const lo = gears[gI - 1], hi = Math.min(gears[gI], s.vmax * 1.05);
      const rpm = clamp((v - lo) / Math.max(hi - lo, 1), 0, 1);
      const f = (s.big ? 38 : 55) + rpm * (s.big ? 70 : 140) + (s.throttle ? 10 : 0);
      this.set(this.o1.frequency, f, 0.05); this.set(this.o2.frequency, f * 0.5, 0.05);
      this.set(this.engF.frequency, 500 + rpm * 1800 * (s.throttle ? 1 : 0.5));
      this.set(this.engG.gain, 0.09 + (s.throttle ? 0.1 : 0.03));
      this.set(this.sqG.gain, clamp((s.slip - 3) / 8, 0, 1) * 0.18);
      z(this.jetG.gain); z(this.whG.gain); z(this.abG.gain);
      this.set(this.wG.gain, clamp(v / 90, 0, 1) * 0.1);
    } else if (s.type === 'prop') {
      const f = 30 + s.throttle * 55 + Math.min(s.speed, 80) * 0.15;
      this.set(this.o1.frequency, f); this.set(this.o2.frequency, f * 2);
      this.set(this.engF.frequency, 300 + s.throttle * 900);
      this.set(this.engG.gain, 0.05 + s.throttle * 0.12);
      z(this.sqG.gain); z(this.whG.gain); z(this.abG.gain);
      this.set(this.jetG.gain, s.big ? s.throttle * 0.08 : 0); this.set(this.jetF.frequency, 900);
      this.set(this.wG.gain, clamp(s.speed / 120, 0, 1) * 0.12);
    } else if (s.type === 'jet') {
      z(this.engG.gain); z(this.sqG.gain);
      this.set(this.jetF.frequency, 500 + s.throttle * 1600);
      this.set(this.jetG.gain, 0.05 + s.throttle * 0.2);
      this.set(this.whine.frequency, 1800 + s.throttle * 2600); this.set(this.whG.gain, 0.006 + s.throttle * 0.012);
      this.set(this.abG.gain, s.ab ? 0.5 : 0, 0.2);
      this.set(this.wG.gain, clamp(s.speed / 300, 0, 1) * 0.16);
    } else {
      z(this.engG.gain); z(this.jetG.gain); z(this.whG.gain); z(this.abG.gain); z(this.sqG.gain);
      this.set(this.wG.gain, s.type === 'fall' ? clamp(s.speed / 50, 0, 1) * 0.15 : 0.0);
    }
    this.set(this.beepG.gain, s.warn && (this.ctx.currentTime * 4) % 1 < 0.5 ? 0.05 : 0, 0.01);
  }
  boom(big = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * big, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.2);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(ctx.currentTime + 2.3);
  }
  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx, g = ctx.createGain(); g.gain.setValueAtTime(0.12, ctx.currentTime); g.gain.setTargetAtTime(0, ctx.currentTime + 0.35, 0.05);
    for (const fr of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(g); o.start(); o.stop(ctx.currentTime + 0.6); }
    g.connect(this.master);
  }
  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 600; g.gain.setValueAtTime(0.05, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.connect(g); g.connect(this.master); o.start(); o.stop(ctx.currentTime + 0.1);
  }
}
