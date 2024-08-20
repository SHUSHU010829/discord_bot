require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("即時匯率")
    .setDescription("均採用美金報價，預設為 TWD。資料來源：RTER.info")
    .addStringOption((option) =>
      option.setName("欲兌貨幣").setDescription("EX:日幣 ➡️ JPY")
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const targetCurrency = options.getString("欲兌貨幣") || "TWD"; // 目標貨幣

    await interaction.reply({
      content: "查詢中... 📝",
      fetchReply: true,
    });

    try {
      // 查詢 USDTWD 和 USD{目標貨幣} 的匯率
      const foreignExchangeRate = await getForeignExchangeRate();

      if (targetCurrency.toUpperCase() === "TWD") {
        // 若目標貨幣為 TWD，直接顯示 USDTWD
        const twdRate = foreignExchangeRate["USDTWD"];
        if (twdRate) {
          const embed = new EmbedBuilder()
            .setTitle(`匯率資訊：USD ➡️ TWD`)
            .setColor("Random")
            .addFields(
              { name: "匯率", value: `${twdRate.Exrate}` },
              { name: "更新時間", value: `${twdRate.UTC}` }
            )
            .setFooter({ text: "資料來源：RTER.info" });

          await interaction.editReply("即時匯率 ⬇️");
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply("找尋不到對應幣值！");
        }
      } else {
        // 查詢 USDTWD 和 USD{目標貨幣} 的匯率
        const twdRate = foreignExchangeRate["USDTWD"];
        const targetRate =
          foreignExchangeRate[`USD${targetCurrency.toUpperCase()}`];

        if (twdRate && targetRate) {
          const exchangeRate = targetRate.Exrate / twdRate.Exrate;

          const embed = new EmbedBuilder()
            .setTitle(`匯率資訊：TWD ➡️ ${targetCurrency.toUpperCase()}`)
            .setColor("Random")
            .addFields(
              { name: "匯率", value: `${exchangeRate.toFixed(4)}` },
              { name: "更新時間", value: `${twdRate.UTC}` }
            )
            .setFooter({ text: "資料來源：RTER.info" });

          await interaction.editReply("即時匯率 ⬇️");
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply("找尋不到對應幣值！");
        }
      }
    } catch (error) {
      await interaction.editReply("哎呀！查詢不到對應資訊！");
      console.log(
        `[ERROR] An error occurred inside the exchange rate :\n${error}`.red
      );
    }
  },
};
