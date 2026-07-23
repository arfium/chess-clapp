import SwiftUI

// The human's surface, in the Clatch design language (see Theme.swift). It observes
// AppState and calls the SAME methods the CLI calls — so a move the agent makes via
// `chess move` animates here instantly, and a move the human makes reaches the agent
// as a `move` signal (declared `run`). "Share state, not screens."

private let pieceGlyph: [PieceType: String] = [.k: "♚", .q: "♛", .r: "♜", .b: "♝", .n: "♞", .p: "♟"]

private enum Board {
    static let light = Color(red: 235 / 255, green: 236 / 255, blue: 208 / 255)
    static let dark = Color(red: 115 / 255, green: 149 / 255, blue: 82 / 255)
    static let lastMove = Color(red: 246 / 255, green: 234 / 255, blue: 112 / 255).opacity(0.55)
    static let selected = Palette.volt
    static let target = Color.black.opacity(0.22)
    static let check = Palette.hazard.opacity(0.55)
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

    private var checkSquare: Int? {
        guard state.status == "playing", state.position.inCheck else { return nil }
        return state.position.kingSquare(state.position.turn)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            header
            board
            controls
            if !state.history.isEmpty { movesPanel }
            if let note = state.note {
                Panel("Note from agent", trailing: AnyView(Badge("say", tone: .volt))) {
                    Text(note).font(.jakarta(13, .medium)).foregroundStyle(Palette.fg)
                        .textSelection(.enabled)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Space.s5)
        .frame(minWidth: 460, minHeight: 580)
        .background(Palette.bg)
        .sheet(isPresented: Binding(get: { promo != nil }, set: { if !$0 { promo = nil } })) { promoPicker }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: Space.s3) {
            RoundedRectangle(cornerRadius: Radius.inner, style: .continuous)
                .fill(Palette.volt)
                .frame(width: 26, height: 26)
                .overlay(Text("♞").font(.system(size: 16)).foregroundStyle(Palette.space))
            VStack(alignment: .leading, spacing: 1) {
                Text(statusText).font(.jakarta(18, .bold)).tracking(-0.3).foregroundStyle(Palette.fg)
                Text(subText).font(.jakarta(11, .regular)).foregroundStyle(Palette.fgDim)
            }
            Spacer()
        }
    }

    private var statusText: String {
        switch state.status {
        case "idle": return "New game"
        case "checkmate": return "Checkmate — \(colorName(state.winner ?? .w)) wins"
        case "resigned": return "\(colorName(state.winner ?? .w)) wins"
        case "stalemate": return "Stalemate — draw"
        case "draw": return "Draw"
        default: return "\(colorName(state.position.turn)) to move" + (state.position.inCheck ? " · Check" : "")
        }
    }

    private var subText: String {
        state.status == "playing"
            ? "You: \(colorName(state.humanColor)) · agent: \(colorName(state.agentColor))"
            : "Pick a side — the agent plays the other and responds via its CLI"
    }

    // MARK: Board

    private var board: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            let cell = side / 8
            let ranks = orientationWhite ? Array((0..<8).reversed()) : Array(0..<8)
            let files = orientationWhite ? Array(0..<8) : Array((0..<8).reversed())
            VStack(spacing: 0) {
                ForEach(ranks, id: \.self) { r in
                    HStack(spacing: 0) {
                        ForEach(files, id: \.self) { f in
                            squareCell(r * 8 + f, cell: cell)
                        }
                    }
                }
            }
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: Radius.nest, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.nest, style: .continuous).stroke(Palette.line, lineWidth: 1))
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func squareCell(_ sq: Int, cell: CGFloat) -> some View {
        let light = (fileOf(sq) + rankOf(sq)) % 2 == 1
        let piece = state.position.board[sq]
        let isTarget = legalTargets.contains(sq)
        let isLast = state.lastMove.map { $0.from == sq || $0.to == sq } ?? false
        return ZStack {
            Rectangle().fill(light ? Board.light : Board.dark)
            if isLast { Board.lastMove }
            if checkSquare == sq { Board.check }
            if selected == sq { Rectangle().stroke(Board.selected, lineWidth: 3).padding(1.5) }
            if isTarget {
                if piece == nil {
                    Circle().fill(Board.target).frame(width: cell * 0.28, height: cell * 0.28)
                } else {
                    Circle().stroke(Board.target, lineWidth: cell * 0.09).padding(cell * 0.06)
                }
            }
            if let piece {
                Text(pieceGlyph[piece.type] ?? "?")
                    .font(.system(size: cell * 0.82))
                    .foregroundStyle(piece.color == .w ? Color.white : Color(white: 0.10))
                    .shadow(color: piece.color == .w ? .black.opacity(0.45) : .white.opacity(0.35), radius: 0.5)
            }
        }
        .frame(width: cell, height: cell)
        .contentShape(Rectangle())
        .onTapGesture { tap(sq) }
    }

    private func tap(_ sq: Int) {
        if let from = selected, legalTargets.contains(sq) {
            if let p = state.position.board[from], p.type == .p, rankOf(sq) == 7 || rankOf(sq) == 0 {
                promo = (from, sq); selected = nil; return
            }
            try? state.move(from: from, to: sq, promo: nil, by: .user)
            selected = nil
            return
        }
        if interactive, let p = state.position.board[sq], p.color == state.humanColor {
            selected = sq
        } else {
            selected = nil
        }
    }

    // MARK: Controls

    private var controls: some View {
        HStack(spacing: Space.s2) {
            Button("Play White") { state.newGame(humanColor: .w); orientationWhite = true; selected = nil }
                .buttonStyle(VoltButtonStyle())
            Button("Play Black") { state.newGame(humanColor: .b); orientationWhite = false; selected = nil }
                .buttonStyle(GhostButtonStyle())
            Spacer()
            Button { try? state.resign(state.humanColor, by: .user) } label: { Text("Resign") }
                .buttonStyle(GhostButtonStyle())
                .disabled(state.status != "playing")
            Button { state.takeback(1); selected = nil } label: { Text("Takeback") }
                .buttonStyle(GhostButtonStyle())
                .disabled(state.history.isEmpty)
            Button { orientationWhite.toggle() } label: { Text("⇅") }
                .buttonStyle(GhostButtonStyle())
        }
    }

    private var movesPanel: some View {
        Panel("Moves") {
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(movePairs, id: \.0) { n, w, b in
                        HStack(spacing: Space.s3) {
                            Text("\(n).").foregroundStyle(Palette.fgMute).frame(width: 26, alignment: .trailing)
                            Text(w).foregroundStyle(Palette.fg).frame(width: 64, alignment: .leading)
                            Text(b).foregroundStyle(Palette.fg).frame(width: 64, alignment: .leading)
                        }.font(.jakarta(12, .medium)).monospacedDigit()
                    }
                }
            }.frame(maxHeight: 120)
        }
    }

    private var promoPicker: some View {
        VStack(spacing: Space.s4) {
            Eyebrow("Promote to")
            HStack(spacing: Space.s3) {
                ForEach([PieceType.q, .r, .b, .n], id: \.self) { t in
                    Button {
                        if let pr = promo { try? state.move(from: pr.from, to: pr.to, promo: t, by: .user) }
                        promo = nil
                    } label: {
                        Text(pieceGlyph[t] ?? "?").font(.system(size: 30)).foregroundStyle(Palette.fg)
                    }.buttonStyle(GhostButtonStyle())
                }
            }
        }.padding(Space.s5).background(Palette.panel)
    }

    private var movePairs: [(Int, String, String)] {
        var pairs: [(Int, String, String)] = []
        for (i, m) in state.history.enumerated() {
            let idx = i / 2
            if idx >= pairs.count { pairs.append((idx + 1, "", "")) }
            if m.color == "w" { pairs[idx].1 = m.san } else { pairs[idx].2 = m.san }
        }
        return pairs
    }

    private func colorName(_ c: Side) -> String { c == .w ? "White" : "Black" }
}
