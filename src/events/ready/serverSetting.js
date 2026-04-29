require("colors");

const { ActivityType } = require("discord.js");
const { serverId } = require("../../config");

module.exports = (client) => {
  client.user.setActivity({
    name: "舒舒的台 🍿",
    type: ActivityType.Streaming,
    url: "https://www.twitch.tv/shushu010829",
  });

  console.log(`[INFO] ${client.user.username} is online!`.blue);
};
