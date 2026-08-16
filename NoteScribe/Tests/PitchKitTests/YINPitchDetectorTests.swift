import XCTest
@testable import PitchKit

final class YINPitchDetectorTests: XCTestCase {
    private func sineWave(frequency: Double, sampleRate: Double, count: Int) -> [Float] {
        (0..<count).map { i in
            Float(sin(2.0 * Double.pi * frequency * Double(i) / sampleRate))
        }
    }

    func testDetectsA440() {
        let detector = YINPitchDetector()
        let samples = sineWave(frequency: 440, sampleRate: 44100, count: 2048)
        let pitch = detector.detectPitch(samples: samples, sampleRate: 44100)
        XCTAssertNotNil(pitch)
        XCTAssertEqual(pitch!, 440, accuracy: 2.0)
    }

    func testDetectsLowGuitarE() {
        // Low E string, open, ~82.41 Hz.
        let detector = YINPitchDetector()
        let samples = sineWave(frequency: 82.41, sampleRate: 44100, count: 4096)
        let pitch = detector.detectPitch(samples: samples, sampleRate: 44100)
        XCTAssertNotNil(pitch)
        XCTAssertEqual(pitch!, 82.41, accuracy: 1.0)
    }

    func testSilenceYieldsNoConfidentPitch() {
        let detector = YINPitchDetector()
        let samples = [Float](repeating: 0, count: 2048)
        XCTAssertNil(detector.detectPitch(samples: samples, sampleRate: 44100))
    }

    func testTooShortBufferReturnsNil() {
        let detector = YINPitchDetector()
        XCTAssertNil(detector.detectPitch(samples: [0.1, 0.2, 0.3], sampleRate: 44100))
    }
}
