#!/usr/bin/env sh
# Assemble the installable dist/ folder that `clatch validate` / `clatch install`
# consume: dist/{clatch.json, bin/chess (the compiled binary), assets/icon.png}.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DIST="$ROOT/dist"

swift build -c release --package-path "$ROOT/native" >/dev/null

rm -rf "$DIST"
mkdir -p "$DIST/bin" "$DIST/assets"
# In dist, bin/chess IS the compiled binary (not the dev wrapper) — launch + cliBin
# in clatch.json both resolve to it.
cp "$ROOT/native/.build/release/chess" "$DIST/bin/chess"
# If you add Sources/chess/Resources, SwiftPM emits a *.bundle next to the binary;
# copy it too (harmless if absent):
find "$ROOT/native/.build" -path "*/release/*.bundle" -name "*chess*.bundle" -prune -exec cp -R {} "$DIST/bin/" \; -quit 2>/dev/null || true
cp "$ROOT/clatch.json" "$DIST/clatch.json"
cp "$ROOT/assets/icon.png" "$DIST/assets/icon.png"
[ -f "$ROOT/THIRD_PARTY_NOTICES.md" ] && cp "$ROOT/THIRD_PARTY_NOTICES.md" "$DIST/THIRD_PARTY_NOTICES.md"
chmod +x "$DIST/bin/chess"

printf '%s\n' "$DIST"
