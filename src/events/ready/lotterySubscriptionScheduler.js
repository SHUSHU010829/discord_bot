// 樂透訂閱扣款排程:每週日 20:30 (Asia/Taipei) 觸發。

require("colors");
const cron = require("node-cron");

const { casino } = require("../../config");
const { processAllSubscriptions } = require("../../features/casino/lottery/subscriptions");

module.exports = (client) => {
  const cfg = casino?.lottery;
  if (!cfg?.enabled) return;

  const tz = cfg.timezone || "Asia/Taipei";
  const subCron = cfg.subscriptionCron || "30 20 * * 0";

  cron.schedule(
    subCron,
    async () => {
      try {
        await processAllSubscriptions(client);
      } catch (err) {
        console.log(`[ERROR] lottery subscription scheduler:\n${err}\n${err.stack}`.red);
      }
    },
    { timezone: tz }
  );

  console.log(`[SYSTEM] 樂透訂閱排程啟動:${subCron} (${tz})`.green);
};
