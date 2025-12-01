require("colors");
const { DateTime } = require("luxon");

// 儲存用戶進入語音頻道的時間
const voiceJoinTimes = new Map();

module.exports = async (client, oldState, newState) => {
  try {
    const voiceStatsCollection = client.voiceStatsCollection;
    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;

    // 忽略機器人
    if (member.user.bot) return;

    const userId = member.id;
    const guildId = guild.id;
    const today = DateTime.now().setZone("Asia/Taipei").toISODate();

    // 用戶加入語音頻道
    if (!oldState.channelId && newState.channelId) {
      voiceJoinTimes.set(`${userId}-${guildId}`, {
        channelId: newState.channelId,
        channelName: newState.channel.name,
        joinedAt: new Date(),
      });

      console.log(
        `[VOICE STATS] ${member.user.tag} joined ${newState.channel.name}`.cyan
      );
    }

    // 用戶離開語音頻道或切換頻道
    if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
      const joinData = voiceJoinTimes.get(`${userId}-${guildId}`);

      if (joinData && joinData.channelId === oldState.channelId) {
        const leftAt = new Date();
        const joinedAt = joinData.joinedAt;
        const durationMs = leftAt - joinedAt;
        const durationMinutes = Math.floor(durationMs / 1000 / 60);

        // 只記錄超過 1 分鐘的語音時長
        if (durationMinutes >= 1) {
          await voiceStatsCollection.insertOne({
            userId: userId,
            username: member.user.username,
            guildId: guildId,
            channelId: oldState.channelId,
            channelName: joinData.channelName,
            joinedAt: joinedAt,
            leftAt: leftAt,
            durationMinutes: durationMinutes,
            date: today,
          });

          console.log(
            `[VOICE STATS] ${member.user.tag} stayed in ${joinData.channelName} for ${durationMinutes} minutes`
              .green
          );
        }

        voiceJoinTimes.delete(`${userId}-${guildId}`);
      }
    }

    // 用戶切換到新頻道時更新加入時間
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      voiceJoinTimes.set(`${userId}-${guildId}`, {
        channelId: newState.channelId,
        channelName: newState.channel.name,
        joinedAt: new Date(),
      });

      console.log(
        `[VOICE STATS] ${member.user.tag} switched to ${newState.channel.name}`.cyan
      );
    }
  } catch (error) {
    console.log(`[ERROR] Voice stats tracking error:\n${error}`.red);
  }
};
