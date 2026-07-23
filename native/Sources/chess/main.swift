import AppKit
import Foundation
import SwiftUI

// One binary, two roles, chosen by argv:
//   chess app             -> the app process (GUI + socket server), launched by Clatch
//   chess <cmd> [...]     -> a CLI client that connects to the running app
// No TCP port is ever opened. The app is ArfChess (engine + board + pieces),
// packaged as the `chess` clapp on the frozen Clapp Protocol (docs/protocol.md).

let argv = Array(CommandLine.arguments.dropFirst())
let first = argv.first ?? "help"

func parseColor(_ s: String?) -> Side {
    switch (s ?? "").lowercased() {
    case "b", "black": return .b
    case "w", "white": return .w
    case "random": return Bool.random() ? .w : .b
    default: return .w
    }
}

func colorWord(_ s: String) -> String { s == "w" ? "White" : "Black" }

func printState(_ st: StateDTO) {
    print(st.ascii)
    switch st.status {
    case "idle": print("no game in progress")
    case "checkmate": print("checkmate — \(colorWord(st.winner ?? "w")) wins (\(st.result ?? ""))")
    case "resigned": print("\(colorWord(st.winner ?? "w")) wins by resignation (\(st.result ?? ""))")
    case "stalemate": print("stalemate — draw")
    case "draw": print("draw")
    default: print("\(colorWord(st.turn)) to move" + (st.inCheck ? " — CHECK" : ""))
    }
    if !st.moves.isEmpty {
        var line = "moves:"
        for (i, m) in st.moves.enumerated() {
            if i % 2 == 0 { line += " \(i / 2 + 1)." }
            line += " \(m.san)"
        }
        print(line)
    }
    if st.status != "idle" {
        print("you play \(colorWord(st.agentColor)), human plays \(colorWord(st.humanColor))")
    }
    if let coach = st.coach, !coach.isEmpty { print("note: \(coach)") }
}

// `<cli> --help` is the agent's ONLY manual (docs/protocol.md § Manifest): document
// every verb here. If a verb isn't here, the agent doesn't know it exists.
let helpText = """
\(AppInfo.cli) — play chess against the user. The human drives the GUI; you drive this
CLI on the same live game. The app is a single window + a Unix-domain-socket server
(no TCP port); this CLI is your interface to it.

You own the color the user did NOT pick and may move ONLY on your turn — the app
enforces it. When the user moves, Clatch wakes you (the `move` signal); read the real
board with `board`, then play with `move`.

usage:
  \(AppInfo.cli) board                print the board, whose turn, the move list, your color
  \(AppInfo.cli) fen                  print the current position as FEN
  \(AppInfo.cli) legal [square]       list legal moves (optionally from one square)
  \(AppInfo.cli) move <uci>           make your move: e2e4, g1f3, e7e8q (promotion)
  \(AppInfo.cli) say "<text>"         show the human a short note by the board
  \(AppInfo.cli) new [white|black|random]   start a new game (sets the HUMAN's color)
  \(AppInfo.cli) resign               resign the game (your color)
  \(AppInfo.cli) takeback [n]         undo the last n half-moves (default 1)
  \(AppInfo.cli) focus                focus the running app window
  \(AppInfo.cli) close                quit the app
  \(AppInfo.cli) help                 this help
"""

// MARK: - App (GUI + socket server + control pipe)

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let game = Game()
    var server: SocketServer?
    var control: ControlPipe?
    var window: NSWindow?

    func applicationDidFinishLaunching(_ note: Notification) {
        let wiredByClatch = ProcessInfo.processInfo.environment["CLATCH_INSTANCE_TOKEN"] != nil

        let socketServer = SocketServer(path: SocketPath.path) { [weak self] req in
            MainActor.assumeIsolated { self?.handle(req) ?? Response(ok: false, error: "no app") }
        }
        do {
            try socketServer.start()
            server = socketServer
        } catch {
            FileHandle.standardError.write(Data("\(AppInfo.cli): \(error)\n".utf8))
            NSApp.terminate(nil)
            return
        }

        // Clatch's product path requires a successful register before the app counts
        // as running. Standalone dev may omit the control pipe entirely.
        if let pipe = ControlPipe(signals: AppInfo.signals) {
            pipe.onShutdown = { DispatchQueue.main.async { NSApp.terminate(nil) } }
            // The control pipe closed unexpectedly (Clatch gone, or fail-fast on a bad
            // frame): socket-close IS "instance gone", so a wired app exits rather than
            // linger as a zombie. Standalone dev stays up.
            pipe.onClose = {
                if wiredByClatch { DispatchQueue.main.async { NSApp.terminate(nil) } }
            }
            // A `move`/`game.over` fan-out was REFUSED whole (a receiver's inbox/queue
            // was full), so nothing was delivered. Tell the human why over `notify`.
            pipe.onSignalRefused = { [weak pipe] id, agent, reason in
                let why = reason == "inbox_full" ? "its inbox is full"
                        : reason == "queue_full" ? "its context queue is full" : reason
                pipe?.notify("\(AppInfo.cli): couldn't deliver '\(id)' to \(agent) — \(why); nothing was delivered")
            }
            if pipe.start() {
                control = pipe
                game.onSignal = { [weak self] name, payload in
                    self?.control?.emitSignal(name, payload)
                }
            } else if wiredByClatch {
                NSApp.terminate(nil)
                return
            }
        } else if wiredByClatch {
            FileHandle.standardError.write(Data("\(AppInfo.cli): Clatch launch missing control pipe\n".utf8))
            NSApp.terminate(nil)
            return
        }

        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 680, height: 828),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        win.title = AppInfo.cli
        win.contentMinSize = NSSize(width: 680, height: 828)
        win.contentView = NSHostingView(rootView: BoardView(game: game))
        win.center()
        win.makeKeyAndOrderFront(nil)
        window = win
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ note: Notification) { server?.stop() }

    func handle(_ req: Request) -> Response {
        switch req.cmd {
        case "ping": return Response(ok: true)
        case "focus":
            NSApp.activate(ignoringOtherApps: true)
            window?.makeKeyAndOrderFront(nil)
            return Response(ok: true)
        case "quit":
            DispatchQueue.main.async { NSApp.terminate(nil) }
            return Response(ok: true, message: "bye")
        case "state", "board", "fen":
            return Response(ok: true, state: game.snapshot())
        case "new":
            game.newGame(humanColor: parseColor(req.color))
            return Response(ok: true, state: game.snapshot())
        case "move":
            guard let f = req.from.flatMap(parseSquare), let t = req.to.flatMap(parseSquare) else {
                return Response(ok: false, error: "move needs from/to squares")
            }
            let promo = req.promo.flatMap { PieceType(rawValue: $0.lowercased()) }
            do {
                try game.move(from: f, to: t, promo: promo, by: .agent)
                return Response(ok: true, state: game.snapshot())
            } catch {
                return Response(ok: false, error: "\(error)")
            }
        case "resign":
            do { try game.resign(game.agentColor, by: .agent); return Response(ok: true, state: game.snapshot()) }
            catch { return Response(ok: false, error: "\(error)") }
        case "takeback":
            game.takeback(req.n ?? 1)
            return Response(ok: true, state: game.snapshot())
        case "legal":
            return Response(ok: true, legal: game.legalList(from: req.square.flatMap(parseSquare)))
        case "say":
            game.setCoach(req.text ?? "")
            return Response(ok: true, state: game.snapshot())
        case "help", "catalog":
            return Response(ok: true, message: helpText)
        default:
            return Response(ok: false, error: "unknown command: \(req.cmd)")
        }
    }
}

func runApp() -> Never {
    MainActor.assumeIsolated {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        let delegate = AppDelegate()
        app.delegate = delegate
        app.run()
    }
    exit(0)
}

// MARK: - CLI client

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write(Data("\(AppInfo.cli): \(msg)\n".utf8))
    exit(1)
}

func runClient(_ argv: [String]) -> Never {
    let cmd = argv[0]
    var req = Request(cmd: cmd)
    func requireCount(_ count: Int, _ usage: String) {
        guard argv.count == count else { fail("usage: \(usage)") }
    }
    func requireMaxCount(_ count: Int, _ usage: String) {
        guard argv.count <= count else { fail("usage: \(usage)") }
    }
    switch cmd {
    case "board", "state":
        requireCount(1, "\(AppInfo.cli) \(cmd)")
        req.cmd = "state"
    case "fen":
        requireCount(1, "\(AppInfo.cli) fen")
    case "new":
        requireMaxCount(2, "\(AppInfo.cli) new [white|black|random]")
        req.color = argv.count > 1 ? argv[1] : "white"
    case "move":
        requireCount(2, "\(AppInfo.cli) move <uci>")
        let chars = Array(argv[1].lowercased())
        guard chars.count == 4 || chars.count == 5,
              parseSquare(String(chars[0...1])) != nil,
              parseSquare(String(chars[2...3])) != nil
        else { fail("bad move \(argv[1]) — use UCI like e2e4 or e7e8q") }
        req.from = String(chars[0...1]); req.to = String(chars[2...3])
        if chars.count == 5 { req.promo = String(chars[4]) }
    case "legal":
        requireMaxCount(2, "\(AppInfo.cli) legal [square]")
        if argv.count > 1 { req.square = argv[1] }
    case "say":
        guard argv.count > 1 else { fail("usage: \(AppInfo.cli) say \"<text>\"") }
        req.text = argv.dropFirst().joined(separator: " ")
    case "resign":
        requireCount(1, "\(AppInfo.cli) resign")
    case "takeback":
        requireMaxCount(2, "\(AppInfo.cli) takeback [n]")
        if argv.count > 1 {
            guard let n = Int(argv[1]) else { fail("takeback count must be a number") }
            req.n = n
        } else {
            req.n = 1
        }
    case "focus":
        requireCount(1, "\(AppInfo.cli) focus")
    case "close":
        requireCount(1, "\(AppInfo.cli) close")
        req.cmd = "quit"
    default:
        fail("unknown command: \(cmd) (try: \(AppInfo.cli) help)")
    }

    let resp: Response
    do { resp = try sendRequest(req) } catch { fail("\(error)") }
    guard resp.ok else { fail(resp.error ?? "rejected") }

    if cmd == "fen", let st = resp.state {
        print(st.fen)
    } else if let legal = resp.legal {
        for m in legal { print("\(m["from"] ?? "")\(m["to"] ?? "")  \(m["san"] ?? "")") }
    } else if let st = resp.state {
        printState(st)
    } else if let msg = resp.message {
        print(msg)
    } else {
        print("ok")
    }
    exit(0)
}

// MARK: - Dispatch

switch first {
case "app":
    // Steam-exact bootstrap: only ever run under Clatch (or the standalone hatch).
    if clatchInit(appId: AppInfo.id) { exit(0) }
    if let i = argv.firstIndex(of: "--control-addr") {
        guard i + 1 < argv.count else { fail("usage: \(AppInfo.cli) app --control-addr <addr>") }
        setenv("CLATCH_CONTROL_ADDR", argv[i + 1], 1)
    }
    runApp()
case "help", "-h", "--help":
    print(helpText)
    exit(0)
default:
    runClient(argv)
}
