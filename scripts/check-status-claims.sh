#!/usr/bin/env bash
#
# Doc gate: live/deployment status belongs in docs/status.md and nowhere else. A claim
# that lives in two places drifts silently; this fails the build the moment a second
# copy appears. Adapted from techgarden's scripts/check-status-claims.sh (their ADR-0036).
#
# Scope is deliberately narrow — only *living* docs, the ones a reader trusts as current.
# Dated records (ADRs, and specs + tickets under tickets/) are exempt: a past-tense status
# claim in a document that carries its own date is correct, and gating them would produce
# the false positives that get gates disabled.
#
# ponytail: grep, not a parser. Upgrade to link-proximity checking only if prose false
# positives actually show up.
set -uo pipefail
cd "$(dirname "$0")/.."

CANON='docs/status.md'

# Phrases that assert what is deployed/live. Start small; add a pattern only when a real
# duplicated claim is found, never speculatively.
PATTERNS='(is|are|now) (live|deployed|serving)'
PATTERNS+='|not yet (live|deployed|serving|created)'
PATTERNS+='|deployed (and|&) serving'
PATTERNS+='|deploy(ed)? (to|on) (staging|prod)'
PATTERNS+='|currently (running|deployed|up|down)'
PATTERNS+='|last verified'

# Living docs only. Dated records are exempt by omission, not by an ignore rule.
SCOPE=(
  'AGENTS.md' 'CLAUDE.md' 'README.md' 'PLAN.md' 'PRD.md' 'CONTEXT.md'
  'docs/agents' 'docs/conventions' 'docs/design'
  ":(exclude)$CANON"
)

hits=$(git grep -nIE "$PATTERNS" -- "${SCOPE[@]}" 2>/dev/null)

if [ -z "$hits" ]; then
  echo "check-status-claims: ok — $CANON is the only status surface"
  exit 0
fi

echo "check-status-claims: FAIL — live/deployment status stated outside $CANON" >&2
echo >&2
echo "$hits" >&2
echo >&2
echo "Live status has one home: $CANON (AGENTS.md → One home per fact)." >&2
echo "Replace the claim with a link to it, or — if this document is a dated record" >&2
echo "rather than a living doc — it does not belong in the scanned scope." >&2
exit 1
