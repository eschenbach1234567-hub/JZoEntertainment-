import XCTest
@testable import PitchKit

final class MusicXMLExporterTests: XCTestCase {
    func testExportsWellFormedDocumentWithExpectedPitches() {
        // G3, D4, C4 at 120 BPM (0.5s per quarter note), each held one quarter note.
        let events = [
            NoteEvent(note: Note(midi: 55), startTime: 0.0, duration: 0.5),
            NoteEvent(note: Note(midi: 62), startTime: 0.5, duration: 0.5),
            NoteEvent(note: Note(midi: 60), startTime: 1.0, duration: 0.5)
        ]

        let xml = MusicXMLExporter.export(events: events, tempoBPM: 120, partName: "Guitar")

        XCTAssertTrue(xml.contains("<score-partwise version=\"4.0\">"))
        XCTAssertTrue(xml.contains("<part-name>Guitar</part-name>"))
        XCTAssertTrue(xml.contains("<step>G</step>"))
        XCTAssertTrue(xml.contains("<octave>3</octave>"))
        XCTAssertTrue(xml.contains("<step>D</step>"))
        XCTAssertTrue(xml.contains("<octave>4</octave>"))
        XCTAssertTrue(xml.contains("<step>C</step>"))

        let document = try? XMLDocument(xmlString: xml, options: [])
        XCTAssertNotNil(document, "exported MusicXML should parse as valid XML")
    }

    func testSharpNoteIncludesAlterElement() {
        let events = [NoteEvent(note: Note(midi: 56), startTime: 0, duration: 0.5)] // G#3
        let xml = MusicXMLExporter.export(events: events)
        XCTAssertTrue(xml.contains("<step>G</step>"))
        XCTAssertTrue(xml.contains("<alter>1</alter>"))
    }

    func testEmptyEventsStillProducesOpenableDocument() {
        let xml = MusicXMLExporter.export(events: [])
        XCTAssertTrue(xml.contains("<rest/>"))
        let document = try? XMLDocument(xmlString: xml, options: [])
        XCTAssertNotNil(document)
    }
}
