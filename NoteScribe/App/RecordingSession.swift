import Combine
import Foundation
import PitchKit

/// View-model that owns a listening session: starts/stops the audio engine,
/// builds a `NoteEventTracker` timeline from its frames, and hands off to
/// `MusicXMLExporter` when the user wants a file to open in Guitar Pro.
@MainActor
final class RecordingSession: ObservableObject {
    @Published private(set) var events: [NoteEvent] = []
    @Published var errorMessage: String?

    let audioEngine = AudioPitchEngine()
    private let tracker = NoteEventTracker()
    private var cancellable: AnyCancellable?

    init() {
        cancellable = audioEngine.framePublisher.sink { [weak self] frame in
            guard let self else { return }
            self.tracker.addFrame(note: frame.note, timestamp: frame.timestamp, frameDuration: frame.duration)
            self.events = self.tracker.finishedEvents
        }
    }

    func toggle() {
        if audioEngine.isRunning {
            audioEngine.stop()
            tracker.finalize()
            events = tracker.finishedEvents
        } else {
            do {
                try audioEngine.start()
                errorMessage = nil
            } catch {
                errorMessage = "Mikrofon konnte nicht gestartet werden: \(error.localizedDescription)"
            }
        }
    }

    /// Writes the current timeline to a temporary `.musicxml` file and
    /// returns its URL, ready to hand to a share sheet.
    func exportMusicXML(tempoBPM: Double = 120) -> URL? {
        let xml = MusicXMLExporter.export(events: events, tempoBPM: tempoBPM, partName: "Guitar")
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("NoteScribe-\(Int(Date().timeIntervalSince1970))")
            .appendingPathExtension("musicxml")
        do {
            try xml.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            errorMessage = "Export fehlgeschlagen: \(error.localizedDescription)"
            return nil
        }
    }
}
