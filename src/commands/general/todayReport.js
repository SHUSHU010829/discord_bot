require("colors");

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const { morningMessage } = require("../../config.json");
const getStraw = require("../../utils/getStraw");
const getLunarInfo = require("../../utils/getLunarInfo");
const findNextSpecialDay = require("../../utils/findNextSpecialDay");
const buildCardData = require("../../utils/buildCardData");
const generateMorningCard = require("../../utils/generateMorningCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("今日早報")
    .setDescription("生成今日早報圖片 📰"),

  run: async (client, interaction) => {
    try {
      await interaction.deferReply();

      const now = DateTime.now().setZone(morningMessage.timezone);
      const strawResult = await getStraw();
      const lunarInfo = await getLunarInfo(now.year, now.month, now.day);
      const { nextSpecialDay, daysUntilSpecialDay } = findNextSpecialDay(
        now,
        morningMessage.timezone
      );

      const cardData = buildCardData({
        now,
        lunarInfo,
        strawResult,
        nextSpecialDay,
        daysUntilSpecialDay,
      });

      const pngBuffer = await generateMorningCard(cardData);
      const attachment = new AttachmentBuilder(pngBuffer, {
        name: `morning-${cardData.serialNo}.png`,
      });

      await interaction.editReply({
        content: "今日早報 📰",
        files: [attachment],
      });
    } catch (error) {
      console.log(`[ERROR] /今日早報 生成失敗：\n${error}`.red);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("🔧 早報生成失敗，請呼叫舒舒！");
      } else {
        await interaction.reply({
          content: "🔧 早報生成失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      }
    }
  },
};
