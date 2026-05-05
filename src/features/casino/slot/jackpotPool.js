// 拉霸 Jackpot Pool：每 guild 一筆。
// - 每筆下注：amount * contributionRate 進池
// - 七七七 jackpot：原本 base payout + 整池金額一次帶走，剩 seedAmount 重置

const { casino } = require("../../../config");

function getCfg() {
  return casino?.slot?.jackpotPool || {};
}

async function getPool(client, guildId) {
  if (!client.jackpotPoolCollection) return null;
  const cfg = getCfg();
  const seed = cfg.seedAmount ?? 5000;
  const doc = await client.jackpotPoolCollection.findOneAndUpdate(
    { guildId, game: "slot" },
    {
      $setOnInsert: {
        guildId,
        game: "slot",
        amount: seed,
        seed,
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  return doc?.value || doc || null;
}

async function contribute(client, guildId, bet) {
  const cfg = getCfg();
  if (!cfg.enabled) return 0;
  if (!client.jackpotPoolCollection) return 0;
  const rate = cfg.contributionRate ?? 0.03;
  const inc = Math.max(0, Math.floor(bet * rate));
  if (inc <= 0) return 0;
  const seed = cfg.seedAmount ?? 5000;
  await client.jackpotPoolCollection.updateOne(
    { guildId, game: "slot" },
    {
      $inc: { amount: inc, totalContributed: inc },
      $setOnInsert: { guildId, game: "slot", seed, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );
  return inc;
}

// 爆池：把當前 pool 取出（扣回 seed），原子操作避免併發。
async function bustPool(client, guildId) {
  const cfg = getCfg();
  if (!client.jackpotPoolCollection) return 0;
  const seed = cfg.seedAmount ?? 5000;
  const before = await client.jackpotPoolCollection.findOne({
    guildId,
    game: "slot",
  });
  if (!before) {
    await client.jackpotPoolCollection.insertOne({
      guildId,
      game: "slot",
      amount: seed,
      seed,
      createdAt: new Date(),
    });
    return 0;
  }
  const current = before.amount || 0;
  const won = Math.max(0, current - seed);
  await client.jackpotPoolCollection.updateOne(
    { guildId, game: "slot", amount: current },
    {
      $set: { amount: seed, lastBustAt: new Date() },
      $inc: { bustCount: 1, totalPaid: won },
    }
  );
  return won;
}

module.exports = { getPool, contribute, bustPool, getCfg };
