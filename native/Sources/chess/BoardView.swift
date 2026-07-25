import AppKit
import SwiftUI

/// Window sizing, shared with `main.swift` (the NSWindow) and the offscreen renderer,
/// so all three agree on one geometry. Two player strips sandwich the board; the
/// controls sit beneath. The board is the window's width, squared.
enum BoardMetrics {
    static let minSide: CGFloat = 560
    static let stripHeight: CGFloat = 62
    static let controlsHeight: CGFloat = 122
    static var minWidth: CGFloat { minSide }
    static var minHeight: CGFloat { minSide + stripHeight * 2 + controlsHeight }
}

private enum UI {
    static let buttonRadius: CGFloat = 10
    static let buttonHeight: CGFloat = 34
    static let controlPadding: CGFloat = 20
    static let pieceScale: CGFloat = 0.94

    static let boardLight = Color(red: 238 / 255, green: 238 / 255, blue: 210 / 255)
    static let boardDark = Color(red: 118 / 255, green: 150 / 255, blue: 86 / 255)
    static let selected = Color(red: 246 / 255, green: 246 / 255, blue: 105 / 255)
    static let lastMove = Color(red: 246 / 255, green: 210 / 255, blue: 76 / 255).opacity(0.48)
    static let target = Color.black.opacity(0.26)

    static let surface = Color(red: 239 / 255, green: 239 / 255, blue: 237 / 255)
    static let recessed = Color(red: 226 / 255, green: 226 / 255, blue: 224 / 255)
    static let neutralButton = Color(red: 225 / 255, green: 225 / 255, blue: 223 / 255)
    static let text = Color(red: 33 / 255, green: 33 / 255, blue: 35 / 255)
    static let secondaryText = Color(red: 99 / 255, green: 99 / 255, blue: 103 / 255)
    static let tertiaryText = Color(red: 150 / 255, green: 150 / 255, blue: 154 / 255)
    static let separator = Color.black.opacity(0.11)
    static let blue = Color(red: 0 / 255, green: 122 / 255, blue: 255 / 255)
    static let dangerFill = Color(red: 235 / 255, green: 220 / 255, blue: 217 / 255)
    static let dangerText = Color(red: 132 / 255, green: 36 / 255, blue: 33 / 255)

    // Player-strip accents: a tint + ring on the side to move, and avatar backgrounds.
    static let turnTint = blue.opacity(0.07)
    static let turnRing = blue.opacity(0.85)
    static let humanTint = Color(red: 90 / 255, green: 100 / 255, blue: 112 / 255)

    /// A stable avatar background for an agent with no photo, chosen by id so the same
    /// agent always gets the same color (and two agents rarely collide).
    static func agentTint(_ id: String) -> Color {
        let palette: [Color] = [
            Color(red: 0.30, green: 0.53, blue: 0.90),
            Color(red: 0.55, green: 0.36, blue: 0.86),
            Color(red: 0.90, green: 0.45, blue: 0.30),
            Color(red: 0.20, green: 0.62, blue: 0.53),
            Color(red: 0.85, green: 0.36, blue: 0.55),
        ]
        var h = 5381
        for b in id.utf8 { h = ((h << 5) &+ h) &+ Int(b) }
        return palette[abs(h) % palette.count]
    }
}

struct BoardView: View {
    @ObservedObject var game: Game
    /// Offscreen render only: ImageRenderer can't rasterize a `Menu`, `ScrollView`, or
    /// `LazyHStack`, so the preview swaps those for static equivalents (the live app
    /// always runs with this false). Mirrors the other clapps' render hatch.
    var preview = false
    @State private var selected: Int?
    @State private var orientationWhite = true
    @State private var promo: (from: Int, to: Int)?

    private var bottomColor: Side { orientationWhite ? .w : .b }
    private var topColor: Side { orientationWhite ? .b : .w }

    private var legalTargets: Set<Int> {
        guard let selected else { return [] }
        return Set(game.position.legalMoves(from: selected).map { $0.to })
    }

    // Taps only move a HUMAN seat's pieces, and only on its turn — an agent seat plays
    // over the CLI, so the board is look-only while it's the agent's move.
    private var interactive: Bool {
        game.status == "playing" && game.seat(for: game.position.turn) == .human
    }

    var body: some View {
        GeometryReader { proxy in
            let side = max(BoardMetrics.minSide, proxy.size.width)

            VStack(spacing: 0) {
                playerStrip(color: topColor)      // opponent, across the board
                board(side: side)
                playerStrip(color: bottomColor)   // you (by default)
                controls(width: side)
            }
            .frame(width: side,
                   height: side + BoardMetrics.stripHeight * 2 + BoardMetrics.controlsHeight,
                   alignment: .top)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(UI.surface)
        }
        .frame(minWidth: BoardMetrics.minWidth, minHeight: BoardMetrics.minHeight)
        .background(UI.surface)
        .sheet(isPresented: Binding(get: { promo != nil }, set: { if !$0 { promo = nil } })) {
            promoPicker
        }
    }

    // MARK: - Player strips

    /// One side's player: avatar + name + which color, and a menu to reseat it (You,
    /// or any agent in the roster). Highlights when it is this side's turn.
    private func playerStrip(color: Side) -> some View {
        let seat = game.seat(for: color)
        let isTurn = game.status == "playing" && game.position.turn == color
        return Group {
            if preview {
                stripLabel(color: color, seat: seat, isTurn: isTurn)
            } else {
                Menu {
                    Button { game.chooseSeat(color, .human) } label: { Label("You", systemImage: "person.fill") }
                    if !game.agents.isEmpty {
                        Divider()
                        ForEach(game.agents) { a in
                            Button { game.chooseSeat(color, .agent(a.id)) } label: { Text(a.name) }
                        }
                    }
                } label: {
                    stripLabel(color: color, seat: seat, isTurn: isTurn)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: BoardMetrics.stripHeight)
        .background(isTurn ? UI.turnTint : UI.surface)
    }

    private func stripLabel(color: Side, seat: Seat, isTurn: Bool) -> some View {
        let info = seatInfo(color: color, seat: seat, isTurn: isTurn)
        return HStack(spacing: 12) {
            AvatarView(image: info.avatar, monogram: info.monogram, systemImage: info.systemImage,
                       size: 42, ring: isTurn ? UI.turnRing : nil, tint: info.tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(info.title)
                    .font(.system(size: 15.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(UI.text)
                    .lineLimit(1)
                Text(info.subtitle)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundStyle(info.subtitleColor)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            colorChip(color)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(UI.tertiaryText)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private struct SeatInfo {
        var title: String
        var subtitle: String
        var subtitleColor: Color
        var avatar: NSImage?
        var monogram: String
        var systemImage: String?
        var tint: Color
    }

    private func seatInfo(color: Side, seat: Seat, isTurn: Bool) -> SeatInfo {
        switch seat {
        case .human:
            return SeatInfo(
                title: "You",
                subtitle: isTurn ? "your move" : "human",
                subtitleColor: isTurn ? UI.blue : UI.secondaryText,
                avatar: nil, monogram: "", systemImage: "person.fill",
                tint: UI.humanTint)
        case .agent(let id):
            guard let a = game.agent(forId: id) else {
                return SeatInfo(
                    title: "Agent", subtitle: "offline",
                    subtitleColor: UI.tertiaryText,
                    avatar: nil, monogram: "?", systemImage: nil, tint: UI.recessed)
            }
            return SeatInfo(
                title: a.name,
                subtitle: isTurn ? "thinking…" : (a.model ?? a.backend),
                subtitleColor: isTurn ? UI.blue : UI.secondaryText,
                avatar: AvatarCache.image(a.avatarPath),
                monogram: String(a.name.prefix(1)).uppercased(),
                systemImage: nil,
                tint: UI.agentTint(a.id))
        }
    }

    private func colorChip(_ color: Side) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color == .w ? Color.white : Color(white: 0.16))
                .frame(width: 12, height: 12)
                .overlay(Circle().stroke(Color.black.opacity(0.22), lineWidth: 1))
            Text(color == .w ? "White" : "Black")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .foregroundStyle(UI.secondaryText)
        }
    }

    // MARK: - Board

    private func board(side: CGFloat) -> some View {
        let square = side / 8

        return ZStack(alignment: .topLeading) {
            boardSquares(side: side)

            ForEach(0..<64, id: \.self) { displayIndex in
                let row = displayIndex / 8
                let column = displayIndex % 8
                let sq = squareFor(row: row, column: column)

                squareOverlay(sq, side: square)
                    .position(
                        x: CGFloat(column) * square + square / 2,
                        y: CGFloat(row) * square + square / 2
                    )
            }

            coordinateOverlay(side: side)
        }
        .frame(width: side, height: side)
        .overlay(Rectangle().stroke(Color.black.opacity(0.10), lineWidth: 1))
    }

    private func boardSquares(side: CGFloat) -> some View {
        Canvas { context, size in
            let square = size.width / 8

            for row in 0..<8 {
                for column in 0..<8 {
                    let sq = squareFor(row: row, column: column)
                    let light = (fileOf(sq) + rankOf(sq)) % 2 == 1
                    let x0 = (CGFloat(column) * square).rounded(.toNearestOrAwayFromZero)
                    let y0 = (CGFloat(row) * square).rounded(.toNearestOrAwayFromZero)
                    let x1 = (CGFloat(column + 1) * square).rounded(.toNearestOrAwayFromZero)
                    let y1 = (CGFloat(row + 1) * square).rounded(.toNearestOrAwayFromZero)

                    context.fill(
                        Path(CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)),
                        with: .color(light ? UI.boardLight : UI.boardDark)
                    )
                }
            }
        }
        .frame(width: side, height: side)
        .allowsHitTesting(false)
    }

    private func squareOverlay(_ sq: Int, side: CGFloat) -> some View {
        let piece = game.position.board[sq]
        let isSelected = selected == sq
        let isTarget = legalTargets.contains(sq)
        let isLast = game.lastMove.map { $0.from == sq || $0.to == sq } ?? false

        return ZStack {
            if isLast {
                Rectangle().fill(UI.lastMove)
            }

            if let piece {
                PieceIcon(piece: piece, side: side)
                    .frame(width: side, height: side)
            }

            if isTarget {
                targetMark(occupied: piece != nil, side: side)
            }

            if isSelected {
                Rectangle()
                    .stroke(UI.selected, lineWidth: max(3, side * 0.045))
                    .padding(2)
            }
        }
        .frame(width: side, height: side)
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture { tap(sq) }
    }

    @ViewBuilder
    private func targetMark(occupied: Bool, side: CGFloat) -> some View {
        if occupied {
            Circle()
                .stroke(UI.target, lineWidth: side * 0.085)
                .padding(side * 0.09)
        } else {
            Circle()
                .fill(UI.target)
                .frame(width: side * 0.25, height: side * 0.25)
                .frame(width: side, height: side)
        }
    }

    private func coordinateOverlay(side: CGFloat) -> some View {
        let square = side / 8
        let fontSize = max(10, square * 0.135)

        return ZStack(alignment: .topLeading) {
            ForEach(0..<64, id: \.self) { displayIndex in
                let row = displayIndex / 8
                let column = displayIndex % 8
                let sq = squareFor(row: row, column: column)
                let light = (fileOf(sq) + rankOf(sq)) % 2 == 1
                let color = light ? UI.boardDark.opacity(0.90) : UI.boardLight.opacity(0.92)

                if fileOf(sq) == (orientationWhite ? 0 : 7) {
                    Text("\(rankOf(sq) + 1)")
                        .font(.system(size: fontSize, weight: .bold, design: .rounded))
                        .foregroundStyle(color)
                        .fixedSize()
                        .position(
                            x: CGFloat(column) * square + 10,
                            y: CGFloat(row) * square + 11
                        )
                }

                if rankOf(sq) == (orientationWhite ? 0 : 7) {
                    Text(fileLetter(fileOf(sq)))
                        .font(.system(size: fontSize, weight: .bold, design: .rounded))
                        .foregroundStyle(color)
                        .fixedSize()
                        .position(
                            x: CGFloat(column + 1) * square - 10,
                            y: CGFloat(row + 1) * square - 10
                        )
                }
            }
        }
        .frame(width: side, height: side)
        .allowsHitTesting(false)
    }

    private func squareFor(row: Int, column: Int) -> Int {
        let rank = orientationWhite ? 7 - row : row
        let file = orientationWhite ? column : 7 - column
        return rank * 8 + file
    }

    private func tap(_ sq: Int) {
        if let from = selected, legalTargets.contains(sq) {
            if let piece = game.position.board[from], piece.type == .p,
               rankOf(sq) == 7 || rankOf(sq) == 0 {
                promo = (from, sq)
                selected = nil
                return
            }
            try? game.move(from: from, to: sq, promo: nil, by: .user)
            selected = nil
            return
        }

        if interactive, let piece = game.position.board[sq], piece.color == game.position.turn {
            selected = sq
        } else {
            selected = nil
        }
    }

    // MARK: - Controls

    private func controls(width: CGFloat) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Text(statusText)
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)

                actionButton(game.status == "playing" ? "New" : "New Game",
                             width: game.status == "playing" ? 68 : 104, tone: .primary) {
                    startNewGame()
                }
                iconButton("arrow.up.arrow.down", help: "Flip board") { orientationWhite.toggle() }
                actionButton("Takeback", width: 92, tone: .neutral, disabled: game.history.isEmpty) {
                    game.takeback(1)
                }
                actionButton("Resign", width: 78, tone: .danger, disabled: game.status != "playing") {
                    try? game.resign(resignColor, by: .user)
                }
            }
            .frame(height: UI.buttonHeight)

            movesRail
        }
        .padding(.top, 14)
        .padding(.horizontal, UI.controlPadding)
        .frame(width: width, height: BoardMetrics.controlsHeight, alignment: .top)
        .background(UI.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(UI.separator).frame(height: 1)
        }
    }

    /// Reset to the start position with the current seats, orienting a lone human to
    /// the bottom of the board. If White is an agent, `Game.newGame` wakes it to open.
    private func startNewGame() {
        if game.whiteSeat == .human && game.blackSeat != .human { orientationWhite = true }
        else if game.blackSeat == .human && game.whiteSeat != .human { orientationWhite = false }
        game.newGame()
    }

    /// Resign the human's side; in hotseat or agent-vs-agent, resign the side to move.
    private var resignColor: Side {
        if game.whiteSeat == .human && game.blackSeat != .human { return .w }
        if game.blackSeat == .human && game.whiteSeat != .human { return .b }
        return game.position.turn
    }

    private func actionButton(
        _ title: String,
        width: CGFloat,
        tone: ArfButtonStyle.Tone,
        disabled: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14.5, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.86)
                .frame(width: width, height: UI.buttonHeight)
        }
        .buttonStyle(ArfButtonStyle(tone: tone, disabled: disabled))
        .disabled(disabled)
    }

    private func iconButton(_ system: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 40, height: UI.buttonHeight)
        }
        .buttonStyle(ArfButtonStyle(tone: .neutral, disabled: false))
        .help(help)
    }

    private var movesRail: some View {
        Group {
            if preview {
                HStack(spacing: 7) { movesContent }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .clipped()
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 7) { movesContent }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                }
                .scrollIndicators(.hidden)
            }
        }
        .frame(height: 40)
        .background(UI.recessed.opacity(0.64))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    @ViewBuilder
    private var movesContent: some View {
        if movePairs.isEmpty {
            Text("No moves yet")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(UI.secondaryText)
                .frame(height: 34)
        } else {
            ForEach(movePairs, id: \.0) { number, white, black in
                HStack(spacing: 7) {
                    Text("\(number).")
                        .foregroundStyle(UI.secondaryText)
                    Text(white.isEmpty ? "..." : white)
                        .foregroundStyle(UI.text)
                    if !black.isEmpty {
                        Text(black)
                            .foregroundStyle(UI.text)
                    }
                }
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(UI.recessed)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
        }
    }

    private var promoPicker: some View {
        HStack(spacing: 16) {
            ForEach([PieceType.q, .r, .b, .n], id: \.self) { type in
                Button {
                    if let promo {
                        try? game.move(from: promo.from, to: promo.to, promo: type, by: .user)
                    }
                    promo = nil
                } label: {
                    PieceIcon(piece: Piece(color: game.position.turn, type: type), side: 68)
                        .frame(width: 76, height: 76)
                        .background(UI.recessed)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(24)
        .background(UI.surface)
    }

    private var statusText: String {
        switch game.status {
        case "idle": return "Start a game"
        case "checkmate": return "Checkmate — \(colorName(game.winner ?? .w)) wins"
        case "resigned": return "\(colorName(game.winner ?? .w)) wins"
        case "stalemate": return "Stalemate — draw"
        case "draw": return "Draw"
        default:
            return game.position.inCheck ? "\(colorName(game.position.turn)) — check"
                                         : "\(colorName(game.position.turn)) to move"
        }
    }

    private var statusColor: Color {
        switch game.status {
        case "checkmate", "resigned", "stalemate", "draw": return UI.text
        default: return game.position.inCheck ? UI.dangerText : UI.secondaryText
        }
    }

    private var movePairs: [(Int, String, String)] {
        var pairs: [(Int, String, String)] = []
        for (index, move) in game.history.enumerated() {
            let pairIndex = index / 2
            if pairIndex >= pairs.count { pairs.append((pairIndex + 1, "", "")) }
            if move.color == "w" {
                pairs[pairIndex].1 = move.san
            } else {
                pairs[pairIndex].2 = move.san
            }
        }
        return pairs
    }

    private func colorName(_ color: Side) -> String {
        color == .w ? "White" : "Black"
    }

    private func fileLetter(_ file: Int) -> String {
        String(UnicodeScalar(UInt8(ascii: "a") + UInt8(file)))
    }
}

// MARK: - Avatar

private struct AvatarView: View {
    let image: NSImage?
    let monogram: String
    let systemImage: String?
    let size: CGFloat
    let ring: Color?
    let tint: Color

    var body: some View {
        ZStack {
            if let image {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                tint
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: size * 0.44, weight: .semibold))
                        .foregroundStyle(.white)
                } else {
                    Text(monogram)
                        .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.black.opacity(0.10), lineWidth: 1))
        .overlay(Circle().strokeBorder(ring ?? .clear, lineWidth: 2.5))
    }
}

/// Small cache so a strip re-render doesn't re-read the avatar file each frame.
private enum AvatarCache {
    private static let cache = NSCache<NSString, NSImage>()
    static func image(_ path: String?) -> NSImage? {
        guard let path, !path.isEmpty else { return nil }
        if let hit = cache.object(forKey: path as NSString) { return hit }
        guard let img = NSImage(contentsOfFile: path) else { return nil }
        cache.setObject(img, forKey: path as NSString)
        return img
    }
}

private struct ArfButtonStyle: ButtonStyle {
    enum Tone { case primary, neutral, danger }

    let tone: Tone
    let disabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground)
            .background {
                RoundedRectangle(cornerRadius: UI.buttonRadius, style: .continuous)
                    .fill(background(configuration.isPressed))
            }
            .overlay {
                RoundedRectangle(cornerRadius: UI.buttonRadius, style: .continuous)
                    .stroke(border, lineWidth: 1)
            }
            .opacity(disabled ? 0.44 : 1)
            .scaleEffect(configuration.isPressed && !disabled ? 0.985 : 1)
            .contentShape(RoundedRectangle(cornerRadius: UI.buttonRadius, style: .continuous))
    }

    private var foreground: Color {
        switch tone {
        case .primary: return .white
        case .neutral: return UI.text
        case .danger: return UI.dangerText
        }
    }

    private var border: Color {
        switch tone {
        case .primary: return Color.white.opacity(0.20)
        case .neutral: return Color.black.opacity(0.06)
        case .danger: return Color(red: 180 / 255, green: 82 / 255, blue: 76 / 255).opacity(0.12)
        }
    }

    private func background(_ pressed: Bool) -> Color {
        let base: Color
        switch tone {
        case .primary: base = UI.blue
        case .neutral: base = UI.neutralButton
        case .danger: base = UI.dangerFill
        }
        return pressed && !disabled ? base.opacity(0.76) : base
    }
}

private struct PieceIcon: View {
    let piece: Piece
    let side: CGFloat

    var body: some View {
        if let image = PieceArt.image(for: piece) {
            Image(nsImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: side * UI.pieceScale, height: side * UI.pieceScale)
                .offset(y: side * 0.015)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        } else {
            Text(PieceArt.fallback(for: piece))
                .font(.system(size: side * 0.88, weight: .regular))
                .foregroundStyle(piece.color == .w ? Color.white : Color.black)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

private enum PieceArt {
    private static let cache = NSCache<NSString, NSImage>()

    static func image(for piece: Piece) -> NSImage? {
        let name = assetName(for: piece)
        if let cached = cache.object(forKey: name as NSString) { return cached }
        let url = Bundle.module.url(
            forResource: name,
            withExtension: "png",
            subdirectory: "pieces/cburnett"
        ) ?? Bundle.module.url(forResource: name, withExtension: "png")
        guard let url, let image = NSImage(contentsOf: url) else {
            return nil
        }
        cache.setObject(image, forKey: name as NSString)
        return image
    }

    static func fallback(for piece: Piece) -> String {
        switch piece.type {
        case .k: return piece.color == .w ? "♔" : "♚"
        case .q: return piece.color == .w ? "♕" : "♛"
        case .r: return piece.color == .w ? "♖" : "♜"
        case .b: return piece.color == .w ? "♗" : "♝"
        case .n: return piece.color == .w ? "♘" : "♞"
        case .p: return piece.color == .w ? "♙" : "♟"
        }
    }

    private static func assetName(for piece: Piece) -> String {
        let color = piece.color == .w ? "w" : "b"
        switch piece.type {
        case .k: return "\(color)K"
        case .q: return "\(color)Q"
        case .r: return "\(color)R"
        case .b: return "\(color)B"
        case .n: return "\(color)N"
        case .p: return "\(color)P"
        }
    }
}
