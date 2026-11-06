# 01: Register the keeper's User and read it back

**What to build:** The keeper registers with email and password, is logged in straight away by cookie, and `GET me` returns their User. Once one User exists, sign-up is closed. This is the tracer bullet: the User model, password hashing, the token, the cookie and the auth middleware all land here, behind `GET me`. See `spec.md` → Implementation Decisions for the exact rules and error bodies.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

> Don't edit `lld.md`, `hld.md`, `PLAN.md` or `docs/status.md`: one docs pass follows ticket 05. Where `lld.md` disagrees with `spec.md` or ADR-0009, the spec and ADR-0009 win.

**Label:** new design · **Seams:** HTTP API (Seam 1) · **Risky:** yes, it is the login and security core, and later tickets share the middleware and User model.

- [ ] `POST auth/register` creates the User (email trimmed and lowercased, password 12–256, unknown keys stripped), sets the `token` cookie with every attribute explicit, and returns 201 with the User JSON (no `passwordHash`, `tokenVersion` or `__v`)
- [ ] With any User present, register returns the exact 403 body, even for an invalid body; a duplicate-email unique-index error maps to the exact 409 body
- [ ] Auth middleware per ADR-0009: cookie if present, else bearer; sets `ctx.user` and `ctx.userId`. Move the `userId` `HttpContext` declaration out of the old `DEV_USER_ID` middleware into the auth middleware and add `user` beside it; the old middleware keeps compiling through it until 04 deletes it
- [ ] `GET me` returns 200 with the User; the exact 401 body for no token, tampered, expired, revoked (`tokenVersion` bumped) and deleted-User tokens
- [ ] `GET me` works with an `Authorization: Bearer` header and no cookie
- [ ] Only JSON is parsed: set `form` and `multipart` `types` to empty lists (deleting the keys doesn't work, `defineConfig` merges defaults back in). A form-encoded register is not a 201 and sets no cookie
- [ ] JSON string trimming off (`trimWhitespaces: false`): a password of 11 characters plus a trailing space registers (201), so passwords count exactly as sent; email is still trimmed by Zod
- [ ] A new User has `volumeUnit: 'L'` and `temperatureUnit: 'C'` in its JSON
- [ ] `JWT_SECRET` required at boot (≥ 32 chars), in `.env.example` (with the generation comment) and the test env; hash config and provider registered; `jose` added
- [ ] One test checks the cookie attributes (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age`, no `Domain`)
- [ ] By hand: boot with no `JWT_SECRET`, and with a 31-character one; both refuse to start. Put the result in the report
- [ ] Export the email and password Zod rules so ticket 05 reuses them
- [ ] `DEV_USER_ID` and its middleware stay in place for Tanks (ticket 04 removes them); typecheck, lint and tests green
