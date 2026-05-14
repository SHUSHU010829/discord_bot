// 樂透開獎排程:每個玩法依 drawWeekdays / drawHour 各自排程。
// 啟動時補建當期 open draw,確保玩家可以買票。

require("colors");
const cron = require("node-cron");

const { casino } = require("../../config");
const { runDraw, ensureNextDraw } = require("../../features/casino/lottery/runDraw");
const { announceDrawResult } = require("../../features/casino/lottery/announceResult");
const { listLotteryTypes } = require("../../features/casino/lottery/numbers");
const { buildDrawCron } = require("../../features/casino/lottery/schedule");

module.exports = (client) => {
  const cfg = casino?.lottery;
  if (!cfg?.enabled) return;

  const tz = cfg.timezone || "Asia/Taipei";

  // 啟動時補建期數(每個玩法都要有 open 期才能買票)
  setTimeout(async () => {
    try {
      for (const t of listLotteryTypes()) {
        const typeCfg = cfg.types?.[t];
        if (!typeCfg?.enabled) continue;
        await ensureNextDraw(client, t);
      }
    } catch (err) {
      console.log(`[LOTTERY] 啟動補建期數失敗:${err}`.red);
    }
  }, 5000);

  for (const t of listLotteryTypes()) {
    const typeCfg = cfg.types?.[t];
    if (!typeCfg?.enabled) continue;
    const drawCron = buildDrawCron(t);

    cron.schedule(
      drawCron,
      async () => {
        try {
          const result = await runDraw(client, t);
          if (result) {
            await announceDrawResult(client, result);
          }
        } catch (err) {
          console.log(`[ERROR] lottery draw scheduler (${t}):\n${err}\n${err.stack}`.red);
        }
      },
      { timezone: tz }
    );

    console.log(`[SYSTEM] 樂透開獎排程啟動 [${t}]:${drawCron} (${tz})`.green);
  }
};
