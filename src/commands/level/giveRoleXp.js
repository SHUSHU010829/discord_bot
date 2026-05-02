require("colors");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const grantXp = require("../../features/leveling/grantXp");

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName("giverolexp")
    .setDescription("[DEV ONLY] 為某個身分組所有成員統一加 XP")
    .setDMPermission(false)
    .addRoleOption((opt) =>
      opt
        .setName("role")
        .setDescription("要加分的身分組")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("每位成員要加的 XP")
        .setMinValue(1)
        .setMaxValue(1000000)
        .setRequired(true),
    )
    .addBooleanOption((opt) =>
      opt
        .setName("include_bots")
        .setDescription("是否也對機器人加分（預設否）")
        .setRequired(false),
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!client.userLevelsCollection) {
        return interaction.editReply("🔧 等級系統尚未啟動！");
      }

      const role = interaction.options.getRole("role");
      const amount = interaction.options.getInteger("amount");
      const includeBots =
        interaction.options.getBoolean("include_bots") ?? false;

      // 從 Discord 抓最新的全員資料，避免 cache 不全
      await interaction.guild.members.fetch().catch(() => null);

      const members = role.members.filter(
        (m) => includeBots || !m.user.bot,
      );

      if (members.size === 0) {
        return interaction.editReply(
          `身分組 ${role.toString()} 目前沒有可加分的成員`,
        );
      }

      await interaction.editReply(
        `⏳ 開始對身分組 ${role.toString()} 的 **${members.size}** 名成員加 **+${amount} XP**...`,
      );

      let success = 0;
      let failed = 0;
      for (const member of members.values()) {
        try {
          const result = await grantXp(client, {
            userId: member.id,
            guildId: interaction.guildId,
            username: member.user.username,
            avatarHash: member.user.avatar,
            amount,
            source: "admin",
            counterField: "xpFromAdmin",
            member,
            meta: {
              reason: "role-bulk-grant",
              roleId: role.id,
              roleName: role.name,
              operatorId: interaction.user.id,
            },
          });
          if (result) success += 1;
          else failed += 1;
        } catch (err) {
          failed += 1;
          console.log(
            `[ERROR] giveroleXp grant for ${member.id}: ${err}`.red,
          );
        }
      }

      await interaction.editReply(
        `✅ 已對身分組 ${role.toString()} 加分完成\n` +
          `・成員數：**${members.size}**\n` +
          `・每人加 XP：**+${amount}**\n` +
          `・成功：**${success}** ・失敗：**${failed}**`,
      );
    } catch (error) {
      console.log(`[ERROR] /giveroleXp:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 加分失敗，看 console")
        .catch(() => {});
    }
  },
};
