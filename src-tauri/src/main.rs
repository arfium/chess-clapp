//! chess — one binary, two roles: `chess app` is the Tauri window Clatch launches;
//! `chess <verb>` is the agent's CLI. Cross-platform via clappkit; the engine is
//! shakmaty. No platform code.

#![cfg_attr(all(not(debug_assertions), windows), windows_subsystem = "windows")]

mod app;
mod cli;
mod game;

use clappkit::role::{role, Role};

const APP_ID: &str = "com.arfium.chess";

fn main() {
    match role() {
        Role::Cli(args) => {
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime")
                .block_on(cli::run(args));
        }
        Role::App => match clappkit::bootstrap(APP_ID) {
            Ok(true) => {}
            Ok(false) => app::run(),
            Err(e) => {
                eprintln!("chess: {e}");
                std::process::exit(1);
            }
        },
    }
}
