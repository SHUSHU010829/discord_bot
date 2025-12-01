require("colors");
const { DateTime } = require("luxon");

module.exports = async (client, message) => {
  // 忽略機器人的訊息
  if (message.author.bot) return;

  // 確保在伺服器中
  if (!message.guild) return;

  try {
    const messageStatsCollection = client.messageStatsCollection;
    const channelActivityCollection = client.channelActivityCollection;

    const today = DateTime.now().setZone("Asia/Taipei").toISODate(); // 格式: 2025-12-01

    // 更新用戶訊息統計
    await messageStatsCollection.updateOne(
      {
        userId: message.author.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        date: today,
      },
      {
        $inc: { messageCount: 1 },
        $set: {
          username: message.author.username,
          channelName: message.channel.name,
          lastMessageAt: new Date(),
        },
      },
      { upsert: true }
    );

    // 更新頻道活躍度統計
    await channelActivityCollection.updateOne(
      {
        channelId: message.channel.id,
        guildId: message.guild.id,
        date: today,
      },
      {
        $inc: { messageCount: 1 },
        $addToSet: { activeUsers: message.author.id },
        $set: {
          channelName: message.channel.name,
          lastActivityAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.log(`[ERROR] Message stats tracking error:\n${error}`.red);
  }
};
