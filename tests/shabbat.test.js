// Shabbat: every Saturday from today to the end of 2036 gets a Shabbat block with candle lighting and
// havdalah times for the five fixed cities and a weekly portion translated to Russian (with Hebrew).
// When Israel reads a different portion, the block says so.
"use strict";
const { H, notify, dateFromFixed, todayDubai, endOfYear, iso, reporter } = require("./lib");

const N = notify(), R = reporter("Shabbat block (every Saturday to 2036)");
const start = todayDubai(), end = endOfYear(2036);
const CITIES = ["Дубай", "Герцлия", "Бухарест", "Киев", "Черновцы"];
const ROW = /^(.+): 🕯️ (\d\d):(\d\d)  ✨ (\d\d):(\d\d)$/;

let saturdays = 0;
for (let f = start; f <= end; f++) {
  if (N.dow(f) !== 6) continue;
  saturdays++;
  // notify.js exports no shabbatOn(), so take the block from the morning that announces this Shabbat
  let m = f - 1; while (N.isNoPostDay(m)) m--;
  const ev = (N.eventsFor(m) || []).filter(e => e.shabbat && e.f === f), d = iso(f);
  R.check(ev.length === 1, `${d}: ${ev.length} Shabbat blocks`);
  if (!ev.length) continue;
  const { rows, parsha } = ev[0];
  R.check(rows.length === 5, `${d}: ${rows.length} city rows`);
  rows.forEach((row, i) => {
    const m = row.match(ROW);
    R.check(m && m[1] === CITIES[i], `${d}: bad row "${row}"`);
  });
  R.check(!/[A-Za-z]/.test(parsha), `${d}: untranslated portion "${parsha}"`);
  R.check(/^Недельная глава: [А-Яа-яЁё' -]+ \([א-ת" -]+\)\./.test(parsha) || parsha.startsWith("В эту субботу праздничное чтение"),
    `${d}: unexpected portion text "${parsha}"`);
  const hdate = new H.HDate(dateFromFixed(f));
  const dia = H.getSedra(hdate.getFullYear(), false).lookup(hdate), isr = H.getSedra(hdate.getFullYear(), true).lookup(hdate);
  const differs = dia.chag !== isr.chag || dia.parsha.join() !== isr.parsha.join();
  R.check(parsha.includes("В Израиле") === differs, `${d}: Israel note ${parsha.includes("В Израиле")}, Hebcal differs ${differs}`);
}
R.done(`${saturdays} Saturdays`);
