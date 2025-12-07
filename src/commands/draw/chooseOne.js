require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("二選一")
    .setDescription("讓機器人幫你選！支援 2-5 個選項")
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
    )
    .addStringOption((option) =>
      option
        .setName("選擇三")
        .setDescription("輸入想要抽選項目的第三項（可選）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("選擇四")
        .setDescription("輸入想要抽選項目的第四項（可選）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("選擇五")
        .setDescription("輸入想要抽選項目的第五項（可選）")
        .setRequired(false)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;

    // 收集所有非空的選項
    const choices = [];
    for (let i = 1; i <= 5; i++) {
      const choiceName = i === 1 ? "選擇一" : i === 2 ? "選擇二" : i === 3 ? "選擇三" : i === 4 ? "選擇四" : "選擇五";
      const choice = options.getString(choiceName);
      if (choice) {
        choices.push(choice);
      }
    }

    await interaction.deferReply();

    const result = choices[Math.floor(Math.random() * choices.length)];

    // 生成選項對比文字
    const choicesText = choices.map((c, i) => `${i + 1}. "${c}"`).join(" v.s ");

    const embed = new EmbedBuilder()
      .setTitle(`機器人選了"${result}"！`)
      .setDescription(`➡️ ${choicesText}`)
      .setColor("Random")
      .setFooter({ text: `從 ${choices.length} 個選項中選出` })
      .setTimestamp();

    try {
      await interaction.editReply(`${choices.length === 2 ? "二" : choices.length === 3 ? "三" : choices.length === 4 ? "四" : choices.length === 5 ? "五" : "多"}選一結果 ⬇️`);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply("哎呀！今天懶得選擇 💤");
      console.log(
        `[ERROR] An error occurred inside the choose One:\n${error}`.red
      );
    }
  },
};
