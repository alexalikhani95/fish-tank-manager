# 04: PWA and API behind one CloudFront address

**What to build:** The prod address (`*.cloudfront.net`) serves the PWA from S3 and sends `/api/*` to the Lambda, so the app and the auth cookie work on one HTTPS origin. `npm run deploy` now does all seven steps and fails unless the full smoke check passes. Spec → Implementation Decisions → Terraform (S3, CloudFront, outputs), Deploy command steps 4–7, and the runbook's deploy/rollback/backup/troubleshooting sections.

**Blocked by:** 03

**Status:** ready-for-agent — flip to ready-for-human when the Agent items are ticked; the keeper runs the real deploy

**Label:** new design · **Test seams:** the deploy's smoke check through CloudFront (spec step 6) · **Risky:** yes — CloudFront cookie forwarding and caching (ADR-0006: get it wrong and auth breaks or one response is served to another)

Agent:

- [ ] Private PWA bucket read only through OAC; CloudFront with `PriceClass_100`, HTTPS redirect, `default_root_object`; default behaviour caching-optimised + the SPA-rewrite CloudFront Function; `/api/*` → function URL with CachingDisabled + AllViewerExceptHostHeader, all methods; **no** distribution-level custom error responses; the remaining outputs listed in the spec (CloudFront URL, distribution id, bucket name)
- [ ] Deploy: add the PWA build to step 3, then steps 4–7: upload with the spec's cache headers and deletion of removed files; invalidate `/*`; smoke check exactly as spec step 6 (health JSON and not a cache hit twice, `me` 401 JSON with and without a garbage cookie, `/` and a deep link HTML, `no-cache` on `index.html` and `sw.js`), retrying for cold start; prints the URL
- [ ] `terraform plan` summary quoted in `## Comments`; no apply by the agent
- [ ] Runbook in `lld.md`: first deploy and **sign up on your phone straight away**, the lost-race fallback, rollback
- [ ] `hld.md` deploy picture updated if it differs
- [ ] Typecheck, lint, tests green; infra in its own commit, docs in another

Keeper:

- [ ] Runs `npm run deploy`, reads the plan, types `yes`; smoke check output pasted into `## Comments` — then signs up on the phone straight away (ADR-0010)
- [ ] Rollback once: deploys the previous commit from a throwaway worktree, smoke check passes, then redeploys the branch head

## Comments
