# Security Policy

chess opens a user-private socket (a Unix socket at `~/.chess/chess.sock`; a named pipe
on Windows) and speaks the Clatch control pipe with real permissions on the user's
machine. Both channels are the shared [`clappkit`](../../clappkit) crate — `clappkit::ipc`
and `clappkit::control` — so a transport issue is almost always a clappkit issue, and a
fix there reaches every clapp.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/arfium/chess-clapp/security/advisories/new).

Expect an acknowledgement within 72 hours. Please give a reasonable window to ship
a fix before publishing details.

## Scope

- The GUI↔CLI channel: directory/socket permissions (`0700`) and the request-handling
  path (`clappkit::ipc`). **Known gap, stated plainly:** the Windows named pipe is
  per-user in name but still carries the default named-pipe DACL, which is not the
  owner-only equivalent of the unix `0700` — see the note in `clappkit/src/ipc.rs`.
- The control-pipe handshake and framing (`clappkit::control`), and the `clatch_init`
  bootstrap (`clappkit::bootstrap`, via `role::main_dispatch`).
- Command handling in this app: seat ownership (a side may be moved only by its
  occupant, enforced in `src-tauri/src/game.rs`) and the CLI surface in
  `src-tauri/src/cli.rs`.
- The manifest (`clatch.json`) and packaging (`scripts/package.sh`).

Out of scope: the Clatch launcher itself (report to
[arfium/clatch](https://github.com/arfium/clatch/security)) and vendor agent
backends (report to their vendors).

## Supported versions

The latest `0.x`. Pre-1.0, fixes land on `main` and ship in the next release; no
backports.
