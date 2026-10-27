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
    ['glitch', ['glitch', 'glitsch', 'stoerung']], ['rgbsplit', ['rgb', 'farbversatz', 'chromatic']],
    ['vhs', ['vhs', 'videokassette', '80er', 'achtziger']], ['grain', ['korn', 'koernig', 'grain', 'rauschen']],
    ['vignette', ['vignette', 'dunkle ecken', 'raender dunkel']], ['blur', ['unscharf', 'weichzeichn', 'blur', 'verschwomm']],
    ['pixelate', ['pixel']], ['bw', ['schwarz weiss', 'schwarzweiss', 'schwarz-weiss', ' s/w ', 'graustufen']],
    ['sepia', ['sepia']], ['mirror', ['spiegel']], ['invert', ['negativ', 'invert']], ['scanlines', ['scanline', 'roehrenfernseh', 'zeilen']],
    ['posterize', ['comic', 'poster', 'cartoon']], ['lightleak', ['light leak', 'lichteinfall', 'lichtleck']],
    ['strobe', ['strobo', 'blitzlicht', 'flacker']], ['huecycle', ['farbwechsel', 'psychedel', 'regenbogenfarben']],
    ['thermal', ['waermebild', 'thermal', 'infrarot']], ['kaleido', ['kaleidoskop']], ['fisheye', ['fischauge', 'fisheye', 'fish eye']],
    ['cinebars', ['kinobalken', 'balken', 'letterbox', 'cinemascope', 'breitbild']],
    ['zoomOut', ['rauszoom', 'zoom raus', 'zoom out', 'wegzoom', 'herauszoom']],
    ['zoomIn', ['reinzoom', 'zoom rein', 'zoom in', 'heranzoom', 'hineinzoom', 'dynamic zoom', 'dynamischer zoom', 'ranzoom']],
    ['punch', ['beat', 'takt', 'punch', 'zoom auf den', 'pumpen']], ['kenburns', ['ken burns', 'schwenk']],
    ['quake', ['erdbeben', 'beben', 'heftig wackel']], ['shake', ['wackel', 'handkamera', 'shake', 'zitter']],
    ['wobble', ['schaukel']], ['spinIn', ['dreh rein', 'eindrehen', 'dreheffekt', 'drehen']], ['bounceIn', ['bounce', 'federn']]
  ];
  var PACK_WORDS = [['pk-musikvideo', ['musikvideo']], ['pk-retro', ['retro']], ['pk-altfilm', ['alter film', 'stummfilm', 'oldschool']],
    ['pk-party', ['party', 'club', 'disco']], ['pk-traum', ['traum', 'vertraeumt']], ['pk-horror', ['horror', 'gruselig', 'unheimlich']],
    ['pk-action', ['action']], ['pk-kino', ['kinolook', 'kino look', 'cinematic', 'filmisch', 'wie im kino']]];
  var LOOK_WORDS = [['teal-orange', ['teal', 'hollywood', 'blockbuster', 'cinematic', 'kinolook']], ['vintage', ['vintage', 'nostalgisch']],
    ['matte', ['matt']], ['bleach', ['bleach', 'entsaettigt']], ['neon', ['neon']], ['night', ['day for night', 'nachtlook', 'nacht machen']],
    ['bw-hard', ['harter kontrast schwarz']], ['pop', ['knallig', 'bunt']]];
  var PART_WORDS = [['handfire', ['feuer in der hand', 'feuer auf die hand', 'feuer auf der hand', 'feuerhand', 'hand brennt', 'flamme in der hand', 'flamme auf']],
    ['fire', ['feuer', 'flamme', 'brennen', 'brennt']], ['sparks', ['funken']], ['smoke', ['rauch', 'nebel', 'qualm']],
    ['explosion', ['explosion', 'explodier', 'boom', 'knall']], ['lightning', ['gewitter', 'blitze', 'elektrisch', 'strom']],
    ['magic', ['magie', 'magisch', 'glitzer', 'zauber', 'sternchen']], ['aura', ['aura', 'energie']], ['hearts', ['herz', 'liebe']],
    ['confetti', ['konfetti']], ['snow', ['schnee', 'schneien', 'winter']], ['rain', [' regen ', 'regnen', 'regnet']],
    ['bubbles', ['seifenblase', 'blasen']], ['money', ['geld', 'money', 'dollar']], ['emojirain', ['lach', 'lustig', 'witzig']]];
  var TR_WORDS = [['dipblack', ['schwarz']], ['dipwhite', ['weiss']], ['glitch', ['glitch']], ['whip', ['whip', 'reiss', 'schnell']],
    ['zoomIn', ['zoom']], ['spin', ['dreh']], ['flash', ['blitz', 'flash']], ['circle', ['kreis']], ['wipeL', ['wisch']],
    ['pushL', ['schieb']], ['pixel', ['pixel']], ['blur', ['unschaerf', 'blur']], ['burn', ['brand', 'burn', 'feuer']], ['fade', ['ueberblend', 'blende', 'weich', 'fade']]];
  var GEN_WORDS = [['ai-wings', ['fluegel']], ['ai-disint', ['zerfall', 'staub', 'aufloes']], ['ai-levitate', ['schweb', 'levitat']],
    ['ai-metal', ['metall', 'roboter']], ['ai-anime', ['anime', 'zeichentrick']], ['ai-drone', ['drohnenflug', 'drohne']],
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
