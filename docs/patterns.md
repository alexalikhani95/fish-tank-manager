# Patterns

Things built once that will be built again. Copy the files, change what's listed.

## Route that needs a logged-in User

- **Copy:** the `tanks` group in `app/start/routes.ts` (`.use(middleware.auth())`) and `app/tests/functional/tanks.spec.ts`.
- **Change:** the routes and controller. Scope every query by `ctx.userId`; another User's record is a 404.
- **Tests:** `createLoggedInUser` and the expected 401 body `unauthorized` from `app/tests/helpers/auth.ts`. Use a valid-looking 24-hex id in no-token tests, or the route's `.where` 404s first.

## Ace command with in-process tests

- **Copy:** `app/commands/set_password.ts` and `app/tests/functional/set_password.spec.ts`. Commands are found automatically; import them in tests through `#commands/*`.
- **Change:** `commandName`, args, prompts and the work.
- **Tests:** trap every prompt by its exact label; the spec's `createCommand` makes an untrapped prompt throw. Check `command.error` as well as `assertFailed()`, since `exec()` never rethrows.

## PR checks with failure-independent doc gates

- **Copy:** `.github/workflows/ci.yml` for a job wrapping existing validation commands.
- **Change:** runtime, service, disposable boot values and required-check name for the target repo.
- **Keep:** `!cancelled()` plus a successful install outcome on each doc gate, so an earlier failed validation cannot skip either gate. Verify with a failed validation run and a final successful PR run; read back branch protection against the emitted job name.

- **Application tests:** use `scripts/ci-test.sh` to expose assembler import failures and require a positive passed-test count; a successful process exit alone does not prove tests executed.
