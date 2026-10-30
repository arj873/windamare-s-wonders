#!/usr/bin/env bash
# Gate: frozen install + typecheck + lint + test. Last line is GATE PASS or GATE FAIL.
cd "$(dirname "$0")/.." || exit 1

steps=(
  "pnpm install --frozen-lockfile"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
)

for step in "${steps[@]}"; do
  echo "== $step"
  if ! $step; then
    echo "GATE FAIL ($step)"
    exit 1
  fi
done
echo "GATE PASS"
