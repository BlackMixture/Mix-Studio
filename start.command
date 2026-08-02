#!/bin/zsh

set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

NODE_EXE="${MIX_STUDIO_NODE:-}"
if [[ -z "$NODE_EXE" ]]; then
  NODE_EXE="$(command -v node 2>/dev/null || true)"
fi
if [[ -z "$NODE_EXE" || ! -x "$NODE_EXE" ]]; then
  print -u2 "Node.js 22 or newer was not found. Install it from https://nodejs.org/ and run this file again."
  exit 1
fi

NODE_MAJOR="$($NODE_EXE -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
if [[ ! "$NODE_MAJOR" =~ '^[0-9]+$' || "$NODE_MAJOR" -lt 22 ]]; then
  print -u2 "Mix Studio requires Node.js 22 or newer. Install the current LTS from https://nodejs.org/."
  exit 1
fi

if [[ ! -f install.json ]]; then
  "$NODE_EXE" installer/bootstrap.js || exit $?
fi

export MIXBOX_RESTART_MODE=launcher
export PYTORCH_ENABLE_MPS_FALLBACK="${PYTORCH_ENABLE_MPS_FALLBACK:-1}"

(sleep 1; /usr/bin/open "http://127.0.0.1:${PORT:-3300}/" >/dev/null 2>&1) &

while true; do
  "$NODE_EXE" server.js
  STATUS=$?
  [[ "$STATUS" -eq 75 ]] || exit "$STATUS"
done
