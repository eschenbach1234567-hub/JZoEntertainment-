/* JZo Video AI – eingebaute Bibliothek (aufgebaut wie die Effects Library in
   DaVinci Resolve): Effekte, Übergänge, Generatoren, Titel, Farb-Looks,
   Partikel (Feuer & Co.), Sticker und KI-Modelle.
   Zusätzliche Einträge kommen aus data/library.json (Admin-Bereich). */
(function (global) {
  'use strict';

  /* Effekt-Kategorien (wie Resolve FX) */
  var FX_CATS = [
    ['blur', 'Unschärfe'], ['color', 'Farbe'], ['light', 'Licht'], ['stylize', 'Stilisieren'],
    ['warp', 'Verzerren'], ['glitch', 'Glitch & Digital'], ['film', 'Film & Revival'], ['motion', 'Bewegung & Zoom']
  ];

  /* Clip-Effekte. kind 'shader' = Bildeffekt (Platz im Shader wird automatisch vergeben),
     kind 'move' = Kamera-Bewegung/Zoom. def = Startstärke (0–1). */
  function fx(id, name, icon, cat, def, kind) { return { id: id, name: name, icon: icon, cat: cat, def: def, kind: kind || 'shader' }; }
  var FX = [
    fx('blur', 'Gaußscher Weichzeichner', '💧', 'blur', 0.5), fx('zoomblur', 'Zoom-Unschärfe', '🎯', 'blur', 0.5),
    fx('motionblur', 'Bewegungsunschärfe', '💨', 'blur', 0.5), fx('spinblur', 'Dreh-Unschärfe', '🌀', 'blur', 0.4),
    fx('tiltshift', 'Tilt-Shift (Miniatur)', '🏙️', 'blur', 0.7), fx('vignetteblur', 'Rand-Unschärfe', '⭕', 'blur', 0.6),
    fx('pixelate', 'Mosaik / Verpixeln', '🟪', 'blur', 0.4),

    fx('bw', 'Schwarz-Weiß', '◐', 'color', 1.0), fx('sepia', 'Sepia', '🟫', 'color', 0.8),
    fx('duotone', 'Duoton (Blau/Orange)', '🎭', 'color', 0.9), fx('colorkeep', 'Nur Rot behalten', '🌹', 'color', 1.0),
    fx('thermal', 'Wärmebild', '🌡️', 'color', 1.0), fx('nightvision', 'Nachtsicht', '🟩', 'color', 1.0),
    fx('infrared', 'Infrarot', '🩷', 'color', 0.9), fx('crossproc', 'Cross-Entwicklung', '🧪', 'color', 0.8),
    fx('invert', 'Negativ', '🔄', 'color', 1.0), fx('huecycle', 'Farbwechsel (Regenbogen)', '🌈', 'color', 0.5),
    fx('posterize', 'Poster / Tontrennung', '🖍️', 'color', 0.6),

    fx('glow', 'Glühen (Glow)', '✨', 'light', 0.5), fx('lightleak', 'Light Leak', '🌅', 'light', 0.6),
    fx('lensflare', 'Lens Flare', '☀️', 'light', 0.6), fx('lightrays', 'Lichtstrahlen', '🔦', 'light', 0.6),
    fx('strobe', 'Strobo-Blitz', '💡', 'light', 0.5), fx('vignette', 'Vignette', '⚫', 'light', 0.5),

    fx('edge', 'Comic (Kanten)', '💥', 'stylize', 1.0), fx('sketch', 'Bleistift-Skizze', '✏️', 'stylize', 1.0),
    fx('neonedge', 'Neon-Kanten', '🟦', 'stylize', 1.0), fx('emboss', 'Relief', '🗿', 'stylize', 1.0),
    fx('halftone', 'Raster-Punkte', '🔘', 'stylize', 1.0), fx('dither', '8-Bit Retro-Spiel', '👾', 'stylize', 1.0),
    fx('prism', 'Prisma', '🔺', 'stylize', 0.6), fx('mirror', 'Spiegeln links/rechts', '🪞', 'stylize', 1.0),
    fx('mirrorv', 'Spiegeln oben/unten', '🔃', 'stylize', 1.0), fx('kaleido', 'Kaleidoskop', '🔷', 'stylize', 1.0),
    fx('grid', 'Bild-Raster (4×)', '🔲', 'stylize', 1.0), fx('flip', 'Horizontal kippen', '↔️', 'stylize', 1.0),
    fx('cinebars', 'Kino-Balken (Letterbox)', '🎬', 'stylize', 1.0),

    fx('fisheye', 'Fischauge', '🐟', 'warp', 0.6), fx('pinch', 'Einziehen', '🤏', 'warp', 0.6),
    fx('swirl', 'Strudel', '🌪️', 'warp', 0.6), fx('ripple', 'Wasserwellen', '🌊', 'warp', 0.6),
    fx('wave', 'Wellen', '〰️', 'warp', 0.6), fx('heat', 'Hitzeflimmern', '🔥', 'warp', 0.6),
    fx('crt', 'Röhrenfernseher', '📺', 'warp', 0.8),

    fx('glitch', 'Glitch', '⚡', 'glitch', 0.6), fx('rgbsplit', 'RGB-Split', '🔴', 'glitch', 0.5),
    fx('chroma', 'Chromatische Aberration', '🔵', 'glitch', 0.5), fx('vhs', 'VHS', '📼', 'glitch', 0.7),
    fx('scanlines', 'Scanlines', '📟', 'glitch', 0.5), fx('tvstatic', 'TV-Rauschen', '📡', 'glitch', 0.4),
    fx('signal', 'Signalverlust', '📶', 'glitch', 0.6), fx('interlace', 'Zeilensprung', '🧵', 'glitch', 0.6),
    fx('datamosh', 'Datamosh-Blöcke', '🧱', 'glitch', 0.6),

    fx('grain', 'Filmkorn', '🎞️', 'film', 0.4), fx('filmdamage', 'Kratzer & Staub', '🩹', 'film', 0.7),
    fx('flicker', 'Flackern', '🕯️', 'film', 0.5), fx('sharpen', 'Schärfen', '🔪', 'film', 0.5),

    fx('zoomIn', 'Dynamic Zoom rein', '🔍', 'motion', 0.6, 'move'), fx('zoomOut', 'Dynamic Zoom raus', '🔎', 'motion', 0.6, 'move'),
    fx('zoomSnap', 'Snap-Zoom (Start)', '📸', 'motion', 0.7, 'move'), fx('punch', 'Beat-Zoom', '🥁', 'motion', 0.6, 'move'),
    fx('heartbeat', 'Herzschlag', '💓', 'motion', 0.6, 'move'), fx('kenburns', 'Ken Burns', '🖼️', 'motion', 0.6, 'move'),
    fx('panLeft', 'Schwenk nach links', '⬅️', 'motion', 0.6, 'move'), fx('panRight', 'Schwenk nach rechts', '➡️', 'motion', 0.6, 'move'),
    fx('drift', 'Schwebende Kamera', '🎈', 'motion', 0.5, 'move'), fx('shake', 'Wackel-Kamera', '📳', 'motion', 0.5, 'move'),
    fx('quake', 'Erdbeben', '🌋', 'motion', 0.6, 'move'), fx('wobble', 'Schaukeln', '⛵', 'motion', 0.5, 'move'),
    fx('tilt', 'Schräglage', '📐', 'motion', 0.5, 'move'), fx('spinSlow', 'Langsam drehen', '🔁', 'motion', 0.4, 'move'),
    fx('spinIn', 'Dreh-Einstieg', '💫', 'motion', 0.7, 'move'), fx('bounceIn', 'Bounce-Einstieg', '🏀', 'motion', 0.7, 'move'),
    fx('slideInTop', 'Reinfallen von oben', '⬇️', 'motion', 0.8, 'move'), fx('slideInLeft', 'Reinrutschen von links', '⏩', 'motion', 0.8, 'move'),
    fx('slideOutRight', 'Rausrutschen (Ende)', '🚪', 'motion', 0.8, 'move'), fx('zoomOutEnd', 'Wegzoomen (Ende)', '🕳️', 'motion', 0.8, 'move')
  ];

  /* Fertige Kombinationen. */
  function pk(id, name, icon, items) { return { id: id, name: name, icon: icon, items: items.map(function (x) { return { fx: x[0], amount: x[1] }; }) }; }
  var PACKS = [
    pk('pk-musikvideo', 'Musikvideo', '🎸', [['glitch', 0.35], ['rgbsplit', 0.4], ['punch', 0.6]]),
    pk('pk-retro', 'Retro-VHS', '📼', [['vhs', 0.7], ['grain', 0.4], ['scanlines', 0.3], ['sepia', 0.25]]),
    pk('pk-kino', 'Kino-Look', '🎬', [['cinebars', 1], ['vignette', 0.45], ['grain', 0.2], ['zoomIn', 0.3]]),
    pk('pk-trailer', 'Kino-Trailer', '🍿', [['cinebars', 1], ['quake', 0.15], ['lensflare', 0.4], ['zoomSnap', 0.6]]),
    pk('pk-altfilm', 'Alter Film', '🎞️', [['bw', 1], ['grain', 0.7], ['filmdamage', 0.7], ['flicker', 0.4], ['vignette', 0.7]]),
    pk('pk-party', 'Party', '🪩', [['strobe', 0.35], ['huecycle', 0.4], ['punch', 0.8]]),
    pk('pk-tiktok', 'TikTok-Trend', '📱', [['zoomSnap', 0.8], ['rgbsplit', 0.3], ['heartbeat', 0.5]]),
    pk('pk-traum', 'Traum', '☁️', [['glow', 0.5], ['lightleak', 0.5], ['zoomIn', 0.4]]),
    pk('pk-hochzeit', 'Hochzeit', '💍', [['glow', 0.4], ['vignetteblur', 0.4], ['lightleak', 0.3], ['drift', 0.3]]),
    pk('pk-flashback', 'Erinnerung', '🕰️', [['sepia', 0.6], ['vignetteblur', 0.7], ['glow', 0.3], ['grain', 0.3]]),
    pk('pk-horror', 'Horror', '👻', [['glitch', 0.4], ['bw', 0.8], ['vignette', 0.9], ['flicker', 0.4], ['quake', 0.2]]),
    pk('pk-action', 'Action', '💥', [['quake', 0.5], ['chroma', 0.4], ['cinebars', 1]]),
    pk('pk-sincity', 'Sin City', '🌹', [['colorkeep', 1], ['grain', 0.3]]),
    pk('pk-nacht', 'Nachtsicht-Kamera', '🪖', [['nightvision', 1], ['tvstatic', 0.15], ['vignette', 0.7], ['scanlines', 0.3]]),
    pk('pk-cctv', 'Überwachungskamera', '📹', [['bw', 0.9], ['tvstatic', 0.2], ['scanlines', 0.4], ['interlace', 0.3]]),
    pk('pk-80er', '80er Neon', '🕹️', [['neonedge', 0.5], ['glow', 0.5], ['scanlines', 0.3]]),
    pk('pk-comic', 'Comic-Buch', '🦸', [['edge', 1], ['halftone', 0.3]]),
    pk('pk-psy', 'Psychedelisch', '🍄', [['huecycle', 0.7], ['swirl', 0.3], ['kaleido', 0.6]]),
    pk('pk-hitze', 'Wüstenhitze', '🏜️', [['heat', 0.7], ['glow', 0.3]]),
    pk('pk-miniatur', 'Miniatur-Welt', '🚂', [['tiltshift', 0.8], ['sharpen', 0.3]])
  ];

  /* Übergänge – type = Nummer im Übergangs-Shader; cat wie Resolve. */
  function tr(id, name, icon, type, cat) { return { id: id, name: name, icon: icon, type: type, cat: cat }; }
  var TRANSITIONS = [
    tr('cut', 'Harter Schnitt', '✂️', 0, 'Blende'),
    tr('fade', 'Cross Dissolve', '🌫️', 1, 'Blende'), tr('dipblack', 'Über Schwarz', '⬛', 2, 'Blende'),
    tr('dipwhite', 'Über Weiß', '⬜', 3, 'Blende'), tr('additive', 'Additive Blende', '➕', 33, 'Blende'),
    tr('blur', 'Blur Dissolve', '💧', 16, 'Blende'), tr('morph', 'Smooth Cut (Morph)', '🫠', 32, 'Blende'),
    tr('burn', 'Film-Brand', '🔥', 17, 'Blende'), tr('leak', 'Light-Leak-Blende', '🌅', 35, 'Blende'),
    tr('wipeL', 'Wischen links', '⬅️', 4, 'Wischen'), tr('wipeR', 'Wischen rechts', '➡️', 5, 'Wischen'),
    tr('wipeUp', 'Wischen hoch', '⬆️', 6, 'Wischen'), tr('softwipe', 'Weiches Wischen', '🪶', 36, 'Wischen'),
    tr('diag', 'Diagonal', '↗️', 18, 'Wischen'), tr('clock', 'Uhr-Wischen', '🕐', 21, 'Wischen'),
    tr('blinds', 'Jalousie', '🪟', 30, 'Wischen'), tr('checker', 'Schachbrett', '🏁', 31, 'Wischen'),
    tr('blocks', 'Zufalls-Blöcke', '🧱', 29, 'Wischen'), tr('barnH', 'Tür auf (seitlich)', '🚪', 22, 'Wischen'),
    tr('barnV', 'Tür auf (oben/unten)', '↕️', 23, 'Wischen'),
    tr('circle', 'Iris Kreis', '⭕', 12, 'Iris'), tr('irisbox', 'Iris Rechteck', '🔳', 20, 'Iris'),
    tr('diamond', 'Iris Raute', '🔶', 37, 'Iris'), tr('heart', 'Herz', '💖', 24, 'Iris'),
    tr('pushL', 'Schieben links', '⏩', 7, 'Bewegung'), tr('slideR', 'Schieben rechts', '⏪', 8, 'Bewegung'),
    tr('pushUp', 'Schieben hoch', '⏫', 27, 'Bewegung'), tr('pushDown', 'Schieben runter', '⏬', 28, 'Bewegung'),
    tr('whip', 'Whip Pan', '💨', 19, 'Bewegung'), tr('zoomIn', 'Zoom rein', '🔍', 9, 'Bewegung'),
    tr('zoomOut', 'Zoom raus', '🔎', 10, 'Bewegung'), tr('crosszoom', 'Cross Zoom', '🎯', 34, 'Bewegung'),
    tr('spin', 'Drehen', '🌀', 13, 'Bewegung'),
    tr('glitch', 'Glitch', '⚡', 11, 'Stil'), tr('flash', 'Blitz', '📸', 14, 'Stil'),
    tr('pixel', 'Pixel', '🟪', 15, 'Stil'), tr('ripple', 'Wasserwelle', '🌊', 25, 'Stil'),
    tr('swirl', 'Strudel', '🌪️', 26, 'Stil')
  ];

  /* Generatoren (wie in Resolve: Clips ohne Videodatei) */
  var GENERATORS = [
    { id: 'solid', name: 'Volltonfarbe', icon: '🟧' }, { id: 'gradient', name: 'Farbverlauf', icon: '🌇' },
    { id: 'animgrad', name: 'Bewegter Verlauf', icon: '🌈' }, { id: 'bars', name: 'Farbbalken (SMPTE)', icon: '📊' },
    { id: 'noise', name: 'Rauschen', icon: '📡' }, { id: 'countdown', name: 'Countdown 3-2-1', icon: '⏳' },
    { id: 'black', name: 'Schwarzbild', icon: '⬛' }
  ];

  function node(name, o) {
    var n = {
      name: name || 'Node', on: true,
      lift: { x: 0, y: 0, m: 0 }, gamma: { x: 0, y: 0, m: 0 }, gain: { x: 0, y: 0, m: 0 }, offset: { x: 0, y: 0, m: 0 },
      contrast: 1, pivot: 0.435, sat: 1, hue: 0, temp: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0
    };
    if (o) for (var k in o) n[k] = (typeof o[k] === 'object') ? JSON.parse(JSON.stringify(o[k])) : o[k];
    return n;
  }
  function w(x, y, m) { return { x: x, y: y, m: m || 0 }; }

  /* Farb-Looks (wie LUTs) – setzen die Werte eines Nodes. */
  var LOOKS = [
    { id: 'teal-orange', name: 'Teal & Orange', icon: '🎬', node: { lift: w(-0.55, -0.35), gain: w(0.45, 0.35), sat: 1.15, contrast: 1.1 } },
    { id: 'blockbuster', name: 'Blockbuster Blau', icon: '🦸', node: { lift: w(-0.6, -0.5, -0.02), gamma: w(-0.2, -0.2), sat: 0.95, contrast: 1.2 } },
    { id: 'kodak', name: 'Kodak Film (warm)', icon: '🎞️', node: { lift: w(-0.2, -0.3, 0.03), gain: w(0.3, 0.3), temp: 0.15, sat: 1.05, contrast: 1.12 } },
    { id: 'fuji', name: 'Fuji Film (kühl)', icon: '🗻', node: { lift: w(-0.3, 0.2, 0.03), gamma: w(-0.1, 0.15), sat: 0.9, contrast: 1.05 } },
    { id: 'warm', name: 'Warmer Sommer', icon: '☀️', node: { temp: 0.45, sat: 1.15, gain: w(0.2, 0.25, 0.05) } },
    { id: 'golden', name: 'Golden Hour', icon: '🌇', node: { temp: 0.55, tint: 0.1, gain: w(0.35, 0.3, 0.08), sat: 1.2 } },
    { id: 'cold', name: 'Kalt & Klar', icon: '❄️', node: { temp: -0.5, sat: 0.9, contrast: 1.1 } },
    { id: 'winter', name: 'Winter', icon: '☃️', node: { temp: -0.6, sat: 0.7, exposure: 0.15, lift: w(-0.3, -0.2, 0.05) } },
    { id: 'autumn', name: 'Herbst', icon: '🍂', node: { temp: 0.35, hue: -8, sat: 1.2, gamma: w(0.25, 0.3) } },
    { id: 'moody', name: 'Moody Grün', icon: '🌲', node: { gamma: w(-0.3, 0.4, -0.05), sat: 0.75, contrast: 1.2, exposure: -0.2 } },
    { id: 'matrix', name: 'Matrix-Grün', icon: '🟩', node: { tint: -0.6, gamma: w(-0.4, 0.5), sat: 0.8, contrast: 1.2 } },
    { id: 'matte', name: 'Matter Film', icon: '🎞️', node: { lift: w(0, 0, 0.12), contrast: 0.85, sat: 0.85 } },
    { id: 'bleach', name: 'Bleach Bypass', icon: '🩶', node: { sat: 0.45, contrast: 1.35 } },
    { id: 'war', name: 'Kriegsfilm (entsättigt)', icon: '🪖', node: { sat: 0.35, contrast: 1.3, temp: 0.1, exposure: -0.1 } },
    { id: 'bw-hard', name: 'S/W Kontrast', icon: '◐', node: { sat: 0, contrast: 1.4 } },
    { id: 'bw-soft', name: 'S/W Weich', icon: '◑', node: { sat: 0, contrast: 0.9, lift: w(0, 0, 0.06) } },
    { id: 'vintage', name: 'Vintage', icon: '📷', node: { temp: 0.3, tint: 0.15, sat: 0.75, lift: w(0.2, 0.2, 0.08), contrast: 0.9 } },
    { id: 'seventies', name: '70er Jahre', icon: '🕺', node: { temp: 0.4, hue: 6, sat: 0.85, lift: w(0.4, 0.3, 0.07), contrast: 0.9 } },
    { id: 'polaroid', name: 'Polaroid', icon: '🖼️', node: { lift: w(-0.3, 0.3, 0.1), gain: w(0.3, 0.4, -0.05), sat: 0.85 } },
    { id: 'pastel', name: 'Pastell (Wes Anderson)', icon: '🎀', node: { sat: 0.8, lift: w(0.3, 0.2, 0.12), exposure: 0.15, contrast: 0.85, tint: 0.1 } },
    { id: 'neon', name: 'Neon-Nacht', icon: '🌃', node: { tint: 0.35, temp: -0.3, sat: 1.4, contrast: 1.15 } },
    { id: 'cyberpunk', name: 'Cyberpunk', icon: '🤖', node: { tint: 0.5, lift: w(-0.4, -0.6), gain: w(0.6, -0.4), sat: 1.3, contrast: 1.2 } },
    { id: 'pop', name: 'Knallig (Instagram)', icon: '🍭', node: { sat: 1.5, contrast: 1.15 } },
    { id: 'highkey', name: 'High Key (hell)', icon: '🤍', node: { exposure: 0.5, contrast: 0.85, shadows: 0.3, sat: 0.9 } },
    { id: 'lowkey', name: 'Low Key (dunkel)', icon: '🖤', node: { exposure: -0.5, contrast: 1.3, shadows: -0.3 } },
    { id: 'drama', name: 'Drama', icon: '🎭', node: { contrast: 1.4, sat: 0.8, highlights: -0.2, shadows: -0.2 } },
    { id: 'night', name: 'Day for Night', icon: '🌙', node: { exposure: -0.9, temp: -0.7, sat: 0.6 } },
    { id: 'rec709', name: 'Log → Normal (iPhone Log)', icon: '📱', node: { contrast: 1.45, sat: 1.35, pivot: 0.4, gamma: w(0, 0, -0.15) } }
  ];

  /* Partikel-Effekte / Feuer & Co. (wie Fusion-Partikel) – full = über das ganze Bild. */
  var PARTICLES = [
    { id: 'fire', name: 'Feuer', icon: '🔥' }, { id: 'handfire', name: 'Feuer in der Hand', icon: '🫴' },
    { id: 'embers', name: 'Glut', icon: '🟠' }, { id: 'sparks', name: 'Funken', icon: '✨' },
    { id: 'smoke', name: 'Rauch', icon: '💨' }, { id: 'fog', name: 'Nebel', icon: '🌫️', full: true },
    { id: 'explosion', name: 'Explosion', icon: '💥' }, { id: 'fireworks', name: 'Feuerwerk', icon: '🎆' },
    { id: 'lightning', name: 'Blitze', icon: '🌩️' }, { id: 'magic', name: 'Magie-Glitzer', icon: '🪄' },
    { id: 'aura', name: 'Energie-Aura', icon: '🔵' }, { id: 'hearts', name: 'Herzen', icon: '❤️' },
    { id: 'likes', name: 'Likes', icon: '👍' }, { id: 'notes', name: 'Musiknoten', icon: '🎵' },
    { id: 'butterflies', name: 'Schmetterlinge', icon: '🦋' }, { id: 'balloons', name: 'Luftballons', icon: '🎈' },
    { id: 'bubbles', name: 'Seifenblasen', icon: '🫧' },
    { id: 'confetti', name: 'Konfetti', icon: '🎉', full: true }, { id: 'snow', name: 'Schnee', icon: '❄️', full: true },
    { id: 'rain', name: 'Regen', icon: '🌧️', full: true }, { id: 'leaves', name: 'Herbstblätter', icon: '🍂', full: true },
    { id: 'petals', name: 'Blütenblätter', icon: '🌸', full: true }, { id: 'dust', name: 'Staub im Licht', icon: '🌟', full: true },
    { id: 'twinkle', name: 'Sternenhimmel', icon: '⭐', full: true }, { id: 'bokeh', name: 'Bokeh-Lichter', icon: '🟡', full: true },
    { id: 'goldrain', name: 'Goldregen', icon: '🪙', full: true }, { id: 'matrix', name: 'Matrix-Code', icon: '💻', full: true },
    { id: 'money', name: 'Geldregen', icon: '💸', full: true }, { id: 'emojirain', name: 'Lach-Regen', icon: '😂', full: true }
  ];

  /* Animierte Cliparts (Emoji, damit sie auf jedem Apple-Gerät scharf aussehen). */
  var STICKERS = [
    ['🔥', 'pulse'], ['💥', 'pop'], ['⚡', 'shake'], ['✨', 'pulse'], ['⭐', 'spin'], ['🌟', 'pulse'], ['❤️', 'pulse'], ['💔', 'shake'],
    ['😂', 'bounce'], ['🤣', 'wiggle'], ['😎', 'bounce'], ['😍', 'pulse'], ['🥳', 'bounce'], ['😱', 'shake'], ['🤯', 'shake'], ['😴', 'float'],
    ['🙈', 'wiggle'], ['🤔', 'wiggle'], ['😡', 'shake'], ['🥺', 'pulse'], ['👍', 'pop'], ['👏', 'bounce'], ['🙌', 'bounce'], ['💪', 'pulse'],
    ['🤘', 'shake'], ['✌️', 'wiggle'], ['👉', 'wiggle'], ['👈', 'wiggle'], ['👆', 'bounce'], ['👇', 'bounce'], ['👀', 'wiggle'], ['💯', 'pop'],
    ['🎸', 'wiggle'], ['🥁', 'bounce'], ['🎹', 'wiggle'], ['🎤', 'bounce'], ['🎧', 'pulse'], ['🎶', 'float'], ['🎬', 'pop'], ['📸', 'pop'],
    ['🎥', 'pop'], ['🚁', 'float'], ['🚀', 'float'], ['🌈', 'float'], ['🎉', 'pop'], ['🎊', 'pop'], ['🎁', 'bounce'], ['🏆', 'bounce'],
    ['🥇', 'spin'], ['💎', 'spin'], ['👑', 'float'], ['💰', 'bounce'], ['☀️', 'spin'], ['🌙', 'float'], ['☁️', 'float'], ['⛈️', 'shake'],
    ['🌊', 'float'], ['🌴', 'wiggle'], ['🍕', 'spin'], ['🍻', 'wiggle'], ['☕', 'float'], ['🎂', 'bounce'], ['💍', 'spin'], ['💐', 'float'],
    ['🐶', 'bounce'], ['🐱', 'wiggle'], ['🦄', 'float'], ['🐉', 'float'], ['👻', 'float'], ['💀', 'shake'], ['🤖', 'wiggle'], ['👽', 'float'],
    ['➡️', 'wiggle'], ['⬅️', 'wiggle'], ['⬆️', 'bounce'], ['⬇️', 'bounce'], ['❗', 'shake'], ['❓', 'wiggle'], ['✅', 'pop'], ['❌', 'pop'],
    ['🆕', 'pop'], ['🔔', 'wiggle'], ['📍', 'bounce'], ['💡', 'pulse'], ['⏰', 'shake'], ['📣', 'shake'], ['💬', 'pop'], ['🔴', 'pulse']
  ].map(function (s, i) { return { id: 'st' + i, name: s[0], emoji: s[0], anim: s[1] }; });

  var STICKER_ANIMS = [['none', 'Keine'], ['pop', 'Reinploppen'], ['bounce', 'Hüpfen'], ['pulse', 'Pulsieren'],
    ['spin', 'Drehen'], ['float', 'Schweben'], ['shake', 'Zittern'], ['wiggle', 'Wackeln']];

  /* Titel (wie Resolve „Titles“) */
  var TEXT_STYLES = [
    { id: 'clean', name: 'Klar', icon: 'Aa' }, { id: 'outline', name: 'Kontur', icon: '🅰️' },
    { id: 'impact', name: 'Fett & Gelb', icon: '🟨' }, { id: 'neon', name: 'Neon', icon: '💡' },
    { id: 'gradient', name: 'Verlauf (JZo)', icon: '🧡' }, { id: 'shadow3d', name: '3D-Schatten', icon: '🧊' },
    { id: 'box', name: 'Weiße Box', icon: '⬜' }, { id: 'script', name: 'Handschrift', icon: '✍️' },
    { id: 'trailer', name: 'Kino-Trailer', icon: '🎬' }, { id: 'glitchtext', name: 'Glitch-Text', icon: '⚡' },
    { id: 'subtitle', name: 'Untertitel', icon: '💬' }, { id: 'lower', name: 'Bauchbinde', icon: '▭' }
  ];
  var TEXT_ANIMS = [['pop', 'Reinploppen'], ['fade', 'Einblenden'], ['slide', 'Von unten'], ['zoom', 'Reinzoomen'],
    ['bounce', 'Hüpfen'], ['wave', 'Welle'], ['type', 'Schreibmaschine'], ['glitch', 'Glitch'], ['none', 'Keine']];

  /* KI-Modelle (Standard – im Admin-Bereich ersetzbar). */
  var AI_MODELS = [
    { id: 'higgsfield', name: 'Higgsfield', provider: 'Higgsfield', kind: 'Effekte, Kamerafahrten, Video-zu-Video', url: 'https://higgsfield.ai/', note: 'Viele fertige Spezialeffekte (Feuer, Explosion, Auflösen …). Hier sind auch Kling und Seedance direkt nutzbar.' },
    { id: 'kling4', name: 'Kling 4.0', provider: 'Kling AI', kind: 'Bild-zu-Video, Video-Effekte', url: 'https://app.klingai.com/', note: 'Sehr realistische Bewegungen und Gesichter.' },
    { id: 'seedance25', name: 'Seedance 2.5', provider: 'ByteDance', kind: 'Bild-zu-Video, Text-zu-Video', url: 'https://higgsfield.ai/', note: 'Über Higgsfield oder Dreamina (CapCut) nutzbar.' },
    { id: 'veo', name: 'Google Veo', provider: 'Google', kind: 'Text-/Bild-zu-Video mit Ton', url: 'https://labs.google/fx/tools/flow', note: '' },
    { id: 'runway', name: 'Runway', provider: 'Runway', kind: 'Video-zu-Video, Hintergrund entfernen', url: 'https://app.runwayml.com/', note: '' }
  ];

  /* Wunsch-Vorlagen für generative KI (Englisch verstehen alle Modelle am besten). */
  function ae(id, name, icon, model, prompt) { return { id: id, name: name, icon: icon, model: model, prompt: prompt }; }
  var AI_EFFECTS = [
    ae('ai-handfire', 'Feuer in der Hand', '🔥', 'higgsfield', 'The person opens their hand and a realistic burning flame appears on the palm, fire follows the hand movement, warm light on the face, cinematic, everything else unchanged'),
    ae('ai-fireball', 'Feuerball werfen', '☄️', 'higgsfield', 'The person throws a realistic fireball towards the camera, flames and sparks, light flickers on the surroundings, cinematic'),
    ae('ai-explode', 'Explosion im Hintergrund', '💥', 'higgsfield', 'A massive cinematic explosion erupts in the background, debris and smoke, camera shake, the person stays calm in the foreground'),
    ae('ai-disint', 'Zu Staub zerfallen', '🌪️', 'higgsfield', 'The person slowly disintegrates into glowing dust particles that blow away in the wind, cinematic'),
    ae('ai-levitate', 'Schweben', '🧘', 'higgsfield', 'The person slowly levitates off the ground, floating in the air, dust particles around, magical atmosphere'),
    ae('ai-thunder', 'Blitz-Kräfte', '⚡', 'higgsfield', 'Blue electric lightning crackles around the person\'s hands and body, glowing eyes, epic superhero moment'),
    ae('ai-wings', 'Flügel', '🪽', 'higgsfield', 'Huge white angel wings unfold from the person\'s back, feathers floating, heavenly light'),
    ae('ai-firewings', 'Feuerflügel', '🐦‍🔥', 'higgsfield', 'Giant wings made of fire unfold from the person\'s back like a phoenix, embers flying, epic'),
    ae('ai-metal', 'Zu Metall werden', '🤖', 'higgsfield', 'The person\'s skin gradually turns into polished chrome metal, reflective, sci-fi transformation'),
    ae('ai-ice', 'Einfrieren', '🧊', 'higgsfield', 'The person and the scene slowly freeze into ice, frost spreading, cold breath, crystals forming'),
    ae('ai-glass', 'Zerbricht wie Glas', '🪟', 'higgsfield', 'The whole frame shatters like glass into thousands of pieces flying towards the camera in slow motion'),
    ae('ai-portal', 'Portal öffnen', '🌀', 'higgsfield', 'A glowing magic portal opens behind the person, swirling energy and sparks, wind blowing hair'),
    ae('ai-invisible', 'Unsichtbar werden', '🫥', 'higgsfield', 'The person slowly becomes invisible, transparent shimmering outline, background visible through the body'),
    ae('ai-clone', 'Klonen', '👯', 'kling4', 'Several identical copies of the person appear next to each other and move in sync'),
    ae('ai-hologram', 'Hologramm', '🔷', 'higgsfield', 'The person turns into a blue sci-fi hologram with scanlines and flicker'),
    ae('ai-anime', 'Anime-Stil', '🎌', 'kling4', 'Transform the whole video into high quality anime style, same motion and composition'),
    ae('ai-comic', 'Comic-Stil', '🦸', 'kling4', 'Transform the video into a colorful comic book style with ink outlines, same motion'),
    ae('ai-daynight', 'Tag zu Nacht', '🌙', 'kling4', 'Turn this daytime scene into a night scene with moonlight and city lights, same motion'),
    ae('ai-weather', 'Echter Regen / Gewitter', '⛈️', 'kling4', 'Add realistic heavy rain and a thunderstorm with lightning to the scene, wet reflections'),
    ae('ai-bg', 'Hintergrund austauschen', '🏝️', 'runway', 'Replace the background with a tropical beach at sunset, keep the person exactly the same'),
    ae('ai-drone', 'Drohnenflug weg', '🚁', 'kling4', 'Epic drone shot pulling back and rising high into the sky revealing the whole landscape, smooth motion'),
    ae('ai-dolly', 'Dolly-Zoom (Vertigo)', '🎥', 'higgsfield', 'Dramatic dolly zoom vertigo effect, the background stretches while the person stays the same size'),
    ae('ai-orbit', 'Kamera kreist herum', '🔄', 'higgsfield', 'The camera orbits 360 degrees around the person smoothly, cinematic'),
    ae('ai-animate', 'Foto zum Leben erwecken', '🖼️', 'seedance25', 'Bring this photo to life with natural subtle motion, people move naturally, light breeze, cinematic camera push in'),
    ae('ai-guitar', 'Gitarre in Flammen', '🎸', 'higgsfield', 'The electric guitar bursts into flames while being played, sparks fly from the strings, rock concert lighting'),
    ae('ai-stage', 'Konzert-Bühne', '🎤', 'seedance25', 'Place the person on a huge concert stage with crowd, spotlights, smoke and confetti')
  ];

  var fxMap = {};
  FX.forEach(function (f) { fxMap[f.id] = f; });
  global.LIB = {
    FX: FX, FX_CATS: FX_CATS, PACKS: PACKS, TRANSITIONS: TRANSITIONS, GENERATORS: GENERATORS, LOOKS: LOOKS, PARTICLES: PARTICLES,
    STICKERS: STICKERS, STICKER_ANIMS: STICKER_ANIMS, TEXT_STYLES: TEXT_STYLES, TEXT_ANIMS: TEXT_ANIMS,
    AI_MODELS: AI_MODELS, AI_EFFECTS: AI_EFFECTS, node: node,
    fxById: function (id) { return fxMap[id] || null; },
    find: function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  };
})(this);
