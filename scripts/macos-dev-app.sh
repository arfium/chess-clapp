#!/usr/bin/env sh
# Wrap the release binary in a standalone .app you can double-click during dev.
# This uses CLATCH_STANDALONE=1 (the dev hatch) — it does NOT go through Clatch.
# Product launches always go through `clatch run com.arfium.chess`.
#
# Scratch output goes in build/, never dist/ (Vite's) or pkg/ (the Clatch depot).
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
APP="${1:-$ROOT/build/ChessDev.app}"
CONTENTS="$APP/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICONSET="$ROOT/build/chess-dev.iconset"

# `npm run build` — the Tauri build, which is the only one that embeds the frontend.
(cd "$ROOT" && npm run --silent build >/dev/null)

rm -rf "$APP" "$ICONSET"
mkdir -p "$MACOS" "$RESOURCES" "$ICONSET"
cp "$ROOT/src-tauri/target/release/chess" "$MACOS/chess-bin"
cat >"$MACOS/chess" <<'EOF'
#!/bin/sh
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CLATCH_STANDALONE=1 exec "$DIR/chess-bin" app
EOF
chmod +x "$MACOS/chess" "$MACOS/chess-bin"

cat >"$CONTENTS/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>Chess Dev</string>
  <key>CFBundleExecutable</key><string>chess</string>
  <key>CFBundleIconFile</key><string>chess</string>
  <key>CFBundleIdentifier</key><string>com.arfium.chess.dev</string>
  <key>CFBundleName</key><string>Chess Dev</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.2.0</string>
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
