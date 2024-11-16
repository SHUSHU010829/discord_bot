require("colors");

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const getPoem = require("../../utils/getPoem");
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
    const strawList = [
      { outcome: "🌈 大吉", weight: 5 },
      { outcome: "🔆 中吉", weight: 15 },
      { outcome: "✨ 小吉", weight: 30 },
      { outcome: "💤 沒想法", weight: 30 },
      { outcome: "💥 凶", weight: 15 },
      { outcome: "🔥 大凶", weight: 5 },
    ];

    function getRandomOutcome(list) {
      const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
      const randomNum = Math.random() * totalWeight;
      let weightSum = 0;

      for (const item of list) {
        weightSum += item.weight;
        if (randomNum <= weightSum) {
          return item.outcome;
        }
      }
    }

    await interaction.reply({
      content: "抽籤中... 🧧",
      fetchReply: true,
    });

    const randomOutcome = getRandomOutcome(strawList);
    const poem = await getPoem();
    let embed;

    if (poem) {
      const origin = await changeTraditional(poem.origin);
      const content = await changeTraditional(poem.content);
      const author = await changeTraditional(poem.author);

      embed = new EmbedBuilder()
        .setTitle(`${randomOutcome}`)
        .setDescription(`🔖 問題:${question || "日常求籤"}`)
        .setColor("Random")
        .addFields(
          { name: "\u200B", value: "\u200B" },
          { name: content.text, value: `《${origin.text}》${author.text}` }
        )
        .setTimestamp();
    } else {
      embed = new EmbedBuilder()
        .setTitle(`${randomOutcome}`)
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
