// Admin alerts (notify/alerts.js) with stand-ins for GitHub, Whapi and Telegram: nothing is sent anywhere.
// Failed step, no run, WhatsApp disconnected, token near expiry, phone reminder every 10 days, Sunday summary;
// once per problem per day; only to the admin's private chat, never the family group; and the workflow setup.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { reporter } = require("./lib");
const A = require("../notify/alerts");

const R = reporter("Admin alerts: private Telegram only, once per problem per day");
const ROOT = path.join(__dirname, "..");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-"));
const ENV = { TG_TOKEN: "tg", TG_CHAT_ID: "351000058", WA_GROUP_ID: "120363000000000000@g.us", WA_TOKEN: "wa",
  SEND_MODE: "whatsapp", WA_PROVIDER: "whapi", GITHUB_TOKEN: "gh", GITHUB_RUN_ID: "900", GITHUB_REPOSITORY: "zivmayberg-hue/tehilim", GITHUB_SERVER_URL: "https://github.com" };
const at = iso => Date.parse(iso + "T08:20:00Z");                      // 12:20 Dubai
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// One fake world: GitHub runs and jobs, Whapi status, Telegram inbox
function world({ runs = [], jobs = {}, whapi = { status: 200, text: "AUTH" }, tgStatus = 200, okRuns = [] } = {}) {
  const sent = [], calls = [];
  const fetch = async (url, o = {}) => {
    calls.push(url);
    if (url.startsWith("https://api.telegram.org/")) { const b = JSON.parse(o.body); sent.push(b); return res(tgStatus, {}); }
    if (url === "https://gate.whapi.cloud/health") { if (whapi.throw) throw new Error("timeout"); return res(whapi.status, { status: { code: 4, text: whapi.text } }); }
    if (url.startsWith("https://gate.whapi.cloud/")) throw new Error("alerts must never send to WhatsApp: " + url);
    let m;
    if ((m = url.match(/\/actions\/runs\/(\d+)\/jobs$/))) return res(200, { jobs: [{ steps: jobs[m[1]] || [] }] });
    if ((m = url.match(/\/actions\/runs\/(\d+)$/))) return res(200, { id: +m[1], workflow_id: 77 });
    if (url.includes("/workflows/77/runs")) return res(200, { workflow_runs: runs });
    if (url.includes("/workflows/notify.yml/runs")) return res(200, { workflow_runs: okRuns });
    throw new Error("unexpected " + url);
  };
  return { fetch, sent, calls };
}
let logN = 0;
function ctx(w, over = {}) {
  const log = path.join(DIR, `alerts-${++logN}.log`);
  return { env: ENV, now: at("2026-11-02"), fetch: w.fetch, log, sentLog: path.join(DIR, "none.log"), dry: false, say: () => {}, wait: null, ...over };
}
const steps = (failed) => [{ name: "Set up job", conclusion: "success" }, { name: failed, conclusion: "failure" }, { name: "Alert the admin that a step failed", conclusion: null }];
const toAdminOnly = w => w.sent.every(b => b.chat_id === "351000058");

(async () => {
  // ---------- 1. failed step ----------
  {
    const w = world({ jobs: { 900: steps("Build and send today's message") } });
    R.check(await A.runFailed(ctx(w)) === "sent" && w.sent.length === 1, "failed step: one alert");
    const t = w.sent[0].text;
    R.check(t.includes("«Build and send today's message»") && t.includes("https://github.com/zivmayberg-hue/tehilim/actions/runs/900") && t.includes("Что делать"), "failed step: name, link, what to do: " + t);
    R.check(toAdminOnly(w), "failed step: private chat only");

    // same step failed earlier today: no second alert; a different step: alert
    const runs = [{ id: 899, conclusion: "failure" }, { id: 900, conclusion: null }];
    const w2 = world({ runs, jobs: { 899: steps("Build and send today's message"), 900: steps("Build and send today's message") } });
    R.check(await A.runFailed(ctx(w2)) === "duplicate" && w2.sent.length === 0, "failed step: same step twice a day must alert once");
    R.check(w2.calls.some(u => u.includes("created=%3E%3D2026-11-01T20%3A00%3A00Z")), "failed step: today means since 00:00 Dubai");
    const w3 = world({ runs, jobs: { 899: steps("Install the Jewish calendar library (Hebcal)"), 900: steps("Build and send today's message") } });
    R.check(await A.runFailed(ctx(w3)) === "sent", "failed step: a different step is a different problem");
    const w4 = world({ runs: [{ id: 899, conclusion: "success" }], jobs: { 900: steps("Save the sent log (also keeps the schedule active)") } });
    R.check(await A.runFailed(ctx(w4)) === "sent", "failed step: earlier success does not hide a failure");
    const w5 = world({ jobs: { 900: steps("Build and send today's message") } });
    R.check(await A.runFailed(ctx(w5, { dry: true })) === "dry" && w5.sent.length === 0, "failed step: dry run sends nothing");
  }

  // ---------- 3. WhatsApp disconnected ----------
  {
    const w = world();
    R.check(await A.whatsappCheck(ctx(w)) === "ok" && w.sent.length === 0, "WhatsApp connected: no alert");
    for (const [name, whapi] of [["QR", { status: 200, text: "QR" }], ["401", { status: 401 }], ["timeout", { throw: true }]]) {
      const w2 = world({ whapi }), c = ctx(w2);
      const first = await A.whatsappCheck(c), second = await A.whatsappCheck(c);
      R.check(first === "sent" && second === "duplicate" && w2.sent.length === 1, `WhatsApp ${name}: one alert per day (${first}, ${second})`);
      R.check(/WhatsApp бота не подключён/.test(w2.sent[0].text) && /Что делать/.test(w2.sent[0].text) && toAdminOnly(w2), `WhatsApp ${name}: text and private chat`);
      const next = await A.whatsappCheck({ ...c, now: at("2026-11-03") });
      R.check(next === "sent", `WhatsApp ${name}: still down the next day, alert again`);
    }
    const w3 = world({ whapi: { status: 200, text: "QR" } });
    R.check(await A.whatsappCheck(ctx(w3, { env: { ...ENV, SEND_MODE: "telegram" } })) === "skip" && !w3.calls.length, "WhatsApp: not checked in Telegram mode");
    const w4 = world({ whapi: { status: 200, text: "QR" } });
    R.check(await A.whatsappCheck(ctx(w4, { dry: true })) === "dry" && w4.sent.length === 0, "WhatsApp: dry run sends nothing");
    R.check(!w4.calls.some(u => u.startsWith("https://gate.whapi.cloud/messages")), "WhatsApp check never sends to the group");
  }

  // ---------- 2. no successful run today ----------
  {
    const w = world(), c = ctx(w, { env: { ...ENV, NORUN: "1", RETRIED: "1" } });
    const r1 = await A.daily(c), r2 = await A.daily(c);
    R.check(r1.noRun === "sent" && r2.noRun === "duplicate", `no run: once per day (${r1.noRun}, ${r2.noRun})`);
    const t = w.sent.find(b => /ни разу не прошло/.test(b.text)).text;
    R.check(/Я запустил его ещё раз/.test(t) && /Что делать/.test(t) && t.includes("actions/workflows/notify.yml"), "no run: text: " + t);
    const w2 = world(), c2 = ctx(w2, { env: { ...ENV, NORUN: "0" } });
    R.check(!(await A.daily(c2)).noRun, "no run: nothing when notify.yml succeeded");
  }

  // ---------- 5. token expiry: 30 and 7 days before ----------
  {
    const EXP = "2027-10-27 21:00:00 UTC";                         // = 28 Oct 2027 01:00 Dubai
    const w = world(), c = ctx(w, { env: { ...ENV, TOKEN_EXPIRES: EXP } });
    const got = [];
    for (let d = Date.parse("2027-09-01"); d <= Date.parse("2027-10-28"); d += 86400000) {
      const r = await A.daily({ ...c, now: d + 8 * 3600e3 });
      if (r.token === "sent") got.push(new Date(d).toISOString().slice(0, 10));
    }
    R.check(JSON.stringify(got) === '["2027-09-28","2027-10-21"]', "token: alerts exactly 30 and 7 days before: " + got);
    const t = w.sent.filter(b => /ключ GitHub/.test(b.text)).map(b => b.text);
    R.check(t.length === 2 && /28 октября 2027, через 30 дней/.test(t[0]) && /через 7 дней/.test(t[1]) && t.every(x => /Что делать/.test(x)), "token: texts: " + t.join(" / "));
    // check missed on the 30th day: the next day still warns, once; both thresholds missed: one message
    const w2 = world(), c2 = ctx(w2, { env: { ...ENV, TOKEN_EXPIRES: EXP } });
    const a = await A.daily({ ...c2, now: Date.parse("2027-10-23T08:00:00Z") }), b = await A.daily({ ...c2, now: Date.parse("2027-10-24T08:00:00Z") });
    R.check(a.token === "sent" && !b.token && w2.sent.filter(x => /ключ GitHub/.test(x.text)).length === 1, "token: both thresholds missed, one alert");
    // a renewed token (new date) warns again
    const c3 = { ...c, env: { ...ENV, TOKEN_EXPIRES: "2028-10-27 21:00:00 UTC" }, now: Date.parse("2028-09-28T08:00:00Z") };
    R.check((await A.daily(c3)).token === "sent", "token: a renewed token gets its own warnings");
    R.check(!(await A.daily(ctx(world(), { env: { ...ENV, TOKEN_EXPIRES: EXP } }))).token, "token: no alert a year ahead");
  }

  // ---------- 4. phone reminder every 10 days ----------
  {
    const w = world(), c = ctx(w);
    const days = [];
    for (let i = 0; i < 365; i++) { const now = at("2026-11-02") + i * 86400000; if ((await A.daily({ ...c, now })).phone === "sent") days.push(i); }
    R.check(days.length === 37 && days.every((d, i) => d === i * 10), "phone: every 10 days: " + days.slice(0, 5));
    R.check(w.sent.some(b => b.text.startsWith("📱 Открой WhatsApp бота Tehilim mayberg на телефоне")), "phone: text");
  }

  // ---------- 6. Sunday summary ----------
  {
    const sentLog = path.join(DIR, "sent.log");
    fs.writeFileSync(sentLog, "2026-10-31 old\n2026-11-01 ДР:a\n2026-11-06 Шабат\n2026-11-08 Рош Ходеш\n");
    const all = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map(d => ({ created_at: d + "T06:14:00Z", conclusion: "success" }));
    const w = world({ okRuns: all }), c = ctx(w, { sentLog });
    const sun = at("2026-11-08"), mon = at("2026-11-09");
    // Sunday 8 Nov: the week 2-8 Nov; 8 Nov run made at 06:14Z too
    const w1 = world({ okRuns: all.slice(1).concat({ created_at: "2026-11-08T06:14:00Z" }) });
    const r = await A.daily({ ...ctx(w1, { sentLog }), now: sun });
    const hb = w1.sent.find(b => b.text.startsWith("За неделю"));
    R.check(r.heartbeat === "sent" && hb && hb.text === "За неделю: 7 из 7 запусков прошли, отправлено 2 сообщения", "summary 7/7: " + (hb && hb.text));
    R.check(!(await A.daily({ ...c, now: mon })).heartbeat, "summary: only on Sunday");
    const w2 = world({ okRuns: all.slice(1, 5) }), c2 = ctx(w2, { sentLog });       // 2-5 Nov only
    await A.daily({ ...c2, now: sun });
    const hb2 = w2.sent.find(b => b.text.startsWith("За неделю")).text;
    R.check(hb2.startsWith("За неделю: 4 из 7 запусков прошли, отправлено 2 сообщения\nБез успешного запуска: 6 ноября, 7 ноября, 8 ноября."), "summary with gaps: " + hb2);
    R.check((await A.daily({ ...c2, now: sun })).heartbeat === "duplicate", "summary: once per Sunday");
    R.check(A.plural(1, "сообщение", "сообщения", "сообщений") === "сообщение" && A.plural(11, "a", "b", "c") === "c" && A.plural(22, "a", "b", "c") === "b" && A.plural(5, "a", "b", "c") === "c", "plural forms");
  }

  // ---------- never the family group ----------
  for (const bad of [{ TG_CHAT_ID: "-1001234567" }, { ADMIN_TG_CHAT_ID: "-42" }, { TG_CHAT_ID: ENV.WA_GROUP_ID }, { TG_CHAT_ID: "" }]) {
    let threw = false; try { A.adminChat({ ...ENV, ...bad }); } catch { threw = true; }
    R.check(threw, "a group or missing chat must be refused: " + JSON.stringify(bad));
  }
  R.check(A.adminChat({ ...ENV, ADMIN_TG_CHAT_ID: "777" }) === "777", "ADMIN_TG_CHAT_ID wins over TG_CHAT_ID");
  {
    const w = world({ tgStatus: 500 });
    let threw = false; try { await A.runFailed(ctx(w, { env: { ...ENV }, now: at("2026-11-02") })); } catch { threw = true; }
    R.check(threw && w.sent.length === 3, "Telegram down: three tries, then the step fails");
  }

  // ---------- texts ----------
  const texts = [A.TEXT.runFailed("Шаг", "u"), A.TEXT.noRun(true), A.TEXT.noRun(false), A.TEXT.whatsapp("QR"), A.TEXT.phone(), A.TEXT.token("2027-10-28", 7), A.TEXT.heartbeat(5, 1, ["2026-11-02"])];
  R.check(texts.every(t => !t.includes("—")), "no em dashes in alerts");
  R.check(texts.every(t => t.length < 700), "alerts are short");
  R.check(texts.filter(t => !t.startsWith("📱") && !t.startsWith("За неделю: 5")).every(t => /Что делать/.test(t)), "each problem alert says what to do");

  // ---------- test mode: one of each, marked as a test ----------
  {
    const w = world(); await A.test(ctx(w));
    R.check(w.sent.length === 5 && w.sent.every(b => b.text.startsWith("🧪 Проверка")) && toAdminOnly(w), "test mode: five marked alerts to the private chat");
  }

  // ---------- workflows ----------
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/notify.yml"), "utf8");
  const failStep = yml.slice(yml.indexOf("- name: Alert the admin that a step failed"));
  R.check(/if: failure\(\)/.test(failStep) && /node notify\/alerts\.js run-failed/.test(failStep), "notify.yml: failure step runs the alert");
  R.check(yml.trimEnd().endsWith(failStep.trimEnd()), "notify.yml: the failure step is the last step");
  R.check(/permissions:\s*\n\s*contents: write\s*\n\s*actions: read/.test(yml), "notify.yml: may read its own steps");
  R.check(!/WA_TOKEN|WA_PROVIDER/.test(failStep), "failure step: no WhatsApp sending secrets");
  R.check(/git add notify\/sent\.log notify\/alerts\.log/.test(yml), "notify.yml: saves the alerts log");
  const ay = fs.readFileSync(path.join(ROOT, ".github/workflows/alerts.yml"), "utf8");
  R.check(!/schedule:/.test(ay) && /workflow_dispatch:/.test(ay), "alerts.yml: started only by Vercel (no schedule)");
  R.check(/group: tehilim-alerts\s*\n\s*cancel-in-progress: false/.test(ay), "alerts.yml: one at a time");
  R.check(!/WA_TOKEN|whapi/i.test(ay) && /node notify\/alerts\.js daily/.test(ay), "alerts.yml: no WhatsApp access");
  R.check(/git pull --rebase[^\n]*&& git push/.test(ay), "alerts.yml: log push pulls first");
  const nj = fs.readFileSync(path.join(ROOT, "notify/notify.js"), "utf8");
  R.check(nj.indexOf("whatsappCheck") < nj.indexOf("await run({ today: todayFixed(now)"), "notify.js: WhatsApp checked before sending");

  fs.rmSync(DIR, { recursive: true, force: true });
  R.done("failed step, no run, WhatsApp down (QR, 401, timeout), token 30/7 days, phone every 10 days for a year, Sunday summary, group refused");
})().catch(e => { console.error(e); process.exit(1); });
