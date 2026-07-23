# Changelog

All notable changes to chess. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: pre-1.0, minor
bumps may break (SemVer 0.x rules).

## [Unreleased]

### Changed
- **Adopt the frozen Clapp Protocol** ([docs/protocol.md](docs/protocol.md)). The
  control pipe is now `app.toAgent {id, type, target, payload}` (the type is stamped
  from the declaration and re-validated by Clatch), `app.register {instanceToken}`,
  and `app.toAgentRefused {id, agent, reason}`; framing is fail-fast; a wired app
  exits when the pipe drops. `connector.signals` are `{id, type}`. `ControlPipe.swift`
  is the template's final transport verbatim.
- **The board is now ArfChess's** — cburnett **PNG** pieces on a lichess-style
  green/cream Canvas board with a light native control bar (`ContentView` ported from
  ArfChess's `BoardView`, `PieceArt` loader with a Unicode fallback). Replaces the
  Unicode-glyph board; the Clatch Phosphor theme (`Theme.swift`) and the Plus Jakarta
  Sans fonts are dropped (the app is self-styled, like ArfChess).

### Added
- **Release workflow** (`.github/workflows/release.yml`): pushing a `v*` tag builds
  the host `<id>-macos-arm64.clapp` depot + a `.sha256` and publishes them as a GitHub
  Release, so end users install with `clatch install github:arfium/chess-clapp[@vX]`
  (no source checkout).
- **`position` signal** (declared `buffered`): after **every** move — human or agent —
  the live board (FEN) rides the agent's chat buffer, so a "best move?" prompt arrives
  with the current position attached. This is the third signal type end to end
  (`move`=run, `position`=buffered, `game.over`=context).
- **`scripts/rename.sh`** — fork the template into your own app in one command
  (`scripts/rename.sh <cli> <id> "<Name>"`): renames the Sources dir, `bin/`,
  `AppInfo`, manifest, `Package.swift`, scripts, and the icon.
- **`scripts/verify.sh`** (`npm run verify`) — build + package + `clatch validate`
  + a GUI↔CLI socket round-trip, one PASS/FAIL. New npm scripts: `verify`, `rename`,
  `validate`, `pack`.
- **`.claude/`** vibe-coding helpers: a command allowlist (fewer permission prompts)
  and `/verify` + `/fork` slash commands. Plus `.editorconfig`.
- AGENTS.md is now the coding-agent's build/fork brain (orientation, commands, the
  Clapp v1 contract, the edit-vs-keep file map, conventions) with a short
  operate-the-demo section.

### Changed
- App-name strings in the Swift (`ContentView` header/monogram, `AppState`
  greeting) now read from `AppInfo.cli` — identity has ONE source, and the rename
  touches less.
- **Clapp v1 contract** (tracks Clatch #133): the manifest's `agent` block is now
  `connector`, and `connector.signals` declares each signal as `{name, type}`
  (`run` | `context` | `buffered`). The `app.toAgent` envelope is
  `{id, type, target, payload}` — `SignalMode`/`SignalKind` are gone from the
  Swift wire and `emitSignal` drops its `mode:`/`kind:` parameters; a signal's
  type is fixed by its declaration and can never be chosen at emission. `changed`
  is declared `context` (ordered, lossless queue), `poke` is declared `run`. The
  new `buffered` type (the agent's chat-buffer strip) is documented in
  ARCHITECTURE § Signals. Docs also drop the removed app-autostart mechanic and
  reflect that `connector.cli` is mandatory (`<cli> -h` is the floor).
- Design tokens track Clatch's **Phosphor** theme (its `design.css` default): the
  accent moves `#d2f900 → #e1ff00` (bright) and `#a8c900 → #378c69` (deep), the
  destructive `#ff4d2e → #ff0d00` (Blood), plus new `hazard2`/`accentInk` tokens.
  The app icon is regenerated on the Phosphor gradient. Workspace/dark tokens,
  radii, spacing, and the type scale are unchanged.

### Added
- Signal **targeting** (tracks Clatch #77): `ControlPipe.emitSignal` takes an
  optional `target: [String]` — empty broadcasts (unchanged), non-empty delivers
  only to the named agents (still bounded by the cut matrix). The CLI now forwards
  its `CLATCH_AGENT` to the app (`Request.agent`), and `AppState` records the caller
  as `lastAgent`, so a fork can target the agent who invoked it. Documented in
  ARCHITECTURE § Targeting; the clock example uses it to wake exactly the agent who
  set each alarm.

## [0.1.0] - 2026-07-15

### Added
- Initial template: a one-binary, two-role Swift/SwiftUI Clatch app — a native GUI
  (the human) and an agent CLI over one `@MainActor` shared state
  ("don't imitate the screen, share the state").
- Both Clatch channels wired: the GUI↔CLI Unix socket (`IPC.swift`) and the
  Clatch↔App control pipe (`ControlPipe.swift`), plus the `clatch_init` bootstrap
  (run only under Clatch) and the `CLATCH_STANDALONE` dev hatch (`Bootstrap.swift`).
- Both signal modes demonstrated: `run` (wakes the agent now) and `context`/`log`
  (informs it).
- The Clatch design system in SwiftUI (`Theme.swift`), ported from the launcher's
  `design.css`: the dark "space" ground, the volt `#d2f900` accent, Plus Jakarta
  Sans (bundled TTF), and the `Panel`/`Eyebrow`/`Badge`/`VoltButtonStyle`/
  `ClatchFieldStyle` atoms.
- Packaging (`scripts/package.sh` → `dist/`) that passes `clatch validate`.
- Docs: README, ARCHITECTURE, TEMPLATE (fork guide), AGENTS/CLAUDE.
- Repo governance: Apache-2.0 license, `.github/` (CONTRIBUTING, SECURITY,
  CODEOWNERS), and macOS CI (`swift build`).

[Unreleased]: https://github.com/arfium/chess/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/arfium/chess/releases/tag/v0.1.0
