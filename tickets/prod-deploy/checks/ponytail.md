infra/prod/main.tf:L270-end: delete: outputs function_name and function_url, nothing in scripts/deploy.sh reads them. Drop both; 'terraform state show' or the console covers the rare lookup.
infra/prod/main.tf:L31-L42: yagni: ECR lifecycle policy for a single-user app deployed by hand; image storage cost is cents. Delete the resource until storage shows up on the bill.
infra/prod/main.tf:L93: shrink: LOG_LEVEL=info and TZ=UTC set explicitly; if app/start/env.ts defaults them (and Lambda is UTC already), drop both lines.
net: -~18 lines possible.

## Triage (main session)

- Outputs: kept. Spec and lld list them; `function_url` is the direct health check when CloudFront is suspect.
- ECR lifecycle: kept. User story 20 asks for it.
- LOG_LEVEL / TZ: kept. `app/start/env.ts:19` requires `LOG_LEVEL`; TZ is one line of certainty.
