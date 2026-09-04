import Foundation

/// Maps a detected fundamental frequency to the nearest 12-TET note.
public enum NoteMapper {
    /// Returns `nil` for frequencies outside a sane instrument range (about C1..C8),
    /// which are almost always detector noise rather than a real pitch.
    public static func note(forFrequency frequency: Double,
                             referenceA4: Double = 440.0,
                             minFrequency: Double = 30.0,
                             maxFrequency: Double = 4200.0) -> Note? {
        guard frequency.isFinite, frequency >= minFrequency, frequency <= maxFrequency else {
            return nil
        }
        let exactMidi = 69.0 + 12.0 * log2(frequency / referenceA4)
        let roundedMidi = exactMidi.rounded()
        let cents = (exactMidi - roundedMidi) * 100.0
        return Note(midi: Int(roundedMidi), cents: cents)
    }
}
