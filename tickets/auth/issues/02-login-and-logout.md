# 02: Log in and log out

**What to build:** The keeper logs in on a new device with email and password, and logs out of the device they're on. A wrong password and an unknown email look identical. Logging out works even with an expired or broken cookie, and leaves other devices logged in.

**Blocked by:** 01

**Status:** ready-for-agent

> Don't edit `lld.md`, `hld.md`, `PLAN.md` or `docs/status.md`: one docs pass follows ticket 05. Where `lld.md` disagrees with `spec.md` or ADR-0009, the spec and ADR-0009 win.

**Label:** pattern (copies 01's register handler and cookie) · **Seams:** HTTP API (Seam 1) · **Risky:** yes, it is the login path, and the identical-401 and timing rules are security rules.

- [ ] `POST auth/login` with correct credentials returns 200 with the User and sets the cookie
- [ ] Wrong password and unknown email return `deepEqual` responses (the exact 401 body); an unknown email still runs a hash verify against a dummy hash
- [ ] `POST auth/logout` returns 204 and clears the cookie, with no auth needed, including when the cookie is expired or tampered
- [ ] Logout does not bump `tokenVersion`: a second token for the same User still reaches `GET me` afterwards
- [ ] A form-encoded login is not a 200 and sets no cookie
- [ ] Register with a password that ends in a space, then log in with that exact string: 200 (passwords are never trimmed)
- [ ] Typecheck, lint and tests green
