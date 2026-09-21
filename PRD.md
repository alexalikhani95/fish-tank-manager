# Fish Tank Manager — PRD

_Why and what. Not how — that's `docs/design/hld.md` (how it fits) and `docs/design/lld.md` (how it's built). Phases and progress are in `PLAN.md`._

## Problem

Keeping a fish tank healthy means changing water regularly and testing it — ammonia, nitrite, nitrate, pH, hardness — and comparing this week's numbers with last month's. That history lives in a notebook, a phone note, or nowhere. "When did I last change the water?" and "is nitrate creeping up?" have no quick answer. Existing apps are either spreadsheets in disguise or subscription products with a species database nobody asked for.

## Users

- **The keeper** — one person, one or more tanks, on their phone next to the tank. Logs a water change in ten seconds; logs a test while the strips are still wet. Single-user: a tank has exactly one owner and is never shared.
- **The developer** — this is also a portfolio project: it must demonstrate a MongoDB-only backend done properly, a real test setup, and a real deploy pipeline on AWS (see `PLAN.md` Phase 2). Second project on the `home-manager` process — it proves the workflow, not just the app.

## Goals

1. Logging a water change or a water test is faster than writing it down.
2. Every tank shows "last water change" and "last test" at a glance, and every parameter has a trend over time.
3. Installed on the keeper's phone like an app, no app store.
4. Adding a new water parameter is a one-line change with no data migration.

## Success criteria

- **v1 done:** the keeper logs every water change and test for their own tanks for a month without reaching for a notebook.
- **Portfolio done:** the app ships through the staging → prod pipeline with cost alarms in place, and the repo reads as a coherent example of how it was built.

## Features (v1)

- **Account** — sign up with email + password, log in, stay logged in on the phone. Settings: preferred volume unit (litres / US gallons / UK gallons) and temperature unit (°C / °F). No email verification, no password reset (see Not in v1).
- **Tanks** — the dashboard lists the keeper's tanks; create, edit, delete. A tank has a name, volume, optional brand and model, one photo, the fish in it (name + count), and the plants in it (name). Volume is entered and displayed in the keeper's preferred unit.
- **Water changes** — log a change: date and percentage of water replaced. Edit and delete. The tank shows its last water change ("12 days ago") and the litres that percentage works out to.
- **Water tests** — log a test: date and a value for any of the supported parameters (ammonia, nitrite, nitrate, pH, GH, KH, temperature, salinity), leaving untested ones blank. Edit and delete. The tank shows its last test, a history, and a trend chart per parameter.

Vocabulary for all of the above: `CONTEXT.md`.

## Not in v1

Sharing a tank with another person, species catalogue / autocomplete, water-change reminders, email verification and password reset (both need outbound email — Phase 3), multiple photos per tank, equipment and maintenance log (filter media, heater), feeding and dosing log, user-defined parameters. Roadmap for these lives in `PLAN.md` → Phase 3 and Stretch / Later.
