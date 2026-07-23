// swift-tools-version:5.9
import PackageDescription

// The whole app is one SwiftPM executable. When you fork this template, rename the
// target and the `Sources/chess` directory together with the CLI name in
// clatch.json (see TEMPLATE.md § Rename).
//
// `Resources/` ships bundled assets (the Clatch design-system fonts, Plus Jakarta
// Sans) reachable via `Bundle.module`; Fonts.register() loads them at launch.
let package = Package(
    name: "chess",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "chess",
            path: "Sources/chess",
            resources: [.process("Resources")]
        )
    ]
)
