require('colors');

const cron = require('node-cron');

const { casino } = require('../../config');
const grantCoins = require('../../features/economy/grantCoins');

// 每分鐘掃 expiresAt 過期但 status 還是 'betting' 的局，
// 視為玩家放棄 → 全額退回 totalBudget 並標記 abandoned。
// 連續錯誤計數，超過 5 次自動關閉避免洗 log。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.rouletteGamesCollection) return;

  const now = new Date();
  const cursor = client.rouletteGamesCollection.find({
    status: 'betting',
    expiresAt: { $lt: now },
  });

  while (await cursor.hasNext()) {
    const g = await cursor.next();

    // 用 status 條件防 race（玩家按取消 & cron 同時跑）
    const updated = await client.rouletteGamesCollection.findOneAndUpdate(
      { _id: g._id, status: 'betting' },
      {
        $set: {
          status: 'abandoned',
          result: null,
          payout: g.totalBudget,
          updatedAt: new Date(),
        },
      }
    );
    if (!updated) continue; // 已被搶先處理，跳過

    await grantCoins(client, {
      userId: g.userId,
      guildId: g.guildId,
      username: g.username,
      amount: g.totalBudget,
      source: 'payout',
      meta: {
        game: 'roulette',
        reason: 'timeout',
        gameId: g.gameId,
        totalBudget: g.totalBudget,
      },
    });

    console.log(
      `[ROULETTE] 退回逾時局 user=${g.userId} game=${g.gameId} refund=${g.totalBudget}`.gray
    );
  }
}

module.exports = async (client) => {
  if (task) return; // ready 可能多次觸發，避免重複註冊

  const cfg = casino?.roulette || {};
  if (cfg.enabled === false) return;

  task = cron.schedule('* * * * *', async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] rouletteCleanupScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止輪盤清理 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[ROULETTE] 輪盤放棄局清理排程已啟動 (每分鐘檢查)`.cyan);
};
