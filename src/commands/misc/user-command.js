const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("user")
    .setDescription("?")
    .setDMPermission(false)
    .toJSON(),

    userPermissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [PermissionFlagsBits.Connect],

    run: (client, interaction) => {
        return interaction.reply("This is a command!");
    }
};