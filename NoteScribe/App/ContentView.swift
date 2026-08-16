import PitchKit
import SwiftUI

struct ContentView: View {
    @StateObject private var session = RecordingSession()
    @State private var shareURL: URL?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                liveNoteDisplay
                Button(session.audioEngine.isRunning ? "Stop" : "Zuhören") {
                    session.toggle()
                }
                .buttonStyle(.borderedProminent)
                .tint(session.audioEngine.isRunning ? .red : .accentColor)

                if let errorMessage = session.errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }

                List(Array(session.events.enumerated()), id: \.offset) { _, event in
                    HStack {
                        Text(event.note.label).font(.headline)
                        Spacer()
                        Text(String(format: "%.2fs", event.duration)).foregroundStyle(.secondary)
                    }
                }
                .overlay {
                    if session.events.isEmpty {
                        ContentUnavailableFallback()
                    }
                }

                Button("Als Guitar Pro Datei exportieren (MusicXML)") {
                    shareURL = session.exportMusicXML()
                }
                .disabled(session.events.isEmpty)
            }
            .padding()
            .navigationTitle("NoteScribe")
            .sheet(item: $shareURL.mappedToIdentifiable()) { wrapped in
                ShareSheet(items: [wrapped.value])
            }
        }
    }

    @ViewBuilder
    private var liveNoteDisplay: some View {
        VStack {
            Text(session.audioEngine.currentNote?.label ?? "–")
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            if let frequency = session.audioEngine.currentFrequency {
                Text(String(format: "%.1f Hz", frequency)).foregroundStyle(.secondary)
            }
            if let cents = session.audioEngine.currentNote?.cents {
                CentsIndicator(cents: cents)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// Tuner-style needle showing how far the detected pitch is from the note's
/// ideal 12-TET frequency, in cents (-50...+50).
private struct CentsIndicator: View {
    let cents: Double

    var body: some View {
        GeometryReader { proxy in
            let clamped = max(-50, min(50, cents))
            let fraction = (clamped + 50) / 100
            ZStack(alignment: .leading) {
                Capsule().fill(.quaternary)
                Capsule()
                    .fill(abs(clamped) < 5 ? .green : .orange)
                    .frame(width: 6)
                    .offset(x: proxy.size.width * fraction - 3)
            }
        }
        .frame(height: 12)
    }
}

private struct ContentUnavailableFallback: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "music.note")
            Text("Noch keine Noten erkannt. Tippe auf „Zuhören“ und spiel eine Note.")
                .multilineTextAlignment(.center)
                .font(.footnote)
        }
        .foregroundStyle(.secondary)
        .padding()
    }
}

private struct IdentifiableURL: Identifiable {
    let value: URL
    var id: URL { value }
}

private extension Binding where Value == URL? {
    func mappedToIdentifiable() -> Binding<IdentifiableURL?> {
        Binding<IdentifiableURL?>(
            get: { wrappedValue.map(IdentifiableURL.init) },
            set: { wrappedValue = $0?.value }
        )
    }
}

#Preview {
    ContentView()
}
