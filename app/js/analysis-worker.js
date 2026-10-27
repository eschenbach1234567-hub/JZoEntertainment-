/* Rechnet die Analyse im Hintergrund, damit die App flüssig bleibt. */
importScripts('theory.js', 'dsp.js');
self.onmessage = function (e) {
  try {
    self.JZoTheory.settings.german = !!e.data.german;
    var result = self.JZoDSP.analyze(e.data.pcm, e.data.sampleRate);
    self.postMessage({ ok: true, result: result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
