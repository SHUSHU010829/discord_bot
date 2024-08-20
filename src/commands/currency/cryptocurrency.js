require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const getCryptocurrency = require("../../utils/getCryptocurrency");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("加密貨幣")
    .setDescription("預設用美金報價。")
    .addStringOption((option) =>
      option
        .setName("貨幣代碼")
        .setDescription("請輸入要查詢的加密貨幣代碼")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const coin = options.getString("貨幣代碼");

    await interaction.deferReply();

    try {
      const cryptocurrencyData = await getCryptocurrency(coin.trim());

      if (cryptocurrencyData && cryptocurrencyData.USD) {
        const embed = new EmbedBuilder()
          .setTitle(`貨幣：${coin}`)
          .setColor("Random")
          .addFields({ name: "價格", value: `$${cryptocurrencyData.USD}` })
          .setTimestamp()
          .setFooter({ text: "對應幣值：USD" });

        await interaction.editReply({
          content: "即時價格 ⬇️",
          embeds: [embed],
        });
      } else {
        await interaction.editReply("找尋不到對應幣值！");
      }
    } catch (error) {
      console.error("錯誤：", error);
      await interaction.editReply("發生錯誤，無法完成查詢。");
    }
  },
};
