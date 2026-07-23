#!/usr/bin/env sh
# Fork this template into your own app, in one command.
#
#   scripts/rename.sh <cli> <id> "<Display Name>" [monogram]
#   e.g. scripts/rename.sh notes com.acme.notes "Notes"
#
# It renames the Sources dir + bin wrapper, rewrites AppInfo / Package.swift /
# clatch.json / package.json / scripts, and regenerates the icon — everything in
# docs/TEMPLATE.md's rename table. It does NOT touch the prose docs or your app
# logic (signals, state) — that's yours to write next. Idempotent-ish: safe to
# read the summary and re-run with different names.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

CLI="${1:-}"; ID="${2:-}"; NAME="${3:-}"
MONO="${4:-$(printf %s "$CLI" | cut -c1 | tr '[:lower:]' '[:upper:]')}"

die() { printf '%s\n' "$1" >&2; exit 1; }
usage() {
  printf '%s\n' 'usage: scripts/rename.sh <cli> <id> "<Display Name>" [monogram]' >&2
  printf '%s\n' '  e.g. scripts/rename.sh notes com.acme.notes "Notes"' >&2
  exit 1
}
[ -n "$CLI" ] && [ -n "$ID" ] && [ -n "$NAME" ] || usage

printf %s "$CLI" | grep -Eq '^[a-z][a-z0-9]*$' \
  || die "cli must be a lowercase word (letters/digits): got '$CLI'"
printf %s "$ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' && ! printf %s "$ID" | grep -q '\.\.' \
  || die "id must be reverse-DNS safe, no '..' (e.g. com.acme.notes): got '$ID'"

# Discover the current identity from AppInfo.swift (the single source).
APPINFO="$(find native/Sources -name AppInfo.swift | head -1)"
[ -n "$APPINFO" ] || die "AppInfo.swift not found — run this from a chess template"
OLDCLI="$(sed -n 's/.*static let cli = "\([a-z0-9]*\)".*/\1/p' "$APPINFO" | head -1)"
OLDID="$(sed -n 's/.*static let id = "\([A-Za-z0-9._-]*\)".*/\1/p' "$APPINFO" | head -1)"
OLDNAME="$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' clatch.json | head -1)"
[ -n "$OLDCLI" ] && [ -n "$OLDID" ] && [ -n "$OLDNAME" ] || die "could not read current name/id/cli"
[ "$OLDCLI" = "$CLI" ] && { printf 'already named "%s" — nothing to do\n' "$CLI"; exit 0; }

printf 'fork: %s (%s) → %s (%s)  [%s, monogram %s]\n' "$OLDCLI" "$OLDID" "$CLI" "$ID" "$NAME" "$MONO"

mv_() { if git mv "$1" "$2" 2>/dev/null; then :; else mv "$1" "$2"; fi; }
mv_ "native/Sources/$OLDCLI" "native/Sources/$CLI"
mv_ "bin/$OLDCLI" "bin/$CLI"

# Text files only (never the bundled .ttf/.png — perl -pi would corrupt them).
FILES="clatch.json package.json native/Package.swift bin/$CLI"
FILES="$FILES $(find "native/Sources/$CLI" scripts -type f \( -name '*.swift' -o -name '*.sh' \))"

# Order matters: the id contains the old cli, so replace it first; then the
# display name (capitalized, may sit inside "ChessDev"); then the cli word.
perl -pi -e "s/\Q$OLDID\E/$ID/g"     $FILES
perl -pi -e "s/\Q$OLDNAME\E/$NAME/g" $FILES
perl -pi -e "s/\b\Q$OLDCLI\E\b/$CLI/g" $FILES

swift scripts/render-icon.swift "$MONO" >/dev/null 2>&1 || \
  printf 'note: could not regenerate the icon (swift?) — run: swift scripts/render-icon.swift %s\n' "$MONO" >&2

printf '\ndone. leftover mentions of the old name (prose docs — review & edit):\n'
grep -rIn -e "\b$OLDCLI\b" -e "$OLDID" . \
  --exclude-dir=.git --exclude-dir=.build --exclude-dir=dist 2>/dev/null | head -12 \
  || printf '  none\n'

printf '\nnext:\n  1. edit clatch.json (description, about, tags) and the docs for your app\n'
printf '  2. replace the demo in AppState.swift / ContentView.swift / Protocol.swift\n'
printf '  3. scripts/verify.sh\n'
