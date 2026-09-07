# JZo Entertainment – Website

Statische Website für JZo Entertainment (Jan Zoller), im Design des
Firmenflyers: dunkler Hintergrund mit silber/gold-metallic Logo.

**Live-Link:**
https://eschenbach1234567-hub.github.io/JZoEntertainment-/

## Wie bearbeite ich die Website selbst?

Es gibt drei Wege – vom einfachsten zum technischsten:

### Weg 1: Admin-Bereich (empfohlen, kein Code sichtbar)

Unter `/admin/` liegt ein Redaktionssystem (Decap CMS) mit normalen
Formularen für Preise, Kontaktdaten, Blogbeiträge, Termine und
Bild-Upload. Einmalige Einrichtung über Netlify nötig (Identity +
Git Gateway aktivieren) – danach einfach unter
`https://<dein-netlify-name>.netlify.app/admin/` einloggen und
Formulare ausfüllen. Jedes Speichern erstellt automatisch einen Commit
in diesem Repository.

### Weg 2: Direkt auf GitHub bearbeiten (Textdateien)

Alle Inhalte liegen als Textdateien in diesem Repository:

1. Gehe zu https://github.com/eschenbach1234567-hub/JZoEntertainment-
2. Sicherstellen, dass oben links der Branch **main** ausgewählt ist
3. Klicke auf die Datei, die du ändern willst (siehe Übersicht unten)
4. Klicke oben rechts auf das **Stift-Symbol** ("Edit this file")
5. Ändere den Text
6. Ganz unten auf **"Commit changes"** klicken (Haken bei "Commit directly
   to the main branch" lassen)

Nach ca. 1 Minute ist die Änderung live auf der Website.

**Neue Bilder hochladen:** auf
https://github.com/eschenbach1234567-hub/JZoEntertainment-/upload/main/assets/img
gehen, Bild(er) reinziehen, unten "Commit changes" klicken.

### Weg 3: Claude fragen

Einfach hier im Chat schreiben, was geändert werden soll (z. B. "füge
dieses Bild zur Galerie hinzu" mit Anhang, oder "trag folgenden
Blogbeitrag ein: ...") – ich erledige es dann für dich.

## Neuen Termin (Event) hinzufügen

Datei `data/events.json` bearbeiten (Weg 1 oder 2 oben) und ein neues
Objekt in die Liste `"events": [ ]` einfügen, z. B.:

```json
{
  "title": "Hochzeitsmesse Musterstadt",
  "date": "2026-11-14",
  "location": "Musterstadt",
  "description": "Ich bin mit einem Stand vor Ort - kommen Sie gerne vorbei!"
}
```

Speichern (Commit) – der Termin erscheint automatisch auf `events.html`.

## Neuen Blogbeitrag hinzufügen

Genauso in `data/blog.json`, Liste `"posts": [ ]`:

```json
{
  "title": "Tipps für gute Videoaufnahmen",
  "date": "2026-09-01",
  "text": "Hier kommt der Text des Beitrags..."
}
```

## Preise ändern

Datei `data/prices.json` – vier Blöcke (`hourly`, `vhs`, `digital8`,
`other`), jeweils mit `amount` (Betrag) und `note` (Zusatz-Hinweis).
Wird automatisch auf `dienstleistungen.html` angezeigt (Preis-Schilder
bei den Leistungen + Preisübersicht-Tabelle).

## Kontaktdaten ändern

Datei `data/contact.json` – Telefon, E-Mail, Adresse,
Instagram-/YouTube-Links stehen nur hier. Wird automatisch überall auf
der Website übernommen (Header, Footer, Kontaktseite).

## Neue Fotos/Bilder ergänzen

Bilddateien in `assets/img/` hochladen (siehe Weg 1 oder 2 oben) und im
gewünschten HTML mit `<img src="assets/img/dateiname.jpg" alt="Beschreibung">`
einbinden.

## Design anpassen

Alle Farben liegen als Variablen ganz oben in `assets/css/style.css`
(`--bg`, `--gold-1`, `--silber-1` usw.) – dort ändern wirkt sich auf die
gesamte Website aus.

## Aufbau (Baukastensystem)

```
index.html              Startseite
ueber-mich.html          "Über mich"
dienstleistungen.html    Dienstleistungen + Preise
events.html              Termine (Inhalte aus data/events.json)
blog.html                Blog (Inhalte aus data/blog.json)
kontakt.html             Kontaktseite
impressum.html           Impressum
datenschutz.html         Datenschutzerklärung
admin/index.html         Lädt das Redaktionssystem (Decap CMS)
admin/config.yml         Konfiguration: welche Felder im Admin-Bereich erscheinen
assets/css/style.css     Alle Farben & Abstände (CSS-Variablen oben in der Datei)
assets/js/main.js        Navigation + lädt alle data/*.json-Dateien zur Laufzeit
assets/img/logo.png              Original-Logo (undurchsichtiger Hintergrund)
assets/img/logo-transparent.png  Logo mit transparentem Hintergrund (wird auf der Website verwendet)
assets/img/og-image.png          Vorschaubild für Social-Media-Links (Facebook/Instagram/WhatsApp etc.)
assets/img/favicon.png           Icon im Browser-Tab
data/events.json          Liste der Termine
data/blog.json            Liste der Blogbeiträge
data/contact.json         Kontaktdaten (zentral)
data/prices.json          Preise (zentral)
```

## Admin-Bereich einrichten (einmalig, für Weg 1)

1. Auf https://app.netlify.com kostenlosen Account anlegen ("Sign up with GitHub")
2. "Add new site" → "Import an existing project" → GitHub → Repository
   `JZoEntertainment-` auswählen. Build-Einstellungen leer lassen (kein
   Build-Befehl nötig), Publish-Verzeichnis: `/` (root). Deploy klicken.
3. Im neuen Netlify-Projekt: **Site configuration → Identity → Enable Identity**
4. Dort unter **Services → Git Gateway → Enable Git Gateway**
5. Im Identity-Tab: **Invite users** → eigene E-Mail-Adresse eintragen →
   Einladungs-Mail öffnen und Passwort setzen
6. Ab jetzt: `https://<netlify-projektname>.netlify.app/admin/` aufrufen,
   einloggen, Formulare bearbeiten.

## Website veröffentlichen (GitHub Pages) – bereits erledigt

Falls jemals neu eingerichtet werden muss:

1. Im Repository auf **Settings** klicken
2. Im linken Menü auf **Pages** klicken
3. Bei "Build and deployment" → "Source" **"Deploy from a branch"** wählen
4. Branch **main**, Ordner **/ (root)** auswählen, **Save** klicken

## Offene Punkte

- **Instagram/YouTube-Links:** Es wurde nur das Handle `@JZoEntertainment`
  erkannt. Aktuell verlinkt zu `instagram.com/jzoentertainment` und
  `youtube.com/@JZoEntertainment` – bitte prüfen und ggf. korrigieren
  (in `data/contact.json` bzw. über den Admin-Bereich).
- **Impressum:** Falls eine Umsatzsteuer-ID vorhanden ist oder die
  Kleinunternehmerregelung (§ 19 UStG) gilt, sollte dies noch ergänzt
  werden.
- **Datenschutz:** Sobald der Admin-Bereich per Netlify eingerichtet ist,
  in `datenschutz.html` (Abschnitt "Hosting") ergänzen, dass zusätzlich
  Netlify (Netlify, Inc., 44 Montgomery Street, Suite 300, San Francisco,
  CA 94104, USA) zur Bearbeitung eingesetzt wird.
