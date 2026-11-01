// Sefirat HaOmer, 10 seasons (5787 to 5796, spring 2027 to 2036):
// - every count 1-49 on the right Hebrew day (Hebcal), Lag BaOmer on the 33rd, the Hebrew wording of all 49 days and
//   the blessing equal to chabad.org (tests/fixtures/chabad-omer.txt, checked against chabad.org's images) and, letters
//   only, to Hebcal's own text;
// - the page: the card switches at sunset in Dubai, Herzliya and Bucharest, night until dawn, "forgot" by day;
// - the messages: every night counted exactly once, in its own evening message or in the last morning message
//   before it; nothing posted while it is Shabbat or Yom Tov (Hebcal, diaspora); Fridays carry Friday and Saturday
//   night, Erev Pesach announces the count; the evening runs (at Dubai nightfall, 30 minutes later, GitHub's 19:43 and
//   20:13, the 20:40 restart) send once, nothing before nightfall, after midnight Dubai only
//   to the admin; the evening workflow file;
// - in Chromium: the card in Russian, English and Hebrew, iPhone and iPad, light and dark, normal and "Крупнее".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { H, loadPage, notify, fixedFromDate, dateFromFixed, iso, isShabbatOrYomTov, reporter, fulfillSite } = require("./lib");

const P = loadPage(), N = notify(), R = reporter("Sefirat HaOmer: page, evening messages and runs (10 seasons)");
const C = N.C, HEB = /[\u0591-\u05C7]/g;
const FIX = fs.readFileSync(path.join(__dirname, "fixtures", "chabad-omer.txt"), "utf8").split("\n").filter(l => l && !l.startsWith("#"));
const CITIES = [["Дубай", 25.2167, 55.2833, "Asia/Dubai"], ["Герцлия", 32.1649, 34.8442, "Asia/Jerusalem"], ["Бухарест", 44.4333, 26.1, "Europe/Bucharest"],
  ["Киев", 50.4667, 30.4833, "Europe/Kiev"], ["Черновцы", 48.3, 25.9333, "Europe/Kiev"]].map(([ru, lat, lon, tz]) => ({ ru, lat, lon, tz }));
const hhmm = (d, tz) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

// ---------- 1. counts and wording ----------
R.check(FIX.length === 50 && FIX[0] === P.OMER_BLESSING, "blessing as on chabad.org");
const letters = s => s.replace(HEB, "").replace(/,/g, "").replace(/שלושה/g, "שלשה").replace(/שלושים/g, "שלשים").replace(/\s+/g, " ").trim();
for (let n = 1; n <= 49; n++) {
  R.check(P.omerHe(n) === FIX[n], `day ${n}: "${P.omerHe(n)}" differs from chabad.org "${FIX[n]}"`);
  R.check(letters(P.omerHe(n)) === letters(new H.OmerEvent(new H.HDate(), n).getTodayIs("he")), `day ${n}: words differ from Hebcal`);
  R.check(!/[\u0591-\u05AF\u05BD]/.test(P.omerHe(n)), `day ${n}: cantillation or meteg`);
}
const seasons = [];
for (let hy = 5787; hy <= 5796; hy++) seasons.push({ hy, f1: C.fixedFromHebrew(hy, 1, 16), f49: C.fixedFromHebrew(hy, 3, 5) });
const hebcalOmer = new Map();
for (const e of H.HebrewCalendar.calendar({ start: dateFromFixed(seasons[0].f1 - 5), end: dateFromFixed(seasons[9].f49 + 5), omer: true, noHolidays: true }))
  if (e.getFlags() & H.flags.OMER_COUNT) hebcalOmer.set(e.getDate().abs(), e.omer);
for (let f = seasons[0].f1 - 5; f <= seasons[9].f49 + 5; f++) R.check(P.omerDay(f) === (hebcalOmer.get(f) || 0), `${iso(f)}: Omer ${P.omerDay(f)}, Hebcal ${hebcalOmer.get(f)}`);
for (const s of seasons) {
  R.check(s.f49 - s.f1 === 48, `${s.hy}: 49 days`);
  R.check(P.omerDay(C.fixedFromHebrew(s.hy, 2, 18)) === 33, `${s.hy}: Lag BaOmer is the 33rd`);
}
R.check(iso(seasons[0].f1 - 1) === "2027-04-22" && iso(seasons[0].f49 - 1) === "2027-06-09", "next season: Thu 22 Apr to Wed 9 Jun 2027 (evenings)");

// ---------- 2. the page: sunset, dawn, day ----------
let pageChecks = 0;
for (const tz of ["Asia/Dubai", "Asia/Jerusalem", "Europe/Bucharest"]) {
  const pl = P.place(tz);
  for (const s of seasons) {
    const eve0 = s.f1 - 1, set0 = P.sunsetOn(eve0, pl).getTime();
    const a = P.omerAt(eve0, new Date(set0 - 60000), pl), b = P.omerAt(eve0, new Date(set0), pl);
    R.check(a === null && b && b.n === 1 && b.part === "evening" && b.nightfall.getTime() === P.fastEndOn(eve0, pl).getTime(), `${tz} ${s.hy}: switch at sunset ${JSON.stringify([a, b])}`);
    for (let f = s.f1; f <= s.f49; f++) {
      const n = f - s.f1 + 1, set = P.sunsetOn(f, pl).getTime(), dawn = P.dawnOn(f, pl).getTime();
      const night = P.omerAt(f, new Date(dawn - 60000), pl), day = P.omerAt(f, new Date(dawn), pl), late = P.omerAt(f, new Date(set - 60000), pl), next = P.omerAt(f, new Date(set), pl);
      R.check(night && night.n === n && night.part === "night" && day && day.n === n && day.part === "day" && late.part === "day" && late.n === n,
        `${tz} ${iso(f)}: night/day ${JSON.stringify([night, day, late])}`);
      R.check(n === 49 ? next === null : next && next.n === n + 1 && next.part === "evening", `${tz} ${iso(f)}: at sunset ${JSON.stringify(next)}`);
      pageChecks++;
    }
  }
}

// ---------- 3. messages ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tehilim-omer-"));
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };
let evenings = 0, inMorning = 0, fridays = 0, msgs = 0;
for (const s of seasons) {
  const morning = new Map(), evening = new Map();
  for (let d = s.f1 - 12; d <= s.f49 + 2; d++) {
    const m = N.buildMessage(d), e = N.eveningMessage(d);
    if (m) { morning.set(d, m); R.check(!isShabbatOrYomTov(d), `${iso(d)}: morning message on Shabbat or Yom Tov`); }
    if (e) {
      evening.set(d, e);
      // posted from Dubai nightfall until midnight Dubai: neither today nor tonight is Shabbat or Yom Tov anywhere
      R.check(!isShabbatOrYomTov(d) && !isShabbatOrYomTov(d + 1), `${iso(d)}: evening message on or before Shabbat/Yom Tov`);
    }
    for (const t of [m && m.text, e && e.text]) if (t) { msgs++; R.check(!t.includes("—") && !t.includes("undefined") && !t.includes("NaN"), `${iso(d)}: bad text`); }
  }
  for (let f = s.f1; f <= s.f49; f++) {
    const n = f - s.f1 + 1, d = f - 1, he = P.omerHe(n);
    const where = [...(evening.has(d) && evening.get(d).omer === n ? ["evening"] : []), ...[...morning].filter(([, m]) => m.omer.includes(n)).map(([k]) => k)];
    R.check(where.length === 1, `${s.hy} night ${n} (${iso(d)}): counted ${where.length} times ${where.map(w => typeof w === "number" ? iso(w) : w)}`);
    if (where[0] === "evening") {
      const t = evening.get(d).text;
      evenings++;
      R.check(t.startsWith(`🌾 Сегодня вечером ${n}-й день Омера`) && t.split("\n")[1] === he && t.includes("Считаем после выхода звёзд:") && t.endsWith("Благословение и текст: https://zivmayberg-hue.github.io/tehilim/"), `${iso(d)} evening text:\n${t}`);
      for (const c of CITIES) {
        const z = new H.Zmanim(new H.GeoLocation(null, c.lat, c.lon, 0, c.tz), dateFromFixed(d), false);
        const want = new Date(Math.ceil(Math.floor(z.timeAtAngle(6, false).getTime() / 1000) / 60) * 60000);   // nightfall 6°, minute up (chabad.org)
        R.check(t.includes(`${c.ru}: ${hhmm(want, c.tz)}`), `${iso(d)} ${c.ru}: nightfall ${hhmm(want, c.tz)} missing`);
      }
      if (n === 33) R.check(t.includes("Лаг ба-Омер"), `${iso(d)}: Lag BaOmer not mentioned`);
    } else if (typeof where[0] === "number") {
      const m = where[0], t = morning.get(m).text;
      inMorning++;
      // the last morning that can be posted: every day after it up to this evening is Shabbat or Yom Tov, and the
      // evening of that morning itself starts Shabbat or Yom Tov
      let ok = m <= d && !isShabbatOrYomTov(m) && isShabbatOrYomTov(m + 1);
      for (let k = m + 1; k <= d; k++) ok = ok && isShabbatOrYomTov(k);
      R.check(ok, `${s.hy} night ${n}: in the morning of ${iso(m)}, not the last morning before ${iso(d)}`);
      R.check(t.includes(he) && t.includes(`: ${n}-й день`), `${iso(m)}: night ${n} text missing`);
      if (dateFromFixed(d).getDay() === 6) R.check(t.includes(`вечером, после авдалы: ${n}-й день`), `${iso(m)}: Saturday night ${n} not "после авдалы"`);
    }
  }
  for (let d = s.f1 - 1; d < s.f49; d++) if (dateFromFixed(d).getDay() === 5 && !isShabbatOrYomTov(d) && !isShabbatOrYomTov(d - 1)) {
    const m = morning.get(d), n = d + 1 - s.f1 + 1;
    R.check(m && m.omer.includes(n) && (n === 49 || m.omer.includes(n + 1)) && m.text.includes(`Сегодня вечером, после выхода звёзд: ${n}-й день`) &&
      (n === 49 || m.text.includes(`В субботу вечером, после авдалы: ${n + 1}-й день`)), `${iso(d)}: Friday Omer lines\n${m && m.text}`);
    fridays++;
  }
  const first = [...morning].find(([, m]) => m.omer.includes(1));
  R.check(first && first[1].omer.includes(2) && first[1].text.includes("🌾 Со второго вечера Песаха считаем Омер") && first[0] < s.f1 - 1, `${s.hy}: Erev Pesach announcement`);
  R.check([...morning].filter(([, m]) => m.text.includes("Со второго вечера Песаха")).length === 1, `${s.hy}: announced once`);
}
// a sample of the wording, so a change shows up here
R.check(N.omerEvening(fixedFromDate(new Date(2027, 3, 26))) === 5 && N.omerNightsInMorning(fixedFromDate(new Date(2027, 3, 30))).map(C.omerDay).join() === "9,10", "2027 samples");
R.check(C.omerRu(7) === "7-й день, это неделя" && C.omerRu(8) === "8-й день, это неделя и 1 день" && C.omerRu(16) === "16-й день, это 2 недели и 2 дня" && C.omerRu(35) === "35-й день, это 5 недель", "Russian count wording");

// ---------- 4. evening runs ----------
(async () => {
  const nightfallUTC = d => { const z = new H.Zmanim(new H.GeoLocation(null, 25.2167, 55.2833, 0, "Asia/Dubai"), dateFromFixed(d), false);
    return Math.ceil(Math.floor(z.timeAtAngle(6, false).getTime() / 1000) / 60) * 60000; };   // Dubai nightfall, as chabad.org
  let early = 0;
  let runDays = 0, lateChecks = 0;
  for (const s of seasons) for (let d = s.f1 - 3; d <= s.f49 + 1; d++) {
    const log = path.join(dir, `e-${d}`), group = [], tg = [];
    fs.writeFileSync(log, `${iso(d)} утро\n`);             // the morning's line must not stop the evening
    const at = (h, m) => dateFromFixed(d).getTime() + (h * 60 + m) * 60000, nf = nightfallUTC(d);
    // too early (an hour before nightfall): nothing, not logged; then the trigger's start just after nightfall, its
    // backup 30 minutes later, GitHub's 15:43 and 16:13 UTC, the 16:40 check's restart at 16:45
    const pre = await quiet(() => N.run({ today: d, now: nf - 3600000, slot: "evening", log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) }));
    if (N.eveningMessage(d)) { R.check(pre === "early" && !group.length, `${iso(d)}: before nightfall ${pre}`); early++; }
    const res = [];
    for (const now of [nf + 3 * 60000, nf + 33 * 60000, at(15, 43), at(16, 13), at(16, 45)]) res.push(await quiet(() => N.run({ today: d, now, slot: "evening", log, sendGroup: async t => group.push(t), sendLate: async t => tg.push(t) })));
    const e = N.eveningMessage(d);
    if (e) R.check(res.join() === "sent,already,already,already,already" && group.length === 1 && group[0] === e.text && !tg.length &&
      fs.readFileSync(log, "utf8").includes(`${iso(d)} вечер Омер ${e.omer}\n`), `${iso(d)} evening runs: ${res}`);
    else R.check(res.every(r => r === "none") && !group.length && !tg.length, `${iso(d)}: evening sent without a message ${res}`);
    const morningAgain = await quiet(() => N.run({ today: d, now: at(8, 43), log, sendGroup: async () => {}, sendLate: async () => {} }));
    R.check(morningAgain === "already" || morningAgain === "none" || (morningAgain === "sent" && N.feedbackFor(d) && !N.buildMessage(d)), `${iso(d)}: morning after evening ${morningAgain}`);
    runDays++;
    if (e) {
      const cut = N.eveningCutoff(d).getTime();
      R.check(cut === Date.parse(iso(d + 1) + "T00:00:00+04:00") && nf < cut - 4 * 3600000, `${iso(d)}: evening cutoff is not midnight Dubai`);
      R.check(N.eveningStart(d).getTime() === nf - 10 * 60000, `${iso(d)}: evening start is not 10 minutes before Dubai nightfall`);
      for (const [delta, late] of [[-60000, false], [0, true]]) {
        const l2 = path.join(dir, `l-${d}-${delta}`), g = [], t = [];
        const r = await quiet(() => N.run({ today: d, now: cut + delta, slot: "evening", log: l2, sendGroup: async x => g.push(x), sendLate: async x => t.push(x) }));
        R.check(late ? r === "late" && !g.length && t[0] === e.text : r === "sent" && g.length === 1 && !t.length, `${iso(d)} cutoff ${delta}: ${r}`);
        lateChecks++;
      }
    }
  }
  // the morning run ignores evening lines, and the evening run ignores morning lines
  {
    const d = fixedFromDate(new Date(2027, 3, 26)), log = path.join(dir, "mix");
    fs.writeFileSync(log, `${iso(d)} вечер Омер 5\n`);
    R.check(await quiet(() => N.run({ today: d, now: dateFromFixed(d).getTime() + 6 * 3600000, log, sendGroup: async () => {} })) === "none", "morning run: no morning message that day");
    const fri = fixedFromDate(new Date(2027, 3, 30)), log2 = path.join(dir, "mix2");
    fs.writeFileSync(log2, `${iso(fri)} вечер Омер 9\n`);
    R.check(await quiet(() => N.run({ today: fri, now: dateFromFixed(fri).getTime() + 6 * 3600000, log: log2, sendGroup: async () => {} })) === "sent", "morning run not stopped by an evening line");
  }
  // late evening alert text, in English
  const A = require(path.join(__dirname, "..", "notify", "alerts.js"));
  R.check(A.TEXT.lateEvening().startsWith("⚠️ Tehilim: tonight's Omer reminder ran after midnight Dubai time, so it didn't go to the group.") && !/[а-яё—]/i.test(A.TEXT.lateEvening()), "late evening alert");

  // ---------- 5. workflow ----------
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "evening.yml"), "utf8");
  const crons = [...yml.matchAll(/cron:\s*"([^"]+)"/g)].map(m => m[1]);
  R.check(JSON.stringify(crons) === JSON.stringify(["43 15 * 3-6 *", "13 16 * 3-6 *"]), `evening crons ${crons}`);
  R.check(/concurrency:\s*\n\s*group: whatsapp-reminder\s*\n\s*cancel-in-progress: false/.test(yml), "evening runs share the morning's concurrency group");
  R.check(/run: node notify\/notify\.js evening\n/.test(yml) && /TZ: Asia\/Dubai/.test(yml) && /ref: \$\{\{ github\.ref \}\}/.test(yml) && /git pull --rebase[^\n]*&& git push/.test(yml), "evening workflow setup");
  R.check(/workflow_dispatch:/.test(yml) && /timeout-minutes: 10/.test(yml), "evening workflow can be started by the Vercel trigger and times out");

  // ---------- 6. Chromium ----------
  const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"));
  const browser = await chromium.launch();
  const DEV = { iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
                iPad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
  const CASES = [
    { q: "date=2027-04-22&time=20:00&tz=Asia/Dubai", n: 1, part: "evening" },
    { q: "date=2027-05-25&time=12:00&tz=Europe/Bucharest", n: 33, part: "day" },
    { q: "date=2027-06-09&time=21:30&tz=Asia/Jerusalem", n: 49, part: "evening" },
    { q: "date=2027-04-28&time=02:00&tz=Asia/Dubai", n: 6, part: "night" },
    { q: "date=2027-04-27&time=12:00&tz=Asia/Dubai", n: 5, part: "day" },
    { q: "date=2027-04-22&time=18:00&tz=Asia/Dubai", n: 0 },
    { q: "date=2027-06-10&time=12:00&tz=Asia/Dubai", n: 49, part: "day" },
    { q: "date=2027-06-10&time=21:00&tz=Asia/Dubai", n: 0 },
  ];
  let views = 0;
  for (const lang of ["ru", "en", "he"]) for (const dev of ["iPhone", "iPad"]) for (const scheme of ["light", "dark"]) for (const big of [false, true]) {
    const ctx = await browser.newContext({ ...DEV[dev], colorScheme: scheme, locale: "ru-RU" });
    await ctx.route("**/*", r => { const u = r.request().url();
      if (u.startsWith("https://zivmayberg-hue.github.io/")) return fulfillSite(r, HTML);
      if (u.startsWith("https://fonts.googleapis.com/")) return r.fulfill({ status: 200, contentType: "text/css", body: "" });
      return r.abort(); });
    if (big) await ctx.addInitScript(() => { try { localStorage.setItem("big", "1"); } catch (e) {} });
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const cases = dev === "iPhone" && scheme === "light" && !big ? CASES : CASES.slice(0, 3);
    for (const c of cases) {
      await page.goto(`https://zivmayberg-hue.github.io/tehilim-preview/?${c.q}&lang=${lang}`);
      const card = await page.evaluate(() => { const c = [...document.querySelectorAll("#banners .rc")].find(x => x.querySelector(".omer-he"));
        if (!c) return null;
        return { text: c.innerText, he: [...c.querySelectorAll(".omer-he")].map(p => ({ t: p.textContent, dir: getComputedStyle(p).direction })),
          tile: (c.querySelector(".tile .v") || {}).textContent || "", wide: document.documentElement.scrollWidth > innerWidth + 1 }; });
      const where = `${lang} ${dev} ${scheme}${big ? " big" : ""} ${c.q}`;
      if (!c.n) { R.check(card === null, `${where}: Omer card outside the count`); continue; }
      R.check(card && card.he.length === (c.part === "day" ? 1 : 2) && card.he.at(-1).t === P.omerHe(c.n) && card.he.every(h => h.dir === "rtl") && !card.wide,
        `${where}: ${JSON.stringify(card)}`);
      if (!card) continue;
      if (c.part !== "day") R.check(card.he[0].t === P.OMER_BLESSING, `${where}: blessing`);
      if (c.part === "evening") R.check(/^\d\d:\d\d$/.test(card.tile), `${where}: nightfall tile "${card.tile}"`);
      if (lang !== "ru") R.check(!/[А-Яа-яЁё]/.test(card.text), `${where}: Russian left in "${card.text}"`);
      const forgot = { ru: "Если забыли вечером", en: "If you forgot last night", he: "מי ששכח לספור בלילה" }[lang];
      R.check(card.text.includes(forgot) === (c.part === "day"), `${where}: "forgot" line ${c.part}`);
      const lag = { ru: "Лаг ба-Омер", en: "Lag BaOmer", he: "ל״ג בעומר" }[lang];
      R.check(card.text.includes(lag) === (c.n === 33), `${where}: Lag BaOmer mark`);
      views++;
    }
    R.check(!errors.length, `page errors ${errors}`);
    await ctx.close();
  }
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  R.done(`${seasons.length} seasons, 49 days checked against chabad.org and Hebcal, ${pageChecks} days x 3 cities on the page, ` +
    `${evenings} evening messages + ${inMorning} counts in morning messages (${fridays} Fridays), ${runDays} evenings x 5 runs (${early} too-early runs held back), ${lateChecks} midnight cutoff checks, ${views} Chromium views`);
})().catch(e => { console.error(e); process.exitCode = 1; });
