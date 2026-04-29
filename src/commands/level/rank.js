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

const PAGE_SIZE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("等級排行榜")
    .setDescription("查看伺服器等級排行榜 🏆")
    .setDMPermission(false),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!client.userLevelsCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動");
      }

      const top = await client.userLevelsCollection
        .find({ guildId: interaction.guildId })
        .sort({ totalXp: -1 })
        .limit(PAGE_SIZE)
        .toArray();

      if (top.length === 0) {
        return interaction.editReply("📊 還沒有人累積等級資料～");
      }

      const myDoc = await client.userLevelsCollection.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      let myRank = null;
      if (myDoc) {
        myRank =
          (await client.userLevelsCollection.countDocuments({
            guildId: interaction.guildId,
            totalXp: { $gt: myDoc.totalXp },
          })) + 1;
      }

      const medals = ["🥇", "🥈", "🥉"];
      const renderRow = (doc, idx) => {
        const prog = getLevelProgress(doc.totalXp);
        const tier = getTier(prog.level);
        const medal = medals[idx] || `**${idx + 1}.**`;
        return `${medal} <@${doc.userId}> ・ ${tier.emoji} **Lv.${prog.level}** ・ ${doc.totalXp.toLocaleString()} XP`;
      };

      const top3 = top.slice(0, 3).map(renderRow).join("\n");
      const rest = top.slice(3).map(renderRow).join("\n");

      const container = new ContainerBuilder()
        .setAccentColor(0xffd700)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 🏆 ${interaction.guild.name} 等級排行榜`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );

      if (top3) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(top3)
        );
      }
      if (rest) {
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(rest)
          );
      }

      if (myRank && myRank > PAGE_SIZE) {
        const myProg = getLevelProgress(myDoc.totalXp);
        const myTier = getTier(myProg.level);
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**你的排名**：#${myRank} ・ ${myTier.emoji} Lv.${myProg.level} ・ ${myDoc.totalXp.toLocaleString()} XP`
            )
          );
      }

      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 顯示前 ${PAGE_SIZE} 名 ・ 用 \`/等級卡\` 看詳細卡片`
          )
        );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /等級排行榜:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 排行榜載入失敗！")
        .catch(() => {});
    }
  },
};
