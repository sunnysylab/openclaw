#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_JS="$ROOT/src/config.mjs"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NOW="$(id -u)"

CFG="$(CONFIG_JS="$CONFIG_JS" node --input-type=module <<'NODE'
const mod = await import(process.env.CONFIG_JS);
console.log(mod.APP_DISPLAY_NAME);
console.log(mod.LAUNCHD_PLIST_NAME);
NODE
)"
APP_DISPLAY_NAME="$(printf '%s\n' "$CFG" | sed -n '1p')"
LAUNCHD_PLIST_NAME="$(printf '%s\n' "$CFG" | sed -n '2p')"

launchctl bootout "gui/$UID_NOW" "$AGENTS_DIR/$LAUNCHD_PLIST_NAME" >/dev/null 2>&1 || true
rm -f "$AGENTS_DIR/$LAUNCHD_PLIST_NAME"
echo "Unloaded and removed $APP_DISPLAY_NAME launch agent."
