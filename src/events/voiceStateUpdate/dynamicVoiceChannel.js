require("colors");

const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { createVoiceChannelId } = require("../../config.json");

// 存儲動態創建的頻道 ID 和創建者 ID
const dynamicChannels = new Map();

module.exports = async (client, oldState, newState) => {
  try {
    // 從 config.json 讀取"點選新增頻道"的 ID
    const CREATE_CHANNEL_ID = createVoiceChannelId;

    if (!CREATE_CHANNEL_ID) {
      console.log(
        "[WARNING] createVoiceChannelId not set in config.json"
          .yellow
      );
      return;
    }

    const member = newState.member || oldState.member;
    const guild = newState.guild || oldState.guild;

    // 當用戶加入"點選新增頻道"時
    if (newState.channelId === CREATE_CHANNEL_ID && !oldState.channelId) {
      console.log(
        `[VOICE] ${member.user.tag} joined the create channel, creating new voice channel...`
          .cyan
      );

      // 獲取創建頻道所在的分類
      const createChannel = guild.channels.cache.get(CREATE_CHANNEL_ID);
      const parentId = createChannel?.parentId;

      // 創建新的語音頻道
      const newChannel = await guild.channels.create({
        name: "記得改名喔！",
        type: ChannelType.GuildVoice,
        parent: parentId,
        permissionOverwrites: [
          // 基礎權限：所有人都可以查看和連接
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          // 創建者權限：可以管理頻道（編輯名稱、調整人數上限）
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
            ],
          },
        ],
      });

      // 記錄創建者
      dynamicChannels.set(newChannel.id, {
        ownerId: member.id,
        createdAt: Date.now(),
      });

      // 將用戶移動到新頻道
      await member.voice.setChannel(newChannel);

      console.log(
        `[VOICE] Created new voice channel: ${newChannel.name} (${newChannel.id}) for ${member.user.tag}`
          .green
      );
    }

    // 當用戶加入動態頻道時，給予編輯狀態的權限
    if (
      newState.channelId &&
      dynamicChannels.has(newState.channelId) &&
      newState.channelId !== oldState.channelId
    ) {
      const channel = guild.channels.cache.get(newState.channelId);
      if (channel) {
        // 給予加入者設置狀態的權限
        await channel.permissionOverwrites.edit(member.id, {
          SetVoiceChannelStatus: true,
        });

        console.log(
          `[VOICE] Granted status edit permission to ${member.user.tag} in ${channel.name}`
            .cyan
        );
      }
    }

    // 當動態頻道為空時刪除
    if (
      oldState.channelId &&
      dynamicChannels.has(oldState.channelId) &&
      oldState.channelId !== newState.channelId
    ) {
      const oldChannel = guild.channels.cache.get(oldState.channelId);
      if (oldChannel && oldChannel.members.size === 0) {
        const channelName = oldChannel.name;
        await oldChannel.delete("動態語音頻道已空，自動刪除");
        dynamicChannels.delete(oldState.channelId);

        console.log(
          `[VOICE] Deleted empty dynamic voice channel: ${channelName}`.yellow
        );
      }
    }
  } catch (error) {
    console.error(
      `[ERROR] Error in dynamic voice channel handler: ${error}`.red
    );
  }
};
