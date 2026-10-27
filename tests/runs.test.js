// Morning runs of the reminder: five runs a day (03:13 to 05:43 UTC) must send exactly once, on the first run,
// sharing notify/sent.log like the serialized GitHub runs do; nothing on Shabbat or Yom Tov; a run that starts
// later than 2 hours before sunset in Dubai goes to Telegram only, with the warning line; a failed send is retried
// by the next run. Also checks the workflow file: the five times, one-at-a-time runs, fresh checkout, safe push.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { H, notify, dateFromFixed, todayDubai, endOfYear, iso, isShabbatOrYomTov, reporter } = require("./lib");

const N = notify(), R = reporter("Morning runs: one send per day, sunset cutoff, workflow setup");
const start = todayDubai(), end = endOfYear(2036);
const RUNS = [[3, 13], [3, 43], [4, 13], [4, 43], [5, 43]];             // UTC
const at = (f, h, m) => dateFromFixed(f).getTime() + (h * 60 + m) * 60000;   // TZ=UTC in tests
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tehilim-runs-"));
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

(async () => {
  // 1. Every morning to 2036: five runs, one shared log
  let days = 0, sends = 0;
  for (let f = start; f <= end; f++) {
    const log = path.join(dir, `log-${f}`), group = [], tg = [];
    const results = [];
    for (const [h, m] of RUNS) results.push(await quiet(() => N.run({ today: f, now: at(f, h, m), log,
      sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) })));
    const msg = N.buildMessage(f), d = iso(f);
    if (isShabbatOrYomTov(f)) R.check(results.every(r => r === "none") && !group.length && !tg.length, `${d}: posted on Shabbat/Yom Tov ${results}`);
    if (msg) {
      R.check(results.join() === "sent,already,already,already,already" && group.length === 1 && group[0] === msg.text && !tg.length,
        `${d}: runs ${results}, group ${group.length}, telegram ${tg.length}`);
      R.check(fs.readFileSync(log, "utf8").trim().split("\n").length === 1, `${d}: log should have one line`);
      sends++;
    } else R.check(results.every(r => r === "none") && !group.length && !tg.length, `${d}: sent without a message ${results}`);
    days++;
  }

  // 2. The cutoff: 2 hours before Dubai sunset (Hebcal), checked on every day that has a message
  let lateChecked = 0;
  for (let f = start; f <= end; f++) {
    if (!N.buildMessage(f)) continue;
    const g = dateFromFixed(f);
    const sunset = new H.Zmanim(new H.GeoLocation(null, 25.2048, 55.2708, 0, "Asia/Dubai"), g, false).sunset().getTime();
    const cutoff = N.lateCutoff(f).getTime();
    R.check(cutoff === sunset - 2 * 3600000, `${iso(f)}: cutoff ${new Date(cutoff).toISOString()}, sunset ${new Date(sunset).toISOString()}`);
    for (const [delta, expectLate] of [[-60000, false], [0, true], [60000, true]]) {
      const log = path.join(dir, `late-${f}-${delta}`), group = [], tg = [];
      const r = await quiet(() => N.run({ today: f, now: cutoff + delta, log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) }));
      const text = N.buildMessage(f).text;
      R.check(expectLate ? r === "late" && !group.length && tg.length === 1 && tg[0] === N.LATE_PREFIX + text && tg[0].startsWith("⚠️ Напоминание опоздало, отправьте вручную, если ещё актуально:")
                         : r === "sent" && group.length === 1 && !tg.length, `${iso(f)} cutoff ${delta / 60000} min: ${r}, group ${group.length}, telegram ${tg.length}`);
      if (expectLate) {                              // the late Telegram send is logged, so later runs stop too
        const again = await quiet(() => N.run({ today: f, now: cutoff + 3600000, log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) }));
        R.check(again === "already" && tg.length === 1 && !group.length && fs.readFileSync(log, "utf8").includes("(опоздание, Telegram)"), `${iso(f)}: after a late send, next run ${again}`);
      }
    }
    lateChecked++;
  }

  // 3. A failed send is not logged, so the next run tries again (and sends only once)
  {
    const f = start + [...Array(30).keys()].find(k => N.buildMessage(start + k)), log = path.join(dir, "fail"), group = [];
    let fail = true;
    const sendGroup = async t => { if (fail) { fail = false; throw new Error("network"); } group.push(t); };
    let first = "ok"; try { await quiet(() => N.run({ today: f, now: at(f, 3, 13), log, sendGroup })); } catch (e) { first = "threw"; }
    const second = await quiet(() => N.run({ today: f, now: at(f, 3, 43), log, sendGroup }));
    const third = await quiet(() => N.run({ today: f, now: at(f, 4, 13), log, sendGroup }));
    R.check(first === "threw" && second === "sent" && third === "already" && group.length === 1, `failed send: ${first}, ${second}, ${third}, sent ${group.length}`);
  }

  // 4. Workflow file
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "notify.yml"), "utf8");
  const crons = [...yml.matchAll(/cron:\s*"([^"]+)"/g)].map(m => m[1]);
  R.check(JSON.stringify(crons) === JSON.stringify(["13 3 * * *", "43 3 * * *", "13 4 * * *", "43 4 * * *", "43 5 * * *"]), `cron times ${crons}`);
  R.check(/concurrency:\s*\n\s*group: whatsapp-reminder\s*\n\s*cancel-in-progress: false/.test(yml), "runs must be one at a time (concurrency group, no cancelling the running one)");
  R.check(/actions\/checkout@v4\s*\n\s*with:\s*\n\s*ref: \$\{\{ github\.ref \}\}/.test(yml), "checkout must take the branch as it is when the run starts");
  R.check(/git pull --rebase[^\n]*&& git push/.test(yml) && /for i in 1 2 3/.test(yml), "the log push must pull first and retry");
  R.check(/TZ: Asia\/Dubai/.test(yml), "notify.js must run on Dubai time");

  fs.rmSync(dir, { recursive: true, force: true });
  R.done(`${days} mornings x ${RUNS.length} runs, ${sends} sending days, cutoff checked on ${lateChecked} days`);
})().catch(e => { console.error(e); process.exitCode = 1; });
