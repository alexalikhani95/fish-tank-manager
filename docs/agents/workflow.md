# The development loop (Matt Pocock skills flow)

## At a glance — one feature, start to finish

Plain-English version of everything below. **★ = the human decides; work stops
until they answer.**

| #   | Step                                                                                                                                     | Ends in git? |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | **Own worktree.** Every piece of work gets its own worktree under `.worktrees/` and its own branch. `main` is never worked in directly.  | branch only  |
| 1   | **Talk it through.** The agent grills the idea, one question at a time, each with a recommendation.                                      | no           |
| 2   | **Spec written** → `tickets/<feature>/spec.md`. **★ approve the spec.**                                                                  | no           |
| 3   | **Sliced into tickets** → `issues/NN-*.md`, one demoable behaviour each. **★ approve the tickets.**                                      | no           |
| 4   | **Built, one ticket at a time.** One subagent per ticket; its report is relayed verbatim — what changed, what was skipped, test output.  | no           |
| 5   | **Self-check.** Typecheck, lint and tests run and their output shown; over-engineering pass; design docs the change touched are updated. | no           |
| 6   | **Diff reviewed** on two axes — repo conventions, and match-the-spec — findings fixed, at most two rounds.                               | no           |
| 7   | **★ commit.** The agent asks; nothing is committed before that answer.                                                                   | **yes**      |
| 8   | **PR opened**, app tried for real (and by the naive-user agent once there is a UI). **★ merge or iterate.**                              | yes          |
| 9   | **Close-out.** Squash-merge, delete the branch, update `docs/status.md`, one message saying where things stand.                          | yes          |

Four moments need the human: the spec (2), the tickets (3), the commit (7), the
merge (8). Steps 5 and 6 are the agent proving the work before asking — the
human reads the evidence, never has to produce it. Everything before step 7 is
files on disk: reversible, nothing in git history.

Rules that make this hold: `AGENTS.md` → _Who does the work_ (one subagent per
ticket, reports quoted not re-authored) and _Commit discipline_ (never commit
unprompted, never on `main`). The exact wording of every ★ message: Gate
messages, below. Worktree commands: Worktree per thing, below.

## Lanes — not everything earns nine steps

Grilling a button colour is as wrong as shipping a schema change without a spec.
Three lanes; the agent **announces which one it is taking before doing anything**,
and the human can veto that call there and then.

| Lane        | When                                                                                                | Skips                                        | Still does                                      |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| **Trivial** | One obvious change with no behaviour decision in it — colour, copy, padding, a typo, a version bump | 1–3, and 6 when nothing in the diff is logic | worktree, tests green, ★ commit, PR             |
| **Fast**    | A bugfix, or a change that copies an existing shape                                                 | 1–3                                          | PR description is the spec; steps 4–9 as normal |
| **Full**    | New behaviour, or anything carrying a decision                                                      | —                                            | all nine                                        |

Announcement wording: _"trivial lane: `<the change>`, no logic"_ or _"fast lane:
mirrors `<reference>`, delta is `<what changes>`"_. If the human disagrees, the lane
moves up — never down without being asked.

Unskippable in every lane: **its own worktree**, `main` never worked in directly,
tests green before the work is called done, and **★ the human's word before any
commit**. A one-line colour change is still a branch and still a question.

When in doubt, take the higher lane. The cost of over-grilling is ten minutes; the
cost of under-grilling is a decision nobody recorded.

## The skills chain

Our feature workflow is a chain of agent skills that **narrow** from a fuzzy
idea to graded code:

`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`

Each step feeds the next. The spec is referenced twice — once to _generate_
tickets, once to _grade_ the implementation — which is why it's worth writing
carefully.

```mermaid
flowchart TD
    idea([rough idea]) -->|/grill-with-docs| understanding[shared understanding<br/>in-conversation, no file]
    understanding -->|/to-spec| spec["spec.md<br/>tickets/&lt;feature&gt;/spec.md"]
    spec -->|/to-tickets| tickets["numbered tickets<br/>tickets/&lt;feature&gt;/issues/NN-*.md"]
    tickets -->|/implement<br/>one ticket, fresh context| code[code + tests on a branch → PR]
    code -->|/code-review| review["findings: Standards axis + Spec axis"]
    review -->|next ticket| tickets

    spec -. graded against .-> review
```

## The five steps

| Step               | Does                                                                                                                                                                                                                 | Consumes                  | Creates                            | Context              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------- | -------------------- |
| `/grill-with-docs` | Interrogates the idea — reads `CONTEXT.md`, `PRD.md`, HLD/LLD, ADRs first, then grills the _gaps_                                                                                                                    | your intent + domain docs | understanding, in chat only        | one unbroken window, |
| `/to-spec`         | Freezes the grilling into a contract: problem, stories, implementation + testing decisions, out-of-scope, traps                                                                                                      | the grilling              | `tickets/<feature>/spec.md`        | shared across        |
| `/to-tickets`      | Slices the spec into vertical tracer-bullet tickets (schema → API → tests for one demoable behaviour), with `Blocked by` edges                                                                                       | `spec.md`                 | `tickets/<feature>/issues/NN-*.md` | these three          |
| `/implement`       | Builds one ticket: dispatches an implementer subagent with ticket + spec, typecheck/tests as it goes                                                                                                                 | one ticket (+ spec)       | code + tests on a branch → PR      | fresh per ticket     |
| `/code-review`     | Grades the diff on two independent axes run as parallel subagents — **Standards** (repo conventions, code smells) and **Spec** (missing requirements, scope creep) — reported separately so one can't mask the other | diff + spec + standards   | findings, split by axis            | with the diff        |

**Why the first three share one window:** the grilling lives in chat, not a file. A
`/clear` between grill and spec loses the nuance that only exists there.

**Why `/implement` starts fresh:** a ticket is self-contained by construction, so it
needs only the spec + itself — not the noise of earlier tickets. The context hook
(`AGENTS.md` → _Who does the work_) enforces the boundary.

## Skills — which one does which job

**One toolkit, one spine: `mattpocock/skills`.** Every step of the loop comes from there,
plus two plugins that do jobs no skill in the set does.

| Job                        | Skill                                                    | From              |
| -------------------------- | -------------------------------------------------------- | ----------------- |
| Understand the idea        | `/grill-with-docs`                                       | mattpocock/skills |
| Freeze it into a spec      | `/to-spec` → `tickets/<feature>/spec.md`                 | mattpocock/skills |
| Slice into tickets         | `/to-tickets` → `tickets/<feature>/issues/NN-*.md`       | mattpocock/skills |
| Build one ticket           | `/implement` — see Overrides below                       | mattpocock/skills |
| Find out why it broke      | `/diagnosing-bugs`                                       | mattpocock/skills |
| Review the diff            | `/code-review` (Standards axis + Spec axis)              | mattpocock/skills |
| Record a decision / a term | `/domain-modeling` → `CONTEXT.md`, `docs/adr/`           | mattpocock/skills |
| Keep it lean               | `ponytail` (always on), `/ponytail-review` at self-check | ponytail plugin   |
| Try it as a stranger       | `/naive-test` (once there is a UI)                       | naive-user plugin |

**Why Matt Pocock as the spine:** tickets are files. One ticket = one subagent dispatch =
one unit the tracker, the triage labels, and the worktree rule all agree on.

**Superpowers is not used.** Its `subagent-driven-development`,
`verification-before-completion` and `finishing-a-development-branch` each restate a rule
this repo already owns — one subagent per ticket (`AGENTS.md` → _Who does the work_), show
the test output before claiming done (step 5), and squash-merge / delete the branch /
update `docs/status.md` (step 9 and `docs/conventions/git.md`). Two homes for one fact is
the thing the one-home-per-fact rule exists to stop, so the rules stay and the skill
references go. Its `brainstorming` / `writing-plans` / `executing-plans` chain is a second
way to write a spec, and `using-superpowers` orders brainstorming before planning, which
collides with the grilling step. Nothing is uninstalled — it stays available as a plugin;
depending on it again is an ADR, not a preference.

**Also not used:** `/grill-me`, which is `/grill-with-docs` without the glossary and ADR
writing. `/domain-modeling` already runs inside `/grill-with-docs` — the row above is for
recording a single term or decision outside a grilling session, not for running it twice.

### Overrides — where this repo departs from the skills

A skill is instructions, not law; `AGENTS.md` wins. Two known conflicts, both in
`implement/SKILL.md`:

- **It says "Commit your work to the current branch."** We do not. `AGENTS.md` →
  _Commit discipline_: never commit unprompted. The implementer reports; the human asks
  for the commit.
- **It says "Use /tdd where possible, at pre-agreed seams."** We do not mandate TDD.
  Write the tests the ticket needs, in whatever order suits the work; step 5 still
  requires them green with the output shown.

Installation: `npx skills add mattpocock/skills` after scaffold (lockfile
`skills-lock.json`) — install the whole set, not a subset, or a step in the chain will be
missing when you reach it. `ponytail` is a user-level plugin; `naive-user` is installed
once there is a UI.

**Repo-local skills to add once code exists** (`.claude/skills/`, modelled on techgarden):

- `running-the-app` — how to start the app locally, seed data, reset; used by `/run`
  and the naive-user agent.
- `reconciling-status` — the checklist the self-check runs: which of `hld.md`, `lld.md`,
  `PRD.md`, `docs/status.md`, `CONTEXT.md` a change touches, and what "reconciled" means.

## Planned: `/develop` — one command that runs the loop

Modelled on techgarden's `.claude/commands/develop.md`, at roughly a quarter of the
size. **Written after the first feature ships through the manual flow above**, so it
encodes what actually happened rather than what we imagined (see `PLAN.md` Phase 1).
Until then, the five skills are run by hand in the order shown. Lane selection
(above) applies whether the loop is run by hand or by the command.

### Shape

`/develop <feature>` runs, in one session:

1. `/grill-with-docs` → `/to-spec`. **Spec audit**: before the spec is shown, a
   context-blind subagent reads it adversarially (holes, contradictions, untestable
   lines); fixes land first. → **Gate 1** — approve the spec.
2. `/to-tickets`. → **Gate 2** — approve the tickets.
3. **Hand off.** Gate 2 approval is the trigger, no exceptions. Your answers and any
   "approve, but…" condition are **appended to `spec.md` before** the handoff prompt is
   emitted — the fresh session inherits the file, never the chat. The prompt is
   ready-to-paste: `/develop --resume <feature>`.

`/develop --resume <feature>` (fresh session; also auto-detected when
`tickets/<feature>/issues/` has unfinished tickets):

4. For each ticket in dependency order: dispatch **one implementer subagent** with the
   ticket + `spec.md` (see `AGENTS.md` → _Who does the work_). Anything the implementer
   discovers that must hold ("X must never happen") is appended to `spec.md` under
   `## Discovered`, not left in its report. **Triggered reviewer**: a ticket that touches
   auth, tenancy, migrations, or CI gets a second-opinion review subagent automatically.
5. **Self-check** before the PR: `/ponytail-review`, run typecheck / lint / tests and show
   the output, and **reconcile the living docs** — `docs/design/hld.md` / `lld.md` if a
   table, route, flow, or component changed; `PRD.md` if what v1 _is_ changed;
   `docs/status.md` if anything real changed.
6. Open the PR. **Validate loop**: `/code-review` → fix → re-review, at most **2**
   rounds. Anything still open goes to Gate 3 as _needs waiver_, never a third round.
   **Naive-user run** (once there is a UI): the naive-user agent opens the running app
   and tries the feature as a stranger, scoped to what this PR changed; findings go to
   `qa/naive-user/`, blockers to Gate 3. → **Gate 3** — merge or iterate.
7. **Close-out** after the merge decision: squash-merge, delete the branch, update
   `docs/status.md`, one message saying where things stand.

### Gate messages

Every message that stops the loop for your decision — Gate 1, Gate 2, Gate 3, and the
close-out — uses this form. Everything else uses the short rule in `AGENTS.md`
(recommend → needs your decision → decided without asking → stop).

```
**<The ask — one sentence naming the decision.>**

**What this is**
<The work in plain language, assuming the reader has lost all context. As long as it
needs to be. Explain any term not seen this session, or cut it.>

**What happened**
<At most two sentences: the outcome of this round, not an inventory.
"Audit raised 6 findings, 1 blocker; all fixed, nothing needs you. Detail: <path>">

**Needs your decision** — <one line per choice, with the recommended option; or "nothing">

**Decided without asking**
- <one line each; only what an ADR, the repo, or a measurement already settles. Omit if empty.>

**What happens next**
<The next one or two steps. At Gate 2 this holds the paste-ready prompt for the fresh session.>

**To review:** <path> · <what it carries> · ~<n> min
```

Rules: _What this is_ and _What happens next_ are never omitted. No two bullets in a
section start with the same two words. Close-out replaces the ask with "where things
stand" and drops _To review_. Nothing follows the last line.

### Worktree per thing

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

### Deliberately left out

Model tiering (one model for everything), token receipts ledger, harness-outage
playbook. Each is a fix for a problem
this project hasn't hit; add it when it does.
