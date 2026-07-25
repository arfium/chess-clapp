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
        var line = "White: \(st.whitePlayer)   Black: \(st.blackPlayer)"
        if let yc = st.yourColor { line += "   (you are \(colorWord(yc)))" }
        print(line)
    }
    if let coach = st.coach, !coach.isEmpty { print("note: \(coach)") }
}

// `<cli> --help` is the agent's ONLY manual (docs/protocol.md § Manifest): document
// every verb here. If a verb isn't here, the agent doesn't know it exists.
let helpText = """
\(AppInfo.cli) — play chess. The human drives the GUI; you drive this CLI on the same
live game. The app is a single window + a Unix-domain-socket server (no TCP port); this
CLI is your interface to it.

Each side of the board is a SEAT — White or Black — and the human assigns the seats in
the window: You, a specific agent, or (both seats agents) agent-vs-agent. You are woken
only when it is YOUR seat's turn: Clatch delivers a `move` signal, you read the real
board with `board` (it prints "you are White/Black"), then play with `move`. You may
move ONLY on your turn — the app enforces it, so in an agent-vs-agent game neither side
can move for the other. If you were not given a seat, `board` won't say a color; don't move.

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
        setDockIcon()   // a bare executable shows the generic terminal icon otherwise
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
            // Clatch pushes the bound-agent roster here (after register + on every
            // change). Feed it to the game so seats can be filled and each player
            // strip wears the agent's name and avatar.
            pipe.onAgents = { [weak self] agents in
                let rows = agents.map {
                    AgentRow(id: $0.id, name: $0.name, backend: $0.backend,
                             model: $0.model, avatarPath: $0.avatar?.path)
                }
                DispatchQueue.main.async { self?.game.setAgents(rows) }
            }
            if pipe.start() {
                control = pipe
                game.onSignal = { [weak self] id, target, payload in
                    self?.control?.emitSignal(id, target: target, payload)
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
            contentRect: NSRect(x: 0, y: 0, width: BoardMetrics.minWidth, height: BoardMetrics.minHeight),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        win.title = AppInfo.cli
        win.contentMinSize = NSSize(width: BoardMetrics.minWidth, height: BoardMetrics.minHeight)
        win.contentView = NSHostingView(rootView: BoardView(game: game))
        win.center()
        win.makeKeyAndOrderFront(nil)
        window = win
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ note: Notification) { server?.stop() }

    /// Give the Dock the app's own icon — a bare Swift executable has none, so macOS
    /// falls back to the generic terminal icon. The pawn mark is bundled as a resource.
    private func setDockIcon() {
        if let url = Bundle.module.url(forResource: "appicon", withExtension: "png"),
           let icon = NSImage(contentsOf: url) {
            NSApp.applicationIconImage = icon
        }
    }

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
            return Response(ok: true, state: game.snapshot(callerId: req.agent))
        case "new":
            let human = parseColor(req.color)
            // The human takes the requested color; the calling agent takes the other
            // side (standalone with no agent id keeps that side's current occupant).
            let opponent: Seat = req.agent.map { .agent($0) } ?? game.seat(for: human.other)
            game.newGame(white: human == .w ? .human : opponent,
                         black: human == .b ? .human : opponent)
            return Response(ok: true, state: game.snapshot(callerId: req.agent))
        case "move":
            guard let f = req.from.flatMap(parseSquare), let t = req.to.flatMap(parseSquare) else {
                return Response(ok: false, error: "move needs from/to squares")
            }
            let promo = req.promo.flatMap { PieceType(rawValue: $0.lowercased()) }
            do {
                try game.move(from: f, to: t, promo: promo, by: .agent, callerId: req.agent)
                return Response(ok: true, state: game.snapshot(callerId: req.agent))
            } catch {
                return Response(ok: false, error: "\(error)")
            }
        case "resign":
            // Resign the caller's own color; if the caller holds no seat (or is
            // standalone), resign the side to move.
            let color: Side
            if let c = req.agent, case .agent(let id) = game.whiteSeat, id == c { color = .w }
            else if let c = req.agent, case .agent(let id) = game.blackSeat, id == c { color = .b }
            else { color = game.position.turn }
            do { try game.resign(color, by: .agent); return Response(ok: true, state: game.snapshot(callerId: req.agent)) }
            catch { return Response(ok: false, error: "\(error)") }
        case "takeback":
            game.takeback(req.n ?? 1)
            return Response(ok: true, state: game.snapshot(callerId: req.agent))
        case "legal":
            return Response(ok: true, legal: game.legalList(from: req.square.flatMap(parseSquare)))
        case "say":
            game.setCoach(req.text ?? "")
            return Response(ok: true, state: game.snapshot(callerId: req.agent))
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

    // Forward CLATCH_AGENT_ID so the app knows which agent is calling: it binds the
    // caller to a seat on `new`, enforces seat ownership on `move`, and tells the
    // caller its own color on `board`.
    req.agent = ProcessInfo.processInfo.environment["CLATCH_AGENT_ID"].flatMap { $0.isEmpty ? nil : $0 }

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

// MARK: - Dev: render the GUI to a PNG offscreen (no display needed)

@MainActor
func renderPreview(to path: String, kind: String) {
    _ = NSApplication.shared
    NSApp.setActivationPolicy(.accessory)
    let game = Game(); game.applyPreview(kind)
    let w = BoardMetrics.minWidth, h = BoardMetrics.minHeight
    let renderer = ImageRenderer(content: BoardView(game: game, preview: true).frame(width: w, height: h))
    renderer.scale = 2
    guard let img = renderer.nsImage, let tiff = img.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { fail("render failed") }
    try? png.write(to: URL(fileURLWithPath: path))
    print("rendered \(path)")
}

// MARK: - Dispatch

switch first {
case "render":
    guard argv.count >= 2 else { fail("usage: \(AppInfo.cli) render <path> [vs|solo]") }
    MainActor.assumeIsolated { renderPreview(to: argv[1], kind: argv.count > 2 ? argv[2] : "vs") }
    exit(0)
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
