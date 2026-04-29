require("colors");
const { levelSystem } = require("../../config");
const { isMessageXpEligible, isMessageRepetitive } = require("../../utils/xpGuards");
const { randomInt } = require("../../utils/levelMath");
const grantXp = require("../../features/leveling/grantXp");

const messageCooldown = new Map();

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  try {
    const cooldownMs = (levelSystem?.message?.cooldownSeconds || 30) * 1000;
    const threshold = cooldownMs * 2;
    const now = Date.now();
    let pruned = 0;
    for (const [k, v] of messageCooldown) {
      if (now - v > threshold) {
        messageCooldown.delete(k);
        pruned += 1;
      }
    }
    if (pruned > 0) {
      console.log(`[LEVEL] messageCooldown pruned ${pruned} entries (size=${messageCooldown.size})`.gray);
    }
  } catch (e) {
    console.log(`[ERROR] messageCooldown prune: ${e}`.red);
  }
}, PRUNE_INTERVAL_MS).unref();

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
