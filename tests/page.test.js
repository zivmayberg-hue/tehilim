// Page: open index.html in headless Chromium at iPhone and iPad sizes, light and dark, with the clock set to
// test dates in Dubai, Jerusalem and Bucharest. Clicks every button and checks: no errors, nothing scrolls
// sideways, chapters match Hebcal, iPad shows two columns, the reader shows Hebrew with nikud but no
// cantillation and keeps maqaf words together, and the sunset switch happens at the phone's own city.
// Also: the Shabbat card and holiday banners with the city name next to every time, "ваше время" for an unknown
// time zone, and ?date/time/tz working only on the preview site, never on the live address.
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const { H, loadPage, fixedFromDate, birthFixed, hebcalBirthday, hd, reporter } = require("./lib");

const R = reporter("Page in headless Chromium (iPhone/iPad, light/dark, 3 cities)");
const URL = "file://" + path.join(__dirname, "..", "index.html");
const P = loadPage();
const DEVICES = {
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  iPad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ZONES = ["Asia/Dubai", "Asia/Jerusalem", "Europe/Bucharest"];

// Local wall-clock time in a time zone -> UTC instant
function instant(tz, y, m, d, hh = 12, mm = 0) {
  let t = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
    const g = k => +p.find(x => x.type === k).value;
    t += Date.UTC(y, m - 1, d, hh, mm) - Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  }
  return new Date(t);
}
const ymd = hd => { const g = hd.greg(); return [g.getFullYear(), g.getMonth() + 1, g.getDate()]; };

// Test dates (local noon): Fridays, Rosh Chodesh Kislev, Rosh Hashana, Hanukkah, a fast, Purim, Aron's birthday, 3 days before Natalia's
const aron = P.PEOPLE.find(p => p.name === "Арон"), natalia = P.PEOPLE.find(p => p.name === "Наталья");
const nb = new H.HDate(hebcalBirthday(birthFixed(natalia), 5787));   // summer 2027
const DATES = {
  "Friday 2026-10-30": [2026, 10, 30],
  "Rosh Chodesh Kislev": ymd(new H.HDate(1, "Kislev", 5787)),
  "Rosh Hashana 5788": ymd(new H.HDate(1, "Tishrei", 5788)),
  "Aron's birthday": ymd(new H.HDate(hebcalBirthday(birthFixed(aron), 5787))),
  "3 days before Natalia's": ymd(new H.HDate(nb.abs() - 3)),
  "Hanukkah Friday": [2026, 12, 4],
  "10 Tevet": [2026, 12, 20],
  "Purim 2027": ymd(new H.HDate(14, "Adar II", 5787)),
  "Friday 2027-06-18": [2027, 6, 18],
};
const CITY = { "Asia/Dubai": "Дубай", "Asia/Jerusalem": "Герцлия", "Europe/Bucharest": "Бухарест" };
// What each date must show: text in the Shabbat card (null = no card) and in the banners ("" = no banners)
const EXPECT = {
  "Friday 2026-10-30": { shabbat: ["Шабат шалом!", "Недельная глава: Вайера"], banners: [] },
  "Rosh Chodesh Kislev": { shabbat: null, banners: [] },
  "Rosh Hashana 5788": { shabbat: ["Шабат шалом!", "В эту субботу праздничное чтение Торы."], banners: ["Рош а-Шана", "Начался 5788 год. Шана това!"] },   // a Saturday
  "Aron's birthday": { shabbat: null, banners: [] },
  "3 days before Natalia's": { shabbat: null, banners: [] },
  "Hanukkah Friday": { shabbat: ["Шабат шалом!", "Вайешев"], banners: ["Ханука", "Сегодня вечером зажигаем 1 свечу.",
    "Сначала зажигаем свечи Хануки, потом субботние.", "Открыть Псалом 30"] },
  "10 Tevet": { shabbat: null, banners: ["Пост 10 Тевета", "Сегодня пост.", "Начало поста", "Конец поста"] },
  "Purim 2027": { shabbat: null, banners: ["Пурим", "Пурим самеах!", "Открыть Псалом 22"] },
  "Friday 2027-06-18": { shabbat: ["Шабат шалом!"], banners: [], israel: "Недельная глава: Беаалотха", diaspora: "Недельная глава: Насо" },
};

async function newContext(browser, device, scheme, tz) {
  const ctx = await browser.newContext({ ...DEVICES[device], colorScheme: scheme, timezoneId: tz, locale: "ru-RU" });
  ctx.external = [];
  await ctx.route("**/*", route => {
    const u = route.request().url();
    if (u.startsWith("file:")) return route.continue();
    ctx.external.push(u);
    if (u.startsWith("https://fonts.googleapis.com/")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    return route.abort();
  });
  return ctx;
}
async function open(ctx, when, errors) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push("page error: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.clock.setFixedTime(when);
  await page.goto(URL);
  return page;
}
const noSideScroll = page => page.evaluate(() => {
  const els = [document.documentElement, document.body];
  if (!document.getElementById("reader").hidden) els.push(document.getElementById("rbody"));
  return els.every(e => e.scrollWidth <= e.clientWidth + 1);
});
const todayText = page => page.textContent("#today");

(async () => {
  const browser = await chromium.launch();
  let loads = 0, clicks = 0;
  for (const device of Object.keys(DEVICES)) for (const scheme of ["light", "dark"]) for (const tz of ZONES) {
    const ctx = await newContext(browser, device, scheme, tz);
    for (const [label, [y, m, d]] of Object.entries(DATES)) {
      const tag = `${device}/${scheme}/${tz}/${label}`, errors = [];
      const page = await open(ctx, instant(tz, y, m, d, 12), errors);
      loads++;

      // Hebrew date line and chapters agree with Hebcal for that (daytime) day
      const f = fixedFromDate(new Date(y, m - 1, d)), hdt = new H.HDate(new Date(y, m - 1, d));
      const t = await todayText(page), mt = t.match(/По еврейскому календарю (\d+) .+ (\d{4})\./);
      R.check(mt && +mt[1] === hdt.getDate() && +mt[2] === hdt.getFullYear() && !t.includes("после захода"), `${tag}: date line "${t}", Hebcal ${hdt}`);
      const chapters = await page.$$eval("#out .card .ps .n", els => els.map(e => +e.textContent));
      const expect = P.PEOPLE.map(p => {
        const bf = birthFixed(p); let hy = hdt.getFullYear();
        if (hebcalBirthday(bf, hy) > f) hy--;
        return Math.max(0, hy - hd(bf).getFullYear()) + 1;
      });
      R.check(JSON.stringify(chapters) === JSON.stringify(expect), `${tag}: chapters ${chapters} vs Hebcal ${expect}`);

      // Banners on special days
      const rcVisible = await page.isVisible("#rc"), rct = rcVisible ? await page.textContent("#rct") : "";
      if (label === "Rosh Chodesh Kislev") R.check(rct.startsWith("Сегодня Рош Ходеш Кислев"), `${tag}: Rosh Chodesh banner "${rct}"`);
      else R.check(!rcVisible, `${tag}: unexpected Rosh Chodesh banner "${rct}"`);
      const ex = EXPECT[label], city = CITY[tz];
      const shText = await page.isVisible("#shabbat") ? await page.textContent("#shabbat") : null;
      const bText = await page.textContent("#banners");
      if (ex.shabbat === null) R.check(shText === null, `${tag}: unexpected Shabbat card "${shText}"`);
      else {
        const want = [...ex.shabbat, ex.israel && (tz === "Asia/Jerusalem" ? ex.israel : ex.diaspora)].filter(Boolean);
        R.check(shText && want.every(w => shText.includes(w)), `${tag}: Shabbat card "${shText}" should contain ${want}`);
      }
      R.check(ex.banners.length ? ex.banners.every(w => bText.includes(w)) : bText === "", `${tag}: banners "${bText}" should contain ${ex.banners}`);
      // Every time on the page is a clean hh:mm with this city's name next to it; the date line names the city
      const tiles = await page.$$eval(".tile", els => els.map(e => [e.querySelector(".v").textContent, e.querySelector(".c").textContent]));
      R.check(tiles.every(([v, c]) => /^\d\d:\d\d$/.test(v) && c === city), `${tag}: time tiles ${JSON.stringify(tiles)}`);
      R.check(t.includes(`Город: ${city}.`), `${tag}: city missing in "${t}"`);
      if (label === "Aron's birthday") R.check((await page.textContent("#out")).includes("Сегодня день рождения!"), `${tag}: no birthday note`);
      if (label === "3 days before Natalia's") R.check((await page.textContent("#out")).includes("Через 3 дня день рождения"), `${tag}: no "in 3 days" note`);

      // Layout: two columns on iPad, one on iPhone; light/dark background
      const cols = await page.$eval("#out .list", e => getComputedStyle(e).gridTemplateColumns.split(" ").filter(Boolean).length);
      R.check(device === "iPad" ? cols === 2 : cols <= 1, `${tag}: ${cols} columns`);
      const lum = await page.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number);
        return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; });
      R.check(scheme === "dark" ? lum < 0.2 : lum > 0.8, `${tag}: background luminance ${lum.toFixed(2)} in ${scheme} mode`);
      R.check(await noSideScroll(page), `${tag}: page scrolls sideways`);

      // "Крупнее" toggles, and big text still fits
      await page.click("#bigger"); clicks++;
      R.check(await page.textContent("#biggerlabel") === "Обычный размер" && await page.$eval("body", b => b.classList.contains("big")), `${tag}: bigger button did not enlarge`);
      R.check(await noSideScroll(page), `${tag}: big text scrolls sideways`);

      // Every button that opens the reader: Hebrew text, no cantillation, maqaf joined, back closes it
      const opens = await page.$$("button.open:visible");
      for (let i = 0; i < opens.length; i++) {
        const b = (await page.$$("button.open:visible"))[i], name = (await b.textContent()).trim();
        await b.click(); clicks++;
        await page.waitForSelector("#rinner .heb .v");
        const r = await page.evaluate(() => { const s = document.getElementById("rinner").textContent;
          return { nikud: /[ְ-ּ]/.test(s), cant: /[֑-֯]/.test(s), maqaf: !/־(?!⁠)/.test(s), title: document.getElementById("rtitle").textContent }; });
        R.check(r.nikud && !r.cant && r.maqaf && r.title, `${tag}: reader for "${name}" ${JSON.stringify(r)}`);
        R.check(await noSideScroll(page), `${tag}: reader for "${name}" scrolls sideways`);
        await page.click("#back"); clicks++;
        R.check(await page.isHidden("#reader"), `${tag}: back did not close the reader`);
      }
      await page.click("#bigger"); clicks++;
      R.check(await page.textContent("#biggerlabel") === "Крупнее", `${tag}: bigger button did not switch back`);

      R.check(errors.length === 0, `${tag}: ${errors.join("; ")}`);
      await page.close();
    }
    R.check(ctx.external.every(u => u.startsWith("https://fonts.googleapis.com/")), `${device}/${scheme}/${tz}: unexpected requests ${ctx.external}`);
    await ctx.close();
  }

  // Sunset switch: at the phone's own city, 4 minutes before and after Hebcal's sunset. Another city's sunset must not switch it.
  const SUNSET_DATES = [[2026, 10, 30], [2027, 3, 21], [2027, 6, 18]];
  const sunsetAt = (tz, [y, m, d]) => {
    const [lat, lon] = P.CITIES[tz];
    return new H.Zmanim(new H.GeoLocation(null, lat, lon, 0, tz), new Date(y, m - 1, d), false).sunset();
  };
  for (const tz of ZONES) {
    const ctx = await newContext(browser, "iPhone", "light", tz);
    for (const date of SUNSET_DATES) {
      const ss = sunsetAt(tz, date), day = new H.HDate(new Date(date[0], date[1] - 1, date[2]));
      for (const [delta, evening] of [[-4, false], [4, true]]) {
        const errors = [], page = await open(ctx, new Date(ss.getTime() + delta * 60000), errors); loads++;
        const t = await todayText(page), n = +(t.match(/календарю (\d+) /) || [])[1];
        R.check(t.includes("после захода солнца") === evening && n === (evening ? day.next() : day).getDate(),
          `sunset ${tz} ${date.join("-")} ${delta > 0 ? "+" : ""}${delta} min: "${t}"`);
        R.check(errors.length === 0, `sunset ${tz}: ${errors.join("; ")}`);
        await page.close();
      }
      for (const other of ZONES) {                    // shortly after another city's earlier sunset: still daytime here
        const os = sunsetAt(other, date);
        if (os.getTime() + 4 * 60000 >= ss.getTime() - 4 * 60000) continue;
        const errors = [], page = await open(ctx, new Date(os.getTime() + 4 * 60000), errors); loads++;
        R.check(!(await todayText(page)).includes("после захода солнца"), `sunset: ${tz} switched at ${other}'s sunset on ${date.join("-")}`);
        await page.close();
      }
    }
    await ctx.close();
  }
  // Unknown time zone: times are labelled "ваше время" and no city is named
  {
    const ctx = await newContext(browser, "iPhone", "light", "Atlantic/Reykjavik"), errors = [];
    const page = await open(ctx, instant("Atlantic/Reykjavik", 2026, 10, 30, 12), errors); loads++;
    const tiles = await page.$$eval(".tile .c", els => els.map(e => e.textContent)), t = await todayText(page);
    R.check(tiles.length === 2 && tiles.every(c => c === "ваше время") && !t.includes("Город:"), `unknown zone: tiles ${tiles}, "${t}"`);
    R.check(errors.length === 0, `unknown zone: ${errors.join("; ")}`);
    await ctx.close();
  }

  // ?date&time&tz: honoured on the preview site, ignored on the live site
  {
    const ctx = await newContext(browser, "iPhone", "light", "Asia/Dubai");
    const html = require("fs").readFileSync(path.join(__dirname, "..", "index.html"));
    await ctx.route(/^https:\/\/zivmayberg-hue\.github\.io\//, route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
    const q = "?date=2026-12-04&time=19:00&tz=Asia/Jerusalem";
    for (const [site, honoured] of [["tehilim", false], ["tehilim-preview", true]]) {
      const errors = [], page = await open(ctx, instant("Asia/Dubai", 2026, 10, 27, 12), errors);
      await page.goto(`https://zivmayberg-hue.github.io/${site}/${q}`); loads++;
      const t = await todayText(page), b = await page.textContent("#banners");
      const ok = honoured ? t.includes("4 декабря") && t.includes("Город: Герцлия.") && b.includes("Ханука")
                          : t.includes("27 октября") && t.includes("Город: Дубай.") && b === "";
      R.check(ok, `${site}${q}: ${honoured ? "should" : "must not"} use the parameters: "${t}" banners "${b}"`);
      R.check(errors.length === 0, `${site}: ${errors.join("; ")}`);
      await page.close();
    }
    await ctx.close();
  }

  await browser.close();
  R.done(`${loads} page loads, ${clicks} clicks`);
})().catch(e => { console.error(e); process.exitCode = 1; });
