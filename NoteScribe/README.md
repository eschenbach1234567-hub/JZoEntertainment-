# NoteScribe

Ein iOS-App-Prototyp: hört über das iPhone-Mikrofon mit, zeigt live erkannte
Noten an (z. B. „G3", „D4", „C4") und exportiert die mitgeschnittene Melodie
als Datei, die sich direkt in Guitar Pro öffnen lässt — zum einfacheren
Komponieren, wie in der ursprünglichen Idee beschrieben.

Der Name „NoteScribe" ist ein Platzhalter — im Xcode-Projekt (Bundle-ID,
Display-Name) beliebig umbenennbar.

## Wie es funktioniert

```
Mikrofon (AVAudioEngine)
      │  Audio-Buffer, ~46ms Hops
      ▼
YINPitchDetector           ← Grundfrequenz pro Hop (Autokorrelation, YIN-Algorithmus)
      │  Frequenz in Hz
      ▼
NoteMapper                 ← nächstgelegene Note in 12-TET (Name, Oktave, Cent-Abweichung)
      │  Note pro Hop
      ▼
NoteEventTracker            ← fasst gleiche, aufeinanderfolgende Noten zu einem
      │  Note-Event zusammen, verwirft kurze Aussetzer/Rauschen
      ▼
MusicXMLExporter            ← quantisiert Dauern auf ein Notenraster, schreibt
      │                        eine .musicxml-Datei
      ▼
Share Sheet → Guitar Pro (File ▸ Import ▸ MusicXML)
```

### Warum MusicXML statt einer echten `.gp`-Datei?

Guitar Pros natives `.gp`/`.gpx`-Format ist proprietär, undokumentiert und
ändert sich zwischen Versionen — es von Grund auf zu schreiben wäre instabil
und würde bei jedem Guitar-Pro-Update brechen. MusicXML ist dagegen ein
offener, stabiler Standard, den Guitar Pro seit Version 6 nativ importiert
(**Datei ▸ Importieren ▸ MusicXML**) und danach ganz normal als `.gp`
weiterbearbeiten und speichern kann. Das ist der zuverlässigste Weg zum
gewünschten Ergebnis, ohne das Binärformat reverse-zu-engineeren.

### Wichtige Einschränkung: monophon, nicht polyphon

Die Tonhöhenerkennung (YIN) erkennt zuverlässig **eine** Note gleichzeitig —
ideal für Melodielinien, Soli oder einzeln gezupfte Noten. Für ganze Akkorde
(mehrere gleichzeitig klingende Saiten) bräuchte es echte Musiktranskription
per ML-Modell (z. B. ein On-Device-CoreML-Modell ähnlich Spotify Basic Pitch);
das ist im Roadmap-Abschnitt unten vermerkt, aber nicht Teil dieses
Prototyps.

## Projektstruktur

```
NoteScribe/
├── Package.swift              # SPM-Paket "PitchKit": portable, reine Swift-Logik
├── Sources/PitchKit/           # Pitch-Erkennung, Notenzuordnung, Event-Tracking, MusicXML-Export
├── Tests/PitchKitTests/        # Unit-Tests für obiges (per `swift test` lauffähig)
└── App/                        # SwiftUI-App + Mikrofon-Capture (AVFoundation, nur iOS)
    ├── NoteScribeApp.swift      # App-Einstiegspunkt
    ├── AudioPitchEngine.swift   # AVAudioEngine-Tap → YINPitchDetector, Live-Publishing
    ├── RecordingSession.swift   # View-Model: Start/Stop, Timeline, Export
    ├── ContentView.swift        # UI: Live-Note, Tuner-Anzeige, Timeline-Liste, Export-Button
    ├── ShareSheet.swift         # Share Sheet für die exportierte Datei
    └── Info.plist               # Mikrofon-Nutzungsbeschreibung
```

`PitchKit` enthält bewusst **keine** Apple-only-Frameworks (kein AVFoundation,
kein SwiftUI) und ist deshalb mit reinem `swift test` testbar, auch ohne
Xcode. Die Audio-Aufnahme und UI liegen getrennt in `App/`, weil sie
AVAudioEngine/SwiftUI brauchen und nur auf iOS/macOS mit Xcode laufen.

## Einrichten in Xcode (macOS erforderlich)

Diese Umgebung hier hat keinen Zugriff auf Xcode oder ein Mac — der Code
wurde daher geschrieben und lokal auf Konsistenz geprüft, aber **nicht** in
Xcode gebaut oder auf einem Gerät getestet. Zum Ausprobieren:

1. **PitchKit-Logik testen** (funktioniert ohne Xcode, reines SPM-Paket):
   ```bash
   cd NoteScribe
   swift test
   ```
2. **App bauen und auf dem iPhone ausprobieren:**
   - Xcode öffnen → *File ▸ Open* → den Ordner `NoteScribe/` auswählen
     (Xcode erkennt `Package.swift` und lädt es als Package).
   - Neues iOS-App-Ziel *„App"* erstellen (*File ▸ New ▸ Target ▸ App*),
     die Dateien aus `App/` diesem Ziel hinzufügen, `PitchKit` als
     Dependency verlinken.
   - `Info.plist`-Eintrag `NSMicrophoneUsageDescription` aus `App/Info.plist`
     ins neue Target übernehmen (sonst stürzt die App beim Mikrofonzugriff ab).
   - Auf einem echten iPhone ausführen (Mikrofon-Simulation im Simulator ist
     unzuverlässig).
3. **Melodie aufnehmen:** „Zuhören" antippen, einzelne Noten spielen
   (Melodie, kein Akkord), die erkannten Noten erscheinen live und in der
   Liste darunter.
4. **Exportieren:** „Als Guitar Pro Datei exportieren" antippen → Share
   Sheet → in Guitar Pro öffnen (oder erst in Dateien/AirDrop sichern und
   dort in Guitar Pro importieren).

## Kalibrierung & bekannte Grenzen

- **Tempo/Rhythmus:** Der Export nimmt aktuell pauschal 120 BPM an, um
  gemessene Notendauern in Notenwerte (Achtel, Viertel, …) umzurechnen. Für
  präzisere Rhythmik müsste ein Tempo-Eingabefeld oder eine
  Onset-/Beat-Erkennung ergänzt werden.
  - `RecordingSession.exportMusicXML(tempoBPM:)` nimmt dafür schon einen
    Parameter entgegen.
- **Störgeräusche/Nebengeräusche:** `NoteEventTracker` filtert sehr kurze
  Aussetzer heraus (Standard: < 80 ms), aber lauter Hintergrundlärm kann
  trotzdem Fehlerkennungen verursachen. Für Live-Gigs empfiehlt sich ein
  Richtmikrofon/Clip-on statt des eingebauten iPhone-Mikrofons.
- **Tonumfang:** Frequenzen unter ~30 Hz oder über ~4200 Hz werden verworfen
  (praktisch nie echte Gitarren-/Gesangstöne, meist Rauschen).

## Roadmap-Ideen

- Polyphone Akkorderkennung (z. B. via CoreML-Modell) für echte
  Gitarrenbegleitung statt nur Einzelnoten.
- Tab-Notation (Saite/Bund statt nur Notenname) über eine
  Instrument-/Stimmungs-Zuordnung.
- Tempo-Erkennung statt fixer 120-BPM-Annahme.
- Aufnahmen lokal speichern/verwalten (Verlauf mehrerer Sessions).
- Direktes Schreiben von `.gp`/`.gpx`, falls Guitar Pro das Format irgendwann
  offiziell dokumentiert.
