# Git Conventions

## Commits — Conventional Commits

Format: `type(scope): summary`

- **Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`.
- **Scope:** the area, e.g. `feat(tanks): add water-change log`, `docs(plan): settle roles`. Optional for repo-wide changes.
- **Summary:** imperative mood, lower case, no trailing period, ≤ ~72 chars.
- **Breaking changes:** add `!` (`feat(api)!: …`) and a `BREAKING CHANGE:` footer.

Keep commits small and focused — one logical change each. Release notes are auto-generated from merged PR titles, so PR titles follow the same format.

## Branching — branch-per-feature

- `main` is always releasable.
- Work happens on short-lived branches: `feature/<slug>`, `fix/<slug>`, `chore/<slug>`.
- Each branch lives in its own worktree under `.worktrees/` — see `docs/agents/workflow.md` → Worktree per thing.
- Rebase on `main` frequently; keep branches short-lived.
- **Exception:** the initial planning/scaffold commits are made directly on `main` (nothing to branch from yet).

## Pull requests

- Every change to `main` goes through a PR, even solo — it's the review and CI gate.
- PR description: what changed, why, how it was verified. Link the spec/ticket/ADR.
- CI must pass before merge. **Squash merge** to keep `main` history clean; the squash commit follows Conventional Commits.
- Delete the branch after merge.

## Local hooks

`.githooks/pre-commit` runs `prettier --check` over staged files so a format issue never fails CI on a round-trip. Hooks are versioned but not auto-active — enable once per clone:

```sh
git config core.hooksPath .githooks
```

Fix formatting anytime with `npm run format`.

## Agents

Agent commit rules live in `AGENTS.md` → Commit discipline. Commit messages stay accurate about _what_ changed; follow the configured attribution settings.
