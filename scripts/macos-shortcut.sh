#!/usr/bin/env sh
# Build a macOS .app whose only job is to run `clatch run com.arfium.chess` — a
# double-clickable launcher that still goes THROUGH Clatch (unlike macos-dev-app.sh).
# usage: scripts/macos-shortcut.sh /absolute/path/to/clatch [Chess.app]
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CLATCH_BIN="${1:-$(command -v clatch || true)}"
APP="${2:-$ROOT/dist/Chess.app}"

if [ -z "$CLATCH_BIN" ] || [ ! -x "$CLATCH_BIN" ]; then
  printf '%s\n' "usage: scripts/macos-shortcut.sh /absolute/path/to/clatch [Chess.app]" >&2
  exit 1
fi

CONTENTS="$APP/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICONSET="$ROOT/dist/chess.iconset"

rm -rf "$APP" "$ICONSET"
mkdir -p "$MACOS" "$RESOURCES" "$ICONSET"

cat >"$MACOS/chess-launcher" <<EOF
#!/bin/sh
exec "$CLATCH_BIN" run com.arfium.chess
EOF
chmod +x "$MACOS/chess-launcher"

cat >"$CONTENTS/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Chess</string>
  <key>CFBundleExecutable</key><string>chess-launcher</string>
  <key>CFBundleIconFile</key><string>chess</string>
  <key>CFBundleIdentifier</key><string>com.arfium.chess.shortcut</string>
  <key>CFBundleName</key><string>Chess</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
</dict>
</plist>
EOF

if [ -f "$ROOT/assets/icon.png" ]; then
  for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" \
              "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" \
              "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" \
              "1024 icon_512x512@2x.png"; do
    set -- $spec
    sips -s format png -z "$1" "$1" "$ROOT/assets/icon.png" --out "$ICONSET/$2" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$RESOURCES/chess.icns"
fi
rm -rf "$ICONSET"

printf '%s\n' "$APP"
