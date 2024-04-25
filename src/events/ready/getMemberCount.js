require("colors");

const { ActivityType } = require("discord.js");
const { serverId } = require("../../config.json");

module.exports = (client) => {
  let guild = client.guilds.cache.get(serverId);
  let memberCount = guild.memberCount;
  let memberCountChannel = guild.channels.cache.get("1232546673448849500");
  memberCountChannel
    .setName(`😧｜舒禮人數：${memberCount}`)
    .then((result) =>
      console.log(`[SETTING] server user count set successfully!`.green)
    )
    .catch((error) =>
      console.log(`[ERROR] user number count cannot set: ${error}`.red)
    );
};
