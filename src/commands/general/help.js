const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("逼逼機器人份內工作！")
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.Connect],

  run: async (client, interaction) => {
    const msg = await interaction.reply({
      content: "Pong! 🏓",
      fetchReply: true,
    });
    const ping = msg.createdTimestamp - interaction.createdTimestamp;
    interaction.editReply(
      `Pong! 🏓\n機器人延遲：${ping} ms\n API 延遲：${client.ws.ping} ms`
    );
  },
};
