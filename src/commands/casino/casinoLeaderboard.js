// /賭場排行 — 賭場淨輸贏周榜（賺最多 / 賠最多）

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

const TYPE_META = {
  winners: {
    title: "💰 賭場賺最多周榜",
    accent: 0x2ecc71,
    sort: -1,
    profitFilter: { netProfit: { $gt: 0 } },
    emptyHint: "本週還沒有人在賭場賺到錢",
  },
  losers: {
    title: "💸 賭場賠最多周榜",
    accent: 0xe74c3c,
    sort: 1,
    profitFilter: { netProfit: { $lt: 0 } },
    emptyHint: "本週還沒有人在賭場賠錢",
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("賭場排行")
    .setDescription("🎰 查看賭場本週淨輸贏排行榜")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("排行榜類型")
        .setRequired(true)
        .addChoices(
          { name: "💰 賺最多", value: "winners" },
          { name: "💸 賠最多", value: "losers" },
        ),
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    const type = interaction.options.getString("type");
    const meta = TYPE_META[type];

    try {
      if (!client.coinTransactionsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動。");
      }

      const { rows, range } = await fetchCasinoLeaderboard(
        client,
        interaction.guild.id,
        type,
      );

      if (!rows.length) {
        return interaction.editReply(`📊 ${meta.emptyHint}`);
      }

      const container = buildContainer({ meta, rows, range });
      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.log(`[ERROR] /賭場排行:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("❌ 查詢賭場排行榜時發生錯誤")
        .catch(() => {});
    }
  },
};

async function fetchCasinoLeaderboard(client, guildId, type) {
  const meta = TYPE_META[type];
  const baseMatch = {
    guildId,
    source: { $in: ["bet", "payout"] },
    ...getWeekFilter(),
  };

  const [data, rangeAgg] = await Promise.all([
    client.coinTransactionsCollection
      .aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: "$userId",
            netProfit: { $sum: "$amount" },
            totalWagered: {
              $sum: {
                $cond: [{ $eq: ["$source", "bet"] }, { $abs: "$amount" }, 0],
              },
            },
            totalPayout: {
              $sum: {
                $cond: [{ $eq: ["$source", "payout"] }, "$amount", 0],
              },
            },
          },
        },
        { $match: meta.profitFilter },
        { $sort: { netProfit: meta.sort } },
        { $limit: 10 },
      ])
      .toArray(),
    client.coinTransactionsCollection
      .aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            firstDate: { $min: "$date" },
            lastDate: { $max: "$date" },
          },
        },
      ])
      .toArray(),
  ]);

  const rows = data.map((u) => ({
    userId: u._id,
    netProfit: u.netProfit,
    totalWagered: u.totalWagered,
    totalPayout: u.totalPayout,
  }));

  const range = rangeAgg[0]
    ? { firstDate: rangeAgg[0].firstDate, lastDate: rangeAgg[0].lastDate }
    : null;

  return { rows, range };
}

function buildContainer({ meta, rows, range }) {
  const medals = ["🥇", "🥈", "🥉"];
  const renderRow = (row, idx) => {
    const medal = medals[idx] || `**${idx + 1}.**`;
    const sign = row.netProfit >= 0 ? "+" : "";
    return (
      `${medal} <@${row.userId}> — **${sign}${row.netProfit.toLocaleString()}** credits\n` +
      `-# 下注 ${row.totalWagered.toLocaleString()} ・ 派彩 ${row.totalPayout.toLocaleString()}`
    );
  };

  const top3 = rows
    .slice(0, 3)
    .map((row, i) => renderRow(row, i))
    .join("\n");
  const rest = rows
    .slice(3)
    .map((row, i) => renderRow(row, i + 3))
    .join("\n");

  const container = new ContainerBuilder()
    .setAccentColor(meta.accent)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${meta.title}`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
    );

  if (top3) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(top3),
    );
  }
  if (rest) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(rest));
  }

  const rangeText = describeRange(range);
  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 統計期間：本週（${rangeText}）・ <t:${Math.floor(Date.now() / 1000)}:R>\n` +
          `-# 統計範圍：拉霸、21 點、HI-LO、輪盤、骰寶、德州撲克、樂透（交易紀錄最多保留 90 天）`,
      ),
    );

  return container;
}

function describeRange(range) {
  if (!range?.firstDate || !range?.lastDate) return "無資料";
  const first = DateTime.fromISO(range.firstDate, { zone: "Asia/Taipei" });
  const last = DateTime.fromISO(range.lastDate, { zone: "Asia/Taipei" });
  const days = Math.max(1, Math.round(last.diff(first, "days").days) + 1);
  if (range.firstDate === range.lastDate) {
    return `${range.firstDate}・共 1 天`;
  }
  return `${range.firstDate} ~ ${range.lastDate}・共 ${days} 天`;
}

function getWeekFilter() {
  const now = DateTime.now().setZone("Asia/Taipei");
  return { date: { $gte: now.startOf("week").toISODate() } };
}
