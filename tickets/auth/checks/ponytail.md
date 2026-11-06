app/app/middleware/auth_middleware.ts:L21,L50: consider: ctx.userId duplicates ctx.user._id; tanks_controller reads userId in 5 places. Keep unless you want to touch tanks_controller; otherwise destructure `user` and use user._id.
app/package.json imports `#config/*`, `#commands/*`: consider: aliases added with no importer (command is loaded by path, config by Adonis). Remove both if grep shows no `#config/` or `#commands/` import.
app/config/hash.ts:L5-16: consider: scrypt options restate Adonis defaults (cost 16384, blockSize 8, parallelization 1, maxMemory 32MB). Use `drivers.scrypt({})` if defaults match; the file itself is still required by HashersList typing.

Triage: none applied. #1 kept (spec: Tanks controller unchanged, reads `ctx.userId`). #2 `#commands/*` is imported by `set_password.spec.ts`; `#config/*` predates this branch. #3 kept (stock Adonis stub, accepted in review-01).
