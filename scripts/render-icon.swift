import AppKit
import Foundation

// Self-contained placeholder icon: a rounded plate + a monogram. No source asset
// needed. Run from the repo root:  swift scripts/render-icon.swift  → assets/icon.png
// Replace the whole thing (or just the drawing) with your real icon when you fork.

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputURL = root.appendingPathComponent("assets/icon.png")
try? FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)

let monogram = CommandLine.arguments.dropFirst().first ?? "C"     // e.g. `swift scripts/render-icon.swift W`
let size = NSSize(width: 1024, height: 1024)

guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height),
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { fatalError("could not create bitmap") }
rep.size = size

guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else { fatalError("no context") }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = ctx
ctx.imageInterpolation = .high

NSColor.clear.setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()

// Rounded plate with a soft vertical gradient.
let plate = NSRect(x: 64, y: 64, width: 896, height: 896)
let path = NSBezierPath(roundedRect: plate, xRadius: 210, yRadius: 210)
// Phosphor pair (clatch design.css): the bright member fills, the deep answers.
let gradient = NSGradient(colors: [
    NSColor(calibratedRed: 0.882, green: 1.0, blue: 0.0, alpha: 1),     // #E1FF00 Phosphor bright
    NSColor(calibratedRed: 0.216, green: 0.549, blue: 0.412, alpha: 1), // #378C69 Phosphor deep
])
gradient?.draw(in: path, angle: -90)

// Monogram, centered.
let letter = String(monogram.prefix(1)).uppercased()
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 560, weight: .bold),
    .foregroundColor: NSColor(calibratedWhite: 0.04, alpha: 1),  // accent-ink (#0A0A0A): black on the accent
]
let str = NSAttributedString(string: letter, attributes: attrs)
let textSize = str.size()
str.draw(at: NSPoint(x: (size.width - textSize.width) / 2,
                     y: (size.height - textSize.height) / 2 - 20))

NSGraphicsContext.restoreGraphicsState()

guard let png = rep.representation(using: .png, properties: [:]) else {
    fatalError("could not encode png")
}
try png.write(to: outputURL)
print(outputURL.path)
