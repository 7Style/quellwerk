#!/usr/bin/env bash
# PostToolUse hook (Edit|Write). Runs the TypeScript compiler after a .ts/.tsx change
# and shows errors to Claude (exit 2 + stderr). Skips silently before the scaffold exists.
set -u
input=$(cat)
read_file_path() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tool_input.file_path // empty'
  else
    python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")'
  fi
}
file_path=$(printf '%s' "$input" | read_file_path 2>/dev/null)
case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0
[ -f package.json ] || exit 0
[ -d node_modules ] || exit 0
grep -q '"typecheck"' package.json || exit 0

out=$(pnpm -s typecheck 2>&1)
status=$?
if [ $status -ne 0 ]; then
  echo "typecheck failed after editing $file_path:" >&2
  printf '%s\n' "$out" | tail -n 40 >&2
  exit 2
fi
exit 0
