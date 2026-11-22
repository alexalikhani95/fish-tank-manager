# 04: Switch it on and prove it

**What to build:** after merge, the backup resources are live, one real run has passed and left a copy in the bucket, and the role's limits are proven, not assumed. A follow-up PR records it. Spec → Rollout order steps 3–6; Testing Decisions → Acceptance, IAM is proven.

**Blocked by:** 03 (and the merge)

**Status:** ready-for-human

**Label:** boilerplate · **Test seams:** none · **Risky:** yes, the first apply of IAM to prod

Keeper (or the agent, if asked):

- [ ] Same day as the merge: `npm run deploy` from a clean `main` applies the backup resources (the app redeploys at the same code)
- [ ] `gh workflow run` the backup job: it passes and exactly one object lands in the bucket
- [ ] `aws iam simulate-principal-policy` on the role (your own credentials need `iam:SimulatePrincipalPolicy`), with the object ARN `arn:aws:s3:::fishtank-backups-107014414355/fishtank_prod/x.gz`, the bucket ARN for `ListBucket`, and the SSM ARNs. The allowed `PutObject` case passes `--context-entries ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string`; the denied case leaves it out. Results: `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject`, `ssm:GetParameter` on another parameter, and `s3:PutObject` without `s3:if-none-match` are each **denied**; `s3:PutObject` with `s3:if-none-match` and `ssm:GetParameter` on `MONGO_URL` are each **allowed**. Paste the results here
- [ ] GitHub → Settings → Notifications → Actions email is on

Agent, follow-up PR:

- [ ] `docs/status.md` Backups row (bucket, schedule, last verified run); `PLAN.md` Phase 2 ticks the nightly backup; ADR-0013 set to Accepted; these results in `## Comments`

## Comments
