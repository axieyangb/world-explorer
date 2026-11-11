#!/usr/bin/env bash
# Opt-in: makes `git push` run tools/check.sh first. Nothing installs this for you.
#
#   tools/install_git_hook.sh            install the pre-push hook
#   tools/install_git_hook.sh --remove   remove it
#
# Skip it for one push with `git push --no-verify`.
set -eu
cd "$(dirname "$0")/.."
hook="$(git rev-parse --git-path hooks)/pre-push"
marker='# world-explorer check hook'

if [ "${1:-}" = --remove ]; then
  if [ -f "$hook" ] && grep -q "$marker" "$hook"; then rm "$hook"; echo "removed $hook"; else echo "no check hook installed"; fi
  exit 0
fi
if [ -e "$hook" ] && ! grep -q "$marker" "$hook"; then
  echo "$hook already exists and is not ours; not touching it." >&2
  exit 1
fi
mkdir -p "$(dirname "$hook")"
cat >"$hook" <<EOF
#!/usr/bin/env bash
$marker
exec "\$(git rev-parse --show-toplevel)/tools/check.sh"
EOF
chmod +x "$hook"
echo "installed $hook"
