// Alerts for the admin about the family reminder, in English, only in the admin's private chat with the bot
// @tehilim_mayberg_bot (ADMIN_TG_CHAT_ID if set, otherwise TG_CHAT_ID). Never the family group. Only when the admin
// has to act:
//   WhatsApp disconnected       whatsappCheck, called by notify.js before sending each morning
//   WhatsApp didn't send / late notify.js: TEXT.whatsappFailed / TEXT.late, then the family message on its own (forward)
//   open the bot's WhatsApp     every 10 days    } node notify/alerts.js daily (alerts.yml, started by the Vercel
//   token expiry                30 and 7 days    }   check at 08:13 UTC with TOKEN_EXPIRES)
//   no successful run by 12:13  sent by the Vercel check itself (tehilim-trigger api/check.js), not from here
//   node notify/alerts.js test  one test alert of each kind here, marked 🧪
//
// The same alert never goes out twice a day: notify/alerts.log (committed, like sent.log).
// DRY_RUN=1: show only, send and record nothing.
"use strict";
const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "alerts.log");
const PHONE_EVERY_DAYS = 10;
const TOKEN_WARN_DAYS = [7, 30];
const BOT_PHONE = "+357 99 825306";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const dubaiDate = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const dayNum = iso => Date.parse(iso + "T00:00:00Z") / 86400000;
const isoOf = n => new Date(n * 86400000).toISOString().slice(0, 10);
const enDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

// ---------- texts ----------
const TEXT = {
  whatsappFailed: () => "WhatsApp didn't send. Forward the next message to the family group.",
  late: time => `⚠️ Tehilim: today's reminder is late (the run started after ${time} Dubai, 2 hours before sunset), so it didn't go to the group.\n` +
    "If it's still relevant, forward the next message to the family group.",
  lateEvening: time => `⚠️ Tehilim: tonight's Omer reminder is late (the run started after sunset in Dubai, ${time}), so it didn't go to the group.\n` +
    "If it's still relevant, forward the next message to the family group.",
  whatsapp: status => `🟠 Tehilim: the bot's WhatsApp is not connected (Whapi: ${status}).\n` +
    "If sending fails, today's family message comes to you here to forward.\n" +
    `What to do: open WhatsApp on the bot's phone (Tehilim mayberg, ${BOT_PHONE}). If that doesn't help, link the number again in the Whapi panel: https://panel.whapi.cloud`,
  phone: () => "📱 Open the Tehilim mayberg bot's WhatsApp on its phone.\n(Whapi disconnects the bot if its WhatsApp isn't opened for 14 days.)",
  token: (expIso, days) => `🔑 Tehilim: the GitHub token "tehilim-trigger" expires on ${enDate(expIso)}, in ${days} day${days === 1 ? "" : "s"}.\n` +
    "Without it, the Vercel morning start and the 12:13 check stop working, and only GitHub's unreliable schedule is left.\n" +
    "What to do: regenerate the token (GitHub, Settings, Developer settings, Fine-grained tokens, tehilim-trigger, Regenerate) and give the new one to Claude to put in Vercel.\n" +
    "https://github.com/settings/personal-access-tokens",
};

// ---------- sending, to the admin only ----------
function adminChat(env) {
  const chat = String(env.ADMIN_TG_CHAT_ID || env.TG_CHAT_ID || "");
  if (!env.TG_TOKEN || !chat) throw new Error("TG_TOKEN and ADMIN_TG_CHAT_ID (or TG_CHAT_ID) must be set");
  // A private Telegram chat has a positive id. Groups and channels are negative; the WhatsApp group never qualifies.
  if (!/^\d+$/.test(chat) || chat === env.WA_GROUP_ID) throw new Error("Alerts go only to a private chat, and this id looks like a group");
  return chat;
}
async function sendAdmin(text, ctx) {
  const chat = adminChat(ctx.env), url = `https://api.telegram.org/bot${ctx.env.TG_TOKEN}/sendMessage`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await ctx.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
      if (r.ok) { ctx.say("Alert sent to the private chat"); return; }
      ctx.say(`Try ${attempt}: Telegram HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    } catch (e) { ctx.say(`Try ${attempt}: ${e.message}`); }
    if (ctx.wait) await ctx.wait(5000 * attempt);
  }
  throw new Error("Could not send the alert to Telegram");
}

// ---------- log: one alert per problem per day ----------
const readLog = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => l.split(" ")) : [];
const logged = (ctx, date, kind, key) => readLog(ctx.log).some(([d, k, x]) => (date == null || d === date) && k === kind && (key == null || x === key));
const lastDate = (ctx, kind) => readLog(ctx.log).filter(([, k]) => k === kind).map(([d]) => d).sort().pop();

// Send unless already sent; in a dry run only show it
async function alert(ctx, date, kind, key, text) {
  if (logged(ctx, date, kind, key)) { ctx.say(`Already alerted (${kind}), skipping`); return "duplicate"; }
  ctx.say(`Alert ${kind}:\n${text}`);
  if (ctx.dry) { ctx.say("Dry run: not sent"); return "dry"; }
  await sendAdmin(text, ctx);
  fs.appendFileSync(ctx.log, `${date} ${kind}${key ? " " + key : ""}\n`);
  return "sent";
}

// WhatsApp disconnected? (Whapi /health: status.text "AUTH" means connected)
async function whatsappStatus(ctx) {
  let last = "no answer";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await ctx.fetch("https://gate.whapi.cloud/health", { headers: { Authorization: `Bearer ${ctx.env.WA_TOKEN}`, Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) return { ok: false, status: `key refused, HTTP ${r.status}` };
      if (r.ok) { const s = ((await r.json()).status || {}).text || "unknown"; return { ok: s === "AUTH", status: s }; }
      last = `HTTP ${r.status}`;
    } catch (e) { last = e.message; }
    if (ctx.wait) await ctx.wait(5000 * attempt);
  }
  return { ok: false, status: last };
}
async function whatsappCheck(ctx) {
  const env = ctx.env;
  if ((env.SEND_MODE || "telegram").toLowerCase() !== "whatsapp" || (env.WA_PROVIDER || "whapi").toLowerCase() !== "whapi") return "skip";
  const s = await whatsappStatus(ctx);
  ctx.say(`Bot's WhatsApp: ${s.ok ? "connected" : "not connected"} (${s.status})`);
  if (s.ok) return "ok";
  return alert(ctx, dubaiDate(ctx.now), "whatsapp", null, TEXT.whatsapp(s.status));
}

// Daily check (alerts.yml): token expiry and the phone reminder
async function daily(ctx) {
  const env = ctx.env, today = dubaiDate(ctx.now), out = {};
  const exp = (env.TOKEN_EXPIRES || "").trim();
  if (exp) {
    const t = Date.parse(exp.replace(" UTC", "Z").replace(" ", "T"));
    if (isNaN(t)) ctx.say("Could not read the token expiry: " + exp);
    else {
      const expIso = dubaiDate(t), days = dayNum(expIso) - dayNum(today);
      const due = TOKEN_WARN_DAYS.filter(w => days <= w && days > 0 && !logged(ctx, null, "token-" + w, expIso));
      if (due.length) {                                // one message, even when both thresholds were missed
        out.token = await alert(ctx, today, "token-" + due[0], expIso, TEXT.token(expIso, days));
        if (out.token === "sent") for (const w of due.slice(1)) fs.appendFileSync(ctx.log, `${today} token-${w} ${expIso}\n`);
      }
    }
  }
  const last = lastDate(ctx, "phone");
  if (!last || dayNum(today) - dayNum(last) >= PHONE_EVERY_DAYS) out.phone = await alert(ctx, today, "phone", null, TEXT.phone());
  return out;
}

// One test alert of each kind sent from GitHub, marked 🧪; the two forwardable ones are followed by a real family
// message (the next one due), exactly as notify.js would send it. sendMessage = notify.js sendTelegram.
async function test(ctx, { sample, sendMessage } = {}) {
  const head = "🧪 Test alert, everything is actually fine.\n\n", tail = "\n\n🧪 Test: no need to forward the next message.";
  const exp = isoOf(dayNum(dubaiDate(ctx.now)) + 30);
  for (const text of [TEXT.whatsapp("QR"), TEXT.phone(), TEXT.token(exp, 30)]) {
    ctx.say(head + text);
    if (!ctx.dry) await sendAdmin(head + text, ctx);
  }
  if (!sample) return;
  for (const text of [TEXT.whatsappFailed(), TEXT.late("15:30")]) {
    ctx.say(head + text + tail + "\n---\n" + sample);
    if (!ctx.dry) { await sendAdmin(head + text + tail, ctx); await sendMessage(sample); }
  }
}

function context(over = {}) {
  return { env: process.env, now: process.env.NOW ? Date.parse(process.env.NOW) : Date.now(), fetch: (...a) => fetch(...a),
    log: LOG, dry: process.env.DRY_RUN === "1", say: m => console.log(m),
    wait: ms => new Promise(r => setTimeout(r, ms)), ...over };
}

module.exports = { TEXT, adminChat, sendAdmin, whatsappStatus, whatsappCheck, daily, test, context, dubaiDate };
if (require.main === module) {
  const cmd = process.argv[2];
  let job;
  if (cmd === "daily") job = daily(context());
  else if (cmd === "test") {
    const N = require("./notify"), ctx = context();
    let f = N.C.fixedFromYMD(...dubaiDate(ctx.now).split("-").map((x, i) => i === 1 ? x - 1 : +x)), msg = null;
    for (let i = 0; i < 60 && !msg; i++) msg = N.buildMessage(f + i);
    job = test(ctx, { sample: msg && msg.text, sendMessage: N.sendTelegram });
  } else { console.error("Command: daily | test"); process.exit(2); }
  job.catch(e => { console.error(e.message); process.exit(1); });
}
