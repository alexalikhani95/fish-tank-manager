# Fish Tank Manager — agent guide

Single-user aquarium log: a User owns Tanks and logs WaterChanges and WaterTests against them. Why and what: `PRD.md`. Stack and phases: `PLAN.md`. Vocabulary: `CONTEXT.md`. Way of working copied from `home-manager`; the stack differs where `docs/adr/` says so (Mongo-only, Adonis without Lucid).

## Scope of this repo

Monorepo — API (`app/`), PWA (`web/`), infra (`infra/`), and all docs in one place.

## Status

Planned, not scaffolded — see `docs/status.md`. Commands below become real at scaffold (`PLAN.md` Phase 1, first item).

## Directory map

```
fish-tank-manager/
├── AGENTS.md               # You are here — agent entry point (CLAUDE.md imports it)
├── PRD.md                  # Why & what — problem, users, goals, success, v1 features
├── PLAN.md                 # When — phases, progress, deploy pipeline, cost, roadmap
├── CONTEXT.md              # Domain glossary — the vocabulary to use
├── docs/
│   ├── status.md           # What is LIVE — the only status surface
│   ├── design/             # Living design — hld.md (how it fits), lld.md (how it's built)
│   ├── adr/                # Decisions (permanent, numbered; _template.md)
│   ├── agents/             # How agents work here — workflow, issue tracker
│   └── conventions/        # How we build — git, …
├── scripts/                # Repo tooling — context-check hook, status-claims gate (+ tests)
├── .claude/settings.json   # Project hooks (context-check on every prompt)
├── qa/naive-user/          # Naive-user agent's findings + memory of the app               (planned)
├── .worktrees/             # One worktree per piece of work — gitignored; `git worktree list`
├── tickets/<feature>/      # spec.md + issues/NN-*.md — the issue tracker                 (planned)
└── .githooks/              # Versioned git hooks (enable: git config core.hooksPath .githooks)
```

## Where to look

| Question                                      | Answer lives in                                       |
| --------------------------------------------- | ----------------------------------------------------- |
| What does a word mean?                        | `CONTEXT.md`                                          |
| Why does this exist, for whom, what's in v1?  | `PRD.md`                                              |
| How do the pieces fit?                        | `docs/design/hld.md`                                  |
| Tables, routes, algorithms, framework wiring? | `docs/design/lld.md`                                  |
| What's the stack / what's next / phases?      | `PLAN.md`                                             |
| What is actually live / deployed / verified?  | `docs/status.md`                                      |
| Why was X decided?                            | `docs/adr/`                                           |
| How do I run / test it?                       | Commands, below                                       |
| How do I take a feature from idea to PR?      | Dev flow, below → `docs/agents/workflow.md`           |
| Which skill / toolkit for which step?         | `docs/agents/workflow.md` → Skills                    |
| Where are the specs and tickets?              | `tickets/<feature>/` → `docs/agents/issue-tracker.md` |
| How does it get deployed?                     | `PLAN.md` → Deploy pipeline                           |
| How do we commit / branch / PR?               | `docs/conventions/git.md`                             |

## Commands

To be filled in at scaffold. Convention: `npm run dev`, `npm test`, `npm run lint`, `npm run format`, `npm run typecheck`. Before claiming work is done: typecheck, lint, and tests all green.

## Dev flow

`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`. Keep the first three in one unbroken context window; `/implement` starts fresh per ticket. Details and which toolkit owns which step: `docs/agents/workflow.md` → Skills.

- **Issue tracker**: local markdown under `tickets/<feature-slug>/` — see `docs/agents/issue-tracker.md`.

## Who does the work

- **The session orchestrates; subagents implement.** During `/implement`, the session does not edit source files itself. It dispatches **one implementer subagent per ticket** with the ticket file + `spec.md`, waits for the report, then runs `/code-review` on the diff. Planning, grilling, spec, and tickets stay in the session — they are conversation, not code.
- **Ticket = unit of dispatch.** Never bundle tickets into one subagent; never split one ticket across several. If a ticket is too big for one dispatch, that's a `/to-tickets` bug — go back and slice it.
- **Subagent reports are quoted, not re-authored.** Relay status, what changed, what was skipped, and test results as the subagent wrote them. Don't summarise a failure into a success.
- **Context-size safety net.** `scripts/context-check.mjs` runs on every prompt (`.claude/settings.json`) and, past **200,000 tokens** of live context, prints a line telling the session to hand off. When it fires: finish the current ticket or reach a clean stopping point, write what is done and what is next into the ticket's `## Comments`, and start a fresh session. Raising the threshold is a decision to record, not a tuning knob. Tests: `node --test 'scripts/**/*.test.mjs'`.
- **Status has one home.** Environment and infra state — what exists, where, verified when — goes only in `docs/status.md`; `scripts/check-status-claims.sh` fails CI on a claim elsewhere. When a ticket changes what is real, update `docs/status.md` in the same PR.

## Conventions

- **Read before exploring**: `CONTEXT.md`, then `docs/design/hld.md`/`lld.md` for the area you're touching, then any ADR that touches it. If a file doesn't exist yet, proceed silently — don't suggest creating it.
- **Flag ADR conflicts**: if what you're about to do contradicts an ADR, say so explicitly ("contradicts ADR-0003 because…") rather than silently overriding.
- **Vocabulary**: use `CONTEXT.md` terms in code, tests, tickets, and commits. A concept missing from the glossary is a signal to add it, not to invent a synonym.
- **Design docs are living**: a ticket that changes a table, route, flow, or component updates `lld.md`/`hld.md` in the same PR. A ticket that changes what v1 _is_ updates `PRD.md`.
- **Decisions**: anything that reverses or constrains an earlier choice gets an ADR in `docs/adr/NNNN-<slug>.md`.
- **Git**: Conventional Commits, `feature/<slug>` branches, PR + squash merge even solo — see `docs/conventions/git.md`. Agent commit rules: Commit discipline, below.
- **Decisions are the user's**: when presenting options or a recommendation, lead with the question, give the recommendation, then list **Needs your decision** and **Decided without asking** (with the reason — only things an ADR, the repo, or a measurement already settles). Then stop. No file edits until the user answers. If there is nothing to decide, just answer. The three `/develop` gates and its close-out use the fuller form in `docs/agents/workflow.md` → Gate messages.
- **One home per fact**: each fact lives in exactly one doc; every other doc links to it rather than restating it. Why/what → `PRD.md`. How → `docs/design/`. Phases/when → `PLAN.md`. Domain terms → `CONTEXT.md`. Decisions → `docs/adr/`. How agents work → this file + `docs/agents/`. How we use git → `docs/conventions/git.md`. If you find the same rule written twice, delete one and link.

## Commit discipline

- **Commit only when explicitly asked.** Never commit unprompted. Edit, report what changed, stop.
- **Never commit on `main`** — every piece of work runs in its own worktree under `.worktrees/`; see `docs/agents/workflow.md` → Worktree per thing. (Exception: the initial planning/scaffold commits, per `docs/conventions/git.md`.)
- **Keep deploy/infra work in its own commit** — `Dockerfile`, `infra/`, `.github/`, env wiring. Do not fold it into feature commits.
- **Stage deliberately.** If the working tree has unrelated in-progress edits (the user's own), don't sweep them into your commit — stage only the files you changed. Never `git add -A` or `commit -a`.
- **Never push, force-push, rebase, or reset** unless asked in the current message.
