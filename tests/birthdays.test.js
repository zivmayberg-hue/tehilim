// Birthday chapters: for every family member and every day from today to the end of 2046,
// the page's compute() must agree with @hebcal/core on Hebrew birth date, age (chapter = age + 1),
// "birthday today" and the date of the next birthday.
"use strict";
const { loadPage, hd, todayDubai, endOfYear, birthFixed, hebcalBirthday, iso, reporter } = require("./lib");

const P = loadPage(), R = reporter("Birthday chapters (page vs Hebcal, to 2046)");
const start = todayDubai(), end = endOfYear(2046);

for (const p of P.PEOPLE) {
  const bf = birthFixed(p), bh = hd(bf);
  for (let f = start; f <= end; f++) {
    P.setToday(f);
    const r = P.compute(p);
    if (f === start) R.check(r.bh.y === bh.getFullYear() && r.bh.m === bh.getMonth() && r.bh.d === bh.getDate(),
      `${p.name}: Hebrew birth date page ${r.bh.d}/${r.bh.m}/${r.bh.y}, Hebcal ${bh}`);
    let hy = hd(f).getFullYear(), last = hebcalBirthday(bf, hy);
    if (last > f) { hy--; last = hebcalBirthday(bf, hy); }
    const age = Math.max(0, hy - bh.getFullYear()), next = hebcalBirthday(bf, hy + 1);
    R.check(r.chapter === age + 1, `${p.name} ${iso(f)}: chapter page ${r.chapter}, Hebcal ${age + 1}`);
    R.check(r.isBirthday === (last === f), `${p.name} ${iso(f)}: birthday-today page ${r.isBirthday}, Hebcal ${last === f}`);
    R.check(r.next.fixed === next, `${p.name} ${iso(f)}: next birthday page ${iso(r.next.fixed)}, Hebcal ${iso(next)}`);
  }
}
R.done(`${P.PEOPLE.length} people, ${iso(start)} to ${iso(end)}`);
