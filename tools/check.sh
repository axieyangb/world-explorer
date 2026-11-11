#!/usr/bin/env bash
# Pre-push checks for World Explorer. Exits non-zero if any check fails.
#
#   tools/check.sh
#
# Needs node (22+) and python3, nothing else. The lint step also needs ESLint, which is optional:
# install it once with `npm --prefix tools ci`; without it the step is skipped with a notice.
# Set CHECK_LINT=required (CI does) to fail instead of skipping.
set -u
cd "$(dirname "$0")/.."

fails=0
t_start=$(date +%s)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

step() { # step "name" command...
  local name=$1 t0 rc
  shift
  t0=$(date +%s)
  "$@" >"$tmp/out" 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then
    printf 'ok    %-34s %2ss  %s\n' "$name" $(($(date +%s) - t0)) "$(tail -n 1 "$tmp/out")"
  else
    printf 'FAIL  %-34s %2ss\n' "$name" $(($(date +%s) - t0))
    sed 's/^/      /' "$tmp/out" | head -n 60
    fails=$((fails + 1))
  fi
}

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -lt 22 ]; then
  echo "check.sh needs node 22 or newer (found: $(node --version 2>/dev/null || echo none))"
  exit 2
fi

syntax() {
  find src -name '*.js' -print0 | xargs -0 -n 1 -P 4 node --check && echo "$(find src -name '*.js' | wc -l | tr -d ' ') files"
}
python_syntax() {
  PYTHONPYCACHEPREFIX="$tmp/pyc" python3 -m py_compile server.py tools/*.py
}
imports() {
  node --experimental-vm-modules --no-warnings tools/check_modules.mjs
}
lint() {
  tools/node_modules/.bin/eslint --config tools/eslint.config.mjs src && echo "no undefined names, const assignments or duplicate keys"
}
server_tests() {
  python3 tools/test_server.py >"$tmp/server.log" 2>&1 || { cat "$tmp/server.log"; return 1; }
  tail -n 1 "$tmp/server.log"
}
build() {
  python3 tools/build_release.py "$tmp/world_explorer.html" --exports-json="$tmp/exports.json" >"$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; return 1; }
  # The bundle must expose exactly the names each module exports, and its script must parse.
  node --experimental-vm-modules --no-warnings tools/check_modules.mjs --bundle-exports="$tmp/exports.json" || return 1
  python3 - "$tmp/world_explorer.html" "$tmp/bundle.js" <<'PY' || return 1
import sys
html = open(sys.argv[1], encoding='utf-8').read()
start = html.index('<script>\n  (async () => {') + len('<script>')  # the bundle; it ends at the first </script>, as in a browser
open(sys.argv[2], 'w', encoding='utf-8').write(html[start:html.index('</script>', start)])
PY
  node --check "$tmp/bundle.js" && echo "bundle exports match, bundle script parses"
}

step 'syntax (node --check)' syntax
step 'syntax (python)' python_syntax
step 'import graph' imports
if [ -x tools/node_modules/.bin/eslint ]; then
  step 'lint (eslint)' lint
elif [ "${CHECK_LINT:-}" = required ]; then
  echo 'FAIL  lint (eslint): not installed; run: npm --prefix tools ci'
  fails=$((fails + 1))
else
  echo 'skip  lint (eslint): not installed; run once: npm --prefix tools ci'
fi
step 'server tests (stubbed upstreams)' server_tests
step 'release build + export check' build

total=$(($(date +%s) - t_start))
if [ $fails -ne 0 ]; then
  echo "check.sh: $fails check(s) FAILED (${total}s)"
  exit 1
fi
echo "check.sh: all checks passed (${total}s)"
