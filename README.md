# JZo Entertainment – Website

Statische Website für JZo Entertainment (Jan Zoller), im Design des
Firmenflyers: dunkler Hintergrund mit silber/gold-metallic Logo.

**Live-Link (nach Aktivierung von GitHub Pages, siehe unten):**
https://eschenbach1234567-hub.github.io/JZoEntertainment-/

## Wie bearbeite ich die Website selbst?

Alle Inhalte liegen als Textdateien in diesem GitHub-Repository. Du brauchst
keine Programmierkenntnisse, nur den Browser:

1. Gehe zu https://github.com/eschenbach1234567-hub/JZoEntertainment-
2. Klicke auf die Datei, die du ändern willst (siehe Übersicht unten)
3. Klicke oben rechts auf das **Stift-Symbol** ("Edit this file")
4. Ändere den Text
5. Ganz unten auf **"Commit changes"** klicken (Haken bei "Commit directly
   to the main branch" lassen)

Nach ca. 1 Minute ist die Änderung live auf der Website.

**Neue Bilder hochladen:** auf
https://github.com/eschenbach1234567-hub/JZoEntertainment-/upload/main
gehen, Bild(er) reinziehen, unten "Commit changes" klicken. Am besten in
den Ordner `assets/img/` hochladen (im Upload-Fenster oben in der
Adresszeile `assets/img/` ergänzen, bevor du hochlädst).

Wenn dir das zu umständlich ist: schreib mir einfach hier im Chat, was
geändert werden soll (z. B. "füge dieses Bild zur Galerie hinzu" mit
Anhang, oder "trag folgenden Blogbeitrag ein: ...") – ich erledige es dann
für dich.

## Neuen Termin (Event) hinzufügen

Datei `data/events.js` bearbeiten (siehe Anleitung oben) und ein neues
Objekt in die eckigen Klammern `[ ]` einfügen, z. B.:

```js
{
  title: "Hochzeitsmesse Musterstadt",
  date: "2026-11-14",
  location: "Musterstadt",
  description: "Ich bin mit einem Stand vor Ort - kommen Sie gerne vorbei!"
},
```

Speichern (Commit) – der Termin erscheint automatisch auf `events.html`.

## Neuen Blogbeitrag hinzufügen

Genauso in `data/blog.js`:

```js
{
  title: "Tipps für gute Videoaufnahmen",
  date: "2026-09-01",
  text: "Hier kommt der Text des Beitrags..."
},
```

## Preise ändern

Preise stehen in `dienstleistungen.html`, zweimal: einmal als kleines
Preis-Schild direkt bei der jeweiligen Leistung (`<span class="price-tag">`),
einmal in der Tabelle "Preisübersicht" weiter unten (`<div class="price-list">`).
Beide Stellen bei Änderungen anpassen.

## Neue Fotos/Bilder ergänzen

Bilddateien in `assets/img/` hochladen (siehe Anleitung oben) und im
gewünschten HTML mit `<img src="assets/img/dateiname.jpg" alt="Beschreibung">`
einbinden. Eine eigene Galerie-Seite kann bei Bedarf ergänzt werden.

## Design anpassen

Alle Farben liegen als Variablen ganz oben in `assets/css/style.css`
(`--bg`, `--gold-1`, `--silber-1` usw.) – dort ändern wirkt sich auf die
gesamte Website aus.

## Aufbau (Baukastensystem)

```
index.html              Startseite
ueber-mich.html          "Über mich"
dienstleistungen.html    Dienstleistungen + Preise
events.html              Termine (Inhalte aus data/events.js)
blog.html                Blog (Inhalte aus data/blog.js)
kontakt.html             Kontaktseite
impressum.html           Impressum
datenschutz.html         Datenschutzerklärung
assets/css/style.css     Alle Farben & Abstände (CSS-Variablen oben in der Datei)
assets/js/main.js        Navigation + Rendering von Events/Blog
assets/img/logo.png              Original-Logo (undurchsichtiger Hintergrund)
assets/img/logo-transparent.png  Logo mit transparentem Hintergrund (wird auf der Website verwendet)
assets/img/og-image.png          Vorschaubild für Social-Media-Links (Facebook/Instagram/WhatsApp etc.)
assets/img/favicon.png           Icon im Browser-Tab
data/events.js            Liste der Termine
data/blog.js               Liste der Blogbeiträge
```

## Website veröffentlichen (GitHub Pages aktivieren)

Damit der Link oben funktioniert, einmalig GitHub Pages einschalten:

1. Im Repository auf **Settings** klicken (oben in der Leiste)
2. Im linken Menü auf **Pages** klicken
3. Bei "Build and deployment" → "Source" **"Deploy from a branch"** wählen
4. Branch **main**, Ordner **/ (root)** auswählen, **Save** klicken
5. Nach 1-2 Minuten ist die Seite unter
   `https://eschenbach1234567-hub.github.io/JZoEntertainment-/` erreichbar

Diesen Link kannst du dann überall teilen (Instagram-Bio, Facebook,
YouTube-Kanalinfo, WhatsApp, ...). Beim Teilen erscheint automatisch eine
Vorschau mit Logo, Titel und Beschreibung (Open-Graph-Vorschaubild
`assets/img/og-image.png`).

## Offene Punkte

- **Instagram/YouTube-Links:** Es wurde nur das Handle `@JZoEntertainment`
  erkannt. Aktuell verlinkt zu `instagram.com/jzoentertainment` und
  `youtube.com/@JZoEntertainment` – bitte prüfen und ggf. korrigieren.
- **Impressum:** Falls eine Umsatzsteuer-ID vorhanden ist oder die
  Kleinunternehmerregelung (§ 19 UStG) gilt, sollte dies noch ergänzt
  werden.
- **Datenschutz:** Sobald der Hosting-Anbieter feststeht (z. B. GitHub
  Pages), dessen Name in `datenschutz.html` (Abschnitt "Hosting") ergänzen.
  Für GitHub Pages: "GitHub, Inc., 88 Colin P. Kelly Jr. Street, San
  Francisco, CA 94107, USA".
