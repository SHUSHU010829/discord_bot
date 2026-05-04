// 期中提醒排程生成。為新一期生成 1-2 個提醒時間點。

const crypto = require("crypto");
const { DateTime } = require("luxon");

const { casino } = require("../../../config");

const TZ = "Asia/Taipei";

function getReminderConfig() {
  const cfg = casino?.lottery?.reminders || {};
  return {
    enabled: cfg.enabled !== false,
    countRange: cfg.countRange || [1, 2],
    earliestAfterOpenHours: cfg.earliestAfterOpenHours ?? 24,
    latestBeforeDrawHours: cfg.latestBeforeDrawHours ?? 24,
    minIntervalHours: cfg.minIntervalHours ?? 48,
    daytimeWindow: cfg.daytimeWindow || { startHour: 10, endHour: 22 },
  };
}

/**
 * 為新一期生成期中提醒時間點。
 * @param {Date} drawScheduledAt 開獎時間
 * @returns {Array<{ fireAt: Date, fired: false, firedAt: null }>}
 */
function generateReminderSchedule(drawScheduledAt) {
  const cfg = getReminderConfig();
  if (!cfg.enabled) return [];

  const now = DateTime.now().setZone(TZ);
  const drawTime = DateTime.fromJSDate(drawScheduledAt).setZone(TZ);

  const earliestCandidate = now.plus({ hours: cfg.earliestAfterOpenHours });
  // 期中提醒必須在「現在」之後,避免補建期數時排到過去時間
  const earliest = earliestCandidate < now ? now : earliestCandidate;
  const latest = drawTime.minus({ hours: cfg.latestBeforeDrawHours });

  const windowHours = latest.diff(earliest, "hours").hours;
  if (windowHours < 12) {
    console.log(
      `[LOTTERY] 期中提醒窗口太短(${windowHours.toFixed(1)}h),跳過`.yellow
    );
    return [];
  }

  const [minCount, maxCount] = cfg.countRange;
  let targetCount = crypto.randomInt(minCount, maxCount + 1);
  if (windowHours < cfg.minIntervalHours && targetCount > 1) {
    targetCount = 1;
  }

  const reminders = [];
  let attempts = 0;
  const maxAttempts = 80;
  const windowMinutes = Math.floor(windowHours * 60);

  while (reminders.length < targetCount && attempts < maxAttempts) {
    attempts++;
    const offsetMinutes = crypto.randomInt(0, Math.max(1, windowMinutes));
    const candidate = earliest.plus({ minutes: offsetMinutes });

    const hour = candidate.hour;
    if (hour < cfg.daytimeWindow.startHour || hour >= cfg.daytimeWindow.endHour) {
      continue;
    }

    const tooClose = reminders.some((r) => {
      const existing = DateTime.fromJSDate(r.fireAt).setZone(TZ);
      return Math.abs(candidate.diff(existing, "hours").hours) < cfg.minIntervalHours;
    });
    if (tooClose) continue;

    reminders.push({
      fireAt: candidate.toJSDate(),
      fired: false,
      firedAt: null,
    });
  }

  reminders.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());

  if (reminders.length > 0) {
    const labels = reminders
      .map((r) => DateTime.fromJSDate(r.fireAt).setZone(TZ).toFormat("MM-dd HH:mm"))
      .join(", ");
    console.log(`[LOTTERY] 排程 ${reminders.length} 個期中提醒:${labels}`.cyan);
  }

  return reminders;
}

module.exports = {
  generateReminderSchedule,
  getReminderConfig,
};
