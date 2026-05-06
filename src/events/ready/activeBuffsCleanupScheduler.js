require("colors");

const cron = require("node-cron");

// 每 30 分鐘從 userCoinsCollection.activeBuffs 移除已過期項目，避免 array 無限膨脹。
// 過期 buff 在讀取（getActiveBuffMultiplier）時本來就會被忽略，這個 job 只處理儲存清理。
// 連續錯誤 5 次自動關閉避免洗 log。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.userCoinsCollection) return;

  const now = new Date();
  const result = await client.userCoinsCollection.updateMany(
    { "activeBuffs.expiresAt": { $lt: now } },
    {
      $pull: { activeBuffs: { expiresAt: { $lt: now } } },
      $set: { updatedAt: now },
    },
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[BUFFS] 清掉過期 activeBuffs：${result.modifiedCount} 位玩家`.gray,
    );
  }
}

module.exports = async (client) => {
  if (task) return;

  task = cron.schedule("*/30 * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] activeBuffsCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止 activeBuffs 清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[BUFFS] activeBuffs 清理排程已啟動（每 30 分鐘）`.cyan);
};
