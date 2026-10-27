/* JZo Video AI – eingebaute Bibliothek: Effekte, Übergänge, Farb-Looks,
   Partikel (Feuer & Co.), Sticker, Textstile und KI-Modelle.
   Zusätzliche Einträge kommen aus data/library.json (Admin-Bereich). */
(function (global) {
  'use strict';

  /* ---- Clip-Effekte. kind 'shader' = im Bild (slot = Platz im Shader),
     kind 'move' = Bewegung/Zoom (wird als Bild-Transformation berechnet). */
  var FX = [
    { id: 'glitch',    name: 'Glitch',           icon: '⚡', kind: 'shader', slot: 0,  def: 0.6, cat: 'glitch' },
    { id: 'rgbsplit',  name: 'RGB-Split',        icon: '🌈', kind: 'shader', slot: 1,  def: 0.5, cat: 'glitch' },
    { id: 'vhs',       name: 'VHS',              icon: '📼', kind: 'shader', slot: 2,  def: 0.7, cat: 'glitch' },
    { id: 'scanlines', name: 'Scanlines',        icon: '📺', kind: 'shader', slot: 11, def: 0.5, cat: 'glitch' },
    { id: 'pixelate',  name: 'Verpixeln',        icon: '🟪', kind: 'shader', slot: 6,  def: 0.4, cat: 'glitch' },
    { id: 'strobe',    name: 'Strobo-Blitz',     icon: '💡', kind: 'shader', slot: 14, def: 0.5, cat: 'glitch' },
    { id: 'huecycle',  name: 'Farbwechsel',      icon: '🎨', kind: 'shader', slot: 15, def: 0.5, cat: 'glitch' },
    { id: 'thermal',   name: 'Wärmebild',        icon: '🌡️', kind: 'shader', slot: 18, def: 1.0, cat: 'glitch' },
    { id: 'kaleido',   name: 'Kaleidoskop',      icon: '🔷', kind: 'shader', slot: 17, def: 1.0, cat: 'glitch' },
    { id: 'invert',    name: 'Negativ',          icon: '🔄', kind: 'shader', slot: 9,  def: 1.0, cat: 'glitch' },
    { id: 'grain',     name: 'Filmkorn',         icon: '🎞️', kind: 'shader', slot: 3,  def: 0.4, cat: 'look' },
    { id: 'vignette',  name: 'Vignette',         icon: '⚫', kind: 'shader', slot: 4,  def: 0.5, cat: 'look' },
    { id: 'blur',      name: 'Weichzeichner',    icon: '💧', kind: 'shader', slot: 5,  def: 0.5, cat: 'look' },
    { id: 'bw',        name: 'Schwarz-Weiß',     icon: '◐',  kind: 'shader', slot: 7,  def: 1.0, cat: 'look' },
    { id: 'sepia',     name: 'Sepia',            icon: '🟫', kind: 'shader', slot: 8,  def: 0.8, cat: 'look' },
    { id: 'mirror',    name: 'Spiegeln',         icon: '🪞', kind: 'shader', slot: 10, def: 1.0, cat: 'look' },
    { id: 'posterize', name: 'Comic/Poster',     icon: '🖍️', kind: 'shader', slot: 12, def: 0.6, cat: 'look' },
    { id: 'lightleak', name: 'Light Leak',       icon: '🌅', kind: 'shader', slot: 13, def: 0.6, cat: 'look' },
    { id: 'fisheye',   name: 'Fischauge',        icon: '🐟', kind: 'shader', slot: 16, def: 0.6, cat: 'look' },
    { id: 'cinebars',  name: 'Kino-Balken',      icon: '🎬', kind: 'shader', slot: 19, def: 1.0, cat: 'look' },
    { id: 'zoomIn',    name: 'Dynamic Zoom rein', icon: '🔍', kind: 'move', def: 0.6, cat: 'motion' },
    { id: 'zoomOut',   name: 'Dynamic Zoom raus', icon: '🔎', kind: 'move', def: 0.6, cat: 'motion' },
    { id: 'punch',     name: 'Beat-Zoom',        icon: '🥁', kind: 'move', def: 0.6, cat: 'motion' },
    { id: 'kenburns',  name: 'Ken Burns (Schwenk)', icon: '🖼️', kind: 'move', def: 0.6, cat: 'motion' },
    { id: 'shake',     name: 'Wackel-Kamera',    icon: '📳', kind: 'move', def: 0.5, cat: 'motion' },
    { id: 'quake',     name: 'Erdbeben',         icon: '🌋', kind: 'move', def: 0.6, cat: 'motion' },
    { id: 'wobble',    name: 'Schaukeln',        icon: '〰️', kind: 'move', def: 0.5, cat: 'motion' },
    { id: 'spinIn',    name: 'Dreh-Einstieg',    icon: '🌀', kind: 'move', def: 0.7, cat: 'motion' },
    { id: 'bounceIn',  name: 'Bounce-Einstieg',  icon: '🏀', kind: 'move', def: 0.7, cat: 'motion' }
  ];

  /* Fertige Kombinationen (wie „Effekt-Pakete“). */
  var PACKS = [
    { id: 'pk-musikvideo', name: 'Musikvideo',  icon: '🎸', items: [{ fx: 'glitch', amount: 0.35 }, { fx: 'rgbsplit', amount: 0.4 }, { fx: 'punch', amount: 0.6 }] },
    { id: 'pk-retro',      name: 'Retro-VHS',   icon: '📼', items: [{ fx: 'vhs', amount: 0.7 }, { fx: 'grain', amount: 0.4 }, { fx: 'scanlines', amount: 0.3 }, { fx: 'sepia', amount: 0.25 }] },
    { id: 'pk-kino',       name: 'Kino-Look',   icon: '🎬', items: [{ fx: 'cinebars', amount: 1 }, { fx: 'vignette', amount: 0.45 }, { fx: 'grain', amount: 0.2 }, { fx: 'zoomIn', amount: 0.3 }] },
    { id: 'pk-altfilm',    name: 'Alter Film',  icon: '🎞️', items: [{ fx: 'bw', amount: 1 }, { fx: 'grain', amount: 0.7 }, { fx: 'vignette', amount: 0.7 }, { fx: 'shake', amount: 0.15 }] },
    { id: 'pk-party',      name: 'Party',       icon: '🪩', items: [{ fx: 'strobe', amount: 0.35 }, { fx: 'huecycle', amount: 0.4 }, { fx: 'punch', amount: 0.8 }] },
    { id: 'pk-traum',      name: 'Traum',       icon: '☁️', items: [{ fx: 'blur', amount: 0.25 }, { fx: 'lightleak', amount: 0.6 }, { fx: 'zoomIn', amount: 0.4 }] },
    { id: 'pk-horror',     name: 'Horror',      icon: '👻', items: [{ fx: 'glitch', amount: 0.4 }, { fx: 'bw', amount: 0.8 }, { fx: 'vignette', amount: 0.9 }, { fx: 'quake', amount: 0.25 }] },
    { id: 'pk-action',     name: 'Action',      icon: '💥', items: [{ fx: 'quake', amount: 0.5 }, { fx: 'rgbsplit', amount: 0.3 }, { fx: 'cinebars', amount: 1 }] }
  ];

  /* Übergänge – type = Nummer im Übergangs-Shader. */
  var TRANSITIONS = [
    { id: 'cut',       name: 'Harter Schnitt', icon: '✂️', type: 0 },
    { id: 'fade',      name: 'Überblenden',    icon: '🌫️', type: 1 },
    { id: 'dipblack',  name: 'Über Schwarz',   icon: '⬛', type: 2 },
    { id: 'dipwhite',  name: 'Über Weiß',      icon: '⬜', type: 3 },
    { id: 'wipeL',     name: 'Wischen links',  icon: '⬅️', type: 4 },
    { id: 'wipeR',     name: 'Wischen rechts', icon: '➡️', type: 5 },
    { id: 'wipeUp',    name: 'Wischen hoch',   icon: '⬆️', type: 6 },
    { id: 'pushL',     name: 'Schieben',       icon: '⏩', type: 7 },
    { id: 'whip',      name: 'Whip Pan',       icon: '💨', type: 19 },
    { id: 'zoomIn',    name: 'Zoom rein',      icon: '🔍', type: 9 },
    { id: 'zoomOut',   name: 'Zoom raus',      icon: '🔎', type: 10 },
    { id: 'glitch',    name: 'Glitch',         icon: '⚡', type: 11 },
    { id: 'circle',    name: 'Kreis',          icon: '⭕', type: 12 },
    { id: 'spin',      name: 'Drehen',         icon: '🌀', type: 13 },
    { id: 'flash',     name: 'Blitz',          icon: '📸', type: 14 },
    { id: 'pixel',     name: 'Pixel',          icon: '🟪', type: 15 },
    { id: 'blur',      name: 'Unschärfe',      icon: '💧', type: 16 },
    { id: 'burn',      name: 'Film-Brand',     icon: '🔥', type: 17 },
    { id: 'diag',      name: 'Diagonal',       icon: '↗️', type: 18 },
    { id: 'slideR',    name: 'Schieben rechts', icon: '⏪', type: 8 }
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

  /* Farb-Looks (wie LUTs) – setzen die Werte eines Nodes. */
  var LOOKS = [
    { id: 'teal-orange', name: 'Teal & Orange', icon: '🎬', node: { lift: { x: -0.55, y: -0.35, m: 0 }, gain: { x: 0.45, y: 0.35, m: 0 }, sat: 1.15, contrast: 1.1 } },
    { id: 'warm',        name: 'Warmer Sommer', icon: '☀️', node: { temp: 0.45, sat: 1.15, gain: { x: 0.2, y: 0.25, m: 0.05 } } },
    { id: 'cold',        name: 'Kalt & Klar',   icon: '❄️', node: { temp: -0.5, sat: 0.9, contrast: 1.1 } },
    { id: 'matte',       name: 'Matter Film',   icon: '🎞️', node: { lift: { x: 0, y: 0, m: 0.12 }, contrast: 0.85, sat: 0.85 } },
    { id: 'bleach',      name: 'Bleach Bypass', icon: '🩶', node: { sat: 0.45, contrast: 1.35 } },
    { id: 'bw-hard',     name: 'S/W Kontrast',  icon: '◐',  node: { sat: 0, contrast: 1.4 } },
    { id: 'vintage',     name: 'Vintage',       icon: '📷', node: { temp: 0.3, tint: 0.15, sat: 0.75, lift: { x: 0.2, y: 0.2, m: 0.08 }, contrast: 0.9 } },
    { id: 'neon',        name: 'Neon-Nacht',    icon: '🌃', node: { tint: 0.35, temp: -0.3, sat: 1.4, contrast: 1.15 } },
    { id: 'pop',         name: 'Knallig',       icon: '🍭', node: { sat: 1.5, contrast: 1.15 } },
    { id: 'night',       name: 'Day for Night', icon: '🌙', node: { exposure: -0.9, temp: -0.7, sat: 0.6 } }
  ];

  /* Partikel-Effekte / Feuer & Co. – full = über das ganze Bild. */
  var PARTICLES = [
    { id: 'fire',      name: 'Feuer',            icon: '🔥' },
    { id: 'handfire',  name: 'Feuer in der Hand', icon: '🫴' },
    { id: 'sparks',    name: 'Funken',           icon: '✨' },
    { id: 'smoke',     name: 'Rauch',            icon: '💨' },
    { id: 'explosion', name: 'Explosion',        icon: '💥' },
    { id: 'lightning', name: 'Blitze',           icon: '🌩️' },
    { id: 'magic',     name: 'Magie-Glitzer',    icon: '🪄' },
    { id: 'aura',      name: 'Energie-Aura',     icon: '🔵' },
    { id: 'hearts',    name: 'Herzen',           icon: '❤️' },
    { id: 'confetti',  name: 'Konfetti',         icon: '🎉', full: true },
    { id: 'snow',      name: 'Schnee',           icon: '❄️', full: true },
    { id: 'rain',      name: 'Regen',            icon: '🌧️', full: true },
    { id: 'bubbles',   name: 'Seifenblasen',     icon: '🫧' },
    { id: 'money',     name: 'Geldregen',        icon: '💸', full: true },
    { id: 'emojirain', name: 'Lach-Regen',       icon: '😂', full: true }
  ];

  /* Animierte Cliparts (Emoji, damit sie auf jedem Gerät scharf aussehen). */
  var STICKERS = [
    ['🔥', 'pulse'], ['💥', 'pop'], ['⚡', 'shake'], ['✨', 'pulse'], ['⭐', 'spin'], ['❤️', 'pulse'],
    ['😂', 'bounce'], ['😎', 'bounce'], ['🤯', 'shake'], ['👍', 'pop'], ['👀', 'wiggle'], ['💯', 'pop'],
    ['🎸', 'wiggle'], ['🎤', 'bounce'], ['🎬', 'pop'], ['📸', 'pop'], ['🚀', 'float'], ['🌈', 'float'],
    ['🎉', 'pop'], ['🏆', 'bounce'], ['💎', 'spin'], ['👑', 'float'], ['☀️', 'spin'], ['🌙', 'float'],
    ['➡️', 'wiggle'], ['⬇️', 'bounce'], ['❗', 'shake'], ['❓', 'wiggle'], ['🆕', 'pop'], ['🔔', 'wiggle'],
    ['👉', 'wiggle'], ['🙌', 'bounce'], ['💪', 'pulse'], ['🤘', 'shake'], ['🎶', 'float'], ['💡', 'pulse']
  ].map(function (s, i) { return { id: 'st' + i, name: s[0], emoji: s[0], anim: s[1] }; });

  var STICKER_ANIMS = [['none', 'Keine'], ['pop', 'Reinploppen'], ['bounce', 'Hüpfen'], ['pulse', 'Pulsieren'],
    ['spin', 'Drehen'], ['float', 'Schweben'], ['shake', 'Zittern'], ['wiggle', 'Wackeln']];

  var TEXT_STYLES = [
    { id: 'clean',    name: 'Klar',        icon: 'Aa' },
    { id: 'outline',  name: 'Kontur',      icon: '🅰️' },
    { id: 'neon',     name: 'Neon',        icon: '💡' },
    { id: 'subtitle', name: 'Untertitel',  icon: '💬' },
    { id: 'lower',    name: 'Bauchbinde',  icon: '▭' },
    { id: 'impact',   name: 'Fett & Gelb', icon: '🟨' }
  ];
  var TEXT_ANIMS = [['pop', 'Reinploppen'], ['fade', 'Einblenden'], ['slide', 'Von unten'], ['type', 'Schreibmaschine'], ['none', 'Keine']];

  /* KI-Modelle (Standard – im Admin-Bereich erweiterbar). */
  var AI_MODELS = [
    { id: 'higgsfield', name: 'Higgsfield', provider: 'Higgsfield', kind: 'Effekte, Kamerafahrten, Video-zu-Video', url: 'https://higgsfield.ai/', note: 'Viele fertige Spezialeffekte (Feuer, Explosion, Auflösen …). Hier sind auch Kling und Seedance direkt nutzbar.' },
    { id: 'kling4',     name: 'Kling 4.0',  provider: 'Kling AI',   kind: 'Bild-zu-Video, Video-Effekte', url: 'https://app.klingai.com/', note: 'Sehr realistische Bewegungen und Gesichter.' },
    { id: 'seedance25', name: 'Seedance 2.5', provider: 'ByteDance', kind: 'Bild-zu-Video, Text-zu-Video', url: 'https://higgsfield.ai/', note: 'Über Higgsfield oder Dreamina (CapCut) nutzbar.' },
    { id: 'veo',        name: 'Google Veo', provider: 'Google',     kind: 'Text-/Bild-zu-Video mit Ton', url: 'https://labs.google/fx/tools/flow', note: '' },
    { id: 'runway',     name: 'Runway',     provider: 'Runway',     kind: 'Video-zu-Video, Hintergrund entfernen', url: 'https://app.runwayml.com/', note: '' }
  ];

  /* Wunsch-Vorlagen für generative KI (Prompt auf Englisch, das verstehen alle Modelle am besten). */
  var AI_EFFECTS = [
    { id: 'ai-handfire', name: 'Feuer in der Hand', icon: '🔥', model: 'higgsfield', prompt: 'The person opens their hand and a realistic burning flame appears on the palm, fire follows the hand movement, warm light on the face, cinematic, everything else unchanged' },
    { id: 'ai-explode',  name: 'Explosion im Hintergrund', icon: '💥', model: 'higgsfield', prompt: 'A massive cinematic explosion erupts in the background, debris and smoke, camera shake, the person stays calm in the foreground' },
    { id: 'ai-disint',   name: 'Zu Staub zerfallen', icon: '🌪️', model: 'higgsfield', prompt: 'The person slowly disintegrates into glowing dust particles that blow away in the wind, cinematic' },
    { id: 'ai-levitate', name: 'Schweben', icon: '🧘', model: 'higgsfield', prompt: 'The person slowly levitates off the ground, floating in the air, dust particles around, magical atmosphere' },
    { id: 'ai-thunder',  name: 'Blitz-Kräfte', icon: '⚡', model: 'higgsfield', prompt: 'Blue electric lightning crackles around the person\'s hands and body, glowing eyes, epic superhero moment' },
    { id: 'ai-wings',    name: 'Flügel', icon: '🪽', model: 'higgsfield', prompt: 'Huge white angel wings unfold from the person\'s back, feathers floating, heavenly light' },
    { id: 'ai-metal',    name: 'Zu Metall werden', icon: '🤖', model: 'higgsfield', prompt: 'The person\'s skin gradually turns into polished chrome metal, reflective, sci-fi transformation' },
    { id: 'ai-anime',    name: 'Anime-Stil', icon: '🎌', model: 'kling4', prompt: 'Transform the whole video into high quality anime style, same motion and composition' },
    { id: 'ai-drone',    name: 'Drohnenflug weg', icon: '🚁', model: 'kling4', prompt: 'Epic drone shot pulling back and rising high into the sky revealing the whole landscape, smooth motion' },
    { id: 'ai-animate',  name: 'Foto zum Leben erwecken', icon: '🖼️', model: 'seedance25', prompt: 'Bring this photo to life with natural subtle motion, people move naturally, light breeze, cinematic camera push in' },
    { id: 'ai-guitar',   name: 'Gitarre in Flammen', icon: '🎸', model: 'higgsfield', prompt: 'The electric guitar bursts into flames while being played, sparks fly from the strings, rock concert lighting' }
  ];

  global.LIB = {
    FX: FX, PACKS: PACKS, TRANSITIONS: TRANSITIONS, LOOKS: LOOKS, PARTICLES: PARTICLES,
    STICKERS: STICKERS, STICKER_ANIMS: STICKER_ANIMS, TEXT_STYLES: TEXT_STYLES, TEXT_ANIMS: TEXT_ANIMS,
    AI_MODELS: AI_MODELS, AI_EFFECTS: AI_EFFECTS, node: node,
    fxById: function (id) { for (var i = 0; i < FX.length; i++) if (FX[i].id === id) return FX[i]; return null; },
    find: function (list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  };
})(this);
