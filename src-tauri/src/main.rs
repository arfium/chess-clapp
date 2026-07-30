//! chess — one binary, two roles: `chess app` is the Tauri window Clatch launches;
//! `chess <verb>` is the agent's CLI. Cross-platform via clappkit; the engine is
//! shakmaty. No platform code.
//!
//! Deliberately NOT `#![cfg_attr(…, windows_subsystem = "windows")]`. That attribute
//! applies to the whole image, but this image is TWO roles and the CLI role is the
//! agent's entire interface: a GUI-subsystem process gets no console (every `println!`
//! in `cli.rs` would go nowhere) and is not waited on by the `.cmd` shim Clatch links
//! onto the agent's PATH, so `chess board` would return instantly, empty, with exit
//! code 0. Clatch already spawns the launch command with `CREATE_NO_WINDOW`, so a
//! console-subsystem clapp shows no console window anyway.

mod app;
mod cli;
mod game;

const APP_ID: &str = "com.arfium.chess";

/// Dispatch on argv, then either run the agent's CLI on a fresh runtime or bootstrap
/// (run-only-under-Clatch) into the GUI — [`clappkit::role::main_dispatch`] is that
/// whole decision, shared by every clapp.
fn main() {
    clappkit::role::main_dispatch(APP_ID, "chess", cli::run, app::run)
}
