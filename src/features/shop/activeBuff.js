// 取得使用者目前生效的 buff（xp_boost / coin_boost）。
// Buff 儲存在 userCoinsCollection.activeBuffs，型別：
// { type: "xp_boost"|"coin_boost", multiplier: number, expiresAt: Date, source: itemId }

async function getActiveBuffMultiplier(client, userId, guildId, type) {
  if (!client.userCoinsCollection) return 1;
  const doc = await client.userCoinsCollection
    .findOne({ userId, guildId }, { projection: { activeBuffs: 1 } })
    .catch(() => null);
  const buffs = doc?.activeBuffs || [];
  const now = Date.now();
  let best = 1;
  for (const b of buffs) {
    if (b?.type !== type) continue;
    const exp = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
    if (exp <= now) continue;
    if ((b.multiplier || 1) > best) best = b.multiplier;
  }
  return best;
}

async function addBuff(client, { userId, guildId, type, multiplier, durationMinutes, source }) {
  if (!client.userCoinsCollection) return null;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const buff = { type, multiplier, expiresAt, source: source || null };
  await client.userCoinsCollection.updateOne(
    { userId, guildId },
    {
      $push: { activeBuffs: buff },
      $set: { updatedAt: new Date() },
      $setOnInsert: { userId, guildId, createdAt: new Date() },
    },
    { upsert: true },
  );
  return buff;
}

module.exports = { getActiveBuffMultiplier, addBuff };
