#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

resolve_node_binary() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidate
  for candidate in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

NODE_BIN="$(resolve_node_binary || true)"
if [[ -n "$NODE_BIN" ]]; then
  export PATH="$(dirname "$NODE_BIN"):$PATH"
fi

if [[ $# -lt 1 ]]; then
  echo "usage: run-node-tool.sh [--node-script <script>] <tool> [args...]" >&2
  exit 2
fi

if [[ "${1:-}" == "--node-script" ]]; then
  shift
  if [[ $# -lt 1 ]]; then
    echo "usage: run-node-tool.sh --node-script <script> [args...]" >&2
    exit 2
  fi
  if [[ -z "$NODE_BIN" ]]; then
    echo "Missing node runtime. Install Node or ensure it is available on PATH." >&2
    exit 1
  fi
  script_path="$1"
  shift
  exec "$NODE_BIN" "$script_path" "$@"
fi

tool="$1"
shift

if [[ -f "$ROOT_DIR/pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
  exec pnpm exec "$tool" "$@"
fi

if { [[ -f "$ROOT_DIR/bun.lockb" ]] || [[ -f "$ROOT_DIR/bun.lock" ]]; } && command -v bun >/dev/null 2>&1; then
  exec bunx --bun "$tool" "$@"
fi

if command -v npm >/dev/null 2>&1; then
  exec npm exec -- "$tool" "$@"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx "$tool" "$@"
fi

echo "Missing package manager: pnpm, bun, or npm required." >&2
exit 1
