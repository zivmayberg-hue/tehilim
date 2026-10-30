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
//   NOW=2026-10-28T07:13:00+04:00   подставить момент запуска (для проверки опоздания)
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
            hLeap, hMonthsInYear, hMonthLength, ruMonth, ruMonthNom, yearsWord,
            holidaySpans, spanTimes, sunsetOn, candlesOn, havdalahOn};`)();
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
  if (fastAt(7, 3)) out.push({ start: "dawn", fast: "gedalia", text: "пост Гедальи, с рассвета до выхода звёзд." });
  if (at(7, 10)) out.push({ start: "evening", fast: "yk", text: "Йом Кипур. Гмар хатима това! 🕯️" });
  if (at(7, 15)) out.push({ start: "evening", text: "Суккот. Хаг самеах! 🌿" });
  if (at(7, 22)) out.push({ start: "evening", text: "Шмини Ацерет, а на следующий вечер Симхат Тора. Хаг самеах! 📜" });
  if (at(9, 25)) out.push({ start: "evening", chanukah: true, text: "Ханука. Хаг Ханука самеах! 🕎" });
  {                                                  // 10 Тевета никогда не выпадает на субботу
    if (at(10, 10)) out.push({ start: "dawn", fast: "tevet10", text: "пост 10 Тевета, с рассвета до выхода звёзд." });
  }
  if (at(11, 15)) out.push({ start: "evening", text: "Ту би-Шват, Новый год деревьев. 🌳" });
  {                                                  // пост Эстер: если 13 Адара в субботу, переносится на четверг
    let g = C.fixedFromHebrew(y, adarLast(y), 13);
    if (dow(g) === 6) g -= 2;
    if (g === f) out.push({ start: "dawn", fast: "esther", text: "пост Эстер, с рассвета до выхода звёзд." });
  }
  if (at(adarLast(y), 14)) out.push({ start: "evening", purim: true, text: "Пурим. Пурим самеах! 🎭" });
  if (at(1, 15)) out.push({ start: "evening", text: "Песах, первый седер. Хаг кашер ве-самеах! 🍷" });
  if (at(2, 18)) out.push({ start: "evening", text: "Лаг ба-Омер. 🔥" });
  if (at(3, 6)) out.push({ start: "evening", text: "Шавуот, праздник дарования Торы. Хаг самеах! 🌾" });
  if (fastAt(4, 17)) out.push({ start: "dawn", fast: "tammuz17", text: "пост 17 Тамуза, с рассвета до выхода звёзд." });
  if (fastAt(5, 9)) out.push({ start: "evening", fast: "av9", text: "Тиша бе-Ав, пост до выхода звёзд следующего дня." });

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

// ---------- Шабат: время свечей и исхода, недельная глава ----------
const SHABBAT_CITIES = [
  { ru: "Дубай",    lat: 25.2048, lon: 55.2708, il: false, tz: "Asia/Dubai" },
  { ru: "Герцлия",  lat: 32.1663, lon: 34.8436, il: true,  tz: "Asia/Jerusalem" },
  { ru: "Бухарест", lat: 44.4268, lon: 26.1025, il: false, tz: "Europe/Bucharest" },
  { ru: "Киев",     lat: 50.4501, lon: 30.5234, il: false, tz: "Europe/Kiev" },
  { ru: "Черновцы", lat: 48.2915, lon: 25.9403, il: false, tz: "Europe/Kiev" },
];
const PARSHA_RU = {
  "Bereshit":"Берешит","Noach":"Ноах","Lech-Lecha":"Лех Леха","Vayera":"Вайера","Chayei Sara":"Хаей Сара","Toldot":"Толдот",
  "Vayetzei":"Вайеце","Vayishlach":"Вайишлах","Vayeshev":"Вайешев","Miketz":"Микец","Vayigash":"Ваигаш","Vayechi":"Вайехи",
  "Shemot":"Шмот","Vaera":"Ваэра","Bo":"Бо","Beshalach":"Бешалах","Yitro":"Итро","Mishpatim":"Мишпатим","Terumah":"Трума",
  "Tetzaveh":"Тецаве","Ki Tisa":"Ки Тиса","Vayakhel":"Ваякгель","Pekudei":"Пкудей","Vayikra":"Ваикра","Tzav":"Цав",
  "Shmini":"Шмини","Tazria":"Тазриа","Metzora":"Мецора","Achrei Mot":"Ахарей Мот","Kedoshim":"Кдошим","Emor":"Эмор",
  "Behar":"Беар","Bechukotai":"Бехукотай","Bamidbar":"Бамидбар","Nasso":"Насо","Beha'alotcha":"Беаалотха","Sh'lach":"Шлах",
  "Korach":"Корах","Chukat":"Хукат","Balak":"Балак","Pinchas":"Пинхас","Matot":"Матот","Masei":"Масэй","Devarim":"Дварим",
  "Vaetchanan":"Ваэтханан","Eikev":"Экев","Re'eh":"Ре'э","Shoftim":"Шофтим","Ki Teitzei":"Ки Теце","Ki Tavo":"Ки Таво",
  "Nitzavim":"Ницавим","Vayeilech":"Вайелех","Ha'azinu":"Аазину",
};
// Недельная глава на русском на ru.chabad.org: постоянные адреса страниц глав (список «Все главы Торы»)
const PARSHA_AID = {
  "Bereshit":719867,"Noach":719868,"Lech-Lecha":719869,"Vayera":719870,"Chayei Sara":719873,"Toldot":719874,"Vayetzei":719875,
  "Vayishlach":719877,"Vayeshev":719878,"Miketz":719879,"Vayigash":719880,"Vayechi":719881,"Shemot":719920,"Vaera":719921,
  "Bo":719922,"Beshalach":719923,"Yitro":719924,"Mishpatim":719925,"Terumah":719926,"Tetzaveh":719927,"Ki Tisa":719928,
  "Vayakhel":719929,"Pekudei":719930,"Vayikra":719931,"Tzav":719932,"Shmini":719933,"Tazria":719934,"Metzora":719935,
  "Achrei Mot":719936,"Kedoshim":719937,"Emor":719938,"Behar":719939,"Bechukotai":719940,"Bamidbar":719941,"Nasso":719942,
  "Beha'alotcha":719943,"Sh'lach":719944,"Korach":719946,"Chukat":719947,"Balak":719948,"Pinchas":719949,"Matot":719950,
  "Masei":719951,"Devarim":719952,"Vaetchanan":719953,"Eikev":719954,"Re'eh":719955,"Shoftim":719956,"Ki Teitzei":719957,
  "Ki Tavo":719958,"Nitzavim":719959,"Vayeilech":719960,"Ha'azinu":719961,
  "Vayakhel-Pekudei":856824,"Tazria-Metzora":877197,"Achrei Mot-Kedoshim":877217,"Behar-Bechukotai":877218,
  "Chukat-Balak":932753,"Matot-Masei":932757,"Nitzavim-Vayeilech":967093,
};
const parshaLink = parsha => PARSHA_AID[parsha.join("-")] ? `https://ru.chabad.org/parshah/default_cdo/aid/${PARSHA_AID[parsha.join("-")]}` : null;
let HC = null;
function hebcal() { if (!HC) HC = require("@hebcal/core"); return HC; }
function civil(f) { const d = new Date((f - 719163) * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; }
function hhmm(date, tz) { return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date); }
function parshaText(parsha) {
  const H = hebcal();
  const ru = parsha.map(p => PARSHA_RU[p] || p).join("-");
  const he = parsha.map(p => H.Locale.gettext(p, "he")).join("-").replace(/־/g, " ").replace(/[֑-ֽֿ-ׇ]/g, "");
  return `${ru} (${he})`;
}
function shabbatOn(f) {                               // f = суббота (еврейский день начинается в пятницу вечером)
  if (dow(f) !== 6) return [];
  const H = hebcal();
  const fr = civil(f - 1), sa = civil(f);
  const rows = [];
  for (const c of SHABBAT_CITIES) {
    const loc = new H.Location(c.lat, c.lon, c.il, c.tz, c.ru, c.il ? "IL" : "XX");
    const evs = H.HebrewCalendar.calendar({ start: new Date(fr.y, fr.m, fr.d), end: new Date(sa.y, sa.m, sa.d),
      location: loc, candlelighting: true, il: c.il, candleLightingMins: 18, havdalahDeg: 8.5, noHolidays: false });
    let light = null, out = null;
    for (const e of evs) {
      if (!e.eventTime) continue;
      const g = e.getDate().greg(), sameSat = g.getFullYear() === sa.y && g.getMonth() === sa.m && g.getDate() === sa.d;
      const desc = e.getDesc();
      if (!sameSat && desc === "Candle lighting" && !light) light = e.eventTime;
      if (sameSat && (desc === "Havdalah" || desc === "Candle lighting")) out = e.eventTime;
    }
    rows.push(`${c.ru}: 🕯️ ${light ? hhmm(light, c.tz) : "—"}  ✨ ${out ? hhmm(out, c.tz) : "—"}`);
  }
  const hd = new H.HDate(new Date(sa.y, sa.m, sa.d));
  const dia = H.getSedra(hd.getFullYear(), false).lookup(hd), isr = H.getSedra(hd.getFullYear(), true).lookup(hd);
  let parsha;
  if (dia.chag) parsha = "В эту субботу праздничное чтение Торы.";
  else parsha = `Недельная глава: ${parshaText(dia.parsha)}.`;
  const link = dia.chag ? null : parshaLink(dia.parsha);     // ссылка по главе диаспоры
  const same = dia.chag === isr.chag && dia.parsha.join() === isr.parsha.join();
  if (!same) parsha += isr.chag ? " В Израиле в эту субботу праздничное чтение." : ` В Израиле читают другую главу: ${parshaText(isr.parsha)}.`;
  return [{ start: "evening", shabbat: true, text: "Шабат", parsha, rows, link }];
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
function relWhen(today, f, start, fast = false) {
  // f = еврейский день события. Вечерние события начинаются вечером дня f-1, «рассветные» утром дня f.
  const civil = start === "evening" ? f - 1 : f;
  const diff = civil - today;
  const part = start === "evening" ? "вечером" : "";
  if (start === "evening") {
    const ps = dow(civil) === 6 && !fast ? ", после Шабата," : "";   // пост в субботу вечером начинается с заходом, ещё в Шабат
    if (diff === 0) return "Сегодня вечером" + ps;
    if (diff === 1) return "Завтра вечером" + ps;
    return cap(`${WEEKDAY_ACC[dow(civil)]} вечером`) + ps;
  }
  if (diff === 1) return "Завтра";
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
  for (const f of days) for (const e of shabbatOn(f)) ev.push({ ...e, f });   // Шабат в конце сообщения
  return ev;
}

// ---------- времена Хануки и постов: те же функции, что на странице (index.html) ----------
// Время до ближайшей минуты, как на странице (рассвет и выход звёзд там уже округлены вниз и вверх, как на chabad.org)
function hm(d, tz) { return hhmm(new Date(Math.round(Math.floor(d / 1000) / 60) * 60000), tz); }
function spanOf(key, f) {                              // праздник из index.html, который начинается в еврейский день f
  for (const y of [C.hebrewFromFixed(f).y, C.hebrewFromFixed(f).y + 1]) {
    const s = C.holidaySpans(y).find(x => x.key === key && x.f0 === f);
    if (s) return s;
  }
  throw new Error(`нет праздника ${key} в день ${f}`);
}
// Строки поста по пяти городам
function fastLines(key, f) {
  const s = spanOf(key, f), rows = SHABBAT_CITIES.map(c => ({ c, t: C.spanTimes(s, c) }));
  if (key === "yk") return ["Свечи 🕯️ и время поста, до выхода звёзд ✨ на следующий вечер:",
    ...rows.map(({ c, t }) => `${c.ru}: 🕯️ ${hm(t.start, c.tz)}, пост с ${hm(t.fastStart, c.tz)} до ✨ ${hm(t.end, c.tz)}`)];
  return ["Время поста:", ...rows.map(({ c, t }) => `${c.ru}: с ${hm(t.fastStart, c.tz)} до ${hm(t.end, c.tz)}`)];
}
// Ханука по обычаю Хабада: сразу после захода; в пятницу до свечей Шабата; в субботу вечером после авдалы
const CHANUKAH_RULE = "В пятницу свечи Хануки зажигаем до свечей Шабата, в субботу вечером после авдалы, в остальные дни сразу после захода солнца.";
function chanukahLines(today, f, when) {               // f = 25 Кислева, первая свеча вечером гражданского дня f - 1
  const civil = f - 1, wd = dow(civil), day = civil === today ? "Сегодня" : civil === today + 1 ? "Завтра" : cap(WEEKDAY_ACC[dow(civil)]);
  let head, time, pre;
  if (wd === 5) { head = `${day} зажигаем 1 свечу, до свечей Шабата:`; time = c => C.candlesOn(civil, c); pre = "до "; }
  else if (wd === 6) { head = `${day} вечером зажигаем 1 свечу, после авдалы:`; time = c => C.havdalahOn(civil, c); pre = "после "; }
  else { head = `${day} вечером зажигаем 1 свечу, сразу после захода солнца:`; time = c => C.sunsetOn(civil, c); pre = ""; }
  return [`🕎 ${when} начинается Ханука. Хаг Ханука самеах!`, head,
    ...SHABBAT_CITIES.map(c => `${c.ru}: ${pre}${hm(time(c), c.tz)}`), CHANUKAH_RULE];
}
// Пятница в Хануку (2-я свеча и дальше): одна строка в блоке Шабата
function chanukahFridayLine(today, sat) {
  const f0 = C.fixedFromHebrew(C.hebrewFromFixed(sat).y, 9, 25), night = sat - f0 + 1;
  if (night < 2 || night > 8) return null;
  return `🕎 ${sat - 1 === today ? "Сегодня" : "В пятницу"} ${night}-я свеча, зажечь до свечей Шабата.`;
}
// Пурим сразу после поста Эстер: напоминаем, когда пост заканчивается
function purimAfterFastLines(today, f) {
  const s = C.holidaySpans(C.hebrewFromFixed(f).y).find(x => x.key === "esther");
  if (!s || s.f0 !== f - 1) return [];
  const when = s.f0 === today ? "сегодня" : s.f0 === today + 1 ? "завтра" : WEEKDAY_ACC[dow(s.f0)];
  return [`Пост Эстер заканчивается ${when} с выходом звёзд:`,
    ...SHABBAT_CITIES.map(c => `${c.ru}: ${hm(C.spanTimes(s, c).end, c.tz)}`)];
}

function buildMessage(today) {
  const ev = eventsFor(today);
  if (!ev || ev.length === 0) return null;
  const lines = ["Доброе утро, семья! ☀️", ""], links = [];
  let block = false;                                   // после блока с таблицей времени нужна пустая строка
  const gap = () => { if (lines.length > 2) lines.push(""); };
  for (const e of ev) {
    const when = relWhen(today, e.f, e.start, !!e.fast);
    if (e.shabbat) {
      gap();
      const ch = chanukahFridayLine(today, e.f);
      lines.push(`🕯️ ${when} начинается Шабат.`, ...(ch ? [ch] : []), e.parsha, "", "Зажигание свечей 🕯️ и исход Шабата ✨:", ...e.rows, "", "Шабат шалом! 🤍");
      if (e.link) links.push(`Недельная глава на русском: ${e.link}`);
      block = true;
      continue;
    }
    if (e.chanukah) { gap(); lines.push(...chanukahLines(today, e.f, when)); block = true; continue; }
    if (block) { lines.push(""); block = false; }
    lines.push(e.start === "dawn" ? `${when} ${e.text}` : `${when} начинается ${e.text}`);
    const extra = e.fast ? fastLines(e.fast, e.f) : e.purim ? purimAfterFastLines(today, e.f) : [];
    if (extra.length) { lines.push(...extra); block = true; }
  }
  lines.push("", `Теилим для семьи: ${SITE_URL}`, ...links);
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
  try { return await sendWhatsApp(text); }
  catch (e) {                                          // запасной путь: если WhatsApp не сработал, текст приходит в Telegram
    console.log("WhatsApp не сработал:", e.message);
    if (!process.env.TG_TOKEN || !process.env.TG_CHAT_ID) throw e;
    await sendTelegram("⚠️ Бот не смог отправить в WhatsApp группу. Отправьте вручную:\n\n" + text);
    console.log("Отправлено в Telegram как запасной вариант");
  }
}

async function sendWhatsApp(text) {
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

function todayFixed(now = Date.now()) {
  if (process.env.TODAY) { const [y, m, d] = process.env.TODAY.split("-").map(Number); return C.fixedFromYMD(y, m - 1, d); }
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const [y, m, d] = p.split("-").map(Number);
  return C.fixedFromYMD(y, m - 1, d);
}
function isoFromFixed(f) { return new Date((f - 719163) * 86400000).toISOString().slice(0, 10); }

// ---------- опоздание ----------
// Утром запусков несколько (GitHub часто запускает по расписанию с опозданием); отправляет первый, остальные видят
// сегодняшнюю строку в sent.log и останавливаются. Если запуск начался позже, чем за 2 часа до заката в Дубае,
// «сегодня вечером» в группе звучит уже поздно: тогда сообщение уходит только в Telegram, с пометкой.
const LATE_BEFORE_SUNSET_MS = 2 * 3600 * 1000;
const LATE_PREFIX = "⚠️ Напоминание опоздало, отправьте вручную, если ещё актуально:\n\n";
function lateCutoff(today) {
  const H = hebcal(), c = civil(today), dubai = SHABBAT_CITIES[0];
  const sunset = new H.Zmanim(new H.GeoLocation(null, dubai.lat, dubai.lon, 0, dubai.tz), new Date(c.y, c.m, c.d), false).sunset();
  return new Date(sunset.getTime() - LATE_BEFORE_SUNSET_MS);
}
const dubaiTime = d => new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

// Один запуск. Возвращает "none" | "already" | "sent" | "late" (в Telegram) | "dry"
async function run({ today, now, dry = false, test = false, log = LOG, sendGroup = send, sendLate = sendTelegram }) {
  const iso = isoFromFixed(today);
  if (test) {
    const text = `Проверка связи ✅\nЭто бот «Теилим для семьи». Утром, перед днями рождения, Рош Ходешем и праздниками, здесь будет короткое напоминание.\n${SITE_URL}`;
    console.log(text); if (!dry) await sendGroup(text); return dry ? "dry" : "sent";
  }
  const msg = buildMessage(today);
  if (!msg) { console.log(iso, "сообщений нет"); return "none"; }
  const already = fs.existsSync(log) && fs.readFileSync(log, "utf8").split("\n").some(l => l.startsWith(iso + " "));
  if (already) { console.log(msg.text); console.log("Сегодня уже отправлено, пропускаю."); return "already"; }
  const cutoff = lateCutoff(today), late = now >= cutoff.getTime(), text = late ? LATE_PREFIX + msg.text : msg.text;
  if (late) console.log(`Запуск позже ${dubaiTime(cutoff)} по Дубаю (за 2 часа до заката): в группу не пишу, отправляю в Telegram.`);
  console.log(text);
  if (dry) { console.log(`Пробный запуск: ничего не отправлено (${late ? "ушло бы в Telegram" : "ушло бы в группу"}).`); return "dry"; }
  if (late) await sendLate(text); else await sendGroup(text);
  fs.appendFileSync(log, `${iso} ${msg.events.map(e => e.name ? "ДР:" + e.name : e.text.split(/[.,]/)[0]).join(" | ")}${late ? " (опоздание, Telegram)" : ""}\n`);
  return late ? "late" : "sent";
}

async function main() {
  const now = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
  await run({ today: todayFixed(now), now, dry: process.env.DRY_RUN === "1", test: process.env.TEST_MESSAGE === "1" });
}

module.exports = { send, sendTelegram, buildMessage, eventsFor, holidaysOn, birthdaysOn, isNoPostDay, C, dow, run, lateCutoff, LATE_PREFIX };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
