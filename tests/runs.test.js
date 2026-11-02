// Morning runs of the reminder (news or, on its morning, the monthly feedback message): five runs a day (06:13 to 08:43 UTC) must send exactly once, on the first run,
// sharing notify/sent.log like the serialized GitHub runs do; nothing on Shabbat or Yom Tov; a late run still posts
// until the first event starts or Shabbat or Yom Tov begins in any of the five cities, then goes to Telegram only (an
// English alert, then the message itself); a failed
// send is retried by the next run, and a run restarted by the 12:13 Vercel check posts once, the 12:43 run then stops. Also checks the workflow file: the five times, one-at-a-time runs, fresh checkout, safe push.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { H, notify, dateFromFixed, todayDubai, endOfYear, iso, isShabbatOrYomTov, reporter } = require("./lib");

const N = notify(), R = reporter("Morning runs: one send per day, sunset cutoff, workflow setup");
const start = todayDubai(), end = endOfYear(2036);
const RUNS = [[6, 13], [6, 43], [7, 13], [7, 43], [8, 43]];             // UTC
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
    const msg = N.morningMessage(f), d = iso(f);
    if (isShabbatOrYomTov(f)) R.check(results.every(r => r === "none") && !group.length && !tg.length, `${d}: posted on Shabbat/Yom Tov ${results}`);
    if (msg) {
      R.check(results.join() === "sent,already,already,already,already" && group.length === 1 && group[0] === msg.text && !tg.length,
        `${d}: runs ${results}, group ${group.length}, telegram ${tg.length}`);
      R.check(fs.readFileSync(log, "utf8").trim().split("\n").length === 1, `${d}: log should have one line`);
      sends++;
    } else R.check(results.every(r => r === "none") && !group.length && !tg.length, `${d}: sent without a message ${results}`);
    days++;
  }

  // 2. Late runs: still to the group until the first event in the message starts (earliest of the five cities) and
  //    before Shabbat or Yom Tov begins in any of them (Hebcal: candle lighting, 18 minutes before sunset, Herzliya 30);
  //    after that to the admin only. A run 2 hours before sunset (the old cutoff) now posts to the group.
  const CITIES5 = [[25.2167, 55.2833, "Asia/Dubai", 18], [32.1649, 34.8442, "Asia/Jerusalem", 30], [44.4333, 26.1, "Europe/Bucharest", 18],
    [50.4667, 30.4833, "Europe/Kiev", 18], [48.3, 25.9333, "Europe/Kiev", 18]];
  const sunsetAt = (f, [lat, lon, tz]) => new H.Zmanim(new H.GeoLocation(null, lat, lon, 0, tz), dateFromFixed(f), false).sunset().getTime();
  let lateChecked = 0, shabbatCapped = 0;
  for (let f = start; f <= end; f++) {
    const msg = N.buildMessage(f);
    if (!msg) continue;
    const cutoff = N.lateCutoff(f, msg).getTime(), dubaiSunset = sunsetAt(f, CITIES5[0]);
    if (isShabbatOrYomTov(f + 1)) {
      const first = Math.min(...CITIES5.map(c => Math.round(sunsetAt(f, c) / 60000) * 60000 - c[3] * 60000));
      R.check(cutoff <= first && cutoff >= first - 60000 && N.lateCutoff(f, msg).what === "Shabbat or Yom Tov", `${iso(f)}: cutoff ${new Date(cutoff).toISOString()}, Shabbat/Yom Tov starts ${new Date(first).toISOString()}`);
      shabbatCapped++;
    }
    if (msg.events.some(e => e.start === "evening")) R.check(cutoff <= dubaiSunset + 60000 && cutoff >= dubaiSunset - 20 * 60000, `${iso(f)}: cutoff ${new Date(cutoff).toISOString()} vs Dubai sunset`);
    else R.check(cutoff > dubaiSunset, `${iso(f)}: dawn-only message cut off before the evening`);
    for (const [now, expectLate] of [[dubaiSunset - 2 * 3600000 + 60000, false], [cutoff - 60000, false], [cutoff, true], [cutoff + 60000, true]]) {
      const log = path.join(dir, `late-${f}-${now}`), group = [], tg = [];
      const r = await quiet(() => N.run({ today: f, now, log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) }));
      R.check(expectLate ? r === "late" && !group.length && tg.length === 1 && tg[0] === msg.text
                         : r === "sent" && group.length === 1 && !tg.length, `${iso(f)} at ${new Date(now).toISOString()}: ${r}, group ${group.length}, telegram ${tg.length}`);
      if (expectLate) {                              // the late Telegram send is logged, so later runs stop too
        const again = await quiet(() => N.run({ today: f, now: now + 3600000, log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) }));
        R.check(again === "already" && tg.length === 1 && !group.length && fs.readFileSync(log, "utf8").includes("(опоздание, Telegram)"), `${iso(f)}: after a late send, next run ${again}`);
      }
    }
    lateChecked++;
  }

  // 3. A failed send is not logged, so the next run tries again (and sends only once)
  {
    const f = start + [...Array(30).keys()].find(k => N.morningMessage(start + k)), log = path.join(dir, "fail"), group = [];
    let fail = true;
    const sendGroup = async t => { if (fail) { fail = false; throw new Error("network"); } group.push(t); };
    let first = "ok"; try { await quiet(() => N.run({ today: f, now: at(f, 6, 13), log, sendGroup })); } catch (e) { first = "threw"; }
    const second = await quiet(() => N.run({ today: f, now: at(f, 6, 43), log, sendGroup }));
    const third = await quiet(() => N.run({ today: f, now: at(f, 7, 13), log, sendGroup }));
    R.check(first === "threw" && second === "sent" && third === "already" && group.length === 1, `failed send: ${first}, ${second}, ${third}, sent ${group.length}`);
  }
  // 3b. Every morning run fails; the run the 12:13 Vercel check restarts posts once; the 12:43 run finds sent.log
  {
    const f = start + [...Array(30).keys()].find(k => N.morningMessage(start + k)), log = path.join(dir, "restart"), group = [];
    let down = true;
    const sendGroup = async t => { if (down) throw new Error("network"); group.push(t); };
    const failed = [];
    for (const [h, m] of RUNS.slice(0, 4)) { try { await quiet(() => N.run({ today: f, now: at(f, h, m), log, sendGroup })); failed.push("sent?"); } catch { failed.push("threw"); } }
    down = false;
    const restarted = await quiet(() => N.run({ today: f, now: at(f, 8, 20), log, sendGroup }));
    const last = await quiet(() => N.run({ today: f, now: at(f, 8, 43), log, sendGroup }));
    R.check(failed.every(x => x === "threw") && restarted === "sent" && last === "already" && group.length === 1,
      `restart after 12:13: morning ${failed}, restarted ${restarted}, 12:43 ${last}, posts ${group.length}`);
  }

  // 4. Workflow file
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "notify.yml"), "utf8");
  const crons = [...yml.matchAll(/cron:\s*"([^"]+)"/g)].map(m => m[1]);
  R.check(JSON.stringify(crons) === JSON.stringify(["13 6 * * *", "43 6 * * *", "13 7 * * *", "43 7 * * *", "43 8 * * *"]), `cron times ${crons}`);
  R.check(/concurrency:\s*\n\s*group: whatsapp-reminder\s*\n\s*cancel-in-progress: false/.test(yml), "runs must be one at a time (concurrency group, no cancelling the running one)");
  R.check(/actions\/checkout@v4\s*\n\s*with:\s*\n\s*ref: \$\{\{ github\.ref \}\}/.test(yml), "checkout must take the branch as it is when the run starts");
  R.check(/git pull --rebase[^\n]*&& git push/.test(yml) && /for i in 1 2 3/.test(yml), "the log push must pull first and retry");
  R.check(/TZ: Asia\/Dubai/.test(yml), "notify.js must run on Dubai time");

  fs.rmSync(dir, { recursive: true, force: true });
  R.done(`${days} mornings x ${RUNS.length} runs, ${sends} sending days, late runs checked on ${lateChecked} days (${shabbatCapped} before Shabbat or Yom Tov)`);
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
