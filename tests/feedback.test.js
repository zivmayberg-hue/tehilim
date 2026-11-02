// The monthly message asking the family for ideas, every month to 2036: the first Sunday, or when that morning is
// Shabbat or Yom Tov or already has a family message, the next ordinary morning with no other message; sent exactly
// once per month by the morning runs (logged as "отзыв YYYY-MM"), the exact text, never on Shabbat or Yom Tov.
// The first one by the user's request on Tuesday 3 November 2026, on its own; the rule from December 2026.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { notify, fixedFromDate, dateFromFixed, iso, isShabbatOrYomTov, todayDubai, endOfYear, reporter } = require("./lib");

const N = notify(), R = reporter("Monthly feedback message (every month to 2036)");
const TEXT = `Дорогая семья! Это ваш Теилим-бот 🤖
Мы продолжаем развивать сайт и будем рады вашим идеям. Что добавить или улучшить? Напишите здесь в чате или запишите голосовое сообщение, как вам удобнее. Лучшие идеи войдут в следующие обновления. Спасибо! 🤍

Dear family, this is your Tehilim bot 🤖
We keep developing the site and would love your ideas. What should we add or improve? Write here in the chat or send a voice message, whatever is easier. The best ideas will go into the next updates. Thank you! 🤍`;
R.check(N.FEEDBACK === TEXT, "the exact text");

const start = todayDubai(), end = endOfYear(2036);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tehilim-feedback-"));
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
(async () => {
  const log = path.join(dir, "sent.log"), group = [];
  let months = 0, moved = 0, maxMove = 0;
  const sentBy = new Map();
  for (let f = start; f <= end; f++) {
    for (const [h, m] of [[6, 13], [6, 43], [8, 43]]) await quiet(() => N.run({ today: f, now: dateFromFixed(f).getTime() + (h * 60 + m) * 60000, log,
      sendGroup: async t => { group.push([f, t]); }, sendLate: async () => { throw new Error("late"); } }));
  }
  for (const [f, t] of group) if (t === TEXT) {
    const month = fs.readFileSync(log, "utf8").split("\n").find(l => l.startsWith(iso(f) + " отзыв ")).split(" ")[2];
    R.check(!sentBy.has(month), `${month}: sent twice`);
    sentBy.set(month, f);
  }
  const first = dateFromFixed(start);
  for (let y = first.getFullYear(), m = first.getMonth(); y < 2037; m === 11 ? (y++, m = 0) : m++) {
    const month = `${y}-${String(m + 1).padStart(2, "0")}`;
    let sun = fixedFromDate(new Date(y, m, 1)); while (dateFromFixed(sun).getDay() !== 0) sun++;
    const f = sentBy.get(month);
    if (month === "2026-11") { R.check(f !== undefined && iso(f) === "2026-11-03", `launch: sent ${f && iso(f)}`); months++; continue; }
    if (sun < start) continue;
    if (f === undefined) { if (N.feedbackDay(y, m) <= end) R.check(false, `${month}: never sent`); continue; }
    months++;
    R.check(f === N.feedbackDay(y, m) && f >= sun, `${month}: sent ${iso(f)}, first Sunday ${iso(sun)}`);
    R.check(!isShabbatOrYomTov(f) && !N.buildMessage(f), `${month}: ${iso(f)} is Shabbat/Yom Tov or has another message`);
    for (let k = sun; k < f; k++) R.check(isShabbatOrYomTov(k) || N.buildMessage(k), `${month}: ${iso(k)} was free but skipped`);
    R.check(group.filter(([g]) => g === f).length === 1, `${month}: another message on ${iso(f)}`);
    if (f > sun) { moved++; maxMove = Math.max(maxMove, f - sun); }
  }
  R.check(months >= 120, `only ${months} months`);
  // the launch morning: exactly the feedback message, on its own; sent once, a second run finds it in the log
  {
    const d = fixedFromDate(new Date(2026, 10, 3)), log2 = path.join(dir, "launch"), g = [];
    const r1 = await quiet(() => N.run({ today: d, now: dateFromFixed(d).getTime() + (6 * 60 + 13) * 60000, log: log2, sendGroup: async t => g.push(t) }));
    const r2 = await quiet(() => N.run({ today: d, now: dateFromFixed(d).getTime() + (6 * 60 + 43) * 60000, log: log2, sendGroup: async t => g.push(t) }));
    R.check(r1 === "sent" && r2 === "already" && g.length === 1 && g[0] === TEXT && fs.readFileSync(log2, "utf8") === "2026-11-03 отзыв 2026-11\n", `launch run: ${r1}, ${r2}, ${g.length}`);
    R.check(!N.feedbackFor(fixedFromDate(new Date(2026, 10, 1))) && N.feedbackFor(fixedFromDate(new Date(2026, 11, 6))) === "2026-12", "no feedback on 1 Nov; 6 Dec is December's");
  }
  const next = [];
  for (let f = start + 1; next.length < 3; f++) if (N.feedbackFor(f) && !N.buildMessage(f)) next.push(iso(f));
  fs.rmSync(dir, { recursive: true, force: true });
  R.done(`${months} months, ${moved} moved (at most ${maxMove} days), next: ${next.join(", ")}`);
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
