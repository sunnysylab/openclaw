#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_JS="$ROOT/src/config.mjs"
MODE_FILE="$ROOT/launchd/.run-mode"

CFG="$(CONFIG_JS="$CONFIG_JS" /opt/homebrew/bin/node --input-type=module <<'NODE'
const mod = await import(process.env.CONFIG_JS);
console.log(mod.LAUNCHD_LABEL);
console.log(mod.LAUNCHD_PLIST_NAME);
console.log(mod.APP_BASE_URL.replace(/:\d+$/, ':8791'));
console.log(mod.DASHBOARD_APP_ROOT);
console.log(mod.APP_SUPPORT_RUNTIME_DIR);
NODE
)"
LAUNCHD_LABEL="$(printf '%s\n' "$CFG" | sed -n '1p')"
LAUNCHD_PLIST_NAME="$(printf '%s\n' "$CFG" | sed -n '2p')"
BASE_URL="$(printf '%s\n' "$CFG" | sed -n '3p')"
APP_ROOT="$(printf '%s\n' "$CFG" | sed -n '4p')"
RUNTIME_ROOT="$(printf '%s\n' "$CFG" | sed -n '5p')"
UID_NOW="$(id -u)"
MODE="source"
if [[ -f "$MODE_FILE" ]]; then
  MODE="$(tr -d '[:space:]' < "$MODE_FILE")"
fi
TARGET_DIR="$APP_ROOT"
if [[ "$MODE" == "runtime" ]]; then
  TARGET_DIR="$RUNTIME_ROOT"
fi

echo "--- mode ---"
echo "$MODE"

echo "--- launchd ---"
launchctl print "gui/$UID_NOW/$LAUNCHD_LABEL" 2>/dev/null | sed -n '1,22p' || echo "launch agent not loaded"

echo "--- expected root ---"
echo "$TARGET_DIR"

echo "--- live verify ---"
python3 - <<PY
import time, urllib.request
urls = [f"$BASE_URL/", f"$BASE_URL/styles.css"]
for url in urls:
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            data = r.read(120)
            print(url, r.status, data)
    except Exception as e:
        print(url, 'ERR', e)
PY

echo "--- process ---"
ps aux | grep '[n]ode src/server.mjs' || true
