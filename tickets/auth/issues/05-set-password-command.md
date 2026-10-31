# 05: Reset a forgotten password from the server

**What to build:** `node ace user:set-password <email>` lets the keeper reset a forgotten password. It asks for the new password twice at a hidden prompt. On success the new password works, the old one doesn't, and every device is signed out. It refuses an unknown email, a mismatch or a too-short password and changes nothing.

**Blocked by:** 02

**Status:** ready-for-agent

> Don't edit `lld.md`, `hld.md`, `PLAN.md` or `docs/status.md`: one docs pass follows ticket 05. Where `lld.md` disagrees with `spec.md` or ADR-0009, the spec and ADR-0009 win.

**Label:** new design (the repo's first ace command) · **Seams:** the command run in-process (Seam 2), effects checked over the HTTP API (Seam 1) · **Risky:** yes, it changes credentials and revokes every token.

- [ ] The email argument is normalised like the API's; an unknown email exits non-zero before any prompt
- [ ] Prompts `New password` then `Confirm password`, both hidden; a mismatch or a password outside 12–256 exits non-zero and changes nothing
- [ ] On success: the new hash is set and `tokenVersion` incremented. The new password logs in, the old one gets 401, and a token from before the reset gets 401 on `GET me`
- [ ] The command boots the app (`startApp`, for Mongo and `hash`). Add `"#commands/*": "./commands/*.js"` to the app's `package.json` `imports` so tests can import it
- [ ] Reuses ticket 01's exported email and password Zod rules, not a copy; the prompt value is used as typed (never trimmed)
- [ ] Tests drive it in-process: `ace = await app.container.make('ace')`, `ace.ui.switchMode('raw')`, `cmd = await ace.create(SetPassword, [email])`, `cmd.prompt.trap('New password').replyWith(...)` and the same for `'Confirm password'`, `await cmd.exec()`, then `cmd.assertSucceeded()` / `assertFailed()`
- [ ] Typecheck, lint and tests green
