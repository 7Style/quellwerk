#!/usr/bin/env bash
# PreToolUse hook (Bash). Blocks any shell command that names an env file, whatever
# the reading command is (cat, head, tail, sed, less, grep, source, a redirection, a
# copy). The Read deny-list in settings.json only covers the Read tool; without this
# hook `head backend/.env` walks straight past it.
# Exit 2 = block the tool call; stderr is shown to Claude as the reason. Fails closed.
set -u
input=$(cat)
read_command() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tool_input.command // empty'
  else
    python3 -c 'import json,sys; print((json.load(sys.stdin).get("tool_input") or {}).get("command") or "")'
  fi
}
cmd=$(printf '%s' "$input" | read_command 2>/dev/null)
if [ -z "$cmd" ]; then
  echo "block-env-read.sh could not read tool_input.command (neither jq nor python3 on PATH). Refusing to fail open." >&2
  exit 2
fi

# The two committed example files are the only env files that may be read. They are
# removed from the string first, so what is left is matched without an exception.
scrubbed=${cmd//example.env/}
scrubbed=${scrubbed//.env.example/}

# Matches .env, ./.env, backend/.env, frontend/.env.local, backend/.env* and the same
# inside quotes or after a redirection. The character before .env must not be
# alphanumeric, so `process.env` and `config/env.config.ts` stay allowed.
if printf '%s' "$scrubbed" | grep -Eq '(^|[^[:alnum:]_.-])\.env($|[^[:alnum:]_-])'; then
  echo "Blocked: this command names an env file. Env files hold secrets and are never read through the agent; open them yourself. Only example.env and .env.example are exempt." >&2
  exit 2
fi

exit 0
