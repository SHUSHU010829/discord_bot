const { DateTime } = require("luxon");

/**
 * 計算指定 guild 本週（過去 7 天）的等級系統統計。
 * 第一版：top 10 XP / 升級總人次 / 簽到總人次。
 */
module.exports = async function buildWeeklyReport(client, { guildId, timezone }) {
  const tz = timezone || "Asia/Taipei";
  const now = DateTime.now().setZone(tz);
  const weekStart = now.minus({ days: 7 }).startOf("day");

  const out = {
    guildId,
    rangeFrom: weekStart.toISO(),
    rangeTo: now.toISO(),
    topXp: [],
    levelUpCount: 0,
    checkinCount: 0,
    totalXp: 0,
  };

  // Top 10 by XP this week
  if (client.levelTransactionsCollection) {
    const top = await client.levelTransactionsCollection
      .aggregate([
        {
          $match: {
            guildId,
            createdAt: { $gte: weekStart.toJSDate() },
          },
        },
        {
          $group: {
            _id: "$userId",
            xp: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { xp: -1 } },
        { $limit: 10 },
      ])
      .toArray();

    out.topXp = top.map((t) => ({ userId: t._id, xp: t.xp, count: t.count }));

    const totalAgg = await client.levelTransactionsCollection
      .aggregate([
        {
          $match: {
            guildId,
            createdAt: { $gte: weekStart.toJSDate() },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();
    out.totalXp = totalAgg[0]?.total || 0;
  }

  // 升級人次：抓本週 admin 以外有觸發升級的「人次」近似 — 簡化版直接統計 levelTransactions 中
  // 透過跨等級邊界的 XP 累積，不太可靠；先用「本週活躍用戶 (≥1 筆 transaction) × level 比 7 天前高的」近似。
  // 第一版簡化：升級人次直接從 transactions 推 — 每個用戶查升級前後 level 差。
  if (client.userLevelsCollection && client.levelTransactionsCollection) {
    const activeUsers = await client.levelTransactionsCollection.distinct(
      "userId",
      { guildId, createdAt: { $gte: weekStart.toJSDate() } }
    );

    let levelUps = 0;
    if (activeUsers.length > 0) {
      // 用 transactions 加總 → 推估每個 active user 本週賺的 XP，再用 totalXp - earned 反推 7 天前的 level
      const earnedAgg = await client.levelTransactionsCollection
        .aggregate([
          {
            $match: {
              guildId,
              userId: { $in: activeUsers },
              createdAt: { $gte: weekStart.toJSDate() },
            },
          },
          { $group: { _id: "$userId", earned: { $sum: "$amount" } } },
        ])
        .toArray();
      const earnedMap = new Map(earnedAgg.map((e) => [e._id, e.earned]));

      const docs = await client.userLevelsCollection
        .find({ guildId, userId: { $in: activeUsers } })
        .project({ userId: 1, totalXp: 1, level: 1 })
        .toArray();

      const { getLevelProgress } = require("./levelMath");
      for (const d of docs) {
        const earned = earnedMap.get(d.userId) || 0;
        const beforeXp = Math.max(0, (d.totalXp || 0) - earned);
        const beforeLevel = getLevelProgress(beforeXp).level;
        const afterLevel = d.level ?? getLevelProgress(d.totalXp || 0).level;
        if (afterLevel > beforeLevel) {
          levelUps += afterLevel - beforeLevel;
        }
      }
    }
    out.levelUpCount = levelUps;
  }

  if (client.dailyCheckinCollection) {
    out.checkinCount = await client.dailyCheckinCollection.countDocuments({
      guildId,
      createdAt: { $gte: weekStart.toJSDate() },
    });
  }

  return out;
};
