require("colors");
const { DateTime } = require("luxon");
const { getLevelProgress } = require("../../utils/levelMath");
const { levelSystem } = require("../../config.json");
const syncLevelRoles = require("./levelRoles");
const announceLevelUp = require("./levelUpAnnouncer");

module.exports = async (client, opts) => {
  if (!client.userLevelsCollection) return null;
  if (!opts.amount || opts.amount <= 0) return null;

  const tz = levelSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();

  if (client.levelTransactionsCollection) {
    client.levelTransactionsCollection
      .insertOne({
        userId: opts.userId,
        guildId: opts.guildId,
        amount: opts.amount,
        source: opts.source,
        meta: opts.meta || {},
        date: today,
        createdAt: new Date(),
      })
      .catch((e) =>
        console.log(`[ERROR] insert level transaction: ${e}`.red)
      );
  }

  const before = await client.userLevelsCollection.findOne({
    userId: opts.userId,
    guildId: opts.guildId,
  });

  const beforeLevel = before ? getLevelProgress(before.totalXp).level : 0;

  const counterField = opts.counterField || `xpFrom_${opts.source}`;
  const inc = {
    totalXp: opts.amount,
    [counterField]: opts.amount,
  };
  if (opts.incrementMessages) inc.totalMessages = 1;
  if (opts.incrementVoiceMinutes) inc.totalVoiceMinutes = opts.incrementVoiceMinutes;
  if (opts.source === "reaction") inc.totalReactionsReceived = opts.amount;

  const setOnInsert = {
    userId: opts.userId,
    guildId: opts.guildId,
    streak: 0,
    longestStreak: 0,
    totalCheckins: 0,
    badges: [],
    title: null,
    cardAccent: levelSystem?.card?.defaultAccent || "default",
    createdAt: new Date(),
  };

  const set = {
    username: opts.username,
    updatedAt: new Date(),
  };
  if (opts.avatarHash !== undefined) set.avatarHash = opts.avatarHash;

  const result = await client.userLevelsCollection.findOneAndUpdate(
    { userId: opts.userId, guildId: opts.guildId },
    { $inc: inc, $set: set, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: "after" }
  );

  const after = result.value || result;
  if (!after) return null;

  const afterProgress = getLevelProgress(after.totalXp);
  const afterLevel = afterProgress.level;

  if (after.level !== afterLevel) {
    await client.userLevelsCollection.updateOne(
      { _id: after._id },
      { $set: { level: afterLevel } }
    );
    after.level = afterLevel;
  }

  if (afterLevel > beforeLevel) {
    console.log(
      `[LEVEL] ${opts.username} ${beforeLevel} → ${afterLevel} (+${opts.amount} from ${opts.source})`.cyan
    );

    // 等級身分組同步（fire-and-forget，失敗不影響回傳）
    if (opts.member) {
      syncLevelRoles(client, opts.member, afterLevel).catch((e) =>
        console.log(`[ERROR] syncLevelRoles: ${e}`.red)
      );
    }

    // 升級公告（內部會判斷是否 milestone）
    announceLevelUp(client, {
      member: opts.member,
      guildId: opts.guildId,
      channel: opts.channel,
      beforeLevel,
      afterLevel,
      after,
    }).catch((e) => console.log(`[ERROR] announceLevelUp: ${e}`.red));
  }

  return { before: beforeLevel, after: afterLevel, doc: after };
};
