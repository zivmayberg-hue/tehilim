// The page's times against chabad.org itself: tests/fixtures/chabad-zmanim.csv holds the times chabad.org's own city
// pages showed for the five reminder cities around Hanukkah 5787 and every fast of 5787 (fetched 2026-10-31). Dawn
// (16.9°, rounded down), sunset, nightfall (6°, rounded up), the end of Shabbat and Yom Tov (8.5°) and candle lighting
// (18 minutes before sunset, 30 in Herzliya) must show the same minute, with notify.js's coordinates (chabad.org's).
"use strict";
const fs = require("fs");
const path = require("path");
const { loadPage, fixedFromDate, reporter } = require("./lib");

const P = loadPage(), R = reporter("Fast and Hanukkah times vs chabad.org (5787)");
const CITY = { Dubai: "Asia/Dubai", Herzliya: "Asia/Jerusalem", Bucharest: "Europe/Bucharest", Kyiv: "Europe/Kiev", Chernivtsi: "Europe/Kiev" };
const COORDS = { Dubai: [25.2167, 55.2833], Herzliya: [32.1649, 34.8442, 30], Bucharest: [44.4333, 26.1],   // as in notify.js
  Kyiv: [50.4667, 30.4833], Chernivtsi: [48.3, 25.9333] };
const shown = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  .format(new Date(Math.round(Math.floor(d / 1000) / 60) * 60000));

let rows = 0;
for (const line of fs.readFileSync(path.join(__dirname, "fixtures", "chabad-zmanim.csv"), "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const [city, date, dawn, sunset, night, ends, candles] = line.split(","), tz = CITY[city];
  const [m, d, y] = date.split("/").map(Number), f = fixedFromDate(new Date(y, m - 1, d));
  const pl = { lat: COORDS[city][0], lon: COORDS[city][1], candleMins: COORDS[city][2] };
  const want = { dawn: [P.dawnOn(f, pl), dawn], sunset: [P.sunsetOn(f, pl), sunset], nightfall: [P.fastEndOn(f, pl), night], "Shabbat ends": [P.havdalahOn(f, pl), ends],
    candles: [P.candlesOn(f, pl), candles] };
  for (const [what, [page, chabad]] of Object.entries(want)) if (chabad)
    R.check(shown(page, tz) === chabad, `${city} ${date} ${what}: page ${shown(page, tz)}, chabad.org ${chabad}`);
  rows++;
}
R.check(rows === 120, `fixture rows ${rows}`);
// The page's own Herzliya (Asia/Jerusalem) uses chabad.org's 30 minutes too
R.check(P.place("Asia/Jerusalem").candleMins === 30 && P.place("Asia/Dubai").candleMins === 18, "candle minutes by time zone");
R.done(`${rows} days in 5 cities`);
