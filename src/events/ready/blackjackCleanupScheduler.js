require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

// 每分鐘掃 expiresAt 過期但 status 還是 playing 的局，
// 視為玩家中途跑掉 → 退回 bet（含 double 過的部分）並標記 abandoned。
// 連續錯誤計數，超過 5 次自動關閉避免洗 log。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.blackjackGamesCollection) return;

  const now = new Date();
  const cursor = client.blackjackGamesCollection.find({
    status: "playing",
    expiresAt: { $lt: now },
  });

  while (await cursor.hasNext()) {
    const g = await cursor.next();
    const refund = g.bet * (g.doubled ? 2 : 1);

    // 退錢：來源 payout 並標記 result=abandoned_refund，方便日後對帳
    await grantCoins(client, {
      userId: g.userId,
      guildId: g.guildId,
      username: g.username,
      amount: refund,
      source: "payout",
      meta: {
        game: "blackjack",
        result: "abandoned_refund",
        gameId: g.gameId,
        bet: g.bet,
        doubled: !!g.doubled,
      },
    });

    // 用 status 條件防 race（同時間 cron 跟 button 都不會雙退）
    await client.blackjackGamesCollection.updateOne(
      { _id: g._id, status: "playing" },
      {
        $set: {
          status: "abandoned",
          result: "refunded",
          payout: refund,
          updatedAt: new Date(),
        },
      }
    );

    console.log(
      `[BJ] 退回未完成局 user=${g.userId} game=${g.gameId} refund=${refund}`.gray
    );
  }
}

module.exports = async (client) => {
  if (task) return; // ready 可能多次觸發，避免重複註冊

  const cfg = casino?.blackjack || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] blackjackCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止 21 點清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[BJ] 21 點放棄局清理排程已啟動 (每分鐘檢查)`.cyan);
};
