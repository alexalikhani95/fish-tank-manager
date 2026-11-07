# 01: Run and require PR checks

Status: ready-for-agent
Blocked by: None
Label: new design
Risky: yes — changes CI and main's merge protection.
Test seams: existing local check commands; the real GitHub Actions PR run; GitHub protection readback and required-check state.

## What to build

Make every pull request to main run the existing formatting, lint, typecheck, application tests and two documentation gates, and prevent merges until the required check passes. Follow the approved feature spec. This is one small, complete slice: workflow plus its merge requirement and verification.

## Acceptance criteria

- [x] One Ubuntu job named `CI checks` runs on every PR to main, without path filters, and supports manual runs. Use ordinary pull-request events, read-only repository permissions, a finite timeout, and cancellation scoped so unrelated runs are unaffected.
- [x] Install locked dependencies with npm ci on Node 24. Start MongoDB 8 with a readiness check and use only the test database. Supply required boot variables with disposable nonsecret values; no developer environment file or production credentials are needed.
- [x] Run the existing format check, lint, typecheck and application tests in that order. Run both existing doc gates (the status-claims check and Node script tests), even after an earlier validation failure if setup succeeded and the run was not cancelled. Any validation failure fails the job.
- [x] Keep existing checks intact. Any existing formatting cleanup is a separate commit; report substantive pre-existing failures instead of disabling checks or silently expanding scope.
- [x] Run all six existing checks locally on a supported Node runtime. Record commands, outcomes and any environmental limitation in Comments.
- [ ] Obtain a real PR run on GitHub and inspect all gate steps. Confirm the emitted job name, docs-only coverage and failure propagation. Any temporary failure probe stays on the feature branch, is removed, and is followed by a green run before merge approval.
- [ ] After the job has appeared on GitHub, require it for main and require pull requests, enforcing the requirement for ordinary administrator merges. Preserve existing protection settings and do not introduce mandatory human reviews. Read back settings and the PR's required-check state. Record permission failures without claiming protection is complete.
- [ ] Update the plan and sole status document accurately; reference run and protection evidence in Comments rather than duplicating environment-state claims elsewhere. No product/design changes are expected.
- [x] Keep workflow/infra edits in their own commit, separate from documentation changes. Commit deliberately on this feature branch; never merge without the user's final approval.

## Execution and handoff

Implement and locally check the workflow first. Remote verification needs an open PR, so the orchestrator may create a draft PR early for this ticket, link it to the session, and run its normal review after self-check. A child may push this authorized feature branch but must return control if waiting for GitHub; it must not poll or watch a PR. The orchestrator handles waiting and resumes the same ticket when results arrive. Do not mark the ticket built until remote verification and protection are complete, or present the exact remaining blocker to the user.

The workflow's manual trigger may not be available until the workflow is on the default branch: use the pull-request event for initial verification rather than merging early.

## Comments

- Spec approved by the user: "okay looks good". Ticket approval pending.

### Local implementation handoff — 2026-11-07

Local implementation and validation complete; ticket remains `ready-for-agent` pending the remote acceptance criteria. CI commit: `3d3eed0c09e0f6ecf0b0646f6d6ad51c62d0e62a` (`ci: run required checks on pull requests`). Documentation is committed separately. Parent-owned `log.md` build line was preserved and left unstaged. No `built` line or Discovered section was added.

Changes: `.github/workflows/ci.yml` wraps the existing six commands with one `CI checks` Ubuntu job, Node 24, MongoDB 8 health checking, disposable boot values, read-only repository permission, a 15-minute timeout, and event/PR-or-ref concurrency. Both doc gates use `!cancelled()` and successful dependency installation as their condition, so earlier validation failures cannot skip them and a failing doc gate cannot skip the other. Plan items remain partial and `docs/status.md` records the verification boundary. Application code, dependencies, test behavior and check commands are unchanged. Baseline `npm run format:check` passed; no separate formatting cleanup commit was needed.

Validation runtime: installed `$HOME/.nvm/versions/node/v24.11.1/bin` prepended to PATH (`node -v`: `v24.11.1`). `npm ci` exited 0: `added 484 packages, and audited 486 packages in 8s`; `22 moderate severity vulnerabilities`. No dependency audit fixes were attempted (outside scope).

Docker's `docker ps` did not return. To avoid all developer data, downloaded the MongoDB 8.0.16 macOS ARM64 archive from `fastdl.mongodb.org` and started its `mongod` with a new temporary data directory, bound only to `127.0.0.1:27028`. The archive directory contains a double hyphen (`mongodb-macos-aarch64--8.0.16`); the initial guessed binary path failed with exit 127, directory inspection corrected it, and startup then reported `child process started successfully, parent exiting`. No application or database fix was needed.

Application test environment matched the workflow's disposable values below, with only the Mongo port changed for isolation; no `app/.env` was created or read:

```sh
export PATH="$HOME/.nvm/versions/node/v24.11.1/bin:$PATH"
export NODE_ENV=test TZ=UTC PORT=3333 HOST=127.0.0.1 LOG_LEVEL=silent
export APP_KEY=ci-only-disposable-app-key-32-chars
export APP_URL=http://127.0.0.1:3333
export JWT_SECRET=ci-only-disposable-jwt-secret-at-least-32-chars
export MONGO_URL=mongodb://127.0.0.1:27028/fishtank_test
```

All six existing checks exited 0:

| Command                               | Exact result/output excerpt                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                | `Checking formatting...` / `All matched files use Prettier code style!`                                             |
| `npm run lint`                        | `> app@0.0.0 lint` / `> eslint .` (no diagnostics)                                                                  |
| `npm run typecheck`                   | `> app@0.0.0 typecheck` / `> tsc --noEmit` (no diagnostics)                                                         |
| `npm test`                            | `PASSED` / `Tests  56 passed (56)` / `Time  2s`                                                                     |
| `bash scripts/check-status-claims.sh` | `check-status-claims: ok — docs/status.md is the only status surface`                                               |
| `node --test 'scripts/**/*.test.mjs'` | `ℹ tests 14` / `ℹ pass 14` / `ℹ fail 0` / `ℹ cancelled 0` / `ℹ skipped 0` / `ℹ todo 0` / `ℹ duration_ms 662.199416` |

Additional validation: temporary install of `actionlint` v1.7.7, then `actionlint .github/workflows/ci.yml`: exit 0, no diagnostics. `git diff --check`: exit 0. Formatting and status claims rechecked after documentation edits. An exploratory format check with `--ignore-path /dev/null` flagged four ignored generated `app/.adonisjs/` files; these are deliberately excluded by the existing `.prettierignore` and were left untouched.

Local review applied the code-review skill's Standards and Spec axes directly, without subagents per dispatch instructions: no local implementation findings. The skill's independent parallel review remains for the parent. Readiness command, trigger coverage, stable job name, nonprivileged event, permissions, concurrency separation, setup guard and failure conditions inspected. This static review does not prove GitHub runner execution or merge enforcement.

Remaining work for parent: independent risky-ticket review; push authorized feature branch and open/link a draft PR; inspect the real GitHub run, including both doc gates and failure propagation; obtain a final green run; read current main protection, preserve existing settings, require `CI checks` and PRs with administrator enforcement but no new human-review requirement; read back protection and required-check state, recording any permission limitation. Update the remaining checkboxes, status evidence and log only when those steps are complete. No PR opened, no push, no branch-protection API calls, and no merge in this dispatch. No new application tests or generic workflow-test framework were added, per spec.

### CI startup correction — 2026-11-07

The parent-inspected [GitHub run 42412272116](https://github.com/alexalikhani95/fish-tank-manager/actions/runs/42412272116) failed during service startup, before any validation step ran: MongoDB explicitly rejected Linux kernels 6.19 and newer ( [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912) ). The service container shares the runner kernel, so changing application code or readiness retries would not address this failure. The official [Ubuntu 22.04 manifest](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md) lists `6.8.0-1070-azure`; the [Ubuntu 24.04 manifest](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md) lists `7.0.0-1017-azure`, so pinning 24.04 would retain the incompatibility.

Pin only the runner to `ubuntu-22.04`, retaining `mongo:8` and every check. This is a temporary compatibility constraint: revisit when MongoDB supports newer kernels or before runner retirement. The runner label does not freeze its kernel forever. The next GitHub PR run is the regression seam; corrected-run verification remains pending. Current evidence is recorded in [the sole status surface](../../../docs/status.md).

Diagnosis phases 1–4 reuse the parent-captured explicit startup error; no new hypothesis or local reproduction is needed for this bounded dispatch. Phase 5 regression and final cleanup confirmation belong to the parent via the next GitHub run. No application behavior, fixtures, dependencies, or check commands change. Native tests, lint, and typecheck are not rerun for this runner-only correction; the earlier local results above are unchanged. No polling, watch, merge, or further failure investigation is performed by this dispatch.

Startup correction validation: `npm run format:check`, `bash scripts/check-status-claims.sh`, `/tmp/fishtank-ci.N32hHS/actionlint .github/workflows/ci.yml`, and `git diff --check` all exited 0. Application tests, lint and typecheck were not rerun for the runner-only change; remote startup and check execution remain unverified pending the next GitHub run.
