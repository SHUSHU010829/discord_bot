// /二十一點統計 — 全伺服器 21 點對局結果統計（依 result 分組）

require("colors");
const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");

const RESULT_META = {
  blackjack: { label: "🃏 玩家 Blackjack", order: 1, win: true },
  fivecard: { label: "🖐️ 玩家過五關", order: 2, win: true },
  win: { label: "✅ 玩家勝", order: 3, win: true },
  push: { label: "🤝 平手", order: 4, win: false },
  lose: { label: "❌ 玩家負", order: 5, win: false },
  dealerfivecard: { label: "🏠 莊家過五關", order: 6, win: false },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("二十一點統計")
    .setDescription("📊 本伺服器 21 點對局結果分布統計")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("統計期間（預設全部）")
        .setRequired(false)
        .addChoices(
          { name: "今天", value: "today" },
          { name: "本週", value: "week" },
          { name: "本月", value: "month" },
          { name: "全部", value: "all" },
        ),
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      if (!client.blackjackGamesCollection) {
        return interaction.editReply("🔧 21 點系統尚未啟動。");
      }

      const period = interaction.options.getString("period") || "all";
      const guildId = interaction.guildId;

      const match = {
        status: "settled",
        guildId,
        ...getDateFilter(period),
      };

      const rows = await client.blackjackGamesCollection
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: "$result",
              count: { $sum: 1 },
              totalBet: { $sum: "$bet" },
              totalPayout: { $sum: "$payout" },
            },
          },
          { $sort: { count: -1 } },
        ])
        .toArray();

      if (!rows.length) {
        return interaction.editReply(
          `📊 ${describePeriod(period)}尚無已結算的 21 點對局紀錄。`,
        );
      }

      const totals = rows.reduce(
        (acc, r) => {
          acc.count += r.count;
          acc.totalBet += r.totalBet || 0;
          acc.totalPayout += r.totalPayout || 0;
          if (RESULT_META[r._id]?.win) acc.winCount += r.count;
          if (r._id === "push") acc.pushCount += r.count;
          return acc;
        },
        { count: 0, totalBet: 0, totalPayout: 0, winCount: 0, pushCount: 0 },
      );

      const netProfit = totals.totalPayout - totals.totalBet;
      const rtp = totals.totalBet > 0 ? (totals.totalPayout / totals.totalBet) * 100 : 0;
      const decided = totals.count - totals.pushCount;
      const winRate = decided > 0 ? (totals.winCount / decided) * 100 : 0;

      const overall =
        `**📈 ${describePeriod(period)}總計**\n` +
        `🎮 對局數：**${totals.count.toLocaleString()}** 局\n` +
        `💸 總下注：**${totals.totalBet.toLocaleString()}** credits\n` +
        `💰 總派彩：**${totals.totalPayout.toLocaleString()}** credits\n` +
        `${netProfit >= 0 ? "📈" : "📉"} 玩家淨輸贏：**${netProfit >= 0 ? "+" : ""}${netProfit.toLocaleString()}**\n` +
        `🎯 RTP：**${rtp.toFixed(1)}%**　・　🏆 勝率（不含平手）：**${winRate.toFixed(1)}%**`;

      const sortedRows = [...rows].sort((a, b) => {
        const oa = RESULT_META[a._id]?.order ?? 99;
        const ob = RESULT_META[b._id]?.order ?? 99;
        return oa - ob;
      });

      const breakdownLines = sortedRows.map((r) => {
        const meta = RESULT_META[r._id] || { label: `❓ ${r._id || "unknown"}` };
        const pct = totals.count > 0 ? (r.count / totals.count) * 100 : 0;
        const net = (r.totalPayout || 0) - (r.totalBet || 0);
        return (
          `${meta.label} — **${r.count.toLocaleString()}** 局（${pct.toFixed(1)}%）\n` +
          `-# 下注 ${(r.totalBet || 0).toLocaleString()} ・ 派彩 ${(r.totalPayout || 0).toLocaleString()} ・ 淨 ${net >= 0 ? "+" : ""}${net.toLocaleString()}`
        );
      });

      const accent = netProfit >= 0 ? 0x2ecc71 : 0xe74c3c;

      const container = new ContainerBuilder()
        .setAccentColor(accent)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("# 🃏 21 點對局統計"),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(overall),
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(breakdownLines.join("\n\n")),
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 統計期間：${describePeriod(period)} ・ <t:${Math.floor(Date.now() / 1000)}:R>\n` +
              `-# 已結算對局保留 30 天，僅含 status = settled 的紀錄。`,
          ),
        );

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /二十一點統計:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("❌ 查詢 21 點統計時發生錯誤")
        .catch(() => {});
    }
  },
};

function getDateFilter(period) {
  const now = DateTime.now().setZone("Asia/Taipei");
  switch (period) {
    case "today":
      return { createdAt: { $gte: now.startOf("day").toJSDate() } };
    case "week":
      return { createdAt: { $gte: now.startOf("week").toJSDate() } };
    case "month":
      return { createdAt: { $gte: now.startOf("month").toJSDate() } };
    case "all":
    default:
      return {};
  }
}

function describePeriod(period) {
  switch (period) {
    case "today":
      return "今天";
    case "week":
      return "本週";
    case "month":
      return "本月";
    case "all":
    default:
      return "全部時間";
  }
}
