require("colors");

const { ActivityType } = require("discord.js");
const { serverId, memberCountChannelId, memberCountFormat } = require("../../config.json");

module.exports = (client) => {
  let guild = client.guilds.cache.get(serverId);
  let memberCount = guild.memberCount;
  let memberCountChannel = guild.channels.cache.get(memberCountChannelId);

  const channelName = memberCountFormat.replace("{count}", memberCount);

  memberCountChannel
    .setName(channelName)
    .then((result) =>
      console.log(`[SETTING] server user count set successfully!`.green)
    )
    .catch((error) =>
      console.log(`[ERROR] user number count cannot set: ${error}`.red)
    );
};
