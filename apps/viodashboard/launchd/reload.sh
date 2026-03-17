#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_JS="$ROOT/src/config.mjs"
OPEN_PAGE=0
MODE="source"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)
      OPEN_PAGE=1
      shift
      ;;
    source|runtime)
      MODE="$1"
      shift
      ;;
    *)
      echo "Usage: $0 [source|runtime] [--open]" >&2
      exit 1
      ;;
  esac
done

CFG="$(CONFIG_JS="$CONFIG_JS" /opt/homebrew/bin/node --input-type=module <<'NODE'
const mod = await import(process.env.CONFIG_JS);
console.log(mod.LAUNCHD_LABEL);
console.log(mod.LAUNCHD_PLIST_NAME);
console.log(mod.APP_BASE_URL.replace(/:\d+$/, ':8791'));
console.log(mod.DASHBOARD_APP_ROOT);
console.log(mod.APP_SUPPORT_RUNTIME_DIR);
console.log(mod.DASHBOARD_LAUNCHD_ROOT);
NODE
)"
LAUNCHD_LABEL="$(printf '%s\n' "$CFG" | sed -n '1p')"
LAUNCHD_PLIST_NAME="$(printf '%s\n' "$CFG" | sed -n '2p')"
BASE_URL="$(printf '%s\n' "$CFG" | sed -n '3p')"
APP_ROOT="$(printf '%s\n' "$CFG" | sed -n '4p')"
RUNTIME_ROOT="$(printf '%s\n' "$CFG" | sed -n '5p')"
LAUNCHD_ROOT="$(printf '%s\n' "$CFG" | sed -n '6p')"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NOW="$(id -u)"

printf '%s\n' "$MODE" > "$LAUNCHD_ROOT/.run-mode"
if [[ "$MODE" == "runtime" ]]; then
  bash "$LAUNCHD_ROOT/sync-runtime.sh"
fi

if [[ -f "$AGENTS_DIR/$LAUNCHD_PLIST_NAME" ]]; then
  launchctl bootout "gui/$UID_NOW" "$AGENTS_DIR/$LAUNCHD_PLIST_NAME" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID_NOW" "$AGENTS_DIR/$LAUNCHD_PLIST_NAME"
  launchctl kickstart -k "gui/$UID_NOW/$LAUNCHD_LABEL"
fi

echo "--- mode ---"
echo "$MODE"

echo "--- live verify ---"
python3 - <<PY
import time, urllib.request
urls = [f"$BASE_URL/", f"$BASE_URL/styles.css"]
last_error = None
for _ in range(12):
    try:
        rows = []
        for url in urls:
            with urllib.request.urlopen(url, timeout=5) as r:
                data = r.read(120)
                rows.append((url, r.status, data))
        for url, status, data in rows:
            print(url, status, data)
        break
    except Exception as e:
        last_error = e
        time.sleep(1)
else:
    raise SystemExit(f'live verify failed: {last_error}')
PY

if [[ "$OPEN_PAGE" == "1" ]]; then
  open "$BASE_URL/"
fi

echo "Reloaded VioDashboard in $MODE mode."
