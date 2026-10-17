# 0007. Zod for request validation instead of VineJS

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

`hld.md` named VineJS as the request validator because it is the one AdonisJS ships with: its provider adds `request.validateUsing()` and turns a failed check into a 422. ADR-0003 kept it when Lucid was dropped, since it is database-agnostic.

The first validators (Tank create/update) showed the two libraries are near-identical to write. The difference is reach: Zod is the de facto schema library in the React ecosystem, so schemas written for the API can later be shared with `web/` (and with shadcn `form`, which ADR-0005 deferred and which requires Zod). The cost of switching rises with every validator written, and only one exists.

## Decision

We will validate request bodies with **Zod** (`schema.parse(request.body())`) and drop VineJS and its Adonis provider.

- Schemas live under `app/validators/`, one per request shape.
- `app/exceptions/handler.ts` maps a `ZodError` to **400** with `{ errors: [{ field, message }] }`, matching the status code `lld.md` already specified for validation failures.

Alternatives considered:

- **Keep VineJS** — rejected. Zero glue code, but no path to one schema serving both form and API.
- **VineJS on both sides** — rejected. It runs in the browser, but nothing in the React/shadcn stack expects it.

## Consequences

- About ten lines of glue in the exception handler; `request.validateUsing` is gone.
- Adonis docs and examples use VineJS; a reader will find Zod in its place, hence this record.
- Sharing schemas with `web/` needs a place both workspaces can import from. Not built yet — add it when the first form wants an API schema.
