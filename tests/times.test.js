// Times on the page: Shabbat candle lighting (18 min before sunset) and havdalah (8.5°), and fast start
// (dawn, 16.1°) and end (7.083°), for Dubai, Herzliya and Bucharest, every week from today to the end of 2036,
// compared with @hebcal/core. The page shows hours:minutes, so the shown minute must match Hebcal's.
"use strict";
const { H, loadPage, fixedFromDate, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Shabbat and fast times (page vs Hebcal, to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const ZONES = ["Asia/Dubai", "Asia/Jerusalem", "Europe/Bucharest"];
const FASTS = new Set(["gedalia", "tevet10", "esther", "tammuz17", "av9"]);
const shown = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Math.round(Math.floor(d / 1000) / 60) * 60000));   // whole seconds, then nearest minute, like the page and Hebcal

let compared = 0, boundary = 0;
for (const tz of ZONES) {
  const pl = P.place(tz);
  const loc = new H.Location(pl.lat, pl.lon, pl.israel, tz, pl.name, pl.israel ? "IL" : "XX");
  const evs = H.HebrewCalendar.calendar({ start: dateFromFixed(start), end: dateFromFixed(end), location: loc, il: false,
    candlelighting: true, candleLightingMins: 18, havdalahDeg: 8.5 });
  const hebcal = new Map();                          // "kind@civil day" -> Date
  for (const e of evs) if (e.eventTime) hebcal.set(`${e.getDesc()}@${fixedFromDate(e.getDate().greg())}`, e.eventTime);
  const cmp = (kind, f, pageTime) => {
    const h = hebcal.get(`${kind}@${f}`);
    if (!h) return;
    compared++;
    if (shown(pageTime, tz) === shown(h, tz)) return R.check(true);
    // Hebcal occasionally rounds the other way when the true time is right at hh:mm:30; allow that, and count it.
    const s = (pageTime / 1000) % 60, edge = Math.abs(s - 30) <= 2 && Math.abs(pageTime - h) <= 60000;
    if (edge) boundary++;
    R.check(edge, `${tz} ${iso(f)} ${kind}: page ${shown(pageTime, tz)}, Hebcal ${shown(h, tz)}`);
  };
  for (let f = start; f <= end; f++) {
    if (dateFromFixed(f).getDay() === 5) cmp("Candle lighting", f, P.candlesOn(f, pl));
    if (dateFromFixed(f).getDay() === 6) cmp("Havdalah", f, P.havdalahOn(f, pl));
  }
  const hy0 = new H.HDate(dateFromFixed(start)).getFullYear(), hy1 = new H.HDate(dateFromFixed(end)).getFullYear();
  for (let y = hy0; y <= hy1; y++) for (const s of P.holidaySpans(y)) {
    if (!FASTS.has(s.key) || s.f0 < start + 1 || s.f0 > end) continue;
    const t = P.spanTimes(s, pl);
    cmp("Fast begins", s.key === "av9" ? s.f0 - 1 : s.f0, t.start);
    cmp("Fast ends", s.f0, t.end);
  }
}
R.done(`${compared} times compared in ${ZONES.length} cities, ${boundary} at the half-minute boundary`);
