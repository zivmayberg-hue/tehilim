// Phase 2 content of the morning messages, every morning from today to the end of 2036, with times from Hebcal:
// - Hanukkah: one block on the morning of the first night (or the last weekday before it) with the time for each of the
//   five cities (after sunset; on Friday before the Shabbat candles; on Saturday night after havdalah) and the custom;
//   on every Friday of nights 2 to 8 one line in the Shabbat block; nothing else about Hanukkah.
// - Fasts: the announcing message lists start and end for the five cities as chabad.org defines them (see times.test.js).
// - Purim right after the Fast of Esther: the Purim message says when the fast ends.
// - Friday message: a ru.chabad.org link for the diaspora portion, none when the reading is for a holiday.
"use strict";
const { H, notify, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const N = notify(), C = N.C, R = reporter("Messages: Hanukkah, fasts, Purim, portion link (to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const CITIES = [["Дубай", 25.2048, 55.2708, "Asia/Dubai"], ["Герцлия", 32.1663, 34.8436, "Asia/Jerusalem"],
  ["Бухарест", 44.4268, 26.1025, "Europe/Bucharest"], ["Киев", 50.4501, 30.5234, "Europe/Kiev"], ["Черновцы", 48.2915, 25.9403, "Europe/Kiev"]];
const zm = (c, f) => new H.Zmanim(new H.GeoLocation(null, c[1], c[2], 0, c[3]), dateFromFixed(f), false);
const hm = (d, tz) => new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  .format(new Date(Math.round(Math.floor(d / 1000) / 60) * 60000));
const floorMin = d => new Date(Math.floor(d / 60000) * 60000), ceilMin = d => new Date(Math.ceil(Math.floor(d / 1000) / 60) * 60000);
const candles = (c, f) => new Date(Math.floor(zm(c, f).sunset() / 60000) * 60000 - 18 * 60000);   // Hebcal: 18 min, minute cut
// Dawn at 16.9°; where the sun never gets that low (Kyiv and Chernivtsi around midsummer) chabad.org uses midnight
const dawnAt = (c, f) => { const t = zm(c, f).timeAtAngle(16.9, true); return t && !isNaN(t) ? t : zm(c, f).chatzotNight(); };   // Hebcal: the midnight before day f
const lastPostDay = d => { while (N.isNoPostDay(d)) d--; return d; };

const msgs = new Map();
for (let d = start; d <= end; d++) { const m = N.buildMessage(d); if (m) msgs.set(d, m.text); }
const lines = d => (msgs.get(d) || "").split("\n");
const inRange = d => d >= start && d <= end;

// Hanukkah
let chanukahs = 0, fridays = 0;
const fridayLines = new Set();
for (let hy = C.hebrewFromFixed(start).y; hy <= C.hebrewFromFixed(end).y; hy++) {
  const f0 = C.fixedFromHebrew(hy, 9, 25), first = f0 - 1, day = lastPostDay(first);
  if (!inRange(day) || !inRange(first + 8)) continue;
  chanukahs++;
  const L = lines(day), i = L.findIndex(l => l.startsWith("🕎") && l.includes("начинается Ханука"));
  R.check(i >= 0, `${iso(day)}: no Hanukkah block for the first night ${iso(first)}`);
  if (i < 0) continue;
  const wd = dateFromFixed(first).getDay();
  const [pre, time] = wd === 5 ? ["до ", c => candles(c, first)] : wd === 6 ? ["после ", c => zm(c, first).tzeit(8.5)] : ["", c => zm(c, first).sunset()];
  R.check(L[i + 1].includes("зажигаем 1 свечу") && L[i + 1].includes(wd === 5 ? "до свечей Шабата" : wd === 6 ? "после авдалы" : "сразу после захода солнца"),
    `${iso(day)}: Hanukkah head "${L[i + 1]}"`);
  CITIES.forEach((c, k) => R.check(L[i + 2 + k] === `${c[0]}: ${pre}${hm(time(c), c[3])}`, `${iso(day)}: "${L[i + 2 + k]}", Hebcal ${pre}${hm(time(c), c[3])}`));
  R.check(L[i + 7].startsWith("В пятницу свечи Хануки зажигаем до свечей Шабата, в субботу вечером после авдалы"), `${iso(day)}: no Hanukkah custom line`);
  for (let n = 2; n <= 8; n++) if (dateFromFixed(first + n - 1).getDay() === 5) {
    const fri = first + n - 1, want = `🕎 Сегодня ${n}-я свеча, зажечь до свечей Шабата.`;
    R.check(lines(fri).includes(want), `${iso(fri)}: missing "${want}"`);
    fridayLines.add(fri); fridays++;
  }
  for (let d = first - 10; d <= first + 9; d++) if (d !== day && inRange(d))
    R.check(!lines(d).some(l => l.includes("Ханука") || l.includes("свечу,")), `${iso(d)}: extra Hanukkah text`);
}
for (const [d, t] of msgs) if (!fridayLines.has(d)) R.check(!t.includes("-я свеча"), `${iso(d)}: Hanukkah candle line on a wrong day`);

// Fasts
let fasts = 0;
for (let hy = C.hebrewFromFixed(start).y; hy <= C.hebrewFromFixed(end).y; hy++) for (const s of C.holidaySpans(hy)) {
  if (!s.fast) continue;
  const day = lastPostDay(s.f0 - 1);
  if (!inRange(day) || !inRange(s.f0)) continue;
  fasts++;
  const L = lines(day), dawn = s.start === "dawn";
  const i = L.findIndex(l => l === (s.key === "yk" ? "Свечи 🕯️ и время поста, до выхода звёзд ✨ на следующий вечер:" : "Время поста:"));
  R.check(i >= 0, `${iso(day)}: no fast times for ${s.key} ${iso(s.f0)}`);
  if (i < 0) continue;
  CITIES.forEach((c, k) => {
    const st = dawn ? floorMin(dawnAt(c, s.f0)) : zm(c, s.f0 - 1).sunset();
    const en = s.key === "yk" ? zm(c, s.f0).tzeit(8.5) : ceilMin(zm(c, s.f0).tzeit(6));
    const want = s.key === "yk" ? `${c[0]}: 🕯️ ${hm(candles(c, s.f0 - 1), c[3])}, пост с ${hm(st, c[3])} до ✨ ${hm(en, c[3])}`
      : `${c[0]}: с ${hm(st, c[3])} до ${hm(en, c[3])}`;
    R.check(L[i + 1 + k] === want, `${iso(day)} ${s.key}: "${L[i + 1 + k]}", Hebcal "${want}"`);
  });
}

// Purim right after the Fast of Esther
let purims = 0;
for (let hy = C.hebrewFromFixed(start).y; hy <= C.hebrewFromFixed(end).y; hy++) {
  const sp = C.holidaySpans(hy), es = sp.find(s => s.key === "esther"), pu = sp.find(s => s.key === "purim");
  const day = lastPostDay(pu.f0 - 1);
  if (!inRange(day) || !inRange(pu.f0)) continue;
  purims++;
  const L = lines(day), i = L.findIndex(l => l.startsWith("Пост Эстер заканчивается"));
  if (es.f0 !== pu.f0 - 1) { R.check(i < 0, `${iso(day)}: fast end note without the fast`); continue; }
  R.check(L.some(l => /начинается Пурим/.test(l)) && i >= 0 && L[i] === "Пост Эстер заканчивается сегодня с выходом звёзд:", `${iso(day)}: Purim after the fast ${JSON.stringify(L)}`);
  if (i >= 0) CITIES.forEach((c, k) => R.check(L[i + 1 + k] === `${c[0]}: ${hm(ceilMin(zm(c, es.f0).tzeit(6)), c[3])}`, `${iso(day)}: "${L[i + 1 + k]}"`));
}

// Portion link on ru.chabad.org (diaspora portion)
const AIDS = new Set(), links = new Map();
let shabbatMsgs = 0;
for (let d = start; d <= end; d++) {
  const ev = N.eventsFor(d) || [];
  for (const e of ev.filter(e => e.shabbat)) {
    shabbatMsgs++;
    const sa = new H.HDate(dateFromFixed(e.f)), dia = H.getSedra(sa.getFullYear(), false).lookup(sa);
    const got = lines(d).filter(l => l.startsWith("Недельная глава на русском: "));
    if (dia.chag) { R.check(got.length === 0, `${iso(d)}: link on a holiday reading`); continue; }
    const m = got.length === 1 && /^Недельная глава на русском: https:\/\/ru\.chabad\.org\/parshah\/default_cdo\/aid\/(\d+)$/.exec(got[0]);
    R.check(!!m, `${iso(d)}: portion link ${JSON.stringify(got)} for ${dia.parsha.join("-")}`);
    if (!m) continue;
    const key = dia.parsha.join("-");
    R.check(!links.has(key) || links.get(key) === m[1], `${key}: two different links`);
    R.check(![...links].some(([k, a]) => a === m[1] && k !== key), `${key}: link ${m[1]} also used for another portion`);
    links.set(key, m[1]); AIDS.add(m[1]);
  }
}
R.check(links.size >= 54, `only ${links.size} different portions linked`);
R.done(`${chanukahs} Hanukkahs (${fridays} Friday lines), ${fasts} fasts, ${purims} Purims, ${shabbatMsgs} Shabbat messages, ${links.size} portions linked`);
