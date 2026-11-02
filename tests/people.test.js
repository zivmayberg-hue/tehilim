// Phase 7 in Chromium, with a stand-in for the tehilim-trigger API that keeps ticks like the real one (lib/reading.js
// in tehilim-trigger, tested there with an in-memory Redis):
// - personal links ?me= for all 8 names: name, language, greeting, link removed from the address bar, remembered;
// - the "Кто читает?" sheet: once on a fresh device, never again after a choice or "Пропустить", never inside the
//   reader, over a banner or on ?date links, "Сменить имя" reopens it; it fits the smallest and largest iPhone,
//   light and dark, normal and "Крупнее";
// - Aron's own device (ticks, "Крупнее", Russian) opened via ?me=aron: no sheet, everything kept, today's ticks sent;
// - ticks from two devices on a third, the offline queue sent later, the API down or hanging (no errors, no delay),
//   the line cleared at sunset, the streak line, the warm "all read" note that disappears;
// - own statistics only on the live address (not with ?stats=off), nothing sent from a file;
// - pixel check: with Aron set, the page looks exactly like the current live page apart from the "Сегодня" line
//   (and the small "Сменить имя" link at the very bottom).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { loadPage, reporter, fulfillSite, API_HOST } = require("./lib");

const R = reporter("Personal names, who read today, own statistics (Chromium)");
const P = loadPage();
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"));
let OLD = null; try { OLD = execFileSync("git", ["show", "origin/main:index.html"], { cwd: ROOT }); } catch (e) {}
const ME = { aron: ["Арон", "ru", "Aron"], natalia: ["Наталья", "ru"], yana: ["Яна", "ru"], ziv: ["Зив", "en", "Ziv"], dafna: ["Дафна", "en", "Dafna"],
  israel: ["Исраэль Авия", "en", "Israel Aviah"], polina: ["Полина", "he", "פולינה"], moshe: ["Моше", "he", "משה"] };
const SHEET = ["Арон", "Наталья", "Яна", "Ziv", "Dafna", "Israel Aviah", "פולינה", "משה"];
const DEV = { "iPhone SE": { width: 320, height: 568 }, "iPhone SE 3": { width: 375, height: 667 }, "iPhone 16 Pro Max": { width: 440, height: 956 },
  iPad: { width: 820, height: 1180 } };
const PREV = "https://zivmayberg-hue.github.io/tehilim-preview/", LIVE = "https://zivmayberg-hue.github.io/tehilim/";

// The API stand-in: same answers as lib/reading.js (last change wins per item, guests not kept)
function fakeServer() {
  const s = { ticks: {}, posts: [], mode: "ok", streak: 0 };
  s.handle = async route => {
    const req = route.request();
    if (s.mode === "down") return route.abort();
    if (s.mode === "503") return route.fulfill({ status: 503, headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" });
    if (s.mode === "hang") { await new Promise(r => setTimeout(r, 8000)); return route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" }).catch(() => {}); }
    const b = JSON.parse(req.postData() || "{}"); s.posts.push(b);
    for (const e of b.q || []) if (e.k === "tick" && ME[e.p]) {
      const d = (s.ticks[`${b.ns}:${e.f}`] = s.ticks[`${b.ns}:${e.f}`] || {}), m = (d[e.p] = d[e.p] || {});
      if (!m[e.x] || m[e.x].t <= e.t) m[e.x] = { on: e.on, t: e.t };
    }
    const day = s.ticks[`${b.ns}:${b.f}`] || {}, today = {};
    for (const [p, m] of Object.entries(day)) {
      const on = Object.entries(m).filter(([, v]) => v.on).map(([k]) => k);
      const x = { n: on.filter(k => !k.startsWith("daily-")).length, m: on.includes("daily-month") ? 1 : 0, w: on.includes("daily-week") ? 1 : 0 };
      if (x.n || x.m || x.w) today[p] = x;
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ f: b.f, today, streak: ME[b.p] ? s.streak : 0 }) });
  };
  return s;
}
async function device(browser, server, { dev = "iPhone SE 3", scheme = "light", init = null, html = HTML } = {}) {
  const ctx = await browser.newContext({ viewport: DEV[dev], deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: "ru-RU", timezoneId: "Asia/Dubai" });
  if (init) await ctx.addInitScript(init);
  await ctx.route("**/*", r => { const u = r.request().url();
    if (u.startsWith(API_HOST)) return server.handle(r);
    if (u.startsWith("https://zivmayberg-hue.github.io/")) return fulfillSite(r, html);
    if (u.startsWith("https://fonts.googleapis.com/") || u.startsWith("https://cloud.umami.is/")) return r.fulfill({ status: 200, body: "" });
    if (u.startsWith("file://")) return r.continue();
    return r.abort(); });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  return { ctx, page, errors };
}
const sheetUp = page => page.evaluate(() => !document.getElementById("sheet").hidden);
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const server = fakeServer();

  // 1. Personal links
  for (const [k, [ru, lang, local]] of Object.entries(ME)) {
    const { ctx, page, errors } = await device(browser, server);
    await page.goto(`${PREV}?me=${k}`); await wait(900);
    const st = await page.evaluate(() => ({ url: location.href, lang: document.documentElement.lang, greet: document.getElementById("greet").textContent,
      me: localStorage.getItem("tehilim-preview-me"), sheet: !document.getElementById("sheet").hidden }));
    const name = lang === "ru" ? ru : local || P.PEOPLE.find(p => p.name === ru)[lang];
    R.check(st.url === PREV && st.lang === lang && st.me === k && !st.sheet && st.greet.endsWith(", " + name), `?me=${k}: ${JSON.stringify(st)}`);
    await page.goto(PREV); await wait(900);
    R.check(!(await sheetUp(page)), `?me=${k}: sheet after reload`);
    R.check((await page.textContent("#greet")).endsWith(", " + name), `?me=${k}: greeting after reload "${await page.textContent("#greet")}"`);
    R.check(!errors.length, `?me=${k}: ${errors}`);
    await ctx.close();
  }

  // 2. The sheet: fits, once, choice, skip, change
  let sheetViews = 0;
  for (const dev of ["iPhone SE", "iPhone SE 3", "iPhone 16 Pro Max"]) for (const scheme of ["light", "dark"]) for (const big of [false, true]) {
    const { ctx, page, errors } = await device(browser, server, { dev, scheme, init: big ? () => { try { localStorage.setItem("big", "1"); } catch (e) {} } : null });
    await page.goto(PREV); await wait(1100);
    const m = await page.evaluate(() => {
      const box = document.querySelector(".sheet-box").getBoundingClientRect(), bs = [...document.querySelectorAll("#names button")];
      return { up: !document.getElementById("sheet").hidden, top: box.top, bottom: box.bottom, vh: innerHeight, title: document.getElementById("sheet-t").textContent,
        names: bs.map(b => b.textContent), minH: Math.min(...bs.map(b => b.getBoundingClientRect().height)), font: parseFloat(getComputedStyle(bs[0]).fontSize),
        over: bs.some(b => b.scrollWidth > b.clientWidth + 1), skip: document.getElementById("skip").textContent, scroll: document.querySelector(".sheet-box").scrollHeight > document.querySelector(".sheet-box").clientHeight + 1,
        dim: getComputedStyle(document.getElementById("sheet")).backgroundColor };
    });
    const tag = `${dev} ${scheme}${big ? " big" : ""}`;
    R.check(m.up && m.title === "Кто читает?" && JSON.stringify(m.names) === JSON.stringify(SHEET) && m.skip === "Пропустить", `${tag}: sheet ${JSON.stringify(m)}`);
    R.check(m.top > 0 && m.bottom <= m.vh + 0.5 && !m.scroll && m.minH >= 60 && m.font >= 20 && !m.over, `${tag}: does not fit ${JSON.stringify(m)}`);
    R.check(/rgba\(0, 0, 0, 0\.3/.test(m.dim), `${tag}: page not dimmed behind (${m.dim})`);
    R.check(!errors.length, `${tag}: ${errors}`);
    sheetViews++;
    await ctx.close();
  }
  {
    const { ctx, page } = await device(browser, server);
    await page.goto(PREV); await wait(1100);
    await page.click("#names button:nth-child(5)"); await wait(500);          // Dafna
    const a = await page.evaluate(() => ({ lang: document.documentElement.lang, greet: document.getElementById("greet").textContent, sheet: !document.getElementById("sheet").hidden }));
    R.check(a.lang === "en" && a.greet.endsWith(", Dafna") && !a.sheet, `choice: ${JSON.stringify(a)}`);
    await page.click(`[data-lang="he"]`); await page.reload(); await wait(1100);
    R.check(!(await sheetUp(page)) && await page.evaluate(() => document.documentElement.lang) === "he" && (await page.textContent("#greet")).endsWith(", דפנה"), "the language switch overrides the default and is remembered; no sheet again");
    await page.click("#changeme"); await wait(500);
    R.check(await sheetUp(page), "Сменить имя reopens the sheet");
    await page.click("#skip"); await wait(500);
    R.check(!(await sheetUp(page)) && !(await page.textContent("#greet")).includes(","), `skip = guest, no name: "${await page.textContent("#greet")}"`);
    await page.reload(); await wait(1100);
    R.check(!(await sheetUp(page)), "no sheet after skip");
    await ctx.close();
  }
  {   // never on ?date links, never in the reader, never over a banner (Shabbat card on Friday), never without storage
    const a = await device(browser, server);
    await a.page.goto(`${PREV}?date=2026-11-04&time=12:00`); await wait(1100);
    R.check(!(await sheetUp(a.page)), "sheet on a ?date link");
    await a.ctx.close();
    const b = await device(browser, server);
    await b.page.goto(PREV); await b.page.click("#out .card .open"); await wait(1100);
    R.check(!(await sheetUp(b.page)), "sheet over the reader");
    await b.ctx.close();
    const c = await device(browser, server);
    await c.page.clock.setFixedTime(new Date("2026-11-06T08:00:00Z"));   // Friday: the Shabbat card is on the page
    await c.page.goto(PREV); await wait(1100);
    R.check(await c.page.evaluate(() => !document.getElementById("shabbat").hidden) && !(await sheetUp(c.page)), "sheet over a banner");
    await c.ctx.close();
    const d = await device(browser, server, { init: () => Object.defineProperty(window, "localStorage", { get() { throw new Error("no storage"); } }) });
    await d.page.goto(PREV); await wait(1100);
    R.check(!(await sheetUp(d.page)) && !d.errors.length, `sheet without storage (would come back every time) ${d.errors}`);
    await d.ctx.close();
  }

  // 3. Aron's device before Phase 7: today's ticks, "Крупнее", Russian, no person; then his personal link
  {
    const s = fakeServer();
    const { ctx, page, errors } = await device(browser, s, { dev: "iPhone SE 3" });
    await page.goto(LIVE + "?stats=off"); await wait(200);
    await page.evaluate(() => { localStorage.setItem("big", "1"); localStorage.setItem("tehilim-lang", "ru"); setRead("Арон", true); setRead("Наталья", true); });
    R.check(s.posts.every(b => !b.q.some(e => e.k === "tick")), "ticks sent before a person was chosen");
    await page.goto(LIVE + "?me=aron"); await wait(1500);
    const st = await page.evaluate(() => ({ url: location.href, big: document.body.classList.contains("big"), lang: document.documentElement.lang, greet: document.getElementById("greet").textContent,
      ticks: [...document.querySelectorAll("#out .card .tick")].filter(t => t.getAttribute("aria-pressed") === "true").length, sheet: !document.getElementById("sheet").hidden,
      who: document.getElementById("who").textContent }));
    R.check(st.url === LIVE && st.big && st.lang === "ru" && st.greet.endsWith(", Арон") && st.ticks === 2 && !st.sheet && st.who === "Сегодня: Арон 2/12", `Aron's device: ${JSON.stringify(st)}`);
    R.check(s.posts.length && s.posts.every(b => b.ns === "live"), "Aron's ticks sent to the live data");
    R.check(!errors.length, `Aron's device: ${errors}`);
    await ctx.close();
  }
  {   // an existing device with today's ticks made before Phase 7: ?me=aron sends them under Aron's name
    const s2 = fakeServer();
    const { ctx, page } = await device(browser, s2, { init: () => { try { localStorage.setItem("tehilim-preview-me", ""); } catch (e) {} } });
    await page.goto(PREV); await wait(200);
    await page.evaluate(() => { localStorage.setItem("tehilim-preview-me", "guest"); });
    await page.reload(); await wait(300);
    await (await page.$$("#out .card .tick"))[0].click(); await wait(1200);
    R.check(!JSON.stringify(s2.ticks).includes("Арон"), "a guest's tick was sent");
    await page.goto(`${PREV}?me=aron`); await wait(1500);
    R.check(JSON.stringify(s2.ticks).includes("\"Арон\":{\"on\":1"), `existing ticks sent on ?me=aron: ${JSON.stringify(s2.ticks)}`);
    await ctx.close();
  }

  // 4. Several devices, offline queue, API down or hanging, sunset, streak, "all read"
  {
    const s3 = fakeServer();
    const A = await device(browser, s3), B = await device(browser, s3), C = await device(browser, s3);
    await A.page.goto(`${PREV}?me=aron`); await B.page.goto(`${PREV}?me=dafna`); await C.page.goto(PREV); await wait(1100);
    await C.page.click("#skip");
    await (await A.page.$$("#out .card .tick"))[0].click(); await (await A.page.$$("#out .card .tick"))[1].click();
    await (await B.page.$$("#out .card .tick"))[2].click(); await (await B.page.$$("#daily .tick"))[0].click(); await wait(1500);
    await C.page.reload(); await wait(1500);
    const who = await C.page.textContent("#who");
    R.check(who === "Сегодня: Арон 2/12, Дафна 1/12 месяц ✓", `third device: "${who}"`);
    // offline: ticks queued, sent when the API answers again
    s3.mode = "down";
    await (await A.page.$$("#out .card .tick"))[2].click(); await wait(1500);
    const queued = await A.page.evaluate(() => JSON.parse(localStorage.getItem("tehilim-preview-outbox") || "[]").length);
    R.check(queued >= 1, `offline: queue ${queued}`);
    s3.mode = "ok";
    await A.page.evaluate(() => window.dispatchEvent(new Event("online"))); await wait(1500);
    R.check(await A.page.evaluate(() => JSON.parse(localStorage.getItem("tehilim-preview-outbox") || "[]").length) === 0 && (await A.page.textContent("#who")).includes("Арон 3/12"), `offline ticks sent later: ${await A.page.textContent("#who")}`);
    // streak line for the device's own person
    s3.streak = 23; await A.page.reload(); await wait(1500);
    R.check((await A.page.textContent("#who")).includes("Арон читает 23 дня подряд 🔥"), `streak: ${await A.page.textContent("#who")}`);
    for (const x of [A, B, C]) R.check(!x.errors.length, `devices: ${x.errors}`), await x.ctx.close();
  }
  for (const mode of ["down", "503", "hang"]) {
    const s4 = fakeServer(); s4.mode = mode;
    const { ctx, page, errors } = await device(browser, s4);
    const t0 = Date.now();
    await page.goto(`${PREV}?me=aron`, { waitUntil: "load" });
    await page.waitForSelector("#out .card .open"); const ms = Date.now() - t0;
    await (await page.$$("#out .card .tick"))[0].click(); await wait(300);
    const ok = await page.evaluate(() => document.querySelector("#out .card .tick").getAttribute("aria-pressed") === "true" && document.getElementById("who").textContent === "");
    R.check(ok && !errors.length && ms < 3000, `API ${mode}: page ${ms} ms, tick ${ok}, errors ${errors}`);
    await ctx.close();
  }
  {   // the "Сегодня" line belongs to the Hebrew day: cleared at sunset, until the new day's answer
    const s5 = fakeServer();
    const { ctx, page } = await device(browser, s5);
    await page.clock.install({ time: new Date("2026-11-04T13:15:00Z") });            // 17:15 Dubai, sunset 17:31
    await page.goto(`${PREV}?me=aron`); await page.clock.runFor(1500);
    await (await page.$$("#out .card .tick"))[0].click(); await page.clock.runFor(1500);
    const before = await page.textContent("#who");
    s5.mode = "hang";
    await page.clock.runFor(30 * 60000); await page.clock.runFor(61000);
    const after = await page.evaluate(() => ({ who: document.getElementById("who").textContent, ticks: [...document.querySelectorAll("#out .card .tick")].filter(t => t.getAttribute("aria-pressed") === "true").length }));
    R.check(before.startsWith("Сегодня: Арон 1/12") && after.who === "" && after.ticks === 0, `sunset: before "${before}", after ${JSON.stringify(after)}`);
    await ctx.close();
  }
  {   // all 12 read: a short warm note that goes away by itself
    const { ctx, page } = await device(browser, fakeServer());
    await page.goto(`${PREV}?me=aron`); await wait(900);
    for (let i = 0; i < 12; i++) await (await page.$$("#out .card .tick"))[i].click();
    const shown = await page.evaluate(() => ({ on: document.getElementById("toast").classList.contains("on"), text: document.getElementById("toast").textContent }));
    await wait(4200);
    const gone = await page.evaluate(() => !document.getElementById("toast").classList.contains("on"));
    R.check(shown.on && shown.text === "Спасибо! Все псалмы на сегодня прочитаны 🤍" && gone, `all read note ${JSON.stringify(shown)} gone ${gone}`);
    await ctx.close();
  }

  // 5. Own statistics: live only; not with ?stats=off; nothing from a file
  {
    const s6 = fakeServer();
    const L = await device(browser, s6);
    await L.page.goto(`${LIVE}?me=ziv`); await wait(1500);
    await L.page.click("#out .card .open"); await L.page.click("#back"); await wait(1500);
    const evs = s6.posts.flatMap(b => b.q.map(e => ({ ...e, ns: b.ns })));
    R.check(evs.some(e => e.k === "open" && e.p === "ziv" && e.l === "en" && e.ns === "live") && evs.some(e => e.k === "psalm" && e.x > 0), `live statistics ${JSON.stringify(evs)}`);
    R.check(evs.every(e => Object.keys(e).every(k => ["k", "x", "on", "f", "p", "l", "t", "ns"].includes(k))), "only the allowed fields");
    await L.ctx.close();
    const s7 = fakeServer();
    const O = await device(browser, s7);
    await O.page.goto(`${LIVE}?stats=off&me=ziv`); await wait(1500);
    await O.page.click("#out .card .open"); await wait(1500);
    R.check(!s7.posts.some(b => b.q.some(e => e.k !== "tick")), "statistics with ?stats=off");
    await O.ctx.close();
    const s8 = fakeServer();
    const F = await device(browser, s8);
    await F.page.goto("file://" + path.join(ROOT, "index.html")); await wait(1500);
    R.check(s8.posts.length === 0, "a request from a file");
    await F.ctx.close();
  }

  // 6. Pixel check against the current live page
  let pixels = 0;
  if (OLD) for (const [dev, scheme] of [["iPhone SE 3", "light"], ["iPhone SE 3", "dark"], ["iPad", "light"]]) {
    const shot = async html => {
      const { ctx, page } = await device(browser, fakeServer(), { dev, scheme, html, init: () => { try { localStorage.setItem("tehilim-preview-me", "aron"); } catch (e) {} } });
      await page.goto(`${PREV}?date=2026-11-04&time=12:00&tz=Asia/Dubai`); await wait(900);
      // the same style tag on both pages (a no-op on the old one): adding any style re-renders the glass switch slightly
      await page.addStyleTag({ content: "#changeme{display:none!important}" });
      await wait(200);
      const png = await page.screenshot({ fullPage: true });
      await ctx.close(); return png;
    };
    const a = await shot(OLD), b = await shot(HTML);
    R.check(Buffer.compare(a, b) === 0, `${dev} ${scheme}: the page with Aron set differs from the live page`);
    pixels++;
  }
  else R.check(false, "could not read origin/main:index.html for the pixel check");

  await browser.close();
  R.done(`8 personal links, sheet in ${sheetViews} sizes and themes, Aron's device, 3 devices + offline + API down/503/hang, sunset, streak, all-read note, live statistics, ${pixels} pixel checks`);
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
