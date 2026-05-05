require("colors");
const { DateTime } = require("luxon");
const { coinSystem } = require("../../config");
const {
  getCoinTwitchSubBonus,
  getCoinServerBoostBonus,
} = require("./coinMultiplier");
const { getTodayCoinsBySources } = require("./dailyCoinCap");
const { getActiveBuffMultiplier } = require("../shop/activeBuff");

const MSG_VOICE_SOURCES = ["message", "voice"];
const CASINO_SOURCES = ["bet", "payout"];
const SINK_SOURCES = ["shop_buy", "auction_bid", "wealth_tax", "transfer_out", "deposit_lock"];
const PEER_SOURCES = ["transfer_in", "transfer_out", "deposit_lock", "deposit_release"];

module.exports = async (client, opts) => {
  if (!coinSystem?.enabled) return null;
  if (!client.userCoinsCollection) return null;
  if (!client.coinTransactionsCollection) return null;
  if (!opts?.source) return null;

  const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();

  let amount = Math.floor(opts.amount || 0);
  if (amount === 0 && opts.source !== "admin") return null;
  if (
    amount < 0 &&
    opts.source !== "admin" &&
    !CASINO_SOURCES.includes(opts.source) &&
    !SINK_SOURCES.includes(opts.source)
  ) {
    return null;
  }

  // 倍率（admin / casino / sink / peer-transfer 都不套用）
  const skipMultipliers =
    opts.source === "admin" ||
    CASINO_SOURCES.includes(opts.source) ||
    SINK_SOURCES.includes(opts.source) ||
    PEER_SOURCES.includes(opts.source);
  const twitchInfo = skipMultipliers
    ? { multiplier: 1, name: null }
    : getCoinTwitchSubBonus(opts.member, opts.source);
  const boostInfo = skipMultipliers
    ? { multiplier: 1, name: null }
    : getCoinServerBoostBonus(opts.member, opts.source);
  const baseAmount = amount;
  const stackingMode = coinSystem?.bonusStackingMode === "max" ? "max" : "multiply";
  const baseMultiplier =
    stackingMode === "max"
      ? Math.max(twitchInfo.multiplier, boostInfo.multiplier)
      : twitchInfo.multiplier * boostInfo.multiplier;
  // 商店金幣加成 buff（只在正向獲得時生效，purchase/casino bet 不 buff）
  const buffMultiplier = skipMultipliers || amount <= 0 || opts.source === "shop_buy"
    ? 1
    : await getActiveBuffMultiplier(client, opts.userId, opts.guildId, "coin_boost").catch(() => 1);
  const totalMultiplier = baseMultiplier * buffMultiplier;
  if (totalMultiplier > 1 && amount > 0) {
    amount = Math.floor(amount * totalMultiplier);
  }

  // 每日上限：發言+語音合計
  if (MSG_VOICE_SOURCES.includes(opts.source)) {
    const cap = coinSystem.messageVoiceDailyCap ?? 30;
    const earnedToday = await getTodayCoinsBySources(
      client,
      opts.userId,
      opts.guildId,
      MSG_VOICE_SOURCES
    );
    if (earnedToday >= cap) return null;
    if (earnedToday + amount > cap) {
      amount = cap - earnedToday;
    }
  }

  // 表情每日上限（獨立額度）
  if (opts.source === "reaction") {
    const cap = coinSystem.reaction?.dailyCapPerUser ?? 10;
    const earnedToday = await getTodayCoinsBySources(
      client,
      opts.userId,
      opts.guildId,
      ["reaction"]
    );
    if (earnedToday >= cap) return null;
    if (earnedToday + amount > cap) {
      amount = cap - earnedToday;
    }
  }

  if (amount === 0) return null;

  // Transaction 紀錄
  client.coinTransactionsCollection
    .insertOne({
      userId: opts.userId,
      guildId: opts.guildId,
      amount,
      source: opts.source,
      meta: opts.meta || {},
      date: today,
      createdAt: new Date(),
    })
    .catch((e) =>
      console.log(`[ERROR] insert coin transaction: ${e}`.red)
    );

  const counterField = `coinsFrom_${opts.source}`;
  const inc = {
    totalCoins: amount,
    [counterField]: amount,
  };
  if (amount > 0) inc.lifetimeCoins = amount;
  if (amount < 0) inc.lifetimeSpent = -amount;

  const setOnInsert = {
    userId: opts.userId,
    guildId: opts.guildId,
    createdAt: new Date(),
  };

  const set = {
    updatedAt: new Date(),
  };
  if (opts.username !== undefined) set.username = opts.username;
  if (opts.avatarHash !== undefined) set.avatarHash = opts.avatarHash;

  const result = await client.userCoinsCollection.findOneAndUpdate(
    { userId: opts.userId, guildId: opts.guildId },
    { $inc: inc, $set: set, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: "after" }
  );

  const after = result.value || result;
  if (!after) return null;

  // 賭場單筆 bet/payout 不印 log（量太大）；用戶賺金幣也不印，只記錄扣款
  if (!CASINO_SOURCES.includes(opts.source) && amount < 0) {
    console.log(
      `[COIN] ${opts.username || opts.userId} ${amount} (from ${opts.source})`.yellow
    );
  }

  return {
    granted: amount,
    baseAmount,
    multiplier: totalMultiplier,
    twitchSubName: twitchInfo.name,
    twitchSubMultiplier: twitchInfo.multiplier,
    boostBonusName: boostInfo.name,
    boostBonusMultiplier: boostInfo.multiplier,
    doc: after,
  };
};
