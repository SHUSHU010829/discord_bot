require("colors");
const {
  SlashCommandBuilder,
  InteractionContextType,
  EmbedBuilder,
} = require("discord.js");

const { stockSystem } = require("../../config");
const { checkServerTenure } = require("../../features/economy/eligibility");
const { sellMarket, isMarketOpen } = require("../../features/stock/tradeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("賣股")
    .setDescription("以市價賣出股票")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((opt) =>
      opt.setName("股票代號").setDescription("例如 TSPP / UPPI / EGPP / CTPP / MTKP").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("數量")
        .setDescription("賣出股數（正整數），或填 all 全部賣出")
        .setRequired(true)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();
    try {
      if (!stockSystem?.enabled) return interaction.editReply("🔧 股市系統未啟用。");
      if (!client.stockMarketCollection || !client.userPortfolioCollection) {
        return interaction.editReply("🔧 股市系統尚未就緒。");
      }
      const tenure = checkServerTenure(interaction.member);
      if (!tenure.ok) return interaction.editReply(tenure.message);

      if (!isMarketOpen()) {
        return interaction.editReply("🌙 目前非開盤時間（09:00–21:00 Asia/Taipei）。");
      }

      const symbol = interaction.options.getString("股票代號").toUpperCase().trim();
      const rawAmount = interaction.options.getString("數量").trim().toLowerCase();
      let shares;
      if (rawAmount === "all") {
        shares = "all";
      } else {
        shares = parseInt(rawAmount, 10);
        if (!Number.isInteger(shares) || shares <= 0) {
          return interaction.editReply("❌ 數量需為正整數或 `all`。");
        }
      }

      const result = await sellMarket(client, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        username: interaction.member?.displayName || interaction.user.username,
        member: interaction.member,
        symbol,
        shares,
      });
      if (!result.ok) return interaction.editReply(result.message);

      const pnlSign = result.pnl >= 0 ? "+" : "";
      const pnlPct = result.avgCost > 0 ? ((result.price - result.avgCost) / result.avgCost) * 100 : 0;
      const embed = new EmbedBuilder()
        .setTitle(`🔴 賣出成交｜${result.symbol} ${result.name}`)
        .setColor(result.pnl >= 0 ? 0x2ecc71 : 0xe74c3c)
        .addFields(
          { name: "成交價", value: `**${result.price.toFixed(1)}** × ${result.shares} 股`, inline: true },
          { name: "毛收入", value: `${result.proceeds.toLocaleString()}`, inline: true },
          { name: "手續費", value: `${result.fee.toLocaleString()}`, inline: true },
          { name: "淨入帳", value: `**${result.netProceeds.toLocaleString()}**`, inline: true },
          { name: "平均成本", value: `${result.avgCost.toFixed(2)}`, inline: true },
          {
            name: "本筆損益",
            value: `**${pnlSign}${result.pnl.toLocaleString()}**（${pnlSign}${pnlPct.toFixed(2)}%）`,
            inline: true,
          },
          { name: "剩餘持股", value: `${result.remainingShares} 股`, inline: true },
          { name: "餘額", value: `${result.balanceAfter.toLocaleString()}`, inline: true }
        )
        .setTimestamp(new Date());
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.log(`[STOCK] /賣股 失敗：${err?.stack || err}`.red);
      await interaction.editReply("❌ 賣出失敗，請稍後再試。").catch(() => {});
    }
  },
};
