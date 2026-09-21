# Status — what is real right now

**This file is the only place in the repo that states what is live, deployed, or verified.** Every other document links here instead of repeating it. A status claim anywhere else is a bug; `scripts/check-status-claims.sh` fails CI on one.

`PLAN.md` says what we _intend_ to build and ticks off work as it lands. This file says what actually _exists_ — environments, infra, verified facts — with the date each was last checked. Keep it a table; if a row needs a paragraph, it needs an ADR or a ticket instead.

## Environments

| Environment | State       | URL | Deployed SHA | Last verified |
| ----------- | ----------- | --- | ------------ | ------------- |
| staging     | not created | —   | —            | —             |
| prod        | not created | —   | —            | —             |

## Infrastructure

| Resource    | State      | Notes         | Last verified |
| ----------- | ---------- | ------------- | ------------- |
| GitHub repo | local only | no remote yet | 2026-09-21    |

## Application

| Area            | State                                                 | Last verified |
| --------------- | ----------------------------------------------------- | ------------- |
| Product plan    | written — PRD, PLAN, CONTEXT, hld, lld, ADR-0002/0003 | 2026-09-21    |
| App             | not scaffolded                                        | 2026-09-21    |
| CI (PR checks)  | not created                                           | 2026-09-21    |
| Deploy pipeline | not created                                           | 2026-09-21    |
