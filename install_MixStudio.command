#!/bin/zsh

set -u

REPOSITORY_URL="https://github.com/BlackMixture/Mix-Studio.git"
SCRIPT_DIR="${0:A:h}"

fail() {
  print -u2 ""
  print -u2 "Mix Studio setup stopped: $1"
  print -u2 ""
  read -r "?Press Return to close. "
  exit 1
}

GIT_EXE="${MIX_STUDIO_GIT:-$(command -v git 2>/dev/null || true)}"
[[ -n "$GIT_EXE" ]] || fail "Git is required. Run 'xcode-select --install', finish the Apple installer, then try again."

NODE_EXE="${MIX_STUDIO_NODE:-$(command -v node 2>/dev/null || true)}"
[[ -n "$NODE_EXE" && -x "$NODE_EXE" ]] || fail "Node.js 22 or newer is required. Install the current LTS from https://nodejs.org/, then try again."
NODE_MAJOR="$($NODE_EXE -p "process.versions.node.split('.')[0]" 2>/dev/null || true)"
[[ "$NODE_MAJOR" =~ '^[0-9]+$' && "$NODE_MAJOR" -ge 22 ]] || fail "Mix Studio requires Node.js 22 or newer. Install the current LTS from https://nodejs.org/."

if [[ -f "$SCRIPT_DIR/server.js" && -f "$SCRIPT_DIR/installer/bootstrap.js" ]]; then
  MIX_STUDIO_HOME="$SCRIPT_DIR"
else
  MIX_STUDIO_HOME="$SCRIPT_DIR/Mix Studio"
  if [[ -e "$MIX_STUDIO_HOME" ]]; then
    [[ -d "$MIX_STUDIO_HOME/.git" && -f "$MIX_STUDIO_HOME/server.js" ]] || fail "The target '$MIX_STUDIO_HOME' already exists but is not a Mix Studio Git checkout."
    ORIGIN="$($GIT_EXE -C "$MIX_STUDIO_HOME" remote get-url origin 2>/dev/null || true)"
    NORMALIZED_ORIGIN="${ORIGIN%.git}"
    [[ "${NORMALIZED_ORIGIN:l}" == "https://github.com/blackmixture/mix-studio" || "${NORMALIZED_ORIGIN:l}" == "git@github.com:blackmixture/mix-studio" ]] || fail "The existing checkout does not point to the official Mix Studio repository."
  else
    print "Downloading Mix Studio…"
    "$GIT_EXE" clone --depth 1 --branch main --single-branch "$REPOSITORY_URL" "$MIX_STUDIO_HOME" || fail "Git could not download Mix Studio."
  fi
fi

export MIX_STUDIO_GIT="$GIT_EXE"
export MIX_STUDIO_NODE="$NODE_EXE"
"$NODE_EXE" "$MIX_STUDIO_HOME/installer/bootstrap.js" || fail "The local Mix Studio configuration could not be prepared."

print "Opening Mix Studio…"
exec /bin/zsh "$MIX_STUDIO_HOME/start.command"
