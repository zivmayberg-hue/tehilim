// Оповещения о сбоях семейного напоминания. Только админу, в личный чат с ботом @tehilim_mayberg_bot
// (ADMIN_TG_CHAT_ID, если задан, иначе TG_CHAT_ID). Никогда не в группу семьи.
//
//   node notify/alerts.js run-failed   шаг notify.yml упал: имя шага и ссылка на запуск (из notify.yml, if: failure())
//   node notify/alerts.js daily        ежедневная проверка (alerts.yml, его запускает Vercel в 08:13 UTC):
//                                      NORUN=1 → «напоминание сегодня не прошло», TOKEN_EXPIRES → срок ключа GitHub,
//                                      раз в 10 дней «открой WhatsApp бота», по воскресеньям итог недели
//   node notify/alerts.js test         по одному пробному оповещению каждого вида
// Проверка WhatsApp (whatsappCheck) вызывается из notify.js каждое утро перед отправкой.
//
// Одно и то же оповещение не уходит дважды за день: notify/alerts.log (коммитится, как sent.log). Сбой шага
// сверяется с ранними запусками того же дня через GitHub API, потому что упасть может и сам git.
// DRY_RUN=1: только показать, ничего не отправлять и не записывать.
"use strict";
const fs = require("fs");
const path = require("path");

const LOG = path.join(__dirname, "alerts.log");
const SENT_LOG = path.join(__dirname, "sent.log");
const REPO = "zivmayberg-hue/tehilim";
const RUNS_URL = `https://github.com/${REPO}/actions/workflows/notify.yml`;
const PHONE_EVERY_DAYS = 10;
const TOKEN_WARN_DAYS = [7, 30];
const BOT_PHONE = "+357 99 825306";
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const dubaiDate = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const dayNum = iso => Date.parse(iso + "T00:00:00Z") / 86400000;
const isoOf = n => new Date(n * 86400000).toISOString().slice(0, 10);
const dubaiStartUtc = iso => new Date(Date.parse(iso + "T00:00:00+04:00")).toISOString().replace(".000", "");
const ruDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const ruDay = iso => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

// ---------- тексты ----------
const TEXT = {
  runFailed: (step, url) => `🔴 Теилим: утренний запуск напоминания упал.\nШаг: «${step}».\n` +
    `Что делать: открой запуск и посмотри ошибку. Следующие запуски этим утром попробуют ещё раз (последний в 12:43 по Дубаю). ` +
    `Если сегодня есть новость для семьи, а в группе её нет, отправь вручную.\n${url}`,
  noRun: retried => `🟠 Теилим: к 12:13 по Дубаю напоминание сегодня ни разу не прошло успешно.\n` +
    (retried ? "Я запустил его ещё раз.\n" : "Запустить ещё раз не получилось.\n") +
    `Что делать: через 10 минут проверь запуск. Если сегодня есть новость для семьи, а в группе её нет, отправь вручную.\n${RUNS_URL}`,
  whatsapp: status => `🟠 Теилим: WhatsApp бота не подключён (Whapi: ${status}).\n` +
    `Сообщения для семьи пока будут приходить тебе сюда, в Telegram, пересылай их в группу вручную.\n` +
    `Что делать: открой WhatsApp бота Tehilim mayberg на телефоне (${BOT_PHONE}). Если не поможет, заново привяжи номер в панели Whapi: https://panel.whapi.cloud`,
  phone: () => `📱 Открой WhatsApp бота Tehilim mayberg на телефоне\n(Whapi отключает бота, если его WhatsApp не открывали 14 дней.)`,
  token: (expIso, days) => `🔑 Теилим: ключ GitHub «tehilim-trigger» истекает ${ruDate(expIso)}, через ${days} ${plural(days, "день", "дня", "дней")}.\n` +
    `Без него утренний запуск из Vercel перестанет работать, останется только ненадёжное расписание GitHub.\n` +
    `Что делать: продли ключ (GitHub, Settings, Developer settings, Fine-grained tokens, tehilim-trigger, Regenerate) и передай новый ключ Claude, чтобы заменить его в Vercel.\n` +
    `https://github.com/settings/personal-access-tokens`,
  heartbeat: (ok, sent, missed) => `За неделю: ${ok} из 7 запусков прошли, отправлено ${sent} ${plural(sent, "сообщение", "сообщения", "сообщений")}` +
    (missed.length ? `\nБез успешного запуска: ${missed.map(ruDay).join(", ")}. Посмотри запуски: ${RUNS_URL}` : ""),
};

// ---------- отправка только админу ----------
function adminChat(env) {
  const chat = String(env.ADMIN_TG_CHAT_ID || env.TG_CHAT_ID || "");
  if (!env.TG_TOKEN || !chat) throw new Error("TG_TOKEN и ADMIN_TG_CHAT_ID (или TG_CHAT_ID) должны быть заданы");
  // Личный чат в Telegram: положительный id. Группы и каналы отрицательные; группа WhatsApp тоже не подходит.
  if (!/^\d+$/.test(chat) || chat === env.WA_GROUP_ID) throw new Error("Оповещения идут только в личный чат, а этот id похож на группу");
  return chat;
}
async function sendAdmin(text, ctx) {
  const chat = adminChat(ctx.env), url = `https://api.telegram.org/bot${ctx.env.TG_TOKEN}/sendMessage`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await ctx.fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
      if (r.ok) { ctx.say("Оповещение отправлено в личный чат"); return; }
      ctx.say(`Попытка ${attempt}: Telegram HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    } catch (e) { ctx.say(`Попытка ${attempt}: ${e.message}`); }
    if (ctx.wait) await ctx.wait(5000 * attempt);
  }
  throw new Error("Не удалось отправить оповещение в Telegram");
}

// ---------- журнал: одно оповещение на проблему в день ----------
const readLog = file => fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => l.split(" ")) : [];
const logged = (ctx, date, kind, key) => readLog(ctx.log).some(([d, k, x]) => (date == null || d === date) && k === kind && (key == null || x === key));
const lastDate = (ctx, kind) => readLog(ctx.log).filter(([, k]) => k === kind).map(([d]) => d).sort().pop();

// Отправить, если такого ещё не было; в пробном режиме только показать
async function alert(ctx, date, kind, key, text) {
  if (logged(ctx, date, kind, key)) { ctx.say(`Уже сообщали (${kind}), пропускаю`); return "duplicate"; }
  ctx.say(`Оповещение ${kind}:\n${text}`);
  if (ctx.dry) { ctx.say("Пробный запуск: не отправлено"); return "dry"; }
  await sendAdmin(text, ctx);
  fs.appendFileSync(ctx.log, `${date} ${kind}${key ? " " + key : ""}\n`);
  return "sent";
}

// ---------- GitHub API ----------
async function gh(ctx, p) {
  const r = await ctx.fetch("https://api.github.com" + p, { headers: { Authorization: `Bearer ${ctx.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "tehilim-alerts" } });
  if (!r.ok) throw new Error(`GitHub API ${p}: HTTP ${r.status}`);
  return r.json();
}
const failedStep = jobs => { for (const j of jobs.jobs || []) for (const s of j.steps || []) if (s.conclusion === "failure") return s.name; return null; };

// 1. Шаг упал. Повторное оповещение в тот же день о том же шаге не отправляется.
async function runFailed(ctx) {
  const env = ctx.env, runId = String(env.GITHUB_RUN_ID), today = dubaiDate(ctx.now);
  const url = `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY || REPO}/actions/runs/${runId}`;
  let step = "неизвестный шаг";
  try {
    step = failedStep(await gh(ctx, `/repos/${REPO}/actions/runs/${runId}/jobs`)) || step;
    const run = await gh(ctx, `/repos/${REPO}/actions/runs/${runId}`);
    const runs = await gh(ctx, `/repos/${REPO}/actions/workflows/${run.workflow_id}/runs?per_page=50&created=${encodeURIComponent(">=" + dubaiStartUtc(today))}`);
    for (const r of runs.workflow_runs || []) {
      if (String(r.id) === runId || r.conclusion !== "failure") continue;
      if (failedStep(await gh(ctx, `/repos/${REPO}/actions/runs/${r.id}/jobs`)) === step) { ctx.say(`Сегодня уже сообщали о шаге «${step}», пропускаю`); return "duplicate"; }
    }
  } catch (e) { ctx.say("GitHub API: " + e.message); }
  const text = TEXT.runFailed(step, url);
  ctx.say(text);
  if (ctx.dry) return "dry";
  await sendAdmin(text, ctx);
  return "sent";
}

// 3. WhatsApp бота подключён? (Whapi /health: status.text "AUTH" значит подключён)
async function whatsappStatus(ctx) {
  let last = "нет ответа";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await ctx.fetch("https://gate.whapi.cloud/health", { headers: { Authorization: `Bearer ${ctx.env.WA_TOKEN}`, Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) return { ok: false, status: `ключ не принят, HTTP ${r.status}` };
      if (r.ok) { const s = ((await r.json()).status || {}).text || "неизвестно"; return { ok: s === "AUTH", status: s }; }
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
  ctx.say(`WhatsApp бота: ${s.ok ? "подключён" : "не подключён"} (${s.status})`);
  if (s.ok) return "ok";
  return alert(ctx, dubaiDate(ctx.now), "whatsapp", null, TEXT.whatsapp(s.status));
}

// 2, 4, 5, 6. Ежедневная проверка
async function daily(ctx) {
  const env = ctx.env, today = dubaiDate(ctx.now), out = {};
  if (env.NORUN === "1") out.noRun = await alert(ctx, today, "norun", null, TEXT.noRun(env.RETRIED === "1"));

  const exp = (env.TOKEN_EXPIRES || "").trim();
  if (exp) {
    const t = Date.parse(exp.replace(" UTC", "Z").replace(" ", "T"));
    if (isNaN(t)) ctx.say("Не понял дату срока ключа: " + exp);
    else {
      const expIso = dubaiDate(t), days = dayNum(expIso) - dayNum(today);
      const due = TOKEN_WARN_DAYS.filter(w => days <= w && days > 0 && !logged(ctx, null, "token-" + w, expIso));
      if (due.length) {                                // одно сообщение, даже если пропущены оба порога
        out.token = await alert(ctx, today, "token-" + due[0], expIso, TEXT.token(expIso, days));
        if (out.token === "sent") for (const w of due.slice(1)) fs.appendFileSync(ctx.log, `${today} token-${w} ${expIso}\n`);
      }
    }
  }

  const last = lastDate(ctx, "phone");
  if (!last || dayNum(today) - dayNum(last) >= PHONE_EVERY_DAYS) out.phone = await alert(ctx, today, "phone", null, TEXT.phone());

  if (new Date(dayNum(today) * 86400000).getUTCDay() === 0) out.heartbeat = await heartbeat(ctx, today);
  return out;
}

// 6. Итог недели: дни с успешным запуском notify.yml и отправленные сообщения за 7 дней по сегодня
async function heartbeat(ctx, today) {
  if (logged(ctx, today, "heartbeat")) { ctx.say("Итог недели уже отправлен"); return "duplicate"; }
  const days = Array.from({ length: 7 }, (_, i) => isoOf(dayNum(today) - 6 + i));
  const okDays = new Set();
  const runs = await gh(ctx, `/repos/${REPO}/actions/workflows/notify.yml/runs?per_page=100&status=success&created=${encodeURIComponent(">=" + dubaiStartUtc(days[0]))}`);
  for (const r of runs.workflow_runs || []) okDays.add(dubaiDate(Date.parse(r.created_at)));
  const sentLog = fs.existsSync(ctx.sentLog) ? fs.readFileSync(ctx.sentLog, "utf8").split("\n") : [];
  const sent = sentLog.filter(l => days.includes(l.slice(0, 10))).length;
  const missed = days.filter(d => !okDays.has(d));
  return alert(ctx, today, "heartbeat", null, TEXT.heartbeat(7 - missed.length, sent, missed));
}

// Пробные оповещения каждого вида (сбой шага проверяется настоящим упавшим шагом в проверочном запуске)
async function test(ctx) {
  const head = "🧪 Проверка оповещения, на самом деле всё в порядке.\n\n";
  const exp = isoOf(dayNum(dubaiDate(ctx.now)) + 30);
  for (const text of [TEXT.noRun(true), TEXT.whatsapp("QR"), TEXT.phone(), TEXT.token(exp, 30), TEXT.heartbeat(7, 2, [])]) {
    ctx.say(head + text);
    if (!ctx.dry) await sendAdmin(head + text, ctx);
  }
}

function context(over = {}) {
  return { env: process.env, now: process.env.NOW ? Date.parse(process.env.NOW) : Date.now(), fetch: (...a) => fetch(...a),
    log: LOG, sentLog: SENT_LOG, dry: process.env.DRY_RUN === "1", say: m => console.log(m),
    wait: ms => new Promise(r => setTimeout(r, ms)), ...over };
}

module.exports = { TEXT, adminChat, sendAdmin, runFailed, whatsappStatus, whatsappCheck, daily, heartbeat, test, context, dubaiDate, plural };
if (require.main === module) {
  const cmd = process.argv[2], fn = { "run-failed": runFailed, daily, test }[cmd];
  if (!fn) { console.error("Команда: run-failed | daily | test"); process.exit(2); }
  fn(context()).catch(e => { console.error(e.message); process.exit(1); });
}
