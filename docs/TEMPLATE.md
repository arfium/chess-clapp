# Forking this template

Turn `clapp` into your app: **one command** to rename, then replace two files.

## 1. Rename — one command

Pick an **id** (reverse-DNS, e.g. `com.acme.notes`), a **CLI name** (short,
lowercase, globally unique among installed Clatch apps, e.g. `notes`), and a
display **name** (e.g. `Notes`). Then:

```sh
scripts/rename.sh notes com.acme.notes "Notes"
```

It renames the Sources dir + `bin/`, rewrites `AppInfo` / `Package.swift` /
`clatch.json` / `package.json` / `scripts`, and regenerates the icon — everything in
the table below. It leaves the prose docs and your app logic (signals, state)
alone, and prints the leftover mentions for you to edit. Then `npm run verify`.

<details>
<summary>What it changes (the manual table, for reference)</summary>

| Where | Change |
|---|---|
| `native/Sources/clapp/AppInfo.swift` | `id`, `cli`, `runtimeDir` — the single source for code |
| `clatch.json` | `id`, `name`, `connector.cli`, `connector.cliBin`, launch path |
| `native/Package.swift` | target `name` and `path` (`Sources/clapp` → `Sources/notes`) |
| directory | rename `native/Sources/clapp` → `native/Sources/notes` |
| `bin/clapp` | rename file → `bin/notes`; update the `BIN=…/release/notes` path |
| `scripts/*.sh` | the binary name and app-bundle names |
| `package.json` | `name` |
| `assets/icon.png` | regenerated with your monogram |

Not touched (edit these yourself): `clatch.json` `description`/`about`/`tags`, the
prose docs, and — importantly — `connector.signals` and your app logic.
</details>

> **The three that MUST agree** (the rename keeps them aligned; keep them aligned as
> you edit): `AppInfo.id` == `clatch.json` `id`; `AppInfo.cli` == `connector.cli` ==
> the `bin/<cli>` name; `AppInfo.signals` == the `name`s in `connector.signals` ==
> the names you actually `emitSignal`. `clatch validate` checks the manifest, but
> **nothing** checks that your Swift matches it — that's what `npm run verify` is for.

## 2. Replace the app (the real part)

Three files carry the demo; the rest is transport you keep.

- **`Protocol.swift`** — define your `Request` fields, your `StateDTO`, and your
  socket path. This is your GUI↔CLI wire shape.
- **`AppState.swift`** — your shared state and the methods that mutate it. Have GUI
  and CLI call the *same* methods. Emit a signal **only on user (GUI) actions**. The
  type is declared per name in `connector.signals` — pick `run` (wake now),
  `context` (tell it, next turn), or `buffered` (a position it may be asked about).
- **`ContentView.swift`** — your SwiftUI GUI. Observe `AppState`; call its methods.

Then wire the verbs in **`main.swift`**:

- `AppDelegate.handle(_:)` — one `case` per command the socket accepts.
- `runClient(_:)` — parse each CLI verb into a `Request`, print the `Response`.
- `helpText` — document **every** verb. This is the agent's *only* manual
  (`<cli> --help`); Clatch ships no separate doc. If a verb isn't in `--help`, the
  agent doesn't know it exists.

Keep `IPC.swift`, `ControlPipe.swift`, `Bootstrap.swift`, `Theme.swift`, and
`Resources/fonts/` untouched — they are generic transport and the shared Clatch
design system. Build your `ContentView` from `Theme.swift`'s atoms (`Panel`,
`Eyebrow`, `Badge`, `VoltButtonStyle`, `ClatchFieldStyle`) and tokens (`Palette`,
`Radius`, `Space`) so the fork stays on-brand; only touch the palette if you
deliberately diverge.

## 3. Update the manifest's connector surface

- `connector.commands` — one `{name, about}` per CLI verb. These become
  **per-command grants** (`Bash(<cli> <name>:*)`), so users can grant a subset.
- `connector.signals` — every signal you emit, as `{ "name", "type" }` with
  `type ∈ run | context | buffered`. The type is **fixed here**, never on the
  wire (Clapp v1): declaring `poke` as `run` is what makes it wake an agent.
- `launch` — this template ships **macOS only** (`"macos": "bin/<cli>"`, `args:
  ["app"]`). Clatch resolves the launch command per host with **no cross-OS
  fallback**; to support Linux/Windows, add `"linux"`/`"windows"` entries *and*
  provide binaries for them (a Swift executable is macOS-only — a cross-platform
  app needs a portable core).

## 4. Verify

```sh
npm run build
CLATCH_STANDALONE=1 bin/<cli> app &   # window opens (backgrounded)
bin/<cli> state                        # round-trips over the socket
npm run package                        # → dist/
clatch validate dist                   # must print "valid: <id> …"
clatch install dist && clatch run <id> # the real path
```

## Making it always-on (scheduler / observer / alarm apps)

If your app needs to act **between** user sessions (like the **clock** example app):

1. Keep an internal loop/timer alive in the running app (it's launched detached, so
   it survives).
2. When a condition fires, `emitSignal("<name>", …)` with a name you declared
   `run` in `connector.signals` — that wakes the agent.
3. The user launches the app (Library → Launch or `clatch run <id>`); there is no
   app autostart in Clatch (deliberately removed). Persist your own state and
   decide your own missed-schedule policy; Clatch gives you the wake mechanism
   and nothing more.

## Gotchas

- `connector.cli` is **mandatory** (the CLI is the clapp's constant surface;
  `<cli> -h` is the floor). A manifest without one is rejected at
  validate/install — there is no CLI-less clapp.
- `connector.commands` names must be non-empty and unique.
- The `bin/<cli>` file is a **dev wrapper** in the repo but the **compiled binary**
  inside `dist/` (see `scripts/package.sh`). `launch` and `connector.cliBin` both
  point at that one path.
- A declared `icon` must exist on disk or `validate`/`install` fail. Regenerate it
  with `npm run icon`.
