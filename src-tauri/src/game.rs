//! The chess game — the single source of truth the GUI and CLI both drive. The engine
//! is `shakmaty` (legal moves, SAN, FEN, mate/stalemate); the seats + agent-vs-agent
//! loop + signals + chaos mode are ours. Portable Rust, no platform code.
//!
//! The position is carried as a `Setup` (a *not necessarily legal* position) with a
//! derived `Chess` alongside it. Strict chess only ever needs the `Chess`; chaos mode
//! ("Allow illegal moves") can relocate a piece anywhere, which may leave a position
//! `shakmaty` refuses to validate — the `Setup` still renders, still serialises to FEN,
//! and the king-capture rule still ends the game.

use serde_json::{json, Value};
use shakmaty::fen::Fen;
use shakmaty::san::San;
use shakmaty::uci::UciMove;
use shakmaty::{
    CastlingMode, Chess, Color, EnPassantMode, File, FromSetup, Move, Piece, Position, Role, Setup,
    Square,
};
/// The signal an emit turns into (`move` | `position` | `game.over`) and the roster row
/// the seats are drawn from both live in clappkit: four clapps had declared the same two
/// structs, field for field, and the projections had already drifted apart.
pub use clappkit::{AgentRow, Emit};

#[derive(Clone, PartialEq)]
pub enum Seat {
    Empty,
    Human,
    Agent(String), // agent id
}

#[derive(Clone, Copy)]
pub enum Actor {
    User,
    Agent,
}

/// One played half-move. `moves` in the snapshot projects `san` + `color` (the move rail
/// pairs by COLOUR, exactly like Swift); the rest is what lets `takeback` restore the
/// previous last-move highlight.
#[derive(Clone)]
struct MoveRow {
    san: String,
    color: Color,
    from: u32,
    to: u32,
}

/// The position: the canonical (possibly illegal) `Setup` plus the validated `Chess` when
/// one can be derived. `chess` is `None` only after a chaos move left the board in a state
/// shakmaty rejects outright (a captured king, a pawn stranded on the back rank, a king
/// left en prise). Every rules question is answered through `chess`; every rendering
/// question through `setup`.
#[derive(Clone)]
struct PosState {
    setup: Setup,
    chess: Option<Chess>,
}

impl PosState {
    fn start() -> PosState {
        PosState::from_setup(Setup::initial())
    }

    fn from_setup(setup: Setup) -> PosState {
        // Everything shakmaty lets us wave through, we wave through — the stricter kinds
        // (missing king, opposite check, pawns on the back rank) simply mean "no rules
        // engine for this position", which is exactly what chaos mode promises.
        let chess = Chess::from_setup(setup.clone(), CastlingMode::Standard)
            .or_else(|e| e.ignore_invalid_castling_rights())
            .or_else(|e| e.ignore_invalid_ep_square())
            .or_else(|e| e.ignore_impossible_check())
            .or_else(|e| e.ignore_too_much_material())
            .ok();
        PosState { setup, chess }
    }

    fn from_chess(chess: Chess) -> PosState {
        // `Always` (not `Legal`) so the FEN keeps the en-passant target after any double
        // push, which is what the Swift engine emits.
        let setup = chess.clone().into_setup(EnPassantMode::Always);
        PosState { setup, chess: Some(chess) }
    }

    fn turn(&self) -> Color {
        self.setup.turn
    }

    fn fen(&self) -> String {
        Fen::from_setup(self.setup.clone()).to_string()
    }

    fn piece_at(&self, sq: Square) -> Option<Piece> {
        self.setup.board.piece_at(sq)
    }
}

pub struct Game {
    pos: PosState,
    stack: Vec<PosState>,
    history: Vec<MoveRow>,
    status: String, // idle | playing | checkmate | stalemate | draw | resigned | ended
    result: Option<String>,
    winner: Option<Color>,
    last: Option<(u32, u32)>,
    last_san: String,
    white: Seat,
    black: Seat,
    agents: Vec<AgentRow>,
    /// Chaos toggle (default OFF): when on, the side to move may move any of its own
    /// pieces to any square — legality and check are not enforced.
    chaos: bool,
    /// A short note an agent left for the human (`chess say "…"`). Cleared by `new` and by
    /// every move, exactly like Swift's `Game.coach`.
    coach: Option<String>,
}

impl Default for Game {
    fn default() -> Self {
        Game {
            pos: PosState::start(),
            stack: Vec::new(),
            history: Vec::new(),
            status: "idle".into(),
            result: None,
            winner: None,
            last: None,
            last_san: String::new(),
            white: Seat::Empty,
            black: Seat::Empty,
            agents: Vec::new(),
            chaos: false,
            coach: None,
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
    fn row_for(&self, id: &str) -> Option<&AgentRow> {
        self.agents.iter().find(|a| a.id == id)
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
            "fen" => json!({ "ok": true, "fen": self.pos.fen() }),
            "legal" => {
                // `legal [square]` — optionally only the moves leaving one square.
                let from = req
                    .get("square")
                    .and_then(Value::as_str)
                    .and_then(|s| Square::from_ascii(s.to_ascii_lowercase().as_bytes()).ok());
                json!({ "ok": true, "legal": self.legal_list(from) })
            }
            "say" => {
                // A short note for the human, shown next to the board. Set verbatim (an
                // empty string clears it for every reader, as in Swift).
                self.coach = Some(req.get("text").and_then(Value::as_str).unwrap_or("").to_string());
                self.snapshot(caller.as_deref())
            }
            "chaos" => {
                // The "Allow illegal moves" switch. Purely a mode change: it never
                // touches the position, the status or the history.
                self.chaos = req.get("on").and_then(Value::as_bool).unwrap_or(false);
                self.snapshot(caller.as_deref())
            }
            "seat" => {
                // GUI seat picker: {color:"w"|"b", who:"human"|"empty"|"<agent id>"}
                let color = if req.get("color").and_then(Value::as_str) == Some("b") { Color::Black } else { Color::White };
                let seat = match req.get("who").and_then(Value::as_str).unwrap_or("empty") {
                    "human" => Seat::Human,
                    "empty" => Seat::Empty,
                    id => Seat::Agent(id.to_string()),
                };
                if color == Color::White { self.white = seat } else { self.black = seat }
                // Only wake when an agent is dropped onto the side that must move right
                // now; touching the other seat waits for its turn to come around.
                if self.status == "playing" && self.pos.turn() == color {
                    self.kick(&mut emits);
                }
                self.snapshot(caller.as_deref())
            }
            "new" => {
                // {color:"white"|"black"} the HUMAN takes (CLI), else GUI uses current seats.
                if let Some(col) = req.get("color").and_then(Value::as_str) {
                    let human = parse_color(col);
                    // The calling agent takes the other side. Standalone (no agent id)
                    // keeps that side's current occupant, or falls back to a second human
                    // (hotseat) so a CLI-started game always has both seats.
                    let existing = self.seat(human.other()).clone();
                    let opp = match &caller {
                        Some(c) => Seat::Agent(c.clone()),
                        None => if existing == Seat::Empty { Seat::Human } else { existing },
                    };
                    self.white = if human == Color::White { Seat::Human } else { opp.clone() };
                    self.black = if human == Color::Black { Seat::Human } else { opp };
                }
                if !self.seats_ready() {
                    return (err("both seats must be filled first"), emits);
                }
                self.pos = PosState::start();
                self.stack.clear();
                self.history.clear();
                self.status = "playing".into();
                self.result = None;
                self.winner = None;
                self.last = None;
                self.last_san.clear();
                self.coach = None;
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
                let n = req.get("n").and_then(Value::as_u64).unwrap_or(1).max(1) as usize;
                self.takeback(n);
                self.snapshot(caller.as_deref())
            }
            other => err(&format!("unknown command: {other}")),
        };
        (resp, emits)
    }

    /// Undo the last `n` half-moves. Emits no signal and does NOT kick — an agent is not
    /// re-woken after a takeback. A no-op (including the status reset) when nothing is
    /// on the stack.
    fn takeback(&mut self, n: usize) {
        let count = n.min(self.stack.len());
        if count == 0 {
            return;
        }
        for _ in 0..count {
            if let Some(prev) = self.stack.pop() {
                self.pos = prev;
            }
            self.history.pop();
        }
        self.status = "playing".into();
        self.result = None;
        self.winner = None;
        // Restore the highlight of whatever move is now last (none when history is empty).
        self.last = self.history.last().map(|m| (m.from, m.to));
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
            payload: json!({
                "status": "resigned",
                "result": self.result.clone().unwrap_or_default(),
                "winner": self.winner.map(color_str).unwrap_or(""),
            }),
        });
    }

    fn play(&mut self, uci: &str, actor: Actor, caller: Option<String>, emits: &mut Vec<Emit>) -> Result<(), String> {
        if self.status != "playing" {
            return Err("no game in progress — start one with `new`".into());
        }
        let mover = self.pos.turn();
        // Seat ownership: only the occupant of the side to move may move it. Enforced in
        // chaos mode too — chaos loosens the rules of chess, not the rules of the table.
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
        let (from, to, promo) = match uci_move {
            UciMove::Normal { from, to, promotion } => (from, to, promotion),
            _ => return Err("bad move — use UCI like e2e4".into()),
        };

        // Resolve the move. Strict mode (default) requires a legal move; chaos mode
        // accepts any of the mover's own pieces onto any other square.
        let (next, san) = if self.chaos {
            let piece = self.pos.piece_at(from).ok_or_else(|| "illegal move".to_string())?;
            if piece.color != mover || from == to {
                return Err("illegal move".into());
            }
            // Prefer a real legal move (so castling/en-passant/SAN stay correct);
            // otherwise a raw teleport of this piece.
            let legal = self.pos.chess.as_ref().and_then(|c| {
                c.legal_moves()
                    .iter()
                    .find(|m| {
                        matches_square(m, from, to)
                            && (promo.is_none() || m.promotion() == promo || m.promotion().is_none())
                    })
                    .cloned()
            });
            match legal {
                Some(mv) => self.apply_legal(&mv),
                None => {
                    let san = raw_san(piece, from, to, promo);
                    (PosState::from_setup(raw_apply(&self.pos.setup, from, to, promo)), san)
                }
            }
        } else {
            let chess = self.pos.chess.clone().ok_or_else(|| "illegal move".to_string())?;
            let legal: Vec<Move> = chess
                .legal_moves()
                .iter()
                .filter(|m| matches_square(m, from, to))
                .cloned()
                .collect();
            if legal.is_empty() {
                return Err("illegal move".into());
            }
            let chosen = promo
                .and_then(|p| legal.iter().find(|m| m.promotion() == Some(p)).cloned())
                .or_else(|| legal.iter().find(|m| m.promotion().is_none()).cloned())
                .or_else(|| legal.iter().find(|m| m.promotion() == Some(Role::Queen)).cloned())
                .unwrap_or_else(|| legal[0].clone());
            self.apply_legal(&chosen)
        };

        self.stack.push(self.pos.clone());
        self.pos = next;
        self.history.push(MoveRow {
            san: san.clone(),
            color: mover,
            from: u32::from(from),
            to: u32::from(to),
        });
        self.last = Some((u32::from(from), u32::from(to)));
        self.last_san = san.clone();
        self.coach = None; // a played move retires the note (Swift: `coach = nil`)
        self.update_status(mover);

        // `position` (buffered) rides after every move to everyone watching.
        emits.push(Emit { id: "position".into(), target: vec![], payload: json!({ "fen": self.pos.fen(), "last": san }) });
        if self.status == "playing" {
            self.kick(emits); // wake the side to move if it's an agent (the whole vs-loop)
        } else {
            emits.push(Emit {
                id: "game.over".into(),
                target: vec![],
                payload: json!({
                    "status": self.status,
                    "result": self.result.clone().unwrap_or_default(),
                }),
            });
        }
        Ok(())
    }

    /// Play a validated shakmaty move, returning the next position and its real SAN.
    fn apply_legal(&self, mv: &Move) -> (PosState, String) {
        let chess = self.pos.chess.clone().expect("a legal move implies a legal position");
        let san = San::from_move(&chess, mv).to_string();
        let mut next = chess;
        next.play_unchecked(mv);
        (PosState::from_chess(next), san)
    }

    /// If a game is in progress and the side to move is an agent, wake exactly it.
    fn kick(&self, emits: &mut Vec<Emit>) {
        if self.status != "playing" {
            return;
        }
        if let Seat::Agent(id) = self.seat(self.pos.turn()) {
            let mut payload = json!({ "fen": self.pos.fen(), "turn": color_str(self.pos.turn()) });
            if !self.last_san.is_empty() {
                payload["san"] = json!(self.last_san);
            }
            emits.push(Emit { id: "move".into(), target: vec![id.clone()], payload });
        }
    }

    fn update_status(&mut self, mover: Color) {
        // Chaos mode can capture a king outright — that, and only that, ends such a game
        // (normal mate/stalemate detection assumes a legal position, so we skip it).
        if self.pos.setup.board.king_of(mover.other()).is_none() {
            self.status = "checkmate".into();
            self.winner = Some(mover);
            self.result = Some(if mover == Color::White { "1-0".into() } else { "0-1".into() });
            return;
        }
        if self.chaos {
            self.status = "playing".into();
            return;
        }
        let Some(pos) = self.pos.chess.as_ref() else {
            self.status = "playing".into();
            return;
        };
        if pos.is_checkmate() {
            self.status = "checkmate".into();
            self.winner = Some(mover);
            self.result = Some(if mover == Color::White { "1-0".into() } else { "0-1".into() });
        } else if pos.is_stalemate() {
            self.status = "stalemate".into();
            self.winner = None;
            self.result = Some("1/2-1/2".into());
        } else if pos.halfmoves() >= 100 || pos.is_insufficient_material() {
            self.status = "draw".into();
            self.winner = None;
            self.result = Some("1/2-1/2".into());
        } else {
            self.status = "playing".into();
        }
    }

    // MARK: projections

    fn legal_list(&self, from: Option<Square>) -> Vec<Value> {
        if self.status != "playing" {
            return vec![];
        }
        let Some(pos) = self.pos.chess.as_ref() else {
            return vec![];
        };
        // Castling is reported as the KING's two-square destination (g1/c1), not
        // shakmaty's rook square — that is the square the board draws a dot on.
        pos.legal_moves()
            .iter()
            .filter(|m| from.is_none_or(|f| m.from() == Some(f)))
            .map(|m| {
                json!({
                    "from": m.from().map(u32::from).unwrap_or(0),
                    "to": u32::from(target_square(m)),
                    "promo": m.promotion().map(role_char),
                })
            })
            .collect()
    }

    fn player(&self, c: Color) -> Value {
        match self.seat(c) {
            Seat::Empty => json!({ "kind": "empty" }),
            Seat::Human => json!({ "kind": "human", "name": "You" }),
            Seat::Agent(id) => {
                // An id that has dropped out of the roster keeps its seat and renders as
                // an offline agent: a name, no model/backend/avatar.
                let row = self.row_for(id);
                json!({
                    "kind": "agent",
                    "id": id,
                    "name": row.map(|a| a.name.clone()).unwrap_or_else(|| "Agent".into()),
                    "model": row.and_then(|a| a.model.clone()),
                    "backend": row.and_then(|a| a.backend.clone()),
                    "avatar": row.and_then(|a| a.avatar.clone()),
                })
            }
        }
    }

    pub fn snapshot(&self, caller: Option<&str>) -> Value {
        let board: Vec<Value> = Square::ALL
            .iter()
            .map(|&sq| match self.pos.piece_at(sq) {
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
        let in_check = self.status == "playing"
            && self.pos.chess.as_ref().map(Position::is_check).unwrap_or(false);
        json!({
            "ok": true,
            // Stamped BEFORE anything else is read: strictly increasing per snapshot, so
            // the webview can discard any snapshot older than the one it already holds
            // (the invoke response and the pushed `state` event race). One process-wide
            // counter in clappkit, because a clapp has one state.
            "rev": clappkit::snapshot::next_rev(),
            "fen": self.pos.fen(),
            "turn": color_str(self.pos.turn()),
            "status": self.status,
            "result": self.result,
            "winner": self.winner.map(color_str),
            "inCheck": in_check,
            "chaos": self.chaos,
            "board": board,
            "white": self.player(Color::White),
            "black": self.player(Color::Black),
            "yourColor": your_color,
            "last": self.last.map(|(f, t)| json!({ "from": f, "to": t })),
            "legal": self.legal_list(None),
            // Each half-move carries its COLOUR: the move rail pairs by colour (so a game
            // that starts on Black's move renders the "…" placeholder), never by index.
            "moves": self
                .history
                .iter()
                .map(|m| json!({ "san": m.san, "color": color_str(m.color) }))
                .collect::<Vec<_>>(),
            "coach": self.coach,
            "seatsReady": self.seats_ready(),
            "hasHuman": self.has_human(),
            "agents": self
                .agents
                .iter()
                .map(|a| json!({
                    "id": a.id,
                    "name": a.name,
                    "model": a.model,
                    "backend": a.backend,
                    "avatar": a.avatar,
                }))
                .collect::<Vec<_>>(),
        })
    }
}

// MARK: helpers

/// The square a move *lands the moved piece on*. `shakmaty` reports castling by its rook
/// square; the board (and the Swift original) speak in the king's destination.
fn target_square(m: &Move) -> Square {
    match *m {
        Move::Castle { king, rook } => {
            let file = if rook < king { File::C } else { File::G };
            Square::from_coords(file, king.rank())
        }
        _ => m.to(),
    }
}

/// Does `m` go from `from` to `to`? Castling matches on the king's destination (e1g1) and,
/// for tolerance with UCI dialects, on the rook square too (e1h1).
fn matches_square(m: &Move, from: Square, to: Square) -> bool {
    m.from() == Some(from) && (target_square(m) == to || m.to() == to)
}

/// Chaos mode: relocate a piece with no rules at all. Mirrors the Swift `make` bookkeeping
/// — en-passant cleared, castling rights touched, halfmove/fullmove clocks advanced.
fn raw_apply(setup: &Setup, from: Square, to: Square, promo: Option<Role>) -> Setup {
    let mut s = setup.clone();
    let Some(moving) = s.board.piece_at(from) else { return s };
    let captured = s.board.piece_at(to);

    s.board.discard_piece_at(from);
    s.board.discard_piece_at(to);
    s.board.set_piece_at(
        to,
        Piece { color: moving.color, role: promo.unwrap_or(moving.role) },
    );

    s.ep_square = None;
    if moving.role == Role::King {
        let (a, h) = if moving.color == Color::White {
            (Square::A1, Square::H1)
        } else {
            (Square::A8, Square::H8)
        };
        s.castling_rights.discard(a);
        s.castling_rights.discard(h);
    }
    s.castling_rights.discard(from);
    s.castling_rights.discard(to);

    s.halfmoves = if moving.role == Role::Pawn || captured.is_some() { 0 } else { s.halfmoves + 1 };
    if s.turn == Color::Black {
        s.fullmoves = s.fullmoves.saturating_add(1);
    }
    s.turn = !s.turn;
    s
}

/// A compact label for a raw (illegal) move, distinct from real SAN: `Nb1→h7`, `e2→e7`,
/// `a7→a8=Q`. The arrow is U+2192.
fn raw_san(piece: Piece, from: Square, to: Square, promo: Option<Role>) -> String {
    let prefix = if piece.role == Role::Pawn { String::new() } else { role_char(piece.role).to_uppercase() };
    let mut s = format!("{prefix}{from}\u{2192}{to}");
    if let Some(p) = promo {
        s.push('=');
        s.push_str(&role_char(p).to_uppercase());
    }
    s
}

fn err(msg: &str) -> Value {
    json!({ "ok": false, "error": msg })
}

/// `new [white|black|random]` — the colour word the HUMAN takes. Mirrors Swift's
/// `parseColor`: anything unrecognised is White; `random` really is a coin flip.
fn parse_color(s: &str) -> Color {
    match s.to_ascii_lowercase().as_str() {
        "b" | "black" => Color::Black,
        "random" => {
            let n = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0);
            if n % 2 == 0 { Color::White } else { Color::Black }
        }
        _ => Color::White,
    }
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

/// Parity tests against the Swift original: the exact strings, squares and signal
/// payloads the GUI and the agents are promised.
#[cfg(test)]
mod tests {
    use super::*;

    fn new_game() -> Game {
        let mut g = Game::default();
        g.handle(&json!({"cmd":"seat","color":"w","who":"human"}), None);
        g.handle(&json!({"cmd":"seat","color":"b","who":"human"}), None);
        g.handle(&json!({"cmd":"new"}), None);
        g
    }
    fn mv(g: &mut Game, uci: &str) -> Value {
        g.handle(&json!({"cmd":"move","uci":uci}), None).0
    }

    #[test]
    fn normal_play() {
        let mut g = new_game();
        let s = mv(&mut g, "e2e4");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["moves"], json!([{"san":"e4","color":"w"}]));
        assert_eq!(s["last"], json!({"from":12,"to":28}));
        assert_eq!(s["fen"].as_str().unwrap(),
                   "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
        assert_eq!(s["chaos"], json!(false));
        assert_eq!(s["white"], json!({"kind":"human","name":"You"}));
        // takeback restores
        let s = g.handle(&json!({"cmd":"takeback","n":1}), None).0;
        assert_eq!(s["last"], Value::Null);
        assert_eq!(s["moves"], json!([]));
        // takeback on an empty stack is a no-op (status stays)
        let mut idle = Game::default();
        let s = idle.handle(&json!({"cmd":"takeback","n":1}), None).0;
        assert_eq!(s["status"], json!("idle"));
    }

    #[test]
    fn takeback_restores_previous_highlight() {
        let mut g = new_game();
        mv(&mut g, "e2e4");
        mv(&mut g, "e7e5");
        let s = g.handle(&json!({"cmd":"takeback","n":1}), None).0;
        assert_eq!(s["last"], json!({"from":12,"to":28}));
        assert_eq!(s["moves"], json!([{"san":"e4","color":"w"}]));
    }

    #[test]
    fn castling_target_is_king_square() {
        let mut g = new_game();
        for u in ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"] { mv(&mut g, u); }
        let s = g.handle(&json!({"cmd":"state"}), None).0;
        let legal = s["legal"].as_array().unwrap();
        let has_g1 = legal.iter().any(|m| m["from"] == json!(4) && m["to"] == json!(6));
        assert!(has_g1, "expected e1->g1 castling target, got {legal:?}");
        let s = mv(&mut g, "e1g1");
        assert_eq!(s["moves"].as_array().unwrap().last().unwrap(), &json!({"san":"O-O","color":"w"}));
    }

    #[test]
    fn promotion_via_uci_suffix() {
        let mut g = new_game();
        for u in ["a2a4", "b7b5", "a4b5", "a7a6", "b5a6", "g8f6", "a6a7", "f6g8"] {
            let r = mv(&mut g, u);
            assert_eq!(r["ok"], json!(true), "{u}: {r}");
        }
        let s = mv(&mut g, "a7b8q");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["moves"].as_array().unwrap().last().unwrap()["san"], json!("axb8=Q"));
    }

    #[test]
    fn chaos_raw_move_and_king_capture() {
        let mut g = new_game();
        let s = mv(&mut g, "b1h7");
        assert_eq!(s["ok"], json!(false));
        g.handle(&json!({"cmd":"chaos","on":true}), None);
        let s = mv(&mut g, "b1h7");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["chaos"], json!(true));
        assert_eq!(s["moves"], json!([{"san":"Nb1\u{2192}h7","color":"w"}]));
        assert_eq!(s["status"], json!("playing"));
        // legal moves still come from the real rules
        assert!(!s["legal"].as_array().unwrap().is_empty());
        // real legal moves still resolve to real SAN in chaos
        let s = mv(&mut g, "e7e5");
        assert_eq!(s["moves"].as_array().unwrap().last().unwrap()["san"], json!("e5"));
        // capture the black king outright
        let s = mv(&mut g, "h7e8");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["status"], json!("checkmate"));
        assert_eq!(s["winner"], json!("w"));
        assert_eq!(s["result"], json!("1-0"));
    }

    #[test]
    fn chaos_pawn_promotion_label() {
        let mut g = new_game();
        g.handle(&json!({"cmd":"chaos","on":true}), None);
        let s = mv(&mut g, "a2a8q");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["moves"], json!([{"san":"a2\u{2192}a8=Q","color":"w"}]));
    }

    #[test]
    fn seat_ownership_and_agents() {
        let mut g = Game::default();
        g.set_agents(vec![AgentRow {
            id: "a1".into(), name: "Cline".into(),
            backend: Some("cline-acp".into()), model: Some("claude-opus-4-8".into()),
            avatar: Some("/tmp/x.png".into()),
        }]);
        g.handle(&json!({"cmd":"seat","color":"w","who":"human"}), None);
        g.handle(&json!({"cmd":"seat","color":"b","who":"a1"}), None);
        let (s, emits) = g.handle(&json!({"cmd":"new"}), None);
        assert_eq!(s["seatsReady"], json!(true));
        assert_eq!(s["hasHuman"], json!(true));
        assert_eq!(s["black"]["model"], json!("claude-opus-4-8"));
        assert_eq!(s["black"]["avatar"], json!("/tmp/x.png"));
        assert_eq!(s["agents"][0]["backend"], json!("cline-acp"));
        assert!(emits.is_empty(), "white is human, nothing to wake");
        // agent a1 may not move on White's turn
        let r = g.handle(&json!({"cmd":"move","uci":"e7e5"}), Some("a1".into())).0;
        assert_eq!(r["error"], json!("not your turn"));
        // white human moves -> a1 is woken
        let (_, emits) = g.handle(&json!({"cmd":"move","uci":"e2e4"}), None);
        let ids: Vec<&str> = emits.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec!["position", "move"]);
        assert_eq!(emits[1].target, vec!["a1".to_string()]);
        assert_eq!(emits[1].payload["san"], json!("e4"));
        // an unseated roster loss renders as an offline agent
        g.set_agents(vec![]);
        let s = g.handle(&json!({"cmd":"state"}), None).0;
        assert_eq!(s["black"], json!({"kind":"agent","id":"a1","name":"Agent","model":null,"backend":null,"avatar":null}));
        let s = g.handle(&json!({"cmd":"state"}), Some("a1".into())).0;
        assert_eq!(s["yourColor"], json!("b"));
    }

    #[test]
    fn resign_and_end_emit_payloads() {
        let mut g = new_game();
        let (s, emits) = g.handle(&json!({"cmd":"resign"}), None);
        assert_eq!(s["status"], json!("resigned"));
        assert_eq!(emits[0].payload, json!({"status":"resigned","result":"0-1","winner":"b"}));
        let mut g2 = new_game();
        let (_, emits) = g2.handle(&json!({"cmd":"end"}), None);
        assert_eq!(emits[0].payload, json!({"status":"ended"}));
    }

    #[test]
    fn checkmate_ends_the_game() {
        let mut g = new_game();
        for u in ["f2f3","e7e5","g2g4"] { mv(&mut g, u); }
        let (s, emits) = g.handle(&json!({"cmd":"move","uci":"d8h4"}), None);
        assert_eq!(s["status"], json!("checkmate"));
        assert_eq!(s["winner"], json!("b"));
        assert_eq!(emits.last().unwrap().payload, json!({"status":"checkmate","result":"0-1"}));
    }
    #[test]
    fn chaos_illegal_position_keeps_going() {
        let mut g = new_game();
        g.handle(&json!({"cmd":"chaos","on":true}), None);
        // White teleports its king next to Black's: the side that is NOT to move is in
        // check, a setup shakmaty refuses to validate at all.
        let s = mv(&mut g, "e1d7");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["status"], json!("playing"));
        assert_eq!(s["legal"], json!([]));
        assert_eq!(s["inCheck"], json!(false));
        assert_eq!(s["board"][51], json!("wK"));
        // still playable, still raw-labelled
        let s = mv(&mut g, "a8a5");
        assert_eq!(s["ok"], json!(true), "{s}");
        assert_eq!(s["moves"], json!([{"san":"Ke1\u{2192}d7","color":"w"}, {"san":"Ra8\u{2192}a5","color":"b"}]));
        // takeback walks back into a position the rules engine understands again
        g.handle(&json!({"cmd":"takeback","n":2}), None);
        let s = g.handle(&json!({"cmd":"state"}), None).0;
        assert!(!s["legal"].as_array().unwrap().is_empty());
        // and strict mode refuses raw moves again
        g.handle(&json!({"cmd":"chaos","on":false}), None);
        let s = mv(&mut g, "e1d7");
        assert_eq!(s["error"], json!("illegal move"));
    }

    #[test]
    fn new_needs_both_seats() {
        let mut g = Game::default();
        let s = g.handle(&json!({"cmd":"new"}), None).0;
        assert_eq!(s["ok"], json!(false));
        assert_eq!(s["status"], Value::Null);
    }
}
