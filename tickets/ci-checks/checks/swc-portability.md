# SWC portable locked install diagnosis

Baseline: `5f7130f30022ef7f31572f88156ad156972215bd`. Node 24.11.1, npm 11.6.2 on macOS ARM64. The GitHub failure uses Node 24.22.2.

Ranked hypotheses: missing lock records (predicts Linux package absent after locked install); npm platform selection (predicts absence even with correct records); ABI mismatch (predicts package present but native load fails). The first prediction is confirmed.

Initial harness incorrectly formed the nested lookup path and reported Darwin ARM64 missing; corrected before repair. Correct baseline output: `12 platform requirements; 11 missing`, exit 1, including `MISSING @swc/core-linux-x64-gnu@1.15.47`. After repair: `12 platform requirements; 0 missing`, exit 0.

Portable metadata self-check (run before and after repair):

```js
const fs = require("node:fs");
const p = JSON.parse(fs.readFileSync("package-lock.json")).packages;
let missing = 0,
  total = 0;
for (const [path, core] of Object.entries(p)) {
  if (!path.endsWith("/@swc/core")) continue;
  console.log(`${path}@${core.version}`);
  for (const [name, version] of Object.entries(core.optionalDependencies)) {
    total++;
    let base = path.slice(0, -"@swc/core".length);
    let found = p[base + name]?.version === version;
    if (!found && p["node_modules/" + name]?.version !== version) {
      console.log(`MISSING ${name}@${version}`);
      missing++;
    }
  }
}
console.log(`${total} platform requirements; ${missing} missing`);
process.exitCode = missing ? 1 : 0;
```

A fresh temporary workspace for each lockfile ran `npm ci --ignore-scripts --os=linux --cpu=x64 --libc=glibc --no-audit --no-fund` using the unchanged root and app manifests. Binary presence at `app/node_modules/@swc/core-linux-x64-gnu/swc.linux-x64-gnu.node`: baseline false, repair true. This tests npm's platform install selection without pretending to execute a Linux binary on macOS. Temporary install directories removed afterward.

All original lock records compared deeply equal; exactly eleven new records. Registry exact-version metadata supplies tarball URL, integrity, CPU, OS and engine constraints. Native macOS `npm ci --no-audit --no-fund`: exit 0, 484 packages. Actual Linux execution and independent final review remain parent-owned; no polling, watch or merge.
