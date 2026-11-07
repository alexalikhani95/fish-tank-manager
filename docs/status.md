# Status — what is real right now

**This file is the only place in the repo that states what is live, deployed, or verified.** Every other document links here instead of repeating it. A status claim anywhere else is a bug; `scripts/check-status-claims.sh` fails CI on one.

`PLAN.md` says what we _intend_ to build and ticks off work as it lands. This file says what actually _exists_ — environments, infra, verified facts — with the date each was last checked. Keep it a table; if a row needs a paragraph, it needs an ADR or a ticket instead.

## Environments

| Environment | State       | URL | Deployed SHA | Last verified |
| ----------- | ----------- | --- | ------------ | ------------- |
| staging     | not created | —   | —            | —             |
| prod        | not created | —   | —            | —             |

## Infrastructure

| Resource    | State   | Notes                                      | Last verified |
| ----------- | ------- | ------------------------------------------ | ------------- |
| GitHub repo | created | `alexalikhani95/fish-tank-manager`, public | 2026-10-18    |

## Application

| Area            | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Last verified |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Product plan    | written — PRD, PLAN, CONTEXT, hld, lld, ADR-0002 to ADR-0011                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2026-10-31    |
| App             | API scaffolded — AdonisJS 7 + Mongoose, Tanks CRUD, Zod validation, JWT auth (register, login, logout, `me`, `user:set-password`), 56 tests green; `web/` not scaffolded                                                                                                                                                                                                                                                                                                                                                                        | 2026-10-31    |
| CI (PR checks)  | workflow on `feature/ci-checks`; [run 42412539330](https://github.com/alexalikhani95/fish-tank-manager/actions/runs/42412539330) passes Mongo startup on Ubuntu 22.04, formatting, lint and typecheck; application runner fails on missing SWC Linux binding; both doc gates pass afterward, proving failure propagation. Lockfile repair restores all 12 SWC platform records at 1.15.47; simulated Linux locked install passes, native Linux execution pending. Main requires PRs and `CI checks`, enforced for admins (parent API readback). | 2026-11-07    |
| Deploy pipeline | not created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 2026-10-18    |
