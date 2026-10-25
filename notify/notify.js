// Ежедневное уведомление в семейную группу WhatsApp.
// Запускается каждое утро в 08:00 по Дубаю (GitHub Actions). Если сегодня вечером (с заходом солнца)
// начинается еврейский день рождения, Рош Ходеш или праздник, отправляет одно сообщение в группу.
// В субботу и в Йом Тов (диаспора) не отправляет: такие новости уходят заранее, в предыдущий будний день.
//
// Список семьи и весь календарь берутся из ../index.html, поэтому менять список нужно только там.
//
// Переменные окружения:
//   SEND_MODE     telegram | whatsapp       (по умолчанию telegram)
//   TG_TOKEN      токен Telegram-бота (от @BotFather)          — для режима telegram
//   TG_CHAT_ID    id чата, куда бот присылает готовый текст    — для режима telegram
//   WA_PROVIDER   whapi | greenapi          (по умолчанию whapi) — для режима whatsapp
//   WA_TOKEN      токен API провайдера
//   WA_INSTANCE   id инстанса (только для greenapi)
//   WA_GROUP_ID   id группы, вида 1203630xxxxxxxxx@g.us
//   DRY_RUN=1     только показать сообщение, ничего не отправлять
//   TODAY=YYYY-MM-DD   подставить дату (для проверки)
//   TEST_MESSAGE=1     отправить пробное сообщение
"use strict";
const fs = require("fs");
const path = require("path");

const SITE_URL = "https://zivmayberg-hue.github.io/tehilim/";
const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(__dirname, "sent.log");

// ---------- календарь из index.html ----------
function loadCalendar() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  let js = html.split("<script>")[1].split("</script>")[0];
  js = js.split("const RESULTS")[0];
  return new Function(js + `
    return {PEOPLE, hebrewFromFixed, fixedFromHebrew, fixedFromYMD, birthdayInYear, roshChodesh,
            hLeap, hMonthsInYear, hMonthLength, ruMonth, ruMonthNom, yearsWord};`)();
}
const C = loadCalendar();

const dow = f => ((f % 7) + 7) % 7;                 // 0 = воскресенье ... 6 = суббота
const WEEKDAY_ACC = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];

// Дни Йом Тов в диаспоре (дневное время), месяц/день
const YOM_TOV = new Set(["7/1", "7/2", "7/10", "7/15", "7/16", "7/22", "7/23", "1/15", "1/16", "1/21", "1/22", "3/6", "3/7"]);
function isNoPostDay(f) {
  const h = C.hebrewFromFixed(f);
  return dow(f) === 6 || YOM_TOV.has(`${h.m}/${h.d}`);
}

// ---------- события, которые начинаются в еврейский день f ----------
// start: "evening" = накануне вечером (с заходом солнца), "dawn" = в день f с рассвета
function adarLast(y) { return C.hLeap(y) ? 13 : 12; }
function holidaysOn(f) {
  const h = C.hebrewFromFixed(f), y = h.y, out = [];
  const at = (m, d) => C.fixedFromHebrew(y, m, d) === f;
  const fastAt = (m, d) => {                         // пост, переносимый с субботы
    let g = C.fixedFromHebrew(y, m, d);
    if (dow(g) === 6) g += 1;
    return g === f;
  };
  if (at(7, 1)) out.push({ start: "evening", text: `Рош а-Шана, начало ${y} года. Шана това у-метука! 🍎🍯` });
  if (fastAt(7, 3)) out.push({ start: "dawn", text: "пост Гедальи, с рассвета до выхода звёзд." });
  if (at(7, 10)) out.push({ start: "evening", text: "Йом Кипур. Гмар хатима това! 🕯️" });
  if (at(7, 15)) out.push({ start: "evening", text: "Суккот. Хаг самеах! 🌿" });
  if (at(7, 22)) out.push({ start: "evening", text: "Шмини Ацерет, а на следующий вечер Симхат Тора. Хаг самеах! 📜" });
  if (at(9, 25)) out.push({ start: "evening", text: "Ханука, зажигаем первую свечу. Хаг Ханука самеах! 🕎" });
  {                                                  // 10 Тевета никогда не выпадает на субботу
    if (at(10, 10)) out.push({ start: "dawn", text: "пост 10 Тевета, с рассвета до выхода звёзд." });
  }
  if (at(11, 15)) out.push({ start: "evening", text: "Ту би-Шват, Новый год деревьев. 🌳" });
  {                                                  // пост Эстер: если 13 Адара в субботу, переносится на четверг
    let g = C.fixedFromHebrew(y, adarLast(y), 13);
    if (dow(g) === 6) g -= 2;
    if (g === f) out.push({ start: "dawn", text: "пост Эстер, с рассвета до выхода звёзд." });
  }
  if (at(adarLast(y), 14)) out.push({ start: "evening", text: "Пурим. Пурим самеах! 🎭" });
  if (at(1, 15)) out.push({ start: "evening", text: "Песах, первый седер. Хаг кашер ве-самеах! 🍷" });
  if (at(2, 18)) out.push({ start: "evening", text: "Лаг ба-Омер. 🔥" });
  if (at(3, 6)) out.push({ start: "evening", text: "Шавуот, праздник дарования Торы. Хаг самеах! 🌾" });
  if (fastAt(4, 17)) out.push({ start: "dawn", text: "пост 17 Тамуза, с рассвета до выхода звёзд." });
  if (fastAt(5, 9)) out.push({ start: "evening", text: "Тиша бе-Ав, пост до выхода звёзд следующего дня." });

  const rc = C.roshChodesh(h);                       // Рош Ходеш: объявляем только первый день
  if (rc && rc.kind === "rc") {
    const first = h.d === 30 || rc.day === 1;
    if (first) {
      const two = h.d === 30;
      out.push({ start: "evening", rc: true,
        text: `Рош Ходеш ${C.ruMonthNom(h.d === 30 ? (rc.month === 1 ? y : y) : y, rc.month)}${two ? " (два дня)" : ""}. Добавляем Псалом 104 «Борхи нафши». 🌙` });
    }
  }
  return out;
}

function birthdaysOn(f) {
  const out = [];
  const ty = C.hebrewFromFixed(f).y;
  for (const p of C.PEOPLE) {
    const [by, bm, bd] = p.born.split("-").map(Number);
    let bf = C.fixedFromYMD(by, bm - 1, bd); if (p.afterSunset) bf += 1;
    const bh = C.hebrewFromFixed(bf);
    for (const y of [ty]) {
      if (y <= bh.y) continue;
      if (C.birthdayInYear(bh, y) === f) {
        const age = y - bh.y;
        out.push({ start: "evening", name: p.name, age,
          text: `еврейский день рождения: ${p.name} (${bh.d} ${C.ruMonth(bh.y, bh.m)}), ${age} ${C.yearsWord(age)}. Теперь читаем Псалом ${age + 1}. Мазл тов! 🎉` });
      }
    }
  }
  return out;
}

// ---------- сообщение на утро дня today ----------
function relWhen(today, f, start) {
  // f = еврейский день события. Вечерние события начинаются вечером дня f-1, «рассветные» утром дня f.
  const civil = start === "evening" ? f - 1 : f;
  const diff = civil - today;
  const part = start === "evening" ? "вечером" : "";
  if (start === "evening") {
    const ps = dow(civil) === 6 ? ", после Шабата," : "";
    if (diff === 0) return "Сегодня вечером" + ps;
    if (diff === 1) return "Завтра вечером" + ps;
    return cap(`${WEEKDAY_ACC[dow(civil)]} вечером`) + ps;
  }
  if (diff === 1) return "Завтра";
  if (diff === 2) return "Послезавтра";
  return cap(WEEKDAY_ACC[dow(civil)]) + (part ? " " + part : "");
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function eventsFor(today) {
  if (isNoPostDay(today)) return null;              // в субботу и Йом Тов молчим
  const days = [today + 1];                          // события, которые начинаются сегодня вечером
  for (let k = 1; isNoPostDay(today + k) && k < 5; k++) days.push(today + k + 1);
  const ev = [];
  for (const f of days) {
    for (const e of birthdaysOn(f)) ev.push({ ...e, f });
    for (const e of holidaysOn(f)) ev.push({ ...e, f });
  }
  return ev;
}

function buildMessage(today) {
  const ev = eventsFor(today);
  if (!ev || ev.length === 0) return null;
  const lines = ["Доброе утро, семья! ☀️", ""];
  for (const e of ev) {
    const when = relWhen(today, e.f, e.start);
    lines.push(e.start === "dawn" ? `${when} ${e.text}` : `${when} начинается ${e.text}`);
  }
  lines.push("", `Теилим для семьи: ${SITE_URL}`);
  return { text: lines.join("\n"), events: ev };
}

// ---------- отправка ----------
// Полуавтомат: готовый текст приходит в Telegram с кнопкой «Отправить в WhatsApp»
async function sendTelegram(text) {
  const token = process.env.TG_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!token || !chat) throw new Error("TG_TOKEN и TG_CHAT_ID должны быть заданы");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const wa = "https://wa.me/?text=" + encodeURIComponent(text);
  const withButton = { chat_id: chat, text, disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: "📲 Отправить в WhatsApp", url: wa }]] } };
  const plain = { chat_id: chat, text, disable_web_page_preview: true };
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const payload of (wa.length <= 2000 ? [withButton, plain] : [plain])) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const body = await r.text();
        if (r.ok) { console.log("Отправлено в Telegram" + (payload === plain ? " (без кнопки)" : "")); return; }
        console.log(`Попытка ${attempt}: Telegram HTTP ${r.status} ${body.slice(0, 200)}`);
        if (r.status !== 400) break;               // 400 = кнопка не подошла, пробуем без неё
      } catch (e) { console.log(`Попытка ${attempt}: ${e.message}`); break; }
    }
    await new Promise(res => setTimeout(res, 5000 * attempt));
  }
  throw new Error("Не удалось отправить в Telegram");
}

async function send(text) {
  if ((process.env.SEND_MODE || "telegram").toLowerCase() === "telegram") return sendTelegram(text);
  const provider = (process.env.WA_PROVIDER || "whapi").toLowerCase();
  const token = process.env.WA_TOKEN, group = process.env.WA_GROUP_ID;
  if (!token || !group) throw new Error("WA_TOKEN и WA_GROUP_ID должны быть заданы");
  let url, opts;
  if (provider === "whapi") {
    url = "https://gate.whapi.cloud/messages/text";
    opts = { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
             body: JSON.stringify({ to: group, body: text }) };
  } else if (provider === "greenapi") {
    const inst = process.env.WA_INSTANCE;
    if (!inst) throw new Error("WA_INSTANCE должен быть задан для greenapi");
    const host = process.env.WA_API_HOST || "https://api.green-api.com";
    url = `${host}/waInstance${inst}/sendMessage/${token}`;
    opts = { method: "POST", headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ chatId: group, message: text }) };
  } else throw new Error("Неизвестный WA_PROVIDER: " + provider);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, opts);
      const body = await r.text();
      if (r.ok) { console.log("Отправлено:", r.status, body.slice(0, 200)); return; }
      console.log(`Попытка ${attempt}: HTTP ${r.status} ${body.slice(0, 300)}`);
    } catch (e) { console.log(`Попытка ${attempt}: ${e.message}`); }
    await new Promise(res => setTimeout(res, 5000 * attempt));
  }
  throw new Error("Не удалось отправить сообщение");
}

function todayFixed() {
  if (process.env.TODAY) { const [y, m, d] = process.env.TODAY.split("-").map(Number); return C.fixedFromYMD(y, m - 1, d); }
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = p.split("-").map(Number);
  return C.fixedFromYMD(y, m - 1, d);
}
function isoFromFixed(f) { return new Date((f - 719163) * 86400000).toISOString().slice(0, 10); }

async function main() {
  const today = todayFixed(), iso = isoFromFixed(today);
  const dry = process.env.DRY_RUN === "1";
  if (process.env.TEST_MESSAGE === "1") {
    const text = `Проверка связи ✅\nЭто бот «Теилим для семьи». Утром, перед днями рождения, Рош Ходешем и праздниками, здесь будет короткое напоминание.\n${SITE_URL}`;
    console.log(text); if (!dry) await send(text); return;
  }
  const msg = buildMessage(today);
  if (!msg) { console.log(iso, "сообщений нет"); return; }
  const already = fs.existsSync(LOG) && fs.readFileSync(LOG, "utf8").split("\n").some(l => l.startsWith(iso + " "));
  console.log(msg.text);
  if (already && !dry) { console.log("Сегодня уже отправлено, пропускаю."); return; }
  if (dry) return;
  await send(msg.text);
  fs.appendFileSync(LOG, `${iso} ${msg.events.map(e => e.name ? "ДР:" + e.name : e.text.split(/[.,]/)[0]).join(" | ")}\n`);
}

module.exports = { send, sendTelegram, buildMessage, eventsFor, holidaysOn, birthdaysOn, isNoPostDay, C, dow };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
