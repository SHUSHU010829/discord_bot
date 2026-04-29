require("colors");
const { levelSystem } = require("../../config.json");

module.exports = async (client, oldState, newState) => {
  try {
    if (!levelSystem?.enabled) return;
    if (!client.voiceXpSessions) client.voiceXpSessions = new Map();

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guildId = (newState.guild || oldState.guild).id;
    const key = `${member.id}-${guildId}`;

    if (newState.channelId) {
      client.voiceXpSessions.set(key, {
        userId: member.id,
        guildId,
        channelId: newState.channelId,
        joinedAt: Date.now(),
        username: member.user.username,
      });
    } else {
      client.voiceXpSessions.delete(key);
    }
  } catch (error) {
    console.log(`[ERROR] voiceXp state update:\n${error}`.red);
  }
};
