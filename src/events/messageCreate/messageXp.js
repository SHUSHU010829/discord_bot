require("colors");
const { levelSystem, coinSystem } = require("../../config");
const { isMessageXpEligible, isMessageRepetitive } = require("../../utils/xpGuards");
const { randomInt } = require("../../utils/levelMath");
const grantXp = require("../../features/leveling/grantXp");
const grantCoins = require("../../features/economy/grantCoins");

module.exports = async (client, message) => {
  try {
    if (!levelSystem?.enabled) return;
    if (!client.userLevelsCollection) return;
    if (!client.levelTransactionsCollection) return;

    const cfg = levelSystem.message;
    if (!isMessageXpEligible(message, cfg)) return;

    // Cooldown 改用 DB 查詢（去除 per-process Map，sharding-safe）
    const cooldownMs = (cfg.cooldownSeconds || 30) * 1000;
    const recent = await client.levelTransactionsCollection.findOne(
      {
        userId: message.author.id,
        guildId: message.guildId,
        source: "message",
        createdAt: { $gt: new Date(Date.now() - cooldownMs) },
      },
      { projection: { _id: 1 } },
    );
    if (recent) return;

    if (isMessageRepetitive(message.author.id, message.content.trim())) return;

    const xp = randomInt(cfg.minXp, cfg.maxXp);

    await grantXp(client, {
      userId: message.author.id,
      guildId: message.guildId,
      username: message.author.username,
      avatarHash: message.author.avatar,
      amount: xp,
      source: "message",
      counterField: "xpFromMessage",
      incrementMessages: true,
      meta: { channelId: message.channelId, messageId: message.id },
      channel: message.channel,
      member: message.member,
    });

    // 訊息金幣（獨立冷卻 + 每日上限合計於 grantCoins 內處理）
    await tryGrantMessageCoins(client, message);
  } catch (error) {
    console.log(`[ERROR] messageXp:\n${error}`.red);
  }
};

async function tryGrantMessageCoins(client, message) {
  if (!coinSystem?.enabled) return;
  if (!client.userCoinsCollection || !client.coinTransactionsCollection) return;
  const cfg = coinSystem.message;
  if (!cfg) return;

  // 獨立冷卻（不和 XP 共用 levelTransactionsCollection）
  const cooldownMs = (cfg.cooldownSeconds || 60) * 1000;
  const recent = await client.coinTransactionsCollection.findOne(
    {
      userId: message.author.id,
      guildId: message.guildId,
      source: "message",
      createdAt: { $gt: new Date(Date.now() - cooldownMs) },
    },
    { projection: { _id: 1 } },
  );
  if (recent) return;

  const minC = cfg.minCoins ?? 0;
  const maxC = cfg.maxCoins ?? 2;
  const coins = randomInt(minC, maxC);
  if (coins <= 0) return; // 落空：不寫 transaction

  await grantCoins(client, {
    userId: message.author.id,
    guildId: message.guildId,
    username: message.author.username,
    avatarHash: message.author.avatar,
    amount: coins,
    source: "message",
    meta: { channelId: message.channelId, messageId: message.id },
    member: message.member,
  });
}
