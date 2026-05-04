// 樂透開獎排程:每週日 21:00 (Asia/Taipei) 觸發。
// 啟動時補建當期 open draw,確保玩家可以買票。

require("colors");
const cron = require("node-cron");

const { casino } = require("../../config");
const { runDraw, ensureNextDraw } = require("../../features/casino/lottery/runDraw");
const { announceDrawResult } = require("../../features/casino/lottery/announceResult");
const { listLotteryTypes } = require("../../features/casino/lottery/numbers");

module.exports = (client) => {
  const cfg = casino?.lottery;
  if (!cfg?.enabled) return;

  const tz = cfg.timezone || "Asia/Taipei";
  const drawCron = cfg.drawCron || "0 21 * * 0";

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

  cron.schedule(
    drawCron,
    async () => {
      try {
        for (const t of listLotteryTypes()) {
          const typeCfg = cfg.types?.[t];
          if (!typeCfg?.enabled) continue;
          const result = await runDraw(client, t);
          if (result) {
            await announceDrawResult(client, result);
          }
        }
      } catch (err) {
        console.log(`[ERROR] lottery draw scheduler:\n${err}\n${err.stack}`.red);
      }
    },
    { timezone: tz }
  );

  console.log(`[SYSTEM] 樂透開獎排程啟動:${drawCron} (${tz})`.green);
};
