// Holidays and Rosh Chodesh: notify.js holidaysOn() must announce exactly the events Hebcal (diaspora)
// has, on the same Hebrew day, for every day from today to the end of 2036.
// Hebcal calls postponed fasts "... (observed)"; those count as matches.
"use strict";
const { H, notify, dateFromFixed, fixedFromDate, todayDubai, endOfYear, iso, reporter } = require("./lib");

const N = notify(), R = reporter("Holidays and Rosh Chodesh (notify.js vs Hebcal diaspora, to 2036)");
const start = todayDubai(), end = endOfYear(2036);

const RU_MONTH = { "Cheshvan": "Хешван", "Kislev": "Кислев", "Tevet": "Тевет", "Sh'vat": "Шват", "Adar": "Адар",
  "Adar I": "Адар I", "Adar II": "Адар II", "Nisan": "Нисан", "Iyyar": "Ияр", "Sivan": "Сиван", "Tamuz": "Тамуз",
  "Av": "Ав", "Elul": "Элул" };
// Hebcal description -> [key, day offset] (Chanukah: Hebcal lists the 1st candle on 24 Kislev; the holiday day is 25 Kislev)
const HEBCAL = { "Tzom Gedaliah": "gedalia", "Yom Kippur": "yk", "Sukkot I": "sukkot", "Shmini Atzeret": "shmini",
  "Chanukah: 1 Candle": "chanukah", "Asara B'Tevet": "tevet10", "Tu BiShvat": "tubishvat", "Ta'anit Esther": "esther",
  "Purim": "purim", "Pesach I": "pesach", "Lag BaOmer": "lag", "Shavuot I": "shavuot", "Tzom Tammuz": "tammuz17",
  "Tish'a B'Av": "av9" };
// notify.js text prefix -> key
const NOTIFY = [["Рош а-Шана", "rh"], ["пост Гедальи", "gedalia"], ["Йом Кипур", "yk"], ["Суккот", "sukkot"],
  ["Шмини Ацерет", "shmini"], ["Ханука", "chanukah"], ["пост 10 Тевета", "tevet10"], ["Ту би-Шват", "tubishvat"],
  ["пост Эстер", "esther"], ["Пурим", "purim"], ["Песах", "pesach"], ["Лаг ба-Омер", "lag"], ["Шавуот", "shavuot"],
  ["пост 17 Тамуза", "tammuz17"], ["Тиша бе-Ав", "av9"]];
const DAWN = new Set(["gedalia", "tevet10", "esther", "tammuz17"]);   // minor fasts start at dawn, everything else in the evening

// Expected, from Hebcal
const expected = new Set();
const evs = H.HebrewCalendar.calendar({ start: dateFromFixed(start - 3), end: dateFromFixed(end + 3), il: false,
  noModern: true, noSpecialShabbat: true });
const rcDays = new Map(), add = (k, f) => { if (f >= start && f <= end) expected.add(`${k}@${f}`); };
for (const e of evs) {
  const desc = e.getDesc().replace(/ \(observed\)$/, ""), f = fixedFromDate(e.getDate().greg());
  if (/^Rosh Hashana \d+$/.test(desc)) add("rh", f);
  else if (HEBCAL[desc]) add(HEBCAL[desc], f + (desc.startsWith("Chanukah") ? 1 : 0));
  else if (desc.startsWith("Rosh Chodesh ")) rcDays.set(f, RU_MONTH[desc.slice(13)] || "?" + desc);
}
for (const [f, m] of rcDays) if (rcDays.get(f - 1) !== m) add(`rc:${m}`, f);   // announced once, on its first day

// Actual, from notify.js
const actual = new Set();
for (let f = start; f <= end; f++) {
  for (const e of N.holidaysOn(f)) {
    let key;
    if (e.rc) { const m = e.text.match(/^Рош Ходеш (.+?)(?: \(два дня\))?\. /); key = "rc:" + (m ? m[1] : "?"); }
    else { const hit = NOTIFY.find(([p]) => e.text.startsWith(p)); key = hit ? hit[1] : "?" + e.text; }
    actual.add(`${key}@${f}`);
    if (!e.rc) R.check(e.start === (DAWN.has(key) ? "dawn" : "evening"), `${key} ${iso(f)}: starts at ${e.start}`);
  }
}
const show = k => { const [a, f] = k.split("@"); return `${a} ${iso(+f)}`; };
for (const k of expected) R.check(actual.has(k), `missing in notify.js: ${show(k)}`);
for (const k of actual) R.check(expected.has(k), `not in Hebcal: ${show(k)}`);
R.done(`${expected.size} events, ${iso(start)} to ${iso(end)}`);
