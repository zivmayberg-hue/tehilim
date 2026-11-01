// Languages: Russian (default), English, Hebrew.
// Data: every text key, city, family name, group and holiday exists in all three languages; holiday banners and
// upcoming-birthday lines for every day to 2036 contain no Russian in English and Hebrew.
// Browser (Chromium): each language at iPhone and iPad size, light and dark, normal and "Крупнее", on test dates:
// no Russian left in English and Hebrew, no sideways scrolling, the switch in the top right corner with 44 px
// buttons, Hebrew right to left (names on the right, back button on the right) with times kept left to right;
// the site opens in Russian whatever the phone's language, ?lang= and the switch choose and remember the language;
// the "Next" button walks through the family and the two daily readings, the last one goes back to the list; the screen stays awake only
// while a psalm is open.
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { loadPage, fixedFromDate, todayDubai, endOfYear, reporter } = require("./lib");

const P = loadPage(), R = reporter("Languages: Russian, English, Hebrew (data and Chromium)");
const URL = "file://" + path.join(__dirname, "..", "index.html");
const CYR = /[А-Яа-яЁё]/;

// ---------- data ----------
const keys = l => Object.keys(P.T[l]).sort().join();
R.check(keys("en") === keys("ru") && keys("he") === keys("ru"), "text keys differ between languages");
for (const l of ["en", "he"]) for (const [k, v] of Object.entries(P.T[l])) {
  const s = typeof v === "function" ? v(3, 12, false, "X") : typeof v === "object" ? Object.values(v).join() : v;
  R.check(!CYR.test(s), `${l}.${k}: Russian in "${s}"`);
}
const cities = new Set(Object.values(P.CITIES).map(c => c[2]));
for (const c of [...cities, "ваше время"]) R.check(P.CITY_NAMES[c] && P.CITY_NAMES[c].every(x => x && !CYR.test(x)), `city ${c}: no English or Hebrew name`);
R.check(Object.values(P.CITY_NAMES).every(([en, he]) => /^[A-Za-zÀ-ÿ .'-]+$/.test(en) && /^[\u05D0-\u05EA ׳"״'-]+$/.test(he)), "a city name is in the wrong script");
for (const p of P.PEOPLE) R.check(/^[A-Za-z -]+$/.test(p.en || "") && /^[\u05D0-\u05EA -]+$/.test(p.he || ""), `${p.name}: English or Hebrew name missing`);
for (const g of new Set(P.PEOPLE.map(p => p.group))) R.check(P.GROUP_NAMES[g], `group ${g}: not translated`);
for (const s of P.holidaySpans(5787)) R.check(P.HOLIDAY_NAMES[s.key], `holiday ${s.key}: not translated`);
R.check(P.gem(21) === "כ״א" && P.gem(10) === "י׳" && P.gem(787) === "תשפ״ז" && P.gem(15) === "ט״ו", "Hebrew numerals");
let bannerDays = 0;
for (let f = todayDubai(), end = endOfYear(2036); f <= end; f++) for (const l of ["en", "he"]) {
  const noon = new Date((f - 719163) * 86400000 + 8 * 3600000);
  for (const b of P.bannersAt(f, noon, P.place("Asia/Jerusalem"), l)) {
    bannerDays++;
    const s = [b.title, ...b.lines, ...b.tiles.map(t => t.label)].join(" | ");
    R.check(!CYR.test(s) && !s.includes("undefined"), `${l} banner ${f}: "${s}"`);
  }
  for (const u of P.upcomingBirthdays(f, 3)) { const x = P.upcomingText(u, f, l); R.check(!CYR.test(x.hebrew + x.when), `${l} upcoming: ${x.hebrew} ${x.when}`); }
}

// ---------- browser ----------
const DEVICES = {
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iPad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DATES = { "Hanukkah Friday": "2026-12-04T10:00:00Z", "10 Tevet": "2026-12-20T08:00:00Z", "Rosh Chodesh Kislev": "2026-11-11T08:00:00Z",
  "Purim 2027": "2027-03-23T08:00:00Z", "before Natalia's birthday": "2027-07-20T08:00:00Z" };
async function newContext(browser, opts = {}) {
  const ctx = await browser.newContext({ ...DEVICES[opts.device || "iPhone"], colorScheme: opts.scheme || "light", timezoneId: "Asia/Jerusalem", locale: opts.locale || "ru-RU" });
  await ctx.route("**/*", r => { const u = r.request().url();
    if (u.startsWith("file:")) return r.continue();
    if (u.startsWith("https://fonts.googleapis.com/")) return r.fulfill({ status: 200, contentType: "text/css", body: "" });
    return r.abort(); });
  await ctx.addInitScript(() => {                    // a stand-in for the Wake Lock API that records what the page does
    window.__wake = [];
    Object.defineProperty(navigator, "wakeLock", { value: { request: async type => {
      window.__wake.push("request:" + type);
      const s = new EventTarget(); s.release = async () => { window.__wake.push("release"); s.dispatchEvent(new Event("release")); }; return s;
    } } });
  });
  return ctx;
}
async function open(ctx, query, when, errors) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("page error: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.clock.setFixedTime(new Date(when));
  await page.goto(URL + query);
  return page;
}
const noSideScroll = page => page.evaluate(() => [document.documentElement, document.body, document.getElementById("rbody")]
  .every(e => e.scrollWidth <= e.clientWidth + 1));
const box = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height }; });

(async () => {
  const browser = await chromium.launch();
  let loads = 0;
  for (const lang of ["ru", "en", "he"]) for (const device of ["iPhone", "iPad"]) for (const scheme of ["light", "dark"]) for (const big of [false, true]) {
    const ctx = await newContext(browser, { device, scheme });
    for (const [label, when] of Object.entries(DATES)) {
      const tag = `${lang}/${device}/${scheme}/${big ? "big" : "normal"}/${label}`, errors = [];
      const page = await open(ctx, `?lang=${lang}`, when, errors);
      loads++;
      if (big !== await page.evaluate(() => document.body.classList.contains("big"))) await page.click("#bigger");
      const doc = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, text: document.body.innerText, vw: innerWidth }));
      R.check(doc.lang === lang && doc.dir === (lang === "he" ? "rtl" : "ltr"), `${tag}: lang ${doc.lang}, dir ${doc.dir}`);
      if (lang !== "ru") R.check(!CYR.test(doc.text), `${tag}: Russian left: ${(doc.text.match(/[^\n]*[А-Яа-яЁё][^\n]*/) || [""])[0]}`);
      R.check(!doc.text.includes("undefined") && !doc.text.includes("NaN"), `${tag}: undefined or NaN on the page`);
      R.check(await noSideScroll(page), `${tag}: sideways scrolling`);
      // the switch: top right corner, three buttons of at least 44 px, the current language pressed
      const sw = await box(page, "#langs"), btns = await page.$$eval("#langs button", bs => bs.map(b => { const r = b.getBoundingClientRect(); return [b.dataset.lang, r.width, r.height, b.getAttribute("aria-pressed")]; }));
      R.check(doc.vw - sw.r < 40 && sw.l > doc.vw / 2, `${tag}: switch not in the top right corner (${sw.l}-${sw.r} of ${doc.vw})`);
      R.check(btns.length === 3 && btns.every(([l, w, h, p]) => w >= 44 && h >= 44 && (p === "true") === (l === lang)), `${tag}: switch buttons ${JSON.stringify(btns)}`);
      // times stay left to right; in Hebrew the name is on the right of the psalm number, otherwise on the left
      const tiles = await page.$$eval(".tile .v", vs => vs.map(v => [v.textContent, getComputedStyle(v).direction]));
      R.check(tiles.every(([t, d]) => /^\d\d:\d\d$/.test(t) && d === "ltr"), `${tag}: times ${JSON.stringify(tiles)}`);
      const nm = await box(page, "#out .card .name"), ps = await box(page, "#out .card .ps");
      R.check(lang === "he" ? nm.l > ps.r : nm.r < ps.l, `${tag}: card not ${lang === "he" ? "mirrored" : "left to right"}`);
      if (device === "iPad") R.check(await page.$$eval("#out .list", ls => getComputedStyle(ls[0]).gridTemplateColumns.split(" ").length) === 2, `${tag}: iPad not two columns`);
      // the reader: back button on the reading side, Next walks the family, the screen stays awake only while open
      if (label === "Hanukkah Friday") {
        const cards = await page.$$("#out .card .open"), names = await page.$$eval("#out .card .name", ns => ns.map(n => n.textContent));
        await cards[0].click(); await page.waitForSelector("#rinner .nextbtn");
        const bk = await box(page, "#back");
        R.check(lang === "he" ? bk.l > doc.vw / 2 : bk.r < doc.vw / 2, `${tag}: back button on the wrong side`);
        R.check(await noSideScroll(page), `${tag}: reader scrolls sideways`);
        const t0 = await page.textContent("#rtitle");
        R.check(t0.includes(names[0]) && (await page.textContent("#rinner .nextbtn")).includes(names[1]), `${tag}: Next button "${await page.textContent("#rinner .nextbtn")}"`);
        await page.click("#rinner .nextbtn"); await page.waitForFunction(t => document.getElementById("rtitle").textContent !== t, t0);
        R.check((await page.textContent("#rtitle")).includes(names[1]), `${tag}: Next opened "${await page.textContent("#rtitle")}"`);
        R.check(JSON.stringify(await page.evaluate(() => window.__wake)) === JSON.stringify(["request:screen"]), `${tag}: wake lock ${await page.evaluate(() => window.__wake)}`);
        await page.click("#back");
        R.check(JSON.stringify(await page.evaluate(() => window.__wake)) === JSON.stringify(["request:screen", "release"]), `${tag}: wake lock not released`);
        const last = await page.$$("#out .card .open");
        await last[last.length - 1].click(); await page.waitForSelector("#rinner .nextbtn");
        // after the family: the reading by day of the month, then by day of the week, then back to the list
        const NEXT = { ru: ["По дню месяца", "По дню недели"], en: ["Monthly cycle", "Weekly cycle"], he: ["לפי יום בחודש", "לפי יום בשבוע"] }[lang];
        for (const want of NEXT) {
          const nt = await page.textContent("#rinner .nextbtn");
          R.check(nt.includes(want), `${tag}: Next "${nt}", expected ${want}`);
          await page.click("#rinner .nextbtn"); await page.waitForFunction(w => document.getElementById("rtitle").textContent.startsWith(w), want);
          await page.waitForSelector("#rinner .nextbtn");
        }
        R.check(await page.textContent("#rinner .nextbtn") === ({ ru: "Назад к списку", en: "Back to the list", he: "חזרה לרשימה" })[lang], `${tag}: last Next "${await page.textContent("#rinner .nextbtn")}"`);
        await page.click("#rinner .nextbtn");
        R.check(await page.isHidden("#reader"), `${tag}: "Back to the list" did not close the reader`);
      }
      R.check(errors.length === 0, `${tag}: ${errors.join("; ")}`);
      await page.close();
    }
    await ctx.close();
  }

  // Default Russian whatever the phone's language; ?lang and the switch choose and remember
  for (const locale of ["en-US", "he-IL"]) {
    const ctx = await newContext(browser, { locale }), errors = [];
    let page = await open(ctx, "", DATES["10 Tevet"], errors);
    R.check(await page.evaluate(() => document.documentElement.lang) === "ru" && (await page.textContent("h1")) === "Теилим на сегодня", `${locale} phone: not Russian`);
    await page.click('#langs button[data-lang="en"]');
    R.check((await page.textContent("h1")) === "Tehillim for today", `${locale}: switch to English`);
    await page.reload();
    R.check((await page.textContent("h1")) === "Tehillim for today", `${locale}: English not remembered`);
    await page.goto(URL + "?lang=he");
    R.check(await page.evaluate(() => document.documentElement.dir) === "rtl", `${locale}: ?lang=he`);
    await page.goto(URL);
    R.check(await page.evaluate(() => document.documentElement.lang) === "he", `${locale}: ?lang=he not remembered`);
    await page.click('#langs button[data-lang="ru"]');
    R.check(await page.evaluate(() => document.documentElement.lang) === "ru" && (await page.textContent("h1")) === "Теилим на сегодня", `${locale}: back to Russian`);
    await page.goto(URL + "?lang=xx");
    R.check(await page.evaluate(() => document.documentElement.lang) === "ru", `${locale}: unknown ?lang changed the language`);
    R.check(errors.length === 0, `${locale}: ${errors.join("; ")}`);
    await ctx.close();
  }
  // Without storage the page still works and shows the chosen language for the visit
  {
    const ctx = await newContext(browser), errors = [];
    await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("no storage"); } }); });
    const page = await open(ctx, "?lang=en", DATES["10 Tevet"], errors);
    R.check((await page.textContent("h1")) === "Tehillim for today" && errors.length === 0, `no storage: ${errors.join("; ")}`);
    await ctx.close();
  }
  await browser.close();
  R.done(`${loads} page loads in 3 languages, ${bannerDays} banner-days translated`);
})().catch(e => { console.error(e); process.exit(1); });   // exit even if a browser is still open
