#!/usr/bin/env bash
# Verify a boot log shows every plugin in src/plugins loaded successfully.
# The bot is started with dummy Slack tokens, so app.start() is expected to
# fail after plugin loading; only the plugin loader output is checked here.
#
# Usage: scripts/boot-check.sh <boot-log-file>
set -euo pipefail

log="$1"
expected=$(find src/plugins -maxdepth 1 -name '*.ts' | wc -l | tr -d ' ')
loaded=$(grep -c 'Successfully loaded plugin' "$log" || true)

echo "Expected plugins: ${expected}, loaded: ${loaded}"

if ! grep -q 'Finished loading plugins' "$log"; then
  echo "::error::Plugin loader did not finish"
  cat "$log"
  exit 1
fi

if grep -E 'does not export a default function|Error loading plugin' "$log"; then
  echo "::error::One or more plugins failed to load"
  cat "$log"
  exit 1
fi

if [[ "$loaded" -ne "$expected" ]]; then
  echo "::error::Expected ${expected} plugins to load, got ${loaded}"
  cat "$log"
  exit 1
fi

echo "All ${expected} plugins loaded"
