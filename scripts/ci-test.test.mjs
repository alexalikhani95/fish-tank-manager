import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./ci-test.sh", import.meta.url));

test("CI rejects swallowed imports, missing summaries, zero tests and failing runners", () => {
  const dir = mkdtempSync(join(tmpdir(), "fish-ci-test-"));
  try {
    mkdirSync(join(dir, "app"));
    for (const name of ["node", "npm"]) {
      writeFileSync(
        join(dir, name),
        name === "node"
          ? '#!/bin/sh\nexit "$IMPORT_EXIT"\n'
          : '#!/bin/sh\nprintf "%s\\n" "$TEST_OUTPUT"\nexit "$TEST_EXIT"\n',
        { mode: 0o755 },
      );
    }
    for (const [importExit, output, testExit, expected] of [
      [1, "Tests 56 passed (56)", 0, 1],
      [0, 'Cannot find package "@adonisjs/assembler"', 0, 1],
      [0, "Tests 0 passed (0)", 0, 1],
      [0, "Tests 56 passed (56)", 1, 1],
      [0, "Tests 56 passed (56)", 0, 0],
    ]) {
      const result = spawnSync("bash", [script], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          IMPORT_EXIT: String(importExit),
          TEST_OUTPUT: output,
          TEST_EXIT: String(testExit),
        },
      });
      assert.equal(result.status, expected, result.stdout + result.stderr);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
