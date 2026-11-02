#!/usr/bin/env bash
# Build, sign, install and launch Simple IPTV on a Samsung TV in Developer Mode.
#
#   scripts/tv.sh package   # build + sign dist/SimpleIPTV.wgt
#   scripts/tv.sh install   # push + install on the TV
#   scripts/tv.sh launch    # start the app on the TV
#   scripts/tv.sh           # all of the above
#
# Reuses the Tizen SDK, certificate profile and TV address already set up for ../CleanFrame.
# Override any of these in .local/tv.env (git-ignored):
#   SDK=/path/to/tizen-sdk  PROFILE=CleanFrameHome  TV_HOST=192.168.x.x
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLEANFRAME="$ROOT/../CleanFrame"
[ -f "$ROOT/.local/tv.env" ] && source "$ROOT/.local/tv.env"

SDK="${SDK:-$CLEANFRAME/.local/tizen-sdk}"
PROFILE="${PROFILE:-CleanFrameHome}"
if [ -z "${TV_HOST:-}" ] && [ -f "$CLEANFRAME/.local/device.json" ]; then
  TV_HOST="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["host"])' "$CLEANFRAME/.local/device.json")"
fi
: "${TV_HOST:?Set TV_HOST in .local/tv.env}"

SDK="$(cd "$SDK" && pwd -P)"   # resolve symlinks; the SDK launcher dislikes them
TIZEN="$SDK/tools/ide/bin/tizen"
SDB="$SDK/tools/sdb"
APP_ID="$(sed -n 's/.*tizen:application id="\([^"]*\)".*/\1/p' "$ROOT/app/config.xml")"
SERIAL="$TV_HOST:26101"
DIST="$ROOT/dist"
WGT="$DIST/SimpleIPTV.wgt"

package() {
  echo "▸ Packaging $APP_ID (profile: $PROFILE)"
  rm -rf "$DIST" && mkdir -p "$DIST/build"
  # Copy the app, minus files the TV doesn't need.
  rsync -a --exclude '.DS_Store' --exclude 'config.local.example.js' "$ROOT/app/" "$DIST/build/"
  if [ -f "$ROOT/app/config.local.js" ]; then
    echo "  (includes config.local.js dev credentials, so don't share this .wgt)"
  fi
  "$TIZEN" package -t wgt -s "$PROFILE" -o "$DIST" -- "$DIST/build" >"$DIST/package.log" 2>&1 || {
    echo "✗ Signing failed. See $DIST/package.log"; exit 1; }
  local out
  out="$(ls -t "$DIST"/*.wgt 2>/dev/null | head -1)"
  [ -n "$out" ] || { echo "✗ No .wgt produced. See $DIST/package.log"; exit 1; }
  [ "$out" = "$WGT" ] || mv "$out" "$WGT"
  local files
  files="$(unzip -Z1 "$WGT")"
  [[ "$files" == *author-signature.xml* && "$files" == *signature1.xml* ]] || { echo "✗ Package is not signed"; exit 1; }
  echo "✓ $WGT ($(du -h "$WGT" | cut -f1))"
}

connect() {
  local out
  out="$("$SDB" connect "$SERIAL" 2>&1)"
  echo "$out" | grep -qiE 'connected to|already connected' || { echo "✗ Could not reach TV at $SERIAL: $out"; exit 1; }
}

install() {
  [ -f "$WGT" ] || package
  connect
  local remote="/home/owner/share/tmp/sdk_tools/SimpleIPTV-$(date +%s).wgt"
  echo "▸ Installing on $SERIAL"
  "$SDB" -s "$SERIAL" push "$WGT" "$remote" | tail -1
  local out
  out="$("$SDB" -s "$SERIAL" shell 0 vd_appinstall "$APP_ID" "$remote" 2>&1)"
  echo "$out" | grep -q 'install completed' && ! echo "$out" | grep -q 'install failed' || {
    echo "✗ Install failed:"; echo "$out" | tail -5; exit 1; }
  echo "✓ Installed $APP_ID"
}

launch() {
  connect
  echo "▸ Launching $APP_ID"
  local out
  out="$("$SDB" -s "$SERIAL" shell 0 execute "$APP_ID" 2>&1)"
  echo "$out" | grep -q 'successfully launched' || { echo "✗ Launch not confirmed:"; echo "$out" | tail -3; exit 1; }
  echo "✓ Running on the TV"
}

case "${1:-all}" in
  package) package ;;
  install) install ;;
  launch) launch ;;
  all) package && install && launch ;;
  *) echo "usage: $0 [package|install|launch|all]"; exit 2 ;;
esac
