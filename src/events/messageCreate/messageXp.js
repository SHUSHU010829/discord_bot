require("colors");
const { levelSystem } = require("../../config.json");
const { isMessageXpEligible, isMessageRepetitive } = require("../../utils/xpGuards");
const { randomInt } = require("../../utils/levelMath");
const grantXp = require("../../features/leveling/grantXp");

const messageCooldown = new Map();

module.exports = async (client, message) => {
  try {
    if (!levelSystem?.enabled) return;
    if (!client.userLevelsCollection) return;

    const cfg = levelSystem.message;
    if (!isMessageXpEligible(message, cfg)) return;

    const cooldownKey = `${message.author.id}-${message.guildId}`;
    const now = Date.now();
    const last = messageCooldown.get(cooldownKey) || 0;
    if (now - last < cfg.cooldownSeconds * 1000) return;

    if (isMessageRepetitive(message.author.id, message.content.trim())) return;

    messageCooldown.set(cooldownKey, now);

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
