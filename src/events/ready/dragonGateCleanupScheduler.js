require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

// 射龍門中途離場：expiresAt 過了還是 playing → 退回鎖倉（2×bet）。
// 玩家還沒射就離開不應該被罰，全額退錢即可。
// 連續錯誤計數，超過 5 次自動關閉。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.dragonGateGamesCollection) return;

  const now = new Date();
  const cursor = client.dragonGateGamesCollection.find({
    status: "playing",
    expiresAt: { $lt: now },
  });

  while (await cursor.hasNext()) {
    const g = await cursor.next();
    const refund = g.lock || (g.bet || 0) * 2;
    const resultTag = "abandoned_refund";

    if (refund > 0) {
      await grantCoins(client, {
        userId: g.userId,
        guildId: g.guildId,
        username: g.username,
        amount: refund,
        source: "payout",
        meta: {
          game: "dragonGate",
          result: resultTag,
          gameId: g.gameId,
          bet: g.bet,
          lock: g.lock,
        },
      });
    }

    await client.dragonGateGamesCollection.updateOne(
      { _id: g._id, status: "playing" },
      {
        $set: {
          status: "abandoned",
          result: resultTag,
          payout: refund,
          updatedAt: new Date(),
        },
      }
    );

    console.log(
      `[DG] 退回未完成局 user=${g.userId} game=${g.gameId} refund=${refund}`.gray
    );
  }
}

module.exports = async (client) => {
  if (task) return;

  const cfg = casino?.dragonGate || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] dragonGateCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止射龍門清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[DG] 射龍門放棄局清理排程已啟動 (每分鐘檢查)`.cyan);
};
