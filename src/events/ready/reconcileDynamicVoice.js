// 啟動時對齊動態語音頻道：
// 1. 已記錄但 Discord 上不存在的頻道 → 從紀錄中移除
// 2. 已記錄且為空的頻道 → 刪除頻道與紀錄
// 3. 同分類底下存在但未記錄的疑似動態頻道 → adopt 進紀錄（owner 改為 bot 自己，
//    避免冷啟動後孤兒頻道再也無法自動清理）
require("colors");

const { ChannelType } = require("discord.js");
const { createVoiceChannelId, voiceChannel } = require("../../config.json");
const dynamicChannels = require("../../utils/dynamicChannelStore");

module.exports = async (client) => {
  if (!createVoiceChannelId) return;

  let removed = 0;
  let deleted = 0;
  let adopted = 0;

  // Pass 1: 用紀錄對齊 Discord 真實狀態
  const tracked = Array.from(dynamicChannels.entries());
  for (const [channelId, info] of tracked) {
    try {
      const guild = await client.guilds
        .fetch(info.guildId)
        .catch(() => null);
      if (!guild) {
        dynamicChannels.remove(channelId);
        removed++;
        continue;
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        dynamicChannels.remove(channelId);
        removed++;
        continue;
      }

      if (channel.members.size === 0) {
        await channel
          .delete(voiceChannel?.deleteReason || "啟動時清理空動態頻道")
          .catch(() => null);
        dynamicChannels.remove(channelId);
        deleted++;
      }
    } catch (error) {
      console.log(
        `[ERROR] reconcile dynamic voice ${channelId}: ${error}`.red,
      );
    }
  }

  // Pass 2: adopt 同分類下未追蹤、且名稱符合預設的孤兒頻道
  try {
    for (const [, guild] of client.guilds.cache) {
      const createChannel = guild.channels.cache.get(createVoiceChannelId);
      if (!createChannel || !createChannel.parentId) continue;

      const siblings = guild.channels.cache.filter(
        (ch) =>
          ch.id !== createVoiceChannelId &&
          ch.type === ChannelType.GuildVoice &&
          ch.parentId === createChannel.parentId &&
          !dynamicChannels.has(ch.id) &&
          ch.name === voiceChannel?.defaultChannelName,
      );

      for (const [, channel] of siblings) {
        if (channel.members.size === 0) {
          await channel
            .delete(voiceChannel?.deleteReason || "啟動時清理孤兒動態頻道")
            .catch(() => null);
          deleted++;
        } else {
          dynamicChannels.set(channel.id, {
            ownerId: client.user.id,
            guildId: guild.id,
            parentId: channel.parentId,
            createdAt: Date.now(),
            adopted: true,
          });
          adopted++;
        }
      }
    }
  } catch (error) {
    console.log(`[ERROR] adopt orphan voice channels: ${error}`.red);
  }

  if (removed || deleted || adopted) {
    console.log(
      `[VOICE] reconcile：刪除 ${deleted} / 清紀錄 ${removed} / adopt ${adopted}`
        .cyan,
    );
  }

  console.log(`[SYSTEM] 動態語音頻道對齊完成！`.green);
};
