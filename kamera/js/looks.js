/* M1993 – Bildstile ("Looks"), Weißabgleich, Wählräder.
   Die Looks sind eigene Nachbauten im Stil klassischer Messsucher-Kameras – keine Original-Dateien
   eines Herstellers. Alle Werte sind Parameter für den Shader in gl.js.

   Look-Parameter (alle optional, Standard = neutral):
     con    Kontrast (−1 … +1)          sat   Sättigung (1 = normal)     vib  Lebendigkeit
     hi     Lichter (− = zurückholen)   sh    Schatten (+ = aufhellen)   fade Schwarz anheben (0 … 0.15)
     warm   Wärme (−/+)                 tint  Grün/Magenta
     green  Sättigung Grüntöne (1 = normal)   blue  Blautöne abdunkeln (0 … 1)   red Rot/Orange-Sättigung
     shC/shA  Schattentönung Farbe/Stärke     hiC/hiA  Lichtertönung Farbe/Stärke
     mono   Schwarzweiß-Kanalmischung [r,g,b] toneS/toneH Tonung Schatten/Lichter, tone Stärke
     grain  Korn (0 … 1)  vig Vignette (0 … 1)  sharp Schärfe (0 … 1) */
(function (global) {
  'use strict';

  var LOOKS = [
    { id: 'standard', name: 'Standard', group: 'Farbe', desc: 'Neutral, natürlich, leicht knackig.',
      p: { con: 0.12, sat: 1.0, sharp: 0.35 } },
    { id: 'lebendig', name: 'Lebendig', group: 'Farbe', desc: 'Kräftige Farben, mehr Kontrast.',
      p: { con: 0.28, sat: 1.28, vib: 0.2, sharp: 0.4 } },
    { id: 'natur', name: 'Natürlich', group: 'Farbe', desc: 'Weich, flach, viel Zeichnung in den Lichtern.',
      p: { con: -0.05, sat: 0.95, hi: -0.35, sh: 0.15, sharp: 0.25 } },
    { id: 'chrom', name: 'Chrom', group: 'Farbe', desc: 'Satte, tiefe Farben, dunkle Blautöne, ruhige Grüns – Dia-Film-Charakter.',
      p: { con: 0.25, sat: 1.12, blue: 0.35, green: 0.8, red: 1.08, warm: 0.04, shC: [0.47, 0.5, 0.56], shA: 0.25, sharp: 0.35 } },
    { id: 'chromk', name: 'Chrom Kontrast', group: 'Farbe', desc: 'Wie Chrom, aber härter – tiefe Schatten, Straße & Architektur.',
      p: { con: 0.5, sat: 1.15, blue: 0.5, green: 0.72, red: 1.1, hi: -0.15, shC: [0.46, 0.5, 0.57], shA: 0.3, vig: 0.25, sharp: 0.45 } },
    { id: 'klassik', name: 'Klassik', group: 'Farbe', desc: 'Warm, gedämpft, angehobene Schwarztöne – wie ein alter Farbfilm.',
      p: { con: 0.08, sat: 0.78, fade: 0.06, warm: 0.22, green: 0.75, hiC: [0.56, 0.52, 0.44], hiA: 0.3, grain: 0.25, vig: 0.2, sharp: 0.2 } },
    { id: 'zeitgeist', name: 'Zeitgeist', group: 'Farbe', desc: 'Modern & kühl: kühle Schatten, warme Hauttöne, klare Kontraste.',
      p: { con: 0.3, sat: 0.92, blue: 0.2, green: 0.85, shC: [0.42, 0.52, 0.58], shA: 0.45, hiC: [0.56, 0.52, 0.47], hiA: 0.2, sharp: 0.4 } },
    { id: 'kino', name: 'Kino', group: 'Farbe', desc: 'Filmisch, entsättigt, Türkis-Schatten & warme Lichter.',
      p: { con: 0.02, sat: 0.7, fade: 0.08, hi: -0.2, green: 0.6, shC: [0.4, 0.53, 0.57], shA: 0.55, hiC: [0.58, 0.51, 0.42], hiA: 0.35, vig: 0.3, grain: 0.15, sharp: 0.2 } },
    { id: 'sw', name: 'S/W Natur', group: 'Schwarzweiß', desc: 'Ausgewogenes Schwarzweiß mit vielen Grautönen.',
      p: { mono: [0.3, 0.59, 0.11], con: 0.15, sharp: 0.4 } },
    { id: 'swk', name: 'S/W Kontrast', group: 'Schwarzweiß', desc: 'Hartes Schwarzweiß, dramatischer Himmel (Rotfilter-Effekt).',
      p: { mono: [0.55, 0.4, 0.05], con: 0.6, sh: -0.1, grain: 0.3, vig: 0.25, sharp: 0.5 } },
    { id: 'selen', name: 'Selen', group: 'Schwarzweiß', desc: 'Schwarzweiß mit kühl-violetten Schatten wie Selen-getonte Abzüge.',
      p: { mono: [0.33, 0.55, 0.12], con: 0.3, toneS: [0.46, 0.42, 0.55], toneH: [0.51, 0.5, 0.49], tone: 0.85, sharp: 0.4 } },
    { id: 'sepia', name: 'Sepia', group: 'Schwarzweiß', desc: 'Warmer Braunton – nostalgisch.',
      p: { mono: [0.33, 0.55, 0.12], con: 0.12, fade: 0.04, toneS: [0.6, 0.47, 0.35], toneH: [0.58, 0.51, 0.4], tone: 0.85, grain: 0.2, vig: 0.2, sharp: 0.3 } },
    { id: 'blau', name: 'Blau', group: 'Schwarzweiß', desc: 'Kühle, blaue Tonung – wie Cyanotypie.',
      p: { mono: [0.3, 0.59, 0.11], con: 0.2, toneS: [0.36, 0.45, 0.62], toneH: [0.46, 0.5, 0.56], tone: 0.8, sharp: 0.35 } },
    { id: 'film', name: 'Film 400', group: 'Schwarzweiß', desc: 'Körniger Schwarzweißfilm, satte Mitteltöne.',
      p: { mono: [0.36, 0.52, 0.12], con: 0.35, fade: 0.03, grain: 0.6, vig: 0.15, sharp: 0.3 } }
  ];

  // Weißabgleich: Verschiebung gegenüber dem automatischen Abgleich des iPhones.
  var WB = [
    { id: 'auto', name: 'Auto', short: 'AWB', warm: 0, tint: 0 },
    { id: 'sonne', name: 'Tageslicht', short: '☀︎', warm: 0.06, tint: 0 },
    { id: 'wolke', name: 'Bewölkt', short: '☁︎', warm: 0.18, tint: 0.02 },
    { id: 'schatten', name: 'Schatten', short: '◐', warm: 0.3, tint: 0.03 },
    { id: 'kunst', name: 'Kunstlicht', short: '💡', warm: -0.4, tint: 0 },
    { id: 'leucht', name: 'Leuchtstoff', short: '▭', warm: -0.18, tint: 0.12 },
    { id: 'blitz', name: 'Blitz', short: 'ϟ', warm: 0.1, tint: 0 }
  ];

  var ISO = ['A', 64, 100, 200, 400, 800, 1600, 3200, 6400, 12500, 25000, 50000];
  var TIME = ['A', '1/4000', '1/2000', '1/1000', '1/500', '1/250', '1/125', '1/60', '1/30', '1/15', '1/8', '1/4', '1/2', '1s'];
  var EV = []; for (var i = -9; i <= 9; i++) EV.push(i / 3);
  var FRAMES = [0, 28, 35, 50, 75, 90, 135]; // 0 = volle Linse (kein Leuchtrahmen)
  var FORMATS = [
    { id: '3:2', w: 3, h: 2, name: '3:2 (Kleinbild)' },
    { id: '4:3', w: 4, h: 3, name: '4:3 (Sensor voll)' },
    { id: '1:1', w: 1, h: 1, name: '1:1' },
    { id: '4:5', w: 5, h: 4, name: '4:5 (Instagram)' },
    { id: '16:9', w: 16, h: 9, name: '16:9' }
  ];
  var RES = [
    { id: 'L', name: 'L – volle Auflösung', f: 1 },
    { id: 'M', name: 'M – halbe Pixelzahl', f: Math.SQRT1_2 },
    { id: 'S', name: 'S – Viertel', f: 0.5 }
  ];

  function timeSec(t) { if (t === 'A') return null; if (t === '1s') return 1; var p = String(t).split('/'); return 1 / Number(p[1]); }
  function evText(v) {
    if (Math.abs(v) < 0.01) return '±0';
    var s = v > 0 ? '+' : '−', a = Math.abs(v), w = Math.floor(a + 1e-6), f = Math.round((a - w) * 3);
    return s + (w ? w : '') + (f ? (w ? ' ' : '') + f + '/3' : '');
  }

  // Simulierte Belichtung wie an der echten Kamera:
  //  Zeit A + ISO A  → Automatik (nur EV-Korrektur)
  //  Zeit A + ISO x  → Helligkeit bleibt (Automatik gleicht aus), höhere ISO = mehr Rauschen/Korn
  //  Zeit x + ISO A  → Helligkeit bleibt (Auto-ISO), sehr kurze Zeiten = etwas mehr Rauschen
  //  Zeit x + ISO x  → manuell: Helligkeit relativ zu „richtig belichtet“ (ISO 200, 1/125 s)
  function exposure(s) {
    var ev = s.ev || 0, noise = 0, t = timeSec(s.time), iso = s.iso;
    if (iso !== 'A') noise = Math.max(0, Math.log2(iso / 200)) / 8;
    if (t !== null && iso === 'A') noise = Math.max(0, Math.log2((1 / 125) / t)) / 10;
    if (t !== null && iso !== 'A') ev += Math.log2(iso / 200) + Math.log2(t * 125);
    return { ev: ev, noise: Math.min(1, noise) };
  }

  // Aus Look + persönlichen Feinabstimmungen (−2 … +2 wie im Kamera-Menü) die Shader-Werte bauen.
  function params(s) {
    var look = byId(s.look) || LOOKS[0], p = look.p, a = s.adj || {}, wb = WB.filter(function (w) { return w.id === s.wb; })[0] || WB[0];
    var ex = exposure(s);
    function n(v, d) { return v === undefined ? d : v; }
    var mono = p.mono || null;
    return {
      ev: ex.ev,
      warm: n(p.warm, 0) + wb.warm + (a.warm || 0) * 0.08,
      tint: n(p.tint, 0) + wb.tint,
      con: n(p.con, 0) + (a.con || 0) * 0.15,
      hi: n(p.hi, 0) + (a.hi || 0) * 0.2,
      sh: n(p.sh, 0) + (a.sh || 0) * 0.15,
      fade: n(p.fade, 0),
      sat: mono ? 1 : Math.max(0, n(p.sat, 1) * (1 + (a.sat || 0) * 0.18)),
      vib: n(p.vib, 0),
      green: n(p.green, 1), blue: n(p.blue, 0), red: n(p.red, 1),
      shC: p.shC || [0.5, 0.5, 0.5], shA: n(p.shA, 0),
      hiC: p.hiC || [0.5, 0.5, 0.5], hiA: n(p.hiA, 0),
      mono: mono, toneS: p.toneS || [0.5, 0.5, 0.5], toneH: p.toneH || [0.5, 0.5, 0.5],
      tone: n(p.tone, 0) * (1 + (a.tone || 0) * 0.25),
      grain: Math.min(1.2, Math.max(0, n(p.grain, 0) + (a.grain || 0) * 0.2 + ex.noise * 0.6)),
      grainSize: 1 + (a.grainSize || 0) * 0.35,
      vig: Math.max(-0.5, n(p.vig, 0) + (a.vig || 0) * 0.2),
      sharp: Math.max(0, n(p.sharp, 0.3) + (a.sharp || 0) * 0.2)
    };
  }

  function byId(id) { for (var i = 0; i < LOOKS.length; i++) if (LOOKS[i].id === id) return LOOKS[i]; return null; }

  // Alles, was zum Bild gehört (wird mit jedem Foto gespeichert, damit man später neu entwickeln kann).
  var LOOK_KEYS = ['look', 'adj', 'wb', 'ev', 'iso', 'time'];
  function lookSnapshot(s) { var o = {}; LOOK_KEYS.forEach(function (k) { o[k] = JSON.parse(JSON.stringify(s[k])); }); return o; }

  global.Looks = {
    LOOKS: LOOKS, WB: WB, ISO: ISO, TIME: TIME, EV: EV, FRAMES: FRAMES, FORMATS: FORMATS, RES: RES,
    byId: byId, params: params, exposure: exposure, evText: evText, lookSnapshot: lookSnapshot, LOOK_KEYS: LOOK_KEYS
  };
})(this);
