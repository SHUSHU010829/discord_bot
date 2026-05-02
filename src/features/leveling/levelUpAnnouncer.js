require("colors");
const { AttachmentBuilder } = require("discord.js");
const { levelSystem } = require("../../config");
const generateLevelUpCard = require("../../utils/generateLevelUpCard");

let cardErrorCount = 0;

function classifyCardError(err) {
  const msg = err?.message || String(err);
  if (/font|woff|ENOENT.*\.woff/i.test(msg)) return "font";
  if (/satori|resvg|render|svg/i.test(msg)) return "render";
  return "other";
}

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

  const { afterLevel, beforeLevel, member, after, channel, newBadges } = opts;
  const milestones = cfg.milestones || [];
  const crossedMilestone = milestones.some(
    (m) => m > beforeLevel && m <= afterLevel
  );
  if (!crossedMilestone) return;

  let targetChannel = null;
  if (cfg.channelId) {
    targetChannel = client.channels.cache.get(cfg.channelId);
  }
  if (!targetChannel && channel) {
    targetChannel = channel;
  }
  if (!targetChannel && cfg.fallbackChannelId) {
    targetChannel = client.channels.cache.get(cfg.fallbackChannelId);
  }
  if (!targetChannel) return;

  const badgeSuffix =
    Array.isArray(newBadges) && newBadges.length > 0
      ? `\n🎉 解鎖新徽章：${newBadges.map((b) => `${b.emoji} **${b.name}**`).join("、")}`
      : "";

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
          content: `🎉 ${mention} 升到 **Lv.${afterLevel}** 啦！${badgeSuffix}`,
          files: [attachment],
        });
        return;
      } catch (cardError) {
        cardErrorCount += 1;
        const kind = classifyCardError(cardError);
        if (kind === "font") {
          console.error(
            `[ERROR] level up card font load failed (count=${cardErrorCount}): ${cardError.message}`.red
          );
        } else if (kind === "render") {
          console.error(
            `[ERROR] level up card satori/resvg render failed (count=${cardErrorCount}): ${cardError.message}\n${cardError.stack || ""}`.red
          );
        } else {
          console.log(
            `[WARNING] level up card render failed, fallback to text: ${cardError.message}`.yellow
          );
        }
      }
    }

    await targetChannel.send(
      `🎉 ${mention} 從 Lv.${beforeLevel} 升到 **Lv.${afterLevel}** 啦！${badgeSuffix}`
    );
  } catch (e) {
    console.log(`[ERROR] levelUpAnnouncer send: ${e}`.red);
  }
};
