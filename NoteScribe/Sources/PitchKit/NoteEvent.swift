import Foundation

/// A note sustained over a span of time, as reconstructed from a stream of
/// per-frame pitch detections.
public struct NoteEvent: Equatable {
    public let note: Note
    public let startTime: TimeInterval
    public var duration: TimeInterval

    public init(note: Note, startTime: TimeInterval, duration: TimeInterval) {
        self.note = note
        self.startTime = startTime
        self.duration = duration
    }
}
