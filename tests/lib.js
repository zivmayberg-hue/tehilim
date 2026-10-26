// Shared helpers for the tests. Loads the page's calendar code straight from index.html
// and the reminder code from notify/notify.js, so the tests always check the real files.
"use strict";
const fs = require("fs");
const path = require("path");

// Safety: tests must never send anything.
for (const k of ["TG_TOKEN", "TG_CHAT_ID", "WA_TOKEN", "WA_GROUP_ID", "WA_INSTANCE", "WA_PROVIDER"]) delete process.env[k];
process.env.DRY_RUN = "1";
globalThis.fetch = () => { throw new Error("tests must not use the network"); };

const H = require("@hebcal/core");
const ROOT = path.resolve(__dirname, "..");

// Page calendar functions, with a hook to set "today" (a fixed R.D. date) for compute().
function loadPage() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const js = html.split("<script>")[1].split("</script>")[0].split("const RESULTS")[0];
  return new Function(js + `
    return {PEOPLE, hebrewFromFixed, fixedFromHebrew, fixedFromYMD, birthdayInYear, roshChodesh, hLeap, compute, CITIES, ISRAEL_ZONES,
            holidaySpans, spanTimes, bannersAt, shabbatAt, parshaFor, PARSHA_TABLE, PARSHA_NAMES,
            sunsetOn, candlesOn, havdalahOn, fastEndOn, dawnOn,
            place(tz){ const [lat, lon, name] = CITIES[tz]; return {lat, lon, name, israel: ISRAEL_ZONES.has(tz)}; },
            setToday(f){ hebToday = () => ({fixed: f, evening: false}); }};`)();
}

const notify = () => require(path.join(ROOT, "notify", "notify.js"));

// R.D. fixed date <-> civil date (UTC-safe)
const RD_UNIX = 719163;
const fixedFromDate = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) + RD_UNIX;
const dateFromFixed = f => { const u = new Date((f - RD_UNIX) * 86400000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()); };
const iso = f => new Date((f - RD_UNIX) * 86400000).toISOString().slice(0, 10);
const hd = f => new H.HDate(dateFromFixed(f));       // Hebrew date of the daytime of civil day f

function todayDubai() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = p.split("-").map(Number);
  return fixedFromDate(new Date(y, m - 1, d));
}
const endOfYear = y => fixedFromDate(new Date(y, 11, 31));

// Person's birth as a fixed date (after sunset = next Hebrew day), and their Hebrew birthday in year hy per Hebcal
function birthFixed(p) {
  const [y, m, d] = p.born.split("-").map(Number);
  return fixedFromDate(new Date(y, m - 1, d)) + (p.afterSunset ? 1 : 0);
}
const hebcalBirthday = (bf, hy) => H.HebrewCalendar.getBirthdayOrAnniversary(hy, dateFromFixed(bf)).abs();

// Diaspora: is civil day f Shabbat or Yom Tov (daytime)?
function isShabbatOrYomTov(f) {
  if (dateFromFixed(f).getDay() === 6) return true;
  return (H.HebrewCalendar.getHolidaysOnDate(dateFromFixed(f), false) || []).some(e => e.getFlags() & H.flags.CHAG);
}

// Tiny reporter: each test file prints one RESULT line that run-all.js collects.
function reporter(name) {
  let checks = 0; const fails = [];
  return {
    check(ok, msg) { checks++; if (!ok && fails.length < 1e6) fails.push(msg); },
    done(extra = "") {
      for (const m of fails.slice(0, 20)) console.log("  FAIL", m);
      if (fails.length > 20) console.log(`  ... and ${fails.length - 20} more`);
      console.log(`RESULT ${fails.length ? "FAIL" : "PASS"} | ${name} | ${checks} checks, ${fails.length} failures${extra ? " | " + extra : ""}`);
      process.exitCode = fails.length ? 1 : 0;
    },
  };
}

module.exports = { H, ROOT, loadPage, notify, fixedFromDate, dateFromFixed, iso, hd, todayDubai, endOfYear,
  birthFixed, hebcalBirthday, isShabbatOrYomTov, reporter };
