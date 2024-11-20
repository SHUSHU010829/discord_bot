require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const getPoem = require("../../utils/getPoem");
const getStraw = require("../../utils/getStraw");
const changeTraditional = require("../../utils/changeTraditional");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("抽籤")
    .setDescription("來抽個籤吧！")
    .addStringOption((option) =>
      option.setName("諮詢方向").setDescription("輸入想抽籤的主題")
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const question = options.getString("諮詢方向");

    await interaction.reply({
      content: "抽籤中... 🧧",
      fetchReply: true,
    });

    const strawResult = await getStraw();
    const poem = await getPoem();
    let embed;

    if (poem) {
      const origin = await changeTraditional(poem.origin);
      const content = await changeTraditional(poem.content);
      const author = await changeTraditional(poem.author);

      embed = new EmbedBuilder()
        .setTitle(`${strawResult}`)
        .setDescription(`🔖 問題:${question || "日常求籤"}`)
        .setColor("Random")
        .addFields(
          { name: "\u200B", value: "\u200B" },
          { name: content.text, value: `《${origin.text}》${author.text}` }
        )
        .setTimestamp();
    } else {
      embed = new EmbedBuilder()
        .setTitle(`${strawResult}`)
        .setDescription(`🔖 問題:${question || "日常求籤"}`)
        .setColor("Random")
        .setTimestamp();
    }

    try {
      interaction.editReply("求籤結果 ⬇️");
      interaction.editReply({ embeds: [embed] });
    } catch (error) {
      interaction.editReply("哎呀！今天籤筒休息了💤");
      console.log(
        `[ERROR] An error occurred inside the straws ask:\n${error}`.red
      );
    }
  },
};
