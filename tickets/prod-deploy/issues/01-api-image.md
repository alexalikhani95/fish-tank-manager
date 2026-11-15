# 01: API image runs locally

**What to build:** The API builds into one production Docker image that boots and answers `GET /api/v1/health` on port 8080 when run on the laptop against the dev MongoDB, with the Lambda Web Adapter inside so the same image later runs on Lambda unchanged. Spec → Implementation Decisions → API image.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Label:** pattern (standard multi-stage Node Dockerfile; the npm-workspaces lockfile trap is spelled out in the spec) · **Test seams:** `docker run` + `curl` against the health route · **Risky:** no

- [ ] One Dockerfile and a `.dockerignore`, build context the repo root, per the spec (Node 24, root lockfile scoped to the `app` workspace, production deps only, non-root, pinned Lambda Web Adapter as an extension, no env baked in)
- [ ] Builds for `linux/arm64` as a single-platform Docker v2 manifest (no provenance attestation)
- [ ] `docker run` with the spec's plain env vars plus dev `MONGO_URL` (via `host.docker.internal`, since `localhost` inside the container is the container), `APP_KEY`, `JWT_SECRET` → `GET /api/v1/health` on :8080 returns 200 `database: connected`; command and output quoted in `## Comments`
- [ ] Neither the final image nor the build stage contains `.env*`, `tickets/`, `qa/`, `infra/` (list both, e.g. build with `--target` the build stage)
- [ ] Typecheck, lint, tests green
- [ ] Committed on its own (infra commit, `AGENTS.md` → Commit discipline)

## Comments
