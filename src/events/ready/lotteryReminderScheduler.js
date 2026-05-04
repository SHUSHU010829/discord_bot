// 樂透期中提醒 cron 掃描器,每小時整點掃一次。

require("colors");
const cron = require("node-cron");

const { casino } = require("../../config");
const { processReminders } = require("../../features/casino/lottery/reminderAnnouncer");

module.exports = (client) => {
  const cfg = casino?.lottery;
  if (!cfg?.enabled) return;
  if (cfg.reminders?.enabled === false) return;

  const tz = cfg.timezone || "Asia/Taipei";
  const reminderCron = cfg.reminderCron || "0 * * * *";

  cron.schedule(
    reminderCron,
    async () => {
      try {
        await processReminders(client);
      } catch (err) {
        console.log(`[ERROR] lottery reminder scheduler:\n${err}\n${err.stack}`.red);
      }
    },
    { timezone: tz }
  );

  console.log(`[SYSTEM] 樂透期中提醒排程啟動:${reminderCron} (${tz})`.green);
};
