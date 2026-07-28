//! The GUI process: a Tauri window over the same `Game` the CLI drives. The webview
//! calls `run_cmd` and listens for `state` events; the agent's IPC goes through the SAME
//! `Game::handle`, and the moves it produces emit on the control pipe (the vs-loop).

use crate::game::{AgentRow, Game};
use clappkit::{ipc, Control};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

pub type SharedGame = Arc<Mutex<Game>>;
const CLI: &str = "chess";

pub fn run() {
    let game: SharedGame = Arc::new(Mutex::new(Game::default()));

    let control = tauri::async_runtime::block_on(clappkit::connect(clappkit::declared_signals()))
        .unwrap_or_else(|e| {
            eprintln!("chess: {e}");
            std::process::exit(1);
        });

    tauri::Builder::default()
        .manage(game.clone())
        .manage(control.clone())
        .setup(move |app| {
            spawn_ipc(game.clone(), control.clone(), app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_cmd])
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
    let resp = apply(&game, &control, &req, None).await;
    let _ = app.emit("state", game.lock().await.snapshot(None));
    Ok(resp)
}

async fn apply(game: &SharedGame, control: &Control, req: &Value, caller: Option<String>) -> Value {
    let (resp, emits) = {
        let mut g = game.lock().await;
        g.set_agents(roster(control));
        g.handle(req, caller)
    };
    for e in emits {
        control.emit(&e.id, e.target, e.payload);
    }
    resp
}

fn spawn_ipc(game: SharedGame, control: Control, app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let handler = move |req: Value| {
            let game = game.clone();
            let control = control.clone();
            let app = app.clone();
            async move {
                let caller = req.get("agent").and_then(|v| v.as_str()).map(String::from);
                let resp = apply(&game, &control, &req, caller.clone()).await;
                let _ = app.emit("state", game.lock().await.snapshot(caller.as_deref()));
                resp
            }
        };
        if let Err(e) = ipc::serve(&ipc::address(CLI), handler).await {
            eprintln!("chess: ipc: {e}");
        }
    });
}

fn roster(control: &Control) -> Vec<AgentRow> {
    control
        .agents()
        .into_iter()
        .map(|a| AgentRow { id: a.id, name: a.name })
        .collect()
}
