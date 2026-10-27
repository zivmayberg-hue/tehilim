// Umami statistics in headless Chromium, with a stand-in for cloud.umami.is (nothing is sent anywhere):
// the script loads, with auto-tracking off, only on the live address without ?date/?time/?tz; one page view per
// open; "read" for each tick (not for undo), "psalm" with the chapter, "all" for the all-psalms view, each with the
// time zone; never on the preview or with ?date; ?stats=off / ?stats=on per device; the page works the same when
// Umami is blocked or slow.
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { reporter } = require("./lib");

const R = reporter("Statistics (Umami) on the live address only");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"));
const LIVE = "https://zivmayberg-hue.github.io/tehilim/", PREVIEW = "https://zivmayberg-hue.github.io/tehilim-preview/";
const FAKE_UMAMI = `window.__umami = window.__umami || [];
  window.__umamiAttrs = {id: document.currentScript.getAttribute("data-website-id"), auto: document.currentScript.getAttribute("data-auto-track")};
  window.umami = {track: (...a) => window.__umami.push(JSON.parse(JSON.stringify(a)))};`;
const WHEN = new Date("2026-10-27T08:00:00Z");      // 12:00 in Dubai

async function newContext(browser, umami = "ok") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Dubai", locale: "ru-RU" });
  ctx.umamiRequests = 0;
  await ctx.route("**/*", async route => {
    const u = route.request().url();
    if (u.startsWith("file:")) return route.continue();
    if (u.startsWith("https://cloud.umami.is/")) {
      ctx.umamiRequests++;
      if (umami === "blocked") return route.abort();
      if (umami === "slow") await new Promise(r => setTimeout(r, 4000));
      return route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_UMAMI });
    }
    if (u.startsWith("https://fonts.googleapis.com/")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    if (u.startsWith("https://zivmayberg-hue.github.io/")) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HTML });
    return route.abort();
  });
  return ctx;
}
async function open(ctx, url, errors) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("page error: " + e.message));
  await page.clock.setFixedTime(WHEN);
  await page.goto(url);
  return page;
}
const events = page => page.evaluate(() => window.__umami || null);
const settle = page => page.waitForTimeout(300);

(async () => {
  const browser = await chromium.launch();

  // Live: page view once, then read / psalm / all with the time zone
  {
    const ctx = await newContext(browser), errors = [], page = await open(ctx, LIVE, errors);
    await page.waitForFunction(() => window.__umami && window.__umami.length >= 1);
    R.check(ctx.umamiRequests === 1, `live: script requested ${ctx.umamiRequests} times`);
    const attrs = await page.evaluate(() => window.__umamiAttrs);
    R.check(attrs.id === "deea2162-7faf-4852-80f9-dd5d77e49baa" && attrs.auto === "false", `live: script attributes ${JSON.stringify(attrs)}`);
    R.check(JSON.stringify(await events(page)) === "[[]]", `live: one page view ${JSON.stringify(await events(page))}`);
    await (await page.$$("#out .card .tick"))[0].click(); await settle(page);
    await (await page.$$("#out .card .tick"))[0].click(); await settle(page);   // undo: no event
    const ch = +(await page.textContent("#out .card .ps .n"));
    await (await page.$$("#out .card .open"))[0].click(); await page.waitForSelector("#rinner .readbtn"); await page.click("#back");
    await page.click("#openall"); await page.waitForSelector("#rinner .readbtn");
    await (await page.$$("#rinner .readbtn"))[1].click(); await settle(page);
    const want = [[], ["read", { tz: "Asia/Dubai" }], ["psalm", { tz: "Asia/Dubai", chapter: ch }], ["all", { tz: "Asia/Dubai" }], ["read", { tz: "Asia/Dubai" }]];
    R.check(JSON.stringify(await events(page)) === JSON.stringify(want), `live events ${JSON.stringify(await events(page))}, expected ${JSON.stringify(want)}`);
    R.check(errors.length === 0, `live: ${errors.join("; ")}`);
    await ctx.close();
  }

  // Never on the preview, never with ?date/?time/?tz, never from a file
  for (const url of [PREVIEW, PREVIEW + "?date=2026-12-04&time=19:00&tz=Asia/Jerusalem", LIVE + "?date=2026-12-04", LIVE + "?time=19:00",
                     LIVE + "?tz=Asia/Jerusalem", "file://" + path.join(__dirname, "..", "index.html")]) {
    const ctx = await newContext(browser), errors = [], page = await open(ctx, url, errors);
    await (await page.$$("#out .card .tick"))[0].click();
    await (await page.$$("#out .card .open"))[0].click(); await page.waitForSelector("#rinner .readbtn"); await page.click("#back");
    await page.waitForTimeout(500);
    R.check(ctx.umamiRequests === 0 && await events(page) === null && await page.evaluate(() => typeof window.umami) === "undefined",
      `${url}: statistics must not load (requests ${ctx.umamiRequests})`);
    R.check(errors.length === 0, `${url}: ${errors.join("; ")}`);
    await ctx.close();
  }

  // ?stats=off turns statistics off on this device until ?stats=on
  {
    const ctx = await newContext(browser), errors = [];
    let page = await open(ctx, LIVE + "?stats=off", errors); await page.waitForTimeout(500);
    R.check(ctx.umamiRequests === 0, "?stats=off: script loaded");
    page = await open(ctx, LIVE, errors); await page.waitForTimeout(500);
    R.check(ctx.umamiRequests === 0, "after ?stats=off, a plain visit still loads the script");
    page = await open(ctx, LIVE + "?stats=on", errors);
    await page.waitForFunction(() => window.__umami && window.__umami.length >= 1);
    R.check(ctx.umamiRequests === 1 && JSON.stringify(await events(page)) === "[[]]", "?stats=on: statistics back with one page view");
    R.check(errors.length === 0, `stats switch: ${errors.join("; ")}`);
    await ctx.close();
  }

  // Umami blocked: everything works, no page errors
  {
    const ctx = await newContext(browser, "blocked"), errors = [], page = await open(ctx, LIVE, errors);
    await (await page.$$("#out .card .tick"))[0].click();
    await (await page.$$("#out .card .open"))[1].click(); await page.waitForSelector("#rinner .readbtn"); await page.click("#rinner .readbtn");
    await page.click("#openall"); await page.waitForSelector("#rinner .readbtn"); await page.click("#back");
    R.check(await page.textContent("#progress") === "Прочитано 2 из 12" && ctx.umamiRequests === 1, `blocked: "${await page.textContent("#progress")}"`);
    R.check(errors.length === 0, `blocked: ${errors.join("; ")}`);
    await ctx.close();
  }

  // Umami slow: the page is ready at once; a tick made before the script arrives is sent after the page view
  {
    const ctx = await newContext(browser, "slow"), errors = [], page = await open(ctx, LIVE, errors);
    R.check(await page.textContent("#progress") === "Прочитано 0 из 12" && (await page.$$("#out .card")).length === 12, "slow: page not ready before Umami");
    await (await page.$$("#out .card .tick"))[2].click();
    R.check(await page.textContent("#progress") === "Прочитано 1 из 12", "slow: tick does not work before Umami loads");
    await page.waitForFunction(() => window.__umami && window.__umami.length >= 2, null, { timeout: 15000 });
    R.check(JSON.stringify(await events(page)) === JSON.stringify([[], ["read", { tz: "Asia/Dubai" }]]), `slow: events ${JSON.stringify(await events(page))}`);
    R.check(errors.length === 0, `slow: ${errors.join("; ")}`);
    await ctx.close();
  }

  await browser.close();
  R.done("live, preview, ?date/time/tz, file, ?stats=off/on, blocked, slow");
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
