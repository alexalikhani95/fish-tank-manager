// Tests for the session-context safety net hook (see AGENTS.md → Who does the work).
// Run with: node --test 'scripts/**/*.test.mjs'   (quoted — Node's own glob;
// `node --test scripts/` treats the positional as a file to execute and dies
// with MODULE_NOT_FOUND on Node 24).
//
// Two tiers, and the SECOND one is the point:
//   - unit cases pin the scan and the wording;
//   - SPAWNED cases pin the EXIT CODE, which no unit case can see. A `process.exit(1)`
//     in a catch passes every unit case and still ships the bug: exit 1 prints a visible
//     `hook error` notice on every prompt, and exit 2 BLOCKS the prompt and erases what
//     the owner typed.
//
// Fixtures are real files under os.tmpdir() and the path is passed in — the module opens
// them itself, with no injected filesystem seam to make a green suite meaningless.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HANDOFF_THRESHOLD,
  handoffLine,
  liveContext,
} from "./context-check.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "context-check.mjs",
);

const TMP = mkdtempSync(path.join(os.tmpdir(), "context-check-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

let seq = 0;
/** Write `body` verbatim to a fresh fixture file and return its absolute path. */
const fixture = (body) => {
  const p = path.join(TMP, `t${seq++}.jsonl`);
  writeFileSync(p, body);
  return p;
};
const jsonl = (...lines) => lines.join("\n") + "\n";

// The real shape: `usage` hangs off `message`, and `isSidechain` is a sibling of `type`.
const assistant = (usage, extra = {}) =>
  JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: { usage },
    ...extra,
  });
const other = (type) => JSON.stringify({ type, isSidechain: false });

const OVER = {
  input_tokens: 2,
  cache_creation_input_tokens: 417,
  cache_read_input_tokens: 419069,
};
const UNDER = {
  input_tokens: 1,
  cache_creation_input_tokens: 99,
  cache_read_input_tokens: 1000,
};

// ---------------------------------------------------------------------------
// Unit — liveContext / handoffLine
// ---------------------------------------------------------------------------

test("sums the three usage fields of the last assistant line", () => {
  assert.equal(liveContext(fixture(jsonl(assistant(OVER)))), 419488);
});

test("picks the LAST assistant line and never sums across lines", () => {
  // Summing across double-counts cache reads: 3 lines x ~419k would read as ~1.26M.
  const p = fixture(
    jsonl(
      assistant({
        input_tokens: 5,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 100,
      }),
      assistant({
        input_tokens: 7,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 300,
      }),
      assistant(OVER),
    ),
  );
  assert.equal(liveContext(p), 419488);
});

test("ignores trailing non-assistant lines — the real tail shape", () => {
  // The last line of a live transcript is almost never the assistant line: these four
  // types all appear as real tails today. Reading line -1 would find no usage at all.
  const p = fixture(
    jsonl(
      assistant(OVER),
      other("user"),
      other("system"),
      other("permission-mode"),
      other("last-prompt"),
    ),
  );
  assert.equal(liveContext(p), 419488);
});

test("skips isSidechain: true lines", () => {
  const p = fixture(
    jsonl(
      assistant(OVER),
      assistant({ input_tokens: 9 }, { isSidechain: true }),
      other("user"),
    ),
  );
  assert.equal(liveContext(p), 419488);
});

test("returns null when the context cannot be determined", () => {
  assert.equal(liveContext(fixture("")), null, "empty transcript");
  assert.equal(
    liveContext(fixture(jsonl(other("user"), other("system")))),
    null,
    "no assistant",
  );
});

test("tolerates a malformed / partial trailing line without throwing", () => {
  // The transcript is appended to live, so the tail can be a half-written line.
  const p = fixture(jsonl(assistant(OVER)) + '{"type":"assist');
  assert.equal(liveContext(p), 419488);
});

test("handoffLine is null AT the threshold and a string one token over", () => {
  assert.equal(HANDOFF_THRESHOLD, 200000);
  assert.equal(handoffLine(200000), null);
  assert.equal(typeof handoffLine(200001), "string");
  // The entry point pipes liveContext straight in, so null must pass through unread.
  assert.equal(handoffLine(null), null);
});

test("missing usage fields default to 0", () => {
  assert.equal(
    liveContext(fixture(jsonl(assistant({ cache_read_input_tokens: 250000 })))),
    250000,
  );
  assert.equal(liveContext(fixture(jsonl(assistant({})))), 0);
  // No `usage` object at all: 0, i.e. silence. Unobserved in 20,676 real assistant lines,
  // but pinned so the answer is recorded rather than accidental.
  const noUsage = JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: {},
  });
  assert.equal(liveContext(fixture(jsonl(noUsage))), 0);
});

test("the emitted line satisfies its required properties", () => {
  const line = handoffLine(419488);
  assert.match(line, /419,488/, "1. states the live context number");
  assert.match(line, /200,000/, "2. names the threshold it crossed");
  assert.match(line, /hand off/i, "3. a verdict, not just a number");
  assert.match(
    line,
    /ticket/,
    "4. says WHERE the handoff happens — the ticket boundary",
  );
  assert.match(
    line,
    /AGENTS\.md/,
    "5. cites the repo rule, so it does not read as an instruction from nowhere",
  );
  assert.match(line, /context/, "6. says context");
  // 7. It is never read bare: the harness prepends `UserPromptSubmit hook success: ` and
  //    wraps the result in a <system-reminder>. Starting its own labelled sentence — and
  //    staying one line — is what makes it read correctly glued behind that prefix.
  assert.match(line, /^Context check: /);
  assert.doesNotMatch(line, /\n/, "one line");
  assert.match(
    `UserPromptSubmit hook success: ${line}`,
    /hook success: Context check: 419,488/,
  );
});

// ---------------------------------------------------------------------------
// SPAWNED — the exit code, which is the whole safety property
//
// spawnSync rather than execFileSync: execFileSync THROWS on a non-zero exit and hands
// back only stdout, so `status === 0` cannot be asserted per case and the case loop below
// could not name which one failed. It is the same real entry point either way.
// ---------------------------------------------------------------------------

const run = (input) => spawnSync("node", [SCRIPT], { input, encoding: "utf8" });
const payload = (transcriptPath) =>
  JSON.stringify({
    hook_event_name: "UserPromptSubmit",
    prompt: "hi",
    transcript_path: transcriptPath,
  });

test("every failure path exits 0, silently", (t) => {
  // Over-threshold content behind mode 000: if the read is NOT refused, that ONE case proves
  // nothing, so the precondition is probed rather than assumed. Root reads it regardless —
  // that is the environment, not a defect, so the row drops out loudly instead of going red
  // (neither a dev machine nor the ubuntu runner is root; a container run can be). The probe
  // gates ONLY that row: the other seven need no precondition, and taking them down with it
  // would leave the exit-0 contract — the property no unit case can see — asserted zero times
  // in exactly the environment where a green suite would say otherwise. The temp dir is removed
  // wholesale afterwards, which unlink can do to a 000 file.
  const unreadable = fixture(jsonl(assistant(OVER)));
  chmodSync(unreadable, 0o000);
  let refused = false;
  try {
    readFileSync(unreadable);
  } catch {
    refused = true;
  }
  if (!refused)
    t.diagnostic("SKIPPED 1 of 8 cases: chmod 000 does not bite as root");

  const cases = [
    ["no stdin", ""],
    ["unparseable stdin", "not json"],
    [
      "missing transcript_path",
      JSON.stringify({ hook_event_name: "UserPromptSubmit" }),
    ],
    ["transcript_path names nothing", payload(path.join(TMP, "gone.jsonl"))],
    ["transcript_path names a directory", payload(TMP)],
    ...(refused ? [["unreadable file", payload(unreadable)]] : []),
    ["pure garbage", payload(fixture("not json at all\n{{{\n\n"))],
    [
      "no assistant line",
      payload(fixture(jsonl(other("user"), other("system")))),
    ],
  ];
  for (const [name, input] of cases) {
    const r = run(input);
    assert.equal(
      r.status,
      0,
      `${name}: exit 1 prints a hook error, exit 2 ERASES the prompt`,
    );
    assert.equal(r.stdout, "", `${name}: a failure path must stay silent`);
    assert.equal(r.stderr, "", `${name}: nothing on stderr either`);
  }
});

test("spawned: over threshold prints one line and still exits 0; under threshold is silent", () => {
  const over = run(payload(fixture(jsonl(assistant(OVER), other("user")))));
  assert.equal(over.status, 0);
  assert.equal(over.stderr, "");
  assert.equal(over.stdout.trimEnd().split("\n").length, 1, "exactly one line");
  assert.match(over.stdout, /^Context check: 419,488 /);

  const under = run(payload(fixture(jsonl(assistant(UNDER), other("user")))));
  assert.equal(under.status, 0);
  assert.equal(under.stdout, "");
  assert.equal(under.stderr, "");
});
