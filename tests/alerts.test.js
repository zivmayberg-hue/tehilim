// Admin alerts (notify/alerts.js and the forwardable message in notify.js) with stand-ins for Whapi and Telegram:
// nothing is sent anywhere. Only four kinds come from here, in English: WhatsApp disconnected, open the bot's WhatsApp
// every 10 days, token near expiry, and "WhatsApp didn't send" / "late" followed by the exact Russian family message.
// Once per problem per day; only to the admin's private chat, never the family group; and the workflow setup.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { reporter, notify, todayDubai } = require("./lib");
const A = require("../notify/alerts");

const R = reporter("Admin alerts: English, private Telegram only, once per problem per day");
const ROOT = path.join(__dirname, "..");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "alerts-"));
const ENV = { TG_TOKEN: "tg", TG_CHAT_ID: "351000058", WA_GROUP_ID: "120363000000000000@g.us", WA_TOKEN: "wa", SEND_MODE: "whatsapp", WA_PROVIDER: "whapi" };
const at = iso => Date.parse(iso + "T08:20:00Z");                      // 12:20 Dubai
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

// One fake world: Whapi status and sending, Telegram inbox
function world({ whapi = { status: 200, text: "AUTH" }, tgStatus = 200, waSend = 200 } = {}) {
  const sent = [], calls = [], group = [];
  const fetch = async (url, o = {}) => {
    calls.push(url);
    if (url.startsWith("https://api.telegram.org/")) { const b = JSON.parse(o.body); sent.push(b); return res(tgStatus, {}); }
    if (url === "https://gate.whapi.cloud/health") { if (whapi.throw) throw new Error("timeout"); return res(whapi.status, { status: { code: 4, text: whapi.text } }); }
    if (url === "https://gate.whapi.cloud/messages/text") { group.push(JSON.parse(o.body)); return res(waSend, {}); }
    throw new Error("unexpected " + url);
  };
  return { fetch, sent, calls, group };
}
let logN = 0;
function ctx(w, over = {}) {
  const log = path.join(DIR, `alerts-${++logN}.log`);
  return { env: ENV, now: at("2026-11-02"), fetch: w.fetch, log, dry: false, say: () => {}, wait: null, ...over };
}
const toAdminOnly = w => w.sent.every(b => b.chat_id === "351000058");
const cyrillic = /[а-яё]/i;

(async () => {
  // ---------- WhatsApp disconnected ----------
  {
    const w = world();
    R.check(await A.whatsappCheck(ctx(w)) === "ok" && w.sent.length === 0, "WhatsApp connected: no alert");
    for (const [name, whapi] of [["QR", { status: 200, text: "QR" }], ["401", { status: 401 }], ["timeout", { throw: true }]]) {
      const w2 = world({ whapi }), c = ctx(w2);
      const first = await A.whatsappCheck(c), second = await A.whatsappCheck(c);
      R.check(first === "sent" && second === "duplicate" && w2.sent.length === 1, `WhatsApp ${name}: one alert per day (${first}, ${second})`);
      R.check(/the bot's WhatsApp is not connected/.test(w2.sent[0].text) && /What to do/.test(w2.sent[0].text) && toAdminOnly(w2), `WhatsApp ${name}: text and private chat`);
      R.check(await A.whatsappCheck({ ...c, now: at("2026-11-03") }) === "sent", `WhatsApp ${name}: still down the next day, alert again`);
    }
    const w3 = world({ whapi: { status: 200, text: "QR" } });
    R.check(await A.whatsappCheck(ctx(w3, { env: { ...ENV, SEND_MODE: "telegram" } })) === "skip" && !w3.calls.length, "WhatsApp: not checked in Telegram mode");
    const w4 = world({ whapi: { status: 200, text: "QR" } });
    R.check(await A.whatsappCheck(ctx(w4, { dry: true })) === "dry" && w4.sent.length === 0, "WhatsApp: dry run sends nothing");
    R.check(!w4.group.length, "WhatsApp check never sends to the group");
  }

  // ---------- token expiry: 30 and 7 days before ----------
  {
    const EXP = "2027-10-27 21:00:00 UTC";                         // = 28 Oct 2027 01:00 Dubai
    const w = world(), c = ctx(w, { env: { ...ENV, TOKEN_EXPIRES: EXP } });
    const got = [];
    for (let d = Date.parse("2027-09-01"); d <= Date.parse("2027-10-28"); d += 86400000) {
      const r = await A.daily({ ...c, now: d + 8 * 3600e3 });
      if (r.token === "sent") got.push(new Date(d).toISOString().slice(0, 10));
    }
    R.check(JSON.stringify(got) === '["2027-09-28","2027-10-21"]', "token: alerts exactly 30 and 7 days before: " + got);
    const t = w.sent.filter(b => /GitHub token/.test(b.text)).map(b => b.text);
    R.check(t.length === 2 && /expires on 28 October 2027, in 30 days\./.test(t[0]) && /in 7 days\./.test(t[1]) && t.every(x => /What to do/.test(x)), "token: texts: " + t.join(" / "));
    const w2 = world(), c2 = ctx(w2, { env: { ...ENV, TOKEN_EXPIRES: EXP } });
    const a = await A.daily({ ...c2, now: Date.parse("2027-10-23T08:00:00Z") }), b = await A.daily({ ...c2, now: Date.parse("2027-10-24T08:00:00Z") });
    R.check(a.token === "sent" && !b.token && w2.sent.filter(x => /GitHub token/.test(x.text)).length === 1, "token: both thresholds missed, one alert");
    const c3 = { ...c, env: { ...ENV, TOKEN_EXPIRES: "2028-10-27 21:00:00 UTC" }, now: Date.parse("2028-09-28T08:00:00Z") };
    R.check((await A.daily(c3)).token === "sent", "token: a renewed token gets its own warnings");
    R.check(!(await A.daily(ctx(world(), { env: { ...ENV, TOKEN_EXPIRES: EXP } }))).token, "token: no alert a year ahead");
    R.check(A.TEXT.token("2027-10-28", 1).includes("in 1 day."), "token: 1 day, singular");
  }

  // ---------- phone reminder every 10 days ----------
  {
    const w = world(), c = ctx(w);
    const days = [];
    for (let i = 0; i < 365; i++) { const now = at("2026-11-02") + i * 86400000; if ((await A.daily({ ...c, now })).phone === "sent") days.push(i); }
    R.check(days.length === 37 && days.every((d, i) => d === i * 10), "phone: every 10 days: " + days.slice(0, 5));
    R.check(w.sent.some(b => b.text.startsWith("📱 Open the Tehilim mayberg bot's WhatsApp on its phone.")), "phone: text");
  }

  // ---------- nothing else from the daily check: no failed-run alert, no weekly summary ----------
  {
    const w = world(), c = ctx(w, { env: { ...ENV, NORUN: "1" } });
    const r = await A.daily({ ...c, now: at("2026-11-08") });              // a Sunday
    R.check(Object.keys(r).join() === "phone" && w.sent.length === 1, "daily: only the phone reminder on a Sunday, nothing for NORUN: " + JSON.stringify(r));
    R.check(!("runFailed" in A) && !("heartbeat" in A), "no failed-run alert, no weekly summary");
  }

  // ---------- forwardable: WhatsApp didn't send / late, then the exact family message ----------
  {
    const N = notify(), saved = { fetch: global.fetch, setTimeout: global.setTimeout, env: { ...process.env } };
    global.setTimeout = fn => { fn(); return 0; };                        // no waiting between tries
    Object.assign(process.env, ENV); delete process.env.ADMIN_TG_CHAT_ID;
    try {
      let f = todayDubai(); while (!N.buildMessage(f)) f++;
      const text = N.buildMessage(f).text;
      // WhatsApp fails three times: English alert, then the message itself, both to the private chat
      const w = world({ waSend: 500 }); global.fetch = w.fetch;
      await quiet(() => N.send(text));
      R.check(w.group.length === 3 && w.sent.length === 2, `WhatsApp failed: 3 tries, then 2 Telegram messages (${w.group.length}, ${w.sent.length})`);
      R.check(w.sent[0].text === "WhatsApp didn't send. Forward the next message to the family group." && w.sent[1].text === text, "WhatsApp failed: the alert, then exactly the family message");
      R.check(toAdminOnly(w) && !w.sent[0].reply_markup && w.sent[1].reply_markup, "WhatsApp failed: private chat; the message keeps its WhatsApp button");
      // WhatsApp works: nothing to the admin
      const w2 = world(); global.fetch = w2.fetch;
      await quiet(() => N.send(text));
      R.check(w2.group.length === 1 && w2.sent.length === 0, "WhatsApp works: no alert");
      // late run (default sender): English alert with the cutoff time, then the message; logged so later runs stop
      const w3 = world(); global.fetch = w3.fetch;
      const log = path.join(DIR, "late.log"), cutoff = N.lateCutoff(f);
      const r = await quiet(() => N.run({ today: f, now: cutoff.getTime() + 60000, log }));
      R.check(r === "late" && !w3.group.length && w3.sent.length === 2, `late: ${r}, group ${w3.group.length}, telegram ${w3.sent.length}`);
      R.check(w3.sent[0].text.startsWith(`⚠️ Tehilim: today's reminder is late (the run started after ${N.dubaiTime(cutoff)} Dubai`) && w3.sent[1].text === text, "late: alert then exactly the family message: " + w3.sent[0].text);
      // Telegram refuses the alert: the family message still goes
      const w4 = world(); let first = true;
      global.fetch = async (url, o) => { if (url.startsWith("https://api.telegram.org/") && first) { first = false; throw new Error("down"); } return w4.fetch(url, o); };
      await quiet(() => N.run({ today: f, now: cutoff.getTime() + 60000, log: path.join(DIR, "late2.log") }));
      R.check(w4.sent.some(b => b.text === text), "late: the family message goes even if the alert had trouble");
    } finally { global.fetch = saved.fetch; global.setTimeout = saved.setTimeout; process.env = saved.env; }
  }

  // ---------- never the family group ----------
  for (const bad of [{ TG_CHAT_ID: "-1001234567" }, { ADMIN_TG_CHAT_ID: "-42" }, { TG_CHAT_ID: ENV.WA_GROUP_ID }, { TG_CHAT_ID: "" }]) {
    let threw = false; try { A.adminChat({ ...ENV, ...bad }); } catch { threw = true; }
    R.check(threw, "a group or missing chat must be refused: " + JSON.stringify(bad));
  }
  R.check(A.adminChat({ ...ENV, ADMIN_TG_CHAT_ID: "777" }) === "777", "ADMIN_TG_CHAT_ID wins over TG_CHAT_ID");
  {
    const w = world({ tgStatus: 500 });
    let threw = false; try { await A.sendAdmin("x", ctx(w)); } catch { threw = true; }
    R.check(threw && w.sent.length === 3, "Telegram down: three tries, then an error");
  }

  // ---------- texts ----------
  const texts = [A.TEXT.whatsappFailed(), A.TEXT.late("15:30"), A.TEXT.whatsapp("QR"), A.TEXT.phone(), A.TEXT.token("2027-10-28", 7)];
  R.check(texts.every(t => !cyrillic.test(t)), "alerts are in English");
  R.check(texts.every(t => !t.includes("—")), "no em dashes in alerts");
  R.check(texts.every(t => t.length < 700), "alerts are short");
  R.check([A.TEXT.whatsapp("QR"), A.TEXT.token("2027-10-28", 7)].every(t => /What to do/.test(t)), "problem alerts say what to do");

  // ---------- test mode: one of each, marked as a test, the forwardable ones with the message ----------
  {
    const w = world(), msgs = [];
    await A.test(ctx(w), { sample: "Доброе утро, семья!", sendMessage: async t => msgs.push(t) });
    R.check(w.sent.length === 5 && w.sent.every(b => b.text.startsWith("🧪 Test alert")) && toAdminOnly(w) && msgs.length === 2, "test mode: five marked alerts, two followed by the message");
  }

  // ---------- workflows ----------
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/notify.yml"), "utf8");
  R.check(!/if: failure\(\)|run-failed|actions: read/.test(yml), "notify.yml: no failed-run alert step");
  R.check(/git add notify\/sent\.log notify\/alerts\.log/.test(yml), "notify.yml: saves the alerts log");
  R.check(/ADMIN_TG_CHAT_ID: \$\{\{ secrets\.ADMIN_TG_CHAT_ID \}\}/.test(yml), "notify.yml: knows the admin chat");
  const ay = fs.readFileSync(path.join(ROOT, ".github/workflows/alerts.yml"), "utf8");
  R.check(!/schedule:/.test(ay) && /workflow_dispatch:/.test(ay), "alerts.yml: started only by Vercel (no schedule)");
  R.check(!/norun|retried|NORUN|if: failure\(\)|run-failed/.test(ay), "alerts.yml: no no-run or failed-run alerts (Vercel sends no-run itself)");
  R.check(/group: tehilim-alerts\s*\n\s*cancel-in-progress: false/.test(ay), "alerts.yml: one at a time");
  R.check(!/WA_TOKEN|whapi/i.test(ay) && /node notify\/alerts\.js daily/.test(ay), "alerts.yml: no WhatsApp access");
  R.check(/git pull --rebase[^\n]*&& git push/.test(ay), "alerts.yml: log push pulls first");
  const nj = fs.readFileSync(path.join(ROOT, "notify/notify.js"), "utf8");
  R.check(nj.indexOf("whatsappCheck") < nj.indexOf("await run({ today: todayFixed(now)"), "notify.js: WhatsApp checked before sending");
  R.check(!/^const .*require\("\.\/alerts"\)/m.test(nj), "notify.js: alerts.js only loaded when sending (Vercel builds messages without it)");

  fs.rmSync(DIR, { recursive: true, force: true });
  R.done("WhatsApp down (QR, 401, timeout), token 30/7 days, phone every 10 days for a year, WhatsApp failed and late with the exact message, group refused, English only");
})().catch(e => { console.error(e); process.exit(1); });
