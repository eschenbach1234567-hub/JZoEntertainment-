/* JZo World – Eingabe: Tastatur (frei belegbar), Touch-Steuerung, Gamecontroller */

export const CONTEXTS = { general: 'Allgemein', foot: 'Zu Fuß', car: 'Auto', plane: 'Flugzeug' };

export const ACTIONS = [
  { id: 'menu', ctx: 'general', label: 'Pause / Menü', keys: ['Escape', 'KeyP'] },
  { id: 'enter', ctx: 'general', label: 'Ein- / Aussteigen', keys: ['KeyF', 'Enter'] },
  { id: 'garage', ctx: 'general', label: 'Fahrzeug holen', keys: ['KeyV', ''] },
  { id: 'camera', ctx: 'general', label: 'Kamera wechseln', keys: ['KeyC', ''] },
  { id: 'map', ctx: 'general', label: 'Große Karte', keys: ['KeyM', ''] },
  { id: 'horn', ctx: 'general', label: 'Hupe', keys: ['KeyH', ''] },
  { id: 'time', ctx: 'general', label: 'Tageszeit weiterdrehen', keys: ['KeyT', ''] },

  { id: 'f_fwd', ctx: 'foot', label: 'Vorwärts', keys: ['KeyW', 'ArrowUp'] },
  { id: 'f_back', ctx: 'foot', label: 'Rückwärts', keys: ['KeyS', 'ArrowDown'] },
  { id: 'f_left', ctx: 'foot', label: 'Links drehen', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'f_right', ctx: 'foot', label: 'Rechts drehen', keys: ['KeyD', 'ArrowRight'] },
  { id: 'f_run', ctx: 'foot', label: 'Rennen', keys: ['ShiftLeft', 'ShiftRight'] },
  { id: 'f_jump', ctx: 'foot', label: 'Springen', keys: ['Space', ''] },

  { id: 'c_gas', ctx: 'car', label: 'Gas', keys: ['KeyW', 'ArrowUp'] },
  { id: 'c_brake', ctx: 'car', label: 'Bremse / Rückwärts', keys: ['KeyS', 'ArrowDown'] },
  { id: 'c_left', ctx: 'car', label: 'Lenken links', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'c_right', ctx: 'car', label: 'Lenken rechts', keys: ['KeyD', 'ArrowRight'] },
  { id: 'c_hand', ctx: 'car', label: 'Handbremse (Drift)', keys: ['Space', ''] },
  { id: 'c_nitro', ctx: 'car', label: 'Nitro', keys: ['ShiftLeft', 'ShiftRight'] },

  { id: 'p_down', ctx: 'plane', label: 'Nase runter', keys: ['KeyW', 'ArrowUp'] },
  { id: 'p_up', ctx: 'plane', label: 'Nase hoch', keys: ['KeyS', 'ArrowDown'] },
  { id: 'p_rollL', ctx: 'plane', label: 'Rollen links', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'p_rollR', ctx: 'plane', label: 'Rollen rechts', keys: ['KeyD', 'ArrowRight'] },
  { id: 'p_yawL', ctx: 'plane', label: 'Seitenruder links', keys: ['KeyQ', ''] },
  { id: 'p_yawR', ctx: 'plane', label: 'Seitenruder rechts', keys: ['KeyE', ''] },
  { id: 'p_thrUp', ctx: 'plane', label: 'Schub mehr', keys: ['ShiftLeft', 'KeyR'] },
  { id: 'p_thrDown', ctx: 'plane', label: 'Schub weniger', keys: ['ControlLeft', 'KeyX'] },
  { id: 'p_ab', ctx: 'plane', label: 'Nachbrenner', keys: ['Space', ''] },
  { id: 'p_gear', ctx: 'plane', label: 'Fahrwerk ein/aus', keys: ['KeyG', ''] },
  { id: 'p_brake', ctx: 'plane', label: 'Radbremse', keys: ['KeyB', ''] },
];

const KEYNAMES = {
  Space: 'Leertaste', Enter: 'Enter', Escape: 'Esc', ShiftLeft: 'Shift links', ShiftRight: 'Shift rechts',
  ControlLeft: 'Ctrl links', ControlRight: 'Ctrl rechts', AltLeft: 'Alt/⌥ links', AltRight: 'Alt/⌥ rechts',
  MetaLeft: '⌘ links', MetaRight: '⌘ rechts', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Tab: 'Tab', Backspace: '⌫', CapsLock: 'Feststell', Comma: ',', Period: '.', Minus: '-', Slash: '-',
  Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Ü', BracketRight: '+', Backslash: '#', IntlBackslash: '<',
};
export function keyName(code) {
  if (!code) return '–';
  if (KEYNAMES[code]) return KEYNAMES[code];
  if (code.startsWith('Key')) {
    const k = code.slice(3);
    return k === 'Y' ? 'Z' : k === 'Z' ? 'Y' : k; // deutsche Tastatur: Z und Y vertauscht
  }
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();     // Tasten, die in diesem Frame neu gedrückt wurden
    this.touch = {};              // Aktions-ID -> true (gehalten)
    this.touchPressed = new Set();
    this.stick = { x: 0, y: 0, active: false };
    this.look = { dx: 0, dy: 0 };
    this.bindings = {};
    this.capture = null;          // Callback beim Tasten-Neubelegen
    this.enabled = true;
    this.gp = null; this.gpPrev = [];
    this.resetBindings();

    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(e.code); return; }
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.metaKey && e.code !== 'MetaLeft' && e.code !== 'MetaRight') return; // ⌘-Kürzel dem Browser lassen
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.enabled && this.isBound(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.touch = {}; });
  }

  resetBindings() {
    this.bindings = {};
    for (const a of ACTIONS) this.bindings[a.id] = a.keys.slice();
  }
  load(obj) {
    if (!obj) return;
    for (const a of ACTIONS) if (Array.isArray(obj[a.id])) this.bindings[a.id] = [obj[a.id][0] || '', obj[a.id][1] || ''];
  }
  isBound(code) {
    for (const id in this.bindings) if (this.bindings[id].includes(code)) return true;
    return false;
  }
  /* Belegt eine Taste neu; entfernt sie von Aktionen, die gleichzeitig aktiv sein können (gleicher Bereich oder "Allgemein") */
  bind(actionId, slot, code) {
    const act = ACTIONS.find((a) => a.id === actionId);
    const removed = [];
    if (code) {
      for (const a of ACTIONS) {
        if (a.id === actionId) continue;
        if (a.ctx !== act.ctx && a.ctx !== 'general' && act.ctx !== 'general') continue;
        const b = this.bindings[a.id];
        for (let i = 0; i < 2; i++) if (b[i] === code) { b[i] = ''; removed.push(a.label); }
      }
    }
    this.bindings[actionId][slot] = code;
    return removed;
  }

  held(id) {
    if (this.touch[id]) return true;
    const b = this.bindings[id];
    return !!b && ((b[0] && this.down.has(b[0])) || (b[1] && this.down.has(b[1])));
  }
  hit(id) {
    if (this.touchPressed.has(id)) return true;
    const b = this.bindings[id];
    return !!b && ((b[0] && this.pressed.has(b[0])) || (b[1] && this.pressed.has(b[1])));
  }
  axis(neg, pos) { return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0); }

  /* Gamecontroller abfragen (einmal pro Frame) */
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gp = null;
    for (const p of pads) if (p && p.connected) { this.gp = p; break; }
    if (!this.gp) return;
    const b = this.gp.buttons.map((x) => x.pressed);
    const map = { 0: 'enter', 1: 'camera', 3: 'garage', 9: 'menu', 8: 'map', 12: 'p_gear' };
    for (const i in map) if (b[i] && !this.gpPrev[i]) this.touchPressed.add(map[i]);
    this.gpPrev = b;
  }
  gpAxis(i) {
    if (!this.gp || !this.gp.axes[i]) return 0;
    const v = this.gp.axes[i];
    return Math.abs(v) < 0.12 ? 0 : v;
  }
  gpBtn(i) { return !!(this.gp && this.gp.buttons[i] && this.gp.buttons[i].value > 0.2) ? this.gp.buttons[i].value : 0; }

  endFrame() { this.pressed.clear(); this.touchPressed.clear(); this.look.dx = 0; this.look.dy = 0; }
}

/* --- Touch-Steuerung --- */
const TOUCH_LAYOUT = {
  foot: [['f_jump', 'Springen', 'big'], ['f_run', 'Rennen'], ['enter', 'Einsteigen']],
  car: [['c_gas', 'Gas', 'big'], ['c_brake', 'Bremse'], ['c_hand', 'Drift'], ['c_nitro', 'Nitro'], ['enter', 'Aussteigen']],
  plane: [['p_thrUp', 'Schub +', 'big'], ['p_thrDown', 'Schub −'], ['p_ab', 'Nachbrenner'], ['p_yawL', '◀ Ruder'], ['p_yawR', 'Ruder ▶'], ['p_gear', 'Fahrwerk'], ['p_brake', 'Bremse'], ['enter', 'Aussteigen']],
  chute: [['enter', '—']],
};

export function setupTouch(input, root) {
  const stickEl = root.querySelector('.stick');
  const knob = stickEl.querySelector('.knob');
  const btnBox = root.querySelector('.tbtns');
  let stickId = null, cx = 0, cy = 0;
  const R = 55;
  stickEl.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId; stickEl.setPointerCapture(e.pointerId);
    const r = stickEl.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e); e.preventDefault();
  });
  function move(e) {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.stick.x = dx / R; input.stick.y = dy / R; input.stick.active = true;
  }
  stickEl.addEventListener('pointermove', move);
  const end = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; knob.style.transform = ''; input.stick.x = 0; input.stick.y = 0; input.stick.active = false;
  };
  stickEl.addEventListener('pointerup', end);
  stickEl.addEventListener('pointercancel', end);

  let current = '';
  function layout(ctx, enterLabel) {
    const key = ctx + '|' + enterLabel;
    if (key === current) return;
    current = key;
    btnBox.innerHTML = '';
    input.touch = {};
    for (const [id, label, cls] of TOUCH_LAYOUT[ctx] || []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbtn' + (cls ? ' ' + cls : '') + (id === 'enter' ? ' enter' : '');
      b.textContent = id === 'enter' && enterLabel ? enterLabel : label;
      if (id === 'enter' && !enterLabel && ctx === 'foot') b.style.visibility = 'hidden';
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); input.touch[id] = true; input.touchPressed.add(id); b.classList.add('on'); });
      const up = () => { input.touch[id] = false; b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      btnBox.appendChild(b);
    }
  }
  root.querySelectorAll('[data-tap]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); input.touchPressed.add(b.dataset.tap); });
  });
  return { layout };
}
