import Foundation
import Combine

// The single source of truth (the "daemon"'s state). SwiftUI observes it; the
// socket server and the GUI both mutate it through the same methods, so the two
// surfaces never drift. Main-actor isolated: all mutation happens on the UI thread.

enum Actor { case user, agent }

/// Who occupies one side of the board. Chess has two seats — White and Black — and
/// each is either the human at this window or a specific agent from the roster. This
/// is what lets any pairing play: you-vs-agent, agent-vs-agent, or hotseat you-vs-you.
enum Seat: Equatable {
    case human
    case agent(String)   // an agent's IMMUTABLE id (the wire key), never its display name
}

/// One bound agent, projected from the Clatch roster (protocol.md § Connected agents).
/// Keyed by `id`; `name`/`model`/`avatarPath` are display and MAY change between pushes.
struct AgentRow: Identifiable, Equatable {
    let id: String
    let name: String
    let backend: String
    let model: String?
    let avatarPath: String?
}

@MainActor
final class Game: ObservableObject {
    @Published private(set) var position = Position.start
    @Published private(set) var history: [MoveDTO] = []
    @Published private(set) var status: String = "idle"
    @Published private(set) var result: String? = nil
    @Published private(set) var winner: Side? = nil
    @Published private(set) var lastMove: (from: Int, to: Int)? = nil
    @Published private(set) var coach: String? = nil

    // The two seats + the agents that can fill them.
    @Published private(set) var whiteSeat: Seat = .human
    @Published private(set) var blackSeat: Seat = .human
    @Published private(set) var agents: [AgentRow] = []
    /// Once the human touches a seat picker we stop auto-seating the opponent, so a
    /// roster change never overrides a deliberate choice.
    private var seatsCustomized = false

    // Past positions for takeback.
    private var stack: [Position] = []
    // The SAN of the move just played — rides along in the `move` wake so the agent
    // sees what it must answer without a separate `board` round-trip.
    private var lastSan = ""

    // Fire-and-forget signal to Clatch (app→agent), set by the app delegate. The
    // signature is (id, target, payload): `target` is a list of agent IDS, empty =
    // broadcast. A `move` wake is TARGETED at the side-to-move's agent; `position`
    // and `game.over` broadcast to everyone watching.
    var onSignal: ((String, [String], [String: String]) -> Void)?

    // MARK: Seats

    func seat(for side: Side) -> Seat { side == .w ? whiteSeat : blackSeat }

    /// The human picked an occupant for one side. Records the choice and, if it drops
    /// an agent onto the side that must move right now, wakes it — so mid-game seat
    /// changes take effect immediately (including starting an agent-vs-agent loop).
    func chooseSeat(_ side: Side, _ seat: Seat) {
        seatsCustomized = true
        if side == .w { whiteSeat = seat } else { blackSeat = seat }
        // Only wake when an agent is dropped onto the side that must move right now
        // (e.g. handing the current turn to an agent, or replacing one that went
        // offline). Touching the other seat waits for its turn to come around.
        if status == "playing", side == position.turn { kickToMove() }
    }

    /// Replace the roster (a full snapshot pushed by Clatch on every change). Until the
    /// human customizes seats, keep the classic out-of-box pairing — you (White) vs your
    /// agent (Black) — pointed at a live agent, so a fresh install "just works".
    func setAgents(_ rows: [AgentRow]) {
        agents = rows
        guard !seatsCustomized, let first = rows.first else { return }
        switch blackSeat {
        case .human:
            blackSeat = .agent(first.id)
        case .agent(let id):
            if !rows.contains(where: { $0.id == id }) { blackSeat = .agent(first.id) }
        }
    }

    func agent(forId id: String) -> AgentRow? { agents.first { $0.id == id } }

    /// A human display label for a seat ("You" / an agent's name / "Agent" if offline).
    func playerLabel(_ side: Side) -> String {
        switch seat(for: side) {
        case .human: return "You"
        case .agent(let id): return agent(forId: id)?.name ?? "Agent"
        }
    }

    // MARK: Commands

    func newGame(white: Seat? = nil, black: Seat? = nil) {
        if let white { whiteSeat = white; seatsCustomized = true }
        if let black { blackSeat = black; seatsCustomized = true }
        position = .start
        history = []
        stack = []
        status = "playing"
        result = nil
        winner = nil
        lastMove = nil
        coach = nil
        lastSan = ""
        kickToMove()   // if White is an agent, start it thinking
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

    func move(from: Int, to: Int, promo: PieceType?, by actor: Actor, callerId: String? = nil) throws {
        guard status == "playing" else { throw MoveError.notPlaying }
        let mover = position.turn
        // Seat ownership: only the occupant of the side to move may move it. A real
        // agent (callerId present) is held to its own seat, which is what keeps an
        // agent-vs-agent game honest — neither side can move on the other's turn. The
        // standalone dev hatch (no CLATCH_AGENT_ID) may move either side.
        switch (actor, seat(for: mover)) {
        case (.user, .human): break
        case (.user, .agent): throw MoveError.notYourTurn
        case (.agent, .agent(let id)): if let c = callerId, c != id { throw MoveError.notYourTurn }
        case (.agent, .human): if callerId != nil { throw MoveError.notYourTurn }
        }

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
        lastSan = san
        updateStatusAfterMove(mover: movingColor)

        // `position` (buffered) rides after EVERY move to EVERYONE watching: the live
        // board sits in each agent's chat buffer, so when the human asks "best move?"
        // the agent receives the live position + the question as one input, exactly
        // when asked (reference/signals.md § buffered). Latest wins; ten moves leave
        // one entry, the live one.
        onSignal?("position", [], ["fen": position.fen, "last": san])
        if status == "playing" {
            // Reactive trigger: wake whoever must answer — but ONLY if it's an agent.
            // A human's turn ends here; they play in the window. The mover is never
            // re-woken by its own move (turns alternate colors). This one line is the
            // whole agent-vs-agent loop: each move hands the turn to the other seat.
            kickToMove()
        } else {
            onSignal?("game.over", [], ["status": status, "result": result ?? ""])
        }
    }

    /// If a game is in progress and the side to move is an agent, wake exactly that
    /// agent (targeted by id) to play. A human seat is left alone — it moves in the GUI.
    private func kickToMove() {
        guard status == "playing", case .agent(let id) = seat(for: position.turn) else { return }
        var payload = ["fen": position.fen, "turn": position.turn.rawValue]
        if !lastSan.isEmpty { payload["san"] = lastSan }
        onSignal?("move", [id], payload)
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
        // Broadcast: whoever is on the other side — human or agent — should learn the
        // game is over (an agent opponent gets it as context, not a wake).
        onSignal?("game.over", [], [
            "status": status,
            "result": result ?? "",
            "winner": winner?.rawValue ?? "",
        ])
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

    func snapshot(callerId: String? = nil) -> StateDTO {
        // The calling agent's own color (if it holds a seat), so `board` can tell it
        // "you are Black" without the agent having to reason about the roster.
        var yourColor: String?
        if let c = callerId {
            if case .agent(let id) = whiteSeat, id == c { yourColor = "w" }
            else if case .agent(let id) = blackSeat, id == c { yourColor = "b" }
        }
        var dto = StateDTO(
            status: status,
            turn: position.turn.rawValue,
            whitePlayer: playerLabel(.w),
            blackPlayer: playerLabel(.b),
            yourColor: yourColor,
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

    // MARK: Preview (offscreen render only)

    /// Seed a representative state for `chess render` — no Clatch, no display needed.
    /// Shows the headline pairing (agent vs agent) mid-opening, with one real avatar
    /// (a bundled image, exercising the photo path) and one monogram fallback.
    func applyPreview(_ kind: String) {
        let photo = Bundle.module.url(forResource: "appicon", withExtension: "png")?.path
        agents = [
            AgentRow(id: "a1", name: "Cline", backend: "cline-acp",
                     model: "claude-opus-4-8", avatarPath: photo),
            AgentRow(id: "a2", name: "Nova", backend: "gemini-acp",
                     model: "gemini-2.5-pro", avatarPath: nil),
        ]
        seatsCustomized = true
        if kind == "solo" {
            whiteSeat = .human; blackSeat = .agent("a1")
        } else {
            whiteSeat = .agent("a1"); blackSeat = .agent("a2")
        }
        status = "playing"; result = nil; winner = nil
        position = .start; history = []; stack = []
        for uci in ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"] {
            guard let f = parseSquare(String(uci.prefix(2))),
                  let t = parseSquare(String(uci.suffix(2))),
                  let m = position.legalMoves(from: f).first(where: { $0.to == t }) else { continue }
            let san = position.san(for: m), mc = position.turn
            history.append(MoveDTO(ply: history.count + 1, color: mc.rawValue, san: san,
                                   from: squareName(f), to: squareName(t)))
            stack.append(position); position = position.make(m); lastMove = (f, t); lastSan = san
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
