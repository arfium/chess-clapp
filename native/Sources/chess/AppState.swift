import Foundation
import Combine

// ─────────────────────────────────────────────────────────────────────────────
// The app's single source of truth — the game (share state, not screens).
// Both surfaces mutate it through the SAME methods:
//   • the GUI (the human), via SwiftUI actions in ContentView
//   • the CLI (the agent), via the socket handler in main.swift
// so the two never drift. @MainActor-isolated: all mutation on the UI thread;
// the socket server hops to the main actor before calling in.
//
// A user move fires `move` (declared `run` → wakes the agent to take its turn); a
// game ending fires `game.over` (declared `context`). Every move (either side) also
// fires `position` (declared `buffered`) so the live board sits in the agent's chat
// buffer — the third signal type, staged for the user's next prompt.
// ─────────────────────────────────────────────────────────────────────────────

enum Actor { case user, agent }

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var position = Position.start
    @Published private(set) var history: [MoveDTO] = []
    @Published private(set) var status: String = "idle"
    @Published private(set) var humanColor: Side = .w
    @Published private(set) var result: String? = nil
    @Published private(set) var winner: Side? = nil
    @Published private(set) var lastMove: (from: Int, to: Int)? = nil
    @Published private(set) var note: String? = nil       // agent's last `say` note
    @Published private(set) var lastAgent: String? = nil  // who last drove the CLI

    private var stack: [Position] = []  // past positions, for takeback

    /// Fire-and-forget signal to Clatch (app→agent), wired by the app delegate.
    /// (name, target, payload) — see ControlPipe.emitSignal. The signal's TYPE is
    /// its clatch.json declaration's, not the emitter's. `target: []` = broadcast.
    var onSignal: ((String, [String], [String: String]) -> Void)?

    var agentColor: Side { humanColor.other }

    // MARK: Commands (called by BOTH the GUI and the CLI)

    func newGame(humanColor: Side, agent: String? = nil) {
        self.humanColor = humanColor
        position = .start
        history = []
        stack = []
        status = "playing"
        result = nil
        winner = nil
        lastMove = nil
        note = nil
        if let agent { lastAgent = agent }
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

    func move(from: Int, to: Int, promo: PieceType?, by actor: Actor, agent: String? = nil) throws {
        guard status == "playing" else { throw MoveError.notPlaying }
        let mover: Side = (actor == .user) ? humanColor : agentColor
        guard position.turn == mover else { throw MoveError.notYourTurn }

        let legal = position.legalMoves(from: from).filter { $0.to == to }
        guard !legal.isEmpty else { throw MoveError.illegal }
        let chosen: Move
        if let promo, let m = legal.first(where: { $0.promotion == promo }) {
            chosen = m
        } else if let m = legal.first(where: { $0.promotion == nil }) {
            chosen = m
        } else {
            chosen = legal.first(where: { $0.promotion == .q }) ?? legal[0]
        }

        let san = position.san(for: chosen)
        let movingColor = position.turn
        stack.append(position)
        position = position.make(chosen)
        history.append(MoveDTO(ply: history.count + 1, color: movingColor.rawValue,
                               san: san, from: squareName(from), to: squareName(to)))
        lastMove = (from, to)
        note = nil
        if actor == .agent { lastAgent = agent ?? lastAgent }
        updateStatusAfterMove(mover: movingColor)

        // `position` (declared `buffered`) rides EVERY move, human or agent: it replaces
        // the agent's chat-buffer slot with the live board, so a "best move?" prompt
        // arrives with the current FEN attached. Latest wins; it wakes nothing on its own.
        onSignal?("position", [], ["fen": position.fen, "last": san])

        // Signal only on the USER's move: `move` is declared `run`, so it wakes the
        // agent to respond. It carries no state — the agent reads the real board via
        // `chess board`. target: [] → broadcast to every bound agent.
        if actor == .user {
            onSignal?("move", [], ["san": san])
            if status != "playing" {
                onSignal?("game.over", [], ["status": status, "result": result ?? ""])
            }
        }
    }

    private func updateStatusAfterMove(mover: Side) {
        switch position.outcome {
        case .checkmate: status = "checkmate"; winner = mover; result = mover == .w ? "1-0" : "0-1"
        case .stalemate: status = "stalemate"; winner = nil; result = "1/2-1/2"
        case .draw:      status = "draw"; winner = nil; result = "1/2-1/2"
        case .ongoing:   status = "playing"
        }
    }

    func resign(_ color: Side, by actor: Actor, agent: String? = nil) throws {
        guard status == "playing" else { throw MoveError.notPlaying }
        status = "resigned"
        winner = color.other
        result = color == .w ? "0-1" : "1-0"
        if actor == .agent { lastAgent = agent ?? lastAgent }
        if actor == .user {
            onSignal?("game.over", [], ["status": status, "result": result ?? ""])
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

    /// The agent shows the human a short note (coaching / status). GUI-visible only.
    func setNote(_ text: String, agent: String? = nil) {
        note = text.isEmpty ? nil : text
        if let agent { lastAgent = agent }
    }

    // MARK: Snapshot (projected to the CLI)

    func snapshot() -> StateDTO {
        StateDTO(
            status: status,
            turn: position.turn.rawValue,
            humanColor: humanColor.rawValue,
            agentColor: agentColor.rawValue,
            inCheck: status == "playing" && position.inCheck,
            result: result,
            winner: winner?.rawValue,
            fen: position.fen,
            ascii: asciiBoard(),
            moves: history,
            lastMove: history.last.map { ["from": $0.from, "to": $0.to, "san": $0.san] },
            note: note,
            lastAgent: lastAgent
        )
    }

    func legalList(from sq: Int?) -> [[String: String]] {
        let moves = sq != nil ? position.legalMoves(from: sq!) : position.legalMoves()
        return moves.map { ["from": squareName($0.from), "to": squareName($0.to), "san": position.san(for: $0)] }
    }

    private func asciiBoard() -> String {
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
