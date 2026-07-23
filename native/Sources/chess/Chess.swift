import Foundation

// A compact, self-contained chess engine: legal move generation, make-move,
// check/mate/stalemate detection, FEN, and SAN. No dependencies. Squares are
// indexed 0..63 with 0 = a1, 7 = h1, 56 = a8, 63 = h8 (file = idx % 8,
// rank = idx / 8). This is the "daemon's" rules authority.

enum Side: String, Codable { case w, b
    var other: Side { self == .w ? .b : .w }
}

enum PieceType: String, Codable { case p, n, b, r, q, k }

struct Piece: Equatable, Codable {
    var color: Side
    var type: PieceType
}

struct Move: Equatable {
    var from: Int
    var to: Int
    var promotion: PieceType? = nil
    var isEnPassant: Bool = false
    var isCastle: Bool = false       // king two-square move
    var isDoublePawn: Bool = false
}

func fileOf(_ s: Int) -> Int { s % 8 }
func rankOf(_ s: Int) -> Int { s / 8 }
func squareName(_ s: Int) -> String {
    let files = "abcdefgh"
    let f = files[files.index(files.startIndex, offsetBy: fileOf(s))]
    return "\(f)\(rankOf(s) + 1)"
}
func parseSquare(_ name: String) -> Int? {
    let chars = Array(name.lowercased())
    guard chars.count == 2,
          let f = "abcdefgh".firstIndex(of: chars[0]),
          let r = Int(String(chars[1])), r >= 1, r <= 8 else { return nil }
    let file = "abcdefgh".distance(from: "abcdefgh".startIndex, to: f)
    return (r - 1) * 8 + file
}

struct Position {
    var board: [Piece?]
    var turn: Side
    // Castling rights: white king/queen side, black king/queen side.
    var castleWK = false, castleWQ = false, castleBK = false, castleBQ = false
    var enPassant: Int? = nil   // target square behind a double-pushed pawn
    var halfmove = 0            // for 50-move rule
    var fullmove = 1

    static let start: Position = {
        var b = [Piece?](repeating: nil, count: 64)
        let back: [PieceType] = [.r, .n, .b, .q, .k, .b, .n, .r]
        for f in 0..<8 {
            b[f] = Piece(color: .w, type: back[f])
            b[8 + f] = Piece(color: .w, type: .p)
            b[48 + f] = Piece(color: .b, type: .p)
            b[56 + f] = Piece(color: .b, type: back[f])
        }
        return Position(board: b, turn: .w,
                        castleWK: true, castleWQ: true, castleBK: true, castleBQ: true)
    }()
}

// MARK: - Attack detection

extension Position {
    func kingSquare(_ color: Side) -> Int? {
        board.firstIndex { $0 == Piece(color: color, type: .k) }
    }

    // Is `sq` attacked by any piece of `by`?
    func isAttacked(_ sq: Int, by color: Side) -> Bool {
        let f = fileOf(sq), r = rankOf(sq)
        // Pawn attacks (a `color` pawn attacks diagonally forward).
        let dir = color == .w ? 1 : -1
        for df in [-1, 1] {
            let af = f + df, ar = r - dir   // square a pawn would sit to attack sq
            if af >= 0, af < 8, ar >= 0, ar < 8 {
                if board[ar * 8 + af] == Piece(color: color, type: .p) { return true }
            }
        }
        // Knight attacks.
        let kn = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]
        for (dr, dfn) in kn {
            let nf = f + dfn, nr = r + dr
            if nf >= 0, nf < 8, nr >= 0, nr < 8 {
                if board[nr * 8 + nf] == Piece(color: color, type: .n) { return true }
            }
        }
        // King attacks.
        for dr in -1...1 { for dfn in -1...1 where !(dr == 0 && dfn == 0) {
            let nf = f + dfn, nr = r + dr
            if nf >= 0, nf < 8, nr >= 0, nr < 8 {
                if board[nr * 8 + nf] == Piece(color: color, type: .k) { return true }
            }
        }}
        // Sliding: bishops/queens (diagonal), rooks/queens (orthogonal).
        let diag = [(-1,-1),(-1,1),(1,-1),(1,1)]
        let orth = [(-1,0),(1,0),(0,-1),(0,1)]
        for (dr, dfn) in diag {
            if slideHit(f, r, dr, dfn, color, [.b, .q]) { return true }
        }
        for (dr, dfn) in orth {
            if slideHit(f, r, dr, dfn, color, [.r, .q]) { return true }
        }
        return false
    }

    private func slideHit(_ f: Int, _ r: Int, _ dr: Int, _ df: Int,
                          _ color: Side, _ types: [PieceType]) -> Bool {
        var nf = f + df, nr = r + dr
        while nf >= 0, nf < 8, nr >= 0, nr < 8 {
            if let p = board[nr * 8 + nf] {
                if p.color == color, types.contains(p.type) { return true }
                return false
            }
            nf += df; nr += dr
        }
        return false
    }

    var inCheck: Bool {
        guard let k = kingSquare(turn) else { return false }
        return isAttacked(k, by: turn.other)
    }
}

// MARK: - Move generation

extension Position {
    // Apply a pseudo-legal move, returning the new position (no legality check).
    func make(_ m: Move) -> Position {
        var p = self
        let moving = board[m.from]!
        p.enPassant = nil
        p.board[m.from] = nil

        if m.isEnPassant {
            // Captured pawn sits behind the destination.
            let capSq = m.to + (moving.color == .w ? -8 : 8)
            p.board[capSq] = nil
        }
        // Place piece (with promotion).
        if let promo = m.promotion {
            p.board[m.to] = Piece(color: moving.color, type: promo)
        } else {
            p.board[m.to] = moving
        }
        // Castling rook move.
        if m.isCastle {
            let rank = rankOf(m.from) * 8
            if m.to == rank + 6 {        // king side
                p.board[rank + 5] = p.board[rank + 7]
                p.board[rank + 7] = nil
            } else if m.to == rank + 2 { // queen side
                p.board[rank + 3] = p.board[rank + 0]
                p.board[rank + 0] = nil
            }
        }
        if m.isDoublePawn {
            p.enPassant = (m.from + m.to) / 2
        }
        // Update castling rights.
        if moving.type == .k {
            if moving.color == .w { p.castleWK = false; p.castleWQ = false }
            else { p.castleBK = false; p.castleBQ = false }
        }
        func touch(_ sq: Int) {
            if sq == 0 { p.castleWQ = false }
            if sq == 7 { p.castleWK = false }
            if sq == 56 { p.castleBQ = false }
            if sq == 63 { p.castleBK = false }
        }
        touch(m.from); touch(m.to)

        p.halfmove = (moving.type == .p || board[m.to] != nil || m.isEnPassant) ? 0 : p.halfmove + 1
        if turn == .b { p.fullmove += 1 }
        p.turn = turn.other
        return p
    }

    // Legal moves: pseudo-legal filtered so the mover's king isn't left in check.
    func legalMoves() -> [Move] {
        pseudoMoves().filter { m in
            let after = make(m)
            if let k = after.kingSquare(turn) {
                return !after.isAttacked(k, by: turn.other)
            }
            return false
        }
    }

    func legalMoves(from sq: Int) -> [Move] { legalMoves().filter { $0.from == sq } }

    private func pseudoMoves() -> [Move] {
        var moves: [Move] = []
        for sq in 0..<64 {
            guard let p = board[sq], p.color == turn else { continue }
            let f = fileOf(sq), r = rankOf(sq)
            switch p.type {
            case .p: pawnMoves(sq, f, r, p.color, &moves)
            case .n:
                for (dr, df) in [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)] {
                    addIfTarget(sq, f + df, r + dr, &moves)
                }
            case .k:
                for dr in -1...1 { for df in -1...1 where !(dr == 0 && df == 0) {
                    addIfTarget(sq, f + df, r + dr, &moves)
                }}
                castleMoves(sq, p.color, &moves)
            case .b: slide(sq, f, r, [(-1,-1),(-1,1),(1,-1),(1,1)], &moves)
            case .r: slide(sq, f, r, [(-1,0),(1,0),(0,-1),(0,1)], &moves)
            case .q: slide(sq, f, r, [(-1,-1),(-1,1),(1,-1),(1,1),(-1,0),(1,0),(0,-1),(0,1)], &moves)
            }
        }
        return moves
    }

    private func addIfTarget(_ from: Int, _ nf: Int, _ nr: Int, _ moves: inout [Move]) {
        guard nf >= 0, nf < 8, nr >= 0, nr < 8 else { return }
        let to = nr * 8 + nf
        if let t = board[to], t.color == turn { return }
        moves.append(Move(from: from, to: to))
    }

    private func slide(_ from: Int, _ f: Int, _ r: Int,
                       _ dirs: [(Int, Int)], _ moves: inout [Move]) {
        for (dr, df) in dirs {
            var nf = f + df, nr = r + dr
            while nf >= 0, nf < 8, nr >= 0, nr < 8 {
                let to = nr * 8 + nf
                if let t = board[to] {
                    if t.color != turn { moves.append(Move(from: from, to: to)) }
                    break
                }
                moves.append(Move(from: from, to: to))
                nf += df; nr += dr
            }
        }
    }

    private func pawnMoves(_ sq: Int, _ f: Int, _ r: Int, _ color: Side, _ moves: inout [Move]) {
        let dir = color == .w ? 1 : -1
        let startRank = color == .w ? 1 : 6
        let promoRank = color == .w ? 7 : 0
        let oneR = r + dir
        guard oneR >= 0, oneR < 8 else { return }
        let one = oneR * 8 + f
        if board[one] == nil {
            addPawn(sq, one, oneR == promoRank, false, false, &moves)
            if r == startRank {
                let two = (r + 2 * dir) * 8 + f
                if board[two] == nil {
                    moves.append(Move(from: sq, to: two, isDoublePawn: true))
                }
            }
        }
        for df in [-1, 1] {
            let nf = f + df
            guard nf >= 0, nf < 8 else { continue }
            let to = oneR * 8 + nf
            if let t = board[to], t.color != color {
                addPawn(sq, to, oneR == promoRank, false, false, &moves)
            } else if enPassant == to {
                moves.append(Move(from: sq, to: to, isEnPassant: true))
            }
        }
    }

    private func addPawn(_ from: Int, _ to: Int, _ promo: Bool,
                         _ ep: Bool, _ dbl: Bool, _ moves: inout [Move]) {
        if promo {
            for t in [PieceType.q, .r, .b, .n] {
                moves.append(Move(from: from, to: to, promotion: t))
            }
        } else {
            moves.append(Move(from: from, to: to))
        }
    }

    private func castleMoves(_ sq: Int, _ color: Side, _ moves: inout [Move]) {
        let rank = (color == .w ? 0 : 7) * 8
        guard sq == rank + 4 else { return }       // king on its home square
        guard !isAttacked(sq, by: color.other) else { return }  // not in check
        let (kSide, qSide) = color == .w ? (castleWK, castleWQ) : (castleBK, castleBQ)
        if kSide, board[rank + 5] == nil, board[rank + 6] == nil,
           board[rank + 7] == Piece(color: color, type: .r),
           !isAttacked(rank + 5, by: color.other), !isAttacked(rank + 6, by: color.other) {
            moves.append(Move(from: sq, to: rank + 6, isCastle: true))
        }
        if qSide, board[rank + 3] == nil, board[rank + 2] == nil, board[rank + 1] == nil,
           board[rank + 0] == Piece(color: color, type: .r),
           !isAttacked(rank + 3, by: color.other), !isAttacked(rank + 2, by: color.other) {
            moves.append(Move(from: sq, to: rank + 2, isCastle: true))
        }
    }
}

// MARK: - SAN + FEN

extension Position {
    func san(for m: Move) -> String {
        let piece = board[m.from]!
        if m.isCastle { return m.to > m.from ? "O-O" : "O-O-O" }
        let isCapture = board[m.to] != nil || m.isEnPassant
        var s = ""
        if piece.type == .p {
            if isCapture { s += String("abcdefgh"[String.Index(utf16Offset: fileOf(m.from), in: "abcdefgh")]) + "x" }
            s += squareName(m.to)
            if let promo = m.promotion { s += "=" + promo.rawValue.uppercased() }
        } else {
            s += piece.type.rawValue.uppercased()
            // Disambiguation: other same-type pieces that can also reach `to`.
            let others = legalMoves().filter {
                $0.to == m.to && $0.from != m.from &&
                board[$0.from]?.type == piece.type
            }
            if !others.isEmpty {
                let sameFile = others.contains { fileOf($0.from) == fileOf(m.from) }
                let sameRank = others.contains { rankOf($0.from) == rankOf(m.from) }
                if !sameFile { s += String(squareName(m.from).first!) }
                else if !sameRank { s += String(squareName(m.from).last!) }
                else { s += squareName(m.from) }
            }
            if isCapture { s += "x" }
            s += squareName(m.to)
        }
        let after = make(m)
        if let k = after.kingSquare(after.turn), after.isAttacked(k, by: after.turn.other) {
            s += after.legalMoves().isEmpty ? "#" : "+"
        }
        return s
    }

    var fen: String {
        var rows: [String] = []
        for r in stride(from: 7, through: 0, by: -1) {
            var row = "", empty = 0
            for f in 0..<8 {
                if let p = board[r * 8 + f] {
                    if empty > 0 { row += "\(empty)"; empty = 0 }
                    let c = p.type.rawValue
                    row += p.color == .w ? c.uppercased() : c
                } else { empty += 1 }
            }
            if empty > 0 { row += "\(empty)" }
            rows.append(row)
        }
        let placement = rows.joined(separator: "/")
        var castle = ""
        if castleWK { castle += "K" }; if castleWQ { castle += "Q" }
        if castleBK { castle += "k" }; if castleBQ { castle += "q" }
        if castle.isEmpty { castle = "-" }
        let ep = enPassant.map { squareName($0) } ?? "-"
        return "\(placement) \(turn.rawValue) \(castle) \(ep) \(halfmove) \(fullmove)"
    }

    enum Outcome: String { case ongoing, checkmate, stalemate, draw }
    var outcome: Outcome {
        if legalMoves().isEmpty { return inCheck ? .checkmate : .stalemate }
        if halfmove >= 100 { return .draw }
        // Insufficient material (K vs K, K+minor vs K).
        let pieces = board.compactMap { $0 }.filter { $0.type != .k }
        if pieces.isEmpty { return .draw }
        if pieces.count == 1, pieces[0].type == .n || pieces[0].type == .b { return .draw }
        return .ongoing
    }
}
