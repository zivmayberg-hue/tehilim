// Holiday banners and the Shabbat card on the page, every day from today to the end of 2036 (Dubai, 10:00):
// each banner shows from the day before the holiday until its last day, on exactly the days Hebcal (diaspora)
// gives, Hanukkah shows the right number of candles each evening, Hanukkah and Purim offer Psalms 30 and 22,
// and the Shabbat card shows on Friday and Saturday only.
"use strict";
const { H, loadPage, fixedFromDate, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Holiday banners and Shabbat card (page vs Hebcal, to 2036)");
const start = todayDubai(), end = endOfYear(2036), DUBAI = P.place("Asia/Dubai");
const at10 = f => new Date(dateFromFixed(f).getTime() + 6 * 3600000);   // 10:00 in Dubai (UTC+4), TZ=UTC

// Hebcal spans: key -> [first Hebrew day, last Hebrew day]
const FIRST = { "Sukkot I": "sukkot", "Shmini Atzeret": "shmini", "Pesach I": "pesach", "Shavuot I": "shavuot" };
const LAST = { "Rosh Hashana II": "rh", "Sukkot VII (Hoshana Raba)": "sukkot", "Simchat Torah": "shmini", "Chanukah: 8th Day": "chanukah",
  "Pesach VIII": "pesach", "Shavuot II": "shavuot" };
const SINGLE = { "Tzom Gedaliah": "gedalia", "Yom Kippur": "yk", "Asara B'Tevet": "tevet10", "Tu BiShvat": "tubishvat",
  "Ta'anit Esther": "esther", "Purim": "purim", "Lag BaOmer": "lag", "Tzom Tammuz": "tammuz17", "Tish'a B'Av": "av9" };
const spans = new Map(), firsts = new Map(), candles = new Map();
const evs = H.HebrewCalendar.calendar({ start: dateFromFixed(start - 30), end: dateFromFixed(end + 30), il: false, noModern: true });
for (const e of evs) {
  const d = e.getDesc().replace(/ \(observed\)$/, ""), f = fixedFromDate(e.getDate().greg());
  if (/^Rosh Hashana \d+$/.test(d)) firsts.set("rh", f);
  else if (d === "Chanukah: 1 Candle") firsts.set("chanukah", f + 1);
  else if (FIRST[d]) firsts.set(FIRST[d], f);
  else if (LAST[d]) spans.set(`${LAST[d]}@${firsts.get(LAST[d])}`, [firsts.get(LAST[d]), f]);
  else if (SINGLE[d]) spans.set(`${SINGLE[d]}@${f}`, [f, f]);
  const c = d.match(/^Chanukah: (\d) Candles?$/);
  if (c) candles.set(f, +c[1]);                      // lit on the evening of civil day f
}
const expected = new Map();                          // civil day -> Set of keys
for (const [k, [a, b]] of spans) for (let f = a - 1; f <= b; f++) {
  if (!expected.has(f)) expected.set(f, new Set());
  expected.get(f).add(k.split("@")[0]);
}

let shown = 0;
for (let f = start; f <= end; f++) {
  const bs = P.bannersAt(f, at10(f), DUBAI), keys = bs.map(b => b.key).sort().join(), exp = [...(expected.get(f) || [])].sort().join();
  R.check(keys === exp, `${iso(f)}: page banners [${keys}], Hebcal [${exp}]`);
  shown += bs.length;
  for (const b of bs) {
    R.check(!b.lines.join(" ").includes("—"), `${iso(f)} ${b.key}: em dash in text`);
    if (b.key === "chanukah" && candles.has(f)) R.check(b.lines[0] === `Сегодня вечером зажигаем ${candles.get(f)} ${candles.get(f) === 1 ? "свечу" : candles.get(f) < 5 ? "свечи" : "свечей"}.`,
      `${iso(f)}: Hanukkah "${b.lines[0]}", Hebcal ${candles.get(f)} candles`);
    if (b.key === "chanukah") R.check(b.psalm === 30, `${iso(f)}: Hanukkah without Psalm 30`);
    if (b.key === "purim") R.check(b.psalm === 22, `${iso(f)}: Purim without Psalm 22`);
    if (["gedalia", "tevet10", "esther", "tammuz17", "av9"].includes(b.key))
      R.check(b.tiles.map(t => t.label).join() === "Начало поста,Конец поста" && b.tiles[0].time < b.tiles[1].time, `${iso(f)} ${b.key}: fast times ${JSON.stringify(b.tiles)}`);
  }
  const sh = P.shabbatAt(f, at10(f), DUBAI), wd = dateFromFixed(f).getDay();
  R.check(!!sh === (wd === 5 || wd === 6), `${iso(f)}: Shabbat card ${!!sh} on weekday ${wd}`);
  if (sh) R.check(sh.candles < sh.havdalah && sh.parsha, `${iso(f)}: Shabbat card ${JSON.stringify(sh)}`);
}
// The Shabbat card disappears right after havdalah, banners right after the holiday ends
for (let f = start; f <= end; f++) if (dateFromFixed(f).getDay() === 6) {
  const h = P.havdalahOn(f, DUBAI);
  R.check(P.shabbatAt(f, new Date(h - 60000), DUBAI) && !P.shabbatAt(f, new Date(+h + 60000), DUBAI), `${iso(f)}: Shabbat card not ending at havdalah`);
}
R.done(`${end - start + 1} days, ${spans.size} holidays, ${shown} banner-days`);
