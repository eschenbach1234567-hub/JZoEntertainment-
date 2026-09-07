# JZo Entertainment – Website

Statische Website für JZo Entertainment (Jan Zoller), im Design des
Firmenflyers: dunkler Hintergrund mit silber/gold-metallic Akzenten.

## Website ansehen

Es ist kein Server nötig – einfach `index.html` doppelklicken und im
Browser öffnen. Für Tests aller Funktionen empfiehlt sich trotzdem ein
lokaler Server (z. B. `python3 -m http.server` im Projektordner, dann
`http://localhost:8000` öffnen).

## Aufbau (Baukastensystem)

```
index.html            Startseite
ueber-mich.html        "Über mich"
dienstleistungen.html  Dienstleistungen
events.html             Termine (Inhalte aus data/events.js)
blog.html                Blog (Inhalte aus data/blog.js)
kontakt.html             Kontaktseite
impressum.html           Impressum
datenschutz.html          Datenschutzerklärung
assets/css/style.css      Alle Farben & Abstände (CSS-Variablen oben in der Datei)
assets/js/main.js          Navigation + Rendering von Events/Blog
data/events.js              Liste der Termine
data/blog.js                 Liste der Blogbeiträge
```

## Neuen Termin (Event) hinzufügen

`data/events.js` öffnen und ein neues Objekt in die eckigen Klammern
`[ ]` einfügen, z. B.:

```js
{
  title: "Hochzeitsmesse Musterstadt",
  date: "2026-11-14",
  location: "Musterstadt",
  description: "Ich bin mit einem Stand vor Ort - kommen Sie gerne vorbei!"
},
```

Speichern – der Termin erscheint automatisch auf `events.html`.

## Neuen Blogbeitrag hinzufügen

Genauso in `data/blog.js`:

```js
{
  title: "Tipps für gute Videoaufnahmen",
  date: "2026-09-01",
  text: "Hier kommt der Text des Beitrags..."
},
```

## Neue Fotos/Bilder ergänzen

Bilddateien in `assets/img/` ablegen und im gewünschten HTML mit
`<img src="assets/img/dateiname.jpg" alt="Beschreibung">` einbinden.
Eine eigene Galerie-Seite kann bei Bedarf ergänzt werden.

## Design anpassen

Alle Farben liegen als Variablen ganz oben in `assets/css/style.css`
(`--bg`, `--gold-1`, `--silver-1` usw.) – dort ändern wirkt sich auf die
gesamte Website aus.

## Offene Punkte

- **Logo:** `assets/img/logo.svg` ist eine handgebaute Nachbildung des
  Flyer-Logos (Schriftzug "JZo", Metallic-Verlauf, Bogen und Lichtreflex).
  Sollte eine Original-Logodatei (Vektor/PNG in hoher Auflösung) vorliegen,
  kann diese unter demselben Dateinamen `assets/img/logo.svg` (bzw. als
  `.png` mit Anpassung der `<img>`-Pfade) ausgetauscht werden – sie wird
  automatisch auf allen Seiten übernommen.
- **Instagram/YouTube-Links:** Es wurde nur das Handle `@JZoEntertainment`
  erkannt. Aktuell verlinkt zu `instagram.com/jzoentertainment` und
  `youtube.com/@JZoEntertainment` – bitte prüfen und ggf. korrigieren.
- **Impressum:** Falls eine Umsatzsteuer-ID vorhanden ist oder die
  Kleinunternehmerregelung (§ 19 UStG) gilt, sollte dies noch ergänzt
  werden.
- **Datenschutz:** Sobald ein Hosting-Anbieter feststeht, dessen Name und
  Anschrift in `datenschutz.html` (Abschnitt "Hosting") ergänzen.
- **Hosting/Veröffentlichung:** Die Seiten sind bereit zum Hochladen auf
  jeden Webspace oder z. B. GitHub Pages.
