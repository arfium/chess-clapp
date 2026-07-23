import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The ONE place this app's identity lives. Keep clatch.json in sync: `id`,
// `connector.cli`, and `connector.signals` (same ids, same types). Everything in
// the transport layer reads from here. (The app is ArfChess — its engine, board,
// and pieces — packaged as the `chess` clapp on the frozen Clapp Protocol.)
// ─────────────────────────────────────────────────────────────────────────────

enum AppInfo {
    /// Reverse-DNS app id. MUST equal `id` in clatch.json and CLATCH_APP_ID.
    static let id = "com.arfium.chess"

    /// The agent's CLI shorthand. MUST equal `connector.cli` in clatch.json.
    static let cli = "chess"

    /// Every signal this app may emit, as ID → TYPE. MUST equal `connector.signals`
    /// in clatch.json. The type is stamped onto every `app.toAgent` from here and
    /// re-validated by Clatch against the manifest (a mismatch or undeclared id is
    /// dropped). The control-pipe major lives only in clatch.json `protocol`.
    ///   move      — the human moved → wake the agent to reply    (run)
    ///   position  — after every move → the live board in the buffer (buffered)
    ///   game.over — the game ended                                (context)
    static let signals: [String: String] = [
        "move": "run",
        "position": "buffered",
        "game.over": "context",
    ]

    /// User-private runtime dir for this app's own GUI↔CLI socket (0700): `~/.chess/`.
    static var runtimeDir: String {
        (NSHomeDirectory() as NSString).appendingPathComponent(".\(cli)")
    }
}
