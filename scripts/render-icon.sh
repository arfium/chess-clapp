#!/usr/bin/env sh
# Regenerate BOTH of this app's marks from the one editable source, `assets/icon.svg`:
#
#   assets/icon.png            the mark Clatch shows (manifest `icon`) and the bytes the
#                              binary embeds for its Dock/taskbar icon (src/app.rs)
#   src-tauri/icons/icon.ico   the same mark as the Windows EXE resource, which
#                              tauri-build takes from tauri.conf.json `bundle.icon`
#
# Both were hand-made once and then drifted: the committed PNG was an ~82%-scale render
# of an SVG that had since been retightened, and the .ico was derived from that stale
# PNG — so chess read visibly undersized next to its neighbours on the Clatch shelf, on
# every platform. One command, one source, no drift. Run it whenever icon.svg changes,
# then `npm run package` so the depot copy in pkg/ follows (the icon standard is
# ../template-clapp/docs/ICONS.md; a stale depot is the usual cause of an old shelf icon).
#
# Needs librsvg (`brew install librsvg`) and Pillow (`pip3 install pillow`) — dev-box
# tools, not build dependencies: the rendered PNG and .ico are committed.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SVG="$ROOT/assets/icon.svg"
PNG="$ROOT/assets/icon.png"
ICO="$ROOT/src-tauri/icons/icon.ico"

command -v rsvg-convert >/dev/null 2>&1 || { echo "render-icon: rsvg-convert not found (brew install librsvg)" >&2; exit 1; }
[ -f "$SVG" ] || { echo "render-icon: $SVG is missing — it is the source of truth" >&2; exit 1; }

# 1024×1024 RGBA, the max the protocol allows and what Clatch scales down from.
rsvg-convert -w 1024 -h 1024 "$SVG" -o "$PNG"

# The .ico carries the layers Windows picks between (Explorer, the taskbar, Alt-Tab).
python3 - "$PNG" "$ICO" <<'PY'
import sys
from PIL import Image

png, ico = sys.argv[1], sys.argv[2]
im = Image.open(png).convert("RGBA")
im.save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# The icon standard, rule 3: a transparent mark fills ~95–98% of the canvas HEIGHT. Print it
# rather than assert it — the number is the review, and a tiled icon fills 100%×100%.
w, h = im.size
b = im.getbbox()
print(f"icon.png  {w}x{h}  fill {100*(b[2]-b[0])/w:.0f}% x {100*(b[3]-b[1])/h:.0f}%")
PY

printf '%s\n%s\n' "$PNG" "$ICO"
