require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const {
  closeTable,
  autoActOnTimeout,
  postThreadAnnouncement,
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

  // 1) 倒數剩 ≤15 秒 → 發提醒（每位玩家每回合只發一次）
  const warnAt = new Date(now.getTime() + 15 * 1000);
  const warnCursor = client.pokerGamesCollection.find({
    status: "playing",
    actionWarningFired: { $ne: true },
    actionDeadline: { $lt: warnAt, $gt: now },
  });
  while (await warnCursor.hasNext()) {
    const doc = await warnCursor.next();
    try {
      const actor = doc.players[doc.toActIdx];
      if (actor) {
        const ts = doc.actionDeadline
          ? Math.floor(new Date(doc.actionDeadline).getTime() / 1000)
          : null;
        await postThreadAnnouncement(
          client,
          doc,
          `⏰ <@${actor.userId}> **剩 15 秒**${ts ? ` ・ <t:${ts}:R> 過期` : ""}\n-# 不動就會自動處理（沒人下注 → 過牌；有人下注 → 棄牌）`,
          [actor.userId]
        );
      }
      await client.pokerGamesCollection.updateOne(
        { _id: doc._id },
        { $set: { actionWarningFired: true } }
      );
    } catch (e) {
      console.log(`[POKER] 倒數提醒失敗 gameId=${doc.gameId}: ${e.message}`.red);
    }
  }

  // 2) 已過期 → auto-fold/check
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
