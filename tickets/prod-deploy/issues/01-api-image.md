# 01: API image runs locally

**What to build:** The API builds into one production Docker image that boots and answers `GET /api/v1/health` on port 8080 when run on the laptop against the dev MongoDB, with the Lambda Web Adapter inside so the same image later runs on Lambda unchanged. Spec → Implementation Decisions → API image.

**Blocked by:** None (can start immediately)

**Status:** done

**Label:** pattern (standard multi-stage Node Dockerfile; the npm-workspaces lockfile trap is spelled out in the spec) · **Test seams:** `docker run` + `curl` against the health route · **Risky:** no

- [x] One Dockerfile and a `.dockerignore`, build context the repo root, per the spec (Node 24, root lockfile scoped to the `app` workspace, production deps only, non-root, pinned Lambda Web Adapter as an extension, no env baked in)
- [x] Builds for `linux/arm64` as a single-platform Docker v2 manifest (no provenance attestation)
- [x] `docker run` with the spec's plain env vars plus dev `MONGO_URL` (via `host.docker.internal`, since `localhost` inside the container is the container), `APP_KEY`, `JWT_SECRET` → `GET /api/v1/health` on :8080 returns 200 `database: connected`; command and output quoted in `## Comments`
- [x] Neither the final image nor the build stage contains `.env*`, `tickets/`, `qa/`, `infra/` (list both, e.g. build with `--target` the build stage)
- [x] Typecheck, lint, tests green
- [x] Committed on its own (infra commit, `AGENTS.md` → Commit discipline)

## Comments

**Implementer (2026-11-15):**

Build (single platform, no attestation; `npm run db` was running for the dev Mongo):

```
docker buildx build --platform linux/arm64 --provenance=false --load -t fishtank-api .
docker image inspect fishtank-api --format '{{.Architecture}} {{.Os}} {{.Config.User}}'   # arm64 linux node
docker buildx build --platform linux/arm64 --provenance=false -o type=docker,dest=d.tar .  # manifest.json (Docker format), one image
```

A `type=oci` export is also a one-entry index, but the Dockerfile header says to push with `oci-mediatypes=false` so ECR gets a Docker v2 manifest. The actual push to ECR is not tried here (no AWS).

Run:

```
docker run -d --name fishtank-api-check -p 8080:8080 \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=8080 -e LOG_LEVEL=info -e TZ=UTC \
  -e AWS_LWA_READINESS_CHECK_PATH=/api/v1/health -e APP_URL=https://localhost \
  -e MONGO_URL=mongodb://host.docker.internal:27017/fishtank_dev \
  -e "APP_KEY=$(openssl rand -base64 32)" -e "JWT_SECRET=$(openssl rand -base64 48)" fishtank-api
curl -si localhost:8080/api/v1/health
```

```
{"level":30,...,"msg":"started HTTP server on 0.0.0.0:8080"}
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8

{"status":"ok","database":"connected"}
```

`id` in the container: `uid=1000(node)`. `/opt/extensions/lambda-adapter` is present (adapter `public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0`).

Forbidden paths: `find / -xdev ( -name ".env*" -o -name tickets -o -name qa -o -name infra )` outside `node_modules` printed nothing for both the final image and the `--target build` image.

Findings for later tickets:

- The root lockfile installs the API's dependencies under `app/node_modules`, not the root `node_modules` (root only holds `jose`, `zod`). The final image therefore copies both trees. `reflect-metadata` was "not found" until `app/node_modules` was copied.
- `app/tests` must stay in the build context: `node ace build` typechecks `bin/test.ts`, which imports `tests/bootstrap.js`.
- `typescript` appears in the production `node_modules` because `@adonisjs/core` -> `@adonisjs/assembler` depends on it; not a devDependency leak.
- The working tree's `package-lock.json` has unrelated key-order changes (not mine); left unstaged. The image build used it and the committed lockfile has the same `app/node_modules` layout.
- Checks: typecheck, lint green; `npm test` 76 passed. Prettier cannot parse `.dockerignore`/`Dockerfile` (no parser), so they are not formatted by it.
