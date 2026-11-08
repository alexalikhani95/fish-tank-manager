# 0011. JSON-only request bodies, strings not trimmed by the parser

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

ADR-0006 relies on `SameSite=Lax` plus an API that accepts `application/json` only as its CSRF defence, with no CSRF token. Adonis's body parser accepts form and multipart bodies by default, so the "JSON only" half was not yet true in code.

The parser also trims every string by default. For a password that changes the value: a passphrase with a leading or trailing space would count, and hash, differently from what the user typed.

## Decision

We will parse **JSON bodies only**: the `form` and `multipart` parsers are off (`config/bodyparser.ts`). Photos go to S3 by presigned URL, so nothing needs multipart. A form-encoded body arrives empty and fails validation.

We will set **`trimWhitespaces: false`**, so passwords count exactly as sent, in the API and in `user:set-password`.

We will set **`convertEmptyStringsToNull: false`** (added 2026-11-08, ticket 03), so `''` reaches the schema as a string: an optional text field such as a WaterChange note can be empty, and `null` stays distinguishable from `''`.

Alternative considered: keep default trimming and exempt the password field. Rejected: Adonis's setting is global, so it would mean a per-field exception to a parser default.

## Consequences

- **Completes ADR-0006's CSRF defence.**
- **Every string field's Zod schema must `.trim()` itself if it should be trimmed** (email, Tank name, any new field such as `brand`). A schema that forgets stores the text as sent.
- **Every Zod schema must handle `''` itself** (since 2026-11-08): the parser no longer turns it into `null`, so a required string needs `.min(1)` (after `.trim()` where trimmed), and an optional one accepts `''` unless it says otherwise.
- **A form-encoded or multipart route can't be added** without revisiting this ADR and ADR-0006.
