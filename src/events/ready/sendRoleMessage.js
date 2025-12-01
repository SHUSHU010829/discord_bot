require("colors");

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { roleMessageChannelId, roles, roleMessageContent } = require("../../config.json");

module.exports = async (client) => {
  try {
    const channel = client.channels.cache.get(roleMessageChannelId);
    if (!channel) return;

    const row = new ActionRowBuilder();

    roles.forEach((role) => {
      row.components.push(
        new ButtonBuilder()
          .setCustomId(role.id)
          .setLabel(role.label)
          .setStyle(ButtonStyle.Primary)
      );
    });

    // await channel.send({
    //   content: roleMessageContent,
    //   components: [row],
    // });
  } catch (error) {
    console.log(`[ERROR] 身份訊息無法找到該頻道：\n${error}`.red);
  }
};
