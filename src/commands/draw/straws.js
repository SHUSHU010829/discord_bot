require("colors");

const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const { morningMessage } = require("../../config.json");
const getPoem = require("../../utils/getPoem");
const getStraw = require("../../utils/getStraw");
const changeTraditional = require("../../utils/changeTraditional");
const generateFortuneCard = require("../../utils/generateFortuneCard");

const WEEKDAY_EN = ["", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("抽籤")
    .setDescription("來抽個籤吧！🧧")
    .addStringOption((option) =>
      option.setName("諮詢方向").setDescription("輸入想抽籤的主題")
    ),

  run: async (client, interaction) => {
    try {
      await interaction.deferReply();

      const question = interaction.options.getString("諮詢方向") || "日常求籤";
      const strawResult = await getStraw();
      const fortuneText = strawResult.replace(/^\S+\s+/, "").trim();

      const poem = await getPoem();
      let poemContent = "";
      let poemOrigin = "";
      let poemAuthor = "";
      if (poem) {
        const content = await changeTraditional(poem.content);
        const origin = await changeTraditional(poem.origin);
        const author = await changeTraditional(poem.author);
        poemContent = content?.text || "";
        poemOrigin = origin?.text || "";
        poemAuthor = author?.text || "";
      }

      const timezone = morningMessage?.timezone || "Asia/Taipei";
      const now = DateTime.now().setZone(timezone);
      const dateStr = `${now.toFormat("yyyy.MM.dd")} ${WEEKDAY_EN[now.weekday] || ""}`.trim();
      const serialNo = "0829";

      const pngBuffer = await generateFortuneCard({
        fortuneText,
        question,
        poemContent,
        poemOrigin,
        poemAuthor,
        dateStr,
        serialNo,
      });

      const attachment = new AttachmentBuilder(pngBuffer, {
        name: `fortune-${serialNo}.png`,
      });

      await interaction.editReply({
        content: `求籤結果 ⬇️　${strawResult}`,
        files: [attachment],
      });
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the straws ask:\n${error}`.red
      );
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("哎呀！今天籤筒休息了 💤");
      } else {
        await interaction.reply({
          content: "哎呀！今天籤筒休息了 💤",
          ephemeral: true,
        });
      }
    }
  },
};
