require("colors");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");

const { BADGES, BADGE_CATEGORIES } = require("../../features/leveling/badgeDefinitions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("徽章圖鑑")
    .setDescription("查看你的徽章圖鑑 🏅")
    .setDMPermission(false),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const doc = await client.userLevelsCollection?.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      const owned = new Set(doc?.badges || []);

      const container = new ContainerBuilder()
        .setAccentColor(0xd4a437)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🏅 徽章圖鑑\n已解鎖 **${owned.size} / ${BADGES.length}**`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );

      for (const [catKey, catLabel] of Object.entries(BADGE_CATEGORIES)) {
        const catBadges = BADGES.filter((b) => b.category === catKey);
        if (catBadges.length === 0) continue;

        const lines = catBadges.map((b) => {
          const has = owned.has(b.id);
          const icon = has ? b.emoji : "🔒";
          const name = has ? `**${b.name}**` : b.name;
          return `${icon} ${name} — ${b.description}`;
        });

        container
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### ${catLabel}\n${lines.join("\n")}`
            )
          )
          .addSeparatorComponents(new SeparatorBuilder());
      }

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 🔒 = 未解鎖 ・ 用 \`/稱號 設定\` 把已解鎖徽章設成等級卡稱號`
        )
      );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.log(`[ERROR] /徽章圖鑑:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 載入徽章圖鑑失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
