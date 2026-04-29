require("colors");

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");

const { morningMessage } = require("../../config.json");
const buildMorningPayload = require("../../utils/buildMorningPayload");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("今日早報")
    .setDescription("生成今日早報圖片 📰"),

  run: async (client, interaction) => {
    try {
      await interaction.deferReply();

      const { cardData, attachment, fileName } = await buildMorningPayload({
        timezone: morningMessage.timezone,
      });

      const headerLine = [cardData.dateStr, cardData.lunarYearLabel, cardData.lunarDay]
        .filter(Boolean)
        .join("・");

      const container = new ContainerBuilder()
        .setAccentColor(0xc8553d)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## 📰 今日早報`)
        );

      if (headerLine) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${headerLine}`)
        );
      }

      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder()
              .setURL(`attachment://${fileName}`)
              .setDescription(`早報 No.${cardData.serialNo}・${cardData.dateStr}`)
          )
        );

      if (cardData.countdownName && cardData.countdownDays != null) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `🗓️ 距離「**${cardData.countdownName}**」還有 **${cardData.countdownDays}** 天`
          )
        );
      }

      await interaction.editReply({
        components: [container],
        files: [attachment],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /今日早報 生成失敗：\n${error}`.red);
      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply({ content: "🔧 早報生成失敗，請呼叫舒舒！", components: [] })
          .catch(() => {});
      } else {
        await interaction
          .reply({ content: "🔧 早報生成失敗，請呼叫舒舒！", ephemeral: true })
          .catch(() => {});
      }
    }
  },
};
