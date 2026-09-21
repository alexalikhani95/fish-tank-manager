// Session-context safety net: a UserPromptSubmit hook that measures the session's live
// context from its own transcript and, past the policy threshold, tells the session to
// hand off to a fresh one at its next ticket boundary.
//
// Adapted from techgarden's scripts/context-check.mjs (their ADR-0066). The defect it
// exists to catch: a session that presented a plan at ~257k tokens and ran on to ~415k
// without handing off, because the "start fresh per ticket" rule lived in a doc nobody
// re-read mid-session. This hook is the half that MEASURES, so a session that drifts past
// the threshold is told so on every prompt, whether or not it has read the rule.
//
// It must NEVER exit non-zero. Exit 1 prints a visible `hook error` notice on every
// prompt; exit 2 BLOCKS the prompt and erases what the owner typed. Every failure path
// here — no stdin, unparseable stdin, no transcript_path, a missing / unreadable /
// garbage / assistant-less transcript — returns quietly and exits 0.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// POLICY, not a capacity limit: the model window is 1M. This is the point at which we
// choose to hand off. Techgarden measured their median session peak at ~228k and set 300k;
// this project's sessions are smaller (one product, one ticket at a time), so 200k. Revisit
// if it fires on ordinary sessions — raising it is a decision to record, not a tuning knob.
export const HANDOFF_THRESHOLD = 200000;

/**
 * The live context of the session whose transcript is at `transcriptPath`, or `null` when
 * it cannot be determined (no such file, unreadable, no assistant line written yet).
 *
 * Scans BACKWARD to the last main-chain assistant line. Two traps, both load-bearing:
 * the last line is almost never the assistant one (`user`, `system`, `permission-mode`
 * and `last-prompt` are all real tails today), and one turn writes several assistant
 * lines — summing across them double-counts the cache reads, which are ~99% of the
 * figure. Only the last line's own `usage` is the live number.
 *
 * Subagent turns live in separate transcript files, so `isSidechain` is false throughout
 * a real main transcript; it is still checked, because a sidechain line would report the
 * subagent's context as the session's.
 */
export function liveContext(transcriptPath) {
  let lines;
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n");
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue; // a blank tail, or the half-written line of a live append
    }
    if (entry?.type !== "assistant" || entry.isSidechain === true) continue;
    const usage = entry.message?.usage ?? {};
    return (
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    );
  }
  return null;
}

/**
 * The line to emit for a live context of `n`, or `null` at or below the threshold (and for
 * the `null` liveContext hands through when it could not measure).
 *
 * Register matters as much as content. This states a MEASUREMENT and cites the repo's own
 * rule (AGENTS.md → Who does the work) as the authority for what to do about it: a line
 * that reads as an instruction from nowhere gets discounted as prompt injection.
 */
export function handoffLine(n) {
  if (n === null || n <= HANDOFF_THRESHOLD) return null;
  const num = (x) => x.toLocaleString("en-US");
  return (
    `Context check: ${num(n)} tokens of live context, past the ` +
    `${num(HANDOFF_THRESHOLD)} handoff threshold. Per AGENTS.md → Who does the work: finish ` +
    `the current ticket (or reach a clean stopping point), write down what is done and what ` +
    `is next, and hand off to a fresh session rather than carrying this one further.`
  );
}

// Repetition is INTENDED: the condition is standing, not an event, so the line re-emits on
// every prompt while it holds and the moving number keeps it from reading as boilerplate.
// A flag file, marker or once-per-session latch would be unrequested state in a hook whose
// design virtue is holding none.
function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // no stdin, or stdin that is not JSON
  }
  const line = handoffLine(liveContext(payload?.transcript_path));
  if (line) console.log(line);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch {
    // The exit-0 guarantee, belt and braces. Nothing above is async, so there is no
    // rejection path to leak either — an unhandled rejection also exits 1.
  }
}
