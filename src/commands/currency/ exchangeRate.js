require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("即時匯率")
    .setDescription("均採用美金報價，預設為 TWD。資料來源：RTER.info")
    .addStringOption((option) =>
      option.setName("欲兌貨幣").setDescription("台幣：TWD")
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    let currency = options.getString("欲兌貨幣") || "TWD";

    // 將 currency 轉成大寫並加上 "USD"
    currency = `USD${currency.toUpperCase()}`;

    const foreignExchangeRate = await getForeignExchangeRate();
    console.log("🚀 ~ run: ~ foreignExchangeRate:", foreignExchangeRate);

    await interaction.reply({
      content: "查詢中... 📝",
      fetchReply: true,
    });

    // 判斷是否查詢到資料
    if (foreignExchangeRate && foreignExchangeRate[currency]) {
      const embed = new EmbedBuilder()
        .setTitle(`匯率資訊：${currency}`)
        .setColor("Random")
        .addFields(
          { name: "匯率", value: `${foreignExchangeRate[currency].Exrate}` },
          { name: "更新時間", value: `${foreignExchangeRate[currency].UTC}` }
        )
        .setFooter({ text: "資料來源：RTER.info" });

      try {
        await interaction.editReply("即時匯率 ⬇️");
        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        interaction.editReply("哎呀！查詢不到對應資訊！");
        console.log(
          `[ERROR] An error occurred inside the exchange rate :\n${error}`.red
        );
      }
    } else {
      await interaction.editReply("找尋不到對應幣值！");
    }
  },
};
