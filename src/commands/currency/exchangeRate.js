require("colors");

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const getForeignExchangeRate = require("../../utils/getForeignExchangeRate");

// 常見貨幣 — 用於 autocomplete 建議
const COMMON_CURRENCIES = [
  { code: "TWD", label: "新台幣 TWD" },
  { code: "USD", label: "美元 USD" },
  { code: "JPY", label: "日圓 JPY" },
  { code: "EUR", label: "歐元 EUR" },
  { code: "GBP", label: "英鎊 GBP" },
  { code: "KRW", label: "韓元 KRW" },
  { code: "CNY", label: "人民幣 CNY" },
  { code: "HKD", label: "港幣 HKD" },
  { code: "SGD", label: "新加坡幣 SGD" },
  { code: "AUD", label: "澳幣 AUD" },
  { code: "CAD", label: "加拿大幣 CAD" },
  { code: "CHF", label: "瑞士法郎 CHF" },
  { code: "THB", label: "泰銖 THB" },
  { code: "MYR", label: "馬來西亞令吉 MYR" },
  { code: "VND", label: "越南盾 VND" },
  { code: "PHP", label: "菲律賓披索 PHP" },
  { code: "IDR", label: "印尼盾 IDR" },
  { code: "INR", label: "印度盧比 INR" },
  { code: "NZD", label: "紐西蘭幣 NZD" },
  { code: "ZAR", label: "南非幣 ZAR" },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("即時匯率")
    .setDescription("查詢貨幣兌新台幣匯率（資料來源：RTER.info）")
    .addStringOption((option) =>
      option
        .setName("欲兌貨幣")
        .setDescription("輸入或選擇 ISO 貨幣代碼（例：JPY、USD、EUR），不填則顯示美元對台幣")
        .setAutocomplete(true)
    ),

  autocomplete: async (client, interaction) => {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "欲兌貨幣") {
      return interaction.respond([]).catch(() => {});
    }
    const query = (focused.value || "").trim().toLowerCase();
    const results = COMMON_CURRENCIES.filter(
      (c) =>
        !query ||
        c.code.toLowerCase().includes(query) ||
        c.label.toLowerCase().includes(query)
    )
      .slice(0, 25)
      .map((c) => ({ name: c.label, value: c.code }));
    await interaction.respond(results).catch(() => {});
  },

  run: async (client, interaction) => {
    const { options } = interaction;
    const targetCurrency = (options.getString("欲兌貨幣") || "TWD")
      .trim()
      .toUpperCase();

    await interaction.deferReply();

    try {
      const foreignExchangeRate = await getForeignExchangeRate();
      const twdRate = foreignExchangeRate?.["USDTWD"];

      if (!twdRate) {
        await interaction.editReply("🔧 匯率資料暫時取不到，請稍後再試。");
        return;
      }

      // 預設 / 指定 TWD：顯示 USD ➡️ TWD
      if (targetCurrency === "TWD") {
        const embed = new EmbedBuilder()
          .setTitle("💱 USD ➡️ TWD")
          .setColor(0x5865f2)
          .addFields(
            { name: "匯率", value: `\`${Number(twdRate.Exrate).toFixed(4)}\``, inline: true },
            { name: "更新時間", value: `${twdRate.UTC}`, inline: true }
          )
          .setFooter({ text: "資料來源：RTER.info" });

        await interaction.editReply({ content: "即時匯率 ⬇️", embeds: [embed] });
        return;
      }

      const targetRate = foreignExchangeRate[`USD${targetCurrency}`];
      if (!targetRate) {
        await interaction.editReply(
          `❌ 找不到貨幣 \`${targetCurrency}\` 的報價。\n` +
            `💡 請輸入有效的 ISO 貨幣代碼（如：USD、JPY、EUR），輸入時可從建議清單挑選。`
        );
        return;
      }

      const exchangeRate = twdRate.Exrate / targetRate.Exrate;
      const embed = new EmbedBuilder()
        .setTitle(`💱 ${targetCurrency} ➡️ TWD`)
        .setColor(0x5865f2)
        .addFields(
          { name: "匯率", value: `\`${exchangeRate.toFixed(4)}\``, inline: true },
          { name: "更新時間", value: `${twdRate.UTC}`, inline: true },
          {
            name: "換算範例",
            value:
              `1 ${targetCurrency} ≈ **${exchangeRate.toFixed(2)}** TWD\n` +
              `100 ${targetCurrency} ≈ **${(exchangeRate * 100).toFixed(2)}** TWD`,
            inline: false,
          }
        )
        .setFooter({ text: "資料來源：RTER.info" });

      await interaction.editReply({ content: "即時匯率 ⬇️", embeds: [embed] });
    } catch (error) {
      await interaction.editReply("哎呀！查詢不到對應資訊！");
      console.log(
        `[ERROR] An error occurred inside the exchange rate :\n${error}`.red
      );
    }
  },
};
