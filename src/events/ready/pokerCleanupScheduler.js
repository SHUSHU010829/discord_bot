require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const { closeTable } = require("../../features/casino/poker/service");

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.pokerGamesCollection) return;
  const now = new Date();
  const cursor = client.pokerGamesCollection.find({
    status: { $in: ["waiting", "playing", "settled"] },
    expiresAt: { $lt: now },
  });
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    console.log(
      `[POKER] 牌桌逾時 gameId=${doc.gameId} status=${doc.status} thread=${doc.threadId}`.gray
    );
    try {
      await closeTable(client, doc, { reason: "abandoned_timeout" });
    } catch (e) {
      console.log(`[POKER] closeTable 失敗 gameId=${doc.gameId}: ${e.message}`.red);
    }
  }
}

module.exports = async (client) => {
  if (task) return;
  const cfg = casino?.poker || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] pokerCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止撲克清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[POKER] 撲克牌桌逾時清理排程已啟動 (每分鐘檢查)`.cyan);
};
