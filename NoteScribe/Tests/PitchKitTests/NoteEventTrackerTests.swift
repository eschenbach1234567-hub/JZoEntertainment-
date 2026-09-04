import XCTest
@testable import PitchKit

final class NoteEventTrackerTests: XCTestCase {
    func testMergesConsecutiveFramesOfSameNote() {
        let tracker = NoteEventTracker()
        let g3 = Note(midi: 55)
        let frameDuration = 0.05
        for i in 0..<6 {
            tracker.addFrame(note: g3, timestamp: Double(i) * frameDuration, frameDuration: frameDuration)
        }
        tracker.finalize()

        XCTAssertEqual(tracker.finishedEvents.count, 1)
        XCTAssertEqual(tracker.finishedEvents.first?.note.label, "G3")
        XCTAssertEqual(tracker.finishedEvents.first?.duration ?? 0, 0.3, accuracy: 0.001)
    }

    func testNoteChangeStartsNewEvent() {
        let tracker = NoteEventTracker()
        let g3 = Note(midi: 55)
        let a3 = Note(midi: 57)
        let frameDuration = 0.05
        for i in 0..<4 {
            tracker.addFrame(note: g3, timestamp: Double(i) * frameDuration, frameDuration: frameDuration)
        }
        for i in 4..<8 {
            tracker.addFrame(note: a3, timestamp: Double(i) * frameDuration, frameDuration: frameDuration)
        }
        tracker.finalize()

        XCTAssertEqual(tracker.finishedEvents.map { $0.note.label }, ["G3", "A3"])
    }

    func testBriefGapIsBridgedWithinSameNote() {
        let tracker = NoteEventTracker(minimumEventDuration: 0.05, maxGapToBridge: 0.1)
        let g3 = Note(midi: 55)
        tracker.addFrame(note: g3, timestamp: 0.0, frameDuration: 0.05)
        tracker.addFrame(note: nil, timestamp: 0.05, frameDuration: 0.05)
        tracker.addFrame(note: g3, timestamp: 0.10, frameDuration: 0.05)
        tracker.finalize()

        XCTAssertEqual(tracker.finishedEvents.count, 1)
    }

    func testVeryShortBlipIsDropped() {
        let tracker = NoteEventTracker(minimumEventDuration: 0.1, maxGapToBridge: 0.02)
        let g3 = Note(midi: 55)
        tracker.addFrame(note: g3, timestamp: 0.0, frameDuration: 0.02)
        tracker.addFrame(note: nil, timestamp: 0.02, frameDuration: 0.05)
        tracker.finalize()

        XCTAssertTrue(tracker.finishedEvents.isEmpty)
    }
}
