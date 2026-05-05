require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const {
  closeTable,
  autoActOnTimeout,
} = require("../../features/casino/poker/service");

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let tableTask = null;
let actionTask = null;

async function sweepTables(client) {
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

async function sweepActions(client) {
  if (!client.pokerGamesCollection) return;
  const now = new Date();
  const cursor = client.pokerGamesCollection.find({
    status: "playing",
    actionDeadline: { $lt: now, $ne: null },
  });
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    try {
      await autoActOnTimeout(client, doc);
    } catch (e) {
      console.log(`[POKER] auto-fold 失敗 gameId=${doc.gameId}: ${e.message}`.red);
    }
  }
}

module.exports = async (client) => {
  if (tableTask) return;
  const cfg = casino?.poker || {};
  if (cfg.enabled === false) return;

  tableTask = cron.schedule("* * * * *", async () => {
    try {
      await sweepTables(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] pokerCleanupScheduler table sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止撲克牌桌清理 cron`.red);
        tableTask.stop();
      }
    }
  });

  // 每 10 秒掃一次行動倒數，逾時自動 fold/check
  actionTask = cron.schedule("*/10 * * * * *", async () => {
    try {
      await sweepActions(client);
    } catch (err) {
      console.log(`[ERROR] pokerCleanupScheduler action sweep failed:\n${err}`.red);
    }
  });

  console.log(
    `[POKER] 撲克排程已啟動：牌桌逾時每分鐘、行動倒數每 10 秒`.cyan
  );
};
