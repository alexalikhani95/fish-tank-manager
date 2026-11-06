# 03: Set display units on the User

**What to build:** The keeper sets their volume unit (litres, US gallons, UK gallons) and temperature unit (°C, °F) with `PATCH me`. Defaults (litres, °C) come from ticket 01's User model. Bad values and unknown fields are refused with an error naming the field.

**Blocked by:** 01

**Status:** ready-for-agent

> Don't edit `lld.md`, `hld.md`, `PLAN.md` or `docs/status.md`: one docs pass follows ticket 05. Where `lld.md` disagrees with `spec.md` or ADR-0009, the spec and ADR-0009 win.

**Label:** pattern (copies the strict Tank update schema) · **Seams:** HTTP API (Seam 1) · **Risky:** no.

- [ ] `PATCH me` with `volumeUnit` and/or `temperatureUnit` returns 200 with the updated User; `GET me` shows the change
- [ ] An invalid value is a 400 naming the field; an unknown key (e.g. `email`, `tokenVersion`) is a 400 naming that key and changes nothing; an empty body is a 400 with `field: ''`
- [ ] `PATCH me` without a token is the exact 401 body
- [ ] Typecheck, lint and tests green
