//! The GUI process: a Tauri window over the same `Game` the CLI drives. The webview
//! calls `run_cmd` and listens for `state` events; the agent's IPC goes through the SAME
//! `Game::handle`, and the moves it produces emit on the control pipe (the vs-loop).

use crate::game::{AgentRow, Game};
use base64::Engine as _;
use clappkit::{ipc, Control};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

pub type SharedGame = Arc<Mutex<Game>>;
const CLI: &str = "chess";

/// The app's own mark, embedded so the bare executable can set its Dock/taskbar icon at
/// runtime — there is no `.app` bundle to carry it (docs/ICONS.md, docs/PLAYBOOK.md).
const ICON_PNG: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../assets/icon.png"));

/// Give this bare executable its own icon the moment the app comes up: the Dock on macOS,
/// the window (hence taskbar) on Windows/Linux. Called on the main thread from `setup`.
fn apply_icon(app: &AppHandle) {
    clappkit::set_dock_icon(ICON_PNG);
    #[cfg(not(target_os = "macos"))]
    if let Some(w) = app.get_webview_window("main") {
        if let Ok(img) = tauri::image::Image::from_bytes(&clappkit::dock_icon(ICON_PNG)) {
            let _ = w.set_icon(img);
        }
    }
    #[cfg(target_os = "macos")]
    let _ = app;
}

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
            apply_icon(app.handle());
            spawn_ipc(game.clone(), control.clone(), app.handle().clone());
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
    let resp = apply(&game, &control, &req, None).await;
    let _ = app.emit("state", game.lock().await.snapshot(None));
    Ok(resp)
}

/// Read a local image (an agent's avatar, whose path Clatch resolved for us) and hand the
/// webview a `data:` URI. The webview cannot open file:// URLs, and the roster only ever
/// gives us absolute paths — so this is the one bridge. `None` when the file is unreadable.
#[tauri::command]
fn asset(path: String) -> Option<String> {
    let bytes = std::fs::read(&path).ok()?;
    let mime = match Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/png",
    };
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
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
                // Window verbs never reach the game: they are the app process itself.
                if let Some(resp) = window_cmd(&app, &req) {
                    return resp;
                }
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

/// `ping` · `focus` · `quit` — the three verbs the Swift `AppDelegate.handle` answers on
/// its own, before the game sees anything. `None` means "not a window verb".
fn window_cmd(app: &AppHandle, req: &Value) -> Option<Value> {
    match req.get("cmd").and_then(Value::as_str)? {
        "ping" => Some(json!({ "ok": true })),
        "focus" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            Some(json!({ "ok": true }))
        }
        "quit" => {
            // Answer first, exit after — the CLI is still holding the socket.
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
                app.exit(0);
            });
            Some(json!({ "ok": true, "message": "bye" }))
        }
        _ => None,
    }
}

fn roster(control: &Control) -> Vec<AgentRow> {
    control
        .agents()
        .into_iter()
        .map(|a| AgentRow {
            id: a.id,
            name: a.name,
            backend: Some(a.backend).filter(|s| !s.is_empty()),
            model: a.model.filter(|s| !s.is_empty()),
            avatar: a.avatar.map(|av| av.path).filter(|s| !s.is_empty()),
        })
        .collect()
}
