/* JZo World – Fahrzeugliste + Fahr-/Flugphysik.
   Namen der Autos sind frei erfunden (keine echten Marken). Flugzeuge heißen nach ihrem Typ. */
import * as THREE from 'three';
import { buildCar, buildAircraft } from './models.js';
import { clamp, lerp, smooth, DEG } from './util.js';

const SUPER = (o) => ({ wheelR: 0.35, wheelW: 0.32, wf: 1.45, wr: -1.35, clr: 0.11, intakes: true, exhaust: true, ...o });

export const CARS = [
  { id: 'furia', name: 'Vortex Furia', cls: 'super', info: 'Keil-Supersportwagen, V12', color: 0xff6a00, vmax: 97, acc: 10, grip: 1.25, steer: 0.55, offroad: 0.45, offGrip: 0.6,
    body: SUPER({ L: 4.7, W: 2.05, noseH: 0.52, beltF: 0.45, beltH: 0.82, beltR: -1.25, tailH: 0.98, roofH: 1.14, roofF: -0.15, roofR: -0.85 }) },
  { id: 'rosso', name: 'Rosso Veloce 812', cls: 'super', info: 'Frontmotor-GT, V12', color: 0xc8102e, vmax: 94, acc: 9.5, grip: 1.2, steer: 0.55, offroad: 0.45, offGrip: 0.6,
    body: SUPER({ L: 4.65, W: 1.98, noseH: 0.64, beltF: -0.1, beltH: 0.9, beltR: -1.5, tailH: 0.95, roofH: 1.26, roofF: -0.65, roofR: -1.25, wf: 1.5, intakes: false }) },
  { id: 'bolide', name: 'Bolide W16', cls: 'super', info: 'Hypercar, 16 Zylinder', color: 0x0d2f7a, vmax: 117, acc: 11, grip: 1.2, steer: 0.5, offroad: 0.4, offGrip: 0.55,
    body: SUPER({ L: 4.55, W: 2.05, noseH: 0.6, beltF: 0.35, beltH: 0.86, beltR: -1.0, tailH: 1.02, roofH: 1.2, roofF: -0.25, roofR: -0.75, wing: true }) },
  { id: 'falke', name: 'Falke GT3 RS', cls: 'super', info: 'Rennstrecken-Sportler, Heckmotor', color: 0x2bb673, vmax: 87, acc: 9, grip: 1.45, steer: 0.6, offroad: 0.45, offGrip: 0.6, darkRims: true,
    body: SUPER({ L: 4.57, W: 1.9, noseH: 0.66, beltF: 0.15, beltH: 0.88, beltR: -1.2, tailH: 0.92, roofH: 1.28, roofF: -0.35, roofR: -1.05, wing: true, intakes: false }) },
  { id: 'albion', name: 'Albion Vanquish', cls: 'super', info: 'Britischer Gran Turismo', color: 0x0f3b2c, vmax: 90, acc: 8.5, grip: 1.15, steer: 0.55, offroad: 0.45, offGrip: 0.6,
    body: SUPER({ L: 4.72, W: 1.98, noseH: 0.66, beltF: -0.05, beltH: 0.9, beltR: -1.5, tailH: 0.98, roofH: 1.28, roofF: -0.6, roofR: -1.3, wf: 1.5, intakes: false }) },
  { id: 'phantom', name: 'Phantom 720', cls: 'super', info: 'Mittelmotor, Carbon-Chassis', color: 0xe9e9ec, vmax: 95, acc: 10.5, grip: 1.3, steer: 0.55, offroad: 0.45, offGrip: 0.6, darkRims: true,
    body: SUPER({ L: 4.54, W: 1.93, noseH: 0.55, beltF: 0.5, beltH: 0.82, beltR: -1.0, tailH: 1.0, roofH: 1.19, roofF: -0.05, roofR: -0.75 }) },
  { id: 'nordblitz', name: 'Nordblitz Absolut', cls: 'super', info: 'Schnellster im Spiel – 450 km/h', color: 0x1c1d20, vmax: 125, acc: 11.5, grip: 1.25, steer: 0.5, offroad: 0.4, offGrip: 0.55,
    body: SUPER({ L: 4.6, W: 2.03, noseH: 0.5, beltF: 0.45, beltH: 0.8, beltR: -1.1, tailH: 1.0, roofH: 1.12, roofF: -0.2, roofR: -0.8, wing: true }) },
  { id: 'stingray', name: 'Stingray Corsa', cls: 'super', info: 'Amerikanischer V8-Sportwagen', color: 0xf2c200, vmax: 86, acc: 9, grip: 1.2, steer: 0.55, offroad: 0.45, offGrip: 0.6,
    body: SUPER({ L: 4.63, W: 1.93, noseH: 0.62, beltF: 0.2, beltH: 0.86, beltR: -1.25, tailH: 0.98, roofH: 1.23, roofF: -0.4, roofR: -1.0 }) },
  { id: 'grizzly', name: 'Grizzly XR 1500', cls: 'pickup', info: 'Offroad-Pickup mit Lichtbalken', color: 0x6b7178, vmax: 50, acc: 6, grip: 0.95, steer: 0.6, offroad: 0.9, offGrip: 0.95,
    body: { L: 5.9, W: 2.2, clr: 0.42, noseH: 1.3, beltF: 0.9, beltH: 1.42, beltR: -0.7, cabR: -0.62, tailH: 1.42, roofH: 2.02, roofF: 0.25, roofR: -0.55, wf: 1.85, wr: -1.75, wheelR: 0.45, wheelW: 0.36, grille: true, bed: true, lightbar: true, bumper: true, boxy: true, headTilt: 0 } },
  { id: 'bison', name: 'Bison HD 3500', cls: 'pickup', info: 'Großer Pickup, Chrom-Grill', color: 0x15171a, vmax: 47, acc: 5.2, grip: 0.9, steer: 0.55, offroad: 0.85, offGrip: 0.9, chromeGrille: true,
    body: { L: 5.95, W: 2.12, clr: 0.34, noseH: 1.4, beltF: 0.85, beltH: 1.45, beltR: -0.65, cabR: -0.58, tailH: 1.45, roofH: 2.0, roofF: 0.15, roofR: -0.52, wf: 1.9, wr: -1.75, wheelR: 0.42, wheelW: 0.33, grille: true, bed: true, bumper: false, boxy: true, headTilt: 0 } },
  { id: 'mammut1', name: 'Mammut H1 Militär', cls: 'offroad', info: 'Militär-Geländewagen (Humvee-Stil)', color: 0xb39a6c, matte: true, vmax: 39, acc: 4.6, grip: 0.95, steer: 0.6, offroad: 1, offGrip: 1, darkRims: true,
    body: { L: 4.7, W: 2.25, clr: 0.44, noseH: 1.24, beltF: 0.7, beltH: 1.36, beltR: -1.6, cabR: -1.62, tailH: 1.38, roofH: 1.95, roofF: 0.48, roofR: -1.55, wf: 1.6, wr: -1.7, wheelR: 0.48, wheelW: 0.4, grille: true, bumper: true, boxy: true, pillars: true, hatch: true, headTilt: 0 } },
  { id: 'mammut2', name: 'Mammut H2', cls: 'offroad', info: 'Großer Luxus-Geländewagen', color: 0xf1c500, vmax: 45, acc: 5, grip: 0.9, steer: 0.55, offroad: 0.95, offGrip: 0.95, chromeGrille: true,
    body: { L: 4.82, W: 2.08, clr: 0.38, noseH: 1.2, beltF: 0.75, beltH: 1.3, beltR: -2.35, cabR: -2.38, tailH: 1.35, roofH: 1.98, roofF: 0.5, roofR: -2.3, wf: 1.55, wr: -1.6, wheelR: 0.45, wheelW: 0.36, grille: true, boxy: true, pillars: true, spare: true, lightbar: true, headTilt: 0 } },
];
CARS.forEach((c) => { c.kind = 'car'; c.wheelbase = c.body.wf - c.body.wr; c.brake = 13; c.vrev = 12; });

const ws = (o) => o; // Lesbarkeit
export const PLANES = [
  { id: 'c182', name: 'Privatflieger 182', cls: 'prop', info: 'Einmotoriger Hochdecker (Cessna-182-Klasse)', color: 0xf4f4f2, accent: 0x1f4fa8,
    vs: 26, vmax: 76, thrust: 3.4, ab: 0, roll: 1.5, pitch: 0.9, yaw: 0.5, gMax: 4, stab: 2.2, prop: true, fixedGear: true, cam: [14, 3.5], cockpit: [0, 0.55, -1.0], enterR: 6,
    model: { len: 8.8, R: 0.65, sx: 0.95, sy: 1.15, gearY: 1.15, strobeY: 1.9,
      profile: [[0, 0.12], [0.15, 0.25], [0.45, 0.85], [0.62, 1], [0.82, 1], [0.93, 0.85], [1, 0.45]],
      wings: [ws({ span: 5.4, root: 1.6, tip: 1.25, sweep: 0.15, le: -1.4, t: 0.18, y: 0.85, dih: 1.5, x0: 0.3, nav: true, struts: [1.6, 1.0, 0.1, 0.62] }),
        ws({ span: 1.8, root: 1.0, tip: 0.7, sweep: 0.25, le: 3.2, t: 0.08, y: 0.2, x0: 0.1 })],
      fins: [{ h: 1.6, root: 1.6, tip: 0.8, sweep: 1.1, z: 2.4, t: 0.12, x: 0, y: 0.25 }],
      windows: [-1.2, 0.0, 0.5, 3, 0.62, 0.42], windshield: [-1.75, 0.62, 0.95, 0.5], stripe: [-0.05, -3.6, 3.6, 0.62, 0.12],
      props: [{ xs: [0], y: 0.0, z: -4.4, r: 0.95, blades: 2, spinner: 0.18 }],
      gear: [[0, -3.2, 0.5, 0.22], [-1.1, -0.3, 0.55, 0.26], [1.1, -0.3, 0.55, 0.26]] } },
  { id: 'cx', name: 'Business-Jet CX', cls: 'biz', info: 'Schneller Geschäftsreise-Jet (Citation-Klasse)', color: 0xf5f5f3, accent: 0xb08a3a,
    vs: 50, vmax: 270, thrust: 5.5, ab: 0, roll: 1.3, pitch: 0.65, yaw: 0.4, gMax: 3.5, stab: 2.5, cam: [32, 7], cockpit: [0, 0.5, -8.8], enterR: 12,
    model: { len: 22, R: 1.0, sy: 1.05, gearY: 2.0, strobeY: 4.1,
      profile: [[0, 0.15], [0.12, 0.45], [0.3, 0.95], [0.45, 1], [0.78, 1], [0.9, 0.85], [0.97, 0.5], [1, 0.12]],
      wings: [ws({ span: 9.0, root: 4.6, tip: 1.3, sweep: 4.2, le: -1.0, t: 0.3, y: -0.55, dih: 4, x0: 0.8, nav: true, winglet: 0.9 }),
        ws({ span: 3.4, root: 1.9, tip: 1.0, sweep: 1.3, le: 9.0, t: 0.14, y: 3.95, x0: 0.1 })],
      fins: [{ h: 3.3, root: 3.6, tip: 2.2, sweep: 2.6, z: 6.6, t: 0.22, x: 0, y: 0.7 }],
      jets: [{ xs: [-1.85, 1.85], r: 0.62, len: 3.8, y: 0.75, z: 5.4, nacelle: true, pylon: 0.9 }],
      windows: [-7.5, 2.0, 0.25, 7, 0.99, 0.32], windshield: [-9.4, 0.55, 1.2, 0.5], stripe: [-0.35, -10, 9, 1.0, 0.16],
      gear: [[0, -8.0, 1.0, 0.3], [-1.6, 0.8, 1.0, 0.38], [1.6, 0.8, 1.0, 0.38]] } },
  { id: 'gv', name: 'Langstrecken-Jet G-V', cls: 'biz', info: 'Großer Privatjet (Gulfstream-G5-Klasse)', color: 0xf7f7f7, accent: 0x1c2a44,
    vs: 52, vmax: 262, thrust: 4.6, ab: 0, roll: 1.1, pitch: 0.55, yaw: 0.35, gMax: 3, stab: 2.5, cam: [40, 9], cockpit: [0, 0.65, -11.8], enterR: 15,
    model: { len: 29.4, R: 1.25, sy: 1.05, gearY: 2.5, strobeY: 5.3,
      profile: [[0, 0.15], [0.12, 0.45], [0.3, 0.95], [0.45, 1], [0.78, 1], [0.9, 0.85], [0.97, 0.5], [1, 0.12]],
      wings: [ws({ span: 13.0, root: 6.2, tip: 1.6, sweep: 5.8, le: -1.5, t: 0.38, y: -0.7, dih: 3, x0: 1.0, nav: true, winglet: 1.9 }),
        ws({ span: 4.6, root: 2.5, tip: 1.2, sweep: 1.8, le: 12.0, t: 0.18, y: 5.05, x0: 0.1 })],
      fins: [{ h: 4.2, root: 4.8, tip: 3.0, sweep: 3.4, z: 8.8, t: 0.26, x: 0, y: 0.9 }],
      jets: [{ xs: [-2.3, 2.3], r: 0.8, len: 5.4, y: 0.95, z: 7.0, nacelle: true, pylon: 1.1 }],
      windows: [-10.5, 4.0, 0.3, 9, 1.24, 0.42], windshield: [-12.7, 0.7, 1.5, 0.6], stripe: [-0.45, -13.5, 12, 1.25, 0.2],
      gear: [[0, -11, 1.2, 0.35], [-2.0, 1.2, 1.2, 0.45], [2.0, 1.2, 1.2, 0.45]] } },
  { id: 'f18', name: 'F/A-18 Hornet', cls: 'jet', info: 'Mehrzweck-Kampfjet der Marine', color: 0x8a929b,
    vs: 62, vmax: 520, thrust: 9, ab: 1.7, roll: 4.0, pitch: 1.5, yaw: 0.6, gMax: 9, stab: 3.2, cam: [26, 5.5], cockpit: [0, 0.75, -3.9], enterR: 9, metal: 0.35, rough: 0.5,
    model: { len: 17, R: 0.9, sx: 1.25, sy: 0.85, gearY: 2.2, strobeY: 3.4,
      profile: [[0, 0.55], [0.1, 0.8], [0.3, 1], [0.6, 1], [0.75, 0.8], [0.88, 0.5], [1, 0.05]],
      canopy: [-3.6, 2.8, 0.9, 0.55, 0.6],
      wings: [ws({ span: 5.3, root: 4.5, tip: 1.6, sweep: 2.6, le: -0.2, t: 0.22, y: 0.0, dih: -2, x0: 0.9, nav: true, rails: true }),
        ws({ span: 2.8, root: 2.4, tip: 1.0, sweep: 1.5, le: 5.6, t: 0.12, y: -0.05, dih: -3, x0: 0.8 })],
      strakes: [{ x: 0.85, w: 0.9, z0: -5.0, z1: -0.2, y: 0.0 }],
      fins: [{ h: 3.0, root: 2.9, tip: 1.3, sweep: 2.0, z: 3.4, t: 0.14, x: 1.2, y: 0.5, cant: 20 }, { h: 3.0, root: 2.9, tip: 1.3, sweep: 2.0, z: 3.4, t: 0.14, x: -1.2, y: 0.5, cant: 20 }],
      mirrorBoxes: [{ x: 1.15, y: -0.45, z: -0.8, w: 0.6, h: 0.75, d: 3.2 }, { x: 1.15, y: -0.45, z: -2.42, w: 0.5, h: 0.6, d: 0.05, mat: 'dark' }],
      jets: [{ xs: [-0.6, 0.6], r: 0.55, y: 0, z: 0, nozzleZ: 8.4, ab: true }],
      roundel: [3.6, 0.1, 1.6, 0.4],
      gear: [[0, -5.2, 1.3, 0.28], [-1.6, 0.8, 1.2, 0.38], [1.6, 0.8, 1.2, 0.38]] } },
  { id: 'f14', name: 'F-14 Tomcat', cls: 'jet', info: 'Schwenkflügel-Abfangjäger (Flügel klappen bei Tempo nach hinten)', color: 0xb4bac1,
    vs: 58, vmax: 560, thrust: 8.5, ab: 1.8, roll: 3.2, pitch: 1.4, yaw: 0.6, gMax: 8, stab: 3.0, cam: [28, 6], cockpit: [0, 0.8, -4.9], enterR: 10, metal: 0.35, rough: 0.5, sweep: true,
    model: { len: 19.1, R: 0.95, sx: 1.4, sy: 0.8, gearY: 2.4, strobeY: 3.6,
      profile: [[0, 0.6], [0.15, 0.95], [0.55, 1], [0.7, 0.8], [0.85, 0.5], [1, 0.05]],
      canopy: [-4.5, 3.6, 0.95, 0.6, 0.65], twoSeat: true,
      wings: [ws({ span: 2.4, root: 6.0, tip: 3.0, sweep: 3.0, le: -3.5, t: 0.25, y: 0.15, x0: 0.8 }),
        ws({ swing: true, x0: 3.0, y: 0.15, pivotZ: -0.3, span: 7.0, root: 2.8, tip: 1.3, sweep: 0.6, t: 0.18, sweepMin: 20, sweepMax: 68 }),
        ws({ span: 3.6, root: 2.8, tip: 1.0, sweep: 1.8, le: 6.4, t: 0.12, y: 0.0, x0: 1.2 })],
      fins: [{ h: 3.1, root: 3.0, tip: 1.4, sweep: 2.0, z: 4.5, t: 0.15, x: 1.5, y: 0.4, cant: 5 }, { h: 3.1, root: 3.0, tip: 1.4, sweep: 2.0, z: 4.5, t: 0.15, x: -1.5, y: 0.4, cant: 5 }],
      mirrorBoxes: [{ x: 1.35, y: -0.45, z: 1.0, w: 1.05, h: 1.0, d: 8.5 }, { x: 1.35, y: -0.45, z: -3.27, w: 0.9, h: 0.85, d: 0.05, mat: 'dark' }],
      jets: [{ xs: [-1.35, 1.35], r: 0.6, y: -0.45, z: 0, nozzleZ: 9.9, ab: true }],
      roundel: [2.0, 0.27, -1.0, 0.4],
      gear: [[0, -6.0, 1.4, 0.3], [-2.4, 1.0, 1.4, 0.4], [2.4, 1.0, 1.4, 0.4]] } },
  { id: 'f16', name: 'F-16 Fighting Falcon', cls: 'jet', info: 'Wendiger einstrahliger Kampfjet', color: 0x9aa3ad,
    vs: 65, vmax: 590, thrust: 10, ab: 1.7, roll: 4.6, pitch: 1.6, yaw: 0.6, gMax: 9, stab: 3.2, cam: [23, 5], cockpit: [0, 0.75, -3.6], enterR: 8, metal: 0.35, rough: 0.5,
    model: { len: 15, R: 0.78, gearY: 2.0, strobeY: 3.6,
      profile: [[0, 0.6], [0.08, 0.85], [0.35, 1], [0.62, 1], [0.78, 0.85], [0.9, 0.5], [1, 0.04]],
      canopy: [-3.4, 2.4, 0.85, 0.6, 0.55],
      wings: [ws({ span: 4.0, root: 4.8, tip: 1.1, sweep: 3.6, le: 0.0, t: 0.2, y: 0.0, x0: 0.75, nav: true, rails: true }),
        ws({ span: 2.2, root: 2.3, tip: 1.0, sweep: 1.3, le: 5.1, t: 0.1, y: -0.1, x0: 0.75, dih: -10 })],
      strakes: [{ x: 0.7, w: 0.7, z0: -3.5, z1: 0.1, y: 0.0 }],
      fins: [{ h: 3.0, root: 3.6, tip: 1.3, sweep: 2.4, z: 3.0, t: 0.16, x: 0, y: 0.6 }],
      boxes: [{ x: 0, y: -0.85, z: -1.0, w: 1.0, h: 0.7, d: 3.0 }, { x: 0, y: -0.85, z: -2.52, w: 0.85, h: 0.55, d: 0.05, mat: 'dark' }],
      jets: [{ xs: [0], r: 0.62, y: 0, z: 0, nozzleZ: 7.6, ab: true }],
      roundel: [2.6, 0.1, 2.6, 0.35],
      gear: [[0, -3.3, 1.1, 0.26], [-1.1, 0.6, 1.1, 0.33], [1.1, 0.6, 1.1, 0.33]] } },
  { id: 'c130', name: 'C-130 Hercules', cls: 'cargo', info: 'Viermotoriger Militär-Transporter', color: 0x5f6656, matte: true,
    vs: 40, vmax: 165, thrust: 3.4, ab: 0, roll: 0.75, pitch: 0.45, yaw: 0.3, gMax: 3, stab: 2.2, prop: true, cam: [52, 11], cockpit: [0, 1.35, -12.6], enterR: 18,
    model: { len: 29.8, R: 2.1, sy: 1.05, gearY: 2.75, strobeY: 11.0, upsweep: [5, 0.18],
      profile: [[0, 0.25], [0.18, 0.6], [0.3, 0.95], [0.38, 1], [0.82, 1], [0.92, 0.85], [0.98, 0.55], [1, 0.2]],
      windows: [-13.0, -12.2, 1.1, 2, 1.75, 0.6], windshield: [-13.9, 1.45, 1.9, 0.65],
      wings: [ws({ span: 19.0, root: 4.9, tip: 2.5, sweep: 0.8, le: -3.0, t: 0.55, y: 2.15, dih: 2, x0: 1.2, nav: true }),
        ws({ span: 7.8, root: 3.6, tip: 1.8, sweep: 1.0, le: 11.3, t: 0.25, y: 3.6, x0: 0.5 })],
      props: [{ xs: [-5.0, 5.0, -10.0, 10.0], y: 1.75, z: -5.4, r: 2.05, blades: 4, spinner: 0.35, nacelle: [0.6, 6.0] }],
      fins: [{ h: 7.5, root: 6.0, tip: 3.2, sweep: 3.8, z: 8.5, t: 0.35, x: 0, y: 3.0 }],
      mirrorBoxes: [{ x: 2.0, y: -1.4, z: 0.5, w: 0.8, h: 1.0, d: 6.0 }],
      gear: [[0, -10.5, 1.0, 0.5], [-1.8, -0.6, 0.6, 0.6], [1.8, -0.6, 0.6, 0.6], [-1.8, 1.6, 0.6, 0.6], [1.8, 1.6, 0.6, 0.6]] } },
  { id: 'mig21', name: 'MiG-21 Fishbed', cls: 'jet', info: 'Kalter-Krieg-Abfangjäger mit Deltaflügel', color: 0xb8bcc0, metal: 0.9, rough: 0.28,
    vs: 72, vmax: 600, thrust: 8.5, ab: 1.9, roll: 3.0, pitch: 1.2, yaw: 0.55, gMax: 7, stab: 3.0, cam: [22, 5], cockpit: [0, 0.75, -3.7], enterR: 8,
    model: { len: 14.7, R: 0.68, gearY: 1.95, strobeY: 3.3, insignia: 'star', insigniaPos: [0, 1.9, 4.4],
      profile: [[0, 0.62], [0.1, 0.85], [0.3, 1], [0.65, 1], [0.85, 0.85], [1, 0.7]],
      noseCone: [0.33, 1.2, 0], canopy: [-3.6, 2.0, 0.65, 0.5, 0.5],
      boxes: [{ x: 0, y: 0.55, z: -0.5, w: 0.35, h: 0.4, d: 5.5 }, { x: 0, y: 0, z: -7.3, w: 0.8, h: 0.8, d: 0.05, mat: 'dark' }],
      wings: [ws({ span: 3.25, root: 6.0, tip: 0.3, sweep: 5.5, le: -1.0, t: 0.18, y: -0.15, dih: -2, x0: 0.6, nav: true }),
        ws({ span: 1.6, root: 1.6, tip: 0.3, sweep: 1.3, le: 5.2, t: 0.1, y: -0.1, x0: 0.6 })],
      fins: [{ h: 2.8, root: 3.6, tip: 1.0, sweep: 2.9, z: 2.4, t: 0.14, x: 0, y: 0.6 }],
      jets: [{ xs: [0], r: 0.6, y: 0, z: 0, nozzleZ: 7.55, ab: true }],
      gear: [[0, -3.5, 1.1, 0.25], [-1.4, 0.9, 1.2, 0.35], [1.4, 0.9, 1.2, 0.35]] } },
];
PLANES.forEach((p) => {
  p.kind = 'plane';
  p.dc = p.prop ? (p.thrust * 0.45) / (p.vmax * p.vmax) : (p.thrust * (p.ab || 1)) / (p.vmax * p.vmax);
  p.bellyY = p.model.gearY * 0.42;
});

export const ALL = [...PLANES, ...CARS];
export const byId = (id) => ALL.find((v) => v.id === id);

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

/* ---------- Auto ---------- */
export class Car {
  constructor(def) {
    this.def = def; this.kind = 'car';
    this.mesh = buildCar(def);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0; this.vy = 0; this.steer = 0; this.air = false;
    this.nitro = 1; this.nitroOn = false; this.radius = 2.1; this.slip = 0; this.lastGround = 0; this.braking = false;
    this.home = null;
  }
  place(x, z, yaw, world) {
    const h = world.groundAt(x, z);
    this.pos.set(x, h, z); this.lastGround = h; this.yaw = yaw; this.vel.set(0, 0, 0); this.vy = 0; this.steer = 0; this.pitch = this.roll = 0;
    this.sync(0);
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get fwdSpeed() { return this.vel.x * -Math.sin(this.yaw) + this.vel.z * -Math.cos(this.yaw); }

  update(dt, c, world) {
    const d = this.def;
    c = c || { gas: 0, brake: 0, steer: 0, hand: false, nitro: false };
    let fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vR = this.vel.x * rx + this.vel.z * rz;
    const onRoad = world.isRoad(this.pos.x, this.pos.z);
    this.nitroOn = c.nitro && this.nitro > 0.02 && c.gas > 0;
    this.nitro = clamp(this.nitro + (this.nitroOn ? -0.3 : 0.08) * dt, 0, 1);
    const vmax = d.vmax * (onRoad ? 1 : d.offroad) * (this.nitroOn ? 1.15 : 1);
    this.braking = false;
    let yawRate = 0;
    if (!this.air) {
      if (c.gas > 0) {
        if (vF < -0.5) { vF += d.brake * dt * c.gas; this.braking = true; }
        else vF += d.acc * (this.nitroOn ? 1.6 : 1) * Math.max(0, 1 - Math.pow(Math.max(vF, 0) / vmax, 2)) * dt * c.gas;
      }
      if (c.brake > 0) {
        if (vF > 0.5) { vF -= d.brake * dt * c.brake; this.braking = true; }
        else vF = Math.max(vF - d.acc * 0.5 * dt * c.brake, -d.vrev);
      }
      if (c.hand) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 3 * dt); this.braking = true; }
      const res = (0.3 + (onRoad ? 0 : 1.6) + 0.00016 * vF * vF + (!c.gas && !c.brake ? 0.9 : 0)) * dt;
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), res);
      if (vF > vmax) vF -= (vF - vmax) * 1.5 * dt;
      this.steer += (c.steer - this.steer) * Math.min(1, dt * 7);
      const maxSteer = d.steer / (1 + Math.abs(vF) / 20);
      yawRate = (-vF * Math.tan(this.steer * maxSteer)) / d.wheelbase;
      const gripG = d.grip * 9.81 * (onRoad ? 1 : d.offGrip) * (c.hand ? 0.55 : 1);
      const maxYaw = (gripG / Math.max(Math.abs(vF), 2)) * (c.hand ? 1.8 : 1.1);
      yawRate = clamp(yawRate, -maxYaw, maxYaw);
      this.yaw += yawRate * dt;
      vR *= Math.exp(-(c.hand ? 0.9 : onRoad ? 8 : 4.5) * dt);
      fx = -Math.sin(this.yaw); fz = -Math.cos(this.yaw); rx = Math.cos(this.yaw); rz = -Math.sin(this.yaw);
      this.vel.set(fx * vF + rx * vR, 0, fz * vF + rz * vR);
    }
    this.slip = Math.abs(vR);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;

    // Boden: 4 Radpunkte abtasten
    const b = d.body, hw = b.W / 2 - 0.2;
    const sample = (lx, lz) => world.groundAt(this.pos.x + rx * lx + fx * lz, this.pos.z + rz * lx + fz * lz);
    const hFL = sample(-hw, b.wf), hFR = sample(hw, b.wf), hRL = sample(-hw, b.wr), hRR = sample(hw, b.wr);
    const ground = (hFL + hFR + hRL + hRR) / 4;
    // zu steil? (Mauer / Klippe)
    if (!this.air && ground - this.pos.y > 0.9 + Math.hypot(this.pos.x - ox, this.pos.z - oz)) {
      this.pos.x = ox; this.pos.z = oz; this.vel.multiplyScalar(-0.2);
    } else if (this.pos.y > ground + 0.05 && (this.air || this.vy > 0.5 || this.pos.y - ground > 0.6)) {
      this.vy -= 9.81 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.air = false; this.landed = true; }
      else this.air = true;
      if (this.air) this.vel.multiplyScalar(1 - 0.02 * dt);
    } else {
      this.vy = clamp((ground - this.lastGround) / Math.max(dt, 1e-3), -30, 14);
      this.pos.y = ground; this.air = false;
    }
    this.lastGround = ground;
    if (!this.air) {
      const tp = Math.atan2((hFL + hFR) / 2 - (hRL + hRR) / 2, b.wf - b.wr);
      const tr = Math.atan2((hFR + hRR) / 2 - (hFL + hRL) / 2, hw * 2);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * 10);
      this.roll += (tr + clamp(yawRate * vF * 0.0025, -0.06, 0.06) - this.roll) * Math.min(1, dt * 8);
    }
    // Gebäude
    const hit = world.collide(this.pos, this.radius, this.pos.y + 1.2);
    if (hit) {
      this.pos.x += hit.x; this.pos.z += hit.z;
      const n = _v.set(hit.x, 0, hit.z).normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) { this.vel.addScaledVector(n, -vn * 1.25); this.impact = -vn; }
    }
    if (ground < world.water - 0.9 && this.pos.y < world.water - 0.6) this.sunk = true;
    this.sync(dt, vF);
  }
  sync(dt, vF = 0) {
    this.mesh.position.copy(this.pos);
    _e.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.mesh.quaternion.setFromEuler(_e);
    const u = this.mesh.userData;
    const r = this.def.body.wheelR;
    for (const w of u.wheels) {
      w.spin.rotation.x -= (vF * dt) / r;
      if (w.front) w.holder.rotation.y = -this.steer * (this.def.steer / (1 + Math.abs(vF) / 20));
    }
    for (const f of u.flames) { f.visible = !!this.nitroOn; f.scale.z = 0.8 + Math.random() * 0.6; }
  }
}

/* ---------- Flugzeug ---------- */
function liftCurve(aDeg) {
  if (aDeg > 15) return Math.max(5, 17 - (aDeg - 15) * 1.3);
  if (aDeg < -14) return Math.min(-4, -12 + (-aDeg - 14) * 1.3);
  return aDeg + 2;
}

export class Plane {
  constructor(def) {
    this.def = def; this.kind = 'plane';
    this.mesh = buildAircraft(def);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.rates = new THREE.Vector3();
    this.throttle = 0; this.ab = false; this.gearDown = true; this.onGround = true; this.crashed = false;
    this.alpha = 0; this.g = 1; this.stall = false; this.sweep = def.model.wings?.find((w) => w.swing)?.sweepMin || 0;
    this.radius = def.enterR * 0.55; this.home = null; this.t = Math.random() * 3;
    this.fwd = new THREE.Vector3(); this.up = new THREE.Vector3(); this.right = new THREE.Vector3();
  }
  get speed() { return this.vel.length(); }
  place(x, z, yaw, world, alt = null, speed = 0) {
    this.crashed = false;
    _e.set(0, yaw, 0, 'YXZ'); this.q.setFromEuler(_e);
    this.rates.set(0, 0, 0);
    if (alt == null) {
      this.pos.set(x, world.groundAt(x, z) + this.def.model.gearY, z);
      this.vel.set(0, 0, 0); this.throttle = 0; this.gearDown = true; this.onGround = true;
    } else {
      this.pos.set(x, alt, z);
      this.vel.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(speed);
      this.throttle = 0.75; this.gearDown = !!this.def.fixedGear; this.onGround = false;
    }
    this.axes();
    this.sync(0);
  }
  axes() {
    this.fwd.set(0, 0, -1).applyQuaternion(this.q);
    this.up.set(0, 1, 0).applyQuaternion(this.q);
    this.right.set(1, 0, 0).applyQuaternion(this.q);
  }
  get altitude() { return this.pos.y; }
  get bank() { return Math.atan2(this.right.y, this.up.y); }
  get pitchAngle() { return Math.asin(clamp(this.fwd.y, -1, 1)); }
  get heading() { return Math.atan2(this.fwd.x, -this.fwd.z); }

  update(dt, c, world, opts = {}) {
    if (this.crashed) return;
    const d = this.def;
    const pilot = !!c;
    c = c || { pitch: 0, roll: 0, yaw: 0, thr: 0, ab: false, brake: false };
    this.throttle = clamp(this.throttle + c.thr * 0.6 * dt, 0, 1);
    if (c.thrSet != null) this.throttle = c.thrSet;
    this.ab = !!(c.ab && d.ab);
    if (this.ab) this.throttle = Math.max(this.throttle, 0.95);
    if (c.gear && !this.onGround && !d.fixedGear) this.gearDown = !this.gearDown;

    this.axes();
    let V = this.vel.length();
    const auth = this.onGround ? (V > d.vs * 0.6 ? 0.8 : 0) : clamp(V / d.vs, 0.25, 1.15);
    const tgt = _v.set(c.pitch * d.pitch, c.yaw * d.yaw, c.roll * d.roll);
    if (pilot && opts.assist && !this.onGround && Math.abs(c.roll) < 0.1) {
      const bank = this.bank;
      if (Math.abs(bank) < 1.4) tgt.z += clamp(-bank * 1.4, -0.7, 0.7) * Math.min(d.roll, 1.5) * 0.6;
    }
    this.rates.lerp(tgt, 1 - Math.exp(-dt * 6));
    if (!this.onGround) {
      this.q.multiply(_q.setFromAxisAngle(AX, this.rates.x * auth * dt));
      this.q.multiply(_q.setFromAxisAngle(AY, -this.rates.y * auth * dt));
      this.q.multiply(_q.setFromAxisAngle(AZ, -this.rates.z * auth * dt));
      // Stabilität: Nase folgt der Flugrichtung
      if (V > 5) {
        const vdir = _v2.copy(this.vel).divideScalar(V);
        if (this.fwd.dot(vdir) > 0) {
          const axis = _v.crossVectors(this.fwd, vdir);
          const s = axis.length();
          if (s > 1e-5) {
            const ang = Math.asin(Math.min(s, 1));
            const k = d.stab * clamp(V / d.vs, 0, 3);
            _q.setFromAxisAngle(axis.divideScalar(s), Math.min(ang, ang * k * dt));
            this.q.premultiply(_q);
          }
        }
      }
      this.q.normalize();
      this.axes();
    }

    // Kräfte
    const acc = _v.set(0, 0, 0);
    let aL = 0;
    if (V > 1) {
      const vdir = _v2.copy(this.vel).divideScalar(V);
      const vu = this.vel.dot(this.up), vf = this.vel.dot(this.fwd);
      this.alpha = Math.atan2(-vu, vf);
      const aDeg = this.alpha / DEG;
      aL = 9.81 * (V / d.vs) * (V / d.vs) * (liftCurve(aDeg) / 12);
      aL = clamp(aL, -d.gMax * 4.9, d.gMax * 9.81);
      const ud = this.up.dot(vdir);
      const lift = new THREE.Vector3().copy(this.up).addScaledVector(vdir, -ud);
      if (lift.lengthSq() > 1e-6) acc.addScaledVector(lift.normalize(), aL);
      const drag = d.dc * V * V * (1 + (this.gearDown && !d.fixedGear ? 0.25 : 0)) + 0.5 * Math.abs(aL) * Math.abs(Math.sin(this.alpha));
      acc.addScaledVector(vdir, -drag);
      acc.addScaledVector(this.right, -this.vel.dot(this.right) * 1.2);
      this.stall = !this.onGround && (aDeg > 15 || V < d.vs * 0.92);
    } else { this.alpha = 0; this.stall = false; }
    const T = this.throttle * d.thrust * (this.ab ? d.ab : 1) * (d.prop ? 1 - 0.55 * Math.min(V / d.vmax, 1) : 1);
    acc.addScaledVector(this.fwd, T);
    acc.y -= 9.81;
    this.g = aL / 9.81 + this.up.y * 0;
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // Schwenkflügel (F-14)
    if (this.mesh.userData.sweepers.length) {
      const w = d.model.wings.find((x) => x.swing);
      const target = lerp(w.sweepMin, w.sweepMax, smooth(110, 290, V));
      this.sweep += (target - this.sweep) * Math.min(1, dt * 0.8);
    }

    // Boden
    const gh = world.groundAt(this.pos.x, this.pos.z);
    const contact = this.gearDown ? d.model.gearY : d.bellyY;
    if (this.pos.y - contact <= gh) {
      const wet = gh < world.water - 0.3 && world.isWater(this.pos.x, this.pos.z);
      if (!this.onGround) {
        const vy = this.vel.y;
        const bank = Math.abs(this.bank), pa = this.pitchAngle;
        if (wet || vy < -9 || bank > 32 * DEG || pa < -12 * DEG || (!this.gearDown && V > 18)) { this.crash(wet ? 'water' : 'ground'); return; }
        this.touchdown = vy;
      } else if (wet) { this.crash('water'); return; }
      this.onGround = true;
      this.pos.y = gh + contact;
      if (this.vel.y < 0) this.vel.y = 0;
      _e.setFromQuaternion(this.q, 'YXZ');
      let pitch = _e.x, yaw = _e.y;
      const fh = _v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      let vf = this.vel.x * fh.x + this.vel.z * fh.z;
      const fr = (0.25 + (c.brake ? 7 : 0) + (this.throttle < 0.05 && Math.abs(vf) < 4 ? 1.2 : 0) + (this.gearDown ? 0 : 6)) * dt;
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), fr);
      const steer = clamp(c.yaw + c.roll * 0.7, -1, 1);
      yaw -= steer * (0.9 / (1 + Math.abs(vf) / 12)) * dt * Math.min(1, Math.abs(vf) / 2 + 0.3);
      pitch += this.rates.x * auth * dt;
      if (pitch < 0) pitch = Math.min(0, pitch + dt);
      pitch = clamp(pitch, -0.02, 15 * DEG);
      if (V < d.vs * 0.5) pitch += (0 - pitch) * Math.min(1, dt * 2);
      _e.set(pitch, yaw, 0, 'YXZ');
      this.q.setFromEuler(_e);
      this.vel.x = -Math.sin(yaw) * vf; this.vel.z = -Math.cos(yaw) * vf;
      this.axes();
    } else if (this.pos.y - contact > gh + 0.05) {
      this.onGround = false;
    }
    if (world.hitBuilding(this.pos, 2.5)) { this.crash('building'); return; }
    this.t += dt;
    this.sync(dt);
  }
  crash(why) { this.crashed = true; this.crashWhy = why; this.mesh.visible = false; }
  sync(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.q);
    const u = this.mesh.userData;
    for (const p of u.props) {
      const spin = this.throttle * 70 + Math.min(this.vel.length(), 40) * 0.6;
      p.blades.rotation.z += spin * dt;
      p.disc.visible = spin > 12;
      p.blades.visible = spin < 45;
    }
    for (const f of u.flames) {
      f.visible = this.ab;
      if (this.ab) { const k = 0.85 + Math.random() * 0.35; f.scale.set(1, 1, k); }
    }
    u.gear.visible = this.gearDown;
    for (const s of u.sweepers) s.piv.rotation.y = -s.side * (this.sweep - 15) * DEG;
    for (const s of u.navStrobe) s.material.emissiveIntensity = this.t % 1.3 < 0.07 ? 12 : 0;
  }
}

export function createVehicle(def) { return def.kind === 'plane' ? new Plane(def) : new Car(def); }
