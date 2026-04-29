const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close-ticket")
    .setDescription("🔒 關閉當前票務")
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      // 檢查是否在票務頻道中
      if (!interaction.channel.name.startsWith("ticket-")) {
        return interaction.reply({
          content: "❌ 此指令只能在票務頻道中使用！",
          ephemeral: true,
        });
      }

      // 檢查權限：頻道創建者或管理員
      const channelPermissions = interaction.channel.permissionsFor(
        interaction.user
      );
      const hasPermission =
        channelPermissions.has(PermissionFlagsBits.Administrator) ||
        interaction.channel.topic?.includes(interaction.user.id);

      if (!hasPermission) {
        return interaction.reply({
          content: "❌ 只有票務創建者或管理員可以關閉此票務！",
          ephemeral: true,
        });
      }

      const closeEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle(config.ticket.closeMessage)
        .setDescription(
          config.ticket.closeDescription.replace(
            "{user}",
            interaction.user.toString()
          )
        )
        .setTimestamp();

      await interaction.reply({ embeds: [closeEmbed] });

      // 5 秒後刪除頻道
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (error) {
          console.log(`[ERROR] 刪除票務頻道時出錯：\n${error}`.red);
        }
      }, 5000);
    } catch (error) {
      console.log(`[ERROR] 關閉票務時出錯：\n${error}`.red);
      await interaction.reply({
        content: "❌ 關閉票務時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};
