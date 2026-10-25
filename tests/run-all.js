// Runs every tests/*.test.js in its own process and prints a summary.
// Usage: tests/run.sh   (or: npm test --prefix tests)
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js") && (!only.length || only.some(o => f.includes(o)))).sort();
const env = { ...process.env, TZ: "UTC", NODE_PATH: path.join(__dirname, "node_modules") };
for (const k of ["TG_TOKEN", "TG_CHAT_ID", "WA_TOKEN", "WA_GROUP_ID", "WA_INSTANCE", "WA_PROVIDER"]) delete env[k];

const summary = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { env, encoding: "utf8", maxBuffer: 1 << 26 });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").reverse().find(l => l.startsWith("RESULT "));
  if (r.status !== 0 || !line) process.stdout.write(out);
  summary.push(`${line ? line.slice(7) : `FAIL | ${f} | crashed (exit ${r.status})`} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log("\n=== Test summary ===");
for (const s of summary) console.log(s);
const failed = summary.filter(s => s.startsWith("FAIL")).length;
console.log(failed ? `\n${failed} of ${summary.length} test groups FAILED` : `\nAll ${summary.length} test groups passed`);
process.exitCode = failed ? 1 : 0;
