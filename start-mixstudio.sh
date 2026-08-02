#!/usr/bin/env bash
# start-mixstudio.sh — launch Mix Studio on Linux, wired to a local ComfyUI.
# The Linux counterpart to start.bat. Every setting has a ${VAR:-default} fallback,
# so override any of them from the environment or a systemd unit without editing this file.
# See docs/linux-dgx-gb10.md for the full setup (systemd units, GB10 notes).
set -euo pipefail
cd "$(dirname "$0")"

# node is frequently absent from a minimal systemd --user / cron PATH.
# Point NODE_BIN at your Node.js >= 22 bin directory if node is not already on PATH.
if ! command -v node >/dev/null 2>&1 && [ -n "${NODE_BIN:-}" ]; then
  export PATH="$NODE_BIN:$PATH"
fi
command -v node >/dev/null 2>&1 || {
  echo "start-mixstudio.sh: 'node' not found on PATH — install Node.js >= 22 or set NODE_BIN=/path/to/node/bin" >&2
  exit 1
}

# --- ComfyUI backend + storage -------------------------------------------------
export MIXBOX_COMFY_URL="${MIXBOX_COMFY_URL:-http://127.0.0.1:8188}"
export COMFYUI_PATH="${COMFYUI_PATH:-$HOME/ComfyUI}"
export COMFYUI_MODELS_DIR="${COMFYUI_MODELS_DIR:-$HOME/ComfyUI/models}"
export PORT="${PORT:-3300}"

# --- UI Start/Restart ComfyUI buttons on Linux (see docs step 4) ---------------
# When set, Mix Studio runs these via `sh -c` for the dependency-panel actions.
export MIXBOX_COMFY_RESTART_CMD="${MIXBOX_COMFY_RESTART_CMD:-systemctl --user restart comfyui.service}"
export MIXBOX_COMFY_START_CMD="${MIXBOX_COMFY_START_CMD:-systemctl --user start comfyui.service}"

exec node server.js "$@"
