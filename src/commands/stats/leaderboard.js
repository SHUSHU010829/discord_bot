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
  messages: { title: "💬 訊息排行榜", emptyHint: "目前還沒有訊息統計資料" },
  voice: { title: "🎤 語音時長排行榜", emptyHint: "目前還沒有語音統計資料" },
  channels: { title: "📺 頻道活躍度排行榜", emptyHint: "目前還沒有頻道統計資料" },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("🏆 查看排行榜")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("排行榜類型")
        .setRequired(true)
        .addChoices(
          { name: "💬 訊息排行", value: "messages" },
          { name: "🎤 語音時長排行", value: "voice" },
          { name: "📺 頻道活躍度", value: "channels" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("統計期間")
        .setRequired(false)
        .addChoices(
          { name: "今天", value: "today" },
          { name: "本週", value: "week" },
          { name: "本月", value: "month" },
          { name: "全部", value: "all" }
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    const type = interaction.options.getString("type");
    const period = interaction.options.getString("period") || "today";

    try {
      const rows = await fetchLeaderboard(client, interaction, type, period);
      const meta = TYPE_META[type];

      if (!rows || rows.length === 0) {
        await interaction.editReply(`📊 ${meta.emptyHint}`);
        return;
      }

      const container = buildLeaderboardContainer({
        title: meta.title,
        period,
        rows,
        type,
      });

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      console.error(`[ERROR] Leaderboard command error: ${error}`.red);
      await interaction.editReply("❌ 查詢排行榜時發生錯誤");
    }
  },
};

async function fetchLeaderboard(client, interaction, type, period) {
  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  if (type === "messages") {
    const data = await client.messageStatsCollection
      .aggregate([
        { $match: { guildId, ...dateFilter } },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            totalMessages: { $sum: "$messageCount" },
          },
        },
        { $sort: { totalMessages: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    return data.map((u) => ({
      mention: `<@${u._id}>`,
      detail: `**${u.totalMessages}** 則訊息`,
    }));
  }

  if (type === "voice") {
    const data = await client.voiceStatsCollection
      .aggregate([
        { $match: { guildId, ...dateFilter } },
        {
          $group: {
            _id: "$userId",
            username: { $first: "$username" },
            totalMinutes: { $sum: "$durationMinutes" },
          },
        },
        { $sort: { totalMinutes: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    return data.map((u) => {
      const hours = Math.floor(u.totalMinutes / 60);
      const minutes = u.totalMinutes % 60;
      return {
        mention: `<@${u._id}>`,
        detail: `**${hours}** 小時 **${minutes}** 分鐘`,
      };
    });
  }

  if (type === "channels") {
    const data = await client.channelActivityCollection
      .aggregate([
        { $match: { guildId, ...dateFilter } },
        {
          $group: {
            _id: "$channelId",
            channelName: { $first: "$channelName" },
            totalMessages: { $sum: "$messageCount" },
            allActiveUsers: { $push: "$activeUsers" },
          },
        },
        { $sort: { totalMessages: -1 } },
        { $limit: 10 },
      ])
      .toArray();
    return data.map((c) => {
      const uniqueUsers = new Set(c.allActiveUsers.flat()).size;
      return {
        mention: `<#${c._id}>`,
        detail: `**${c.totalMessages}** 則訊息 ・ **${uniqueUsers}** 位活躍用戶`,
      };
    });
  }

  return [];
}

function buildLeaderboardContainer({ title, period, rows }) {
  const medals = ["🥇", "🥈", "🥉"];
  const renderRow = (row, idx) => {
    const medal = medals[idx] || `**${idx + 1}.**`;
    return `${medal} ${row.mention} - ${row.detail}`;
  };

  const top3 = rows.slice(0, 3).map(renderRow).join("\n");
  const rest = rows.slice(3).map(renderRow).join("\n");

  const container = new ContainerBuilder()
    .setAccentColor(0xffd700)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🏆 ${title}`),
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

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 統計期間：${getPeriodText(period)} ・ <t:${Math.floor(Date.now() / 1000)}:R>`,
      ),
    );

  return container;
}

function getDateFilter(period) {
  const now = DateTime.now().setZone("Asia/Taipei");
  switch (period) {
    case "today":
      return { date: now.toISODate() };
    case "week":
      return { date: { $gte: now.startOf("week").toISODate() } };
    case "month":
      return { date: { $gte: now.startOf("month").toISODate() } };
    case "all":
    default:
      return {};
  }
}

function getPeriodText(period) {
  switch (period) {
    case "today":
      return "今天";
    case "week":
      return "本週";
    case "month":
      return "本月";
    case "all":
      return "全部時間";
    default:
      return "今天";
  }
}
