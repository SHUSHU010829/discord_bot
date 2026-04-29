require("colors");
const {
  serverId,
  memberCountChannelId,
  memberCountFormat,
} = require("../config");

module.exports = (client) => {
  const guild = client.guilds.cache.get(serverId);
  if (!guild) return;
  const memberCountChannel = guild.channels.cache.get(memberCountChannelId);
  if (!memberCountChannel) return;

  const channelName = memberCountFormat.replace("{count}", guild.memberCount);

  memberCountChannel
    .setName(channelName)
    .then(() =>
      console.log(`[SETTING] server user count set successfully!`.green),
    )
    .catch((error) =>
      console.log(`[ERROR] user number count cannot set: ${error}`.red),
    );
};
