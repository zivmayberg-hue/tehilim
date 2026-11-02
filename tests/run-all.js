// Runs every tests/*.test.js in its own process and prints a summary.
// Usage: tests/run.sh   (or: npm test --prefix tests)
// Hard time limits: 3 minutes per test file (4 for page.test.js), 10 minutes for the whole suite. A file over its limit is killed with
// everything it started (its browsers too) and reported as FAIL "timed out"; the suite stops at its limit.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FILE_LIMIT = Number(process.env.TEST_FILE_LIMIT) || 180, SUITE_LIMIT = 600;
// the one exception: page.test.js clicks every button on 140 page loads (about 170 s on this Mac)
const LONGER = { "page.test.js": 240 };
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js") && (!only.length || only.some(o => f.includes(o)))).sort();
const env = { ...process.env, TZ: "UTC", NODE_PATH: path.join(__dirname, "node_modules") };
for (const k of ["TG_TOKEN", "TG_CHAT_ID", "WA_TOKEN", "WA_GROUP_ID", "WA_INSTANCE", "WA_PROVIDER"]) delete env[k];

// one file in its own process group, so a kill also ends the browsers it launched
function runFile(f, limit) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, f)], { env: { ...env, TEST_LIMIT: String(Math.round(limit) - 10) }, detached: true });
    let out = "", timedOut = false;
    child.stdout.on("data", d => out += d); child.stderr.on("data", d => out += d);
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch (e) {} }, limit * 1000);
    child.on("close", status => { clearTimeout(timer); resolve({ status, out, timedOut }); });
  });
}

(async () => {
  const start = Date.now(), summary = [];
  for (const f of files) {
    const left = SUITE_LIMIT - (Date.now() - start) / 1000;
    if (left <= 0) { summary.push(`FAIL | ${f} | not run: the whole suite went over ${SUITE_LIMIT / 60} minutes`); continue; }
    const t0 = Date.now(), limit = Math.min(process.env.TEST_FILE_LIMIT ? FILE_LIMIT : LONGER[f] || FILE_LIMIT, left);
    const r = await runFile(f, limit);
    const line = r.out.split("\n").reverse().find(l => l.startsWith("RESULT "));
    if (r.status !== 0 || !line) process.stdout.write(r.out);
    const res = r.timedOut ? `FAIL | ${f} | timed out after ${Math.round(limit)} s and was stopped (with its browsers)`
      : line ? line.slice(7) : `FAIL | ${f} | crashed (exit ${r.status})`;
    summary.push(`${res} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log("\n=== Test summary ===");
  for (const s of summary) console.log(s);
  const failed = summary.filter(s => s.startsWith("FAIL")).length;
  console.log(`\nTotal ${((Date.now() - start) / 1000).toFixed(0)} s (limits: ${FILE_LIMIT / 60} min per file, ${SUITE_LIMIT / 60} min in all)`);
  console.log(failed ? `${failed} of ${summary.length} test groups FAILED` : `All ${summary.length} test groups passed`);
  process.exitCode = failed ? 1 : 0;
})();
