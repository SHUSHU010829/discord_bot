const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

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
      switch (type) {
        case "messages":
          await showMessageLeaderboard(client, interaction, period);
          break;
        case "voice":
          await showVoiceLeaderboard(client, interaction, period);
          break;
        case "channels":
          await showChannelLeaderboard(client, interaction, period);
          break;
      }
    } catch (error) {
      console.error(`[ERROR] Leaderboard command error: ${error}`.red);
      await interaction.editReply({
        content: "❌ 查詢排行榜時發生錯誤",
        ephemeral: true,
      });
    }
  },
};

async function showMessageLeaderboard(client, interaction, period) {
  const messageStatsCollection = client.messageStatsCollection;
  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  const leaderboard = await messageStatsCollection
    .aggregate([
      {
        $match: {
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$userId",
          username: { $first: "$username" },
          totalMessages: { $sum: "$messageCount" },
        },
      },
      {
        $sort: { totalMessages: -1 },
      },
      {
        $limit: 10,
      },
    ])
    .toArray();

  if (leaderboard.length === 0) {
    await interaction.editReply({
      content: "📊 目前還沒有統計資料",
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const description = leaderboard
    .map((user, index) => {
      const medal = medals[index] || `**${index + 1}.**`;
      return `${medal} <@${user._id}> - **${user.totalMessages}** 則訊息`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏆 訊息排行榜")
    .setDescription(description)
    .setColor(0xffd700)
    .setFooter({ text: `統計期間：${getPeriodText(period)}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function showVoiceLeaderboard(client, interaction, period) {
  const voiceStatsCollection = client.voiceStatsCollection;
  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  const leaderboard = await voiceStatsCollection
    .aggregate([
      {
        $match: {
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$userId",
          username: { $first: "$username" },
          totalMinutes: { $sum: "$durationMinutes" },
        },
      },
      {
        $sort: { totalMinutes: -1 },
      },
      {
        $limit: 10,
      },
    ])
    .toArray();

  if (leaderboard.length === 0) {
    await interaction.editReply({
      content: "📊 目前還沒有語音統計資料",
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const description = leaderboard
    .map((user, index) => {
      const medal = medals[index] || `**${index + 1}.**`;
      const hours = Math.floor(user.totalMinutes / 60);
      const minutes = user.totalMinutes % 60;
      return `${medal} <@${user._id}> - **${hours}** 小時 **${minutes}** 分鐘`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏆 語音時長排行榜")
    .setDescription(description)
    .setColor(0xffd700)
    .setFooter({ text: `統計期間：${getPeriodText(period)}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function showChannelLeaderboard(client, interaction, period) {
  const channelActivityCollection = client.channelActivityCollection;
  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  const leaderboard = await channelActivityCollection
    .aggregate([
      {
        $match: {
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: "$channelId",
          channelName: { $first: "$channelName" },
          totalMessages: { $sum: "$messageCount" },
          allActiveUsers: { $push: "$activeUsers" },
        },
      },
      {
        $sort: { totalMessages: -1 },
      },
      {
        $limit: 10,
      },
    ])
    .toArray();

  if (leaderboard.length === 0) {
    await interaction.editReply({
      content: "📊 目前還沒有頻道統計資料",
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const description = leaderboard
    .map((channel, index) => {
      const medal = medals[index] || `**${index + 1}.**`;
      const uniqueUsers = new Set(channel.allActiveUsers.flat()).size;
      return `${medal} <#${channel._id}> - **${channel.totalMessages}** 則訊息 | **${uniqueUsers}** 位活躍用戶`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("🏆 頻道活躍度排行榜")
    .setDescription(description)
    .setColor(0xffd700)
    .setFooter({ text: `統計期間：${getPeriodText(period)}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function getDateFilter(period) {
  const now = DateTime.now().setZone("Asia/Taipei");

  switch (period) {
    case "today":
      return { date: now.toISODate() };
    case "week":
      const weekStart = now.startOf("week").toISODate();
      return { date: { $gte: weekStart } };
    case "month":
      const monthStart = now.startOf("month").toISODate();
      return { date: { $gte: monthStart } };
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
