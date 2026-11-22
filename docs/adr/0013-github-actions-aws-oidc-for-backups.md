# 0013. GitHub Actions reaches AWS through OIDC, starting with backups

- **Status:** Proposed
- **Date:** 2026-11-22

## Context

The prod database is an Atlas M0 cluster with no backups (ADR-0012 → Consequences: "No nightly backup yet"). A nightly backup has to run while the keeper's laptop is off, so it runs on GitHub Actions, and it needs two things in AWS: read the prod `MONGO_URL` from SSM, and write the copy to S3. Until now nothing in GitHub could reach AWS; every AWS change is applied from the laptop (ADR-0012).

## Decision

We will let GitHub Actions log in to AWS with **OIDC**: an IAM OpenID Connect provider for GitHub and one narrow role per purpose. The first and only role is for the nightly backup. It is trusted for any workflow on `main` of this repository (kept simple: one `sub` for the whole repo rather than a custom claim with `job_workflow_ref`). The trust matches the immutable `sub` form this repo uses, which includes the owner and repo ids; the exact string is in `lld.md` → Backup role. It can only read `/fishtank/prod/MONGO_URL` and add new objects to the backup bucket, never overwrite, read or delete them.

Rejected:

- **A long-lived IAM access key in GitHub secrets.** It never expires and is a standing credential in a public repo's settings.
- **A copy of `MONGO_URL` in GitHub secrets.** That would be a second home for the secret. The role reads it from SSM instead.
- **A scheduled Lambda in AWS.** It needs no GitHub trust, but it means a second image or layer with the MongoDB tools and a separate restore check. More to build for one job.
- **Atlas paid backups.** Built in, but they cost dollars a month for a kilobyte of data.

## Consequences

- Backups run without the laptop, and GitHub holds no AWS key and no database password.
- A workflow on `main` can read the prod database. Anyone who can push to `main` can do that already with the keeper's own access.
- Infrastructure is still applied from the laptop (ADR-0012 holds). The role cannot change infrastructure.
- ADR-0012's "No nightly backup yet" no longer holds once this is Accepted. ADR-0012 is not edited.
- The deploy pipeline (`PLAN.md` → Phase 2) can reuse the provider with its own role later. Each new role is a new, narrow grant, not a widening of this one.
- GitHub disables scheduled workflows in a public repo after 60 days without activity. It emails a warning, and the runbook says how to re-enable the workflow.
- Never give `id-token: write` to a `pull_request_target` or `workflow_run` workflow: those run with the main ref, so their token would match this role.
