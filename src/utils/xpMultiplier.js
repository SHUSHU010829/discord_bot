const { DateTime } = require("luxon");
const cron = require("node-cron");

const { xpEvents } = require("../config");

/**
 * cron 欄位支援：
 *   - 關鍵字 "weekend" / "friday_night"
 *   - 標準 cron range（用 node-cron 解析）
 */
function matchKeyword(keyword, now) {
  if (keyword === "weekend") {
    // 0 = Sunday, 6 = Saturday in luxon weekday: 6/7 = Sat/Sun
    return now.weekday === 6 || now.weekday === 7;
  }
  if (keyword === "friday_night") {
    return now.weekday === 5 && now.hour >= 19 && now.hour < 24;
  }
  return false;
}

function matchCronRange(expr, now) {
  try {
    // 用簡單方式：把 cron expr 當 schedule 註冊一次驗證能 parse，但這裡只需要當下時間是否符合
    // node-cron 沒有公開 match API，自己手寫 minute/hour/dayOfMonth/month/dayOfWeek match
    const [m, h, dom, mon, dow] = expr.trim().split(/\s+/);
    const matchField = (field, value, max) => {
      if (field === "*") return true;
      if (field.includes(",")) {
        return field.split(",").some((p) => matchField(p, value, max));
      }
      if (field.includes("-")) {
        const [a, b] = field.split("-").map(Number);
        return value >= a && value <= b;
      }
      if (field.startsWith("*/")) {
        const step = Number(field.slice(2));
        return value % step === 0;
      }
      return Number(field) === value;
    };
    const minute = now.minute;
    const hour = now.hour;
    const dayOfMonth = now.day;
    const month = now.month;
    // luxon weekday 1=Mon..7=Sun，cron dow 0/7=Sun, 1=Mon
    const dayOfWeek = now.weekday === 7 ? 0 : now.weekday;
    return (
      matchField(m, minute) &&
      matchField(h, hour) &&
      matchField(dom, dayOfMonth) &&
      matchField(mon, month) &&
      (matchField(dow, dayOfWeek) || (dayOfWeek === 0 && matchField(dow, 7)))
    );
  } catch {
    return false;
  }
}

function isEventActive(event, now) {
  if (!event?.cron) return false;
  if (event.cron === "weekend" || event.cron === "friday_night") {
    return matchKeyword(event.cron, now);
  }
  return matchCronRange(event.cron, now);
}

/**
 * 取得當下所有適用 event 的倍率乘積。
 * source 可選 "message" / "voice" / "daily" / "reaction" — 對應 event.appliesTo（沒設則 all）
 */
function getCurrentMultiplier(source, now) {
  if (!Array.isArray(xpEvents) || xpEvents.length === 0) return { multiplier: 1, names: [] };
  const at = now || DateTime.now().setZone("Asia/Taipei");
  let mult = 1;
  const names = [];
  for (const ev of xpEvents) {
    if (!ev?.multiplier || ev.multiplier <= 0) continue;
    const applies = !ev.appliesTo || ev.appliesTo.length === 0 || ev.appliesTo.includes(source);
    if (!applies) continue;
    if (isEventActive(ev, at)) {
      mult *= ev.multiplier;
      names.push(ev.name || "未命名活動");
    }
  }
  return { multiplier: mult, names };
}

// 防呆：模組載入時驗證 cron 字串能 parse（非關鍵字者）
try {
  if (Array.isArray(xpEvents)) {
    for (const ev of xpEvents) {
      if (!ev?.cron) continue;
      if (ev.cron === "weekend" || ev.cron === "friday_night") continue;
      if (!cron.validate(ev.cron)) {
        console.log(`[WARNING] xpEvents: invalid cron "${ev.cron}" for "${ev.name}"`);
      }
    }
  }
} catch {
  /* noop */
}

module.exports = { getCurrentMultiplier };
