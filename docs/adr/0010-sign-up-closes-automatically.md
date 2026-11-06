# 0010. Sign-up closes automatically once a User exists

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

`PLAN.md`, `hld.md` and `lld.md` planned a `REGISTRATION_OPEN` env flag: open it to create the first User, then set it to false. This app has exactly one intended User (`PRD.md`), so the flag guards a window that is needed once.

A flag is a setting per environment, and a forgotten one leaves sign-up open on a public API.

## Decision

We will **close sign-up as soon as one User exists**. `POST auth/register` counts Users before it reads the body and answers 403 `Sign-up is closed` if there is any. There is no `REGISTRATION_OPEN` variable.

Alternatives considered:

- **`REGISTRATION_OPEN` env flag** (the earlier plan). Rejected: it depends on someone remembering to turn it off, in every environment.
- **Rate-limiting sign-up.** Rejected: a throttled endpoint is still open. A closed one gives every request the same 403.

## Consequences

- **Reverses the `REGISTRATION_OPEN` plan** in `PLAN.md`, `hld.md` and `lld.md`; they now describe this rule.
- **First-sign-up race accepted:** two sign-ups racing on an empty database could both succeed. One keeper, one deploy; not worth a lock.
- **A second User can only be made through the model** (a script or the test setup), not the API.
- **No flag to manage** per environment.
- **Revisit** if the app ever serves more than one keeper.
