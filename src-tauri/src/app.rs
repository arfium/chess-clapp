//! The GUI process: a Tauri window over the same `Game` the CLI drives. The webview
//! calls `run_cmd` and listens for `state` events; the agent's IPC goes through the SAME
//! `Game::handle`, and the moves it produces emit on the control pipe (the vs-loop).
//!
//! The plumbing — the icon, the window verbs, the `asset` bridge, the GUI↔CLI relay —
//! is [`clappkit::app`], shared by every clapp. What is left here is chess: the `Game`
//! behind a mutex, and the one `apply` that mutates it.

use crate::game::Game;
use clappkit::app::Reply;
use clappkit::{Control, WindowPolicy};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

pub type SharedGame = Arc<Mutex<Game>>;
const CLI: &str = "chess";

/// The app's own mark, embedded so the bare executable can set its Dock/taskbar icon at
/// runtime — there is no `.app` bundle to carry it (the house standard is
/// `../template-clapp/docs/ICONS.md`; `scripts/render-icon.sh` regenerates these bytes).
/// The bytes stay per-app because they ARE the app's identity; the inset-and-apply dance
/// is clappkit's.
const ICON_PNG: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../assets/icon.png"));

pub fn run() {
    let game: SharedGame = Arc::new(Mutex::new(Game::default()));
    let control = tauri::async_runtime::block_on(clappkit::connect_or_die(CLI));

    tauri::Builder::default()
        .manage(game.clone())
        .manage(control.clone())
        .setup(move |app| {
            clappkit::app::apply_icon(app.handle(), ICON_PNG);
            // The agent's private GUI↔CLI channel. `ping` / `focus` / `close` are answered
            // by clappkit before the game sees them; everything else lands in `apply` with
            // the caller's agent id attached.
            let game = game.clone();
            let control = control.clone();
            clappkit::app::spawn_ipc(
                app.handle().clone(),
                CLI,
                WindowPolicy::default(),
                move |req, caller| {
                    let game = game.clone();
                    let control = control.clone();
                    async move { apply(&game, &control, &req, caller).await }
                },
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_cmd, asset])
        .run(tauri::generate_context!())
        .expect("error while running chess");
}

#[tauri::command]
async fn run_cmd(
    req: Value,
    game: State<'_, SharedGame>,
    control: State<'_, Control>,
    app: AppHandle,
) -> Result<Value, String> {
    let reply = apply(&game, &control, &req, None).await;
    clappkit::app::push_state(&app, reply.snapshot);
    Ok(reply.resp)
}

/// The avatar bridge: the webview cannot open `file://` URLs and the roster only ever
/// hands out absolute paths. A Tauri command must be declared in the app's own crate for
/// `generate_handler!` to see it, so this is the shim; the reading and the MIME table are
/// [`clappkit::asset`].
#[tauri::command]
fn asset(path: String) -> Option<String> {
    clappkit::app::asset(&path)
}

/// Run one command against the game and answer with BOTH the caller's response and the
/// snapshot to broadcast — taken inside the same lock, so the state pushed to the window
/// can never describe a different moment than the response the caller got.
async fn apply(game: &SharedGame, control: &Control, req: &Value, caller: Option<String>) -> Reply {
    let (resp, snapshot, emits) = {
        let mut g = game.lock().await;
        g.set_agents(control.roster());
        let (resp, emits) = g.handle(req, caller.clone());
        (resp, g.snapshot(caller.as_deref()), emits)
    };
    control.emit_all(emits);
    Reply::new(resp, snapshot)
}
