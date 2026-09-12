# JZo Entertainment – Projektkontext

Diese Datei ist das Gedächtnis für dieses Projekt. Jede Claude-Sitzung,
die in diesem Repository arbeitet, liest sie automatisch. Wenn Jan
zurückkommt und sagt "wie war das nochmal mit..." – hier steht's.

## Wer & was

**Kunde:** Jan Zoller, Eschenbach. Nebenberufliche Selbstständigkeit im
Bereich Foto/Video (siehe `data/contact.json` für Kontaktdaten).
**Projekt:** Website für "JZo Entertainment" (Schreibweise: **JZo**,
kleines o – nicht JZO), gebaut aus den Inhalten eines Firmenflyers.
**Ton mit dem Kunden:** Jan ist technisch wenig versiert (kein
Programmierhintergrund, braucht sehr konkrete Schritt-für-Schritt-
Anleitungen, idealerweise mit Bildern/Screenshots). Immer einfache
Sprache, keine Fachbegriffe ohne Erklärung. Er nimmt das Projekt sehr
ernst ("professionelles Business, kein Spaß-Projekt") – Zuverlässigkeit
und "es muss einfach funktionieren" sind ihm wichtiger als Tempo.

## Live-Adressen

- **Öffentlicher Website-Link (zum Teilen, z. B. Instagram-Bio):**
  https://eschenbach1234567-hub.github.io/JZoEntertainment-/
- **Admin-Bereich (Redaktionssystem, Decap CMS):**
  https://jzoenterteinmentweb.netlify.app/admin/
  (Login: Jans eigene E-Mail + selbst gesetztes Passwort, verwaltet
  über Netlify Identity – nicht Jans Netlify.com-Account-Passwort!)
- **GitHub-Repository:**
  https://github.com/eschenbach1234567-hub/JZoEntertainment-
  (Branch: **main** – Default-Branch wurde einmal versehentlich auf
  einen fremden Branch gestellt, das ist inzwischen korrigiert)

## Was gebaut wurde (chronologisch, grob)

1. Statische Mehrseiten-Website (Home, Über mich, Dienstleistungen,
   Events, Blog, Kontakt, Impressum, Datenschutz) aus Flyer-Inhalten.
2. Impressum + Datenschutzerklärung, so DSGVO/DDG-konform wie ohne
   Steuerdaten möglich (siehe "Offene Punkte" unten).
3. Logo: **Original-Datei vom Kunden verwendet** (nicht von Claude neu
   gestaltet – ein früherer Rekonstruktionsversuch wurde vom Kunden
   ausdrücklich abgelehnt, "eins zu eins" war die Vorgabe). Datei liegt
   unter `assets/img/logo.png` (Original) und
   `assets/img/logo-transparent.png` (freigestellt, wird auf der
   Website verwendet, damit kein schwarzer Kasten sichtbar ist).
4. GitHub Pages als Hosting eingerichtet.
5. Preise ergänzt (`data/prices.json`): 75 €/Std. + 0,40 €/km Anfahrt,
   VHS/Digital8-Digitalisierung je 10–15 € pro Kassette.
6. Kontaktdaten zentralisiert (`data/contact.json`) statt in jeder
   Seite einzeln hardcodiert.
7. Admin-Bereich mit Decap CMS (`admin/`) + Netlify (Identity + Git
   Gateway) eingerichtet, damit Jan Preise/Kontakt/Blog/Termine über
   Formulare pflegen kann, ohne Code zu sehen. Dafür wurden
   `data/*.js` zu `data/*.json` umgebaut (Decap braucht strukturierte
   Dateien) und `assets/js/main.js` lädt sie per `fetch()`.
8. PDF-Handbuch für Jan erstellt (Schritt-für-Schritt, mit Screenshots)
   – wurde ihm direkt als Datei geschickt, liegt nicht im Repo.
9. Instagram-Post-Grafik im Website-Design erstellt (Claude-Design-
   Canvas-Artifact, nicht im Repo).
10. PWA/"Zum Home-Bildschirm hinzufügen" eingerichtet (Manifest,
    Apple-Touch-Icons, Meta-Tags auf allen 8 Seiten) – von Jan auf
    iPhone (Safari) und Mac (Dock) erfolgreich getestet. Bebilderte
    PDF-Anleitung dafür an Jan geschickt, nicht im Repo.
11. Bild-Feld für Blogbeiträge im Admin-Bereich ergänzt (`admin/config.yml`,
    Collection "blog") – Jan kann jetzt beim Schreiben eines Blogposts
    optional ein Bild hochladen, das oben in der Beitragskarte erscheint.

## Wichtige Eigenheiten / nicht "reparieren"

- **E-Mail-Adresse `jzoentertainmet@outlook.com`** – der Tippfehler
  ("jzoentertainmet" statt "jzoentertainment") ist **so vom Kunden
  vorgegeben** (stand so auf dem Flyer) – nicht korrigieren, außer Jan
  bittet ausdrücklich darum.
- **Schreibweise "JZo"** (kleines o) ist die korrekte Markenschreibweise
  laut Instagram-Handle @JZoEntertainment, obwohl das Grafik-Logo selbst
  "JZO" in Versalien zeigt (normale Logo-Typografie). Website-Fließtext
  nutzt konsequent "JZo Entertainment".
- Instagram/YouTube-Links (`data/contact.json`) sind **geraten**
  (`instagram.com/jzoentertainment`, `youtube.com/@JZoEntertainment`)
  basierend auf dem Handle im Flyer – nie verifiziert. Bei Gelegenheit
  mit Jan bestätigen.

## Offene Punkte

- Umsatzsteuer-ID / Kleinunternehmerregelung (§ 19 UStG) fehlt im
  Impressum – Jan muss sagen, ob zutreffend.
- Eigene Domain (z. B. jzoentertainment.de) wurde einmal versucht,
  dann bewusst zurückgestellt ("lassen wir erstmal") – aktueller Link
  ist der GitHub-Pages-Link, siehe oben. Falls Jan später doch eine
  Domain kauft: DNS-Anleitung liegt als Muster in der Konversation vor
  (CNAME auf `eschenbach1234567-hub.github.io` bzw. A-Records auf
  GitHub-Pages-IPs), muss aber neu für Netlify+Domain durchdacht werden.
- Preise für Videoschnitt, Drohnenaufnahmen und Contentberatung stehen
  noch auf "auf Anfrage" (`data/prices.json`, Feld `other`) – Jan
  wollte die später selbst ergänzen, sobald er sich festgelegt hat.

## Wie weitermachen

- Für alles, was Jan über den Admin-Bereich selbst ändern kann (Preise,
  Kontakt, Blog, Termine, Bilder), braucht es meist keine Code-Änderung
  mehr – er macht das jetzt selbst über `/admin/`.
- Für alles andere (Design, neue Seiten/Funktionen, Struktur-Änderungen)
  ganz normal Code ändern, committen, direkt auf `main` pushen (kein
  PR-Workflow vereinbart) und kurz Bescheid geben, was sich geändert hat.
- Jan kommuniziert oft per Spracheingabe (Tippfehler/unklare Sätze in
  seinen Nachrichten sind meist Diktier-Fehler, nicht Absicht) – bei
  Unklarheit lieber kurz nachfragen oder die wahrscheinlichste Deutung
  wählen und das transparent machen, statt lange zu rätseln.
