// Reminders: simulate every morning from today to the end of 2036 with notify.js.
// Every event (birthday, holiday, Rosh Chodesh, fast, Shabbat) is announced exactly once, before it starts,
// never on Shabbat or Yom Tov (diaspora, per Hebcal), and no morning is silenced that Hebcal says is a weekday.
"use strict";
const { H, notify, todayDubai, endOfYear, birthFixed, hebcalBirthday, hd, iso, isShabbatOrYomTov, reporter } = require("./lib");

const N = notify(), R = reporter("Reminders (every morning to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const keyOf = e => e.shabbat ? "Шабат" : e.name ? "ДР " + e.name : e.text.split(/[.,(]/)[0];

const announced = new Map();          // "key@f" -> [mornings]
let messages = 0;
for (let today = start; today <= end; today++) {
  const quiet = isShabbatOrYomTov(today);
  R.check(N.isNoPostDay(today) === quiet, `${iso(today)}: notify.js no-post day ${N.isNoPostDay(today)}, Hebcal Shabbat/Yom Tov ${quiet}`);
  const ev = N.eventsFor(today);
  if (quiet) { R.check(ev === null, `${iso(today)}: posts on Shabbat/Yom Tov`); continue; }
  for (const e of ev) {
    const k = `${keyOf(e)}@${e.f}`;
    if (!announced.has(k)) announced.set(k, []);
    announced.get(k).push(today);
    // Evening events start the evening before Hebrew day f; dawn events start at dawn of f. Either way: by the morning of f - 1.
    R.check(today <= e.f - 1, `${k.split("@")[0]} ${iso(e.f)}: announced ${iso(today)}, too late`);
  }
  const msg = N.buildMessage(today);
  if (msg) {
    messages++;
    R.check(!msg.text.includes("—"), `${iso(today)}: message contains an em dash or a missing time`);
  }
}

// Expected events: everything notify.js knows about, for Hebrew days safely inside the range
const expected = [];
for (let f = start + 10; f <= end - 10; f++) {
  for (const e of [...N.birthdaysOn(f), ...N.holidaysOn(f)]) expected.push(`${keyOf(e)}@${f}`);
  if (N.dow(f) === 6) expected.push(`Шабат@${f}`);
}
for (const k of expected) {
  const n = (announced.get(k) || []).length;
  R.check(n === 1, `${k.split("@")[0]} ${iso(+k.split("@")[1])}: announced ${n} times`);
}
for (const [k, days] of announced) {
  const f = +k.split("@")[1];
  if (f >= start + 10 && f <= end - 10) R.check(expected.includes(k), `unexpected announcement ${k.split("@")[0]} ${iso(f)} on ${days.map(iso)}`);
}

// Birthdays announced by notify.js are the Hebcal birthdays
for (const p of N.C.PEOPLE) {
  const bf = birthFixed(p);
  for (let hy = hd(start + 10).getFullYear() + 1; hy <= hd(end - 10).getFullYear() - 1; hy++) {
    const f = hebcalBirthday(bf, hy);
    R.check(expected.includes(`ДР ${p.name}@${f}`), `birthday of ${p.name} ${iso(f)} (Hebcal) not announced`);
  }
}
R.done(`${end - start + 1} mornings, ${messages} messages, ${expected.length} events`);
