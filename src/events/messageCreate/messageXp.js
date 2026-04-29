require("colors");
const { levelSystem } = require("../../config");
const { isMessageXpEligible, isMessageRepetitive } = require("../../utils/xpGuards");
const { randomInt } = require("../../utils/levelMath");
const grantXp = require("../../features/leveling/grantXp");

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
  } catch (error) {
    console.log(`[ERROR] messageXp:\n${error}`.red);
  }
};
