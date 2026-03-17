#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_JS="$SRC/src/config.mjs"
UID_NOW="$(id -u)"

CFG="$(CONFIG_JS="$CONFIG_JS" node --input-type=module <<'NODE'
const mod = await import(process.env.CONFIG_JS);
console.log(mod.APP_DISPLAY_NAME);
console.log(mod.APP_LOG_DIR);
console.log(mod.APP_SUPPORT_RUNTIME_DIR);
console.log(mod.LAUNCHD_LABEL);
console.log(mod.DASHBOARD_APP_ROOT);
NODE
)"
APP_DISPLAY_NAME="$(printf '%s\n' "$CFG" | sed -n '1p')"
LOG_DIR="$(printf '%s\n' "$CFG" | sed -n '2p')"
DST="$(printf '%s\n' "$CFG" | sed -n '3p')"
LAUNCHD_LABEL="$(printf '%s\n' "$CFG" | sed -n '4p')"
SRC="$(printf '%s\n' "$CFG" | sed -n '5p')"

mkdir -p "$DST" "$LOG_DIR"
rm -rf "$DST/src" "$DST/public"
mkdir -p "$DST/src" "$DST/public"
cp "$SRC/package.json" "$DST/package.json"
cp "$SRC/package-lock.json" "$DST/package-lock.json"
cp "$SRC/src/config.mjs" "$DST/src/config.mjs"
cp "$SRC/src/server.mjs" "$DST/src/server.mjs"
cp "$SRC/src/moodBridge.mjs" "$DST/src/moodBridge.mjs"
cp "$SRC/src/sidecarClient.mjs" "$DST/src/sidecarClient.mjs"
cp -R "$SRC/src/server" "$DST/src/server"
cp "$SRC/public/index.html" "$DST/public/index.html"
cp "$SRC/public/app.js" "$DST/public/app.js"
cp "$SRC/public/styles.css" "$DST/public/styles.css"
cp "$SRC/public/telemetry.js" "$DST/public/telemetry.js"

cd "$DST"
/opt/homebrew/bin/npm install --omit=dev >/dev/null 2>&1 || /opt/homebrew/bin/npm install >/dev/null 2>&1

launchctl kickstart -k "gui/$UID_NOW/$LAUNCHD_LABEL" >/dev/null 2>&1 || true

echo "Synced $APP_DISPLAY_NAME workspace -> runtime and kicked service."
