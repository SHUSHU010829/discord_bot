const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("📊 查看統計資料")
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("查看用戶統計")
        .addUserOption((option) =>
          option
            .setName("target")
            .setDescription("要查詢的用戶（不填則查詢自己）")
            .setRequired(false)
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("查看頻道統計")
        .addChannelOption((option) =>
          option
            .setName("target")
            .setDescription("要查詢的頻道（不填則查詢目前頻道）")
            .setRequired(false)
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
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    const period = interaction.options.getString("period") || "today";

    try {
      if (subcommand === "user") {
        const targetUser =
          interaction.options.getUser("target") || interaction.user;
        await showUserStats(client, interaction, targetUser, period);
      } else if (subcommand === "channel") {
        const targetChannel =
          interaction.options.getChannel("target") || interaction.channel;
        await showChannelStats(client, interaction, targetChannel, period);
      }
    } catch (error) {
      console.error(`[ERROR] Stats command error: ${error}`.red);
      await interaction.editReply({
        content: "❌ 查詢統計資料時發生錯誤",
        ephemeral: true,
      });
    }
  },
};

async function showUserStats(client, interaction, user, period) {
  const messageStatsCollection = client.messageStatsCollection;
  const voiceStatsCollection = client.voiceStatsCollection;

  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  // 查詢訊息統計
  const messageStats = await messageStatsCollection
    .aggregate([
      {
        $match: {
          userId: user.id,
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: "$messageCount" },
          channelCount: { $addToSet: "$channelId" },
        },
      },
    ])
    .toArray();

  // 查詢語音統計
  const voiceStats = await voiceStatsCollection
    .aggregate([
      {
        $match: {
          userId: user.id,
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalMinutes: { $sum: "$durationMinutes" },
          channelCount: { $addToSet: "$channelId" },
        },
      },
    ])
    .toArray();

  const totalMessages = messageStats[0]?.totalMessages || 0;
  const messageChannelCount = messageStats[0]?.channelCount?.length || 0;
  const totalMinutes = voiceStats[0]?.totalMinutes || 0;
  const voiceChannelCount = voiceStats[0]?.channelCount?.length || 0;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${user.username} 的統計資料`)
    .setThumbnail(user.displayAvatarURL())
    .setColor(0x5865f2)
    .addFields(
      {
        name: "💬 訊息統計",
        value: `總訊息數：**${totalMessages}** 則\n活躍頻道：**${messageChannelCount}** 個`,
        inline: true,
      },
      {
        name: "🎤 語音統計",
        value: `總時長：**${hours}** 小時 **${minutes}** 分鐘\n語音頻道：**${voiceChannelCount}** 個`,
        inline: true,
      }
    )
    .setFooter({ text: `統計期間：${getPeriodText(period)}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function showChannelStats(client, interaction, channel, period) {
  const channelActivityCollection = client.channelActivityCollection;

  const dateFilter = getDateFilter(period);
  const guildId = interaction.guild.id;

  // 查詢頻道統計
  const channelStats = await channelActivityCollection
    .aggregate([
      {
        $match: {
          channelId: channel.id,
          guildId: guildId,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: "$messageCount" },
          allActiveUsers: { $push: "$activeUsers" },
        },
      },
    ])
    .toArray();

  const totalMessages = channelStats[0]?.totalMessages || 0;
  const allUsers = channelStats[0]?.allActiveUsers || [];
  const uniqueUsers = new Set(allUsers.flat()).size;

  const embed = new EmbedBuilder()
    .setTitle(`📊 #${channel.name} 的統計資料`)
    .setColor(0x5865f2)
    .addFields(
      {
        name: "💬 訊息統計",
        value: `總訊息數：**${totalMessages}** 則`,
        inline: true,
      },
      {
        name: "👥 活躍用戶",
        value: `活躍用戶數：**${uniqueUsers}** 人`,
        inline: true,
      }
    )
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
