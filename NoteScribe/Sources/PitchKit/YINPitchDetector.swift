import Foundation

/// Monophonic fundamental-frequency estimator based on the YIN algorithm
/// (de Cheveigné & Kawahara, 2002). Works one audio buffer at a time, so it
/// is a good fit for detecting a single guitar note (or hummed/sung note)
/// picked up by the microphone. It is not designed for polyphonic input
/// (chords) — see the README for why that's a much harder problem.
public struct YINPitchDetector {
    /// 0..1. Lower = stricter (fewer false positives, more missed quiet notes).
    public var threshold: Double

    public init(threshold: Double = 0.15) {
        self.threshold = threshold
    }

    /// Estimates the fundamental frequency of `samples` (mono, `sampleRate` Hz).
    /// Returns `nil` if no confident periodicity is found (silence, noise, or a chord).
    public func detectPitch(samples: [Float], sampleRate: Double) -> Double? {
        let n = samples.count
        let maxTau = n / 2
        guard maxTau > 2 else { return nil }

        var difference = [Double](repeating: 0, count: maxTau)
        for tau in 1..<maxTau {
            var sum = 0.0
            for j in 0..<(n - tau) {
                let delta = Double(samples[j]) - Double(samples[j + tau])
                sum += delta * delta
            }
            difference[tau] = sum
        }

        var cumulative = [Double](repeating: 1, count: maxTau)
        var runningSum = 0.0
        for tau in 1..<maxTau {
            runningSum += difference[tau]
            cumulative[tau] = runningSum == 0 ? 1 : difference[tau] * Double(tau) / runningSum
        }

        var tauEstimate = -1
        var tau = 2
        while tau < maxTau {
            if cumulative[tau] < threshold {
                while tau + 1 < maxTau && cumulative[tau + 1] < cumulative[tau] {
                    tau += 1
                }
                tauEstimate = tau
                break
            }
            tau += 1
        }
        guard tauEstimate > 0 else { return nil }

        let refinedTau = parabolicInterpolation(cumulative, around: tauEstimate)
        guard refinedTau > 0 else { return nil }
        return sampleRate / refinedTau
    }

    /// Refines an integer lag estimate to sub-sample precision using the two
    /// neighboring difference-function values.
    private func parabolicInterpolation(_ values: [Double], around tau: Int) -> Double {
        let x0 = tau > 0 ? tau - 1 : tau
        let x2 = tau + 1 < values.count ? tau + 1 : tau
        if x0 == tau || x2 == tau { return Double(tau) }

        let s0 = values[x0], s1 = values[tau], s2 = values[x2]
        let denominator = s2 + s0 - 2 * s1
        guard denominator != 0 else { return Double(tau) }
        let shift = (s0 - s2) / (2 * denominator)
        return Double(tau) + shift
    }
}
