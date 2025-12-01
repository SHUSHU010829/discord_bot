const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-ticket")
    .setDescription("🎫 設置票務系統面板")
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(config.ticket.panelTitle)
        .setDescription(config.ticket.panelDescription)
        .setTimestamp()
        .setFooter({ text: interaction.guild.name });

      const button = new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel(config.ticket.buttonLabel)
        .setEmoji(config.ticket.buttonEmoji)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.reply({
        content: "✅ 票務面板已設置！",
        ephemeral: true,
      });

      await interaction.channel.send({
        embeds: [embed],
        components: [row],
      });
    } catch (error) {
      console.log(`[ERROR] 設置票務面板時出錯：\n${error}`.red);
      await interaction.reply({
        content: "❌ 設置票務面板時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};
