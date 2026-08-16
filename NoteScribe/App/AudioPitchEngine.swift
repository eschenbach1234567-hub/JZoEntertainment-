import AVFoundation
import Combine
import PitchKit

/// Captures microphone audio, runs it through `YINPitchDetector` in
/// ~50 ms hops, and maps each hop to a note. Publishes both the live
/// per-hop detection (for the tuner-style display) and every frame to
/// whoever wants to build a `NoteEventTracker` timeline from them.
@MainActor
final class AudioPitchEngine: ObservableObject {
    struct Frame {
        let note: Note?
        let frequency: Double?
        let timestamp: TimeInterval
        let duration: TimeInterval
    }

    @Published private(set) var isRunning = false
    @Published private(set) var currentNote: Note?
    @Published private(set) var currentFrequency: Double?

    /// Fires for every analyzed hop, in order. Used to feed a `NoteEventTracker`.
    let framePublisher = PassthroughSubject<Frame, Never>()

    private let engine = AVAudioEngine()
    private let detector = YINPitchDetector()
    private var startHostTime: TimeInterval?
    private let analysisWindowSize = 2048
    private var ringBuffer: [Float] = []
    private let hopSize = 2048 // ~46 ms at 44.1 kHz; also the analysis window (no overlap, simplest to reason about)

    func start() throws {
        guard !isRunning else { return }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setActive(true)

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        startHostTime = nil
        ringBuffer.removeAll(keepingCapacity: true)

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(hopSize), format: format) { [weak self] buffer, time in
            guard let self else { return }
            let samples = Self.floatSamples(from: buffer)
            let sampleRate = format.sampleRate
            Task { @MainActor in
                self.consume(samples: samples, sampleRate: sampleRate, hostTime: time.sampleTime)
            }
        }

        engine.prepare()
        try engine.start()
        isRunning = true
    }

    func stop() {
        guard isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRunning = false
        currentNote = nil
        currentFrequency = nil
    }

    private func consume(samples: [Float], sampleRate: Double, hostTime: Int64) {
        ringBuffer.append(contentsOf: samples)
        guard ringBuffer.count >= analysisWindowSize else { return }

        let window = Array(ringBuffer.suffix(analysisWindowSize))
        ringBuffer.removeAll(keepingCapacity: true)

        let frequency = detector.detectPitch(samples: window, sampleRate: sampleRate)
        let note = frequency.flatMap { NoteMapper.note(forFrequency: $0) }

        let timestamp = Double(hostTime) / sampleRate
        let baseline = startHostTime ?? timestamp
        if startHostTime == nil { startHostTime = baseline }
        let relativeTimestamp = timestamp - baseline
        let duration = Double(window.count) / sampleRate

        currentNote = note
        currentFrequency = frequency
        framePublisher.send(Frame(note: note, frequency: frequency, timestamp: relativeTimestamp, duration: duration))
    }

    private static func floatSamples(from buffer: AVAudioPCMBuffer) -> [Float] {
        guard let channelData = buffer.floatChannelData else { return [] }
        let frameCount = Int(buffer.frameLength)
        return Array(UnsafeBufferPointer(start: channelData[0], count: frameCount))
    }
}
