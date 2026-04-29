require("colors");
const { DateTime } = require("luxon");
const { levelSystem } = require("../../config");
const grantXp = require("../../features/leveling/grantXp");

const reactionCooldown = new Map(); // key: `${reactorId}-${authorId}`, value: timestamp
const COOLDOWN_MS = 30 * 1000;

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  try {
    const threshold = COOLDOWN_MS * 2;
    const now = Date.now();
    let pruned = 0;
    for (const [k, v] of reactionCooldown) {
      if (now - v > threshold) {
        reactionCooldown.delete(k);
        pruned += 1;
      }
    }
    if (pruned > 0) {
      console.log(`[LEVEL] reactionCooldown pruned ${pruned} entries (size=${reactionCooldown.size})`.gray);
    }
  } catch (e) {
    console.log(`[ERROR] reactionCooldown prune: ${e}`.red);
  }
}, PRUNE_INTERVAL_MS).unref();

module.exports = async (client, reaction, user) => {
  try {
    if (!levelSystem?.enabled) return;
    if (!client.userLevelsCollection || !client.levelTransactionsCollection) return;

    const cfg = levelSystem.reaction;
    if (!cfg || !cfg.xpPerReactionReceived) return;

    if (user.bot) return;

    // partial reactions 需 fetch
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }
    const message = reaction.message;
    if (message.partial) {
      try {
        await message.fetch();
      } catch {
        return;
      }
    }
    if (!message.guild) return;
    if (!message.author || message.author.bot) return;

    // 不給自己加 reaction 的 XP
    if (message.author.id === user.id) return;

    // 60 秒冷卻：同一個 (reactor, author) 配對
    const key = `${user.id}-${message.author.id}`;
    const now = Date.now();
    const last = reactionCooldown.get(key) || 0;
    if (now - last < COOLDOWN_MS) return;
    reactionCooldown.set(key, now);

    // 每日 cap：累積今天 author 已經從 reaction 拿了多少 XP
    const tz = levelSystem.daily?.resetTimezone || "Asia/Taipei";
    const today = DateTime.now().setZone(tz).toISODate();
    const cap = cfg.dailyCapPerUser ?? 50;

    const todayAgg = await client.levelTransactionsCollection
      .aggregate([
        {
          $match: {
            userId: message.author.id,
            guildId: message.guild.id,
            source: "reaction",
            date: today,
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();
    const earnedToday = todayAgg[0]?.total || 0;
    if (earnedToday >= cap) return;

    const xp = Math.min(cfg.xpPerReactionReceived, cap - earnedToday);

    // 給訊息作者 XP
    const authorMember = await message.guild.members
      .fetch(message.author.id)
      .catch(() => null);

    await grantXp(client, {
      userId: message.author.id,
      guildId: message.guild.id,
      username: message.author.username,
      avatarHash: message.author.avatar,
      amount: xp,
      source: "reaction",
      counterField: "xpFromReaction",
      incrementReactionsReceived: 1,
      meta: {
        channelId: message.channelId,
        messageId: message.id,
        reactorId: user.id,
        emoji: reaction.emoji?.name || "?",
      },
      channel: message.channel,
      member: authorMember,
    });
  } catch (error) {
    console.log(`[ERROR] reactionXp:\n${error}`.red);
  }
};
