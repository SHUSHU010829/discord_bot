require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

// HI-LO 中途離場：expiresAt 過了還是 playing → 視玩家狀態退錢
//   - 還沒贏過任何一把：退回原始 bet
//   - 至少贏過 1 把：直接幫他 cash out（拿走累積派彩）
// 連續錯誤計數，超過 5 次自動關閉。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.hiloGamesCollection) return;

  const now = new Date();
  const cursor = client.hiloGamesCollection.find({
    status: "playing",
    expiresAt: { $lt: now },
  });

  while (await cursor.hasNext()) {
    const g = await cursor.next();
    const wins = g.wins || 0;
    const acc = g.accMultiplier || 1;
    const refund =
      wins > 0 ? Math.floor((g.bet || 0) * acc) : g.bet || 0;
    const resultTag = wins > 0 ? "abandoned_cashout" : "abandoned_refund";

    if (refund > 0) {
      await grantCoins(client, {
        userId: g.userId,
        guildId: g.guildId,
        username: g.username,
        amount: refund,
        source: "payout",
        meta: {
          game: "hilo",
          result: resultTag,
          gameId: g.gameId,
          bet: g.bet,
          wins,
          accMultiplier: acc,
        },
      });
    }

    await client.hiloGamesCollection.updateOne(
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
      `[HL] 退回未完成局 user=${g.userId} game=${g.gameId} wins=${wins} refund=${refund}`.gray
    );
  }
}

module.exports = async (client) => {
  if (task) return;

  const cfg = casino?.hilo || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] hiloCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止 HI-LO 清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[HL] HI-LO 放棄局清理排程已啟動 (每分鐘檢查)`.cyan);
};
