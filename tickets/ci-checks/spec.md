# CI checks

Status: ready-for-agent

## Problem Statement

Pull requests have no automatic checks, so broken code or documentation can reach main without a visible merge gate.

## Solution

Run the existing formatting, lint, typecheck, application tests, and documentation gates on every pull request to main. Require successful checks before merging. Verify the workflow on GitHub before describing it as verified.

## User Stories

1. As the maintainer, I want formatting checked without rewriting files, so inconsistent formatting blocks a merge.
2. As the maintainer, I want lint and typecheck failures to block a merge, so obvious errors cannot slip through.
3. As the maintainer, I want the existing application tests run against an isolated MongoDB, so CI does not touch my development data.
4. As the maintainer, I want both documentation gates run on every PR, including docs-only PRs, so documentation rules stay enforced.
5. As the maintainer, I want obsolete runs cancelled when I push again, so checks focus on the latest change.
6. As the maintainer, I want failed or pending checks to prevent merging into main, so checks are an actual gate.
7. As the maintainer, I want a successful real GitHub run before approval to merge this work, so the workflow is proven on its intended runner.

## Implementation Decisions

- Label: new design. Risky: CI controls merge eligibility.
- Use GitHub Actions on all pull requests targeting main, with no path filters. Support manual runs for verification. Use ordinary pull-request events, not privileged pull-request-target execution.
- Use one Ubuntu job with a stable required-check name, `CI checks`. Install locked dependencies with npm ci using Node 24.
- Run existing commands in this order: format check, lint, typecheck, application tests. Run both existing doc gates in the same job; ensure they still execute if an earlier validation step fails, provided setup succeeded and the run was not cancelled. Any failing validation makes the job fail.
- Use a MongoDB 8 service with a readiness check. Use only the test database and disposable, nonsecret environment values. Supply all required boot variables without relying on a developer's local environment file or production secrets.
- Give the workflow only repository-read permissions. Set a finite job timeout and cancel superseded runs per PR; manual runs must not cancel unrelated PR runs.
- Configure main's required status check to the stable job name after GitHub has emitted it. Preserve existing repository protection settings. Require PRs and successful checks, including for ordinary administrator merges; do not introduce mandatory human reviews for this solo project. Do not merge this feature without the separate merge approval.
- Use the smallest workflow that wraps the existing commands. Do not change application behavior or weaken checks to make CI green. Existing formatting failures may be corrected in a separate, clearly scoped commit; substantive pre-existing failures must be reported and resolved explicitly.
- Update the plan and the single status document with accurate workflow and protection state. Record verification evidence and any remote permission limitation in the ticket. Do not mark protection complete if GitHub refuses the setting.

## Testing Decisions

- The main verification seam is a real GitHub Actions run on this feature's PR, exercising the existing application and script tests.
- Run formatting, lint, typecheck, application tests and both doc gates locally with a supported Node runtime before claiming completion.
- Inspect the GitHub run's steps and results to confirm every gate executed; verify that the PR workflow has no docs-only exclusion.
- Read back main's protection configuration and the PR's required-check state. Confirm the configured check name matches the emitted job name and that failed/pending required checks cannot satisfy the merge requirement.
- A bounded temporary failure on this feature branch may be used to prove failure propagation, then removed and followed by a green run. Never merge failing validation probes or change main to test enforcement.
- Reuse existing tests; no new application tests or generic workflow-testing framework are needed.

## Out of Scope

Deployment, staging or production infrastructure, Dependabot, frontend work, new application features, replacing the current test setup with Testcontainers, and broad dependency upgrades.

## Further Notes

The user approved including merge protection and verification through a real GitHub run with existing tests. Specification approval and ticket approval remain separate stops.

The repository's git conventions mention rebasing, but AGENTS.md and the develop workflow forbid it: this work uses merges, never rebases.

## Carried to review

None yet.

## Stop 2 decisions

The user requested `$develop --resume ci-checks` after reviewing the single ticket. This approves that breakdown and requests implementation now. No additional conditions were added. Merge protection and real GitHub verification remain in scope.

## Discovered — 2026-11-07

The parent-inspected [GitHub run 42412272116](https://github.com/alexalikhani95/fish-tank-manager/actions/runs/42412272116) failed during service startup, before any validation step ran: MongoDB explicitly rejected Linux kernels 6.19 and newer ( [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912) ). The service container shares the runner kernel, so changing application code or readiness retries would not address this failure. The official [Ubuntu 22.04 manifest](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2204-Readme.md) lists `6.8.0-1070-azure`; the [Ubuntu 24.04 manifest](https://raw.githubusercontent.com/actions/runner-images/main/images/ubuntu/Ubuntu2404-Readme.md) lists `7.0.0-1017-azure`, so pinning 24.04 would retain the incompatibility.

Pin only the runner to `ubuntu-22.04`, retaining `mongo:8` and every check. This is a temporary compatibility constraint: revisit when MongoDB supports newer kernels or before runner retirement. The runner label does not freeze its kernel forever. The next GitHub PR run is the regression seam; corrected-run verification remains pending. Current evidence is recorded in [the sole status surface](../../docs/status.md).

### Portable locked dependencies

The subsequent application-runner failure requires a narrow lockfile repair: preserve every existing package version and add missing optional platform records for the already locked SWC version. No Linux dependency belongs in the application manifest. Diagnosis, regression seam and remaining execution boundary are in [ticket Comments](issues/01-required-ci-checks.md) and [status](../../docs/status.md).

### Fail-closed application validation

A successful runner exit is insufficient when Ace swallows assembler import errors. CI must directly import assembler in the application context, preserve import/runner failures, and reject output without a positive passed-test count. Extend the locked optional-platform repair to ast-grep at its existing version; keep NODE_ENV=test. Scope is CI wiring and lock metadata, not application behavior. Evidence and remote boundary: [diagnosis](checks/assembler-portability.md), [status](../../docs/status.md).
