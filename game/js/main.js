/* JZo World – Hauptprogramm: Menüs, Spielablauf, Kamera, Anzeige */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input, ACTIONS, CONTEXTS, keyName, setupTouch } from './input.js';
import { initMaterials, buildCharacter, animateCharacter, buildParachute, vehicleIcon } from './models.js';
import { CARS, PLANES, ALL, byId, createVehicle } from './vehicles.js';
import { WORLDS, World } from './world.js';
import { Env } from './env.js';
import { Particles, Trail, Sound, vaporCone } from './fx.js';
import { clamp, lerp, DEG } from './util.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------- Einstellungen ---------- */
const STORE = 'jzo-world-v1';
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const DEFAULTS = { name: 'Jan', quality: 'auto', cycle: true, assist: true, invert: false, knots: false, sound: true, vol: 0.7, touch: false, bindings: null, seenHelp: false, last: null };
let set = { ...DEFAULTS };
try { Object.assign(set, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* ohne Speicher weiter */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(set)); } catch (e) { /* egal */ } };

const QUALITY = {
  ultra: { pr: 2, shadow: 4096, shadowR: 260, bloom: true, msaa: 4, terrainSeg: 448, trees: 1, treeShadow: true, traffic: 45, clouds: 130, cityDensity: 1, high: true, logDepth: true },
  hoch: { pr: 1.5, shadow: 2048, shadowR: 200, bloom: true, msaa: 4, terrainSeg: 384, trees: 0.8, treeShadow: true, traffic: 36, clouds: 100, cityDensity: 1, high: true, logDepth: true },
  mittel: { pr: 1.35, shadow: 1024, shadowR: 140, bloom: false, msaa: 0, terrainSeg: 320, trees: 0.55, treeShadow: false, traffic: 24, clouds: 60, cityDensity: 0.85, high: false, logDepth: true },
  niedrig: { pr: 1, shadow: 0, shadowR: 0, bloom: false, msaa: 0, terrainSeg: 256, trees: 0.3, treeShadow: false, traffic: 12, clouds: 30, cityDensity: 0.6, high: false, logDepth: false },
};
const qName = set.quality === 'auto' ? (isTouch ? 'mittel' : 'hoch') : set.quality;
const Q = QUALITY[qName] || QUALITY.hoch;

/* ---------- Renderer / Szene ---------- */
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.bloom, logarithmicDepthBuffer: Q.logDepth, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 60000);
scene.add(camera);
let composer = null, bloom = null;
if (Q.bloom) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

initMaterials(Q.high);
const env = new Env(scene, renderer, Q);
const fx = new Particles(scene, Q.high ? 300 : 160);
const sound = new Sound();
sound.setVolume(set.vol, set.sound);
const input = new Input();
input.load(set.bindings);
const touch = setupTouch(input, $('#touch'));
const trails = [new Trail(scene, 70, 0.35), new Trail(scene, 70, 0.35)];
const cone = vaporCone();
scene.add(cone);

/* ---------- Spielzustand ---------- */
const S = {
  world: null, worldDef: null, vehicles: new Map(), veh: null, mode: 'foot', paused: true, running: false,
  player: { pos: new THREE.Vector3(), yaw: 0, vy: 0, speed: 0, ground: true, swim: false, chuteT: 0, vel: new THREE.Vector3() },
  cam: { mode: 0, yaw: 0, pitch: 0.18, lookYaw: 0, lookPitch: 0, lastLook: 0, q: new THREE.Quaternion(), pos: new THREE.Vector3(), init: false },
  hour: 12, respawn: null, lastSpeed: 0, time: 0, toastT: 0,
};
const hero = buildCharacter();
scene.add(hero);
const chute = buildParachute();
chute.visible = false;
scene.add(chute);
const headlight = new THREE.SpotLight(0xfff2dd, 0, 90, 0.5, 0.5, 1.2);
scene.add(headlight, headlight.target);

/* ---------- Bildschirme ---------- */
let screenStack = [];
function show(id, push = true) {
  $$('.screen').forEach((s) => s.classList.remove('on'));
  if (id) {
    $('#' + id).classList.add('on');
    if (push && screenStack[screenStack.length - 1] !== id) screenStack.push(id);
  }
}
function back() {
  screenStack.pop();
  const prev = screenStack[screenStack.length - 1];
  if (prev) show(prev, false);
  else if (S.running) resume();
  else show('s-title');
}
$$('[data-back]').forEach((b) => b.addEventListener('click', () => { sound.click(); back(); }));
function pause() {
  if (!S.running) return;
  S.paused = true;
  screenStack = [];
  $('#p-time').value = S.hour.toFixed(1);
  $('#p-time-v').textContent = fmtTime(S.hour);
  show('s-pause');
  $('#hud').hidden = true; $('#touch').hidden = true;
}
function resume() {
  screenStack = [];
  show(null);
  S.paused = false;
  $('#hud').hidden = false;
  $('#touch').hidden = !(isTouch || set.touch);
  sound.init();
}
const fmtTime = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function choice(title, opts) {
  $('#ch-title').textContent = title;
  const box = $('#ch-btns');
  box.innerHTML = '';
  for (const [label, fn, big] of [...opts, ['Abbrechen', null]]) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (big) b.className = 'big';
    b.onclick = () => { $('#choice').hidden = true; sound.click(); if (fn) fn(); };
    box.appendChild(b);
  }
  $('#choice').hidden = false;
}

/* Titel */
$('#b-play').onclick = () => { sound.init(); sound.click(); openWorlds(false); };
$('#b-keys').onclick = () => { renderKeys(); show('s-keys'); };
$('#b-set').onclick = () => { fillSettings(); show('s-settings'); };
$('#b-help').onclick = () => { renderHelp(); show('s-help'); };

/* Weltauswahl */
let pendingWorld = null, carryVeh = null;
function openWorlds(inGame) {
  const list = $('#world-list');
  list.innerHTML = '';
  for (const w of WORLDS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wcard';
    b.innerHTML = `<div class="art" style="background:${w.grad}"><small>${w.tag}</small><b>${w.name}</b></div><p>${w.desc}</p>`;
    b.onclick = () => {
      sound.click();
      pendingWorld = w;
      if (inGame && S.veh && $('#take-veh').checked) { carryVeh = S.veh.def.id; startGame(w, { veh: carryVeh, how: S.veh.kind === 'plane' ? 'approach' : 'city' }); return; }
      openStart(w);
    };
    list.appendChild(b);
  }
  $('#take-wrap').hidden = !(inGame && S.veh);
  if (S.veh) $('#take-label').textContent = `${S.veh.def.name} mitnehmen (Flugzeug: Landeanflug auf den Flughafen)`;
  show('s-worlds');
}
function openStart(w) {
  $('#start-title').textContent = `${w.name} – wie willst du starten?`;
  const list = $('#start-list');
  list.innerHTML = '';
  const card = (cls, ico, name, info, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vcard ' + cls;
    b.innerHTML = `<span class="ico">${ico}</span><b>${name}</b><span>${info}</span>`;
    b.onclick = () => { sound.click(); fn(); };
    list.appendChild(b);
  };
  const grp = (t) => { const h = document.createElement('div'); h.className = 'vgroup'; h.textContent = t; list.appendChild(h); };
  grp('Zu Fuß');
  card('foot', '🧍', 'Am Flughafen', 'Du stehst bei deinen Jets und Autos und suchst dir eins aus.', () => startGame(w, { how: 'airport' }));
  card('foot', '🏙️', 'In der Stadt', 'Mitten in der Innenstadt.', () => startGame(w, { how: 'downtown' }));
  grp('Direkt im Flugzeug');
  for (const p of PLANES) card('', vehicleIcon(p), p.name, p.info, () => choice(p.name, [
    ['🛫 Auf der Startbahn starten', () => startGame(w, { veh: p.id, how: 'runway' }), true],
    ['☁️ In der Luft starten (Landeanflug)', () => startGame(w, { veh: p.id, how: 'approach' })],
  ]));
  grp('Direkt im Auto');
  for (const c of CARS) card('', vehicleIcon(c), c.name, c.info, () => startGame(w, { veh: c.id, how: 'city' }));
  show('s-start');
}

/* Pause-Menü */
$$('#s-pause [data-act]').forEach((b) => b.addEventListener('click', () => {
  sound.click();
  const a = b.dataset.act;
  if (a === 'resume') resume();
  if (a === 'garage') openGarage();
  if (a === 'worlds') openWorlds(true);
  if (a === 'map') openMap();
  if (a === 'settings') { fillSettings(); show('s-settings'); }
  if (a === 'keys') { renderKeys(); show('s-keys'); }
  if (a === 'help') { renderHelp(); show('s-help'); }
  if (a === 'title') { S.running = false; S.paused = true; screenStack = []; show('s-title'); }
}));
$('#p-time').addEventListener('input', (e) => { S.hour = +e.target.value; env.setTime(S.hour, true); $('#p-time-v').textContent = fmtTime(S.hour); });

/* Garage (Fahrzeug holen) */
function openGarage() {
  const list = $('#garage-list');
  list.innerHTML = '';
  const grp = (t) => { const h = document.createElement('div'); h.className = 'vgroup'; h.textContent = t; list.appendChild(h); };
  const card = (d, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vcard';
    b.innerHTML = `<span class="ico">${vehicleIcon(d)}</span><b>${d.name}</b><span>${d.info}</span>`;
    b.onclick = () => { sound.click(); fn(); };
    list.appendChild(b);
  };
  grp('Flugzeuge');
  for (const p of PLANES) card(p, () => choice(p.name, [
    ['🛫 Auf die Startbahn', () => { summon(p.id, 'runway'); resume(); }, true],
    ['☁️ Hier in die Luft (600 m)', () => { summon(p.id, 'air'); resume(); }],
    ['🅿️ Auf den Stellplatz am Flughafen', () => { summon(p.id, 'home'); resume(); }],
  ]));
  grp('Autos');
  for (const c of CARS) card(c, () => { summon(c.id, 'here'); resume(); });
  show('s-garage');
}

/* Karte */
const bigmap = $('#bigmap');
function openMap() { drawBigMap(); show('s-map'); }
function drawBigMap() {
  const W = S.world;
  if (!W) return;
  const g = bigmap.getContext('2d'), N = bigmap.width;
  g.drawImage(W.mapCanvas, 0, 0, N, N);
  const k = N / (W.half * 2), X = (v) => (v + W.half) * k;
  for (const v of S.vehicles.values()) {
    if (v === S.veh || !v.mesh.visible) continue;
    g.fillStyle = v.kind === 'plane' ? '#4fc3ff' : '#ffd23f';
    g.beginPath(); g.arc(X(v.pos.x), X(v.pos.z), 5, 0, 7); g.fill();
  }
  g.font = 'bold 22px sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4;
  for (const r of W.runways) { g.strokeText('✈', X(r.x) + 12, X(r.z)); g.fillText('✈', X(r.x) + 12, X(r.z)); }
  const p = focusPos();
  const yaw = focusYaw();
  g.save(); g.translate(X(p.x), X(p.z)); g.rotate(-yaw);
  g.fillStyle = '#ff3d8b'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
bigmap.addEventListener('pointerdown', (e) => {
  const W = S.world;
  const r = bigmap.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W.half * 2 - W.half, z = ((e.clientY - r.top) / r.height) * W.half * 2 - W.half;
  teleport(x, z);
  resume();
});

/* Einstellungen */
function fillSettings() {
  $('#o-name').value = set.name; $('#o-quality').value = set.quality; $('#o-cycle').checked = set.cycle; $('#o-assist').checked = set.assist;
  $('#o-invert').checked = set.invert; $('#o-knots').checked = set.knots; $('#o-sound').checked = set.sound; $('#o-vol').value = set.vol; $('#o-touch').checked = set.touch;
}
$('#o-name').addEventListener('input', (e) => { set.name = e.target.value || 'Jan'; $('#h-name').textContent = set.name; save(); });
$('#o-quality').addEventListener('change', (e) => { set.quality = e.target.value; save(); $('#o-qnote').hidden = false; });
$('#o-reload').onclick = () => location.reload();
for (const [id, key] of [['o-cycle', 'cycle'], ['o-assist', 'assist'], ['o-invert', 'invert'], ['o-knots', 'knots'], ['o-sound', 'sound'], ['o-touch', 'touch']]) {
  $('#' + id).addEventListener('change', (e) => { set[key] = e.target.checked; save(); sound.setVolume(set.vol, set.sound); });
}
$('#o-vol').addEventListener('input', (e) => { set.vol = +e.target.value; save(); sound.setVolume(set.vol, set.sound); });

/* Tastenbelegung */
function renderKeys() {
  const box = $('#keys-list');
  box.innerHTML = '';
  for (const ctx in CONTEXTS) {
    const grp = document.createElement('div');
    grp.className = 'kgroup';
    grp.innerHTML = `<h4>${CONTEXTS[ctx]}</h4>`;
    for (const a of ACTIONS.filter((x) => x.ctx === ctx)) {
      const row = document.createElement('div');
      row.className = 'krow';
      row.innerHTML = `<span>${a.label}</span>`;
      for (const slot of [0, 1]) {
        const b = document.createElement('button');
        b.type = 'button';
        const code = input.bindings[a.id][slot];
        b.textContent = keyName(code);
        if (!code) b.classList.add('empty');
        b.onclick = () => captureKey(a, slot);
        row.appendChild(b);
      }
      grp.appendChild(row);
    }
    box.appendChild(grp);
  }
}
function captureKey(a, slot) {
  $('#kc-for').textContent = `${CONTEXTS[a.ctx]} → ${a.label} (Platz ${slot + 1})`;
  $('#keycap').hidden = false;
  const done = (code) => {
    $('#keycap').hidden = true;
    input.capture = null;
    const removed = input.bind(a.id, slot, code);
    set.bindings = input.bindings; save();
    renderKeys();
    if (removed.length) toast(`Taste war schon belegt – entfernt bei: ${removed.join(', ')}`, 3500);
  };
  input.capture = done;
  $('#kc-clear').onclick = () => done('');
  $('#kc-cancel').onclick = () => { input.capture = null; $('#keycap').hidden = true; };
}
$('#k-reset').onclick = () => { input.resetBindings(); set.bindings = null; save(); renderKeys(); toast('Alle Tasten auf Standard zurückgesetzt'); };

function renderHelp() {
  const k = (id) => input.bindings[id].filter(Boolean).map((c) => `<kbd>${keyName(c)}</kbd>`).join(' / ') || '–';
  $('#help-body').innerHTML = `
  <div><h4>🧍 Zu Fuß</h4>Laufen ${k('f_fwd')} ${k('f_back')}, drehen ${k('f_left')} ${k('f_right')}<br>Rennen ${k('f_run')}, Springen ${k('f_jump')}<br>Zu einem Fahrzeug gehen und ${k('enter')} drücken = einsteigen.</div>
  <div><h4>🏎 Auto</h4>Gas ${k('c_gas')}, Bremse/Rückwärts ${k('c_brake')}<br>Lenken ${k('c_left')} ${k('c_right')}<br>Drift (Handbremse) ${k('c_hand')}, Nitro ${k('c_nitro')}<br>Hupe ${k('horn')}</div>
  <div><h4>✈️ Flugzeug – Start</h4>1. Schub geben: ${k('p_thrUp')} gedrückt halten (Nachbrenner bei Jets: ${k('p_ab')})<br>2. Auf der Startbahn Tempo aufbauen<br>3. Bei genug Tempo ${k('p_up')} = Nase hoch → abheben<br>4. Fahrwerk einfahren: ${k('p_gear')}</div>
  <div><h4>✈️ Flugzeug – Fliegen</h4>Nase runter ${k('p_down')}, Nase hoch ${k('p_up')}<br>Rollen ${k('p_rollL')} ${k('p_rollR')}, Seitenruder ${k('p_yawL')} ${k('p_yawR')}<br>Schub weniger ${k('p_thrDown')}<br>Landen: langsam, Fahrwerk raus (${k('p_gear')}), sanft aufsetzen, dann Radbremse ${k('p_brake')}.</div>
  <div><h4>🪂 Aussteigen in der Luft</h4>${k('enter')} in der Luft = Fallschirmsprung! Mit den Lauf-Tasten steuerst du den Schirm.</div>
  <div><h4>🎮 Allgemein</h4>Fahrzeug holen ${k('garage')} · Kamera ${k('camera')} · Karte ${k('map')} · Pause ${k('menu')} · Tageszeit +1 Std. ${k('time')}<br>Mit der Maus (oder dem Finger) ins Bild ziehen = umschauen.<br>Gamecontroller wird automatisch erkannt.</div>
  <div><h4>📱 iPhone</h4>Links der Steuer-Knüppel, rechts die Knöpfe. Oben rechts: Fahrzeug holen, Kamera, Karte, Pause.<br>Über Safari → Teilen → „Zum Home-Bildschirm“ wird es eine App.</div>`;
}

/* ---------- Welt laden ---------- */
function focusPos() { return S.mode === 'drive' ? S.veh.pos : S.player.pos; }
function focusYaw() { if (S.mode === 'drive') return S.veh.kind === 'plane' ? -S.veh.heading : S.veh.yaw; return S.player.yaw; }

async function startGame(wdef, start) {
  show('s-loading');
  $('#load-text').textContent = `${wdef.name} wird gebaut…`;
  $('#hud').hidden = true; $('#touch').hidden = true;
  await new Promise((r) => setTimeout(r, 60));
  try {
    if (S.world) {
      for (const v of S.vehicles.values()) { scene.remove(v.mesh); v.mesh.traverse((o) => o.geometry && o.geometry.dispose()); }
      S.vehicles.clear();
      S.world.dispose();
    }
    S.world = new World(wdef, Q, scene);
    S.worldDef = wdef;
    S.hour = $('#start-time').value === 'world' || !start.keepTime ? (start.hour ?? ($('#start-time').value === 'world' ? wdef.hour : +$('#start-time').value)) : S.hour;
    env.setWorld(S.world);
    env.setTime(S.hour, true);
    parkVehicles();
    S.veh = null; S.mode = 'foot';
    hero.visible = true; chute.visible = false;
    placeStart(start);
    S.cam.init = false;
    $('#h-world').textContent = wdef.name;
    $('#h-name').textContent = set.name;
    set.last = { world: wdef.id }; save();
    S.running = true;
    resume();
    if (!set.seenHelp) { set.seenHelp = true; save(); setTimeout(() => toast(isTouch ? 'Tipp: Pause ⏸ → Hilfe zeigt die ganze Steuerung' : 'Tipp: Esc → Hilfe zeigt die ganze Steuerung', 4500), 1200); }
    else toast(`Willkommen in ${wdef.name}, ${set.name}!`);
  } catch (err) {
    console.error(err);
    $('#load-text').textContent = 'Fehler beim Laden: ' + err.message;
  }
}

function parkVehicles() {
  const W = S.world;
  const civ = W.planeSlots.slice(), mil = W.milSlots ? W.milSlots.slice() : null;
  for (const d of PLANES) {
    const v = createVehicle(d);
    const military = d.cls === 'jet' || d.cls === 'cargo';
    const slot = (military && mil && mil.length ? mil : civ).shift() || W.planeSlots[0];
    v.home = slot;
    v.place(slot.x, slot.z, slot.yaw, W);
    scene.add(v.mesh);
    S.vehicles.set(d.id, v);
  }
  const cs = W.carSlots.slice();
  for (const d of CARS) {
    const v = createVehicle(d);
    const slot = cs.shift() || W.carSlots[0];
    v.home = slot;
    v.place(slot.x, slot.z, slot.yaw, W);
    scene.add(v.mesh);
    S.vehicles.set(d.id, v);
  }
}

function placeStart(start) {
  const W = S.world, rw = W.runways.find((r) => r.main) || W.runways[0];
  const P = S.player;
  const at = (x, z, yaw) => { P.pos.set(x, W.groundAt(x, z), z); P.yaw = yaw; P.vy = 0; };
  if (start.how === 'downtown') { const c = W.cityCenter(); at(c.x, c.z, c.yaw); }
  else { const a = W.spawns.airport; at(a.x, a.z, a.yaw); }
  if (start.veh) {
    const v = S.vehicles.get(start.veh);
    if (v.kind === 'plane') {
      const mrw = v.def.cls === 'jet' || v.def.cls === 'cargo' ? (W.runways.find((r) => r.military) || rw) : rw;
      if (start.how === 'approach') { const a = mrw.approach; v.place(a.x, a.z, a.yaw, W, a.alt, Math.max(v.def.vs * 1.45, 75)); v.gearDown = true; v.throttle = v.def.prop ? 0.6 : 0.45; }
      else { const s = mrw.start; v.place(s.x, s.z, s.yaw, W); }
    } else {
      const c = W.cityCenter(true);
      v.place(c.x, c.z, c.yaw, W);
    }
    enter(v);
  }
}

function summon(id, where) {
  const W = S.world, v = S.vehicles.get(id);
  if (S.veh && S.veh !== v) {
    const old = S.veh;
    exitVehicle(true);
    if (old.kind === 'plane' && !old.onGround) old.place(old.home.x, old.home.z, old.home.yaw, W);
  }
  else if (S.veh === v) { S.mode = 'foot'; S.veh = null; }
  v.mesh.visible = true; v.crashed = false;
  const p = focusPos();
  if (v.kind === 'plane') {
    const rw = v.def.cls === 'jet' || v.def.cls === 'cargo' ? (W.runways.find((r) => r.military) || W.runways[0]) : (W.runways.find((r) => r.main) || W.runways[0]);
    if (where === 'runway') v.place(rw.start.x, rw.start.z, rw.start.yaw, W);
    else if (where === 'air') { v.place(p.x, p.z, S.player.yaw, W, Math.max(W.groundAt(p.x, p.z) + 600, 600), Math.max(v.def.vs * 1.6, 80)); }
    else { v.place(v.home.x, v.home.z, v.home.yaw, W); S.player.pos.set(v.home.x - Math.sin(v.home.yaw) * -(v.def.model.len * 0.6 + 4), 0, v.home.z - Math.cos(v.home.yaw) * -(v.def.model.len * 0.6 + 4)); S.player.pos.y = W.groundAt(S.player.pos.x, S.player.pos.z); hero.visible = true; toast(`${v.def.name} steht auf dem Stellplatz`); return; }
  } else {
    const yaw = S.player.yaw;
    const x = p.x + Math.cos(yaw) * 4 - Math.sin(yaw) * 3, z = p.z - Math.sin(yaw) * 4 - Math.cos(yaw) * 3;
    v.place(x, z, yaw, W);
  }
  enter(v);
}

function teleport(x, z) {
  const W = S.world;
  if (S.mode === 'drive' && S.veh.kind === 'plane' && !S.veh.onGround) {
    const v = S.veh;
    v.place(x, z, -v.heading, W, Math.max(W.groundAt(x, z) + 500, v.pos.y), Math.max(v.speed, v.def.vs * 1.5));
  } else if (S.mode === 'drive') {
    if (S.veh.kind === 'plane') S.veh.place(x, z, -S.veh.heading, W, W.groundAt(x, z) + 600, S.veh.def.vs * 1.6);
    else S.veh.place(x, z, S.veh.yaw, W);
  } else {
    S.player.pos.set(x, W.groundAt(x, z), z); S.player.vy = 0;
    if (S.mode === 'chute') endChute();
  }
  S.cam.init = false;
  toast('Schnellreise ✓', 1400);
}

/* ---------- Ein- / Aussteigen ---------- */
function enter(v) {
  S.veh = v; S.mode = 'drive';
  hero.visible = false; chute.visible = false;
  S.cam.init = false;
  trails.forEach((t) => t.clear());
  toast(v.kind === 'plane' ? `${v.def.name} – ${v.onGround ? 'Schub geben und abheben!' : 'Guten Flug!'}` : `${v.def.name} – gute Fahrt!`, 2200);
}
function exitVehicle(force = false) {
  const v = S.veh, W = S.world, P = S.player;
  if (!v) return;
  if (v.kind === 'plane') {
    const agl = v.pos.y - W.groundAt(v.pos.x, v.pos.z);
    if (!v.onGround && agl > 35 && !force) {
      // Fallschirmsprung
      S.mode = 'chute'; S.veh = null;
      P.pos.copy(v.pos).addScaledVector(v.up, -3); P.vel.copy(v.vel).multiplyScalar(0.5); P.vy = Math.min(v.vel.y, 0); P.chuteT = 0; P.yaw = -v.heading;
      hero.visible = true; chute.visible = false;
      toast('🪂 Absprung! Schirm öffnet gleich…', 2000);
      return;
    }
    if (!v.onGround && !force) { toast('Erst landen oder höher als 35 m fliegen (dann Fallschirm)'); return; }
    if (v.speed > 12 && !force) { toast('Erst langsamer werden (Radbremse)'); return; }
    v.throttle = 0; v.vel.set(0, 0, 0);
    const side = (v.def.model.R || 1) * 1.6 + (v.def.model.wings?.[0]?.span ? 2 : 2);
    P.pos.copy(v.pos).addScaledVector(v.right, -side - 1.5);
  } else {
    P.pos.set(v.pos.x - Math.cos(v.yaw) * 2.2, 0, v.pos.z + Math.sin(v.yaw) * 2.2);
    v.vel.multiplyScalar(0.0);
    P.yaw = v.yaw;
  }
  P.pos.y = W.groundAt(P.pos.x, P.pos.z); P.vy = 0;
  if (v.kind === 'plane') P.yaw = -v.heading;
  S.veh = null; S.mode = 'foot'; hero.visible = true;
  S.cam.init = false;
}
function endChute() { S.mode = 'foot'; chute.visible = false; }

function nearestVehicle() {
  const P = S.player.pos;
  let best = null, bd = 1e9;
  for (const v of S.vehicles.values()) {
    if (!v.mesh.visible || v.crashed) continue;
    const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
    const r = v.kind === 'plane' ? v.def.enterR : 4.2;
    if (d < r && d < bd && Math.abs(v.pos.y - P.y) < 8) { bd = d; best = v; }
  }
  return best;
}

/* ---------- Steuerung lesen ---------- */
function carControls() {
  const g = input;
  return {
    gas: Math.max(g.held('c_gas') ? 1 : 0, g.gpBtn(7), g.stick.active ? clamp(-g.stick.y * 1.4, 0, 1) * 0 : 0),
    brake: Math.max(g.held('c_brake') ? 1 : 0, g.gpBtn(6)),
    steer: clamp(g.axis('c_left', 'c_right') + g.stick.x * 1.2 + g.gpAxis(0), -1, 1),
    hand: g.held('c_hand') || g.gpBtn(2) > 0,
    nitro: g.held('c_nitro') || g.gpBtn(5) > 0,
  };
}
function planeControls(v) {
  const g = input;
  let pitch = g.axis('p_down', 'p_up') + g.stick.y * 1.15 + g.gpAxis(1);
  if (set.invert) pitch = -pitch;
  return {
    pitch: clamp(pitch, -1, 1),
    roll: clamp(g.axis('p_rollL', 'p_rollR') + g.stick.x * 1.15 + g.gpAxis(0), -1, 1),
    yaw: clamp(g.axis('p_yawL', 'p_yawR') + g.gpBtn(5) - g.gpBtn(4), -1, 1),
    thr: clamp(g.axis('p_thrDown', 'p_thrUp') + g.gpBtn(7) - (v.onGround ? 0 : g.gpBtn(6)), -1, 1),
    ab: g.held('p_ab') || g.gpBtn(2) > 0,
    brake: g.held('p_brake') || (v.onGround && g.gpBtn(6) > 0),
    gear: g.hit('p_gear'),
  };
}

/* ---------- Spielfigur ---------- */
function updateFoot(dt) {
  const P = S.player, W = S.world, g = input;
  let move = 0, turn = 0;
  const run = g.held('f_run') || g.gpBtn(5) > 0;
  const stickMag = Math.hypot(g.stick.x, g.stick.y), gpx = g.gpAxis(0), gpy = g.gpAxis(1), gpMag = Math.hypot(gpx, gpy);
  if (stickMag > 0.15 || gpMag > 0.15) {
    // kamerabezogen (Touch / Controller)
    const sx = stickMag > 0.15 ? g.stick.x : gpx, sy = stickMag > 0.15 ? g.stick.y : gpy;
    const ang = S.cam.yaw + Math.atan2(-sx, -sy);
    let d = ang - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.yaw += d * Math.min(1, dt * 10);
    move = Math.min(1, Math.hypot(sx, sy));
  } else {
    move = g.axis('f_back', 'f_fwd');
    turn = g.axis('f_left', 'f_right');
    P.yaw -= turn * 2.6 * dt;
  }
  const speed = (run || move > 0.9 && stickMag > 0.95 ? 6.8 : 2.4) * move * (P.swim ? 0.45 : 1);
  P.speed = Math.abs(speed);
  P.pos.x += -Math.sin(P.yaw) * speed * dt;
  P.pos.z += -Math.cos(P.yaw) * speed * dt;
  const ground = W.groundAt(P.pos.x, P.pos.z);
  const swimY = W.water - 1.15;
  P.swim = W.hasWater && ground < swimY;
  if (P.swim) { P.pos.y += (swimY - P.pos.y) * Math.min(1, dt * 4); P.vy = 0; P.ground = true; }
  else {
    if ((g.hit('f_jump') || g.touchPressed.has('f_jump')) && P.ground) { P.vy = 5.2; P.ground = false; }
    P.vy -= 9.81 * dt;
    P.pos.y += P.vy * dt;
    if (P.pos.y <= ground) { P.pos.y = ground; P.vy = 0; P.ground = true; }
    else if (P.pos.y - ground > 0.3) P.ground = false;
  }
  const hit = W.collide(P.pos, 0.45, P.pos.y + 1);
  if (hit) { P.pos.x += hit.x; P.pos.z += hit.z; }
  for (const v of S.vehicles.values()) {
    if (!v.mesh.visible) continue;
    const r = v.kind === 'car' ? 2.2 : (v.def.model.R || 1) * 1.3 + 0.4;
    const dx = P.pos.x - v.pos.x, dz = P.pos.z - v.pos.z, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-3 && Math.abs(P.pos.y - v.pos.y) < 4) { P.pos.x += (dx / d) * (r - d); P.pos.z += (dz / d) * (r - d); }
  }
  if (W.traffic) { const h = W.traffic.bump(P.pos, 0.2); if (h) { P.pos.x += h.x; P.pos.z += h.z; } }
  hero.position.copy(P.pos);
  if (P.swim) hero.position.y += 0.2;
  hero.rotation.set(0, P.yaw, 0);
  animateCharacter(hero, P.speed, dt, !P.ground && !P.swim);
}

function updateChute(dt) {
  const P = S.player, W = S.world, g = input;
  P.chuteT += dt;
  const open = P.chuteT > 1.3;
  chute.visible = open;
  if (!open) {
    P.vy -= 9.81 * dt; P.vy = Math.max(P.vy, -55);
    P.vel.multiplyScalar(1 - dt * 0.8);
  } else {
    P.vy += (-5.2 - P.vy) * Math.min(1, dt * 2.5);
    const fwd = clamp(g.axis('f_back', 'f_fwd') - g.stick.y, -1, 1), turn = clamp(g.axis('f_left', 'f_right') + g.stick.x, -1, 1);
    P.yaw -= turn * 1.2 * dt;
    const tv = 7 + fwd * 4;
    P.vel.x += (-Math.sin(P.yaw) * tv - P.vel.x) * Math.min(1, dt * 1.5);
    P.vel.z += (-Math.cos(P.yaw) * tv - P.vel.z) * Math.min(1, dt * 1.5);
  }
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt; P.pos.y += P.vy * dt;
  const ground = W.groundAt(P.pos.x, P.pos.z);
  if (P.pos.y <= Math.max(ground, W.hasWater ? W.water - 1.1 : -1e9) || W.hitBuilding(P.pos, 0.5)) {
    P.pos.y = Math.max(ground, P.pos.y); P.vy = 0; P.vel.set(0, 0, 0);
    endChute(); toast('Gelandet! 🪂', 1500);
  }
  hero.position.copy(P.pos);
  hero.rotation.set(0, P.yaw, 0);
  animateCharacter(hero, 0, dt, true);
  chute.position.copy(P.pos); chute.rotation.set(0, P.yaw, 0);
}

/* ---------- Kamera ---------- */
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
let dragging = null;
canvas.addEventListener('pointerdown', (e) => { if (S.paused) return; dragging = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || dragging.id !== e.pointerId) return;
  S.cam.lookYaw -= (e.clientX - dragging.x) * 0.006; S.cam.lookPitch = clamp(S.cam.lookPitch + (e.clientY - dragging.y) * 0.004, -0.6, 1.1);
  dragging.x = e.clientX; dragging.y = e.clientY; S.cam.lastLook = S.time;
});
const endDrag = (e) => { if (dragging && dragging.id === e.pointerId) dragging = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { S.cam.zoom = clamp((S.cam.zoom || 1) * (1 + e.deltaY * 0.001), 0.5, 3); }, { passive: true });

function updateCamera(dt) {
  const C = S.cam, W = S.world;
  const rs = input.gpAxis(2), rsy = input.gpAxis(3);
  if (rs || rsy) { C.lookYaw -= rs * dt * 2.5; C.lookPitch = clamp(C.lookPitch + rsy * dt * 1.5, -0.6, 1.1); C.lastLook = S.time; }
  const free = S.time - C.lastLook < 1.6 || dragging;
  if (!free && S.mode !== 'foot') { C.lookYaw *= Math.exp(-dt * 3); C.lookPitch *= Math.exp(-dt * 3); }
  const zoom = C.zoom || 1;
  let fov = 62;
  if (S.mode === 'drive' && S.veh.kind === 'plane') {
    const v = S.veh, d = v.def;
    if (!C.init) { C.q.copy(v.q); C.init = true; }
    if (C.mode === 1) {
      camera.position.copy(d.cockpit ? _v.set(d.cockpit[0], d.cockpit[1] + (d.model.canopy ? 0.42 : 0.15), d.cockpit[2]) : _v.set(0, 1, -2)).applyQuaternion(v.q).add(v.pos);
      _q.setFromEuler(_e.set(-C.lookPitch * 0.8, C.lookYaw, 0, 'YXZ'));
      camera.quaternion.copy(v.q).multiply(_q);
      fov = 70;
    } else {
      // Verfolger-Kamera: weich hinterher, Horizont neigt sich mit
      C.q.slerp(v.q, 1 - Math.exp(-dt * (C.mode === 2 ? 2.5 : 5)));
      const qq = C.mode === 2 ? _q.setFromEuler(_e.set(0, -v.heading, 0, 'YXZ')) : C.q;
      const dist = d.cam[0] * zoom * (C.mode === 2 ? 1.8 : 1), h = d.cam[1] * zoom * (C.mode === 2 ? 1.6 : 1);
      const look = _q.clone ? new THREE.Quaternion().setFromEuler(_e.set(-C.lookPitch, C.lookYaw, 0, 'YXZ')) : null;
      const off = _v.set(0, h, dist).applyQuaternion(look).applyQuaternion(qq);
      camera.position.copy(v.pos).add(off);
      camera.up.set(0, 1, 0).applyQuaternion(C.mode === 2 ? _q.identity() : C.q);
      _v2.set(0, d.cam[1] * 0.35, -d.cam[0] * 0.6).applyQuaternion(C.q).add(v.pos);
      camera.lookAt(_v2);
      fov = 60 + clamp(v.speed / 450, 0, 1) * 12 + (v.ab ? 4 : 0);
    }
  } else if (S.mode === 'drive') {
    const v = S.veh;
    const yawT = v.yaw + (v.fwdSpeed < -2 ? 0 : 0);
    if (!C.init) { C.yaw = yawT; C.init = true; }
    let dy = yawT - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    C.yaw += dy * Math.min(1, dt * 4.5);
    if (C.mode === 1) {
      const b = v.def.body;
      camera.position.set(0, b.beltH + 0.28, -(b.beltF - 0.35)).applyEuler(_e.set(v.pitch, v.yaw, v.roll, 'YXZ')).add(v.pos);
      camera.quaternion.setFromEuler(_e.set(v.pitch - C.lookPitch * 0.6, v.yaw + C.lookYaw, v.roll, 'YXZ'));
      camera.up.set(0, 1, 0);
      fov = 66;
    } else {
      const far = C.mode === 2 ? 1.7 : 1;
      const dist = (6.2 + v.def.body.L * 0.35 + Math.min(v.speed, 60) * 0.03) * zoom * far, h = (1.9 + v.def.body.roofH * 0.4) * zoom * far;
      const yy = C.yaw + C.lookYaw, pp = 0.12 + C.lookPitch * 0.6;
      camera.position.set(v.pos.x + Math.sin(yy) * dist * Math.cos(pp), v.pos.y + h + Math.sin(pp) * dist * 0.5, v.pos.z + Math.cos(yy) * dist * Math.cos(pp));
      camera.up.set(0, 1, 0);
      camera.lookAt(v.pos.x, v.pos.y + 1.1, v.pos.z);
      fov = 62 + clamp(v.speed / 100, 0, 1) * 12 + (v.nitroOn ? 6 : 0);
    }
  } else {
    // zu Fuß / Fallschirm
    const P = S.player;
    if (!C.init) { C.yaw = P.yaw; C.init = true; }
    const moving = P.speed > 0.5 || S.mode === 'chute';
    if (moving && !free && !input.stick.active) { let dy = P.yaw - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); C.yaw += dy * Math.min(1, dt * 2.5); }
    if (free) { C.yaw += C.lookYaw; C.lookYaw = 0; }
    const dist = (S.mode === 'chute' ? 11 : C.mode === 2 ? 9 : C.mode === 1 ? 2.6 : 5.2) * zoom;
    const pp = clamp(C.pitch + C.lookPitch, -0.3, 1.2);
    const ty = P.pos.y + (S.mode === 'chute' ? 2.5 : 1.55);
    camera.position.set(P.pos.x + Math.sin(C.yaw) * dist * Math.cos(pp), ty + Math.sin(pp) * dist, P.pos.z + Math.cos(C.yaw) * dist * Math.cos(pp));
    camera.up.set(0, 1, 0);
    camera.lookAt(P.pos.x, ty, P.pos.z);
  }
  // nicht unter den Boden
  const gy = W.groundAt(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < gy) camera.position.y = gy;
  if (W.hasWater && camera.position.y < W.water + 0.4) camera.position.y = W.water + 0.4;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
}

/* ---------- Anzeige ---------- */
const mini = $('#mini'), mctx = mini.getContext('2d');
let hudT = 0;
function updateHUD(dt) {
  hudT += dt;
  $('#h-time').textContent = fmtTime(S.hour);
  const rows = [];
  let spd = 0, unit = 'km/h', name = '', bar = -1, warn = '';
  if (S.mode === 'drive' && S.veh.kind === 'plane') {
    const v = S.veh;
    name = v.def.name;
    spd = set.knots ? v.speed * 1.944 : v.speed * 3.6; unit = set.knots ? 'kn' : 'km/h';
    const agl = v.pos.y - S.world.groundAt(v.pos.x, v.pos.z);
    rows.push(['Höhe', `${Math.round(v.pos.y - S.world.water)} m`], ['über Grund', `${Math.round(agl)} m`], ['Steigen', `${(v.vel.y).toFixed(1)} m/s`]);
    rows.push(['Schub', `${Math.round(v.throttle * 100)} %${v.ab ? ' <b class="hot">NACHBRENNER</b>' : ''}`]);
    rows.push(['Fahrwerk', v.def.fixedGear ? 'fest' : v.gearDown ? 'AUSGEFAHREN' : 'eingefahren'], ['Kurs', `${String(Math.round(((v.heading / DEG) + 360) % 360)).padStart(3, '0')}°`]);
    if (!v.onGround) rows.push(['G-Kraft', `${v.g.toFixed(1)} G`]);
    if (v.speed > 330) rows.push(['Mach', (v.speed / 340).toFixed(2)]);
    bar = v.throttle;
    if (v.stall && v.speed > 5) warn = 'STRÖMUNGSABRISS!<br><small>Nase runter, mehr Schub</small>';
    else if (!v.onGround && !v.gearDown && agl < 120 && v.speed < v.def.vs * 1.6) warn = 'FAHRWERK!';
    else if (!v.onGround && agl < 60 && v.vel.y < -12) warn = 'BODEN! HOCHZIEHEN!';
  } else if (S.mode === 'drive') {
    const v = S.veh;
    name = v.def.name; spd = Math.abs(v.fwdSpeed) * 3.6;
    rows.push(['Nitro', `${Math.round(v.nitro * 100)} %`]);
    if (v.fwdSpeed < -0.5) rows.push(['Gang', 'R']);
    bar = v.nitro;
  } else if (S.mode === 'chute') {
    name = '🪂 Fallschirm'; spd = Math.hypot(S.player.vel.x, S.player.vy, S.player.vel.z) * 3.6;
    rows.push(['Höhe', `${Math.round(S.player.pos.y - S.world.groundAt(S.player.pos.x, S.player.pos.z))} m`]);
  } else {
    name = set.name + (S.player.swim ? ' (schwimmt)' : ''); spd = S.player.speed * 3.6;
  }
  $('#g-name').textContent = name;
  $('#g-spd').textContent = Math.round(spd);
  $('#g-unit').textContent = unit;
  $('#g-rows').innerHTML = rows.map(([a, b]) => `<i>${a}</i><span>${b}</span>`).join('');
  $('#g-bar').style.display = bar < 0 ? 'none' : '';
  if (bar >= 0) $('#g-bar i').style.width = `${bar * 100}%`;
  const wEl = $('#warn');
  if (wEl.innerHTML !== warn) wEl.innerHTML = warn;
  wEl.style.opacity = warn && (S.time * 3) % 1 < 0.6 ? 1 : warn ? 0.35 : 0;
  S.warn = !!warn;
  // Hinweis Einsteigen
  let prompt = '';
  if (S.mode === 'foot') {
    const nv = nearestVehicle();
    S.near = nv;
    if (nv) prompt = isTouch ? `${nv.def.name} – „Einsteigen“ tippen` : `${keyName(input.bindings.enter[0])} – einsteigen: ${nv.def.name}`;
    touch.layout('foot', nv ? 'Einsteigen' : '');
  } else if (S.mode === 'drive') {
    if (S.veh.kind === 'plane' && S.veh.onGround && S.veh.speed < 1 && S.veh.throttle < 0.05) prompt = isTouch ? '„Schub +“ halten zum Losrollen' : `${keyName(input.bindings.p_thrUp[0])} halten = Schub geben`;
    touch.layout(S.veh.kind === 'plane' ? 'plane' : 'car', 'Aussteigen');
  } else touch.layout('chute', '');
  const pe = $('#prompt');
  if (pe.textContent !== prompt) pe.textContent = prompt;
  pe.classList.toggle('on', !!prompt);
  drawMini();
}

function drawMini() {
  const W = S.world, N = mini.width, c = N / 2;
  const p = focusPos();
  let range = 350;
  if (S.mode === 'drive') range = S.veh.kind === 'plane' ? 2200 + Math.max(0, S.veh.pos.y - W.water) * 1.5 : 450 + S.veh.speed * 6;
  const yaw = focusYaw();
  const k = W.mapCanvas.width / (W.half * 2), s = (N / 2) / range;
  mctx.save();
  mctx.fillStyle = '#20304a'; mctx.fillRect(0, 0, N, N);
  mctx.translate(c, c);
  mctx.rotate(yaw);
  mctx.scale(s / k, s / k);
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(W.mapCanvas, (-W.half - p.x) * k, (-W.half - p.z) * k);
  mctx.restore();
  mctx.save();
  mctx.translate(c, c); mctx.rotate(yaw);
  for (const v of S.vehicles.values()) {
    if (v === S.veh || !v.mesh.visible) continue;
    const x = (v.pos.x - p.x) * s, y = (v.pos.z - p.z) * s;
    if (Math.hypot(x, y) > N / 2) continue;
    mctx.fillStyle = v.kind === 'plane' ? '#4fc3ff' : '#ffd23f';
    mctx.beginPath(); mctx.arc(x, y, 6, 0, 7); mctx.fill();
  }
  // Norden
  const ny = -(N / 2 - 16);
  mctx.rotate(-yaw);
  mctx.restore();
  const na = -yaw - Math.PI / 2;
  mctx.fillStyle = '#fff'; mctx.font = 'bold 24px sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('N', c + Math.cos(-yaw - Math.PI / 2) * (N / 2 - 22), c + Math.sin(-yaw - Math.PI / 2) * (N / 2 - 22));
  void ny; void na;
  mctx.fillStyle = '#ff3d8b'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 3;
  mctx.beginPath(); mctx.moveTo(c, c - 16); mctx.lineTo(c + 11, c + 12); mctx.lineTo(c, c + 6); mctx.lineTo(c - 11, c + 12); mctx.closePath(); mctx.fill(); mctx.stroke();
}

/* ---------- Hauptschleife ---------- */
let last = performance.now();
let crashT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  input.pollGamepad();
  if (!S.running || !S.world) { input.endFrame(); return; }
  if (input.hit('menu') && !S.paused) { pause(); input.endFrame(); return; }
  if (S.paused) { input.endFrame(); renderFrame(); return; }
  S.time += dt;
  const W = S.world;

  // Allgemeine Tasten
  if (input.hit('garage')) { S.paused = true; screenStack = ['s-pause']; $('#hud').hidden = true; $('#touch').hidden = true; openGarage(); }
  if (input.hit('map')) { S.paused = true; screenStack = ['s-pause']; $('#hud').hidden = true; $('#touch').hidden = true; openMap(); }
  if (input.hit('camera')) { S.cam.mode = (S.cam.mode + 1) % 3; S.cam.init = false; toast(['Kamera: Verfolger', S.mode === 'drive' ? 'Kamera: Cockpit' : 'Kamera: nah', 'Kamera: weit'][S.cam.mode], 1200); }
  if (input.hit('horn')) sound.horn();
  if (input.hit('time')) { S.hour = (S.hour + 1) % 24; env.setTime(S.hour, true); toast(`🕒 ${fmtTime(S.hour)}`, 1000); }
  if (set.cycle) { S.hour = (S.hour + dt / 60) % 24; env.setTime(S.hour); }

  if (input.hit('enter')) {
    if (S.mode === 'foot') { const v = nearestVehicle(); if (v) enter(v); }
    else if (S.mode === 'drive') exitVehicle();
  }

  // Fahrzeuge
  for (const v of S.vehicles.values()) {
    const driven = v === S.veh;
    if (v.kind === 'plane') {
      if (v.crashed) continue;
      if (!driven && v.onGround && v.speed < 0.05) { v.t += dt; v.sync(dt); continue; }
      const c = driven ? planeControls(v) : null;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i++) { v.update(dt / steps, c, W, { assist: set.assist }); if (c) c.gear = false; if (v.crashed) break; }
      if (v.crashed) onCrash(v);
    } else {
      if (!driven && v.speed < 0.05 && !v.air) continue;
      v.update(dt, driven ? carControls() : null, W);
      if (driven) {
        if (W.traffic) { const h = W.traffic.bump(v.pos, 1.2); if (h) { v.pos.x += h.x; v.pos.z += h.z; v.vel.multiplyScalar(0.6); } }
        for (const o of S.vehicles.values()) {
          if (o === v || !o.mesh.visible) continue;
          const r = (o.kind === 'car' ? 2.1 : (o.def.model.R || 1) * 1.4 + 0.6) + 2.0;
          const dx = v.pos.x - o.pos.x, dz = v.pos.z - o.pos.z, d = Math.hypot(dx, dz);
          if (d < r && d > 1e-3 && Math.abs(v.pos.y - o.pos.y) < 3) {
            v.pos.x += (dx / d) * (r - d); v.pos.z += (dz / d) * (r - d);
            const n = _v.set(dx / d, 0, dz / d), vn = v.vel.dot(n);
            if (vn < 0) v.vel.addScaledVector(n, -vn * 1.3);
            if (o.kind === 'car') { o.vel.addScaledVector(n, Math.min(vn, 0) * 0.6); }
          }
        }
        if (v.impact > 6) { S.shake = Math.min(1, v.impact / 25); v.impact = 0; }
        if (v.slip > 4 && v.speed > 6) fx.emit(false, _v.copy(v.pos).add(_v2.set(Math.sin(v.yaw) * 1.8, 0.3, Math.cos(v.yaw) * 1.8)), _v2.set(0, 1, 0), 1.6, 1.2, 3, 0xdddddd);
        if (v.sunk) { v.sunk = false; toast('Ab ins Wasser! 🌊 Auto wird zurückgestellt.'); const vv = v; exitVehicle(true); vv.place(vv.home.x, vv.home.z, vv.home.yaw, W); const a = W.spawns.airport; S.player.pos.set(a.x, W.groundAt(a.x, a.z), a.z); }
      }
    }
  }
  if (S.mode === 'foot') updateFoot(dt);
  else if (S.mode === 'chute') updateChute(dt);

  // Jet-Effekte
  if (S.mode === 'drive' && S.veh.kind === 'plane') jetFx(dt, S.veh);
  else { trails.forEach((t) => { t.fade(dt); t.update(); }); cone.visible = false; }

  // Scheinwerfer nachts
  if (S.mode === 'drive' && S.veh.kind === 'car' && env.night > 0.3) {
    const v = S.veh;
    headlight.intensity = 60 * env.night;
    headlight.position.set(v.pos.x - Math.sin(v.yaw) * 2.4, v.pos.y + 0.8, v.pos.z - Math.cos(v.yaw) * 2.4);
    headlight.target.position.set(v.pos.x - Math.sin(v.yaw) * 30, v.pos.y, v.pos.z - Math.cos(v.yaw) * 30);
  } else headlight.intensity = 0;
  headlight.target.updateMatrixWorld();

  updateCamera(dt);
  if (S.shake) { camera.position.x += (Math.random() - 0.5) * S.shake; camera.position.y += (Math.random() - 0.5) * S.shake; S.shake *= Math.exp(-dt * 6); if (S.shake < 0.01) S.shake = 0; }
  W.update(dt, env, camera.position, S.mode === 'drive' ? S.veh.pos : S.player.pos);
  env.update(dt, camera, focusPos());
  fx.update(dt);
  if (bloom) bloom.strength = lerp(0.22, 0.45, env.night);
  // Ton
  const v = S.veh;
  if (S.mode === 'drive' && v.kind === 'car') sound.update({ type: 'car', speed: v.fwdSpeed, vmax: v.def.vmax, throttle: carControls().gas > 0, slip: v.slip, big: v.def.cls !== 'super' });
  else if (S.mode === 'drive') sound.update({ type: v.def.prop ? 'prop' : 'jet', throttle: v.throttle, speed: v.speed, ab: v.ab, big: v.def.id === 'c130', warn: S.warn });
  else sound.update({ type: S.mode === 'chute' ? 'fall' : 'none', speed: Math.abs(S.player.vy) });
  if (crashT > 0) { crashT -= dt; if (crashT <= 0) respawnAfterCrash(); }

  updateHUD(dt);
  renderFrame();
  input.endFrame();
}

function renderFrame() {
  if (composer) composer.render(); else renderer.render(scene, camera);
}

let lastMach = 0;
function jetFx(dt, v) {
  const d = v.def;
  const strong = !v.onGround && (v.g > 4.5 || (v.speed > 120 && v.alpha > 12 * DEG));
  const wing = d.model.wings?.[0];
  if (wing && !wing.swing) {
    const tipX = (wing.span + (wing.x0 || 0)) * 0.98, tipZ = wing.le + wing.sweep + wing.tip;
    for (let i = 0; i < 2; i++) {
      const p = _v.set(i ? tipX : -tipX, wing.y || 0, tipZ).applyQuaternion(v.q).add(v.pos);
      if (strong) trails[i].push(p, v.up, clamp((v.g - 3.5) / 4, 0.25, 1));
      else trails[i].fade(dt);
      trails[i].update();
    }
  } else trails.forEach((t) => { t.fade(dt); t.update(); });
  // Überschall-Kegel
  const mach = v.speed / 340;
  if (lastMach < 1 && mach >= 1) { cone.visible = true; cone.material.opacity = 0.7; S.coneT = 0.9; sound.boom(0.7); S.shake = 0.6; toast('💥 Schallmauer durchbrochen!', 1800); }
  lastMach = mach;
  if (S.coneT > 0) {
    S.coneT -= dt;
    cone.visible = true;
    cone.position.copy(v.pos).addScaledVector(v.fwd, 1.5);
    cone.quaternion.copy(v.q);
    const s = d.model.len / 10;
    cone.scale.set(s, s, s);
    cone.material.opacity = Math.max(0, S.coneT) * 0.8;
  } else cone.visible = false;
  if (v.ab && Math.random() < 0.3) fx.emit(true, _v.set(0, 0, d.model.len / 2 + 3).applyQuaternion(v.q).add(v.pos), _v2.copy(v.vel).multiplyScalar(0.7), 1.2, 0.15, 1);
  if (v.touchdown != null) { if (v.touchdown < -4) { S.shake = 0.5; toast('Harte Landung!', 1500); } else if (v.speed > 20) toast('Saubere Landung ✓', 1500); v.touchdown = null; }
}

function onCrash(v) {
  const pos = v.pos.clone();
  fx.explode(pos, v.def.model.len > 20 ? 2 : 1.4);
  sound.boom(1);
  const W = S.world;
  if (v === S.veh) {
    S.shake = 1;
    toast(v.crashWhy === 'water' ? '💦 Ins Wasser gestürzt! Neustart auf der Startbahn…' : '💥 Absturz! Neustart auf der Startbahn…', 2800);
    crashT = 2.8;
    S.crashed = v;
  } else {
    setTimeout(() => { v.mesh.visible = true; v.place(v.home.x, v.home.z, v.home.yaw, W); }, 4000);
  }
}
function respawnAfterCrash() {
  const v = S.crashed, W = S.world;
  if (!v) return;
  S.crashed = null;
  const rw = v.def.cls === 'jet' || v.def.cls === 'cargo' ? (W.runways.find((r) => r.military) || W.runways[0]) : (W.runways.find((r) => r.main) || W.runways[0]);
  v.mesh.visible = true;
  v.place(rw.start.x, rw.start.z, rw.start.yaw, W);
  S.cam.init = false;
  lastMach = 0;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || !S.running || !S.paused || !$('#keycap').hidden) return;
  if (!$('#choice').hidden) { $('#choice').hidden = true; }
  else if (screenStack.length > 1) back();
  else resume();
  input.pressed.delete(e.code);
});

/* Start */
renderHelp();
show('s-title');
requestAnimationFrame(frame);
window.__jzo = { S, env, scene, camera, renderer, input };
