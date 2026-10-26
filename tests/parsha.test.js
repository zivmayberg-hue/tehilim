// Weekly portions embedded in index.html: every Saturday in the table matches @hebcal/core (diaspora and
// Israel), names are Russian with Hebrew, and the table reaches at least 12 months past today.
"use strict";
const { H, loadPage, fixedFromDate, dateFromFixed, todayDubai, iso, reporter } = require("./lib");
const { build } = require("./gen-parsha-table");
const fs = require("fs");
const path = require("path");

const P = loadPage(), R = reporter("Weekly portion table (page vs Hebcal)");
const T = P.PARSHA_TABLE, [fy, fm, fd] = T.first.split("-").map(Number);
const first = fixedFromDate(new Date(fy, fm - 1, fd)), last = first + 7 * (T.weeks - 1);

// The table in index.html is exactly what the generator produces now
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
R.check(html.includes(build()), "index.html table differs from tests/gen-parsha-table.js output; rerun the generator");

R.check(last >= todayDubai() + 365, `table ends ${iso(last)}, less than 12 months after today: regenerate with a later LAST_YEAR`);
for (let sat = first; sat <= last; sat += 7) {
  const hd = new H.HDate(dateFromFixed(sat));
  for (const israel of [false, true]) {
    const l = H.getSedra(hd.getFullYear(), israel).lookup(hd), p = P.parshaFor(sat, israel), where = israel ? "Israel" : "diaspora";
    if (l.chag) { R.check(p && p.chag, `${iso(sat)} ${where}: expected holiday reading, page ${JSON.stringify(p)}`); continue; }
    const ru = l.parsha.map(x => P.PARSHA_NAMES[H.parshiot.indexOf(x)][0]).join("-");
    R.check(p && p.ru === ru && !/[A-Za-z]/.test(p.ru) && /[א-ת]/.test(p.he) && !/[֑-֯]/.test(p.he),
      `${iso(sat)} ${where}: page ${JSON.stringify(p)}, Hebcal ${l.parsha.join("-")}`);
  }
}
R.check(P.parshaFor(first - 7, false) === null && P.parshaFor(last + 7, false) === null, "outside the table must return nothing");
R.done(`${T.weeks} Saturdays, ${iso(first)} to ${iso(last)}`);
