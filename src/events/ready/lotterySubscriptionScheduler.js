// 樂透訂閱扣款排程:每個玩法在自己開獎前 30 分鐘各自觸發。

require("colors");
const cron = require("node-cron");

const { casino } = require("../../config");
const { processAllSubscriptions } = require("../../features/casino/lottery/subscriptions");
const { listLotteryTypes } = require("../../features/casino/lottery/numbers");
const { buildSubscriptionCron } = require("../../features/casino/lottery/schedule");

module.exports = (client) => {
  const cfg = casino?.lottery;
  if (!cfg?.enabled) return;

  const tz = cfg.timezone || "Asia/Taipei";

  for (const t of listLotteryTypes()) {
    const typeCfg = cfg.types?.[t];
    if (!typeCfg?.enabled) continue;
    const subCron = buildSubscriptionCron(t);

    cron.schedule(
      subCron,
      async () => {
        try {
          await processAllSubscriptions(client, { lotteryType: t });
        } catch (err) {
          console.log(`[ERROR] lottery subscription scheduler (${t}):\n${err}\n${err.stack}`.red);
        }
      },
      { timezone: tz }
    );

    console.log(`[SYSTEM] 樂透訂閱排程啟動 [${t}]:${subCron} (${tz})`.green);
  }
};
