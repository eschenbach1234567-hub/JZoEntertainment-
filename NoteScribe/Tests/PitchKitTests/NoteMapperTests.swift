import XCTest
@testable import PitchKit

final class NoteMapperTests: XCTestCase {
    func testExactFrequenciesMapToExpectedNotes() {
        let cases: [(frequency: Double, label: String)] = [
            (440.00, "A4"),
            (392.00, "G4"),
            (293.66, "D4"),
            (261.63, "C4"),
            (82.41, "E2")
        ]
        for testCase in cases {
            let note = NoteMapper.note(forFrequency: testCase.frequency)
            XCTAssertEqual(note?.label, testCase.label, "\(testCase.frequency) Hz")
            XCTAssertEqual(note?.cents ?? 999, 0, accuracy: 3)
        }
    }

    func testSlightlySharpFrequencyReportsPositiveCents() {
        // A4 nudged up by ~20 cents.
        let sharpA4 = 440.0 * pow(2.0, 20.0 / 1200.0)
        let note = NoteMapper.note(forFrequency: sharpA4)
        XCTAssertEqual(note?.label, "A4")
        XCTAssertEqual(note?.cents ?? 0, 20, accuracy: 1)
    }

    func testOutOfRangeFrequenciesAreRejected() {
        XCTAssertNil(NoteMapper.note(forFrequency: 5))
        XCTAssertNil(NoteMapper.note(forFrequency: 20000))
        XCTAssertNil(NoteMapper.note(forFrequency: .nan))
    }
}
