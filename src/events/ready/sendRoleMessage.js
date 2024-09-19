require("colors");

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = async (client) => {
  try {
    const channelId = "1286145970693869568";
    const roles = [
      {
        id: "1286170878463447133",
        label: "🎮 LEAGUE OF LEGENDS",
      },
    ];
    const channel = client.channels.cache.get(channelId);
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
    //   content: "想要收到舒舒的開台通知！領取身份組吧！",
    //   components: [row],
    // });
  } catch (error) {
    console.log(`[ERROR] 身份訊息無法找到該頻道：\n${error}`.red);
  }
};
