// Upcoming birthdays card: for every day from today to the end of 2036 (morning and evening), the three listed
// are the next three Hebrew birthdays per Hebcal, in date order (card order on the same day), with the right
// Hebrew date, age, regular calendar date when it starts, and "today/tomorrow evening / in N days".
"use strict";
const { H, loadPage, hd, dateFromFixed, todayDubai, endOfYear, birthFixed, hebcalBirthday, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Upcoming birthdays (page vs Hebcal, to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const RU_GEN = { Nisan: "Нисана", Iyyar: "Ияра", Sivan: "Сивана", Tamuz: "Тамуза", Av: "Ава", Elul: "Элула", Tishrei: "Тишрея",
  Cheshvan: "Хешвана", Kislev: "Кислева", Tevet: "Тевета", "Sh'vat": "Швата", Adar: "Адара", "Adar I": "Адара I", "Adar II": "Адара II" };
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const years = n => (n % 100 >= 11 && n % 100 <= 14) ? "лет" : n % 10 === 1 ? "год" : (n % 10 >= 2 && n % 10 <= 4) ? "года" : "лет";
const days = n => (n % 100 >= 11 && n % 100 <= 14) ? "дней" : n % 10 === 1 ? "день" : (n % 10 >= 2 && n % 10 <= 4) ? "дня" : "дней";
const births = P.PEOPLE.map(p => ({ name: p.name, bf: birthFixed(p), by: hd(birthFixed(p)).getFullYear() }));

function expected(day) {                             // next three by Hebcal after Hebrew day `day`
  const hy = hd(day).getFullYear();
  return births.map((b, i) => {
    let y = Math.max(hy, b.by + 1), f;
    while ((f = hebcalBirthday(b.bf, y)) <= day) y++;
    return { name: b.name, i, f, age: y - b.by };
  }).sort((a, b) => a.f - b.f || a.i - b.i).slice(0, 3);
}
let rows = 0;
for (let civil = start; civil <= end; civil++) {
  for (const evening of [false, true]) {             // morning: Hebrew day = civil day; after sunset: the next one
    const day = civil + (evening ? 1 : 0), got = P.upcomingBirthdays(day, 3), exp = expected(day);
    R.check(got.length === 3, `${iso(civil)}${evening ? " evening" : ""}: ${got.length} rows`);
    exp.forEach((e, k) => {
      const g = got[k] || {}, tag = `${iso(civil)}${evening ? " evening" : ""} #${k + 1}`;
      R.check(g.name === e.name && g.f === e.f && g.age === e.age, `${tag}: page ${g.name} ${g.f && iso(g.f)} age ${g.age}, Hebcal ${e.name} ${iso(e.f)} age ${e.age}`);
      if (g.name !== e.name) return;
      const t = P.upcomingText(g, civil), h = new H.HDate(dateFromFixed(e.f)), s = dateFromFixed(e.f - 1);
      const date = `${s.getDate()} ${MONTHS[s.getMonth()]}`, diff = e.f - 1 - civil;
      R.check(t.hebrew === `${h.getDate()} ${RU_GEN[h.getMonthName()]}, исполнится ${e.age} ${years(e.age)}`, `${tag}: "${t.hebrew}" vs Hebcal ${h}`);
      const when = diff === 0 ? `Начинается сегодня вечером, ${date}.` : diff === 1 ? `Начинается завтра вечером, ${date}.` : `Начинается вечером ${date}, через ${diff} ${days(diff)}.`;
      R.check(t.when === when, `${tag}: "${t.when}", expected "${when}"`);
      rows++;
    });
  }
}
// The example from the review request: Wednesday 28 October 2026, Loew's birthday that evening is first
const wed = P.upcomingBirthdays(require("./lib").fixedFromDate(new Date(2026, 9, 28)), 3)[0];
R.check(wed && wed.name.startsWith("Лоэв") && P.upcomingText(wed, require("./lib").fixedFromDate(new Date(2026, 9, 28))).when === "Начинается сегодня вечером, 28 октября.", `28 Oct 2026: first row ${JSON.stringify(wed)}`);
R.done(`${end - start + 1} days, morning and evening, ${rows} rows`);
