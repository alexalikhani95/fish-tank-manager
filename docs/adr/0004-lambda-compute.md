# 0004. API on AWS Lambda, always on, at no cost

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

`PLAN.md` put the API on ECS with the EC2 launch type (`t4g.micro`), about $10/month per environment, and kept that near zero by destroying staging nightly and bringing prod up only for demos.

That rule does not survive real use. The keeper logs water changes and tests from their phone at the tank, and the data lives in Atlas, not on the phone. A prod that has to be `terraform apply`-ed first (5–10 minutes) is a prod that does not get used. Keeping EC2 up around the clock costs about $8/month from the shared AWS credits, and the goal is to spend nothing.

The traffic is one person: a few hundred requests a month.

## Decision

We will run the API on **AWS Lambda**, packaged as the same Docker image we build for local runs, with **AWS Lambda Web Adapter** so AdonisJS runs unchanged as a normal HTTP server. **CloudFront** sits in front: `/*` serves the PWA from S3, `/api/*` goes to the Lambda function URL. Secrets move from Secrets Manager to **SSM Parameter Store** (`SecureString`, standard tier). Both environments stay up permanently.

Alternatives considered:

- **ECS on EC2, always on** — rejected. It works and is always instant, but costs about $8/month per environment for a server that is idle almost all the time.
- **ECS on EC2, on demand** (the previous plan) — rejected. The app cannot save anything while prod is down, and starting it takes 5–10 minutes.
- **A different framework built for Lambda** (Hono, a bare handler) — rejected. The Web Adapter keeps Adonis, so ADR-0003 and its test patterns stand.
- **Free hosts outside AWS** (Render, Oracle Cloud, Google Cloud Run) — rejected. Render sleeps and takes about a minute to wake; the others move compute off AWS, which the portfolio goal in `PRD.md` is about.

## Consequences

- **Cost is about $0/month per environment.** Lambda, CloudFront, Parameter Store and CloudWatch Logs sit inside AWS's always-free tiers at this traffic. ECR image storage is cents. The Lambda free tier is per account, shared with the other projects on it, and one keeper's usage is far below it.
- **No destroy rules.** Idle Lambda costs nothing, so staging and prod both stay up. The nightly staging destroy and "prod only for demos" go away.
- **Cold starts.** The first request after a quiet spell waits about 1–3 seconds while Adonis boots and connects to Mongo. Later requests reuse the warm instance and its Mongo connection.
- **No VPC.** Lambda runs outside a VPC, so there is no network module and no NAT Gateway. Lambda has no fixed IP and Atlas M0 has no private networking, so Atlas network access is open to `0.0.0.0/0`, protected by credentials and TLS only.
- **Reserved concurrency is capped** (a handful) so a runaway client cannot open hundreds of Mongo connections against M0's limit or run up invocations.
- **Background work runs as an EventBridge schedule** that invokes the same function, not a long-running `ace` process. Phase 3 reminders use this.
- **Less practice running a server.** ECS, instance patching and capacity are no longer exercised here.
- **Revisit** if cold starts become annoying in daily use (provisioned concurrency costs money, so the first step is measuring), or if traffic ever leaves the free tier.
