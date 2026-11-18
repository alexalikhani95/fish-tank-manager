# 05: Keeper's first use on the phone

**What to build:** The keeper is the prod User and has logged a real WaterChange from their phone; the repo's docs say what is live. Spec → First User, Testing Decisions → acceptance on a real phone.

**Blocked by:** 04

**Status:** done

**Label:** boilerplate · **Test seams:** none (manual phone acceptance) · **Risky:** no

Keeper:

- [x] On the phone (already signed up in 04), installs the PWA from the prod URL, adds a Tank, logs a WaterChange, closes the app, cold-opens it and sees the WaterChange. Result noted in `## Comments`
- [x] `POST /api/v1/auth/register` now refuses (sign-up closed, ADR-0010)
- [ ] Optional: request an AWS Lambda concurrency limit increase (Service Quotas) so ADR-0004's cap can come back

Agent:

- [x] Runbook in `lld.md`: manual `mongodump` backup (with `brew install mongodb-database-tools`), troubleshooting via the Lambda's CloudWatch log group
- [x] `docs/status.md`: prod rows (URL, region, Atlas cluster, what was verified and when); `scripts/check-status-claims.sh` passes
- [x] `PLAN.md` Phase 2: tick/annotate what this slice did (prod only, S3 lock file not DynamoDB, ECR rule), leaving staging, pipeline and backups open

## Comments

- 2026-11-18 (keeper): signed up on the phone. `POST /api/v1/auth/register` now returns `403 {"errors":[{"field":"","message":"Sign-up is closed"}]}` (ADR-0010).
- 2026-11-18 (keeper): installed the PWA from the prod URL on the phone, added a Tank, logged a WaterChange, closed the app, cold-opened it and saw the WaterChange. "all good".
