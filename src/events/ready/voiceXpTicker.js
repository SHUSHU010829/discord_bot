require("colors");
const cron = require("node-cron");
const { levelSystem } = require("../../config.json");
const { isVoiceXpEligible } = require("../../utils/xpGuards");
const grantXp = require("../../features/leveling/grantXp");

module.exports = (client) => {
  if (!levelSystem?.enabled) return;
  if (!client.voiceXpSessions) client.voiceXpSessions = new Map();

  const cfg = levelSystem.voice;

  // 啟動時把目前已經在語音中的人補上 session（重啟後不會誤跳但 session 一開始是空的）
  try {
    for (const [, guild] of client.guilds.cache) {
      for (const [, channel] of guild.channels.cache) {
        if (!channel.isVoiceBased?.()) continue;
        for (const [, member] of channel.members) {
          if (member.user.bot) continue;
          const key = `${member.id}-${guild.id}`;
          if (!client.voiceXpSessions.has(key)) {
            client.voiceXpSessions.set(key, {
              userId: member.id,
              guildId: guild.id,
              channelId: channel.id,
              joinedAt: Date.now(),
              username: member.user.username,
            });
          }
        }
      }
    }
  } catch (e) {
    console.log(`[WARNING] voiceXpTicker initial sweep: ${e}`.yellow);
  }

  cron.schedule(
    "* * * * *",
    async () => {
      if (!client.userLevelsCollection) return;
      if (client.voiceXpSessions.size === 0) return;

      for (const [key, session] of client.voiceXpSessions) {
        try {
          const guild = client.guilds.cache.get(session.guildId);
          if (!guild) continue;
          const member =
            guild.members.cache.get(session.userId) ||
            (await guild.members.fetch(session.userId).catch(() => null));
          if (!member) continue;

          // 用最新狀態的頻道而不是 session 紀錄的（萬一切換頻道 voiceXp.js 已經更新）
          const currentChannelId =
            member.voice.channelId || session.channelId;
          const channel = guild.channels.cache.get(currentChannelId);
          if (!channel) continue;

          if (!isVoiceXpEligible(member, channel, cfg)) continue;

          await grantXp(client, {
            userId: session.userId,
            guildId: session.guildId,
            username: member.user.username || session.username,
            avatarHash: member.user.avatar,
            amount: cfg.xpPerMinute,
            source: "voice",
            counterField: "xpFromVoice",
            incrementVoiceMinutes: 1,
            meta: { channelId: currentChannelId },
            channel: null,
            member,
          });
        } catch (error) {
          console.log(`[ERROR] voiceXp tick (${key}):\n${error}`.red);
        }
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Taipei",
    }
  );

  console.log(`[SYSTEM] 語音 XP ticker 啟動`.green);
};
