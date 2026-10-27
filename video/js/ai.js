/* JZo Video AI – KI-Assistent für Sprachbefehle („Mach einen Glitch auf den Clip“).
   Läuft komplett auf dem Gerät: versteht deutsche Wünsche und setzt sie in
   Effekte, Farben, Übergänge, Partikel und Texte um. Für Dinge, die nur
   generative KI kann (z. B. Flügel wachsen lassen), wird die passende
   Vorlage für Higgsfield/Kling/Seedance vorgeschlagen. */
(function (global) {
  'use strict';

  function norm(s) {
    return (' ' + s + ' ').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ');
  }
  function has(t, words) { for (var i = 0; i < words.length; i++) if (t.indexOf(words[i]) >= 0) return true; return false; }

  var FX_WORDS = [
    ['glitch', ['glitch', 'glitsch', 'stoerung']], ['rgbsplit', ['rgb', 'farbversatz']], ['chroma', ['chromatisch', 'aberration']],
    ['vhs', ['vhs', 'videokassette', '80er', 'achtziger']], ['grain', ['korn', 'koernig', 'grain', 'filmkorn']],
    ['vignette', ['vignette', 'dunkle ecken', 'raender dunkel']], ['blur', ['unscharf', 'weichzeichn', 'blur', 'verschwomm']],
    ['zoomblur', ['zoom-unschaerf', 'zoom unschaerf', 'zoom blur', 'zoomblur']], ['motionblur', ['bewegungsunschaerf', 'motion blur']],
    ['spinblur', ['dreh-unschaerf', 'drehunschaerf', 'spin blur']], ['tiltshift', ['tilt shift', 'tiltshift', 'miniatur']],
    ['vignetteblur', ['rand unschaerf', 'randunschaerf', 'raender unscharf']],
    ['pixelate', ['verpixel', 'mosaik']], ['dither', ['8-bit', '8 bit', 'retro spiel', 'pixel art', 'pixelart', 'videospiel']],
    ['bw', ['schwarz weiss', 'schwarzweiss', 'schwarz-weiss', ' s/w ', 'graustufen']],
    ['sepia', ['sepia']], ['duotone', ['duoton', 'duotone', 'zweifarbig']], ['colorkeep', ['nur rot', 'sin city', 'farbe behalten']],
    ['thermal', ['waermebild', 'thermal', 'waermekamera']], ['nightvision', ['nachtsicht', 'night vision', 'restlicht']],
    ['infrared', ['infrarot']], ['crossproc', ['cross entwickl', 'cross-entwickl', 'cross process']],
    ['mirror', ['spiegel']], ['mirrorv', ['spiegeln oben', 'spiegeln unten']], ['flip', ['kippen', 'umdrehen horizontal']],
    ['grid', ['raster', '4er bild', 'vier mal']], ['invert', ['negativ', 'invert']],
    ['scanlines', ['scanline', 'zeilen']], ['crt', ['roehrenfernseh', 'roehrenbildschirm', 'crt', 'alter fernseher']],
    ['tvstatic', ['tv rauschen', 'tv-rauschen', 'bildrauschen', 'kein signal', 'schneegestoeber']], ['signal', ['signalverlust', 'signal weg']],
    ['interlace', ['zeilensprung', 'interlace']], ['datamosh', ['datamosh', 'bloecke']],
    ['posterize', ['poster', 'tontrennung']], ['edge', ['comic', 'cartoon']], ['sketch', ['skizze', 'bleistift', 'zeichnung']],
    ['neonedge', ['neon kanten', 'neonkanten', 'tron']], ['emboss', ['relief', 'praegung']], ['halftone', ['rasterpunkte', 'raster punkte', 'zeitungsdruck', 'halftone']],
    ['prism', ['prisma']], ['glow', ['glow', 'gluehen', 'leuchten', 'strahlen lassen']],
    ['lightleak', ['light leak', 'lichteinfall', 'lichtleck']], ['lensflare', ['lens flare', 'flare', 'linsenreflex', 'sonnenreflex']],
    ['lightrays', ['lichtstrahl', 'god rays', 'sonnenstrahl']],
    ['strobe', ['strobo', 'blitzlicht']], ['flicker', ['flacker', 'flimmern']], ['huecycle', ['farbwechsel', 'psychedel', 'regenbogenfarben']],
    ['kaleido', ['kaleidoskop']], ['fisheye', ['fischauge', 'fisheye', 'fish eye']], ['pinch', ['einzieh', 'pinch']],
    ['swirl', ['strudel', 'wirbel']], ['ripple', ['wasserwelle', 'wassertropfen']], ['wave', ['wellen', 'wabbel']], ['heat', ['hitze', 'flimmern hitze']],
    ['filmdamage', ['kratzer', 'filmschaden', 'staub und kratzer']], ['sharpen', ['schaerfer', 'schaerfen', 'nachschaerf']],
    ['cinebars', ['kinobalken', 'balken', 'letterbox', 'cinemascope', 'breitbild']],
    ['zoomOut', ['rauszoom', 'zoom raus', 'zoom out', 'wegzoom', 'herauszoom']],
    ['zoomSnap', ['snap zoom', 'snapzoom', 'schneller zoom', 'zack zoom']],
    ['zoomIn', ['reinzoom', 'zoom rein', 'zoom in', 'heranzoom', 'hineinzoom', 'dynamic zoom', 'dynamischer zoom', 'ranzoom']],
    ['punch', ['beat', 'takt', 'punch', 'pumpen']], ['heartbeat', ['herzschlag', 'pulsieren']], ['kenburns', ['ken burns']],
    ['panLeft', ['schwenk nach links', 'schwenk links']], ['panRight', ['schwenk nach rechts', 'schwenk rechts', 'schwenk']],
    ['drift', ['schwebende kamera', 'leicht bewegen', 'drift']],
    ['quake', ['erdbeben', 'beben', 'heftig wackel']], ['shake', ['wackel', 'handkamera', 'shake', 'zitter']],
    ['wobble', ['schaukel']], ['tilt', ['schraeg', 'schief']], ['spinSlow', ['langsam drehen', 'dreht sich']],
    ['spinIn', ['dreh rein', 'eindrehen', 'dreheffekt']], ['bounceIn', ['bounce', 'federn']],
    ['slideInTop', ['von oben rein', 'reinfallen']], ['slideInLeft', ['von links rein', 'reinrutschen']]
  ];
  var PACK_WORDS = [['pk-musikvideo', ['musikvideo']], ['pk-retro', ['retro']], ['pk-altfilm', ['alter film', 'stummfilm', 'oldschool']],
    ['pk-party', ['party', 'club', 'disco']], ['pk-tiktok', ['tiktok', 'reel', 'trend']], ['pk-traum', ['traum', 'vertraeumt']],
    ['pk-hochzeit', ['hochzeit', 'romantisch']], ['pk-flashback', ['erinnerung', 'flashback', 'rueckblende']],
    ['pk-horror', ['horror', 'gruselig', 'unheimlich']], ['pk-action', ['action']], ['pk-trailer', ['trailer']],
    ['pk-cctv', ['ueberwachung', 'cctv', 'security kamera']], ['pk-80er', ['80er neon', 'synthwave']], ['pk-psy', ['psychedelisch', 'drogen', 'trip']],
    ['pk-miniatur', ['miniaturwelt', 'modellbahn']],
    ['pk-kino', ['kinolook', 'kino look', 'cinematic', 'filmisch', 'wie im kino']]];
  var LOOK_WORDS = [['teal-orange', ['teal', 'hollywood', 'cinematic', 'kinolook']], ['blockbuster', ['blockbuster', 'marvel']],
    ['kodak', ['kodak', 'analog film']], ['fuji', ['fuji']], ['golden', ['golden hour', 'sonnenuntergang']], ['winter', ['winterlook']],
    ['autumn', ['herbstlook', 'herbstlich']], ['moody', ['moody', 'duester']], ['matrix', ['matrix']], ['vintage', ['vintage', 'nostalgisch']],
    ['seventies', ['70er', 'siebziger']], ['polaroid', ['polaroid']], ['pastel', ['pastell', 'wes anderson']], ['cyberpunk', ['cyberpunk']],
    ['matte', ['matt']], ['bleach', ['bleach', 'entsaettigt']], ['war', ['kriegsfilm']], ['neon', ['neon']], ['night', ['day for night', 'nachtlook', 'nacht machen']],
    ['highkey', ['high key']], ['lowkey', ['low key']], ['drama', ['dramatisch', 'drama']], ['rec709', ['log', 'apple log', 'flaches profil']],
    ['bw-hard', ['harter kontrast schwarz']], ['pop', ['knallig', 'bunt', 'instagram']]];
  var PART_WORDS = [['handfire', ['feuer in der hand', 'feuer auf die hand', 'feuer auf der hand', 'feuerhand', 'hand brennt', 'flamme in der hand', 'flamme auf']],
    ['fireworks', ['feuerwerk', 'silvester']], ['embers', ['glut', 'glutfunken']],
    ['fire', ['feuer', 'flamme', 'brennen', 'brennt']], ['sparks', ['funken']], ['fog', ['nebel']], ['smoke', ['rauch', 'qualm']],
    ['explosion', ['explosion', 'explodier', 'boom', 'knall']], ['lightning', ['gewitter', 'blitze', 'elektrisch', 'strom']],
    ['magic', ['magie', 'magisch', 'glitzer', 'zauber']], ['aura', ['aura', 'energie']], ['likes', ['likes', 'daumen hoch']],
    ['notes', ['musiknoten', 'noten']], ['butterflies', ['schmetterling']], ['balloons', ['luftballon', 'ballons']],
    ['hearts', ['herz', 'liebe']], ['confetti', ['konfetti']], ['snow', ['schnee', 'schneien', 'winter']], ['rain', [' regen ', 'regnen', 'regnet']],
    ['leaves', ['blaetter', 'laub']], ['petals', ['blueten', 'kirschblueten']], ['dust', ['staub im licht', 'staubkoerner']],
    ['twinkle', ['sternenhimmel', 'sterne funkeln', 'funkeln']], ['bokeh', ['bokeh', 'lichterpunkte', 'lichtpunkte']], ['goldrain', ['goldregen', 'goldglitzer']],
    ['matrix', ['matrix code', 'matrix-code', 'hacker']], ['bubbles', ['seifenblase', 'blasen']], ['money', ['geld', 'money', 'dollar']], ['emojirain', ['lach', 'lustig', 'witzig']]];
  var TR_WORDS = [['dipblack', ['schwarz']], ['dipwhite', ['weiss']], ['glitch', ['glitch']], ['whip', ['whip', 'reiss', 'schnell']],
    ['crosszoom', ['cross zoom', 'kreuzzoom']], ['zoomIn', ['zoom']], ['spin', ['dreh']], ['flash', ['blitz', 'flash']], ['heart', ['herz']],
    ['clock', ['uhr']], ['blinds', ['jalousie']], ['checker', ['schachbrett']], ['barnH', ['tuer']], ['irisbox', ['rechteck']], ['diamond', ['raute']],
    ['circle', ['kreis', 'iris']], ['softwipe', ['weiches wisch']], ['wipeL', ['wisch']], ['pushUp', ['hoch schieb', 'nach oben']], ['pushL', ['schieb']],
    ['pixel', ['pixel']], ['blur', ['unschaerf', 'blur']], ['burn', ['brand', 'burn', 'feuer']], ['leak', ['light leak', 'lichtblende']],
    ['ripple', ['welle', 'wasser']], ['swirl', ['strudel']], ['morph', ['morph', 'smooth cut']], ['additive', ['additiv']],
    ['fade', ['ueberblend', 'blende', 'weich', 'fade', 'dissolve']]];
  var GEN_WORDS = [['ai-firewings', ['feuerfluegel', 'phoenix']], ['ai-wings', ['fluegel']], ['ai-disint', ['zerfall', 'zu staub', 'aufloes']],
    ['ai-levitate', ['levitat', 'person schwebt', 'schweben lassen']], ['ai-fireball', ['feuerball']],
    ['ai-metal', ['metall', 'roboter']], ['ai-ice', ['einfrieren', 'zu eis']], ['ai-glass', ['zerbricht', 'wie glas']], ['ai-portal', ['portal']],
    ['ai-invisible', ['unsichtbar']], ['ai-clone', ['klonen', 'klone']], ['ai-hologram', ['hologramm']],
    ['ai-anime', ['anime', 'zeichentrick']], ['ai-comic', ['comic-stil', 'comicstil']], ['ai-daynight', ['tag zu nacht']], ['ai-weather', ['echter regen', 'echtes gewitter']],
    ['ai-bg', ['hintergrund austauschen', 'hintergrund ersetzen', 'anderer hintergrund']], ['ai-drone', ['drohnenflug', 'drohne']],
    ['ai-dolly', ['dolly zoom', 'vertigo']], ['ai-orbit', ['kreist', 'orbit', '360']], ['ai-stage', ['buehne', 'konzert']],
    ['ai-animate', ['foto lebendig', 'zum leben', 'animier']], ['ai-thunder', ['superheld', 'blitzkraft', 'blitz kraft']],
    ['ai-guitar', ['gitarre brennt', 'gitarre in flammen', 'brennende gitarre']]];

  function pick(t, table) { for (var i = 0; i < table.length; i++) if (has(t, table[i][1])) return table[i][0]; return null; }

  /* api: { clips(all), sel(), addFx, addPack, look, adjust, transition, particle, text, sticker, speed, clearFx, resetColor } */
  function run(input, api) {
    var t = norm(input), done = [], gen = null;
    var all = has(t, ['alle clips', 'allen clips', 'ganze video', 'ganzen video', 'ueberall', 'alles ', ' alle ']);
    var amount = has(t, ['stark', 'viel ', 'extrem', 'krass', 'heftig', 'mega']) ? 1 : has(t, ['leicht', 'wenig', 'bisschen', 'dezent', 'sanft']) ? 0.3 : null;
    var targets = all ? api.clips() : (api.sel() ? [api.sel()] : api.clips().slice(0, 1));

    // generative KI ausdrücklich gewünscht?
    var g = pick(t, GEN_WORDS);
    var wantsGen = has(t, ['higgsfield', 'kling', 'seedance', 'generier', 'kuenstliche intelligenz', 'ki effekt', 'ki-effekt', 'echt aussehend', 'realistisch']);
    if (g || wantsGen) gen = g || (has(t, ['feuer', 'flamme']) ? 'ai-handfire' : has(t, ['explo']) ? 'ai-explode' : null);

    // Text: „Text Hallo Welt“ oder in Anführungszeichen
    var q = input.match(/[„"“'‚](.+?)[“"”'‘]/);
    var tm = q ? q[1] : null;
    if (!tm) { var m2 = input.match(/(?:text|titel|schreib(?:e)?|schrift)\s*[:\-]?\s+(.+)/i); if (m2) tm = m2[1].replace(/\s*(?:rein|drauf|hin|ein)\s*$/i, ''); }
    if (tm && has(t, ['text', 'titel', 'schreib', 'schrift', 'untertitel', 'bauchbinde']) ) {
      var style = has(t, ['untertitel']) ? 'subtitle' : has(t, ['bauchbinde', 'name']) ? 'lower' : has(t, ['neon']) ? 'neon' : has(t, ['gelb', 'fett']) ? 'impact' : 'outline';
      api.text(tm.trim(), style); done.push('Text „' + tm.trim() + '“ eingefügt');
      return { done: done, gen: gen };
    }

    if (!targets.length && !has(t, ['konfetti', 'schnee', 'regen'])) return { done: [], gen: gen, empty: true };

    if (has(t, ['effekte weg', 'effekte entfern', 'effekte loesch', 'ohne effekt', 'alle effekte raus'])) {
      targets.forEach(api.clearFx); done.push('Effekte entfernt'); return { done: done, gen: gen };
    }
    if (has(t, ['farbe zurueck', 'grading zurueck', 'farben zuruecksetzen', 'original farbe', 'originalfarbe'])) {
      targets.forEach(api.resetColor); done.push('Farbkorrektur zurückgesetzt'); return { done: done, gen: gen };
    }

    // Übergang
    if (has(t, ['uebergang', 'ueberblend', 'blende ', 'transition'])) {
      var tr = pick(t, TR_WORDS) || 'fade';
      targets.forEach(function (c) { api.transition(c, tr); });
      done.push('Übergang „' + LIB.find(LIB.TRANSITIONS, tr).name + '“'); return { done: done, gen: gen };
    }

    // Partikel/Feuer (nur, wenn nicht ausdrücklich generative KI gemeint ist)
    if (!wantsGen) {
      var p = pick(t, PART_WORDS);
      if (p && !(p === 'rain' && has(t, ['regenbogen']))) { api.particle(p); done.push(LIB.find(LIB.PARTICLES, p).name + ' eingefügt – zum Platzieren im Bild antippen und ziehen'); }
    }

    // Pakete, Effekte, Looks
    var pk = pick(t, PACK_WORDS);
    if (pk) { targets.forEach(function (c) { api.addPack(c, pk, amount); }); done.push('Paket „' + LIB.find(LIB.PACKS, pk).name + '“'); }
    FX_WORDS.forEach(function (row) {
      if (has(t, row[1])) {
        if (row[0] === 'strobe' && has(t, ['gewitter'])) return;
        if (row[0] === 'edge' && has(t, ['comic-stil', 'comicstil'])) return;
        targets.forEach(function (c) { api.addFx(c, row[0], amount); });
        done.push(LIB.fxById(row[0]).name);
      }
    });
    var lk = pick(t, LOOK_WORDS);
    if (lk) { targets.forEach(function (c) { api.look(c, lk); }); done.push('Farb-Look „' + LIB.find(LIB.LOOKS, lk).name + '“'); }

    // Farb-Anpassungen
    var adj = {};
    if (has(t, ['waermer', 'warm '])) adj.temp = 0.3;
    if (has(t, ['kaelter', 'kalt ', 'kuehler'])) adj.temp = -0.3;
    if (has(t, ['heller', 'aufhellen', 'zu dunkel'])) adj.exposure = 0.35;
    if (has(t, ['dunkler', 'abdunkeln', 'zu hell'])) adj.exposure = -0.35;
    if (has(t, ['mehr farbe', 'kraeftiger', 'mehr saettigung', 'saettiger', 'farbiger'])) adj.sat = 0.25;
    if (has(t, ['weniger farbe', 'blasser', 'weniger saettigung'])) adj.sat = -0.25;
    if (has(t, ['mehr kontrast', 'kontrastreicher', 'knackiger'])) adj.contrast = 0.15;
    if (has(t, ['weniger kontrast', 'weicher look', 'flacher'])) adj.contrast = -0.15;
    if (Object.keys(adj).length) { targets.forEach(function (c) { api.adjust(c, adj); }); done.push('Farbe angepasst'); }

    // Tempo
    if (has(t, ['zeitlupe', 'slow motion', 'slowmo', 'langsamer'])) { targets.forEach(function (c) { api.speed(c, 0.5); }); done.push('Zeitlupe (halbe Geschwindigkeit)'); }
    else if (has(t, ['zeitraffer', 'schneller', 'doppelte geschwindigkeit'])) { targets.forEach(function (c) { api.speed(c, 2); }); done.push('Doppelte Geschwindigkeit'); }

    // Emojis im Text → Sticker
    var em = input.match(/\p{Extended_Pictographic}/u);
    if (em && !done.length) { api.sticker(em[0]); done.push('Sticker ' + em[0] + ' eingefügt'); }

    if (done.length && !all && targets.length === 1 && !api.sel()) done.push('(auf den ersten Clip – tippe vorher einen Clip an, um einen anderen zu wählen)');
    return { done: done, gen: gen };
  }

  global.AI = { run: run };
})(this);
