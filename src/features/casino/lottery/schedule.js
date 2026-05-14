// 樂透各玩法的開獎排程工具。
// 玩法可在 casino.json 用 drawWeekdays (1=Mon..7=Sun, luxon 慣例) + drawHour 設定。

const { DateTime } = require("luxon");

const { casino } = require("../../../config");

const TZ = "Asia/Taipei";
const DEFAULT_WEEKDAYS = [7]; // 週日
const DEFAULT_HOUR = 21;

function getTypeSchedule(lotteryType) {
  const t = casino?.lottery?.types?.[lotteryType] || {};
  const weekdays = Array.isArray(t.drawWeekdays) && t.drawWeekdays.length
    ? [...t.drawWeekdays]
    : [...DEFAULT_WEEKDAYS];
  const hour = Number.isInteger(t.drawHour) ? t.drawHour : DEFAULT_HOUR;
  return {
    weekdays: weekdays.filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b),
    hour,
  };
}

// luxon 1..7 (Mon..Sun) → node-cron 0..6 (Sun..Sat)
function luxonToCronWeekday(d) {
  return d % 7;
}

function buildDrawCron(lotteryType) {
  const { weekdays, hour } = getTypeSchedule(lotteryType);
  const cronDays = weekdays
    .map(luxonToCronWeekday)
    .sort((a, b) => a - b)
    .join(",");
  return `0 ${hour} * * ${cronDays}`;
}

function buildSubscriptionCron(lotteryType) {
  const { weekdays, hour } = getTypeSchedule(lotteryType);
  // 開獎前 30 分鐘扣款。假設 hour >= 1(設定要避開 0 點)。
  const subHour = Math.max(0, hour - 1);
  const cronDays = weekdays
    .map(luxonToCronWeekday)
    .sort((a, b) => a - b)
    .join(",");
  return `30 ${subHour} * * ${cronDays}`;
}

/**
 * 取得指定玩法下一次開獎時間(嚴格大於 after)。
 */
function nextDrawTime(lotteryType, after = DateTime.now().setZone(TZ)) {
  const { weekdays, hour } = getTypeSchedule(lotteryType);
  let d = after.set({ hour, minute: 0, second: 0, millisecond: 0 });
  for (let i = 0; i < 14; i++) {
    if (weekdays.includes(d.weekday) && d > after) return d;
    d = d.plus({ days: 1 });
  }
  return d;
}

module.exports = {
  getTypeSchedule,
  buildDrawCron,
  buildSubscriptionCron,
  nextDrawTime,
};
