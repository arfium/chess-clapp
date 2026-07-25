import AppKit
import SwiftUI

/// Window sizing, shared with `main.swift` (the NSWindow) and the offscreen renderer,
/// so all three agree on one geometry. Two player strips sandwich the board; the
/// controls sit beneath. The board is the window's width, squared.
enum BoardMetrics {
    static let minSide: CGFloat = 520
    static let stripHeight: CGFloat = 62
    static let controlsHeight: CGFloat = 152
    static var minWidth: CGFloat { minSide }
    static var minHeight: CGFloat { minSide + stripHeight * 2 + controlsHeight }
}

private enum UI {
    /// One gutter for every row (strips, status, buttons, options) so all left/right
    /// edges line up. Alignment is the cheapest way to look considered.
    static let edge: CGFloat = 20
    static let buttonRadius: CGFloat = 9
    static let buttonHeight: CGFloat = 34
    static let pieceScale: CGFloat = 0.94

    static let boardLight = Color(red: 236 / 255, green: 237 / 255, blue: 208 / 255)
    static let boardDark = Color(red: 111 / 255, green: 143 / 255, blue: 80 / 255)
    static let selected = Color(red: 246 / 255, green: 234 / 255, blue: 92 / 255)
    static let lastMove = Color(red: 246 / 255, green: 210 / 255, blue: 76 / 255).opacity(0.5)
    static let target = Color.black.opacity(0.24)

    // A single warm-neutral surface family + one accent. Restraint reads as polish.
    static let surface = Color(red: 243 / 255, green: 243 / 255, blue: 241 / 255)
    static let recessed = Color(red: 0, green: 0, blue: 0).opacity(0.055)
    static let neutralButton = Color(red: 227 / 255, green: 227 / 255, blue: 224 / 255)
    static let text = Color(red: 29 / 255, green: 29 / 255, blue: 31 / 255)
    static let secondaryText = Color(red: 107 / 255, green: 107 / 255, blue: 112 / 255)
    static let tertiaryText = Color(red: 156 / 255, green: 156 / 255, blue: 161 / 255)
    static let hairline = Color.black.opacity(0.10)
    static let accent = Color(red: 10 / 255, green: 132 / 255, blue: 255 / 255)
    static let dangerFill = Color(red: 236 / 255, green: 223 / 255, blue: 221 / 255)
    static let dangerText = Color(red: 176 / 255, green: 45 / 255, blue: 38 / 255)

    // Side-to-move accents.
    static let turnTint = accent.opacity(0.09)
    static let turnRing = accent

    static let humanAvatar = Color(red: 108 / 255, green: 114 / 255, blue: 124 / 255)

    /// A muted, stable avatar background for an agent with no photo — chosen by id so the
    /// same agent always looks the same, from a desaturated set that never clashes.
    static func agentTint(_ id: String) -> Color {
        let palette: [Color] = [
            Color(red: 0.36, green: 0.42, blue: 0.68),  // indigo
            Color(red: 0.24, green: 0.55, blue: 0.49),  // teal
            Color(red: 0.60, green: 0.42, blue: 0.62),  // plum
            Color(red: 0.74, green: 0.52, blue: 0.35),  // clay
            Color(red: 0.38, green: 0.48, blue: 0.55),  // steel
        ]
        var h = 5381
        for b in id.utf8 { h = ((h << 5) &+ h) &+ Int(b) }
        return palette[abs(h) % palette.count]
    }
}

/// What an avatar draws — the "no photo" case is a first-class state, not an accident.
private enum AvatarKind: Equatable {
    case photo(NSImage)
    case monogram(String, Color)
    case person(Color)
    case empty
}

struct BoardView: View {
    @ObservedObject var game: Game
    /// Offscreen render only: ImageRenderer can't rasterize a `Menu`, `Toggle`,
    /// `Picker`, `ScrollView`, or `LazyHStack`, so the preview swaps each for a static
    /// stand-in (the live app always runs with this false).
    var preview = false
    @State private var selected: Int?
    @State private var orientationWhite = true
    @State private var promo: (from: Int, to: Int)?

    private var bottomColor: Side { orientationWhite ? .w : .b }
    private var topColor: Side { orientationWhite ? .b : .w }

    // Real legal destinations for the selected piece — shown as dots in both modes.
    private var legalTargets: Set<Int> {
        guard let selected else { return [] }
        return Set(game.position.legalMoves(from: selected).map { $0.to })
    }

    // Taps drive a HUMAN seat only, on its turn. An agent seat plays over the CLI.
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

    private func playerStrip(color: Side) -> some View {
        let isTurn = game.status == "playing" && game.position.turn == color
        return Group {
            if preview {
                stripLabel(color: color, isTurn: isTurn)
            } else {
                Menu {
                    Button { game.chooseSeat(color, .human) } label: { Label("You", systemImage: "person.fill") }
                    if !game.agents.isEmpty {
                        Divider()
                        ForEach(game.agents) { a in
                            Button { game.chooseSeat(color, .agent(a.id)) } label: { Text(a.name) }
                        }
                    }
                    if game.seat(for: color) != .empty {
                        Divider()
                        Button(role: .destructive) { game.chooseSeat(color, .empty) } label: {
                            Label("Empty seat", systemImage: "person.slash")
                        }
                    }
                } label: {
                    stripLabel(color: color, isTurn: isTurn)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: BoardMetrics.stripHeight)
        .background(isTurn ? UI.turnTint : UI.surface)
    }

    private func stripLabel(color: Side, isTurn: Bool) -> some View {
        let info = seatInfo(color: color, isTurn: isTurn)
        return HStack(spacing: 13) {
            AvatarView(kind: info.kind, size: 44, ring: isTurn ? UI.turnRing : nil)
            VStack(alignment: .leading, spacing: 2) {
                Text(info.title)
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(info.titleColor)
                    .lineLimit(1)
                if let subtitle = info.subtitle {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(info.subtitleColor)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            colorChip(color)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(UI.tertiaryText)
        }
        .padding(.horizontal, UI.edge)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private struct SeatInfo {
        var title: String
        var titleColor: Color
        var subtitle: String?
        var subtitleColor: Color
        var kind: AvatarKind
    }

    private func seatInfo(color: Side, isTurn: Bool) -> SeatInfo {
        switch game.seat(for: color) {
        case .empty:
            return SeatInfo(title: "Choose player", titleColor: UI.tertiaryText,
                            subtitle: "tap to pick", subtitleColor: UI.tertiaryText,
                            kind: .empty)
        case .human:
            return SeatInfo(title: "You", titleColor: UI.text,
                            subtitle: isTurn ? "your move" : "human",
                            subtitleColor: isTurn ? UI.accent : UI.secondaryText,
                            kind: .person(UI.humanAvatar))
        case .agent(let id):
            guard let a = game.agent(forId: id) else {
                return SeatInfo(title: "Agent", titleColor: UI.text,
                                subtitle: "offline", subtitleColor: UI.tertiaryText,
                                kind: .monogram("?", UI.tertiaryText))
            }
            let kind: AvatarKind = AvatarCache.image(a.avatarPath).map { .photo($0) }
                ?? .monogram(String(a.name.prefix(1)).uppercased(), UI.agentTint(a.id))
            return SeatInfo(title: a.name, titleColor: UI.text,
                            subtitle: isTurn ? "thinking…" : (a.model ?? a.backend),
                            subtitleColor: isTurn ? UI.accent : UI.secondaryText,
                            kind: kind)
        }
    }

    private func colorChip(_ color: Side) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color == .w ? Color.white : Color(white: 0.17))
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
        .overlay(Rectangle().stroke(UI.hairline, lineWidth: 1))
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
        if let from = selected {
            // Chaos mode accepts any destination; strict mode only a legal one.
            let canLand = game.allowIllegal ? (sq != from) : legalTargets.contains(sq)
            if canLand {
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
        }

        if interactive, let piece = game.position.board[sq], piece.color == game.position.turn {
            selected = sq
        } else {
            selected = nil
        }
    }

    // MARK: - Controls

    private func controls(width: CGFloat) -> some View {
        VStack(spacing: 11) {
            // Row 1 — status (grows) + the game actions.
            HStack(spacing: 9) {
                Text(statusText)
                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                    .foregroundStyle(statusColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)

                actionButton("New Game", width: 104, tone: .primary, disabled: !game.seatsReady) {
                    startNewGame()
                }
                actionButton("Takeback", width: 88, tone: .neutral, disabled: game.history.isEmpty) {
                    game.takeback(1)
                }
                if game.hasHuman {
                    actionButton("Resign", width: 82, tone: .danger, disabled: game.status != "playing") {
                        try? game.resign(resignColor, by: .user)
                    }
                } else {
                    actionButton("End Game", width: 92, tone: .danger, disabled: game.status != "playing") {
                        game.endGame()
                    }
                }
            }
            .frame(height: UI.buttonHeight)

            // Row 2 — move history.
            movesRail

            // Row 3 — options (de-emphasized): the chaos switch + board perspective.
            optionsRow
        }
        .padding(.top, 13)
        .padding(.horizontal, UI.edge)
        .frame(width: width, height: BoardMetrics.controlsHeight, alignment: .top)
        .background(UI.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(UI.hairline).frame(height: 1)
        }
    }

    private var optionsRow: some View {
        HStack(spacing: 12) {
            if preview {
                HStack(spacing: 8) {
                    staticSwitch(game.allowIllegal)
                    Text("Allow illegal moves")
                        .font(.system(size: 12.5, weight: .medium, design: .rounded))
                        .foregroundStyle(UI.secondaryText)
                }
            } else {
                Toggle(isOn: $game.allowIllegal) {
                    Text("Allow illegal moves")
                        .font(.system(size: 12.5, weight: .medium, design: .rounded))
                        .foregroundStyle(UI.secondaryText)
                }
                .toggleStyle(.switch)
                .controlSize(.mini)
                .tint(UI.accent)
                .fixedSize()
            }

            Spacer(minLength: 10)

            Text("View")
                .font(.system(size: 12, weight: .medium, design: .rounded))
                .foregroundStyle(UI.tertiaryText)
            if preview {
                staticSegmented(orientationWhite)
            } else {
                Picker("", selection: $orientationWhite) {
                    Text("White").tag(true)
                    Text("Black").tag(false)
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                .controlSize(.small)
                .fixedSize()
            }
        }
        .frame(height: 22)
    }

    /// Reset to the start position with the current seats, orienting a lone human to the
    /// bottom. If White is an agent, `Game.newGame` wakes it to open.
    private func startNewGame() {
        if game.whiteSeat == .human && game.blackSeat != .human { orientationWhite = true }
        else if game.blackSeat == .human && game.whiteSeat != .human { orientationWhite = false }
        game.newGame()
    }

    /// Resign the human's side; in hotseat, resign the side to move.
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
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(width: width, height: UI.buttonHeight)
        }
        .buttonStyle(ArfButtonStyle(tone: tone, disabled: disabled))
        .disabled(disabled)
    }

    private var movesRail: some View {
        Group {
            if preview {
                HStack(spacing: 7) { movesContent }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 10)
                    .clipped()
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 7) { movesContent }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 10)
                }
                .scrollIndicators(.hidden)
            }
        }
        .frame(height: 38)
        .background(UI.recessed)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private var movesContent: some View {
        if movePairs.isEmpty {
            Text(game.status == "idle" ? "Moves will appear here" : "No moves yet")
                .font(.system(size: 13.5, weight: .medium, design: .rounded))
                .foregroundStyle(UI.tertiaryText)
                .frame(height: 38)
        } else {
            ForEach(movePairs, id: \.0) { number, white, black in
                HStack(spacing: 6) {
                    Text("\(number).")
                        .foregroundStyle(UI.tertiaryText)
                    Text(white.isEmpty ? "…" : white)
                        .foregroundStyle(UI.text)
                    if !black.isEmpty {
                        Text(black).foregroundStyle(UI.text)
                    }
                }
                .font(.system(size: 13.5, weight: .semibold, design: .monospaced))
                .lineLimit(1)
                .padding(.horizontal, 9)
                .frame(height: 28)
                .background(Color.white.opacity(0.7))
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
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
        case "idle": return game.seatsReady ? "Ready to start" : "Pick both players"
        case "checkmate": return "Checkmate — \(colorName(game.winner ?? .w)) wins"
        case "resigned": return "\(colorName(game.winner ?? .w)) wins"
        case "stalemate": return "Stalemate — draw"
        case "draw": return "Draw"
        case "ended": return "Game ended"
        default:
            return game.position.inCheck ? "\(colorName(game.position.turn)) — check"
                                         : "\(colorName(game.position.turn)) to move"
        }
    }

    private var statusColor: Color {
        switch game.status {
        case "idle": return game.seatsReady ? UI.text : UI.secondaryText
        case "checkmate", "resigned", "stalemate", "draw", "ended": return UI.text
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

    // MARK: - Static stand-ins for native controls (render/preview only)

    private func staticSwitch(_ on: Bool) -> some View {
        Capsule()
            .fill(on ? UI.accent : Color.black.opacity(0.20))
            .frame(width: 28, height: 16)
            .overlay(
                Circle().fill(.white).frame(width: 12, height: 12)
                    .offset(x: on ? 5.5 : -5.5)
            )
    }

    private func staticSegmented(_ leftSelected: Bool) -> some View {
        HStack(spacing: 0) {
            segCell("White", selected: leftSelected)
            Rectangle().fill(UI.hairline).frame(width: 1, height: 14)
            segCell("Black", selected: !leftSelected)
        }
        .background(RoundedRectangle(cornerRadius: 6).fill(UI.recessed))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(UI.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func segCell(_ title: String, selected: Bool) -> some View {
        Text(title)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(selected ? UI.text : UI.secondaryText)
            .frame(width: 52, height: 22)
            .background(selected ? Color.white : Color.clear)
    }
}

// MARK: - Avatar

private struct AvatarView: View {
    let kind: AvatarKind
    let size: CGFloat
    let ring: Color?

    var body: some View {
        ZStack {
            switch kind {
            case .photo(let img):
                Image(nsImage: img).resizable().scaledToFill()
            case .monogram(let mono, let tint):
                tint
                Text(mono)
                    .font(.system(size: size * 0.40, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            case .person(let tint):
                tint
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(.white)
            case .empty:
                Color.clear
                Image(systemName: "plus")
                    .font(.system(size: size * 0.34, weight: .bold))
                    .foregroundStyle(UI.tertiaryText)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay {
            if kind == .empty {
                Circle().strokeBorder(UI.tertiaryText.opacity(0.7),
                                      style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            } else {
                Circle().stroke(Color.black.opacity(0.10), lineWidth: 1)
            }
        }
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
            .opacity(disabled ? 0.42 : 1)
            .scaleEffect(configuration.isPressed && !disabled ? 0.98 : 1)
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
        case .primary: return Color.white.opacity(0.18)
        case .neutral: return Color.black.opacity(0.06)
        case .danger: return UI.dangerText.opacity(0.14)
        }
    }

    private func background(_ pressed: Bool) -> Color {
        let base: Color
        switch tone {
        case .primary: base = UI.accent
        case .neutral: base = UI.neutralButton
        case .danger: base = UI.dangerFill
        }
        return pressed && !disabled ? base.opacity(0.78) : base
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
                .offset(y: side * 0.012)
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
