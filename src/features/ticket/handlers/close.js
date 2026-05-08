require("colors");
const { PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("../../../config");

async function run(client, interaction) {
  try {
    if (!interaction.channel.name.startsWith("ticket-")) {
      return interaction.reply({
        content: "❌ 此指令只能在票務頻道中使用！",
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelPermissions = interaction.channel.permissionsFor(
      interaction.user
    );
    const hasPermission =
      channelPermissions.has(PermissionFlagsBits.Administrator) ||
      interaction.channel.topic?.includes(interaction.user.id);

    if (!hasPermission) {
      return interaction.reply({
        content: "❌ 只有票務創建者或管理員可以關閉此票務！",
        flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { run };
