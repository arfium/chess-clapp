import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The ONE place your app's identity lives. When you fork this template, change
// these three values and keep clatch.json in sync (id, connector.cli,
// connector.signals). Everything else in the transport layer reads from here.
// ─────────────────────────────────────────────────────────────────────────────

enum AppInfo {
    /// Reverse-DNS app id. MUST equal `id` in clatch.json and the id Clatch injects
    /// as CLATCH_APP_ID at launch. A mismatch is a hard error (reference/launch.md).
    static let id = "com.arfium.chess"

    /// The agent's CLI shorthand. MUST equal `connector.cli` in clatch.json. This
    /// is the verb the agent types; Clatch grants it `Bash(<cli>:*)`.
    static let cli = "chess"

    /// Every signal this app may emit, as ID → TYPE. MUST equal `connector.signals`
    /// in clatch.json (same ids, same types). The type (run / context / buffered) is
    /// stamped onto every `app.toAgent` from here, so intent is explicit on the wire;
    /// Clatch RE-VALIDATES it against the manifest and drops a signal whose wire type
    /// disagrees with the declaration, or whose id was never declared. Authority stays
    /// the declaration; the wire just states intent, checkably.
    /// (The targeted control-pipe major lives ONLY in clatch.json `protocol`; Clatch
    /// reads it at install, so the app never re-announces it at register.)
    static let signals: [String: String] = [
        "move": "run",           // the human moved → wake the agent to reply
        "position": "buffered",  // after every move → the live board in the agent's chat buffer
        "game.over": "context",  // the game ended → queued, lossless, for the next turn
    ]

    /// User-private runtime dir for this app's own GUI↔CLI socket (0700).
    /// `~/.chess/` — rename alongside the app.
    static var runtimeDir: String {
        (NSHomeDirectory() as NSString).appendingPathComponent(".chess")
    }
}
