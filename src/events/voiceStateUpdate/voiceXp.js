require("colors");
const { levelSystem } = require("../../config.json");
const voiceSessionStore = require("../../utils/voiceSessionStore");

module.exports = async (client, oldState, newState) => {
  try {
    if (!levelSystem?.enabled) return;
    if (!client.voiceXpSessions) client.voiceXpSessions = new Map();

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guildId = (newState.guild || oldState.guild).id;
    const key = voiceSessionStore.key(member.id, guildId);

    if (newState.channelId) {
      // 已有 in-memory session（切換頻道）就保留 joinedAt，否則記錄當下
      const existing = client.voiceXpSessions.get(key);
      const joinedAt = existing?.joinedAt || Date.now();
      const session = {
        userId: member.id,
        guildId,
        channelId: newState.channelId,
        joinedAt,
        username: member.user.username,
      };
      client.voiceXpSessions.set(key, session);
      voiceSessionStore.upsert(client, session).catch(() => {});
    } else {
      client.voiceXpSessions.delete(key);
      voiceSessionStore.remove(client, member.id, guildId).catch(() => {});
    }
  } catch (error) {
    console.log(`[ERROR] voiceXp state update:\n${error}`.red);
  }
};
