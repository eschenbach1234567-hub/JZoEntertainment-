import Foundation

/// Renders a transcribed melody as MusicXML — Guitar Pro (from version 6 on)
/// opens `.musicxml` files directly via File ▸ Import ▸ MusicXML, and can
/// then re-save them as a native `.gp` file. That round-trip is far more
/// reliable than writing Guitar Pro's own binary/zip format from scratch,
/// which is undocumented and changes between versions.
public enum MusicXMLExporter {
    /// One quarter note is split into this many rhythmic subdivisions when
    /// quantizing detected note durations (16 => sixteenth-note grid).
    private static let divisionsPerQuarter = 4

    /// - Parameters:
    ///   - events: the transcribed melody, in chronological order.
    ///   - tempoBPM: quarter notes per minute, used only to translate the
    ///     detector's wall-clock durations into notated rhythms.
    ///   - partName: shown as the instrument name in Guitar Pro.
    public static func export(events: [NoteEvent], tempoBPM: Double = 120, partName: String = "Guitar") -> String {
        let secondsPerQuarter = 60.0 / tempoBPM
        var measuresXML = ""
        var measureNumber = 1
        var beatsInMeasure = 0.0
        let beatsPerMeasure = 4.0
        var currentMeasureNotes = ""

        func flushMeasure() {
            guard !currentMeasureNotes.isEmpty else { return }
            measuresXML += """
              <measure number="\(measureNumber)">
            \(measureNumber == 1 ? attributesXML() : "")\(currentMeasureNotes)  </measure>

            """
            measureNumber += 1
            currentMeasureNotes = ""
            beatsInMeasure = 0
        }

        for event in events {
            let quarterLength = event.duration / secondsPerQuarter
            let (type, dotted, durationDivisions) = quantize(quarterLength: quarterLength)
            currentMeasureNotes += noteXML(note: event.note, type: type, dotted: dotted, durationDivisions: durationDivisions)
            beatsInMeasure += Double(durationDivisions) / Double(divisionsPerQuarter)
            if beatsInMeasure >= beatsPerMeasure {
                flushMeasure()
            }
        }
        flushMeasure()

        if measureNumber == 1 {
            // No notes were captured; still emit one empty measure so the file opens cleanly.
            measuresXML = """
              <measure number="1">
            \(attributesXML())    <note>
                  <rest/>
                  <duration>\(divisionsPerQuarter * 4)</duration>
                  <type>whole</type>
                </note>
              </measure>

            """
        }

        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
        <score-partwise version="4.0">
          <part-list>
            <score-part id="P1">
              <part-name>\(escapeXML(partName))</part-name>
            </score-part>
          </part-list>
          <part id="P1">
        \(measuresXML)  </part>
        </score-partwise>

        """
    }

    private static func attributesXML() -> String {
        """
            <attributes>
              <divisions>\(divisionsPerQuarter)</divisions>
              <key><fifths>0</fifths></key>
              <time><beats>4</beats><beat-type>4</beat-type></time>
              <clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>
            </attributes>

        """
    }

    private static func noteXML(note: Note, type: String, dotted: Bool, durationDivisions: Int) -> String {
        let step = String(note.name.first!)
        let alter = note.name.contains("#") ? "<alter>1</alter>" : ""
        let dot = dotted ? "<dot/>" : ""
        return """
            <note>
              <pitch>
                <step>\(step)</step>
                \(alter)
                <octave>\(note.octave)</octave>
              </pitch>
              <duration>\(durationDivisions)</duration>
              <type>\(type)</type>
              \(dot)
            </note>

        """
    }

    /// Snaps a raw duration (in quarter-note units) to the nearest notatable
    /// rhythm on a sixteenth-note grid, returning its MusicXML `<type>`,
    /// whether it needs a `<dot/>`, and its `<duration>` (in `divisions`,
    /// i.e. sixteenth-note ticks here).
    private static func quantize(quarterLength: Double) -> (type: String, dotted: Bool, divisions: Int) {
        let grid: [(quarters: Double, type: String, dotted: Bool)] = [
            (0.25, "16th", false), (0.5, "eighth", false), (1.0, "quarter", false),
            (1.5, "quarter", true), (2.0, "half", false), (3.0, "half", true), (4.0, "whole", false)
        ]
        let closest = grid.min(by: { abs($0.quarters - quarterLength) < abs($1.quarters - quarterLength) })
            ?? (1.0, "quarter", false)
        let divisions = max(1, Int((closest.quarters * Double(divisionsPerQuarter)).rounded()))
        return (closest.type, closest.dotted, divisions)
    }

    private static func escapeXML(_ string: String) -> String {
        string
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
