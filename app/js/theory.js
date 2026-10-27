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

  /* ---------------- Gitarre & Stimmungen ---------------- */

  // Saiten jeweils von der tiefsten zur höchsten (MIDI-Tonhöhe der leeren Saite).
  // family 'std': alle Saiten im Quart-Abstand wie die Standardstimmung
  // (nur verschoben) → bekannte Griffe passen 1:1.
  var TUNINGS = {
    std:      { group: 'Standard', name: 'Standard E',             strings: [40, 45, 50, 55, 59, 64], family: 'std' },
    eb:       { group: 'Standard', name: 'Halbton tiefer (Eb)',    strings: [39, 44, 49, 54, 58, 63], family: 'std', flats: true },
    dstd:     { group: 'Standard', name: 'D-Standard',             strings: [38, 43, 48, 53, 57, 62], family: 'std' },
    csharp:   { group: 'Standard', name: 'C#-Standard',            strings: [37, 42, 47, 52, 56, 61], family: 'std' },
    cstd:     { group: 'Standard', name: 'C-Standard',             strings: [36, 41, 46, 51, 55, 60], family: 'std', flats: true },
    bstd:     { group: 'Standard', name: 'B-Standard (Bariton)',   strings: [35, 40, 45, 50, 54, 59], family: 'std' },
    std7:     { group: '7-Saiter', name: '7-Saiter Standard',      strings: [35, 40, 45, 50, 55, 59, 64], family: 'std' },
    dropA7:   { group: '7-Saiter', name: '7-Saiter Drop A',        strings: [33, 40, 45, 50, 55, 59, 64] },
    a7:       { group: '7-Saiter', name: '7-Saiter A-Standard',    strings: [33, 38, 43, 48, 53, 57, 62], family: 'std' },
    dropD:    { group: 'Drop',     name: 'Drop D',                 strings: [38, 45, 50, 55, 59, 64] },
    dropCs:   { group: 'Drop',     name: 'Drop C#',                strings: [37, 44, 49, 54, 58, 63] },
    dropC:    { group: 'Drop',     name: 'Drop C',                 strings: [36, 43, 48, 53, 57, 62] },
    dropB:    { group: 'Drop',     name: 'Drop B',                 strings: [35, 42, 47, 52, 56, 61] },
    ddropD:   { group: 'Drop',     name: 'Double Drop D',          strings: [38, 45, 50, 55, 59, 62] },
    openD:    { group: 'Offen Dur', name: 'Open D',                strings: [38, 45, 50, 54, 57, 62] },
    openE:    { group: 'Offen Dur', name: 'Open E',                strings: [40, 47, 52, 56, 59, 64] },
    openG:    { group: 'Offen Dur', name: 'Open G',                strings: [38, 43, 50, 55, 59, 62] },
    openA:    { group: 'Offen Dur', name: 'Open A',                strings: [40, 45, 52, 57, 61, 64] },
    openC:    { group: 'Offen Dur', name: 'Open C',                strings: [36, 43, 48, 55, 60, 64] },
    openF:    { group: 'Offen Dur', name: 'Open F',                strings: [36, 41, 48, 53, 57, 65] },
    openB:    { group: 'Offen Dur', name: 'Open B',                strings: [35, 42, 47, 54, 59, 63] },
    openDm:   { group: 'Offen Moll', name: 'Open D-Moll',          strings: [38, 45, 50, 53, 57, 62] },
    openEm:   { group: 'Offen Moll', name: 'Open E-Moll',          strings: [40, 47, 52, 55, 59, 64] },
    openGm:   { group: 'Offen Moll', name: 'Open G-Moll',          strings: [38, 43, 50, 55, 58, 62], flats: true },
    openAm:   { group: 'Offen Moll', name: 'Open A-Moll',          strings: [40, 45, 52, 57, 60, 64] },
    openCm:   { group: 'Offen Moll', name: 'Open C-Moll',          strings: [36, 43, 48, 55, 60, 63], flats: true },
    dadgad:   { group: 'Offen Modal', name: 'DADGAD (Dsus4)',      strings: [38, 45, 50, 55, 57, 62] },
    openCsus2:{ group: 'Offen Modal', name: 'Open Csus2 (CGDGCD)', strings: [36, 43, 50, 55, 60, 62] },
    openC6:   { group: 'Offen Modal', name: 'Open C6 (CACGCE)',    strings: [36, 45, 48, 55, 60, 64] },
    openG6:   { group: 'Offen Modal', name: 'Open G6 (DGDGBE)',    strings: [38, 43, 50, 55, 59, 64] }
  };
  var TUNING_IDS = Object.keys(TUNINGS);
  settings.tuning = 'std';

  function tuning(id) { return TUNINGS[id || settings.tuning] || TUNINGS.std; }
  function strings(id) { return tuning(id).strings; }

  // Saitennamen der Stimmung, z. B. "D A D F# A D"
  function tuningNotes(id) {
    var t = tuning(id);
    return t.strings.map(function (m) { return noteName(m, !!t.flats); }).join(' ');
  }
  function tuningLabel(id) { return tuning(id).name + ' (' + tuningNotes(id) + ')'; }

  // Beschriftung einer Saite in Tabs; höchste Saite klein, wenn es den Ton tiefer schon gibt (E/e)
  function stringLabel(i, id) {
    var t = tuning(id), st = t.strings;
    var n = noteName(st[i], !!t.flats);
    if (i === st.length - 1) {
      for (var k = 0; k < i; k++) if (noteName(st[k], !!t.flats) === n) return n.toLowerCase();
    }
    return n;
  }

  function quartFamily(st) {
    for (var i = 1; i < st.length; i++) {
      var d = st[i] - st[i - 1];
      if (d !== 4 && d !== 5) return false;
    }
    return true;
  }

  // Fingersatz-Lagen einer Skala. Bei Standard-artigen Stimmungen: 3 Töne pro
  // Saite (7-Ton-Skalen) bzw. 2 (Pentatonik/Blues). Bei offenen/Drop-Stimmungen:
  // "Kasten" über 5 Bünde, jeder Ton nur einmal. Sortiert nach Bund.
  function scalePositions(key, tuningId) {
    var st = strings(tuningId);
    var pcs = scalePcs(key);
    var n = pcs.length;
    var positions = [];
    var s, str, minF, maxF, notes;
    if (quartFamily(st)) {
      var perString = n >= 7 ? 3 : 2;
      var pitches = [];
      for (var m = st[0]; m < st[0] + 60; m++) if (pcs.indexOf(mod12(m)) >= 0) pitches.push(m);
      for (s = 0; s < n; s++) {
        notes = [];
        var idx = s;
        for (str = 0; str < st.length; str++) {
          for (var k = 0; k < perString; k++) {
            var p = pitches[idx++];
            notes.push({ string: str, fret: p - st[str], midi: p });
          }
        }
        minF = Math.min.apply(null, notes.map(function (x) { return x.fret; }));
        if (minF < 0) notes.forEach(function (x) { x.fret += 12; x.midi += 12; });
        positions.push(notes);
      }
    } else {
      for (var f0 = 0; f0 < 12; f0++) {
        if (pcs.indexOf(mod12(st[0] + f0)) < 0) continue;
        var lo = f0, hi = f0 + 4;
        notes = [];
        var seen = {};
        for (str = 0; str < st.length; str++) {
          for (var f = lo; f <= hi; f++) {
            var mm = st[str] + f;
            if (pcs.indexOf(mod12(mm)) < 0 || seen[mm]) continue;
            seen[mm] = true;
            notes.push({ string: str, fret: f, midi: mm });
          }
        }
        notes.sort(function (a, b) { return a.midi - b.midi; });
        positions.push(notes);
      }
    }
    return positions.map(function (nt) {
      minF = Math.min.apply(null, nt.map(function (x) { return x.fret; }));
      maxF = Math.max.apply(null, nt.map(function (x) { return x.fret; }));
      return { notes: nt, minFret: minF, maxFret: maxF };
    }).sort(function (a, b) { return a.minFret - b.minFret; });
  }

  // Tabulatur als Text (höchste Saite oben, wie üblich)
  function tabText(notes, perLine, tuningId) {
    perLine = perLine || 16;
    var count = strings(tuningId).length;
    var labels = [], wMax = 1;
    for (var i = 0; i < count; i++) { labels.push(stringLabel(i, tuningId)); wMax = Math.max(wMax, labels[i].length); }
    var blocks = [];
    for (var start = 0; start < notes.length || start === 0; start += perLine) {
      var chunk = notes.slice(start, start + perLine);
      var lines = [];
      for (var str = count - 1; str >= 0; str--) {
        var lab = labels[str];
        while (lab.length < wMax) lab += ' ';
        var row = lab + '|-';
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
  function melodyToTab(midis, tuningId) {
    var st = strings(tuningId);
    var out = [];
    var hand = null;
    midis.forEach(function (m) {
      var best = null;
      for (var s = 0; s < st.length; s++) {
        var f = m - st[s];
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

  // Griffbilder Standardstimmung: offene Akkorde + verschiebbare E-/A-Barré-Formen
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
  function maxFret(v) { return Math.max.apply(null, v.filter(function (x) { return x != null; })); }

  function standardVoicing(root, quality) {
    var open = OPEN[mod12(root) + ':' + quality];
    if (open) return open.slice();
    var cands = [];
    if (E_SHAPE[quality]) cands.push(shapeAt(E_SHAPE[quality], mod12(root - 4)));
    if (A_SHAPE[quality]) cands.push(shapeAt(A_SHAPE[quality], mod12(root - 9)));
    if (!cands.length) return null;
    cands.sort(function (a, b) { return maxFret(a) - maxFret(b); });
    return cands[0];
  }

  // Griff für beliebige Stimmung suchen: alle Akkordtöne, Grundton im Bass,
  // höchstens 4 Bünde Spannweite, möglichst viele Saiten, gern leere Saiten.
  function searchVoicing(root, quality, st) {
    var iv = (CHORDS[quality] || CHORDS['']).iv;
    var tones = iv.map(function (i) { return mod12(root + i); });
    // Bei Vierklängen darf die Quinte fehlen
    var required = tones.filter(function (pc, i) { return !(iv.length >= 4 && iv[i] === 7); });
    var n = st.length, best = null;
    var minSounding = Math.min(n - 2, iv.length <= 2 ? 2 : 4);
    for (var lo = 1; lo <= 12; lo++) {
      var hi = lo + 3;
      var opts = st.map(function (open) {
        var o = [null];
        if (tones.indexOf(mod12(open)) >= 0) o.push(0);
        for (var f = lo; f <= hi; f++) if (tones.indexOf(mod12(open + f)) >= 0) o.push(f);
        return o;
      });
      var cur = [];
      (function dfs(i, started, ended) {
        if (i === n) { evaluate(cur.slice()); return; }
        opts[i].forEach(function (f) {
          if (f === null) {
            cur.push(null); dfs(i + 1, started, started); cur.pop();
          } else if (!ended) {
            // erster klingender Ton muss der Grundton sein
            if (!started && mod12(st[i] + f) !== mod12(root)) return;
            cur.push(f); dfs(i + 1, true, false); cur.pop();
          }
        });
      })(0, false, false);
    }
    function evaluate(v) {
      var sounding = 0, opens = 0, pcsHad = {}, fretted = [];
      v.forEach(function (f, i) {
        if (f == null) return;
        sounding++;
        pcsHad[mod12(st[i] + f)] = true;
        if (f === 0) opens++; else fretted.push(f);
      });
      if (sounding < minSounding) return;
      for (var r = 0; r < required.length; r++) if (!pcsHad[required[r]]) return;
      var minF = fretted.length ? Math.min.apply(null, fretted) : 0;
      var maxF = fretted.length ? Math.max.apply(null, fretted) : 0;
      if (maxF - minF > 3) return;
      // Finger zählen: alle Töne auf dem tiefsten Bund = 1 Finger (Barré)
      var fingers = fretted.filter(function (f) { return f > minF; }).length + (fretted.length ? 1 : 0);
      if (fingers > 4) return;
      var firstSounding = v.findIndex(function (f) { return f != null; });
      var score = sounding * 2 + opens * 0.6 - (maxF - minF) * 0.8 - minF * 0.35 - firstSounding * 0.5;
      if (!best || score > best.score) best = { v: v, score: score };
    }
    return best ? best.v : null;
  }

  var voicingCache = {};
  // Liefert Bundliste (tiefste Saite zuerst, null = nicht anschlagen) oder null
  function chordVoicing(root, quality, tuningId) {
    var id = tuningId || settings.tuning;
    var ck = id + '|' + mod12(root) + '|' + quality;
    if (ck in voicingCache) return voicingCache[ck] && voicingCache[ck].slice();
    var t = tuning(id), st = t.strings, v = null;
    if (t.family === 'std') {
      // Gleiche Griffe wie Standard, nur verschoben; 7. Saite bleibt stumm
      var offset = st[st.length - 6] - 40;
      var sv = standardVoicing(mod12(root - offset), quality);
      if (sv) v = st.length === 7 ? [null].concat(sv) : sv;
    }
    if (!v) v = searchVoicing(root, quality, st);
    voicingCache[ck] = v;
    return v && v.slice();
  }

  // MIDI-Töne zum Abspielen eines Akkords
  function chordMidis(root, quality, tuningId) {
    var st = strings(tuningId);
    var v = chordVoicing(root, quality, tuningId);
    if (v) {
      var out = [];
      v.forEach(function (f, s) { if (f != null) out.push(st[s] + f); });
      return out;
    }
    var base = 40 + mod12(root - 4);
    return (CHORDS[quality] || CHORDS['']).iv.map(function (i) { return base + 12 + i; }).concat([base]);
  }

  function midiName(m, flats) { return noteName(m, flats) + (Math.floor(m / 12) - 1); }

  var api = {
    settings: settings,
    SCALES: SCALES, SCALE_IDS: SCALE_IDS, MODE_IDS: MODE_IDS, SCALE_INFO: SCALE_INFO,
    CHORDS: CHORDS, TUNINGS: TUNINGS, TUNING_IDS: TUNING_IDS,
    tuning: tuning, strings: strings, tuningNotes: tuningNotes, tuningLabel: tuningLabel,
    mod12: mod12, noteName: noteName, midiName: midiName, useFlats: useFlats,
    keyFlats: keyFlats, keyName: keyName, scalePcs: scalePcs, chordName: chordName,
    diatonicChords: diatonicChords, progressionsFor: progressionsFor,
    scalePositions: scalePositions, tabText: tabText, melodyToTab: melodyToTab,
    chordVoicing: chordVoicing, chordMidis: chordMidis, stringLabel: stringLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JZoTheory = api;
})(typeof self !== 'undefined' ? self : this);
