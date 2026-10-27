/* ==========================================================================
   JZo Jam – Musiktheorie
   Tonnamen, Skalen/Modi, leitereigene Akkorde, Progressionen,
   Gitarren-Tabulatur und Griffbilder. Keine Abhängigkeiten, läuft im
   Browser, im Web Worker und (für Tests) in Node.
   ========================================================================== */
(function (root) {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Dur-Tonarten (Grundton), die mit b statt # geschrieben werden
  var FLAT_PARENTS = [5, 10, 3, 8, 1];

  var settings = { german: false };

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];

  // Die 7 Kirchentonarten + ein paar Gitarren-Klassiker.
  // parent: Abstand des Grundtons zur zugehörigen Dur-Tonart (für # / b).
  var SCALES = {
    ionian:     { name: 'Ionisch (Dur)',          short: 'Ionisch',     intervals: [0, 2, 4, 5, 7, 9, 11],  parent: 0,  mode: true },
    dorian:     { name: 'Dorisch',                short: 'Dorisch',     intervals: [0, 2, 3, 5, 7, 9, 10],  parent: 2,  mode: true },
    phrygian:   { name: 'Phrygisch',              short: 'Phrygisch',   intervals: [0, 1, 3, 5, 7, 8, 10],  parent: 4,  mode: true },
    lydian:     { name: 'Lydisch',                short: 'Lydisch',     intervals: [0, 2, 4, 6, 7, 9, 11],  parent: 5,  mode: true },
    mixolydian: { name: 'Mixolydisch',            short: 'Mixolydisch', intervals: [0, 2, 4, 5, 7, 9, 10],  parent: 7,  mode: true },
    aeolian:    { name: 'Äolisch (Moll)',         short: 'Äolisch',     intervals: [0, 2, 3, 5, 7, 8, 10],  parent: 9,  mode: true },
    locrian:    { name: 'Lokrisch',               short: 'Lokrisch',    intervals: [0, 1, 3, 5, 6, 8, 10],  parent: 11, mode: true },
    majPent:    { name: 'Dur-Pentatonik',         short: 'Dur-Penta',   intervals: [0, 2, 4, 7, 9],         parent: 0,  chordsFrom: 'ionian' },
    minPent:    { name: 'Moll-Pentatonik',        short: 'Moll-Penta',  intervals: [0, 3, 5, 7, 10],        parent: 9,  chordsFrom: 'aeolian' },
    blues:      { name: 'Blues-Skala',            short: 'Blues',       intervals: [0, 3, 5, 6, 7, 10],     parent: 9,  chordsFrom: 'aeolian' },
    harmMinor:  { name: 'Harmonisch Moll',        short: 'Harm. Moll',  intervals: [0, 2, 3, 5, 7, 8, 11],  parent: 9 }
  };
  var MODE_IDS = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
  var SCALE_IDS = Object.keys(SCALES);

  // Kurze Erklärung zu jedem Modus – damit Jan weiß, wie es klingt
  var SCALE_INFO = {
    ionian: 'Fröhlich, hell, „normales“ Dur. Pop, Rock, Schlager.',
    dorian: 'Moll, aber mit hellem Farbton (große Sexte). Funk, Santana, Jazz.',
    phrygian: 'Dunkel, spanisch/orientalisch (kleine Sekunde). Flamenco, Metal.',
    lydian: 'Schwebend, verträumt (übermäßige Quarte). Filmmusik, Joe Satriani.',
    mixolydian: 'Dur mit Blues-Kante (kleine Septime). Blues-Rock, AC/DC, Country.',
    aeolian: 'Klassisches, trauriges Moll. Rock-Balladen, Pop.',
    locrian: 'Sehr instabil und düster (verminderte Quinte). Selten, Metal.',
    majPent: 'Fünf Töne, klingt fast immer gut über Dur. Country, Rock-Soli.',
    minPent: 'Die Gitarren-Skala schlechthin. Blues- und Rock-Soli.',
    blues: 'Moll-Pentatonik plus „Blue Note“ (verminderte Quinte).',
    harmMinor: 'Moll mit großer Septime. Neoklassik, orientalischer Klang.'
  };

  // Akkord-Typen: Intervalle ab Grundton
  var CHORDS = {
    '':      { iv: [0, 4, 7],      label: 'Dur' },
    'm':     { iv: [0, 3, 7],      label: 'Moll' },
    'dim':   { iv: [0, 3, 6],      label: 'vermindert' },
    'aug':   { iv: [0, 4, 8],      label: 'übermäßig' },
    '7':     { iv: [0, 4, 7, 10],  label: 'Dominant-Sept' },
    'maj7':  { iv: [0, 4, 7, 11],  label: 'Major-Sept' },
    'm7':    { iv: [0, 3, 7, 10],  label: 'Moll-Sept' },
    'm7b5':  { iv: [0, 3, 6, 10],  label: 'halbvermindert' },
    'dim7':  { iv: [0, 3, 6, 9],   label: 'vermindert-Sept' },
    'mMaj7': { iv: [0, 3, 7, 11],  label: 'Moll-Major-Sept' },
    'sus2':  { iv: [0, 2, 7],      label: 'sus2' },
    'sus4':  { iv: [0, 5, 7],      label: 'sus4' },
    '5':     { iv: [0, 7],         label: 'Powerchord' }
  };

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function useFlats(tonic, scaleId) {
    var sc = SCALES[scaleId] || SCALES.ionian;
    return FLAT_PARENTS.indexOf(mod12(tonic - sc.parent)) >= 0;
  }

  // Tonname. flats=true → b-Schreibweise. Deutsch: B→H, Bb→B.
  function noteName(pc, flats) {
    var n = (flats ? FLAT : SHARP)[mod12(pc)];
    if (settings.german) {
      if (n === 'B') return 'H';
      if (n === 'Bb') return 'B';
    }
    return n;
  }

  function keyFlats(key) { return useFlats(key.tonic, key.scale); }

  function keyName(key) {
    return noteName(key.tonic, keyFlats(key)) + ' ' + SCALES[key.scale].short;
  }

  function scalePcs(key) {
    return SCALES[key.scale].intervals.map(function (i) { return mod12(key.tonic + i); });
  }

  function chordName(ch, flats) {
    if (!ch) return '–';
    return noteName(ch.root, flats) + ch.quality;
  }

  function qualityFromIntervals(third, fifth, seventh) {
    var q;
    if (third === 4 && fifth === 7) q = '';
    else if (third === 3 && fifth === 7) q = 'm';
    else if (third === 3 && fifth === 6) q = 'dim';
    else if (third === 4 && fifth === 8) q = 'aug';
    else q = '';
    if (seventh == null) return q;
    if (q === '' && seventh === 11) return 'maj7';
    if (q === '' && seventh === 10) return '7';
    if (q === 'm' && seventh === 10) return 'm7';
    if (q === 'm' && seventh === 11) return 'mMaj7';
    if (q === 'dim' && seventh === 10) return 'm7b5';
    if (q === 'dim' && seventh === 9) return 'dim7';
    return q;
  }

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  // Leitereigene Akkorde (Dreiklang + Vierklang) für einen 7-Ton-Modus
  function diatonicChords(key) {
    var scaleId = SCALES[key.scale].chordsFrom || key.scale;
    var iv = SCALES[scaleId].intervals;
    var out = [];
    for (var d = 0; d < 7; d++) {
      var r = iv[d];
      var third = mod12(iv[(d + 2) % 7] - r);
      var fifth = mod12(iv[(d + 4) % 7] - r);
      var sev = mod12(iv[(d + 6) % 7] - r);
      var triad = qualityFromIntervals(third, fifth, null);
      var seventh = qualityFromIntervals(third, fifth, sev);
      var acc = r - MAJOR[d];
      var accStr = acc < 0 ? 'b' : acc > 0 ? '#' : '';
      var numeral = ROMAN[d];
      if (triad === 'm' || triad === 'dim') numeral = numeral.toLowerCase();
      if (triad === 'dim') numeral += '°';
      if (triad === 'aug') numeral += '+';
      out.push({
        degree: d,
        roman: accStr + numeral,
        root: mod12(key.tonic + r),
        triad: triad,
        seventh: seventh
      });
    }
    return { scaleId: scaleId, chords: out };
  }

  // Typische Progressionen je Modus (Stufen 0–6, s = Vierklänge)
  var PROGRESSIONS = {
    ionian: [
      { name: 'Pop-Klassiker', deg: [0, 4, 5, 3] },
      { name: 'Rock’n’Roll', deg: [0, 3, 4, 0] },
      { name: 'Jazz ii–V–I', deg: [1, 4, 0], s: true },
      { name: '50er-Jahre', deg: [0, 5, 3, 4] },
      { name: 'Emotional', deg: [5, 3, 0, 4] }
    ],
    dorian: [
      { name: 'Dorischer Vamp', deg: [0, 3] , s: true },
      { name: 'Santana-Style', deg: [0, 3, 0, 6] },
      { name: 'Rock-Dorisch', deg: [0, 2, 3, 0] },
      { name: 'Funk-Groove', deg: [0, 1], s: true }
    ],
    phrygian: [
      { name: 'Spanisch', deg: [0, 1] },
      { name: 'Flamenco-Kadenz', deg: [0, 1, 2, 1] },
      { name: 'Metal-Riff', deg: [0, 1, 6, 0] }
    ],
    lydian: [
      { name: 'Lydischer Vamp', deg: [0, 1] },
      { name: 'Filmmusik', deg: [0, 1, 2, 1] },
      { name: 'Schwebend', deg: [0, 1, 5, 4] }
    ],
    mixolydian: [
      { name: 'Classic Rock', deg: [0, 6, 3, 0] },
      { name: 'Mixo-Vamp', deg: [0, 6] },
      { name: 'Blues-Rock', deg: [0, 4, 3, 0] },
      { name: 'Jam-Groove', deg: [0, 3, 6, 3] }
    ],
    aeolian: [
      { name: 'Epischer Moll-Pop', deg: [0, 5, 2, 6] },
      { name: 'Moll-Kadenz', deg: [0, 3, 4, 0] },
      { name: 'Rock-Ballade', deg: [0, 6, 5, 6] },
      { name: 'Treibend', deg: [0, 5, 6, 0] },
      { name: 'Moll ii–v–i', deg: [1, 4, 0], s: true }
    ],
    locrian: [
      { name: 'Lokrischer Vamp', deg: [0, 1] },
      { name: 'Düster', deg: [0, 3, 1, 0] }
    ],
    harmMinor: [
      { name: 'Moll mit Dur-V', deg: [0, 3, 4, 0] },
      { name: 'Neoklassik', deg: [0, 5, 4, 0] },
      { name: 'Dramatisch', deg: [0, 5, 3, 4] }
    ]
  };

  function progressionsFor(key) {
    var dia = diatonicChords(key);
    var list = PROGRESSIONS[dia.scaleId] || [];
    return list.map(function (p) {
      return {
        name: p.name,
        roman: p.deg.map(function (d) { return dia.chords[d].roman; }).join(' – '),
        chords: p.deg.map(function (d) {
          var c = dia.chords[d];
          return { root: c.root, quality: p.s ? c.seventh : c.triad };
        })
      };
    });
  }

  /* ---------------- Gitarre ---------------- */

  // Standardstimmung, tiefe E-Saite zuerst
  var STRINGS = [
    { name: 'E', midi: 40 }, { name: 'A', midi: 45 }, { name: 'D', midi: 50 },
    { name: 'G', midi: 55 }, { name: 'B', midi: 59 }, { name: 'e', midi: 64 }
  ];

  function stringLabel(i) {
    var n = STRINGS[i].name;
    if (settings.german && n === 'B') return 'H';
    return n;
  }

  // Fingersatz-Lagen einer Skala: 3 Töne pro Saite (7-Ton-Skalen) bzw.
  // 2 Töne pro Saite (Pentatonik/Blues). Liefert sortiert nach Bund.
  function scalePositions(key) {
    var pcs = scalePcs(key);
    var n = pcs.length;
    var perString = n >= 7 ? 3 : 2;
    var pitches = [];
    for (var m = 40; m < 40 + 48; m++) if (pcs.indexOf(mod12(m)) >= 0) pitches.push(m);
    var positions = [];
    for (var s = 0; s < n; s++) {
      var notes = [];
      var idx = s;
      for (var str = 0; str < 6; str++) {
        for (var k = 0; k < perString; k++) {
          var p = pitches[idx++];
          notes.push({ string: str, fret: p - STRINGS[str].midi, midi: p });
        }
      }
      var minF = Math.min.apply(null, notes.map(function (x) { return x.fret; }));
      if (minF < 0) notes.forEach(function (x) { x.fret += 12; x.midi += 12; });
      minF = Math.min.apply(null, notes.map(function (x) { return x.fret; }));
      var maxF = Math.max.apply(null, notes.map(function (x) { return x.fret; }));
      positions.push({ notes: notes, minFret: minF, maxFret: maxF });
    }
    positions.sort(function (a, b) { return a.minFret - b.minFret; });
    return positions;
  }

  // Tabulatur als Text (hohe e-Saite oben, wie üblich)
  function tabText(notes, perLine) {
    perLine = perLine || 16;
    var blocks = [];
    for (var start = 0; start < notes.length || start === 0; start += perLine) {
      var chunk = notes.slice(start, start + perLine);
      var lines = [];
      for (var str = 5; str >= 0; str--) {
        var row = (stringLabel(str) + ' ').slice(0, 2) + '|-';
        chunk.forEach(function (nt) {
          var w = String(nt.fret).length;
          var cell = nt.string === str ? String(nt.fret) : '';
          var width = Math.max(2, w);
          while (cell.length < width) cell += '-';
          row += cell + '-';
        });
        lines.push(row + '|');
      }
      blocks.push(lines.join('\n'));
      if (!notes.length) break;
    }
    return blocks.join('\n\n');
  }

  // Einzeltöne (MIDI) auf Saite/Bund verteilen – möglichst wenig Lagenwechsel
  function melodyToTab(midis) {
    var out = [];
    var hand = null;
    midis.forEach(function (m) {
      var best = null;
      for (var s = 0; s < 6; s++) {
        var f = m - STRINGS[s].midi;
        if (f < 0 || f > 22) continue;
        var cost = hand == null ? f * 0.3 : Math.abs(f - hand) + (f === 0 ? -0.5 : 0);
        if (!best || cost < best.cost) best = { string: s, fret: f, cost: cost };
      }
      if (best) {
        out.push({ string: best.string, fret: best.fret, midi: m });
        if (best.fret > 0) hand = hand == null ? best.fret : hand * 0.4 + best.fret * 0.6;
      }
    });
    return out;
  }

  // Griffbilder: offene Akkorde + verschiebbare E-/A-Barré-Formen
  var N = null;
  var OPEN = {
    '0:': [N, 3, 2, 0, 1, 0], '9:': [N, 0, 2, 2, 2, 0], '7:': [3, 2, 0, 0, 0, 3],
    '4:': [0, 2, 2, 1, 0, 0], '2:': [N, N, 0, 2, 3, 2],
    '9:m': [N, 0, 2, 2, 1, 0], '4:m': [0, 2, 2, 0, 0, 0], '2:m': [N, N, 0, 2, 3, 1],
    '9:7': [N, 0, 2, 0, 2, 0], '4:7': [0, 2, 0, 1, 0, 0], '2:7': [N, N, 0, 2, 1, 2],
    '7:7': [3, 2, 0, 0, 0, 1], '0:7': [N, 3, 2, 3, 1, 0], '11:7': [N, 2, 1, 2, 0, 2],
    '9:m7': [N, 0, 2, 0, 1, 0], '4:m7': [0, 2, 0, 0, 0, 0], '2:m7': [N, N, 0, 2, 1, 1],
    '0:maj7': [N, 3, 2, 0, 0, 0], '5:maj7': [N, N, 3, 2, 1, 0], '9:maj7': [N, 0, 2, 1, 2, 0],
    '2:maj7': [N, N, 0, 2, 2, 2], '7:maj7': [3, 2, 0, 0, 0, 2],
    '9:sus4': [N, 0, 2, 2, 3, 0], '2:sus4': [N, N, 0, 2, 3, 3], '4:sus4': [0, 2, 2, 2, 0, 0],
    '9:sus2': [N, 0, 2, 2, 0, 0], '2:sus2': [N, N, 0, 2, 3, 0],
    '4:5': [0, 2, 2, N, N, N], '9:5': [N, 0, 2, 2, N, N]
  };
  var E_SHAPE = {
    '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0],
    'maj7': [0, N, 1, 1, 0, N], 'm7': [0, 2, 0, 0, 0, 0], 'm7b5': [0, N, 0, 0, -1, N],
    'sus4': [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, N, N, N], 'dim7': [0, N, -1, 0, -1, N]
  };
  var A_SHAPE = {
    '': [N, 0, 2, 2, 2, 0], 'm': [N, 0, 2, 2, 1, 0], '7': [N, 0, 2, 0, 2, 0],
    'maj7': [N, 0, 2, 1, 2, 0], 'm7': [N, 0, 2, 0, 1, 0], 'm7b5': [N, 0, 1, 0, 1, N],
    'sus4': [N, 0, 2, 2, 3, 0], 'sus2': [N, 0, 2, 2, 0, 0], '5': [N, 0, 2, 2, N, N],
    'dim': [N, 0, 1, 2, 1, N], 'aug': [N, 0, 3, 2, 2, N], 'mMaj7': [N, 0, 2, 1, 1, 0],
    'dim7': [N, 0, 1, -1, 1, N]
  };

  function shapeAt(shape, rootFret) {
    var needs = Math.min.apply(null, shape.filter(function (x) { return x != null; }));
    if (rootFret + needs < 0) rootFret += 12;
    return shape.map(function (x) { return x == null ? null : x + rootFret; });
  }

  // Liefert Bundliste (tiefe E zuerst, null = nicht anschlagen) oder null
  function chordVoicing(root, quality) {
    var open = OPEN[mod12(root) + ':' + quality];
    if (open) return open.slice();
    var cands = [];
    if (E_SHAPE[quality]) cands.push(shapeAt(E_SHAPE[quality], mod12(root - 4)));
    if (A_SHAPE[quality]) cands.push(shapeAt(A_SHAPE[quality], mod12(root - 9)));
    if (!cands.length) return null;
    cands.sort(function (a, b) { return maxFret(a) - maxFret(b); });
    return cands[0];
  }
  function maxFret(v) { return Math.max.apply(null, v.filter(function (x) { return x != null; })); }

  // MIDI-Töne zum Abspielen eines Akkords
  function chordMidis(root, quality) {
    var v = chordVoicing(root, quality);
    if (v) {
      var out = [];
      v.forEach(function (f, s) { if (f != null) out.push(STRINGS[s].midi + f); });
      return out;
    }
    var base = 40 + mod12(root - 4);
    return (CHORDS[quality] || CHORDS['']).iv.map(function (i) { return base + 12 + i; }).concat([base]);
  }

  function midiName(m, flats) { return noteName(m, flats) + (Math.floor(m / 12) - 1); }

  var api = {
    settings: settings,
    SCALES: SCALES, SCALE_IDS: SCALE_IDS, MODE_IDS: MODE_IDS, SCALE_INFO: SCALE_INFO,
    CHORDS: CHORDS, STRINGS: STRINGS,
    mod12: mod12, noteName: noteName, midiName: midiName, useFlats: useFlats,
    keyFlats: keyFlats, keyName: keyName, scalePcs: scalePcs, chordName: chordName,
    diatonicChords: diatonicChords, progressionsFor: progressionsFor,
    scalePositions: scalePositions, tabText: tabText, melodyToTab: melodyToTab,
    chordVoicing: chordVoicing, chordMidis: chordMidis, stringLabel: stringLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JZoTheory = api;
})(typeof self !== 'undefined' ? self : this);
