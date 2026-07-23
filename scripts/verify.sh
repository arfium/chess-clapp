#!/usr/bin/env sh
# Does this chess actually work? Build → package → validate → prove the GUI process
# and the CLI round-trip over the socket. One command, one clear PASS/FAIL. Run it
# before you commit. (The socket smoke test needs a macOS GUI session — it's a local
# dev check, not a CI step; CI just builds + packages.)
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
CLI="$(sed -n 's/.*static let cli = "\([a-z0-9]*\)".*/\1/p' $(find native/Sources -name AppInfo.swift | head -1) | head -1)"
[ -n "$CLI" ] || { echo "could not read cli from AppInfo.swift" >&2; exit 1; }

step() { printf '\n▸ %s\n' "$1"; }
fail() { printf '\n✗ FAIL — %s\n' "$1" >&2; exit 1; }

step "build (release)"
swift build -c release --package-path native >/dev/null 2>&1 || fail "swift build failed (run it directly to see why)"
printf '  ok\n'

step "package → dist/"
scripts/package.sh >/dev/null 2>&1 || fail "scripts/package.sh failed"
printf '  ok\n'

step "clatch validate"
if command -v clatch >/dev/null 2>&1; then
  clatch validate dist || fail "clatch validate rejected the package"
else
  printf '  (clatch not on PATH — skipped; install it to run the conformance oracle)\n'
fi

step "socket round-trip (GUI process ⇄ CLI)"
BIN="native/.build/release/$CLI"
SOCK="$HOME/.$CLI/$CLI.sock"
rm -f "$SOCK"
CLATCH_STANDALONE=1 "$BIN" app >"/tmp/$CLI-verify.log" 2>&1 &
PID=$!
i=0; while [ ! -S "$SOCK" ] && [ "$i" -lt 60 ]; do sleep 0.1; i=$((i + 1)); done
if [ ! -S "$SOCK" ]; then
  kill "$PID" 2>/dev/null || true
  fail "the app never bound its socket (see /tmp/$CLI-verify.log — a headless box has no GUI session)"
fi
if OUT="$("$BIN" state 2>&1)"; then
  printf '  ok — CLI reached the running app:\n'
  printf '%s\n' "$OUT" | sed 's/^/      /'
else
  "$BIN" close >/dev/null 2>&1 || true; kill "$PID" 2>/dev/null || true
  fail "CLI could not reach the app: $OUT"
fi
"$BIN" close >/dev/null 2>&1 || true
sleep 0.3; kill "$PID" 2>/dev/null || true

printf '\n✓ PASS — %s builds, packages, %s, and its two surfaces talk.\n' \
  "$CLI" "$(command -v clatch >/dev/null 2>&1 && printf validates || printf 'validate skipped')"
