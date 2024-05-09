require("colors");

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;

    const role = interaction.guild.roles.cache.get(interaction.customId);
    if (!role) {
      return interaction.reply({
        content: "無法找到該身份組！",
        ephemeral: true,
      });
    }

    const hasRole = interaction.member.roles.cache.has(role.id);
    if (hasRole) {
      await interaction.member.roles.remove(role);
      return interaction.reply({
        content: `已經移除了身份組：${role.name}`,
        ephemeral: true,
      });
    } else {
      await interaction.member.roles.add(role);
      return interaction.reply({
        content: `已經成功給予身份組：${role.name}`,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.log(`[ERROR] 處理身份組出錯：\n${error}`.red);
  }
};
