#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_JS="$ROOT/src/config.mjs"
MODE_FILE="$ROOT/launchd/.run-mode"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NOW="$(id -u)"
MODE="${1:-source}"

case "$MODE" in
  source|runtime) ;;
  *)
    echo "Usage: $0 [source|runtime]" >&2
    exit 1
    ;;
esac

CFG="$(CONFIG_JS="$CONFIG_JS" /opt/homebrew/bin/node --input-type=module <<'NODE'
const mod = await import(process.env.CONFIG_JS);
console.log(mod.LAUNCHD_LABEL);
console.log(mod.LAUNCHD_PLIST_NAME);
console.log(mod.DASHBOARD_LAUNCHD_ROOT);
NODE
)"
LAUNCHD_LABEL="$(printf '%s\n' "$CFG" | sed -n '1p')"
LAUNCHD_PLIST_NAME="$(printf '%s\n' "$CFG" | sed -n '2p')"
LAUNCHD_ROOT="$(printf '%s\n' "$CFG" | sed -n '3p')"

printf '%s\n' "$MODE" > "$LAUNCHD_ROOT/.run-mode"

if [[ "$MODE" == "runtime" ]]; then
  bash "$LAUNCHD_ROOT/sync-runtime.sh"
fi

if [[ -f "$AGENTS_DIR/$LAUNCHD_PLIST_NAME" ]]; then
  launchctl bootout "gui/$UID_NOW" "$AGENTS_DIR/$LAUNCHD_PLIST_NAME" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID_NOW" "$AGENTS_DIR/$LAUNCHD_PLIST_NAME"
  launchctl kickstart -k "gui/$UID_NOW/$LAUNCHD_LABEL"
fi

echo "VioDashboard run mode set to: $MODE"
