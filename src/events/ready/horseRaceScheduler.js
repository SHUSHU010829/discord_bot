require("colors");

const cron = require("node-cron");

const { casino } = require("../../config");
const {
  startRaceIfDue,
  abandonStaleRace,
} = require("../../features/casino/horseRacing/raceRunner");

// 賽馬定時排程：
//   1) status: betting 且 expiresAt 已過 → 觸發開賽（0 人下注就取消）
//   2) status: running 且超過 raceTtlSeconds 都沒結算 → 視為中斷退款
// 兩件事都有 atomic guard，重複觸發無害。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.horseRaceGamesCollection) return;
  const now = new Date();
  const cfg = casino?.horseRacing || {};
  const raceTtlMs = (cfg.raceTtlSeconds ?? 1800) * 1000;

  // 售票期過期 → 開賽
  const dueCursor = client.horseRaceGamesCollection.find({
    status: "betting",
    expiresAt: { $lt: now },
  });
  while (await dueCursor.hasNext()) {
    const g = await dueCursor.next();
    await startRaceIfDue(client, g.gameId).catch((e) =>
      console.log(`[HORSE] sweep startRaceIfDue ${g.gameId} fail: ${e}`.yellow),
    );
  }

  // 卡住的 running → 退款
  const staleCursor = client.horseRaceGamesCollection.find({
    status: "running",
    updatedAt: { $lt: new Date(now.getTime() - raceTtlMs) },
  });
  while (await staleCursor.hasNext()) {
    const g = await staleCursor.next();
    await abandonStaleRace(client, g.gameId).catch((e) =>
      console.log(`[HORSE] sweep abandon ${g.gameId} fail: ${e}`.yellow),
    );
  }
}

module.exports = async (client) => {
  if (task) return;

  const cfg = casino?.horseRacing || {};
  if (cfg.enabled === false) return;

  task = cron.schedule("* * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] horseRaceScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止賽馬排程`.red);
        task.stop();
      }
    }
  });

  console.log(`[HORSE] 賽馬定時排程已啟動 (每分鐘檢查售票/中斷局)`.cyan);
};
