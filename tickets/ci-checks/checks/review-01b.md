# Review 01b

What this change does: Corrects the MongoDB service startup incompatibility by constraining the GitHub runner, while retaining the existing CI gates. Reviews the corrected risky ticket against its spec and prior review.

## Initial finding (recorded before further exploration)

The first GitHub run failed before validation, so the earlier successful native macOS checks do not establish Linux workflow readiness. The spec's Discovered section and ticket Comments explicitly leave the corrected PR run and protection verification with the parent. This is an outstanding acceptance boundary, not evidence that gates should be weakened; no implementation blocker is confirmed at this point.

Review continues below. No source edits or remote operations are authorized for this review.

## Final findings

No actionable implementation findings: **0 blockers, 0 total**. The corrected local implementation passes review; the ticket is not complete and is not ready for merge until the parent finishes remote verification.

## Standards review

Reviewed `origin/main...HEAD` against base `b321021b157122ab1a15fa3a5d64a748c2226cd5`, through HEAD `5f7130f30022ef7f31572f88156ad156972215bd`, with particular attention to `996398174a209df5db62f16ba2296ac9ced96482` and `5f7130f`. Read the ticket, spec including Discovered, prior review, domain/design docs, workflow/issue-tracker/git guidance, and relevant MongoDB/Adonis ADRs. Applied Standards and Spec axes directly, without subagents as instructed.

- `9963981` changes only `runs-on` from `ubuntu-latest` to `ubuntu-22.04` and adds the required `shortcut:` comment with its retirement/support trigger. `5f7130f` contains only documentation. Workflow and documentation remain in separate commits. No application, dependency, fixture, existing command, or test changes appear in the branch diff.
- There is no ADR conflict: MongoDB 8 and the existing Adonis/Mongoose stack remain intact. This is a bounded runner compatibility constraint, not a replacement database or test harness.
- `PLAN.md` remains partial; `docs/status.md` explicitly reports the startup failure and corrected run as pending, not GitHub-verified. The ticket retains unchecked remote acceptance criteria and remains `ready-for-agent`. Earlier native results are clearly distinguished from a successful Linux service run. Existing historical handoff instructions are not evidence that those later steps succeeded.

## Spec and gate preservation

- All six commands are unchanged: format check, lint, typecheck, application tests, status-claims gate, script tests. Their order, install guard, and failure semantics are unchanged. Neither `continue-on-error` nor a gate bypass was added. The two documentation gates retain `!cancelled()` with successful install outcome, so each can execute despite an earlier validation failure, including a failure of the other doc gate. A service startup failure still fails the job before any validation can run.
- `CI checks` remains the stable job name. Ordinary PR events cover every PR to main, including docs-only changes; there are no path filters. Manual dispatch remains separate in concurrency from PR runs; different PR numbers also remain separate. Read-only permissions, finite 15-minute timeout, and cancellation of superseded runs are preserved.
- Node 24, root locked installation, MongoDB 8 service, `mongosh` ping health check and bounded retries are unchanged. Checked the root/workspace scripts, required boot variables, provider and test bootstrap: the supplied disposable environment is sufficient, and the workflow's database URL points to its isolated service's `fishtank_test`. There is no reference to developer or production database credentials.

## Kernel evidence and retirement risk

The parent-captured explicit Linux >=6.19 startup rejection is the evidence for this fix; this reviewer did not rerun or expand the remote diagnosis. Containers use the host kernel, so changing the runner addresses the failed prerequisite without weakening a validation gate. Independently consulted the official manifests: [Ubuntu 22.04](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md) image `20261101.347.1` lists kernel `6.8.0-1070-azure`, while [Ubuntu 24.04](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md) image `20261101.360.1` lists `7.0.0-1017-azure`. This supports the specific 22.04 choice; the OS label does not permanently pin a kernel or prove what the next allocated runner will use.

This is an accepted temporary shortcut, not an additional finding. The official [runner retirement notice](https://github.com/actions/runner-images/issues/14254) says deprecation began **2026-09-17**, retirement is **2027-04-17**, and deliberate failing brownouts are scheduled in March/April before removal. Retaining this label through those periods can block otherwise valid PRs before their checks execute. Revisit MongoDB's newer-kernel support and migrate the runner before the brownouts, rather than waiting for retirement. The existing comment and Discovered section already require revisiting support or retirement; this review supplies the concrete published schedule.

## Actual readiness and parent handoff

Static workflow readiness is acceptable. Operational readiness remains unproven: the first inspected run failed service startup, and native macOS MongoDB results cannot validate this Linux kernel correction. No remote checks were run or inspected in this dispatch. The protection readback claim in the status document is parent-provided evidence, not an independently repeated readback here.

Before completion or merge approval, the parent must inspect a real corrected PR run and its actual runner/kernel, confirm MongoDB readiness, all six validation steps, emitted `CI checks` identity, and failure propagation. Any temporary failure probe must be removed and followed by a final green run. Confirm that the required-check identity matches main protection and that failed/pending checks block ordinary administrator merges; preserve existing settings and avoid adding mandatory human reviews. Keep completion claims pending until that evidence exists.

No source edits, subagents, commits, pushes, PR changes, protection calls or watching were performed. Only this review artifact was written.

## Review verification

Validation results are appended below after the local checks. Application tests, lint and typecheck are not repeated for this runner-only correction; previous results remain historical evidence, and the Linux regression test remains parent-owned.

- Node `v24.11.1`: `npm run format:check` passed, including this review artifact.
- `actionlint` v1.7.7 against `.github/workflows/ci.yml`: passed with no diagnostics.
- `bash scripts/check-status-claims.sh`: passed.
- `node --test 'scripts/**/*.test.mjs'`: 14 passed, 0 failed, 0 skipped.
- `git diff origin/main...HEAD --check`: passed.

Verdict: corrected implementation passes review with **0 blockers, 0 total findings**; remote acceptance and merge approval remain pending with the parent.

Not checked: corrected Linux execution, actual emitted check identity, live failure propagation or protection enforcement; no application tests, lint or typecheck rerun.
Risk: Ubuntu 22.04 is already deprecated; migrate before its 2027 brownouts/retirement, and do not treat its moving image label as an immutable kernel pin.
