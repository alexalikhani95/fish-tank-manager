# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Decisions that shape this project — which database, how tenancy is enforced, why one option was chosen over a cheaper one — get made in conversation and then forgotten. Months later the only trace is the code, which shows _what_ but not _why_, and a reasonable-looking "improvement" quietly reverses a deliberate choice.

`PLAN.md` holds the current plan and `CONTEXT.md` the vocabulary; neither is a good home for the history of _why_ — both are living documents edited in place.

## Decision

We will record significant decisions as Architecture Decision Records in `docs/adr/`, one file per decision, numbered sequentially (`NNNN-<slug>.md`), using `_template.md` (Status / Date / Context / Decision / Consequences).

Rules:

- **Significant** = hard to reverse, or constrains later work, or rejects a plausible alternative someone will later suggest. Small choices go in the PR description.
- **ADRs are permanent, not living.** Never edit one to keep it current. A reversed decision gets a _new_ ADR that supersedes it (update the old one's Status line only). A decision that is narrowed or corrected may carry a dated `**Amended YYYY-MM-DD —** …` block appended at the end, leaving the original text intact.
- Other docs link to the ADR rather than restating it (see "one home per fact" in `AGENTS.md`).
- Agents flag conflicts with an existing ADR explicitly rather than silently overriding (see `AGENTS.md` → Conventions).

Alternatives considered: keeping rationale in `PLAN.md` (rejected — it is edited in place, so history is lost); commit messages only (rejected — not discoverable by topic).

## Consequences

- Every "why did we…" has an answer, and agents reading the repo cold can find it.
- Small overhead per decision (~10 minutes). Worth it only for decisions that meet the bar above — over-recording makes the folder noise.
