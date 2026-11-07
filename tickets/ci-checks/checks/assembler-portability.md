# Assembler import diagnosis

## Red signal and cause

Node 24.11.1, unchanged `NODE_ENV=test`. Parent and child inspected full logs of [run 42412936751](https://github.com/alexalikhani95/fish-tank-manager/actions/runs/42412936751): Application tests logs the generic assembler missing/development-dependency advice, no test summary. GitHub SUCCESS is a false pass.

1. Optional-platform metadata self-check: ast-grep declares nine exact 0.45.3 platform packages; lock records contain only Darwin ARM64. Eight missing (including Linux x64 GNU); command sets exit code 1.
2. Fresh temporary workspace, copied manifests/lock, `npm ci --ignore-scripts --os=linux --cpu=x64 --libc=glibc --no-audit --no-fund`: assembler present, SWC GNU x64 present, ast-grep GNU x64 absent. This is an installation/metadata test, not native Linux execution.
3. Temporarily move the installed Darwin ARM64 ast-grep package away, then `(cd app && node --input-type=module -e "await import('@adonisjs/assembler')")`: exit 1, `Cannot find native binding`, nested cause identifies missing ast-grep package. Restore package immediately.
4. Repeat mutation: `NODE_ENV=test npm test` exits **0**, prints `Cannot find package "@adonisjs/assembler"`, no test summary; `bash scripts/ci-test.sh` exits **1**. Restore binding. This exercises the actual bug seam, not just a fixture.

Ranked hypotheses: missing ast-grep native dependency; omitted dev dependencies; another native module. Clean install proves assembler is installed and SWC restored; direct import isolates ast-grep. Adonis core's `importAssembler` catches all import errors, returning undefined; Ace logs generic advice. The app console handles Ace without propagating that command failure to process exit in this path. No NODE_ENV change is justified.

## Minimal repair and regression

Add only the eight missing optional ast-grep 0.45.3 records, using exact registry version, tarball, integrity, OS, CPU and engines. Deep equality assertion against every original lock record passes; no existing version/record changes and no manifest changes. Registry fetch is installation metadata, not a dependency upgrade. Repeat clean Linux-targeted install: all three packages present. Native Linux loading remains for GitHub.

CI wrapper imports assembler directly in app context, then runs existing npm test through pipefail/tee and requires a positive passed-test count. It exposes the underlying error and also rejects a zero exit with no executed tests. Temporary log is removed on exit. Spawned regression fixtures reject import failure, original swallowed-error text, zero tests, and a failed runner even when it prints a passed count; accept a successful 56-test summary. The count is not hardcoded in CI, so legitimate test additions work.

## Local validation

Clean `npm ci`: exit 0, 484 packages added, 486 audited; existing 22 moderate audit findings left outside scope. Direct assembler import after install: exit 0. Node 24.11.1 throughout.

`bash scripts/ci-test.sh`: exit 0, **Tests 56 passed (56)**, Time 2s. Disposable workflow env values; MongoDB 8.0.16 with fresh `/tmp/fish-ci-assembler-mongo.*` data and loopback port 27030; stopped after test run. No developer database touched.

All six gates exit 0:

| Gate                                                  | Evidence                                  |
| ----------------------------------------------------- | ----------------------------------------- |
| `npm run format:check`                                | All matched files use Prettier code style |
| `npm run lint`                                        | ESLint, no diagnostics                    |
| `npm run typecheck`                                   | tsc --noEmit, no diagnostics              |
| `bash scripts/ci-test.sh` (wraps existing `npm test`) | Tests 56 passed (56)                      |
| `bash scripts/check-status-claims.sh`                 | only status surface check passed          |
| `node --test 'scripts/**/*.test.mjs'`                 | 15 tests, 15 passed, 0 failed             |

`actionlint .github/workflows/ci.yml` and `git diff --check`: exit 0. Final independent registry/assert check: every original lock record unchanged, exactly eight additions match exact-version metadata, all 12 SWC and nine ast-grep optional exact requirements recorded. No debug code or dependency modifications outside lock additions. New remote run, actual Linux test summary and independent final review remain parent-owned; no remote passing claim.
