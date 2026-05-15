require("colors");
const { DateTime } = require("luxon");
const { welfareSystem } = require("../../config");
const grantCoins = require("../economy/grantCoins");

const getTz = () => welfareSystem?.resetTimezone || "Asia/Taipei";

const today = () => DateTime.now().setZone(getTz()).toISODate();
const yesterday = () => DateTime.now().setZone(getTz()).minus({ days: 1 }).toISODate();

const computeAmount = (streak) => {
  const tiers = welfareSystem?.tiers || [];
  for (const tier of tiers) {
    const min = tier.minStreak ?? 1;
    const max = tier.maxStreak ?? Number.POSITIVE_INFINITY;
    if (streak >= min && streak <= max) return tier.amount;
  }
  // 沒匹配到任何 tier（理論上不會發生）→ 用最後一檔
  if (tiers.length > 0) return tiers[tiers.length - 1].amount;
  return 0;
};

const nextResetEpoch = () => {
  return Math.floor(
    DateTime.now().setZone(getTz()).plus({ days: 1 }).startOf("day").toSeconds()
  );
};

const getActiveDepositTotal = async (client, userId, guildId) => {
  if (!client.coinDepositsCollection) return 0;
  const agg = await client.coinDepositsCollection
    .aggregate([
      { $match: { userId, guildId, status: "active" } },
      { $group: { _id: null, total: { $sum: "$principal" } } },
    ])
    .toArray();
  return agg[0]?.total || 0;
};

const getStockHoldings = async (client, userId, guildId) => {
  if (!client.userPortfolioCollection) return { totalShares: 0, symbols: [] };
  const docs = await client.userPortfolioCollection
    .find({ userId, guildId, shares: { $gt: 0 } })
    .project({ symbol: 1, shares: 1 })
    .toArray();
  const totalShares = docs.reduce((a, b) => a + (b.shares || 0), 0);
  const symbols = docs.map((d) => d.symbol);
  return { totalShares, symbols };
};

const getStatus = async (client, userId, guildId) => {
  const tz = getTz();
  const t = today();
  const claim = await client.welfareClaimsCollection.findOne({ userId, guildId });
  const coinDoc = await client.userCoinsCollection.findOne({ userId, guildId });
  const walletBalance = coinDoc?.totalCoins || 0;
  const depositTotal = await getActiveDepositTotal(client, userId, guildId);
  const stocks = await getStockHoldings(client, userId, guildId);
  const totalAssets = walletBalance + depositTotal;
  const threshold = welfareSystem?.balanceThreshold ?? 100;
  const claimedToday = claim?.lastClaimDate === t;
  const streak = claim?.streak || 0;
  const longestStreak = claim?.longestStreak || 0;
  const totalClaims = claim?.totalClaims || 0;

  // 預測下次能領的金額（若資格符合）
  let nextStreak = 1;
  if (claim?.lastClaimDate === yesterday()) {
    nextStreak = streak + 1;
  } else if (claim?.lastClaimDate === t) {
    nextStreak = streak; // 今天已領
  } else {
    nextStreak = 1;
  }
  const nextAmount = computeAmount(nextStreak);

  return {
    balance: walletBalance,
    depositTotal,
    totalAssets,
    threshold,
    eligibleByBalance: totalAssets <= threshold,
    hasStocks: stocks.totalShares > 0,
    stockShares: stocks.totalShares,
    stockSymbols: stocks.symbols,
    claimedToday,
    streak,
    longestStreak,
    totalClaims,
    nextStreak,
    nextAmount,
    resetEpoch: nextResetEpoch(),
    tz,
  };
};

const claim = async (client, userId, guildId, member, username) => {
  if (!welfareSystem?.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (!client.welfareClaimsCollection || !client.userCoinsCollection) {
    return { ok: false, reason: "system_unready" };
  }

  const t = today();
  const y = yesterday();
  const threshold = welfareSystem?.balanceThreshold ?? 100;

  const coinDoc = await client.userCoinsCollection.findOne({ userId, guildId });
  const walletBalance = coinDoc?.totalCoins || 0;
  const depositTotal = await getActiveDepositTotal(client, userId, guildId);
  const totalAssets = walletBalance + depositTotal;
  if (totalAssets > threshold) {
    return {
      ok: false,
      reason: "above_threshold",
      balance: walletBalance,
      depositTotal,
      totalAssets,
      threshold,
    };
  }

  // 有持股則視為有資產，不發救濟金
  const stocks = await getStockHoldings(client, userId, guildId);
  if (stocks.totalShares > 0) {
    return {
      ok: false,
      reason: "has_stocks",
      stockShares: stocks.totalShares,
      stockSymbols: stocks.symbols,
    };
  }

  const existing = await client.welfareClaimsCollection.findOne({ userId, guildId });
  if (existing?.lastClaimDate === t) {
    return {
      ok: false,
      reason: "already_claimed",
      streak: existing.streak,
      resetEpoch: nextResetEpoch(),
    };
  }

  // 計算 streak
  let streak = 1;
  if (existing?.lastClaimDate === y) {
    streak = (existing.streak || 0) + 1;
  }
  const amount = computeAmount(streak);

  // 原子更新：以「lastClaimDate != today」當條件，避免 race
  // 對已有 doc：filter 篩選 → 不符 = 別人已搶先領 → race lost
  // 對首次：用 upsert 處理，但靠 try/catch E11000 防重複插入
  let after;
  try {
    if (existing) {
      const update = await client.welfareClaimsCollection.findOneAndUpdate(
        { userId, guildId, lastClaimDate: { $ne: t } },
        {
          $set: {
            lastClaimDate: t,
            streak,
            longestStreak: Math.max(streak, existing.longestStreak || 0),
            updatedAt: new Date(),
          },
          $inc: { totalClaims: 1, totalAmount: amount },
        },
        { returnDocument: "after" }
      );
      after = update?.value || update;
      if (!after) return { ok: false, reason: "race_lost" };
    } else {
      const insertResult = await client.welfareClaimsCollection.insertOne({
        userId,
        guildId,
        lastClaimDate: t,
        streak,
        longestStreak: streak,
        totalClaims: 1,
        totalAmount: amount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      after = {
        userId,
        guildId,
        lastClaimDate: t,
        streak,
        longestStreak: streak,
        totalClaims: 1,
        _id: insertResult.insertedId,
      };
    }
  } catch (e) {
    if (e?.code === 11000) {
      return { ok: false, reason: "race_lost" };
    }
    throw e;
  }

  // 發金幣
  const coinResult = await grantCoins(client, {
    userId,
    guildId,
    username,
    amount,
    source: "welfare",
    member,
    meta: { streak },
  });

  if (!coinResult) {
    // grantCoins 失敗（理論上不會，因為 amount > 0 且 source 已被允許）→ rollback claim？
    // 採保守做法：留紀錄但回失敗，下次仍可再嘗試（lastClaimDate 已寫入會擋當天）
    console.log(`[WARNING] welfare grantCoins returned null for ${userId}`.yellow);
    return { ok: false, reason: "grant_failed", streak, amount };
  }

  return {
    ok: true,
    amount: coinResult.granted,
    streak,
    longestStreak: after.longestStreak || streak,
    totalClaims: after.totalClaims || 1,
    resetEpoch: nextResetEpoch(),
    newBalance: coinResult.doc?.totalCoins,
  };
};

module.exports = {
  computeAmount,
  getStatus,
  claim,
};
