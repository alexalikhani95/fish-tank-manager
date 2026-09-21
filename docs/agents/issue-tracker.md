# Issue tracker: Local Markdown

Specs and tickets for this repo live as markdown files in `tickets/`. No external tool.

## Conventions

- One feature per directory: `tickets/<feature-slug>/`
- The spec is `tickets/<feature-slug>/spec.md`
- Tickets are one file each at `tickets/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is a `Status:` line near the top of each ticket, one of: `needs-triage` (maintainer to evaluate) · `needs-info` (waiting on reporter) · `ready-for-agent` (fully specified, an agent can build it) · `ready-for-human` (needs a person) · `wontfix`. These are the five canonical roles the skills speak in, used as-is.
- Dependencies are a `Blocked by: NN, NN` line near the top
- Progress notes and hand-off state append under a `## Comments` heading at the bottom

## When a skill says "publish to the issue tracker"

Create a new file under `tickets/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the ticket number directly.
