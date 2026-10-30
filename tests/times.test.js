// Times on the page: Shabbat candle lighting (18 min before sunset) and havdalah (8.5°), for Dubai, Herzliya and
// Bucharest, every week from today to the end of 2036, compared with @hebcal/core. The page shows hours:minutes,
// so the shown minute must match Hebcal's. Fasts follow chabad.org, computed with Hebcal's Zmanim: minor fasts
// from dawn (16.9°, minute rounded down), Tisha B'Av and Yom Kippur from sunset the evening before; end at
// nightfall (6°, minute rounded up), Yom Kippur at the end of Yom Tov (8.5°).
"use strict";
const { H, loadPage, fixedFromDate, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Shabbat and fast times (page vs Hebcal, to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const ZONES = ["Asia/Dubai", "Asia/Jerusalem", "Europe/Bucharest"];
const FASTS = new Set(["gedalia", "tevet10", "esther", "tammuz17", "av9", "yk"]);
const floorMin = d => new Date(Math.floor(d / 60000) * 60000), ceilMin = d => new Date(Math.ceil(Math.floor(d / 1000) / 60) * 60000);
const shown = (d, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Math.round(Math.floor(d / 1000) / 60) * 60000));   // whole seconds, then nearest minute, like the page and Hebcal

let compared = 0, boundary = 0, fasts = 0;
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
  const zm = f => new H.Zmanim(new H.GeoLocation(null, pl.lat, pl.lon, 0, tz), dateFromFixed(f), false);
  const fastCmp = (what, s, page, want) => {          // a whole-minute time that must equal Hebcal's, allowing 2 s at the minute edge
    fasts++;
    if (shown(page, tz) === shown(want.t, tz)) return R.check(true);
    const sec = Math.floor(want.exact / 1000) % 60, edge = (sec <= 2 || sec >= 58) && Math.abs(page - want.t) <= 60000;
    if (edge) boundary++;
    R.check(edge, `${tz} ${iso(s.f0)} ${s.key} ${what}: page ${shown(page, tz)}, Hebcal ${shown(want.t, tz)}`);
  };
  for (let y = hy0; y <= hy1; y++) for (const s of P.holidaySpans(y)) {
    if (!FASTS.has(s.key) || s.f0 < start + 1 || s.f0 > end) continue;
    const t = P.spanTimes(s, pl);
    const st = s.start === "dawn" ? zm(s.f0).timeAtAngle(16.9, true) : zm(s.f0 - 1).sunset();
    const en = s.key === "yk" ? zm(s.f0).tzeit(8.5) : zm(s.f0).tzeit(6);
    fastCmp("start", s, t.fastStart, { exact: st, t: s.start === "dawn" ? floorMin(st) : st });
    fastCmp("end", s, t.end, { exact: en, t: s.key === "yk" ? en : ceilMin(en) });
  }
}
R.done(`${compared} Shabbat times and ${fasts} fast times compared in ${ZONES.length} cities, ${boundary} at a rounding boundary`);
