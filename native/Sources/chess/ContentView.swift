import AppKit
import SwiftUI

private enum UI {
    static let minSide: CGFloat = 680
    static let controlsHeight: CGFloat = 148
    static let outerRadius: CGFloat = 14
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
    static let separator = Color.black.opacity(0.11)
    static let blue = Color(red: 0 / 255, green: 122 / 255, blue: 255 / 255)
    static let dangerFill = Color(red: 235 / 255, green: 220 / 255, blue: 217 / 255)
    static let dangerText = Color(red: 132 / 255, green: 36 / 255, blue: 33 / 255)
}

struct ContentView: View {
    @ObservedObject var state: AppState
    @State private var selected: Int?
    @State private var orientationWhite = true
    @State private var promo: (from: Int, to: Int)?

    private var legalTargets: Set<Int> {
        guard let selected else { return [] }
        return Set(state.position.legalMoves(from: selected).map { $0.to })
    }

    private var interactive: Bool {
        state.status == "playing" && state.position.turn == state.humanColor
    }

    var body: some View {
        GeometryReader { proxy in
            let side = max(UI.minSide, proxy.size.width)

            VStack(spacing: 0) {
                board(side: side)
                controls(width: side)
            }
            .frame(width: side, height: side + UI.controlsHeight, alignment: .top)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(UI.surface)
        }
        .frame(minWidth: UI.minSide, minHeight: UI.minSide + UI.controlsHeight)
        .background(UI.surface)
        .sheet(isPresented: Binding(get: { promo != nil }, set: { if !$0 { promo = nil } })) {
            promoPicker
        }
    }

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
        .clipShape(boardShape)
        .overlay {
            boardShape.stroke(Color.black.opacity(0.12), lineWidth: 1)
        }
    }

    private var boardShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            cornerRadii: RectangleCornerRadii(
                topLeading: UI.outerRadius,
                bottomLeading: 0,
                bottomTrailing: 0,
                topTrailing: UI.outerRadius
            ),
            style: .continuous
        )
    }

    private var controlsShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            cornerRadii: RectangleCornerRadii(
                topLeading: 0,
                bottomLeading: UI.outerRadius,
                bottomTrailing: UI.outerRadius,
                topTrailing: 0
            ),
            style: .continuous
        )
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
        let piece = state.position.board[sq]
        let isSelected = selected == sq
        let isTarget = legalTargets.contains(sq)
        let isLast = state.lastMove.map { $0.from == sq || $0.to == sq } ?? false

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
            if let piece = state.position.board[from], piece.type == .p,
               rankOf(sq) == 7 || rankOf(sq) == 0 {
                promo = (from, sq)
                selected = nil
                return
            }
            try? state.move(from: from, to: sq, promo: nil, by: .user)
            selected = nil
            return
        }

        if interactive, let piece = state.position.board[sq], piece.color == state.humanColor {
            selected = sq
        } else {
            selected = nil
        }
    }

    private func controls(width: CGFloat) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 14) {
                statusBlock
                    .frame(width: 154, alignment: .leading)

                Rectangle()
                    .fill(UI.separator)
                    .frame(width: 1, height: 44)

                HStack(spacing: 8) {
                    actionButton("Play White", width: 100, tone: .primary) {
                        state.newGame(humanColor: .w)
                        orientationWhite = true
                    }
                    actionButton("Play Black", width: 100, tone: .neutral) {
                        state.newGame(humanColor: .b)
                        orientationWhite = false
                    }
                    actionButton("Takeback", width: 92, tone: .neutral, disabled: state.history.isEmpty) {
                        state.takeback(1)
                    }
                    actionButton("Resign", width: 76, tone: .danger, disabled: state.status != "playing") {
                        try? state.resign(state.humanColor, by: .user)
                    }
                    Button {
                        orientationWhite.toggle()
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 40, height: UI.buttonHeight)
                    }
                    .buttonStyle(ArfButtonStyle(tone: .neutral, disabled: false))
                    .help("Flip board")
                }
                .fixedSize(horizontal: true, vertical: false)

                Spacer(minLength: 0)
            }
            .frame(height: 48)

            HStack(spacing: 14) {
                Text("Moves")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(UI.secondaryText)
                    .frame(width: 64, alignment: .leading)
                movesRail
            }
            .frame(height: 42)
        }
        .padding(.top, 14)
        .padding(.horizontal, UI.controlPadding)
        .frame(width: width, height: UI.controlsHeight, alignment: .top)
        .background(controlsShape.fill(UI.surface))
        .clipShape(controlsShape)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(UI.separator)
                .frame(height: 1)
        }
    }

    private var statusBlock: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(statusText)
                .font(.system(size: 19, weight: .semibold, design: .rounded))
                .foregroundStyle(UI.text)
                .lineLimit(1)
                .minimumScaleFactor(0.82)

            Text(colorSummary)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(UI.secondaryText)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
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

    private var movesRail: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 7) {
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
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        .frame(height: 40)
        .padding(.horizontal, 12)
        .background(UI.recessed.opacity(0.64))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private var promoPicker: some View {
        HStack(spacing: 16) {
            ForEach([PieceType.q, .r, .b, .n], id: \.self) { type in
                Button {
                    if let promo {
                        try? state.move(from: promo.from, to: promo.to, promo: type, by: .user)
                    }
                    promo = nil
                } label: {
                    PieceIcon(piece: Piece(color: state.humanColor, type: type), side: 68)
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
        switch state.status {
        case "idle": return "Start a game"
        case "checkmate": return "Checkmate: \(colorName(state.winner ?? .w)) wins"
        case "resigned": return "\(colorName(state.winner ?? .w)) wins"
        case "stalemate": return "Stalemate"
        case "draw": return "Draw"
        default:
            return "\(colorName(state.position.turn)) to move" + (state.position.inCheck ? " - check" : "")
        }
    }

    private var colorSummary: String {
        state.status == "idle"
            ? "Choose your side"
            : "You: \(colorName(state.humanColor))   Agent: \(colorName(state.agentColor))"
    }

    private var movePairs: [(Int, String, String)] {
        var pairs: [(Int, String, String)] = []
        for (index, move) in state.history.enumerated() {
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
