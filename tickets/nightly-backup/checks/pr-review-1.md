# PR review 1 — nightly-backup (PR #16) against origin/main

Reviewed: `git diff origin/main...HEAD` (20 commits, a3d4ef5..fa4aa58). Two axes, kept separate (code-review skill): Standards and Spec.
Not re-raised: anything fixed or decided in review-01/02/03; review-03 F2 (SHA-pin actions) and F6 (prove the failure email with a non-main dispatch) are queued for the keeper.

## Carried to review

1. **Spec check 13 — is the notification-setting check enough?** Enough to merge, not enough to call the alarm proven. GitHub sends scheduled-run failure mail to the account that last changed the cron line, and only when that account's Actions notifications are on; the setup check covers the second half and the squash merge by the keeper covers the first. What it cannot show is that the mail actually arrives (spam filter, address). That gap is exactly review-03 F6 (non-main dispatch fails the OIDC login with no probe code in the workflow), already queued; ticket 04 should not tick "failure email" until F6 has run. No new finding.
2. **Spec check 11 — simulate-principal-policy proves the policy, not S3's 412.** Accept. The 412 on an existing key is S3's documented conditional-write behaviour, not something this repo configures; the policy's `Null` condition (which `simulate` does prove) is the part we own. Proving it would need a second AWS write, which the rollout deliberately avoids. No new finding.

## Findings

### Spec

#### S1. minor — the post-ponytail re-run evidence is paraphrased, and the empty-database case was not re-run

`tickets/nightly-backup/issues/01-backup-script.md` → Ponytail pass. Spec → Testing Decisions: "Each must go red with a clear message … A good dev database must go green. Paste the output of all four into the ticket." 9f20ef6 changed the check-and-print section of `scripts/backup.sh` (table printing, `one_db`, ping loop) after the verbatim runs were taken. The re-runs pasted after it are hand-condensed (`users 1, waterchanges 3, tanks 2`, `exit 0, OUT mode 600` on the same line as the message), not the script's real output, and the **empty database** case is missing. The code path that catches it (`count` + `-ge 1`) did not change, so the risk is low; this is about the ticket record matching the code being merged. Fix: re-run all four against the current HEAD and paste the raw output.

#### S2. minor — ticket 03 carries no record: boxes unticked, no `## Comments`, actionlint result not stated

`tickets/nightly-backup/issues/03-nightly-workflow.md`. Its checklist asks "`actionlint` passes if available (say so if it isn't)" and "typecheck, lint, tests and `check-status-claims.sh` green"; spec → Testing Decisions: "Workflow syntax: run `actionlint` if available." Tickets 01 and 02 have ticked boxes and a built comment; 03 has every box unticked and an empty `## Comments`. The facts exist elsewhere (review-03: actionlint not installed; log.md: self-check green) but not in the ticket the tracker says holds progress (`docs/agents/issue-tracker.md` → `## Comments`). Fix: tick the boxes and add a short built comment (actionlint not available, YAML read by hand in review-03, checks green).

#### S3. minor — ADR-0013 does not say ADR-0012's "No nightly backup yet" no longer holds

`docs/adr/0013-github-actions-aws-oidc-for-backups.md`. Spec → ADR-0013: "It records that ADR-0012's 'no nightly backup yet' consequence no longer holds, while infra is still applied from the laptop." Context quotes the ADR-0012 line and Consequences says "Infrastructure is still applied from the laptop (ADR-0012 holds)", but nothing states that the backup consequence is now superseded (once Accepted). A reader of ADR-0012 alone still sees "no nightly backup". Fix: one Consequences line, e.g. "ADR-0012's 'No nightly backup yet' no longer holds once this is Accepted; ADR-0012 is not edited."

### Standards

#### T1. minor (judgement) — ADR-0013's stated reason for "any workflow on main" is about a claim this repo no longer uses

`docs/adr/0013-github-actions-aws-oidc-for-backups.md` → Decision: "(GitHub's default `sub` claim cannot bind a role to one workflow file)". The repo already does not use the default `sub` (spec → Discovered: immutable subject claims, `repo:alexalikhani95@44570800/…`), and GitHub's repo-level OIDC sub customisation can include `job_workflow_ref`, so binding to one workflow file is possible, just not chosen. The decision itself ("any workflow on main", accepted in the spec) is not re-raised. The ADR is the "why" home (AGENTS.md → One home per fact) and the place the future deploy role will read; it should state the real reason (kept simple: one sub template for the whole repo) and that the trust uses the immutable `sub` form, linking to `lld.md` → Backup role for the exact string. Fix: reword that parenthesis; add one line on the immutable sub.

## Checked, no finding

- **Script vs spec steps 2–6:** SSM read with `--with-decryption` in `eu-west-2`; `::add-mask::` of URI, encoded and decoded password (escaped); dump with `--archive --gzip`, counts parsed from `done dumping`, fail on no parse; DB name from dump lines (ARCHIVE: from `finished restoring`); restore into the throwaway `mongo:8`; required three ≥ 1 in dump and restore; per-collection dumped = restored; collection sets equal; `0 document(s) failed`; `put-object --if-none-match '*'` to `fishtank_prod/<UTC to the second>.gz`; ARCHIVE never uploads; OUT copied only after the check. Log hygiene: only names and counts, `reason()` blanks URI/passwords, no `set -x`.
- **Linux runner file ownership:** `docker exec` runs tools as container root, archive is 0644 in the runner-owned 0700 `$TMP`, so the host can read, upload and unlink it. Not yet exercised on Linux; ticket 04's real run is the spec's acceptance for that.
- **Workflow:** triggers, cron, runner pin + CI's exact comment, permissions, no `environment:`, `persist-credentials: false`, plain role ARN and bucket matching Terraform; CI (`ci.yml`) has no `id-token` and only `pull_request`, so ADR-0013's `pull_request_target`/`workflow_run` rule holds.
- **Terraform:** bucket (public access block, SSE-S3, 30-day expiry, 1-day multipart abort, no versioning), provider, trust `StringEquals` on immutable `sub` + `aud`, policy only `PutObject` with `Null s3:if-none-match = false` and `GetParameter` on the `MONGO_URL` ARN, outputs. Since the quoted plan (5576227) only a comment changed in `main.tf`, and the branch is not behind `origin/main`, so the "7 to add, 0 to change" plan still stands.
- **Docs:** lld Infra rows, Nightly backup runbook (incl. empty-bucket note, 60-day trap, email check), Manual backup via `mongo:8`, REQUIRED note; hld diagram. `status.md`/`PLAN.md` deferred to ticket 04 per spec.
- **Commits:** Conventional Commits; infra and `.github/` changes each in their own commits.
- Not runnable here: `actionlint`, `shellcheck` (not installed).

## Verdict

blockers=0 important=0 minor=4 total=4
