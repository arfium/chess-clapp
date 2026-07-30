# CLAUDE.md

This file mirrors [`AGENTS.md`](AGENTS.md) for Claude. If you change one, change the
other.

- **Working on this app** (as a coding agent): start at [`AGENTS.md`](AGENTS.md) — it
  orients you in 30 seconds (Rust + Tauri v2 on the shared `clappkit` crate), lists the
  commands, and marks the line between what clappkit owns and what chess owns. Then
  [`README.md`](README.md) for the product and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  for the model.
- **Operating the running app** (as the end user's agent): `chess --help` is the whole
  manual; [`AGENTS.md`](AGENTS.md) has the seat-and-turn rules behind it.
- **House standards** live once, in the sibling template repo:
  `../template-clapp/docs/ICONS.md` (the app's mark) and
  `../template-clapp/docs/PLAYBOOK.md` (the shipping drill). Not copied here on purpose —
  one standard, one file. `scripts/render-icon.sh` is this app's implementation of the
  icon rule.
- **The frozen contract — every point between Clatch and this clapp — is
  [`docs/protocol.md`](docs/protocol.md)** (The Clapp Protocol: manifest + control
  pipe). It is the single normative source; Clatch implements it. **Protocol wins.**
