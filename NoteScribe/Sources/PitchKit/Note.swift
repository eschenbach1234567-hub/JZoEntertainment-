import Foundation

/// A single pitched musical note in scientific pitch notation (e.g. "G3").
public struct Note: Equatable, Hashable {
    public static let names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    /// MIDI note number, where 69 == A4 (440 Hz).
    public let midi: Int

    /// Signed deviation from the note's ideal 12-TET frequency, in cents (-50...50).
    public let cents: Double

    public init(midi: Int, cents: Double = 0) {
        self.midi = midi
        self.cents = cents
    }

    public var name: String { Note.names[((midi % 12) + 12) % 12] }

    public var octave: Int { midi / 12 - 1 }

    /// e.g. "G3"
    public var label: String { "\(name)\(octave)" }

    /// Ideal frequency for this note under 12-TET tuning with A4 = 440 Hz.
    public var frequency: Double {
        440.0 * pow(2.0, Double(midi - 69) / 12.0)
    }
}
