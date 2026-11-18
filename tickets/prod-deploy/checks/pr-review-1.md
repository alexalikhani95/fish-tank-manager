# PR review 1 — feature/prod-deploy (PR #12) vs origin/main

Scope: `git diff origin/main...HEAD` (23 commits, 4198d79..8cc6997). Spec `tickets/prod-deploy/spec.md` (no `## Carried to review` section; `## Discovered` respected). Items fixed or triaged in review-02/03/04 and ponytail.md not re-raised.

## Findings

### F1 — important — docs/design/lld.md:369 — restore command uses `$MONGO_URL` right after the block unsets it

Problem: the backup block ends with `unset MONGO_URL` (lld.md:366). The very next sentence gives restore as `mongorestore --uri "$MONGO_URL" --archive=<file> --gzip`, with no step to fetch the value again.
Failure scenario: during a disaster recovery the keeper pastes the restore line in the same shell. `--uri ""` is treated as no URI, so mongorestore uses its default `mongodb://localhost:27017`. It either fails with connection refused, or, while `npm run db` is running, restores prod data into the local dev Mongo and reports success. Prod stays empty.
Fix: give restore its own fenced block that repeats the `MONGO_URL="$(aws ssm get-parameter … --with-decryption …)"` line, then `mongorestore`, then `unset MONGO_URL`. Neither command has been run yet (status.md: "not yet run"), so do a dry run once: dump, then restore into a scratch db with `--nsFrom/--nsTo`.

### F2 — important — docs/design/lld.md:353, docs/status.md:12 and :38, scripts/deploy.sh:43 — SHAs that squash merge will remove from history

Problem: docs/conventions/git.md:26-27 says to squash merge and delete the branch. After PR #12 merges, `fbf2097` (the rollback floor in lld.md:353) and `ef55ea4` (the prod Deployed SHA in status.md) are not on `main`. Once the branch is deleted, a normal clone cannot reach them. `deploy.sh` tags the image with whatever `HEAD` is, including an unmerged branch commit. That goes against spec user story 10 ("every image tag is a real commit I can find again").
Failure scenario: after the merge, the keeper follows the rollback rule "only to commits at or after fbf2097". `git worktree add … fbf2097` fails, or the keeper can't tell which `main` commits are "after" it. Every main commit before the squash has no `infra/prod`. status.md names a prod SHA that `git log main` doesn't show.
Fix: once the PR merges, run `npm run deploy` from the squash commit on `main`, then record that SHA in status.md. Write the rollback floor as "the squash commit of PR #12 (or later) on `main`". Optionally, `deploy.sh` can refuse or warn when `HEAD` is not reachable from `origin/main` (`git merge-base --is-ancestor HEAD origin/main`).

### F3 — minor — scripts/deploy.sh:52-56 and Dockerfile:5,15,22-23 — rollback rebuilds the image from floating base tags instead of reusing the image already in ECR

Problem: the bases are `node:24-slim` (a floating tag) and the adapter `aws-lambda-adapter:1.0.0` (a tag, not a digest). Rollback (lld.md:347-353) rebuilds the old commit, and the push replaces that commit's tag in ECR. ECR still has the original image (the lifecycle rule keeps 10), but the script never uses it.
Failure scenario: rolling back to escape a bad release that was really caused by a base-image change (a new Node 24 minor, a changed upstream image) rebuilds on the same new base. The rollback doesn't fix it and still passes the smoke check.
Fix: pin the bases by digest (`node:24-slim@sha256:…`, `aws-lambda-adapter:1.0.0@sha256:…`). Or have `deploy.sh` skip build and push when `aws ecr describe-images --image-ids imageTag=$TAG` already finds the tag. The second option also makes re-deploys faster.

### F4 — minor — docs/design/lld.md:260 and :355 — the same boot-timeout fact is written twice

Problem: the Lambda environment paragraph ends with "A Lambda init/invoke timeout usually means a wrong `MONGO_URL` or Atlas access list (Mongo connect waits 30 s…): check CloudWatch". Troubleshooting (line 355) says the same thing again ("init is capped at 10 s and Mongo connects at boot, so a wrong `MONGO_URL` or Atlas access list shows up here"). That breaks AGENTS.md "One home per fact".
Failure scenario: one copy gets updated later, for example when `serverSelectionTimeoutMS` is set as review-03 F5 suggests, and the two copies disagree.
Fix: delete the sentence at line 260 and move "Mongo connect waits 30 s" into Troubleshooting.

## Checked and fine

- Dockerfile: two `node_modules` trees (as Discovered says), non-root `USER node`, no env baked in, `.dockerignore` keeps `app/tests` and `web/package.json` and drops `.env*`.
- main.tf: OAC bucket policy scoped to the distribution ARN; public access blocked; function URL permissions keep `invoked_via_function_url = true`; execution role is logs-only on `<arn>:*`; `/api/*` uses CachingDisabled + AllViewerExceptHostHeader with no custom error responses; the SPA rewrite is on the default behaviour only; no dependency cycle.
- deploy.sh: `pipefail`; dirty-tree refusal; the full apply is interactive; upload order is assets → shell `--delete` → assets `--delete`; manifest type pinned; the smoke check fails through `$(…)` under `set -e`; `x-cache` must be `Miss`.
- Runbook: step 1/3 commands carry `--region`, `--value=` for a key starting with `-`, the "lost the race" collections match `app/app/models` (users, tanks, waterchanges).

## Verdict

blockers=0 · important=2 (F1, F2) · minor=2 (F3, F4) · total=4
