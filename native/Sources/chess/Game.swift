import Foundation
import Combine

// The single source of truth (the "daemon"'s state). SwiftUI observes it; the
// socket server and the GUI both mutate it through the same methods, so the two
// surfaces never drift. Main-actor isolated: all mutation happens on the UI thread.

enum Actor { case user, agent }

@MainActor
final class Game: ObservableObject {
    @Published private(set) var position = Position.start
    @Published private(set) var history: [MoveDTO] = []
    @Published private(set) var status: String = "idle"
    @Published private(set) var humanColor: Side = .w
    @Published private(set) var result: String? = nil
    @Published private(set) var winner: Side? = nil
    @Published private(set) var lastMove: (from: Int, to: Int)? = nil
    @Published private(set) var coach: String? = nil

    // Past positions for takeback.
    private var stack: [Position] = []

    // Fire-and-forget signal to Clatch (app→agent), set by the app delegate.
    // Only USER actions signal — the agent already knows about its own moves.
    var onSignal: ((String, [String: String]) -> Void)?

    var agentColor: Side { humanColor.other }

    // MARK: Commands

    func newGame(humanColor: Side) {
        self.humanColor = humanColor
        position = .start
        history = []
        stack = []
        status = "playing"
        result = nil
        winner = nil
        lastMove = nil
        coach = nil
    }

    enum MoveError: Error, CustomStringConvertible {
        case notPlaying, notYourTurn, illegal
        var description: String {
            switch self {
            case .notPlaying: return "no game in progress — start one with `new`"
            case .notYourTurn: return "not your turn"
            case .illegal: return "illegal move"
            }
        }
    }

    func move(from: Int, to: Int, promo: PieceType?, by actor: Actor) throws {
        guard status == "playing" else { throw MoveError.notPlaying }
        let mover: Side = (actor == .user) ? humanColor : agentColor
        guard position.turn == mover else { throw MoveError.notYourTurn }

        let legal = position.legalMoves(from: from).filter { $0.to == to }
        guard !legal.isEmpty else { throw MoveError.illegal }
        // Pick the matching move (resolve promotion).
        let chosen: Move
        if let promo = promo, let m = legal.first(where: { $0.promotion == promo }) {
            chosen = m
        } else if let m = legal.first(where: { $0.promotion == nil }) {
            chosen = m
        } else {
            chosen = legal.first(where: { $0.promotion == .q }) ?? legal[0]
        }

        let san = position.san(for: chosen)
        let ply = history.count + 1
        let movingColor = position.turn
        stack.append(position)
        position = position.make(chosen)
        history.append(MoveDTO(ply: ply, color: movingColor.rawValue, san: san,
                               from: squareName(from), to: squareName(to)))
        lastMove = (from, to)
        coach = nil
        updateStatusAfterMove(mover: movingColor)

        // `position` (buffered) rides after EVERY move (user or agent): the current
        // board sits in the agent's chat buffer, so when the human asks "best move?"
        // the agent receives the live position + the question as one input, exactly
        // when asked (reference/signals.md § buffered). Latest wins; ten moves leave
        // one entry, the live one.
        onSignal?("position", ["fen": position.fen, "last": san])
        // A USER move is the reactive trigger: `move` (run) starts the agent's turn.
        // The agent's own moves never trigger a turn (it already knows them).
        if actor == .user {
            onSignal?("move", ["san": san])
            if status != "playing" {
                onSignal?("game.over", ["status": status, "result": result ?? ""])
            }
        }
    }

    private func updateStatusAfterMove(mover: Side) {
        switch position.outcome {
        case .checkmate:
            status = "checkmate"; winner = mover
            result = mover == .w ? "1-0" : "0-1"
        case .stalemate:
            status = "stalemate"; winner = nil; result = "1/2-1/2"
        case .draw:
            status = "draw"; winner = nil; result = "1/2-1/2"
        case .ongoing:
            status = "playing"
        }
    }

    func resign(_ color: Side, by actor: Actor) throws {
        guard status == "playing" else { throw MoveError.notPlaying }
        status = "resigned"
        winner = color.other
        result = color == .w ? "0-1" : "1-0"
        if actor == .user {
            onSignal?("game.over", [
                "status": status,
                "result": result ?? "",
                "winner": winner?.rawValue ?? "",
            ])
        }
    }

    func takeback(_ n: Int) {
        let count = min(max(n, 1), stack.count)
        guard count > 0 else { return }
        for _ in 0..<count {
            position = stack.removeLast()
            if !history.isEmpty { history.removeLast() }
        }
        status = "playing"
        result = nil
        winner = nil
        lastMove = history.last.flatMap { mv in
            if let f = parseSquare(mv.from), let t = parseSquare(mv.to) { return (f, t) }
            return nil
        }
    }

    func setCoach(_ text: String) { coach = text }

    // MARK: Snapshot

    func snapshot() -> StateDTO {
        var dto = StateDTO(
            status: status,
            turn: position.turn.rawValue,
            humanColor: humanColor.rawValue,
            agentColor: agentColor.rawValue,
            inCheck: status == "playing" && position.inCheck,
            result: result,
            winner: winner?.rawValue,
            fen: position.fen,
            ascii: ascii(),
            moves: history,
            lastMove: history.last.map { ["from": $0.from, "to": $0.to, "san": $0.san] },
            coach: coach
        )
        if status == "idle" { dto.inCheck = false }
        return dto
    }

    func legalList(from sq: Int?) -> [[String: String]] {
        let moves = sq != nil ? position.legalMoves(from: sq!) : position.legalMoves()
        return moves.map { m in
            ["from": squareName(m.from), "to": squareName(m.to), "san": position.san(for: m)]
        }
    }

    private func ascii() -> String {
        var lines: [String] = []
        for r in stride(from: 7, through: 0, by: -1) {
            var cells: [String] = ["\(r + 1)"]
            for f in 0..<8 {
                if let p = position.board[r * 8 + f] {
                    cells.append(p.color == .w ? p.type.rawValue.uppercased() : p.type.rawValue)
                } else { cells.append(".") }
            }
            lines.append(cells.joined(separator: " "))
        }
        lines.append("  a b c d e f g h")
        return lines.joined(separator: "\n")
    }
}
