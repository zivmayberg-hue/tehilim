// Daily Tehillim: by day of the Hebrew month (Chabad division, as on chabad.org) and by day of the week.
// Data: every Hebrew day of every month for 10+ years maps to the right range (29-day months read 140-150 on the
// 29th, Adar I and Adar II like any month), every weekday maps to its range, the 30 days and the 7 days each cover
// all 150 chapters (Psalm 119 split 1-96 / 97-176) exactly once, the embedded text gives each reading the right
// number of verses, and the days chabad.org showed (tests/fixtures/chabad-tehillim.csv) match.
// Browser (Chromium): the section below the family cards in three languages, iPhone and iPad, light and dark, normal
// and "Крупнее"; each card opens all its chapters with headings (119 only that day's verses); the ticks do not count
// in "Прочитано N из 12"; "Продолжить с псалма N" after reopening, also by verse in 119; at sunset the readings,
// ticks and the remembered place move to the next Hebrew day.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { H, loadPage, fixedFromDate, dateFromFixed, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Daily Tehillim by day of the month and of the week");
const URL = "file://" + path.join(__dirname, "..", "index.html");
const PSALMS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").split("\n").find(l => l.startsWith("PSALMS = ")).slice(9).replace(/;\s*$/, ""));

// The tables as given (independent of index.html)
const MONTH = { 1: "1-9", 2: "10-17", 3: "18-22", 4: "23-28", 5: "29-34", 6: "35-38", 7: "39-43", 8: "44-48", 9: "49-54", 10: "55-59",
  11: "60-65", 12: "66-68", 13: "69-71", 14: "72-76", 15: "77-78", 16: "79-82", 17: "83-87", 18: "88-89", 19: "90-96", 20: "97-103",
  21: "104-105", 22: "106-107", 23: "108-112", 24: "113-118", 25: "119:1-96", 26: "119:97-176", 27: "120-134", 28: "135-139",
  29: "140-144", 30: "145-150" };
const WEEK = ["1-29", "30-50", "51-72", "73-89", "90-106", "107-119", "120-150"];
const key = r => r.vFrom ? `${r.from}:${r.vFrom}-${r.vTo}` : `${r.from}-${r.to}`;
const verses = r => P.readingChapters(r).reduce((n, it) => n + (it.vFrom ? it.vTo - it.vFrom + 1 : PSALMS[it.ch - 1].length), 0);

// ---------- data ----------
R.check(PSALMS.length === 150 && PSALMS[118].length === 176 && PSALMS.flat().length === 2527, "embedded psalms: 150 chapters, 119 has 176 verses");
let days = 0, short29 = 0, adar1 = 0, adar2 = 0;
const start = P.fixedFromHebrew(5787, 7, 1), end = P.fixedFromHebrew(5798, 7, 1) - 1;
for (let f = start; f <= end; f++) {
  const h = P.hebrewFromFixed(f), r = P.monthlyReading(h), len = P.hMonthLength(h.y, h.m);
  const want = h.d === 29 && len === 29 ? "140-150" : MONTH[h.d];
  R.check(key(r) === want, `${iso(f)} ${h.d}/${h.m}/${h.y}: ${key(r)}, expected ${want}`);
  R.check(!!r.both === (h.d === 29 && len === 29), `${iso(f)}: "days 29 and 30" flag`);
  const w = P.weeklyReading(f);
  R.check(key(w) === WEEK[dateFromFixed(f).getDay()] && w.wd === dateFromFixed(f).getDay(), `${iso(f)}: weekly ${key(w)}`);
  if (h.d === 29 && len === 29) short29++;
  if (h.m === 12 && P.hLeap(h.y)) adar1++;
  if (h.m === 13) adar2++;
  days++;
}
R.check(short29 > 60 && adar1 >= 90 && adar2 >= 90, `coverage: ${short29} short-month 29ths, ${adar1} days of Adar I, ${adar2} of Adar II`);
// 30 days and 7 days each read the whole book exactly once
for (const [name, list] of [["month", Array.from({ length: 30 }, (_, i) => P.monthlyReading({ y: 5787, m: 9, d: i + 1 }))],
                            ["week", Array.from({ length: 7 }, (_, i) => P.weeklyReading(P.fixedFromHebrew(5787, 7, 1) + ((i - P.weekday(P.fixedFromHebrew(5787, 7, 1))) + 7) % 7))]]) {
  const seen = new Map();
  for (const r of list) for (const it of P.readingChapters(r)) for (let v = it.vFrom || 1; v <= (it.vTo || PSALMS[it.ch - 1].length); v++) seen.set(`${it.ch}:${v}`, (seen.get(`${it.ch}:${v}`) || 0) + 1);
  R.check(seen.size === 2527 && [...seen.values()].every(n => n === 1), `${name}: ${seen.size} verses, some twice`);
  R.check(list.reduce((n, r) => n + verses(r), 0) === 2527, `${name}: verse total`);
}
R.check(verses(P.monthlyReading({ y: 5787, m: 9, d: 25 })) === 96 && verses(P.monthlyReading({ y: 5787, m: 9, d: 26 })) === 80, "119 split: 96 and 80 verses");
// chabad.org
let chabadDays = 0;
for (const line of fs.readFileSync(path.join(__dirname, "fixtures", "chabad-tehillim.csv"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [civil, , ch, vv] = line.split(","), [m, d, y] = civil.split("/").map(Number);
  const h = P.hebrewFromFixed(fixedFromDate(new Date(y, m - 1, d))), r = P.monthlyReading(h);
  R.check(key(r) === (vv ? `${ch}:${vv}` : ch), `${civil}: page ${key(r)}, chabad.org ${ch} ${vv}`);
  chabadDays++;
}
// Texts in three languages: the range numbers appear, no "undefined"
for (const L of ["ru", "en", "he"]) for (let d = 1; d <= 30; d++) {
  const r = P.monthlyReading({ y: 5787, m: 8, d: Math.min(d, 29) }), s = P.readingInfo(L, r, { y: 5787, m: 8, d });
  R.check(s.includes(String(r.vFrom || r.from)) && !s.includes("undefined"), `${L} day ${d}: "${s}"`);
}
R.check(P.readingInfo("ru", P.monthlyReading({ y: 5787, m: 8, d: 10 }), { y: 5787, m: 8, d: 10 }) === "10 Хешвана, псалмы 55⁠–⁠59", "Russian card text");
R.check(P.readingInfo("ru", P.weeklyReading(fixedFromDate(new Date(2026, 10, 18))), null) === "среда, псалмы 73⁠–⁠89", "Russian weekly text");

// ---------- browser ----------
const DEVICES = {
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iPad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const TEXT = { ru: ["По дню месяца", "По дню недели", "Прочитано 0 из 12"], en: ["By day of the month", "By day of the week", "Read 0 of 12"],
  he: ["לפי יום בחודש", "לפי יום בשבוע", "נקראו 0 מתוך 12"] };
async function newContext(browser, device = "iPhone", scheme = "light") {
  const ctx = await browser.newContext({ ...DEVICES[device], colorScheme: scheme, timezoneId: "Asia/Dubai", locale: "ru-RU" });
  await ctx.route("**/*", r => { const u = r.request().url();
    if (u.startsWith("file:")) return r.continue();
    if (u.startsWith("https://fonts.googleapis.com/")) return r.fulfill({ status: 200, contentType: "text/css", body: "" });
    return r.abort(); });
  return ctx;
}
async function open(ctx, lang, when, errors) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("page error: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.clock.setFixedTime(new Date(when));
  await page.goto(URL + "?lang=" + lang);
  return page;
}
const noSideScroll = page => page.evaluate(() => [document.documentElement, document.body, document.getElementById("rbody")].every(e => e.scrollWidth <= e.clientWidth + 1));
const sections = page => page.$$eval("#rinner section", ss => ss.map(s => ({ ch: +s.dataset.ch, n: s.querySelectorAll(".heb .v").length,
  first: s.querySelector(".heb .v")?.dataset.v, head: s.querySelector(".sech")?.textContent || "" })));
// Dubai, 10:00 local (06:00 UTC) on a civil day; hebrew day = civil day
const at10 = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T06:00:00Z`;
const CASES = { "ordinary Wednesday, 8 Kislev": [2026, 11, 18], "25 Kislev, Shabbat": [2026, 12, 5], "26 Kislev": [2026, 12, 6], "29 Tevet (29-day month)": [2027, 1, 8] };

(async () => {
  const browser = await chromium.launch();
  let loads = 0;
  for (const lang of ["ru", "en", "he"]) for (const device of ["iPhone", "iPad"]) for (const scheme of ["light", "dark"]) for (const big of [false, true]) {
    const ctx = await newContext(browser, device, scheme);
    for (const [label, [y, m, d]] of Object.entries(CASES)) {
      if ((device !== "iPhone" || scheme !== "light" || big) && !label.startsWith("ordinary")) continue;   // every look on one day, every day in one look
      const tag = `${lang}/${device}/${scheme}/${big ? "big" : "normal"}/${label}`, errors = [];
      const page = await open(ctx, lang, at10(y, m, d), errors);
      loads++;
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      if (big) await page.click("#bigger");
      const f = fixedFromDate(new Date(y, m - 1, d)), h = P.hebrewFromFixed(f), mr = P.monthlyReading(h), wr = P.weeklyReading(f);
      // the section: below the family cards, two cards with the right text
      const pos = await page.evaluate(() => ({ out: document.getElementById("out").getBoundingClientRect().bottom, daily: document.getElementById("daily").getBoundingClientRect().top,
        cards: [...document.querySelectorAll("#daily .card")].map(c => [c.querySelector(".name").textContent, c.querySelector(".info").textContent, c.querySelector(".ps .n").textContent]) }));
      R.check(pos.daily >= pos.out - 1 && pos.cards.length === 2, `${tag}: section not below the family (${JSON.stringify(pos)})`);
      R.check(pos.cards[0][0] === TEXT[lang][0] && pos.cards[1][0] === TEXT[lang][1], `${tag}: card names ${pos.cards.map(c => c[0])}`);
      R.check(pos.cards[0][1] === P.readingInfo(lang, mr, h) && pos.cards[1][1] === P.readingInfo(lang, wr, h), `${tag}: card texts ${pos.cards.map(c => c[1])}`);
      R.check(pos.cards[0][2].replace("​", "") === (mr.from === mr.to ? `${mr.from}` : `${mr.from}–${mr.to}`), `${tag}: tile ${pos.cards[0][2]}`);
      R.check(await noSideScroll(page), `${tag}: sideways scrolling`);
      if (device === "iPad") R.check(await page.$eval("#daily .list", l => getComputedStyle(l).gridTemplateColumns.split(" ").length) === 2, `${tag}: iPad not two columns`);
      // ticks: the card is marked, the family count does not change
      await page.click("#daily .card .tick");
      R.check(await page.textContent("#progress") === TEXT[lang][2] && await page.$eval("#daily .card", c => c.classList.contains("done")), `${tag}: daily tick "${await page.textContent("#progress")}"`);
      await page.click("#daily .card .tick");
      // both readings open all chapters with the right verses
      for (const [i, r] of [[0, mr], [1, wr]]) {
        await (await page.$$("#daily .card .open"))[i].click(); await page.waitForSelector("#rinner .readbtn");
        const ss = await sections(page), want = P.readingChapters(r);
        R.check(ss.length === want.length && ss.every((s, k) => s.ch === want[k].ch && s.n === (want[k].vFrom ? want[k].vTo - want[k].vFrom + 1 : PSALMS[s.ch - 1].length)
          && +s.first === (want[k].vFrom || 1)), `${tag} reading ${i}: ${JSON.stringify(ss.map(s => s.ch + ":" + s.n))}`);
        if (want[0].vFrom) R.check(ss[0].head.includes("119") && ss[0].head.includes(String(want[0].vFrom)) && ss[0].head.includes(String(want[0].vTo)), `${tag}: 119 heading "${ss[0].head}"`);
        else if (want.length > 1) R.check(ss.every(s => s.head.includes(String(s.ch))), `${tag}: chapter headings`);
        R.check(await noSideScroll(page), `${tag} reading ${i}: sideways scrolling`);
        await page.click("#back");
      }
      R.check(errors.length === 0, `${tag}: ${errors.join("; ")}`);
      await page.close();
    }
    await ctx.close();
  }

  // "Продолжить": the place is kept per reading and per day; by verse inside 119; the read button closes the reader
  {
    const ctx = await newContext(browser), errors = [];
    const page = await open(ctx, "ru", at10(2026, 11, 29), errors);   // 19 Kislev, Sunday: 90-96 and 1-29
    await page.evaluate(() => localStorage.clear()); await page.reload();
    const scrollTo = async sel => { await page.mouse.move(200, 400); await page.mouse.wheel(0, 40); await page.$eval(sel, e => e.scrollIntoView({ block: "start" })); await page.waitForTimeout(150); };
    await (await page.$$("#daily .card .open"))[1].click(); await page.waitForSelector("#rinner .readbtn");
    R.check(!await page.$("#rinner .contbtn"), "continue offered on the first opening");
    await scrollTo('#rinner section[data-ch="12"]');
    await page.click("#back");
    await (await page.$$("#daily .card .open"))[1].click(); await page.waitForSelector("#rinner .contbtn");
    R.check(await page.textContent("#rinner .contbtn") === "Продолжить с псалма 12", `continue text "${await page.textContent("#rinner .contbtn")}"`);
    await page.click("#rinner .contbtn"); await page.waitForTimeout(150);
    const top = await page.evaluate(() => { const b = document.getElementById("rbody").getBoundingClientRect().top; return document.querySelector('#rinner section[data-ch="12"]').getBoundingClientRect().top - b; });
    R.check(Math.abs(top) < 30 && !await page.$("#rinner .contbtn"), `continue: section 12 at ${top}px from the top`);
    await page.click("#back");
    await (await page.$$("#daily .card .open"))[0].click(); await page.waitForSelector("#rinner .readbtn");
    R.check(!await page.$("#rinner .contbtn"), "the other reading has its own place");
    await page.click("#back");
    // 119 by verse: 25 Kislev
    await page.clock.setFixedTime(new Date(at10(2026, 12, 5))); await page.reload();
    await (await page.$$("#daily .card .open"))[0].click(); await page.waitForSelector("#rinner .readbtn");
    await scrollTo('#rinner .heb .v[data-v="40"]');
    await page.click("#back");
    await (await page.$$("#daily .card .open"))[0].click(); await page.waitForSelector("#rinner .contbtn");
    R.check(await page.textContent("#rinner .contbtn") === "Продолжить с псалма 119, стих 40", `119 continue "${await page.textContent("#rinner .contbtn")}"`);
    // the read button at the end marks the reading and closes the reader; the family count stays
    await page.click("#rinner .readbtn");
    R.check(await page.isHidden("#reader") && await page.$eval("#daily .card", c => c.classList.contains("done")) && await page.textContent("#progress") === "Прочитано 0 из 12", "read button in the daily reader");
    // sunset in Dubai: the next Hebrew day, ticks and place start again
    const sunset = P.sunsetOn(fixedFromDate(new Date(2026, 11, 5)), P.place("Asia/Dubai"));
    await page.clock.setFixedTime(new Date(sunset.getTime() - 60000)); await page.reload();
    R.check((await page.$$eval("#daily .card .info", e => e.map(x => x.textContent)))[0] === "25 Кислева, псалом 119, стихи 1⁠–⁠96" && await page.$eval("#daily .card", c => c.classList.contains("done")), "a minute before sunset: still 25 Kislev, ticked");
    await page.clock.setFixedTime(new Date(sunset.getTime() + 60000)); await page.reload();
    const after = await page.$$eval("#daily .card .info", e => e.map(x => x.textContent));
    R.check(after[0] === "26 Кислева, псалом 119, стихи 97⁠–⁠176" && after[1] === "воскресенье, псалмы 1⁠–⁠29", `a minute after sunset: ${after}`);
    R.check(!await page.$eval("#daily .card", c => c.classList.contains("done")), "after sunset: tick not reset");
    await (await page.$$("#daily .card .open"))[0].click(); await page.waitForSelector("#rinner .readbtn");
    R.check(!await page.$("#rinner .contbtn"), "after sunset: place not reset");
    R.check(errors.length === 0, `continue: ${errors.join("; ")}`);
    await ctx.close();
  }
  await browser.close();
  R.done(`${days} Hebrew days (${short29} short-month 29ths, Adar I ${adar1}, Adar II ${adar2} days), ${chabadDays} chabad.org days, ${loads} page loads`);
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
