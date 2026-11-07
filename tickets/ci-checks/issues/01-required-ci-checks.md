# 01: Run and require PR checks

Status: ready-for-agent
Blocked by: None
Label: new design
Risky: yes — changes CI and main's merge protection.
Test seams: existing local check commands; the real GitHub Actions PR run; GitHub protection readback and required-check state.

## What to build

Make every pull request to main run the existing formatting, lint, typecheck, application tests and two documentation gates, and prevent merges until the required check passes. Follow the approved feature spec. This is one small, complete slice: workflow plus its merge requirement and verification.

## Acceptance criteria

- [ ] One Ubuntu job named `CI checks` runs on every PR to main, without path filters, and supports manual runs. Use ordinary pull-request events, read-only repository permissions, a finite timeout, and cancellation scoped so unrelated runs are unaffected.
- [ ] Install locked dependencies with npm ci on Node 24. Start MongoDB 8 with a readiness check and use only the test database. Supply required boot variables with disposable nonsecret values; no developer environment file or production credentials are needed.
- [ ] Run the existing format check, lint, typecheck and application tests in that order. Run both existing doc gates (the status-claims check and Node script tests), even after an earlier validation failure if setup succeeded and the run was not cancelled. Any validation failure fails the job.
- [ ] Keep existing checks intact. Any existing formatting cleanup is a separate commit; report substantive pre-existing failures instead of disabling checks or silently expanding scope.
- [ ] Run all six existing checks locally on a supported Node runtime. Record commands, outcomes and any environmental limitation in Comments.
- [ ] Obtain a real PR run on GitHub and inspect all gate steps. Confirm the emitted job name, docs-only coverage and failure propagation. Any temporary failure probe stays on the feature branch, is removed, and is followed by a green run before merge approval.
- [ ] After the job has appeared on GitHub, require it for main and require pull requests, enforcing the requirement for ordinary administrator merges. Preserve existing protection settings and do not introduce mandatory human reviews. Read back settings and the PR's required-check state. Record permission failures without claiming protection is complete.
- [ ] Update the plan and sole status document accurately; reference run and protection evidence in Comments rather than duplicating environment-state claims elsewhere. No product/design changes are expected.
- [ ] Keep workflow/infra edits in their own commit, separate from documentation changes. Commit deliberately on this feature branch; never merge without the user's final approval.

## Execution and handoff

Implement and locally check the workflow first. Remote verification needs an open PR, so the orchestrator may create a draft PR early for this ticket, link it to the session, and run its normal review after self-check. A child may push this authorized feature branch but must return control if waiting for GitHub; it must not poll or watch a PR. The orchestrator handles waiting and resumes the same ticket when results arrive. Do not mark the ticket built until remote verification and protection are complete, or present the exact remaining blocker to the user.

The workflow's manual trigger may not be available until the workflow is on the default branch: use the pull-request event for initial verification rather than merging early.

## Comments

- Spec approved by the user: "okay looks good". Ticket approval pending.
