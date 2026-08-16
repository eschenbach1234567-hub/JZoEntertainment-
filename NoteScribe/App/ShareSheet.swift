import SwiftUI
import UIKit

/// Wraps `UIActivityViewController` so SwiftUI can present the standard
/// iOS share sheet — used to send the exported `.musicxml` file to the
/// Guitar Pro app, Files, AirDrop, Mail, etc.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
