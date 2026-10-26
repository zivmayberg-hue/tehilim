// City list on the page (CITIES in index.html): every time zone is real, has a Russian city name, and coordinates
// that fit the zone (longitude close to the UTC offset, sunset at a normal local evening hour all year).
// Asia/Jerusalem stays Herzliya; the list covers the main regions of the world.
"use strict";
const { loadPage, fixedFromDate, reporter } = require("./lib");

const P = loadPage(), R = reporter("City list (time zones, Russian names, coordinates)");
const zones = Object.keys(P.CITIES);
const offsetH = (tz, d) => {                         // UTC offset in hours on date d
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric",
    day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(d).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 3600000;
};
const localHour = (tz, d) => +new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric" }).format(d);

for (const tz of zones) {
  const [lat, lon, name] = P.CITIES[tz];
  let valid = true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch (e) { valid = false; }
  R.check(valid, `${tz}: not a time zone this browser engine knows`);
  if (!valid) continue;
  R.check(/^[А-ЯЁ][А-Яа-яЁё -]+$/.test(name), `${tz}: city name "${name}" is not Russian`);
  R.check(Math.abs(lat) < 66 && Math.abs(lon) <= 180, `${tz}: coordinates ${lat}, ${lon} out of range`);
  const std = Math.min(offsetH(tz, new Date(Date.UTC(2027, 0, 15))), offsetH(tz, new Date(Date.UTC(2027, 6, 15))));
  R.check(Math.abs(lon / 15 - std) <= 3, `${tz}: longitude ${lon} far from UTC offset ${std}h`);
  const pl = P.place(tz);
  for (const [m, d] of [[0, 15], [3, 15], [6, 15], [9, 15]]) {
    const ss = P.sunsetOn(fixedFromDate(new Date(2027, m, d)), pl), h = localHour(tz, ss);
    R.check(h >= 15 && h <= 23, `${tz}: sunset at ${h}:xx local on 2027-${m + 1}-${d}`);
  }
}
R.check(P.CITIES["Asia/Jerusalem"][2] === "Герцлия" && P.ISRAEL_ZONES.has("Asia/Jerusalem"), "Asia/Jerusalem must be Herzliya and use the Israel schedule");
for (const region of ["Europe/", "Asia/", "America/", "Africa/", "Australia/", "Pacific/"])
  R.check(zones.filter(z => z.startsWith(region)).length >= 5, `fewer than 5 zones in ${region}`);
R.done(`${zones.length} time zones, ${new Set(zones.map(z => P.CITIES[z][2])).size} cities`);
