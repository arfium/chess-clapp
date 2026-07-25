import Foundation

// The wire protocol between the CLI (agent) and the running app (daemon), spoken
// as newline-delimited JSON over a Unix domain socket. No TCP, no port.

struct Request: Codable {
    var cmd: String
    var from: String?
    var to: String?
    var promo: String?
    var color: String?      // human color for `new`
    var n: Int?             // takeback count
    var square: String?     // legal moves from a square
    var text: String?       // coach message
    var agent: String?      // the caller's CLATCH_AGENT_ID (the agent id, forwarded by the CLI)
}

struct MoveDTO: Codable {
    var ply: Int
    var color: String
    var san: String
    var from: String
    var to: String
}

struct StateDTO: Codable {
    var status: String          // idle | playing | checkmate | stalemate | draw | resigned
    var turn: String            // w | b
    var whitePlayer: String     // who sits White: "You" | an agent's name | "Agent"
    var blackPlayer: String     // who sits Black
    var yourColor: String?      // the CALLING agent's color ("w"|"b"), if it holds a seat
    var inCheck: Bool
    var result: String?         // 1-0 | 0-1 | 1/2-1/2
    var winner: String?         // w | b | null
    var fen: String
    var ascii: String
    var moves: [MoveDTO]
    var lastMove: [String: String]?  // {from,to,san}
    var coach: String?
    var chaos: Bool                  // illegal moves allowed (legality/check not enforced)
}

struct Response: Codable {
    var ok: Bool
    var error: String?
    var state: StateDTO?
    var legal: [[String: String]]?   // [{from,to,san}]
    var message: String?
}

enum SocketPath {
    // ~/.chess/chess.sock — user-private dir (0700), socket (0600). See AppInfo.
    static var dir: String { AppInfo.runtimeDir }
    static var path: String { (dir as NSString).appendingPathComponent("\(AppInfo.cli).sock") }
}
