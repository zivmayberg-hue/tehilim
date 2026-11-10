// Rosh Chodesh, one day or two (the 30th of the previous month + the 1st), every one to the end of 2036 against Hebcal:
// - the WhatsApp announcement: exactly once, on a morning before it starts (moved before Shabbat or Yom Tov), naming the
//   month; two-day ones say "два дня: <weekday> и <weekday>" with Hebcal's two days, one-day ones say nothing about days;
// - on the second day of a two-day one, the line "Сегодня второй день Рош Ходеш <month>, читаем Псалом 104." exactly when
//   that morning has a family message anyway (never a message just for it), first after the greeting; on no other day;
// - the page banner each day in Russian, English and Hebrew: "день 1 из 2" / "день 2 из 2" exactly on two-day ones,
//   nothing extra on one-day ones, no banner on other days (Rosh Hashana has its own holiday banner).
"use strict";
const { H, notify, loadPage, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const N = notify(), P = loadPage(), R = reporter("Rosh Chodesh: one or two days (messages and banner vs Hebcal, to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const RU_MONTH = { "Cheshvan": "Хешван", "Kislev": "Кислев", "Tevet": "Тевет", "Sh'vat": "Шват", "Adar": "Адар",
  "Adar I": "Адар I", "Adar II": "Адар II", "Nisan": "Нисан", "Iyyar": "Ияр", "Sivan": "Сиван", "Tamuz": "Тамуз",
  "Av": "Ав", "Elul": "Элул" };
const fixedOf = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + 719163;

// Hebcal: Rosh Chodesh days (daytime) grouped into spans of one or two days
const days = new Map();
for (const e of H.HebrewCalendar.calendar({ start: dateFromFixed(start - 40), end: dateFromFixed(end + 40), il: false, noModern: true, noSpecialShabbat: true }))
  if (e.getDesc().startsWith("Rosh Chodesh ")) days.set(fixedOf(e.getDate().greg()), RU_MONTH[e.getDesc().slice(13)] || "?" + e.getDesc());
const spans = [];
for (const [f, m] of [...days].sort((a, b) => a[0] - b[0])) {
  const last = spans[spans.length - 1];
  if (last && last.m === m && last.days[last.days.length - 1] === f - 1) last.days.push(f); else spans.push({ m, days: [f] });
}
const inRange = spans.filter(s => s.days[0] - 1 > start && s.days[0] <= end);   // starts on an evening after this morning
R.check(inRange.some(s => s.days.length === 2) && inRange.some(s => s.days.length === 1) && spans.every(s => s.days.length <= 2), "spans of one and two days");

// Messages: every morning from today, the Rosh Chodesh lines
const said = new Map();                               // span index -> [{morning, line}]
const day2 = new Map();                               // morning -> the second-day line
for (let t = start; t <= end; t++) {
  const msg = N.buildMessage(t);
  if (!msg) continue;
  for (const line of msg.text.split("\n").filter(l => l.includes("Рош Ходеш "))) {
    if (line.startsWith("Сегодня второй день Рош Ходеш ")) {
      R.check(!day2.has(t) && msg.text.split("\n")[2] === line, `${iso(t)}: second-day line twice or not first: "${line}"`);
      day2.set(t, line); continue;
    }
    const m = line.match(/начинается Рош Ходеш (.+?)(?:, два дня: (\S+) и (\S+))?\. Добавляем Псалом 104/);
    if (!m) { R.check(false, `${iso(t)}: unexpected line "${line}"`); continue; }
    // the span that starts on the evening this message talks about: the first Hebcal span starting after this morning
    const i = spans.findIndex(s => s.m === m[1] && s.days[0] - 1 >= t && s.days[0] - 1 <= t + 4);
    if (i < 0) { R.check(false, `${iso(t)}: no Hebcal Rosh Chodesh ${m[1]} in the next days: "${line}"`); continue; }
    (said.get(i) || said.set(i, []).get(i)).push({ t, line, w1: m[2], w2: m[3] });
  }
}
let two = 0, one = 0, moved = 0;
for (const s of inRange) {
  const i = spans.indexOf(s), got = said.get(i) || [], tag = `Rosh Chodesh ${s.m} ${iso(s.days[0])}`;
  R.check(got.length === 1, `${tag}: announced ${got.length} times ${JSON.stringify(got)}`);
  if (got.length !== 1) continue;
  const a = got[0];
  R.check(a.t <= s.days[0] - 1 && !N.isNoPostDay(a.t), `${tag}: announced on ${iso(a.t)}`);
  if (a.t < s.days[0] - 1) moved++;
  if (s.days.length === 2) {
    two++;
    R.check(a.w1 === WD[N.dow(s.days[0])] && a.w2 === WD[N.dow(s.days[1])], `${tag}: two days ${s.days.map(iso)}, message says "${a.line}"`);
  } else {
    one++;
    R.check(!a.w1 && !a.line.includes("два дня"), `${tag}: one day, message says "${a.line}"`);
  }
}

// The second-day line: on every second day that has a morning message anyway, and nowhere else
let day2Lines = 0, day2Quiet = 0;
for (const s of spans.filter(s => s.days.length === 2 && s.days[1] >= start && s.days[1] <= end)) {
  const d = s.days[1], tag = `Rosh Chodesh ${s.m} day 2 ${iso(d)}`;
  const others = N.eventsFor(d), hasOther = !!(others && (others.length || N.omerNightsInMorning(d).length));
  if (hasOther) {
    day2Lines++;
    R.check(day2.get(d) === `Сегодня второй день Рош Ходеш ${s.m}, читаем Псалом 104.`, `${tag}: message without the line or wrong: ${JSON.stringify(day2.get(d))}`);
  } else {
    day2Quiet++;
    R.check(!N.buildMessage(d), `${tag}: a message just for the second-day line`);
  }
}
for (const t of day2.keys()) R.check(spans.some(s => s.days.length === 2 && s.days[1] === t), `${iso(t)}: second-day line on a day that is not the second day`);

// Page banner: every day, in three languages
const SUFFIX = { ru: [" (день 1 из 2)", " (день 2 из 2)"], en: [" (day 1 of 2)", " (day 2 of 2)"], he: [" (יום 1 מתוך 2)", " (יום 2 מתוך 2)"] };
let bannerDays = 0;
for (let f = start; f <= end; f++) {
  const th = P.hebrewFromFixed(f), rc = P.roshChodesh(th), shown = !!(rc && rc.kind === "rc");
  const span = spans.find(s => s.days.includes(f));
  R.check(shown === !!span, `${iso(f)}: banner ${shown}, Hebcal Rosh Chodesh ${!!span}`);
  if (!shown || !span) continue;
  bannerDays++;
  const twoDay = rc.day && (th.d === 30 || rc.day === 2), part = twoDay ? (th.d === 30 ? 1 : 2) : 0;
  R.check(part === (span.days.length === 2 ? span.days.indexOf(f) + 1 : 0), `${iso(f)}: page day ${part}, Hebcal ${span.days.map(iso)}`);
  for (const L of ["ru", "en", "he"]) {
    const title = P.T[L].rcTitle("X", part);
    R.check(part ? title.endsWith(SUFFIX[L][part - 1]) : !title.includes("2"), `${iso(f)} ${L}: "${title}"`);
  }
}
R.done(`${inRange.length} Rosh Chodesh to 2036: ${two} of two days, ${one} of one day, ${moved} announced on an earlier morning; second day: ${day2Lines} lines in a morning message, ${day2Quiet} quiet mornings; ${bannerDays} banner days in 3 languages`);
