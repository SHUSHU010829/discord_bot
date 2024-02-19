require("colors");

const { ActivityType } = require("discord.js");

module.exports = (client) => {
  client.user.setActivity({
    name: "直播 🍿",
    type: ActivityType.Streaming,
    url: "https://www.twitch.tv/shushu010829",
  });
  console.log(`[INFO] ${client.user.username} is online!`.blue);
};
