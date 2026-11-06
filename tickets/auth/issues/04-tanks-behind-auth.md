# 04: Put Tanks behind login and remove the fake User

**What to build:** Every Tank route needs a logged-in User and only ever shows that User's Tanks. The fake `DEV_USER_ID` User is gone from the code, the env and the local database.

**Blocked by:** 02

**Status:** ready-for-agent

> Don't edit `lld.md`, `hld.md`, `PLAN.md` or `docs/status.md`: one docs pass follows ticket 05. Where `lld.md` disagrees with `spec.md` or ADR-0009, the spec and ADR-0009 win.

**Label:** boilerplate (swap the middleware on the existing Tanks routes) · **Seams:** HTTP API (Seam 1) · **Risky:** yes, it changes who can reach every Tank, and it deletes the old stub that ticket 01 left in place.

- [ ] The Tanks route group uses the auth middleware; the Tanks controller is unchanged and reads `ctx.userId`
- [ ] Every Tank route without a token returns the exact 401 body
- [ ] The Tanks tests use a real logged-in User; the ownership test creates a second User through the model, logs it in, and gets 404 for the first User's Tank
- [ ] One Tanks test uses an `Authorization: Bearer` header with no cookie
- [ ] `DEV_USER_ID` removed from the env schema, `.env.example`, the test env and the codebase, along with its middleware
- [ ] Tanks in the local `fishtank_dev` database deleted (they belonged to the fake User; the database is shared with the main checkout, which is fine): from the repo root, `docker compose exec mongo mongosh fishtank_dev --quiet --eval 'db.tanks.deleteMany({})'`. Put the deleted count in the report
- [ ] Typecheck, lint and tests green
