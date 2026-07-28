//! The chess game — the single source of truth the GUI and CLI both drive. The engine
//! is `shakmaty` (legal moves, SAN, FEN, mate/stalemate); the seats + agent-vs-agent
//! loop + signals are ours. Portable Rust, no platform code.

use serde_json::{json, Value};
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, EnPassantMode, Move, Position, Role, Square};

/// A signal for the control pipe, drained by the app (like clock's Emit).
#[derive(Clone)]
pub struct Emit {
    pub id: String,          // "move" | "position" | "game.over"
    pub target: Vec<String>, // agent ids ([] = broadcast)
    pub payload: Value,
}

#[derive(Clone, PartialEq)]
pub enum Seat {
    Empty,
    Human,
    Agent(String), // agent id
}

#[derive(Clone, Default)]
pub struct AgentRow {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Copy)]
pub enum Actor {
    User,
    Agent,
}

pub struct Game {
    pos: Chess,
    stack: Vec<Chess>,
    sans: Vec<String>,
    status: String, // idle | playing | checkmate | stalemate | draw | resigned | ended
    result: Option<String>,
    winner: Option<Color>,
    last: Option<(u32, u32)>,
    last_san: String,
    white: Seat,
    black: Seat,
    agents: Vec<AgentRow>,
}

impl Default for Game {
    fn default() -> Self {
        Game {
            pos: Chess::default(),
            stack: Vec::new(),
            sans: Vec::new(),
            status: "idle".into(),
            result: None,
            winner: None,
            last: None,
            last_san: String::new(),
            white: Seat::Empty,
            black: Seat::Empty,
            agents: Vec::new(),
        }
    }
}

impl Game {
    pub fn set_agents(&mut self, agents: Vec<AgentRow>) {
        self.agents = agents;
    }
    fn seat(&self, c: Color) -> &Seat {
        if c == Color::White { &self.white } else { &self.black }
    }
    fn name_for(&self, id: &str) -> Option<String> {
        self.agents.iter().find(|a| a.id == id).map(|a| a.name.clone())
    }
    fn seats_ready(&self) -> bool {
        self.white != Seat::Empty && self.black != Seat::Empty
    }
    fn has_human(&self) -> bool {
        self.white == Seat::Human || self.black == Seat::Human
    }

    // MARK: the one command handler (GUI + CLI)

    pub fn handle(&mut self, req: &Value, caller: Option<String>) -> (Value, Vec<Emit>) {
        let cmd = req.get("cmd").and_then(Value::as_str).unwrap_or("");
        let mut emits = Vec::new();
        let resp = match cmd {
            "state" | "board" => self.snapshot(caller.as_deref()),
            "fen" => json!({ "ok": true, "fen": self.fen() }),
            "legal" => json!({ "ok": true, "legal": self.legal_list() }),
            "seat" => {
                // GUI seat picker: {color:"w"|"b", who:"human"|"empty"|"<agent id>"}
                let color = if req.get("color").and_then(Value::as_str) == Some("b") { Color::Black } else { Color::White };
                let seat = match req.get("who").and_then(Value::as_str).unwrap_or("empty") {
                    "human" => Seat::Human,
                    "empty" => Seat::Empty,
                    id => Seat::Agent(id.to_string()),
                };
                if color == Color::White { self.white = seat } else { self.black = seat }
                if self.status == "playing" && self.pos.turn() == color {
                    self.kick(&mut emits);
                }
                self.snapshot(caller.as_deref())
            }
            "new" => {
                // {color:"white"|"black"} the HUMAN takes (CLI), else GUI uses current seats.
                if let Some(col) = req.get("color").and_then(Value::as_str) {
                    let human = if col.starts_with('b') { Color::Black } else { Color::White };
                    let opp = caller.clone().map(Seat::Agent).unwrap_or(Seat::Human);
                    self.white = if human == Color::White { Seat::Human } else { opp.clone() };
                    self.black = if human == Color::Black { Seat::Human } else { opp };
                }
                if !self.seats_ready() {
                    return (err("both seats must be filled first"), emits);
                }
                self.pos = Chess::default();
                self.stack.clear();
                self.sans.clear();
                self.status = "playing".into();
                self.result = None;
                self.winner = None;
                self.last = None;
                self.last_san.clear();
                self.kick(&mut emits);
                self.snapshot(caller.as_deref())
            }
            "move" => {
                let uci = req.get("uci").and_then(Value::as_str).unwrap_or("");
                let actor = if caller.is_some() { Actor::Agent } else { Actor::User };
                match self.play(uci, actor, caller.clone(), &mut emits) {
                    Ok(()) => self.snapshot(caller.as_deref()),
                    Err(e) => return (err(&e), emits),
                }
            }
            "resign" => {
                let color = self.resign_color(caller.as_deref());
                self.resign(color, &mut emits);
                self.snapshot(caller.as_deref())
            }
            "end" => {
                if self.status == "playing" {
                    self.status = "ended".into();
                    self.result = None;
                    self.winner = None;
                    emits.push(Emit { id: "game.over".into(), target: vec![], payload: json!({ "status": "ended" }) });
                }
                self.snapshot(caller.as_deref())
            }
            "takeback" => {
                let n = req.get("n").and_then(Value::as_u64).unwrap_or(1);
                for _ in 0..n {
                    if let Some(prev) = self.stack.pop() {
                        self.pos = prev;
                        self.sans.pop();
                    }
                }
                self.status = "playing".into();
                self.result = None;
                self.winner = None;
                self.last = None;
                self.snapshot(caller.as_deref())
            }
            other => err(&format!("unknown command: {other}")),
        };
        (resp, emits)
    }

    fn resign_color(&self, caller: Option<&str>) -> Color {
        if let Some(c) = caller {
            if self.white == Seat::Agent(c.to_string()) { return Color::White; }
            if self.black == Seat::Agent(c.to_string()) { return Color::Black; }
        }
        if self.white == Seat::Human && self.black != Seat::Human { return Color::White; }
        if self.black == Seat::Human && self.white != Seat::Human { return Color::Black; }
        self.pos.turn()
    }

    fn resign(&mut self, color: Color, emits: &mut Vec<Emit>) {
        if self.status != "playing" {
            return;
        }
        self.status = "resigned".into();
        self.winner = Some(color.other());
        self.result = Some(if color == Color::White { "0-1".into() } else { "1-0".into() });
        emits.push(Emit {
            id: "game.over".into(),
            target: vec![],
            payload: json!({ "status": "resigned", "result": self.result }),
        });
    }

    fn play(&mut self, uci: &str, actor: Actor, caller: Option<String>, emits: &mut Vec<Emit>) -> Result<(), String> {
        if self.status != "playing" {
            return Err("no game in progress — start one with `new`".into());
        }
        let mover = self.pos.turn();
        // Seat ownership: only the occupant of the side to move may move it.
        match (actor, self.seat(mover).clone()) {
            (Actor::User, Seat::Human) => {}
            (Actor::User, _) => return Err("not your turn".into()),
            (Actor::Agent, Seat::Agent(id)) => {
                if let Some(c) = &caller {
                    if c != &id {
                        return Err("not your turn".into());
                    }
                }
            }
            (Actor::Agent, _) => {
                if caller.is_some() {
                    return Err("not your turn".into());
                }
            }
        }

        let uci_move = UciMove::from_ascii(uci.as_bytes()).map_err(|_| "bad move — use UCI like e2e4".to_string())?;
        let mv: Move = uci_move.to_move(&self.pos).map_err(|_| "illegal move".to_string())?;
        let san = San::from_move(&self.pos, &mv).to_string();

        self.stack.push(self.pos.clone());
        let from = mv.from().map(|s| u32::from(s)).unwrap_or(0);
        let to = u32::from(mv.to());
        self.pos.play_unchecked(&mv);
        self.sans.push(san.clone());
        self.last = Some((from, to));
        self.last_san = san.clone();
        self.update_status(mover);

        // `position` (buffered) rides after every move to everyone watching.
        emits.push(Emit { id: "position".into(), target: vec![], payload: json!({ "fen": self.fen(), "last": san }) });
        if self.status == "playing" {
            self.kick(emits); // wake the side to move if it's an agent (the whole vs-loop)
        } else {
            emits.push(Emit {
                id: "game.over".into(),
                target: vec![],
                payload: json!({ "status": self.status, "result": self.result }),
            });
        }
        Ok(())
    }

    /// If a game is in progress and the side to move is an agent, wake exactly it.
    fn kick(&self, emits: &mut Vec<Emit>) {
        if self.status != "playing" {
            return;
        }
        if let Seat::Agent(id) = self.seat(self.pos.turn()) {
            let mut payload = json!({ "fen": self.fen(), "turn": color_str(self.pos.turn()) });
            if !self.last_san.is_empty() {
                payload["san"] = json!(self.last_san);
            }
            emits.push(Emit { id: "move".into(), target: vec![id.clone()], payload });
        }
    }

    fn update_status(&mut self, mover: Color) {
        if self.pos.is_checkmate() {
            self.status = "checkmate".into();
            self.winner = Some(mover);
            self.result = Some(if mover == Color::White { "1-0".into() } else { "0-1".into() });
        } else if self.pos.is_stalemate() {
            self.status = "stalemate".into();
            self.winner = None;
            self.result = Some("1/2-1/2".into());
        } else if self.pos.is_insufficient_material() {
            self.status = "draw".into();
            self.winner = None;
            self.result = Some("1/2-1/2".into());
        } else {
            self.status = "playing".into();
        }
    }

    // MARK: projections

    fn fen(&self) -> String {
        Fen::from_position(self.pos.clone(), EnPassantMode::Legal).to_string()
    }

    fn legal_list(&self) -> Vec<Value> {
        if self.status != "playing" {
            return vec![];
        }
        self.pos
            .legal_moves()
            .iter()
            .map(|m| {
                json!({
                    "from": m.from().map(u32::from).unwrap_or(0),
                    "to": u32::from(m.to()),
                    "promo": m.promotion().map(role_char),
                })
            })
            .collect()
    }

    fn player(&self, c: Color) -> Value {
        match self.seat(c) {
            Seat::Empty => json!({ "kind": "empty" }),
            Seat::Human => json!({ "kind": "human", "name": "You" }),
            Seat::Agent(id) => json!({
                "kind": "agent",
                "name": self.name_for(id).unwrap_or_else(|| "Agent".into()),
                "id": id,
            }),
        }
    }

    pub fn snapshot(&self, caller: Option<&str>) -> Value {
        let board: Vec<Value> = Square::ALL
            .iter()
            .map(|&sq| match self.pos.board().piece_at(sq) {
                Some(p) => json!(format!("{}{}", color_str(p.color), role_char(p.role).to_uppercase())),
                None => Value::Null,
            })
            .collect();
        let your_color = caller.and_then(|c| {
            if self.white == Seat::Agent(c.to_string()) {
                Some("w")
            } else if self.black == Seat::Agent(c.to_string()) {
                Some("b")
            } else {
                None
            }
        });
        json!({
            "ok": true,
            "fen": self.fen(),
            "turn": color_str(self.pos.turn()),
            "status": self.status,
            "result": self.result,
            "winner": self.winner.map(color_str),
            "inCheck": self.status == "playing" && self.pos.is_check(),
            "board": board,
            "white": self.player(Color::White),
            "black": self.player(Color::Black),
            "yourColor": your_color,
            "last": self.last.map(|(f, t)| json!({ "from": f, "to": t })),
            "legal": self.legal_list(),
            "moves": self.sans,
            "seatsReady": self.seats_ready(),
            "hasHuman": self.has_human(),
            "agents": self.agents.iter().map(|a| json!({ "id": a.id, "name": a.name })).collect::<Vec<_>>(),
        })
    }
}

fn err(msg: &str) -> Value {
    json!({ "ok": false, "error": msg })
}

fn color_str(c: Color) -> &'static str {
    if c == Color::White { "w" } else { "b" }
}

fn role_char(r: Role) -> String {
    match r {
        Role::Pawn => "p",
        Role::Knight => "n",
        Role::Bishop => "b",
        Role::Rook => "r",
        Role::Queen => "q",
        Role::King => "k",
    }
    .to_string()
}
