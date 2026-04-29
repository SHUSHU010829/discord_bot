require("colors");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");

const { getLevelProgress } = require("../../utils/levelMath");
const { getTier } = require("../../utils/levelTier");

const PROGRESS_BAR_LENGTH = 20;

function renderProgressBar(progress) {
  const filled = Math.round(progress * PROGRESS_BAR_LENGTH);
  const empty = PROGRESS_BAR_LENGTH - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\``;
}

function formatVoiceTime(minutes) {
  if (!minutes || minutes <= 0) return "0 分";
  if (minutes < 60) return `${minutes} 分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小時 ${m} 分` : `${h} 小時`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("等級卡")
    .setDescription("查看你或他人的等級卡 🏅")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("用戶")
        .setDescription("不填預設查自己")
        .setRequired(false)
    ),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!client.userLevelsCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動，請聯絡舒舒！");
      }

      const target = interaction.options.getUser("用戶") || interaction.user;
      const member = await interaction.guild.members
        .fetch(target.id)
        .catch(() => null);

      const doc = await client.userLevelsCollection.findOne({
        userId: target.id,
        guildId: interaction.guildId,
      });

      if (!doc) {
        return interaction.editReply(
          `${target.username} 還沒有等級資料！多聊天才會開始累積喔 🌱`
        );
      }

      const progress = getLevelProgress(doc.totalXp);
      const tier = getTier(progress.level);

      const rank =
        (await client.userLevelsCollection.countDocuments({
          guildId: interaction.guildId,
          totalXp: { $gt: doc.totalXp },
        })) + 1;

      const totalUsers = await client.userLevelsCollection.countDocuments({
        guildId: interaction.guildId,
      });

      const displayName = member?.displayName || target.username;
      const titleLine = doc.title ? `${doc.title}` : `${tier.emoji} ${tier.label}`;

      const accentInt = parseInt(tier.color.slice(1), 16);

      const container = new ContainerBuilder()
        .setAccentColor(accentInt)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${tier.emoji} ${displayName} 的等級卡\n-# ${titleLine}`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `**Lv.${progress.level}** ・ ${tier.emoji} ${tier.label}`,
              `${renderProgressBar(progress.progress)} ${Math.floor(progress.progress * 100)}%`,
              `\`${progress.currentLevelXp.toLocaleString()} / ${progress.xpToNextLevel.toLocaleString()}\` XP（離下一等）`,
            ].join("\n")
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `🏆 **總 XP**：${doc.totalXp.toLocaleString()}`,
              `📊 **排名**：#${rank} / ${totalUsers}`,
              `💬 **訊息數**：${(doc.totalMessages || 0).toLocaleString()}`,
              `🎤 **語音時長**：${formatVoiceTime(doc.totalVoiceMinutes || 0)}`,
              `🔥 **連續簽到**：${doc.streak || 0} 天 ・ 歷史最長 ${doc.longestStreak || 0} 天`,
              `🏅 **徽章數**：${(doc.badges || []).length}`,
            ].join("\n")
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 訊息 ${(doc.xpFromMessage || 0).toLocaleString()} XP ・ 語音 ${(doc.xpFromVoice || 0).toLocaleString()} XP ・ 簽到 ${(doc.xpFromDaily || 0).toLocaleString()} XP`
          )
        );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /profile:\n${error}`.red);
      await interaction
        .editReply("🔧 等級卡載入失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
