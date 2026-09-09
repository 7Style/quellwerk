#!/usr/bin/env bash
# Stop hook. Runs `pnpm verify` (typecheck + lint + unit tests) before Claude may end its turn.
# Exit 2 = do not stop; the failing output is shown to Claude. Guarded against loops via stop_hook_active.
set -u
input=$(cat)
if printf '%s' "$input" | grep -qE '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
[ -f package.json ] || exit 0
[ -d node_modules ] || exit 0
grep -q '"verify"' package.json || exit 0

# Only verify when source files changed in this working tree; docs-only sessions stop freely.
if git -C "$root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  changed=$(git -C "$root" status --porcelain --untracked-files=all -- backend frontend prompts 2>/dev/null | wc -l | tr -d ' ')
  [ "$changed" = "0" ] && exit 0
fi

out=$(pnpm -s verify 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "pnpm verify failed. Fix this before stopping, or explain why it cannot be fixed now:" >&2
  printf '%s\n' "$out" | tail -n 60 >&2
  exit 2
fi
exit 0
