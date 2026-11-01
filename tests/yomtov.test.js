// Yom Tov candle lighting in the morning messages, every Yom Tov night to 2036 (first and second days of Rosh Hashana,
// Sukkot, Shemini Atzeret and Simchat Torah, Pesach and its 7th and 8th days, Shavuot), as on chabad.org:
// - the first night 18 minutes before sunset (Herzliya 30), the second night and a night after Shabbat "after" the
//   end time (8.5°) from an existing flame, a Friday night before sunset with the time in the Shabbat block;
//   Herzliya: no second day in Israel except Rosh Hashana;
// - the times equal chabad.org's own (tests/fixtures/chabad-yomtov.csv, five cities, 2026 to 2028) and Hebcal;
// - each night announced once, in the message of the last morning before it.
"use strict";
const fs = require("fs");
const path = require("path");
const { H, notify, fixedFromDate, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const N = notify(), C = N.C, R = reporter("Yom Tov candle lighting in the messages (chabad.org, to 2036)");
const CITIES = { Dubai: ["Дубай", 25.2167, 55.2833, "Asia/Dubai", 18], Herzliya: ["Герцлия", 32.1649, 34.8442, "Asia/Jerusalem", 30],
  Bucharest: ["Бухарест", 44.4333, 26.1, "Europe/Bucharest", 18], Kyiv: ["Киев", 50.4667, 30.4833, "Europe/Kiev", 18],
  Chernivtsi: ["Черновцы", 48.3, 25.9333, "Europe/Kiev", 18] };
const P = c => ({ lat: c[1], lon: c[2], candleMins: c[4] });
const hhmm = (t, tz) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Math.round(Math.floor(t / 1000) / 60) * 60000));

// 1. chabad.org's own times
let rows = 0;
for (const l of fs.readFileSync(path.join(__dirname, "fixtures", "chabad-yomtov.csv"), "utf8").split("\n")) {
  if (!l || l.startsWith("#")) continue;
  const [city, date, kind, want] = l.split(","), c = CITIES[city], [m, d, y] = date.split("/").map(Number), f = fixedFromDate(new Date(y, m - 1, d));
  const t = kind === "candles" ? C.candlesOn(f, P(c)) : C.havdalahOn(f, P(c));
  R.check(hhmm(t.getTime(), c[3]) === want, `${city} ${date} ${kind}: ${hhmm(t.getTime(), c[3])}, chabad.org ${want}`);
  rows++;
}

// 2. every Yom Tov night to 2036 in the messages
const NIGHTS = [[7, 1, "Рош а-Шана", true], [7, 2, "Второй день Рош а-Шана", true], [7, 15, "Суккот", true], [7, 16, "Второй день Суккот", false],
  [7, 22, "Шмини Ацерет", true], [7, 23, "Симхат Тора", false], [1, 15, "Песах", true], [1, 16, "Второй день Песаха", false],
  [1, 21, "Седьмой день Песаха", true], [1, 22, "Восьмой день Песаха", false], [3, 6, "Шавуот", true], [3, 7, "Второй день Шавуот", false]];
const start = todayDubai(), end = endOfYear(2036), noPost = f => N.isNoPostDay(f);
const zm = (f, c) => new H.Zmanim(new H.GeoLocation(null, c[1], c[2], 0, c[3]), dateFromFixed(f), false);
let nights = 0;
const changed = new Map();
for (let hy = C.hebrewFromFixed(start).y; hy <= C.hebrewFromFixed(end).y; hy++) for (const [m, d, name, il] of NIGHTS) {
  const f = C.fixedFromHebrew(hy, m, d), eve = f - 1;
  if (eve - 10 < start || f > end) continue;
  let mornings = [];
  for (let k = eve - 6; k <= eve; k++) { const msg = N.buildMessage(k); if (msg && msg.text.includes(`начинается ${name}`) && msg.events.some(e => e.f === f && e.yt)) mornings.push(k); }
  R.check(mornings.length === 1, `${name} ${iso(eve)}: announced ${mornings.length} times`);
  if (!mornings.length) continue;
  const text = N.buildMessage(mornings[0]).text, block = text.slice(text.indexOf(`начинается ${name}`));
  const lines = block.split("\n").slice(1, 7);
  if (N.dow(f) === 6) R.check(/^Свечи (праздника и Шабата зажигаем вместе|зажигаем до захода солнца, от уже горящего огня), время в блоке Шабата ниже\.$/.test(lines[0]) && text.includes("начинается Шабат"), `${name} ${iso(eve)} (Friday): ${lines[0]}`);
  else if (noPost(eve)) {
    R.check(lines[0] === `Свечи зажигаем ${N.dow(eve) === 6 ? "после исхода Шабата" : "после выхода звёзд"}, от уже горящего огня:`, `${name} ${iso(eve)}: ${lines[0]}`);
    Object.values(CITIES).forEach((c, i) => {
      const want = c[3] === "Asia/Jerusalem" && !il ? `${c[0]}: в Израиле праздник уже закончился` : `${c[0]}: после ${hhmm(zm(eve, c).timeAtAngle(8.5, false).getTime(), c[3])}`;
      R.check(lines[i + 1] === want, `${name} ${iso(eve)}: "${lines[i + 1]}", expected "${want}"`);
    });
  } else {
    R.check(lines[0] === "Зажигание свечей 🕯️:", `${name} ${iso(eve)}: ${lines[0]}`);
    Object.values(CITIES).forEach((c, i) => {
      const want = `${c[0]}: ${hhmm(Math.round(zm(eve, c).sunset().getTime() / 60000) * 60000 - c[4] * 60000, c[3])}`;
      R.check(lines[i + 1] === want, `${name} ${iso(eve)}: "${lines[i + 1]}", expected "${want}"`);
    });
  }
  if (!changed.has(name)) changed.set(name, 0);
  changed.set(name, changed.get(name) + 1);
  nights++;
}
R.done(`${rows} chabad.org times, ${nights} Yom Tov nights: ${[...changed].map(([k, v]) => `${k} ${v}`).join(", ")}`);
