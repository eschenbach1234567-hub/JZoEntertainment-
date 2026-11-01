/* JZo World – Umgebung: Himmel, Sonne, Tageszeit, Nebel, Sterne, Wolken, Wasser */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smooth, rng, cloudTex, DEG } from './util.js';

const C = (h) => new THREE.Color(h);
const mixC = (a, b, t) => a.clone().lerp(b, clamp(t, 0, 1));

export class Env {
  constructor(scene, renderer, Q) {
    this.scene = scene; this.renderer = renderer; this.Q = Q;
    this.sky = new Sky();
    this.sky.scale.setScalar(90000);
    scene.add(this.sky);
    this.envSky = new Sky();
    this.envSky.scale.setScalar(500);
    this.envScene = new THREE.Scene();
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = Q.shadow > 0;
    if (Q.shadow) {
      this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      const s = this.sun.shadow.camera;
      s.left = -Q.shadowR; s.right = Q.shadowR; s.top = Q.shadowR; s.bottom = -Q.shadowR; s.near = 10; s.far = 4000;
      s.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.25;
    }
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9cc3ff, 0x4a4036, 0.6);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xa9c2d8, 0.00007);
    this.fogBase = 0.00007;

    // Sterne
    const r = rng(9), n = 2200, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * 40000; pos[i * 3 + 1] = Math.abs(u) * 40000; pos[i * 3 + 2] = Math.sin(a) * s * 40000;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    // Mond
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(700, 20, 12), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
    scene.add(this.moon);

    // Wasser
    this.waterU = {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: C(0xffffff) },
      uSky: { value: C(0x6fa0d8) }, uHorizon: { value: C(0xb8d0e8) }, uDeep: { value: C(0x0b3a52) }, uShallow: { value: C(0x2fb8b0) },
      uFog: { value: C(0xa9c2d8) }, uFogD: { value: 0.00007 }, uNight: { value: 0 },
      uDepth: { value: null }, uHalf: { value: 10000 }, uLevel: { value: 0 },
    };
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: this.waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: false,
    }));
    this.water.frustumCulled = false;
    this.water.receiveShadow = false;
    scene.add(this.water);

    this.clouds = new THREE.Group();
    scene.add(this.clouds);
    this.cloudTex = cloudTex(5);
    this.hour = 12; this.lastEnvHour = -99; this.night = 0;
    this.sunDir = new THREE.Vector3();
  }

  setWorld(world) {
    this.world = world;
    this.water.position.y = world.water;
    this.water.visible = world.hasWater;
    this.waterU.uDepth.value = world.depthTex;
    this.waterU.uHalf.value = world.half;
    this.waterU.uLevel.value = world.water;
    this.waterU.uShallow.value = C(world.def.shallow || 0x2fb8b0);
    this.waterU.uDeep.value = C(world.def.deep || 0x0b3a52);
    this.fogBase = world.def.fog || 0.00007;
    // Wolken
    for (const c of [...this.clouds.children]) { this.clouds.remove(c); c.material.dispose(); }
    const r = rng(world.def.seed * 7 + 1);
    const count = Math.round(this.Q.clouds * (world.def.cloudy ?? 1));
    const [h0, h1] = world.def.cloudH || [1300, 2600];
    for (let i = 0; i < count; i++) {
      const cx = (r() - 0.5) * 22000, cz = (r() - 0.5) * 22000, cy = lerp(h0, h1, r());
      const parts = 3 + Math.floor(r() * 4);
      for (let k = 0; k < parts; k++) {
        const m = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, opacity: 0.9, color: 0xffffff, rotation: r() * Math.PI * 2 });
        const s = new THREE.Sprite(m);
        const sc = 350 + r() * 700;
        s.scale.set(sc * 1.6, sc, 1);
        s.position.set(cx + (r() - 0.5) * 900, cy + (r() - 0.5) * 120, cz + (r() - 0.5) * 900);
        this.clouds.add(s);
      }
    }
    this.lastEnvHour = -99;
    this.setTime(this.hour, true);
  }

  setTime(hour, force = false) {
    this.hour = ((hour % 24) + 24) % 24;
    const h = this.hour;
    const ang = ((h - 6.5) / 13) * Math.PI;
    const elev = Math.sin(ang) * 62 * DEG;
    const az = ((h - 12) / 12) * Math.PI + (this.world?.def.sunAz || 0.4);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
    const ed = elev / DEG;
    const day = smooth(-4, 10, ed), golden = 1 - smooth(4, 22, ed), night = 1 - smooth(-9, 1, ed);
    this.night = night;
    this.day = day;

    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = lerp(2.5, 7, golden) * (this.world?.def.haze || 1);
      u.rayleigh.value = lerp(1.0, 2.6, golden * day) + night * 0.2;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.82;
    }
    // Sonne / Mond
    const sunCol = mixC(C(0xff8a3c), C(0xfff3e2), smooth(0, 28, ed));
    if (ed > -3) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 3.2 * smooth(-3, 12, ed);
      this.lightDir = this.sunDir.clone();
    } else {
      this.sun.color.set(0x8fa8ff);
      this.sun.intensity = 0.35 * night;
      this.lightDir = new THREE.Vector3(-this.sunDir.x, Math.max(0.35, -this.sunDir.y), -this.sunDir.z).normalize();
    }
    this.hemi.color.copy(mixC(C(0x1a2742), C(0x9cc3ff), day));
    this.hemi.groundColor.copy(mixC(C(0x0b0b0e), C(0x5a4c3e), day));
    this.hemi.intensity = lerp(0.5, 0.45, day);
    const fogDay = C(this.world?.def.fogColor || 0xaec6dc);
    const fogDusk = C(0xd59a78);
    const fogNight = C(0x0b1222);
    let fog = mixC(fogDay, fogDusk, golden * day);
    fog = mixC(fog, fogNight, night);
    this.scene.fog.color.copy(fog);
    this.scene.fog.density = this.fogBase * lerp(1, 0.85, night);
    this.stars.material.opacity = night * 0.95;
    this.moon.visible = night > 0.05;
    this.renderer.toneMappingExposure = lerp(0.62, 0.78, night) * (this.world?.def.exposure || 1);

    const W = this.waterU;
    W.uSun.value.copy(this.lightDir);
    W.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity / 3);
    W.uSky.value.copy(mixC(mixC(C(0x3f78c8), C(0x5a6aa0), golden), C(0x050a16), night));
    W.uHorizon.value.copy(fog);
    W.uFog.value.copy(fog);
    W.uFogD.value = this.scene.fog.density;
    W.uNight.value = night;
    // Wolkenfarbe
    const cc = mixC(mixC(C(0xffffff), C(0xffc39a), golden * day), C(0x252a36), night);
    for (const s of this.clouds.children) s.material.color.copy(cc);

    if (force || Math.abs(this.hour - this.lastEnvHour) > 0.2) {
      this.lastEnvHour = this.hour;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.2, 0.55, day);
    }
  }

  update(dt, cam, focus) {
    this.waterU.uTime.value += dt;
    this.stars.position.copy(cam.position);
    this.moon.position.copy(cam.position).addScaledVector(this.lightDir || this.sunDir, 30000);
    if (this.Q.shadow) {
      // Schattenkamera folgt dem Spieler (auf Texel-Raster eingerastet → kein Flimmern)
      const step = (this.Q.shadowR * 2) / this.Q.shadow;
      const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
      this.sun.target.position.set(fx, focus.y, fz);
      this.sun.position.set(fx, focus.y, fz).addScaledVector(this.lightDir || this.sunDir, 1500);
      this.sun.target.updateMatrixWorld();
    } else {
      this.sun.position.copy(this.lightDir || this.sunDir).multiplyScalar(1000);
    }
  }
}

const WATER_VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const WATER_FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uFogD, uNight, uHalf, uLevel;
uniform vec3 uSun, uSunCol, uSky, uHorizon, uDeep, uShallow, uFog;
uniform sampler2D uDepth;
varying vec3 vW;
vec2 wave(vec2 p, vec2 d, float f, float a, float s) {
  float ph = dot(p, d) * f + uTime * s;
  return d * (a * f * cos(ph));
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vW.xz;
  vec2 g = vec2(0.0);
  float fade = 1.0 - smoothstep(600.0, 6000.0, dist);
  g += wave(p, normalize(vec2(1.0, 0.3)), 0.045, 0.55, 1.1);
  g += wave(p, normalize(vec2(-0.4, 1.0)), 0.07, 0.35, 1.5);
  g += wave(p, normalize(vec2(0.8, -0.7)), 0.13, 0.16, 2.1) * fade;
  g += wave(p, normalize(vec2(-0.9, -0.2)), 0.29, 0.07, 2.9) * fade;
  g += wave(p, normalize(vec2(0.2, 0.9)), 0.61, 0.03, 4.0) * fade;
  g += wave(p, normalize(vec2(0.7, 0.6)), 1.3, 0.012, 5.3) * fade * fade;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = mix(uHorizon, uSky, clamp(R.y * 2.5, 0.0, 1.0));
  vec2 uv = (vW.xz + uHalf) / (2.0 * uHalf);
  float depth = 30.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) depth = texture2D(uDepth, uv).r * 30.0;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.5, 14.0, depth)) * mix(0.55, 0.06, uNight);
  vec3 col = mix(body, refl, fres);
  float sp = pow(max(dot(R, uSun), 0.0), 900.0) * 30.0 + pow(max(dot(R, uSun), 0.0), 80.0) * 0.6;
  col += uSunCol * sp * (1.0 - 0.7 * uNight);
  float foam = (1.0 - smoothstep(0.0, 1.2, depth)) * (0.5 + 0.5 * sin(uTime * 1.5 + p.x * 0.05 + p.y * 0.04));
  col = mix(col, vec3(0.85) * mix(1.0, 0.15, uNight), foam * 0.5);
  float f = 1.0 - exp(-uFogD * uFogD * dist * dist);
  col = mix(col, uFog, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
