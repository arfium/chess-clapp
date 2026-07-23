import SwiftUI
import AppKit
import CoreText

// ─────────────────────────────────────────────────────────────────────────────
// The Clatch design system, ported to SwiftUI from the launcher's design.css
// (clatch/gui/src/design.css, reference/gui.md). Dark "space" ground, the volt
// (#e1ff00 Phosphor) accent, Plus Jakarta Sans, uppercase tracked eyebrows, 20px panels,
// 36px controls. Reuse the tokens and atoms below in your views so a forked app
// looks like it belongs to Clatch. This whole file is generic — carry it as-is.
// ─────────────────────────────────────────────────────────────────────────────

// MARK: - Tokens

enum Palette {
    // Brand accent = the Phosphor theme (clatch design.css default): the bright
    // member fills, the deep member answers it (hover/pressed). Destructive = Blood.
    static let volt      = Color(hex: 0xE1FF00)   // --volt   (Phosphor bright)
    static let volt2     = Color(hex: 0x378C69)   // --volt-2 (Phosphor deep)
    static let space     = Color(hex: 0x0A0A0A)
    static let accentInk = Color(hex: 0x0A0A0A)   // ink ON an accent surface (always dark)
    static let hazard    = Color(hex: 0xFF0D00)   // --hazard   (Blood bright)
    static let hazard2   = Color(hex: 0xAD0E1E)   // --hazard-2 (Blood deep)
    static let signalBlue = Color(hex: 0x3DA9FC)
    static let ok        = Color(hex: 0x5DB075)

    // Workspace (the dark default theme)
    static let bg        = Color(hex: 0x16171A)   // --ws-bg
    static let fg        = Color(hex: 0xF3F4F5)   // --ws-fg
    static let fgDim     = Color(hex: 0x9A9CA2)   // --ws-fg-dim
    static let fgMute    = Color(hex: 0x5F6166)   // --ws-fg-mute
    static let panel     = Color(hex: 0x1E2024)   // --panel-bg
    static let panel2    = Color(hex: 0x26282D)   // --panel-bg-2
    static let line      = Color(hex: 0x34363C)   // --panel-line
    static let lineSoft  = Color(hex: 0x2A2C31)   // --panel-line-soft
    static let shell     = Color(hex: 0x1A1B1E)   // --shell

    static let nsBg = NSColor(bg)
}

enum Radius {
    static let panel: CGFloat = 20
    static let nest: CGFloat = 9
    static let inner: CGFloat = 5
    static let chip: CGFloat = 4
}

enum Space {
    static let s1: CGFloat = 4, s2: CGFloat = 8, s3: CGFloat = 12
    static let s4: CGFloat = 16, s5: CGFloat = 24, s6: CGFloat = 32
    static let controlH: CGFloat = 36
}

// MARK: - Type (Plus Jakarta Sans, single-sourced like the launcher)

enum ClatchWeight { case regular, medium, semibold, bold, extrabold }

enum Fonts {
    /// True once the bundled TTFs registered; views fall back to the system font if not.
    private(set) static var loaded = false

    static func register() {
        guard !loaded else { return }
        // `.process("Resources")` may flatten the fonts into the bundle root or keep
        // them under fonts/ — look in both.
        var urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: "fonts") ?? []
        urls += Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        for url in Set(urls) {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        loaded = !urls.isEmpty
    }

    static func postScriptName(_ w: ClatchWeight) -> String {
        switch w {
        case .regular:   return "PlusJakartaSans-Regular"
        case .medium:    return "PlusJakartaSans-Medium"
        case .semibold:  return "PlusJakartaSans-SemiBold"
        case .bold:      return "PlusJakartaSans-Bold"
        case .extrabold: return "PlusJakartaSans-ExtraBold"
        }
    }

    static func system(_ w: ClatchWeight) -> Font.Weight {
        switch w {
        case .regular: return .regular
        case .medium: return .medium
        case .semibold: return .semibold
        case .bold: return .bold
        case .extrabold: return .heavy
        }
    }
}

extension Font {
    /// The Clatch UI typeface at an explicit size/weight (falls back to a rounded
    /// system face if the bundle didn't load).
    static func jakarta(_ size: CGFloat, _ weight: ClatchWeight = .regular) -> Font {
        Fonts.loaded
            ? .custom(Fonts.postScriptName(weight), fixedSize: size)
            : .system(size: size, weight: Fonts.system(weight), design: .rounded)
    }
}

// MARK: - Atoms

/// The uppercase, tracked micro-label used above every section (design.css .eyebrow).
struct Eyebrow: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased())
            .font(.jakarta(10.5, .semibold))
            .tracking(1.5)
            .foregroundStyle(Palette.fgDim)
    }
}

/// A titled container (design.css .panel + .panel-head + .panel-body).
struct Panel<Content: View>: View {
    let title: String?
    let trailing: AnyView?
    @ViewBuilder var content: () -> Content

    init(_ title: String? = nil, trailing: AnyView? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title; self.trailing = trailing; self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if title != nil || trailing != nil {
                HStack {
                    if let title { Eyebrow(title) }
                    Spacer(minLength: 0)
                    if let trailing { trailing }
                }
                .padding(.horizontal, Space.s4)
                .padding(.vertical, 13)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Palette.lineSoft).frame(height: 1)
                }
            }
            VStack(alignment: .leading, spacing: 10) { content() }
                .padding(10)
        }
        .background(Palette.panel)
        .clipShape(RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.panel, style: .continuous)
                .stroke(Palette.line, lineWidth: 1)
        }
    }
}

/// A small status chip (design.css .badge / .badge--volt / .badge--hazard).
struct Badge: View {
    enum Tone { case neutral, volt, hazard, ok }
    let text: String
    var tone: Tone = .neutral
    init(_ text: String, tone: Tone = .neutral) { self.text = text; self.tone = tone }

    var body: some View {
        Text(text)
            .font(.jakarta(10.5, tone == .neutral ? .medium : .semibold))
            .tracking(0.1)
            .foregroundStyle(fg)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(bg)
            .overlay(Capsule().stroke(border, lineWidth: 1))
            .clipShape(Capsule())
    }
    private var fg: Color {
        switch tone { case .neutral: return Palette.fgDim; case .ok: return Palette.space
        case .volt: return Palette.space; case .hazard: return Palette.space }
    }
    private var bg: Color {
        switch tone { case .neutral: return .clear; case .volt: return Palette.volt
        case .hazard: return Palette.hazard; case .ok: return Palette.ok }
    }
    private var border: Color { tone == .neutral ? Palette.line : bg }
}

// MARK: - Buttons (design.css .btn, .btn--primary, .btn--ghost)

struct VoltButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.jakarta(13, .semibold))
            .foregroundStyle(enabled ? Palette.space : Palette.fgMute)
            .frame(height: Space.controlH)
            .padding(.horizontal, Space.s4)
            .background(enabled ? (configuration.isPressed ? Palette.volt2 : Palette.volt) : Palette.panel2)
            .clipShape(RoundedRectangle(cornerRadius: Radius.nest, style: .continuous))
            .contentShape(Rectangle())
    }
}

struct GhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    var tone: Color = Palette.fg
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.jakarta(13, .medium))
            .foregroundStyle(enabled ? tone : Palette.fgMute)
            .frame(height: Space.controlH)
            .padding(.horizontal, Space.s4)
            .background(configuration.isPressed ? Palette.panel2 : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: Radius.nest, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.nest, style: .continuous)
                    .stroke(configuration.isPressed ? Palette.fgDim : Palette.line, lineWidth: 1)
            }
            .contentShape(Rectangle())
    }
}

// MARK: - Fields

/// A Clatch-styled text field (design.css .input): dark, bordered, r-nest.
struct ClatchFieldStyle: TextFieldStyle {
    // swiftlint:disable:next identifier_name
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .font(.jakarta(13, .regular))
            .foregroundStyle(Palette.fg)
            .frame(height: Space.controlH)
            .padding(.horizontal, Space.s3)
            .background(Palette.panel)
            .clipShape(RoundedRectangle(cornerRadius: Radius.nest, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.nest, style: .continuous)
                    .stroke(Palette.line, lineWidth: 1)
            }
    }
}

// MARK: - Color hex

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}
