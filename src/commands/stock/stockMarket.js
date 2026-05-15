require("colors");
const {
  SlashCommandBuilder,
  InteractionContextType,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const { stockSystem } = require("../../config");
const { renderMultiLine } = require("../../features/stock/chartRenderer");

const SENTIMENT_LABEL = {
  bull: "🐂 牛市",
  bear: "🐻 熊市",
  sideways: "🦀 震盪",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("股市")
    .setDescription("查看逼逼股市目前所有股票報價與走勢")
    .setContexts(InteractionContextType.Guild)
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();
    try {
      if (!stockSystem?.enabled) return interaction.editReply("🔧 股市系統未啟用。");
      if (!client.stockMarketCollection || !client.stockPricesCollection) {
        return interaction.editReply("🔧 股市系統尚未就緒，請聯絡舒舒。");
      }
      const guildId = interaction.guildId;
      const stocks = await client.stockMarketCollection
        .find({ guildId, enabled: { $ne: false } })
        .sort({ symbol: 1 })
        .toArray();
      if (stocks.length === 0) {
        return interaction.editReply("📭 目前還沒有上市股票（請執行 seed 腳本）。");
      }

      const historyPoints = stockSystem?.chart?.historyPoints ?? 20;
      const series = await Promise.all(
        stocks.map(async (s) => {
          const points = await client.stockPricesCollection
            .find({ guildId, symbol: s.symbol })
            .sort({ timestamp: -1 })
            .limit(historyPoints)
            .toArray();
          // 反轉成時間正序，再前置 openPrice 起點補齊
          const ordered = points.reverse();
          return { symbol: s.symbol, name: s.name, points: ordered };
        })
      );

      // 一個 tick = 15 分鐘；換算成人話讓圖上標題不用露 tick 這個字
      const minutes = historyPoints * 15;
      const timeLabel =
        minutes >= 60
          ? `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} 小時`
          : `${minutes} 分鐘`;
      const buf = renderMultiLine(series, {
        title: `逼逼股市｜最近 ${timeLabel}各股漲跌（以最早一筆為起點）`,
      });
      const attachment = new AttachmentBuilder(buf, { name: "stock_market.png" });

      const sentiment = stocks[0]?.marketSentiment || stockSystem.defaultMarketSentiment || "sideways";
      const sentimentLabel = SENTIMENT_LABEL[sentiment] || sentiment;

      // 計算今日漲跌幅、週高週低
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const fields = [];
      for (const s of stocks) {
        const open = s.openPrice || s.currentPrice;
        const chg = open > 0 ? ((s.currentPrice - open) / open) * 100 : 0;
        const weekly = await client.stockPricesCollection
          .find({ guildId, symbol: s.symbol, timestamp: { $gte: weekAgo } })
          .toArray();
        const weekPrices = weekly.map((w) => w.price);
        const wh = weekPrices.length ? Math.max(...weekPrices, s.currentPrice) : s.currentPrice;
        const wl = weekPrices.length ? Math.min(...weekPrices, s.currentPrice) : s.currentPrice;
        fields.push({
          name: `\`${s.symbol}\` ${s.name}`,
          value:
            `現價 **${s.currentPrice.toFixed(1)}**　今日 ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\n` +
            `週高 ${wh.toFixed(1)}　週低 ${wl.toFixed(1)}`,
          inline: true,
        });
      }

      // 下次 tick 時間：對齊 15 分鐘
      const now = new Date();
      const mins = now.getMinutes();
      const nextTickMin = (Math.floor(mins / 15) + 1) * 15;
      const next = new Date(now);
      next.setMinutes(nextTickMin % 60, 0, 0);
      if (nextTickMin >= 60) next.setHours(next.getHours() + 1);
      const epoch = Math.floor(next.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setTitle("📈 逼逼股市")
        .setColor(0x3498db)
        .setDescription(`市場情緒：${sentimentLabel}　下次更新：<t:${epoch}:R>`)
        .addFields(fields)
        .setImage("attachment://stock_market.png")
        .setTimestamp(new Date());

      await interaction.editReply({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.log(`[STOCK] /股市 失敗：${err?.stack || err}`.red);
      await interaction.editReply("❌ 查詢失敗，請稍後再試。").catch(() => {});
    }
  },
};
