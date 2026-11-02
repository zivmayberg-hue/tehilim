// Offline: the page is served from a local web server (like GitHub Pages under /tehilim/), loaded once with the
// network, then the network is cut. The page, every language (?lang=…) and the psalms must still open. When a new
// version is published and the network is back, the next open shows the new version, never the old copy.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");
const { reporter, API_HOST, fakeApi, newCtx } = require("./lib");

const R = reporter("Offline: service worker keeps the page, updates load with the network");
const ROOT = path.join(__dirname, "..");
let version = "v1";
const page1 = () => fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace("<head>", `<head><meta name="test-version" content="${version}">`);
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const send = (type, body) => { res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=600" }); res.end(body); };
  if (u.pathname === "/tehilim/" || u.pathname === "/tehilim/index.html") return send("text/html; charset=utf-8", page1());
  if (u.pathname === "/tehilim/sw.js") return send("application/javascript", fs.readFileSync(path.join(ROOT, "sw.js")));
  if (u.pathname === "/tehilim/apple-touch-icon.png") return send("image/png", fs.readFileSync(path.join(ROOT, "apple-touch-icon.png")));
  res.writeHead(404); res.end();
});

(async () => {
  await new Promise(r => server.listen(0, "localhost", r));
  const BASE = `http://localhost:${server.address().port}/tehilim/`;
  const browser = await chromium.launch();
  const ctx = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: "Asia/Dubai", locale: "ru-RU" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const state = () => page.evaluate(() => ({ v: document.querySelector('meta[name="test-version"]')?.content, cards: document.querySelectorAll("#out .card").length,
    lang: document.documentElement.lang, h1: document.querySelector("h1").textContent }));

  // 1. First visit with the network: the service worker installs and takes over
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (let i = 0; i < 5 && !await page.evaluate(() => !!navigator.serviceWorker.controller); i++) await page.reload();
  R.check(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker does not control the page");
  R.check((await state()).v === "v1", "first visit");

  // 2. No network: the page, other languages and the psalms open
  await ctx.setOffline(true);
  for (const [q, lang, h1] of [["", "ru", "Теилим на сегодня"], ["?lang=he", "he", "תהילים להיום"], ["?lang=en", "en", "Tehillim for today"]]) {
    await page.goto(BASE + q);
    const s = await state();
    R.check(s.v === "v1" && s.cards === 12 && s.lang === lang && s.h1 === h1, `offline ${q || "plain"}: ${JSON.stringify(s)}`);
  }
  await (await page.$$("#out .card .open"))[0].click();
  await page.waitForSelector("#rinner .heb .v");
  R.check((await page.$$("#rinner .heb .v")).length > 5, "offline: psalm text missing");
  await page.click("#back");

  // 3. A new version is published; with the network back the next open shows it (not the old copy)
  version = "v2";
  await ctx.setOffline(false);
  await page.goto(BASE);
  R.check((await state()).v === "v2", `after an update: still ${(await state()).v}`);
  await ctx.setOffline(true);
  await page.goto(BASE + "?lang=en");
  R.check((await state()).v === "v2", "offline after the update: old copy");

  R.check(errors.length === 0, errors.join("; "));
  await browser.close();
  server.close();
  R.done("first visit, offline in 3 languages, reader, update after publishing");
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
