require("colors");
const { BADGES } = require("./badgeDefinitions");

/**
 * 檢查 user doc 是否符合某些徽章解鎖條件，atomic 加入 doc.badges。
 * 解鎖時若 opts.channel 存在會公告（不存在則靜默累積，下次 /徽章圖鑑 會看到）。
 */
module.exports = async (client, userDoc, opts = {}) => {
  if (!userDoc) return;
  if (!client.userLevelsCollection) return;

  const owned = new Set(userDoc.badges || []);
  const newlyUnlocked = [];

  for (const badge of BADGES) {
    if (owned.has(badge.id)) continue;
    try {
      if (badge.check(userDoc)) {
        newlyUnlocked.push(badge);
      }
    } catch (_e) {
      // 單個徽章 check 出錯不影響其他
    }
  }

  if (newlyUnlocked.length === 0) return;

  await client.userLevelsCollection.updateOne(
    { _id: userDoc._id },
    { $addToSet: { badges: { $each: newlyUnlocked.map((b) => b.id) } } }
  );

  console.log(
    `[BADGE] ${userDoc.username} 解鎖 ${newlyUnlocked.length} 個徽章: ${newlyUnlocked.map((b) => b.id).join(", ")}`.cyan
  );

  if (opts.channel) {
    const lines = newlyUnlocked
      .map((b) => `${b.emoji} **${b.name}** — ${b.description}`)
      .join("\n");
    opts.channel
      .send({
        content: `🎉 <@${userDoc.userId}> 解鎖了新徽章！\n${lines}`,
      })
      .catch(() => {});
  }
};
