#!/usr/bin/env bash
# PreToolUse hook (Edit|Write). Blocks writes to files that only a human may change.
# Exit 2 = block the tool call; stderr is shown to Claude as the reason. Fails closed.
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
if [ -z "$file_path" ]; then
  echo "block-protected.sh could not read tool_input.file_path (neither jq nor python3 on PATH). Refusing to fail open." >&2
  exit 2
fi
base=$(basename "$file_path")

# 1. Secrets: any .env file except the committed example.
if [[ "$base" == .env || "$base" == .env.* ]] && [[ "$base" != ".env.example" ]]; then
  echo "Blocked: $base holds secrets. Edit it by hand, never through the agent." >&2
  exit 2
fi

# 2. ADRs are immutable once they exist. Write a new ADR that supersedes the old one.
if [[ "$file_path" == */docs/adr/*.md ]] && [[ "$base" != "TEMPLATE.md" ]] && [ -f "$file_path" ]; then
  echo "Blocked: $file_path is an existing ADR. ADRs are immutable; create a new one that supersedes it." >&2
  exit 2
fi

# 3. The golden set is human-written. The eval must not be able to grade its own homework.
if [[ "$file_path" == */evals/golden.jsonl ]]; then
  echo "Blocked: evals/golden.jsonl is written by hand only." >&2
  exit 2
fi

exit 0
