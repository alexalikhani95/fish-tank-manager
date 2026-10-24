# The development loop

## `/develop` runs it

Type `/develop <what to build>` in Claude, or `$develop <what to build>` in Codex. The skill
lives in the personal skills repo
([alexalikhani95/skills](https://github.com/alexalikhani95/skills) → `develop/SKILL.md`) and
owns the loop: the lanes, the steps, the three stops (spec, tickets, merge), the checks, which
model does what, and the wording of every stop message. This file keeps only what is specific
to this repo, plus the parts that apply outside `/develop`.

Starting `/develop` counts as asking for commits and pushes on its feature branch; merging
still needs the user's word. Outside `/develop`, `AGENTS.md` → _Commit discipline_ applies
unchanged.

**Trivial changes** (a typo, copy, padding, a version bump) don't use `/develop`: own
worktree, tests green, ask before committing, PR.

**By hand**, the same chain without the skill:
`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` per ticket → `/code-review`.

## What `/develop` reads from this repo

| Fact                         | Lives in                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| Typecheck, lint, test, dev   | `AGENTS.md` → Commands                                      |
| How to make a worktree       | Worktree per thing, below                                   |
| Ticket format and statuses   | `docs/agents/issue-tracker.md`                              |
| Vocabulary and decisions     | `CONTEXT.md`, `docs/adr/`                                   |
| Shapes to copy (fast lane)   | `docs/patterns.md` (written the first time one is worth it) |
| Docs to update at self-check | `docs/status.md`, `docs/design/`, `PRD.md`, `CONTEXT.md`    |
| Deploy check after merge     | `PLAN.md` → Deploy pipeline                                 |
| UI tests                     | `playwright.config.*`, `qa/naive-user/<app>/config.json`    |

## Skills and plugins

Skills come from the personal skills repo, cloned to `~/.claude/skills`. Claude reads it there;
its `sync.sh` links each skill into `~/.codex/skills` so Codex reads the same copy. Nothing is
installed per project. Plugins, installed once per machine in both agents: `ponytail` and
`naive-user` (with the Playwright MCP).

Matt Pocock's skills are the spine; Superpowers is not used, because it is a second way to
write a spec and restates rules this repo already owns.

**Repo-local skill to add once code exists**: `running-the-app`, which says how to start the
app locally, seed data and reset. `/develop` and the naive-user agent use it. It lives in
`.agents/skills/running-the-app/` (where Codex looks), with a symlink from
`.claude/skills/running-the-app` (where Claude looks).

## Worktree per thing

Every new piece of work — feature, fix, chore — gets its own git worktree under
`.worktrees/`, one folder per branch. The main checkout stays on `main` and is never
worked in directly. Plain git, no tool-specific step, so any agent or human follows it:

```sh
git fetch origin                                            # fresh base — never branch off stale local main
git worktree add --no-track -b feature/<slug> .worktrees/feature-<slug> origin/main
cd .worktrees/feature-<slug> && npm install                 # node_modules are per-worktree
# ...work, commit...
git push -u origin feature/<slug>                           # first push sets the upstream
# after merge:
git worktree remove .worktrees/feature-<slug> && git branch -d feature/<slug>
```

`--no-track` stops a later bare `git push` from landing on `origin/main` under a
non-default `push.default`. `git worktree list` shows everything in flight. Agents that
have a native worktree tool may use it, but the folder and branch name must match the
above so the result is indistinguishable.
