//! The agent's CLI: `chess <verb> …` over clappkit IPC. `chess --help` is the manual.

use clappkit::ipc;
use serde_json::{json, Value};

const CLI: &str = "chess";

const HELP: &str = "\
chess — play chess. The human drives a window; you drive this CLI on the same live game.

Each side of the board is a SEAT — White or Black — and the human assigns the seats in
the window: You, a specific agent, or (both seats agents) agent-vs-agent. You are woken
only when it is YOUR seat's turn: Clatch delivers a `move` signal, you read the real
board with `board` (it prints \"you are White/Black\"), then play with `move`. You may
move ONLY on your turn — the app enforces it, so in an agent-vs-agent game neither side
can move for the other. If you were not given a seat, `board` won't say a colour; don't move.

usage:
  chess board                 print the board, whose turn, the move list, your colour
  chess fen                   print the current position as FEN
  chess legal [square]        list legal moves (optionally from one square)
  chess move <uci>            make your move: e2e4, g1f3, e7e8q (promotion)
  chess say \"<text>\"          show the human a short note by the board
  chess new [white|black|random]   start a new game (sets the HUMAN's colour)
  chess resign                resign the game (your colour)
  chess takeback [n]          undo the last n half-moves (default 1)
  chess focus                 focus the running app window
  chess close                 quit the app
  chess help                  this help";

pub async fn run(args: Vec<String>) -> ! {
    let verb = args.first().map(String::as_str).unwrap_or("help");
    let rest: Vec<String> = args.iter().skip(1).cloned().collect();
    let agent = std::env::var("CLATCH_AGENT_ID").ok().filter(|s| !s.is_empty());

    let req: Value = match verb {
        "help" | "-h" | "--help" => {
            println!("{HELP}");
            std::process::exit(0);
        }
        // Exactly the verbs `clatch.json` declares — nothing more. `connector.commands`
        // is the permission grain (`Bash(chess board:*)`), so a verb that is implemented
        // but undeclared is one no agent can ever be granted, and one `--help` cannot
        // honestly advertise.
        "board" => json!({ "cmd": "state", "agent": agent }),
        "fen" => json!({ "cmd": "fen" }),
        "legal" => json!({ "cmd": "legal", "square": rest.first().cloned() }),
        "move" => json!({ "cmd": "move", "uci": rest.first().cloned().unwrap_or_default(), "agent": agent }),
        "say" => {
            if rest.is_empty() {
                eprintln!("usage: chess say \"<text>\"");
                std::process::exit(1);
            }
            json!({ "cmd": "say", "text": rest.join(" "), "agent": agent })
        }
        "new" => json!({ "cmd": "new", "color": rest.first().cloned().unwrap_or_else(|| "white".into()), "agent": agent }),
        "resign" => json!({ "cmd": "resign", "agent": agent }),
        "takeback" => json!({ "cmd": "takeback", "n": rest.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(1) }),
        "focus" => json!({ "cmd": "focus" }),
        "close" => json!({ "cmd": "quit" }),
        other => {
            eprintln!("chess: unknown command '{other}' (try: chess help)");
            std::process::exit(1);
        }
    };

    match ipc::request(CLI, &req).await {
        Ok(v) => {
            print_result(verb, &v);
            std::process::exit(0);
        }
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
}

fn print_result(verb: &str, v: &Value) {
    if v.get("ok").and_then(Value::as_bool) == Some(false) {
        eprintln!("chess: {}", v.get("error").and_then(Value::as_str).unwrap_or("failed"));
        std::process::exit(1);
    }
    if verb == "fen" {
        println!("{}", v.get("fen").and_then(Value::as_str).unwrap_or(""));
        return;
    }
    if verb == "legal" {
        if let Some(arr) = v.get("legal").and_then(Value::as_array) {
            for m in arr {
                let f = m.get("from").and_then(Value::as_u64).unwrap_or(0);
                let t = m.get("to").and_then(Value::as_u64).unwrap_or(0);
                println!("{}{}", sq_name(f), sq_name(t));
            }
        }
        return;
    }
    // No state came back at all — `focus` / `close` answer with a bare ok (+ message).
    let Some(board) = v.get("board").and_then(Value::as_array) else {
        println!("{}", v.get("message").and_then(Value::as_str).unwrap_or("ok"));
        return;
    };
    // board view
    for rank in (0..8).rev() {
        let mut line = format!("{}  ", rank + 1);
        for file in 0..8 {
            let sq = (rank * 8 + file) as usize;
            let cell = board.get(sq).and_then(Value::as_str).unwrap_or("");
            let g = if cell.is_empty() { ". ".to_string() } else { glyph(cell) };
            line.push_str(&g);
        }
        println!("{}", line.trim_end());
    }
    println!("   a b c d e f g h");
    let status = v.get("status").and_then(Value::as_str).unwrap_or("");
    let turn = v.get("turn").and_then(Value::as_str).unwrap_or("w");
    match status {
        "idle" => println!("no game in progress"),
        "checkmate" => println!("checkmate — {} wins", color_word(v.get("winner").and_then(Value::as_str).unwrap_or("w"))),
        "resigned" => println!("{} wins by resignation", color_word(v.get("winner").and_then(Value::as_str).unwrap_or("w"))),
        "stalemate" => println!("stalemate — draw"),
        "draw" => println!("draw"),
        "ended" => println!("game ended"),
        _ => println!("{} to move{}", color_word(turn), if v.get("inCheck").and_then(Value::as_bool) == Some(true) { " — CHECK" } else { "" }),
    }
    if let Some(moves) = v.get("moves").and_then(Value::as_array) {
        if !moves.is_empty() {
            let mut line = String::from("moves:");
            for (i, m) in moves.iter().enumerate() {
                if i % 2 == 0 {
                    line.push_str(&format!(" {}.", i / 2 + 1));
                }
                line.push_str(&format!(" {}", m.get("san").and_then(Value::as_str).unwrap_or("")));
            }
            println!("{line}");
        }
    }
    let wp = v.pointer("/white/name").and_then(Value::as_str).unwrap_or("—");
    let bp = v.pointer("/black/name").and_then(Value::as_str).unwrap_or("—");
    if status != "idle" {
        let mut line = format!("White: {wp}   Black: {bp}");
        if let Some(yc) = v.get("yourColor").and_then(Value::as_str) {
            line.push_str(&format!("   (you are {})", color_word(yc)));
        }
        println!("{line}");
    }
    if v.get("chaos").and_then(Value::as_bool) == Some(true) {
        println!("⚠ chaos mode: illegal moves are allowed (rules & check off)");
    }
    if let Some(note) = v.get("coach").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        println!("note: {note}");
    }
}

fn color_word(c: &str) -> &str {
    if c == "w" { "White" } else { "Black" }
}

fn sq_name(sq: u64) -> String {
    let file = (b'a' + (sq % 8) as u8) as char;
    let rank = (sq / 8) + 1;
    format!("{file}{rank}")
}

fn glyph(code: &str) -> String {
    let c = code.chars().nth(1).unwrap_or('?');
    let white = code.starts_with('w');
    let g = match c {
        'P' => if white { '♙' } else { '♟' },
        'N' => if white { '♘' } else { '♞' },
        'B' => if white { '♗' } else { '♝' },
        'R' => if white { '♖' } else { '♜' },
        'Q' => if white { '♕' } else { '♛' },
        'K' => if white { '♔' } else { '♚' },
        _ => '?',
    };
    format!("{g} ")
}
