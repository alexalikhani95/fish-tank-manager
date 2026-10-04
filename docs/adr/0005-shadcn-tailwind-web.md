# 0005. shadcn/ui and Tailwind for the PWA

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

`PLAN.md` picks React + TypeScript + Vite for `web/` and Recharts for trends, and says nothing about how anything is styled. No ADR, PRD line, or design doc records a styling approach, so the first UI ticket would invent one.

The PWA is mobile-first and used one-handed next to a tank. It needs a small set of real interactive controls — date and number inputs, selects for unit preferences, a dialog to confirm deleting a tank — and those are where hand-rolled markup goes wrong on accessibility: keyboard focus, ARIA, touch targets.

There is one developer and seven screens. A full design system is more than this needs; unstyled markup is less.

## Decision

We will use **Tailwind CSS v4** (via `@tailwindcss/vite`, CSS-first config, no `tailwind.config.js`) as the styling layer for `web/`, and **shadcn/ui where a component earns its place** — pulled in per screen with the CLI, landing as editable source under `web/src/components/ui/`.

"Where it earns its place" is the rule, not a component-for-everything policy:

- **Use shadcn** for anything with interaction or accessibility behaviour worth not rewriting: form controls (`input`, `label`, `select`, `textarea`, `button`), `dialog`, `sonner`/toast, `card` where it saves repeated classes.
- **Use plain HTML + Tailwind** for layout, lists, headings, the dashboard tank tiles, and anything that is a `div` with classes. Do not run the CLI to get a styled `<p>`.

Not taken now, because nothing in v1 needs them:

- **shadcn `form`** — it requires react-hook-form + zod. v1 has three short forms; native `<form>` validation plus shadcn inputs covers them. Add it when a form genuinely needs cross-field logic.
- **shadcn `chart`** — a themed wrapper over Recharts. One chart in v1; use Recharts directly and revisit if it looks foreign next to the rest.
- **Dark mode** — Tailwind's `dark:` stays available whenever it is wanted.

Alternatives considered:

- **MUI / Chakra** — rejected. A runtime dependency that owns your markup and fights per-component customisation; shadcn components are copied source we can edit.
- **CSS Modules or plain CSS, no component library** — rejected. Cheapest to start, but it means hand-rolling dialog and select accessibility, which is exactly the part worth not writing.
- **Tailwind alone, no shadcn** — rejected for the same reason, in a smaller way.

## Consequences

- **Tailwind is now repo-wide for `web/`.** Every UI ticket writes utility classes; a later switch to another styling approach means touching every component.
- **The dependency list grows by shadcn's orbit**: Radix primitives (per component pulled), `clsx`, `tailwind-merge`, `class-variance-authority`, and `lucide-react` for icons. shadcn itself is not a runtime dependency.
- **We own the components.** Copied source means no upstream upgrade path — a fixed bug in shadcn is a re-copy, not a version bump. Acceptable for seven screens.
- **Accessibility basics come free** from Radix (keyboard, focus, ARIA) for the controls that use it. Plain-HTML areas remain our responsibility.
- **The CLI writes files.** `web/components.json` and `web/src/components/ui/*` are committed source, reviewed like anything else.
- **Revisit** if the forms outgrow native validation (take shadcn `form`), or if the trend chart drifts visually from the rest (take shadcn `chart`).
