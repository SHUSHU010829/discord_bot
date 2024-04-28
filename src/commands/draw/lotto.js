require("colors");

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("鹹魚翻身")
    .setDescription("不保證中獎樂透號碼... 🎰"),

  run: async (interaction) => {
    await interaction.reply({
      content: "預測中... 🎰",
      fetchReply: true,
    });

    const getLottoNumbers = () => {
      const numbers = new Set();
      // 隨機選擇六個不重複的號碼
      while (numbers.size < 6) {
        numbers.add(Math.floor(Math.random() * 49) + 1);
      }
      // 從小到大排序
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      return sortedNumbers;
    };

    const lottoNumbers = getLottoNumbers();

    try {
      interaction.editReply(
        `本期樂透 ➡️ \n\n${lottoNumbers.join(", ")}` +
          `\n\n祝您中大獎！🔥\n中了記得分舒舒，不客氣 ✨`
      );
    } catch (error) {
      interaction.editReply("哎呀！今天不適合簽大樂透 💤");
      console.log(
        `[ERROR] An error occurred inside the lotto ask:\n${error}`.red
      );
    }
  },
};
