require("colors");
const { BADGES } = require("./badgeDefinitions");

/**
 * 檢查 user doc 是否符合某些徽章解鎖條件，atomic 加入 doc.badges。
 * 回傳 newlyUnlocked 陣列（badge 物件），由呼叫端決定是否要公告。
 *
 * opts.announce  — 若為 true 且 opts.channel 存在，會直接送公告（向後相容）
 * opts.channel   — 公告目標頻道（僅 announce=true 時使用）
 */
module.exports = async (client, userDoc, opts = {}) => {
  if (!userDoc) return [];
  if (!client.userLevelsCollection) return [];

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

  if (newlyUnlocked.length === 0) return [];

  await client.userLevelsCollection.updateOne(
    { _id: userDoc._id },
    { $addToSet: { badges: { $each: newlyUnlocked.map((b) => b.id) } } }
  );

  console.log(
    `[BADGE] ${userDoc.username} 解鎖 ${newlyUnlocked.length} 個徽章: ${newlyUnlocked.map((b) => b.id).join(", ")}`.cyan
  );

  if (opts.announce && opts.channel) {
    const lines = newlyUnlocked
      .map((b) => `${b.emoji} **${b.name}** — ${b.description}`)
      .join("\n");
    opts.channel
      .send({
        content: `🎉 <@${userDoc.userId}> 解鎖了新徽章！\n${lines}`,
      })
      .catch(() => {});
  }

  return newlyUnlocked;
};
