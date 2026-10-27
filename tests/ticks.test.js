// "Прочитано" ticks in headless Chromium: mark, undo, persist after reload, reset exactly at sunset in Dubai,
// Bucharest and London, the reader button marks only that person (even when the chapter is shared), the
// "all psalms" view has one section per person with its own button and a correct "Осталось", everything works with
// storage disabled, preview ticks never mix with real ones, and the new cards fit at iPhone and iPad size, light and dark.
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { H, loadPage, reporter } = require("./lib");

const R = reporter("Ticks, all-psalms view and upcoming birthdays in Chromium");
const FILE = "file://" + path.join(__dirname, "..", "index.html");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"));
const P = loadPage();
const DEVICES = {
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iPad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
function instant(tz, y, m, d, hh = 12, mm = 0) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    t += Date.UTC(y, m - 1, d, hh, mm) - Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return new Date(t);
}
async function newContext(browser, { device = "iPhone", scheme = "light", tz = "Asia/Dubai", noStorage = false } = {}) {
  const ctx = await browser.newContext({ ...DEVICES[device], colorScheme: scheme, timezoneId: tz, locale: "ru-RU" });
  if (noStorage) await ctx.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("storage disabled"); } }));
  await ctx.route("**/*", route => {
    const u = route.request().url();
    if (u.startsWith("file:")) return route.continue();
    if (u.startsWith("https://fonts.googleapis.com/")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (u.startsWith("https://zivmayberg-hue.github.io/")) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML });
    return route.abort();
  });
  return ctx;
}
async function open(ctx, when, errors, url = FILE) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("page error: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.clock.setFixedTime(when);
  await page.goto(url);
  return page;
}
const state = page => page.$$eval("#out .card", cs => cs.map(c => ({ name: c.querySelector(".name").textContent,
  ch: +c.querySelector(".ps .n").textContent, done: c.classList.contains("done"), tick: c.querySelector(".tick").textContent })));
const progress = page => page.textContent("#progress");
const tickCard = async (page, i) => (await page.$$("#out .card .tick"))[i].click();
const noSideScroll = page => page.evaluate(() => {
  const els = [document.documentElement, document.body];
  if (!document.getElementById("reader").hidden) els.push(document.getElementById("rbody"));
  return els.every(e => e.scrollWidth <= e.clientWidth + 1);
});
const N = P.PEOPLE.length;

(async () => {
  const browser = await chromium.launch();
  const DUBAI_NOON = instant("Asia/Dubai", 2026, 10, 27, 12);

  // 1. Mark, undo, all done, persist after reload
  {
    const ctx = await newContext(browser), errors = [];
    let page = await open(ctx, DUBAI_NOON, errors);
    R.check(await progress(page) === `Прочитано 0 из ${N}`, `start: "${await progress(page)}"`);
    await tickCard(page, 0); await tickCard(page, 3);
    let s = await state(page);
    R.check(await progress(page) === `Прочитано 2 из ${N}` && s[0].done && s[3].done && s[0].tick === "✓ Прочитано" && s[1].tick === "Прочитал" && s.filter(x => x.done).length === 2,
      `after 2 ticks: "${await progress(page)}" ${JSON.stringify(s.map(x => x.done))}`);
    await tickCard(page, 3);
    s = await state(page);
    R.check(await progress(page) === `Прочитано 1 из ${N}` && s[0].done && !s[3].done, `after undo: "${await progress(page)}"`);
    await page.close();
    page = await open(ctx, DUBAI_NOON, errors);
    s = await state(page);
    R.check(s[0].done && s.filter(x => x.done).length === 1, `after reload: ${JSON.stringify(s.map(x => x.done))}`);
    for (let i = 1; i < N; i++) await tickCard(page, i);
    R.check(await progress(page) === "Все псалмы на сегодня прочитаны 🤍", `all done: "${await progress(page)}"`);
    R.check(await page.evaluate(() => !!localStorage.getItem("tehilim-ticks") && !localStorage.getItem("tehilim-preview-ticks")), "real ticks must use the real key only");
    R.check(errors.length === 0, `basic: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 2. Reset exactly at sunset in the phone's city; a psalm read after sunset counts for the new day
  for (const tz of ["Asia/Dubai", "Europe/Bucharest", "Europe/London"]) {
    const [lat, lon] = P.CITIES[tz];
    const ss = new H.Zmanim(new H.GeoLocation(null, lat, lon, 0, tz), new Date(2026, 9, 28), false).sunset().getTime();
    const ctx = await newContext(browser, { tz }), errors = [];
    const page = await open(ctx, new Date(ss - 120000), errors);
    await tickCard(page, 0); await tickCard(page, 1);
    const at = async ms => { await page.clock.setFixedTime(new Date(ss + ms)); await page.evaluate(() => window.dispatchEvent(new Event("pageshow"))); };
    await at(-30000);
    R.check(await progress(page) === `Прочитано 2 из ${N}`, `${tz}: 30 s before sunset "${await progress(page)}"`);
    await at(30000);
    R.check(await progress(page) === `Прочитано 0 из ${N}` && !(await state(page)).some(x => x.done), `${tz}: 30 s after sunset "${await progress(page)}"`);
    await tickCard(page, 2);                         // read after sunset: counts for the new Hebrew day
    const next = await open(ctx, instant(tz, 2026, 10, 29, 10), errors);
    R.check((await state(next))[2].done && await progress(next) === `Прочитано 1 из ${N}`, `${tz}: tick after sunset not kept for the next morning`);
    R.check(errors.length === 0, `${tz}: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 3. Reader button from a card marks only that person, even with the same chapter
  {
    const ctx = await newContext(browser), errors = [], page = await open(ctx, DUBAI_NOON, errors);
    let s = await state(page);
    const twin = s.findIndex((x, i) => i > 0 && x.ch === s[0].ch);
    R.check(twin > 0, `test data: nobody shares ${s[0].name}'s chapter`);
    await (await page.$$("#out .card .open"))[0].click();
    await page.waitForSelector("#rinner .readbtn");
    R.check((await page.$$("#rinner .readbtn")).length === 1 && await page.textContent("#rinner .readbtn") === "Прочитал ✓", "reader: one 'Прочитал ✓' button");
    await page.click("#rinner .readbtn");
    s = await state(page);
    R.check(await page.isHidden("#reader") && s[0].done && !s[twin].done && s.filter(x => x.done).length === 1,
      `reader button: closed ${await page.isHidden("#reader")}, ${s[0].name} ${s[0].done}, ${s[twin].name} ${s[twin].done}`);
    await (await page.$$("#out .card .open"))[0].click();
    await page.waitForSelector("#rinner .readbtn");
    R.check(await page.textContent("#rinner .readbtn") === "✓ Прочитано", "reader shows ✓ Прочитано for a marked person");
    R.check(errors.length === 0, `reader: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 4. "All psalms": one section per person in card order, own buttons, "Осталось"
  {
    const ctx = await newContext(browser), errors = [], page = await open(ctx, DUBAI_NOON, errors);
    await tickCard(page, 0);
    const cards = await state(page);
    await page.click("#openall");
    await page.waitForSelector("#rinner .readbtn");
    const secs = await page.$$eval("#rinner .sec", ss => ss.map(s => [s.querySelector(".sech").textContent, s.querySelector(".readbtn").textContent]));
    R.check(JSON.stringify(secs.map(x => x[0])) === JSON.stringify(cards.map(c => `${c.name} · Псалом ${c.ch}`)), `sections ${JSON.stringify(secs.map(x => x[0]))}`);
    const dup = cards.filter(c => c.ch === cards[0].ch).length;
    R.check(dup >= 2 && secs.filter(x => x[0].endsWith(`Псалом ${cards[0].ch}`)).length === dup, `Psalm ${cards[0].ch} should appear ${dup} times`);
    R.check(secs[0][1] === "✓ Прочитано" && secs.slice(1).every(x => x[1] === "Прочитал ✓"), `buttons ${secs.map(x => x[1])}`);
    const left = () => page.textContent("#left");
    R.check(await left() === `Осталось: ${N - 1}`, `left "${await left()}"`);
    const btn = async i => (await page.$$("#rinner .readbtn"))[i];
    await (await btn(1)).click();
    R.check(await left() === `Осталось: ${N - 2}` && await (await btn(1)).textContent() === "✓ Прочитано" && !(await page.isHidden("#reader")), `after marking #2: "${await left()}"`);
    await (await btn(0)).click();                    // undo the one marked on its card
    R.check(await left() === `Осталось: ${N - 1}` && await (await btn(0)).textContent() === "Прочитал ✓", `after undo #1: "${await left()}"`);
    await page.click("#back");
    const s = await state(page);
    R.check(!s[0].done && s[1].done && s.filter(x => x.done).length === 1, `cards after all-view: ${JSON.stringify(s.map(x => x.done))}`);
    R.check(errors.length === 0, `all view: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 5. Storage disabled: buttons still work for the visit, no errors
  {
    const ctx = await newContext(browser, { noStorage: true }), errors = [], page = await open(ctx, DUBAI_NOON, errors);
    await tickCard(page, 0); await tickCard(page, 1); await tickCard(page, 1);
    await (await page.$$("#out .card .open"))[2].click();
    await page.waitForSelector("#rinner .readbtn"); await page.click("#rinner .readbtn");
    const s = await state(page);
    R.check(s[0].done && !s[1].done && s[2].done && await progress(page) === `Прочитано 2 из ${N}`, `no storage: ${JSON.stringify(s.map(x => x.done))} "${await progress(page)}"`);
    R.check(errors.length === 0, `no storage: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 6. Preview test ticks never mix with real ticks (same origin, separate keys)
  {
    const ctx = await newContext(browser), errors = [];
    const pv = await open(ctx, DUBAI_NOON, errors, "https://zivmayberg-hue.github.io/tehilim-preview/?date=2026-10-27&time=12:00&tz=Asia/Dubai");
    await tickCard(pv, 0); await tickCard(pv, 1);
    const live = await open(ctx, DUBAI_NOON, errors, "https://zivmayberg-hue.github.io/tehilim/");
    R.check(await progress(live) === `Прочитано 0 из ${N}`, `live shows preview ticks: "${await progress(live)}"`);
    await tickCard(live, 5);
    const pv2 = await open(ctx, DUBAI_NOON, errors, "https://zivmayberg-hue.github.io/tehilim-preview/?date=2026-10-27&time=12:00&tz=Asia/Dubai");
    const s = await state(pv2);
    R.check(s[0].done && s[1].done && !s[5].done, `preview shows live ticks: ${JSON.stringify(s.map(x => x.done))}`);
    // preview: mark at 17:00, reset at 18:00 on the same date (Dubai sunset is about 17:43)
    const p17 = await open(ctx, DUBAI_NOON, errors, "https://zivmayberg-hue.github.io/tehilim-preview/?date=2026-10-28&time=17:00&tz=Asia/Dubai");
    await tickCard(p17, 0); await tickCard(p17, 1);
    const p18 = await open(ctx, DUBAI_NOON, errors, "https://zivmayberg-hue.github.io/tehilim-preview/?date=2026-10-28&time=18:00&tz=Asia/Dubai");
    R.check(await progress(p17) === `Прочитано 2 из ${N}` && await progress(p18) === `Прочитано 0 из ${N}`, `preview 17:00/18:00: "${await progress(p17)}" / "${await progress(p18)}"`);
    R.check(errors.length === 0, `preview: ${errors.join("; ")}`);
    await ctx.close();
  }

  // 7. Design: 5 ticked, upcoming card, reader button; iPhone/iPad, light/dark, normal and "Крупнее"
  for (const device of ["iPhone", "iPad"]) for (const scheme of ["light", "dark"]) {
    const ctx = await newContext(browser, { device, scheme }), errors = [], page = await open(ctx, instant("Asia/Dubai", 2026, 10, 28, 10), errors);
    for (const i of [0, 2, 4, 6, 8]) await tickCard(page, i);
    const tag = `${device}/${scheme}`;
    const ub = await page.$$eval("#upcoming .ub", rs => rs.map(r => [r.querySelector(".ub-n").textContent, r.querySelector(".ub-w").textContent]));
    R.check(ub.length === 3 && ub[0][0].startsWith("Лоэв") && ub[0][1] === "Начинается сегодня вечером, 28 октября.", `${tag}: upcoming ${JSON.stringify(ub)}`);
    for (const big of [false, true]) {
      if (big) await page.click("#bigger");
      R.check(await noSideScroll(page), `${tag}${big ? " big" : ""}: page scrolls sideways`);
      const vis = await page.evaluate(() => [...document.querySelectorAll("#out .card.done .name, #out .card.done .ps .n")].every(e => {
        const c = getComputedStyle(e); return +c.opacity === 1 && c.visibility === "visible"; }));
      R.check(vis, `${tag}: done cards must keep name and chapter fully visible`);
      await page.click("#openall"); await page.waitForSelector("#rinner .readbtn");
      R.check(await noSideScroll(page), `${tag}${big ? " big" : ""}: all-psalms view scrolls sideways`);
      await page.click("#back");
    }
    R.check(errors.length === 0, `${tag}: ${errors.join("; ")}`);
    await ctx.close();
  }

  await browser.close();
  R.done("7 scenarios");
})().catch(e => { console.error(e); process.exitCode = 1; });
