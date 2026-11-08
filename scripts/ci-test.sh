#!/usr/bin/env bash
set -euo pipefail

# Ace hides assembler import errors; import directly so native binding failures fail CI.
(cd app && node --input-type=module -e "await import('@adonisjs/assembler')")

output=$(mktemp)
trap 'rm -f "$output"' EXIT
NO_COLOR=1 npm test 2>&1 | tee "$output"
# A zero exit without executed tests (including Ace startup failures) is not a pass.
if ! grep -Eq 'Tests[[:space:]]+[1-9][0-9]* passed' "$output"; then
  echo 'Application tests did not report a positive passed count' >&2
  exit 1
fi
