require("colors");
const { AttachmentBuilder } = require("discord.js");
const { levelSystem } = require("../../config.json");
const generateLevelUpCard = require("../../utils/generateLevelUpCard");

/**
 * 升級公告策略：
 *   1. 不是 milestone（5/10/20...）→ 完全不公告，避免洗版
 *   2. milestone:
 *      - 有設 levelUpAnnouncement.channelId → 一律送該頻道
 *      - 沒設 → 送觸發升級的當下頻道（messageXp 才有 channel；voice tick 沒有就不公告）
 */
module.exports = async (client, opts) => {
  const cfg = levelSystem?.levelUpAnnouncement;
  if (!cfg?.enabled) return;

  const { afterLevel, beforeLevel, member, after, channel } = opts;
  const milestones = cfg.milestones || [];
  const isMilestone = milestones.includes(afterLevel);
  if (!isMilestone) return;

  let targetChannel = null;
  if (cfg.channelId) {
    targetChannel = client.channels.cache.get(cfg.channelId);
  }
  if (!targetChannel && channel) {
    targetChannel = channel;
  }
  if (!targetChannel) return;

  try {
    const username = member?.displayName || after.username || "Someone";
    const mention = member ? `<@${member.id}>` : username;

    if (cfg.useCard !== false) {
      try {
        const buf = await generateLevelUpCard({
          username,
          avatarUrl: member?.user?.displayAvatarURL?.({
            extension: "png",
            size: 256,
          }),
          beforeLevel,
          afterLevel,
          totalXp: after.totalXp || 0,
        });
        const attachment = new AttachmentBuilder(buf, {
          name: `levelup-${afterLevel}.png`,
        });
        await targetChannel.send({
          content: `🎉 ${mention} 升到 **Lv.${afterLevel}** 啦！`,
          files: [attachment],
        });
        return;
      } catch (cardError) {
        console.log(
          `[WARNING] level up card render failed, fallback to text: ${cardError.message}`.yellow
        );
      }
    }

    await targetChannel.send(
      `🎉 ${mention} 從 Lv.${beforeLevel} 升到 **Lv.${afterLevel}** 啦！`
    );
  } catch (e) {
    console.log(`[ERROR] levelUpAnnouncer send: ${e}`.red);
  }
};
