require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("二選一")
    .setDescription("讓機器人幫你選！")
    .addStringOption((option) =>
      option
        .setName("選擇一")
        .setDescription("輸入想要抽選項目的第一項")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("選擇二")
        .setDescription("輸入想要抽選項目的第二項")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const choice1 = options.getString("選擇一");
    const choice2 = options.getString("選擇二");

    await interaction.deferReply();

    const choices = [choice1, choice2];
    const result = choices[Math.floor(Math.random() * choices.length)];

    const embed = new EmbedBuilder()
      .setTitle(`機器人選了"${result}"！`)
      .setDescription(`➡️ "${choice1}" v.s "${choice2}"`)
      .setColor("Random")
      .setTimestamp();

    try {
      await interaction.editReply("二選一結果 ⬇️");
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply("哎呀！今天懶得選擇 💤");
      console.log(
        `[ERROR] An error occurred inside the choose One:\n${error}`.red
      );
    }
  },
};
