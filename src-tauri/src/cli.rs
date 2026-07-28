//! The agent's CLI: `chess <verb> …` over clappkit IPC. `chess --help` is the manual.

use clappkit::ipc;
use serde_json::{json, Value};

const CLI: &str = "chess";

const HELP: &str = "\
chess — play chess. The human drives a window; you drive this CLI on the same live game.
Each side of the board is a SEAT the human fills in the window: You, a specific agent, or
(both agents) agent-vs-agent. You are woken with a `move` signal when it is YOUR turn;
read the board, then play. You may move ONLY on your turn — the app enforces it.

usage:
  chess board                 the board, whose turn, the move list, your colour
  chess fen                   the position as FEN
  chess legal                 the legal moves right now (from,to)
  chess move <uci>            play a move: e2e4, g1f3, e7e8q (promotion)
  chess new [white|black]     start a new game (sets the HUMAN's colour; you take the other)
  chess resign                resign your side
  chess takeback [n]          undo the last n half-moves (default 1)
  chess help                  this manual";

pub async fn run(args: Vec<String>) -> ! {
    let verb = args.first().map(String::as_str).unwrap_or("help");
    let rest: Vec<String> = args.iter().skip(1).cloned().collect();
    let agent = std::env::var("CLATCH_AGENT_ID").ok().filter(|s| !s.is_empty());

    let req: Value = match verb {
        "help" | "-h" | "--help" => {
            println!("{HELP}");
            std::process::exit(0);
        }
        "board" | "state" => json!({ "cmd": "state", "agent": agent }),
        "fen" => json!({ "cmd": "fen" }),
        "legal" => json!({ "cmd": "legal" }),
        "move" => json!({ "cmd": "move", "uci": rest.first().cloned().unwrap_or_default(), "agent": agent }),
        "new" => json!({ "cmd": "new", "color": rest.first().cloned().unwrap_or_else(|| "white".into()), "agent": agent }),
        "resign" => json!({ "cmd": "resign", "agent": agent }),
        "takeback" => json!({ "cmd": "takeback", "n": rest.first().and_then(|s| s.parse::<u64>().ok()).unwrap_or(1) }),
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
    // board view
    if let Some(board) = v.get("board").and_then(Value::as_array) {
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
    }
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
                line.push_str(&format!(" {}", m.as_str().unwrap_or("")));
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
