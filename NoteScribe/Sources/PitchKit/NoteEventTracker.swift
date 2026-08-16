import Foundation

/// Turns a stream of per-frame pitch detections into a sequence of sustained
/// `NoteEvent`s: consecutive frames of the same note are merged, brief gaps
/// (a pick attack, a slightly quiet frame) are bridged, and events shorter
/// than `minimumEventDuration` are dropped as detector noise.
///
/// Feed it one frame at a time, in chronological order, via `addFrame`, then
/// call `finalize()` once the stream ends to flush the last in-progress note.
public final class NoteEventTracker {
    public let minimumEventDuration: TimeInterval
    public let maxGapToBridge: TimeInterval

    public private(set) var finishedEvents: [NoteEvent] = []

    private var pendingNote: Note?
    private var pendingStart: TimeInterval?
    private var pendingLastVoicedEnd: TimeInterval?

    public init(minimumEventDuration: TimeInterval = 0.08, maxGapToBridge: TimeInterval = 0.12) {
        self.minimumEventDuration = minimumEventDuration
        self.maxGapToBridge = maxGapToBridge
    }

    /// - Parameters:
    ///   - note: the note detected in this frame, or `nil` for silence/unpitched audio.
    ///   - timestamp: start time of this frame, in seconds since recording began.
    ///   - frameDuration: length of this frame in seconds.
    public func addFrame(note: Note?, timestamp: TimeInterval, frameDuration: TimeInterval) {
        if let note {
            if let pendingNote, pendingNote.label == note.label,
               let lastVoicedEnd = pendingLastVoicedEnd, timestamp - lastVoicedEnd <= maxGapToBridge {
                pendingLastVoicedEnd = timestamp + frameDuration
            } else {
                closePending()
                pendingNote = note
                pendingStart = timestamp
                pendingLastVoicedEnd = timestamp + frameDuration
            }
        } else if let lastVoicedEnd = pendingLastVoicedEnd, timestamp - lastVoicedEnd > maxGapToBridge {
            closePending()
        }
    }

    /// Flushes any note still in progress. Call once after the last frame.
    public func finalize() {
        closePending()
    }

    private func closePending() {
        defer {
            pendingNote = nil
            pendingStart = nil
            pendingLastVoicedEnd = nil
        }
        guard let note = pendingNote, let start = pendingStart, let end = pendingLastVoicedEnd else { return }
        let duration = end - start
        guard duration >= minimumEventDuration else { return }
        finishedEvents.append(NoteEvent(note: note, startTime: start, duration: duration))
    }
}
