# Contributing to chess-clapp

**chess** is a Clatch app (a "clapp"): one binary with two roles — a desktop **GUI** for
the human and a **CLI** for the agent — over one shared game state. It is Rust + Tauri v2
on the shared [`clappkit`](../../clappkit) crate, with a React/TypeScript webview.

## Ground rules

- **KISS.** The plumbing lives in clappkit; this repo should stay *chess*. If you find
  yourself writing something that is not about chess, it probably belongs in clappkit —
  and a change there is a change to all five clapps, so make it there deliberately.
- **The contract is the Clapp Protocol.** The normative truth is
  [`docs/protocol.md`](../docs/protocol.md) (manifest + control pipe); Clatch's own
  [`reference/`](https://github.com/arfium/clatch) specs cover launcher internals. On
  conflict, the protocol wins.
- **The things that must agree.** `clatch.json`, the Rust, and `chess --help` share the
  same app **id**, CLI **name**, **verbs** and **signal** vocabulary. `clatch validate`
  checks the manifest against the files; `node scripts/check-manifest.mjs` checks it
  against the code. Run both.
- **It must build and validate.** `npm run verify` is green: build → package → `clatch
  validate pkg` → a real socket round-trip between the CLI and the running window.
  Build with `npm run build`, never a bare `cargo build --release` (see AGENTS.md).
- **The Swift original is the spec, not the build.** `native/` is the SwiftUI app this was
  ported from. Behaviour changes are checked against it — see the parity tests in
  `src-tauri/src/game.rs`. Visual parity has been audited: don't restyle the board.
- **No silent failures.** Every dropped signal, denied command, or fallback is
  visible in an error or the timeline. Fail-safe beats fail-open.
- **Small, coherent PRs.** One concern per PR.

## Branches

`main` holds release code. Do daily work on short branches (`feat/…`, `fix/…`,
`chore/…`) and open a PR; CI checks that the manifest and the code still agree (it cannot
compile the Rust until clappkit is published — see `.github/workflows/ci.yml`), so
`npm run verify` on your own machine is the real gate. Releases are `v*` tags.

## Getting started

```sh
git clone https://github.com/arfium/chess-clapp && cd chess-clapp
npm ci
npm run build                          # the shippable binary, frontend embedded
CLATCH_STANDALONE=1 bin/chess app &    # the GUI, without a launcher (dev hatch)
bin/chess board                        # drive it like the agent would
npm run package                        # → pkg/, ready for `clatch install`
```

Prerequisites: Node 20+, a Rust toolchain, and Tauri v2's platform prerequisites
(macOS: Xcode Command Line Tools). The sibling `clappkit/` and `clatch/` checkouts must
sit beside this repo — `src-tauri/Cargo.toml` path-depends on them. `clatch validate`
needs the `clatch` binary (on PATH, or `CLATCH_BIN=…`).

Commit messages: imperative subject, body explains *why*.

## License

Apache-2.0. By contributing you agree your contribution is licensed under the same
terms (inbound = outbound). No CLA.
