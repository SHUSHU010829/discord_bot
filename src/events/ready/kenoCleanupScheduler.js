require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

// 尋寶（Keno）中途離場：expiresAt 過了還是 selecting → 退回本金。
// 連續錯誤計數，超過 5 次自動關閉。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.kenoGamesCollection) return;

  const now = new Date();
  const cursor = client.kenoGamesCollection.find({
    status: "selecting",
    expiresAt: { $lt: now },
  });

  while (await cursor.hasNext()) {
    const g = await cursor.next();
    const refund = g.bet || 0;

    if (refund > 0) {
      await grantCoins(client, {
        userId: g.userId,
        guildId: g.guildId,
        username: g.username,
        amount: refund,
        source: "payout",
        meta: {
          game: "keno",
          result: "abandoned_refund",
          gameId: g.gameId,
          bet: g.bet,
        },
      });
    }

    await client.kenoGamesCollection.updateOne(
      { _id: g._id, status: "selecting" },
      {
        $set: {
          status: "abandoned",
          result: "abandoned_refund",
          payout: refund,
          updatedAt: new Date(),
        },
      }
    );

    console.log(
      `[KENO] 退回未完成局 user=${g.userId} game=${g.gameId} refund=${refund}`.gray
    );
  }
}

module.exports = async (client) => {
  if (task) return;

  const cfg = casino?.keno || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] kenoCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止 尋寶 清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[KENO] 尋寶放棄局清理排程已啟動 (每分鐘檢查)`.cyan);
};
