#!/usr/bin/env bash
# Launch Mix Studio on Linux against an existing ComfyUI installation.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NODE_EXE="${NODE_BIN:-}"
if [[ -n "$NODE_EXE" && -d "$NODE_EXE" ]]; then
  NODE_EXE="$NODE_EXE/node"
elif [[ -z "$NODE_EXE" ]]; then
  NODE_EXE="$(command -v node 2>/dev/null || true)"
fi
if [[ -z "$NODE_EXE" || ! -x "$NODE_EXE" ]]; then
  echo "Mix Studio requires Node.js 22 or newer. Install Node or set NODE_BIN to its executable or bin directory." >&2
  exit 1
fi
NODE_MAJOR="$($NODE_EXE -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ || "$NODE_MAJOR" -lt 22 ]]; then
  echo "Mix Studio requires Node.js 22 or newer. Install the current Node.js LTS release." >&2
  exit 1
fi

export MIXBOX_COMFY_URL="${MIXBOX_COMFY_URL:-http://127.0.0.1:8188}"
export COMFYUI_PATH="${COMFYUI_PATH:-$HOME/ComfyUI}"
export PORT="${PORT:-3300}"
export MIXBOX_RESTART_MODE=launcher

# To let Mix Studio manage a systemd user service, opt in explicitly:
#   MIXBOX_COMFY_SERVICE=comfyui.service ./start-mixstudio.sh
# No service name or model root is assumed because many Linux installs are
# launched manually or use shared model directories through ComfyUI Desktop.

if [[ ! -f install.json ]]; then
  "$NODE_EXE" installer/bootstrap.js
fi

while true; do
  if "$NODE_EXE" server.js "$@"; then
    STATUS=0
  else
    STATUS=$?
  fi
  [[ "$STATUS" -eq 75 ]] || exit "$STATUS"
done
