require("colors");

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");

const getTwitterPost = require("../../utils/getTwitterPost");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("周表")
    .setDescription("[尚在開發]拿取 Vtuber 周表 (目前預設為 汐SEKI 的周表)"),

  run: async (client, interaction) => {
    const calender = await getTwitterPost('SekiVtuberTW');
    console.log(calender);

    try {
      return interaction.reply({
        content: '還在測試中，請稍後再試。',
      });
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the command ask:\n${error}`.red
      );
    }
  },
};
