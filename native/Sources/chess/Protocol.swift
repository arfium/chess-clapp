import Foundation

// The app's OWN wire protocol, between the CLI (agent) and the running app (GUI
// process) over a Unix domain socket — newline-delimited JSON, no TCP, no port.
// This is entirely ours: Clatch never sees it (reference/app-developer.md § boundary).
// The Clatch↔App control pipe (ControlPipe.swift) is a separate channel.

/// A CLI command travelling to the running app.
struct Request: Codable {
    var cmd: String
    var from: String?    // move source square (e2)
    var to: String?      // move destination square (e4)
    var promo: String?   // promotion piece (q|r|b|n)
    var color: String?   // human color for `new` (white|black|random)
    var n: Int?          // takeback count
    var square: String?  // restrict `legal` to one square
    var text: String?    // `say` note
    var agent: String?   // caller's CLATCH_AGENT (forwarded by the CLI, if any)
}

/// One move in the game history, projected for the CLI.
struct MoveDTO: Codable {
    var ply: Int
    var color: String   // w | b
    var san: String
    var from: String
    var to: String
}

/// The whole game, projected for the CLI. A snapshot of the single source of
/// truth (AppState); the GUI observes the same model, so the two never drift.
struct StateDTO: Codable {
    var status: String         // idle | playing | checkmate | stalemate | draw | resigned
    var turn: String           // w | b
    var humanColor: String
    var agentColor: String
    var inCheck: Bool
    var result: String?        // 1-0 | 0-1 | 1/2-1/2
    var winner: String?        // w | b
    var fen: String
    var ascii: String
    var moves: [MoveDTO]
    var lastMove: [String: String]?   // {from,to,san}
    var note: String?          // the agent's last `say` note, shown to the human
    var lastAgent: String?     // who last drove the CLI (from CLATCH_AGENT)
}

/// A command's result.
struct Response: Codable {
    var ok: Bool
    var error: String?
    var state: StateDTO?
    var legal: [[String: String]]?   // [{from,to,san}]
    var message: String?             // help text / plain acknowledgements
}

/// Where this app's GUI↔CLI socket lives: `~/.chess/chess.sock`.
/// User-private directory (0700), socket (0600) — see IPC.swift.
enum SocketPath {
    static var dir: String { AppInfo.runtimeDir }
    static var path: String { (dir as NSString).appendingPathComponent("\(AppInfo.cli).sock") }
}
