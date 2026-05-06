require("colors");

const cron = require("node-cron");
const { DateTime } = require("luxon");

// 每天 00:05 Asia/Taipei 對每個 guild 計算金幣總量、active 存款本金、active 玩家數，
// 寫進 EconomySnapshots collection，作為通膨追蹤資料來源。
// 使用 {guildId, date} unique index 防止同一天重複寫入。
// 連續錯誤 5 次自動關閉避免洗 log。

const TZ = "Asia/Taipei";
const SCHEDULE = "5 0 * * *";

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function snapshotGuild(client, guildId) {
  const date = DateTime.now().setZone(TZ).toISODate();
  const takenAt = new Date();

  const walletAggResult = await client.userCoinsCollection
    .aggregate([
      { $match: { guildId } },
      {
        $group: {
          _id: null,
          totalWalletCoins: { $sum: { $ifNull: ["$totalCoins", 0] } },
          activeUsers: {
            $sum: {
              $cond: [{ $gt: [{ $ifNull: ["$totalCoins", 0] }, 0] }, 1, 0],
            },
          },
          userCount: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const walletAgg = walletAggResult[0] || {
    totalWalletCoins: 0,
    activeUsers: 0,
    userCount: 0,
  };

  const depositAggResult = client.coinDepositsCollection
    ? await client.coinDepositsCollection
        .aggregate([
          { $match: { guildId, status: "active" } },
          {
            $group: {
              _id: null,
              totalDepositPrincipal: { $sum: { $ifNull: ["$principal", 0] } },
              activeDepositCount: { $sum: 1 },
            },
          },
        ])
        .toArray()
    : [];
  const depositAgg = depositAggResult[0] || {
    totalDepositPrincipal: 0,
    activeDepositCount: 0,
  };

  const doc = {
    guildId,
    date,
    takenAt,
    totalWalletCoins: walletAgg.totalWalletCoins || 0,
    totalDepositPrincipal: depositAgg.totalDepositPrincipal || 0,
    totalCirculation:
      (walletAgg.totalWalletCoins || 0) +
      (depositAgg.totalDepositPrincipal || 0),
    userCount: walletAgg.userCount || 0,
    activeUsers: walletAgg.activeUsers || 0,
    activeDepositCount: depositAgg.activeDepositCount || 0,
  };

  try {
    await client.economySnapshotsCollection.insertOne(doc);
    console.log(
      `[ECON-SNAP] ${guildId} ${date}：流通 ${doc.totalCirculation.toLocaleString()}（錢包 ${doc.totalWalletCoins.toLocaleString()} + 存款 ${doc.totalDepositPrincipal.toLocaleString()}），active ${doc.activeUsers}/${doc.userCount} 人`.cyan,
    );
  } catch (e) {
    if (e?.code === 11000) {
      // 同 guild 同日已有 snapshot（補跑或重複觸發）→ skip
      console.log(`[ECON-SNAP] ${guildId} ${date} 已存在，略過`.gray);
      return;
    }
    throw e;
  }
}

async function runSweep(client) {
  if (!client.economySnapshotsCollection || !client.userCoinsCollection) return;
  const guilds = client.guilds.cache;
  if (!guilds || guilds.size === 0) return;
  for (const [guildId] of guilds) {
    try {
      await snapshotGuild(client, guildId);
    } catch (e) {
      console.log(
        `[ECON-SNAP] guild=${guildId} snapshot 失敗：${e.message}`.red,
      );
    }
  }
}

module.exports = async (client) => {
  if (task) return;

  task = cron.schedule(
    SCHEDULE,
    async () => {
      try {
        await runSweep(client);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        console.log(
          `[ERROR] economySnapshotScheduler failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`[ERROR] 連續錯誤過多，停止經濟快照 cron`.red);
          task.stop();
        }
      }
    },
    { timezone: TZ },
  );

  console.log(
    `[ECON-SNAP] 經濟快照排程已啟動：${SCHEDULE} (${TZ})`.cyan,
  );
};
