require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const getAnswer = require("../../utils/getAnswer.js");
const changeTraditional = require("../../utils/changeTraditional.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("我想問")
    .setDescription("跟機器人問問題吧！")
    .addStringOption((option) =>
      option
        .setName("問題")
        .setDescription("輸入你想問的問題")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const question = options.getString("問題");
    const answer = await getAnswer();
    if (!answer) {
      return interaction.reply({
        content: "無法取得答案，請稍後再試。",
        ephemeral: true,
      });
    }
    const final = await changeTraditional(answer.data.zh);

    const embed = new EmbedBuilder()
      .setTitle(`${final.text}`)
      .setDescription(`📝 問題:${question}`)
      .setColor("Random")
      .setTimestamp();

    try {
      return interaction.reply({
        embeds: [embed],
      });
    } catch (error) {
      console.log(
        `[ERROR] An error occurred inside the command ask:\n${error}`.red
      );
    }
  },
};
