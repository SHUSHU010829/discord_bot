require("colors");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const grantCoins = require("../../features/economy/grantCoins");

module.exports = {
  devOnly: true,

  data: new SlashCommandBuilder()
    .setName("給金幣")
    .setDescription("[DEV ONLY] 給某位成員金幣（可填負數扣款）")
    .setDMPermission(false)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("收金幣的成員")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("要給的金幣數（可為負數扣款）")
        .setMinValue(-1000000)
        .setMaxValue(1000000)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("原因（會記錄在交易紀錄）")
        .setRequired(false),
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!client.userCoinsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }

      const targetUser = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      const reason = interaction.options.getString("reason") || null;

      if (amount === 0) {
        return interaction.editReply("金額不能為 0");
      }

      const member = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      const result = await grantCoins(client, {
        userId: targetUser.id,
        guildId: interaction.guildId,
        username: targetUser.username,
        avatarHash: targetUser.avatar,
        amount,
        source: "admin",
        member,
        meta: {
          reason,
          operatorId: interaction.user.id,
        },
      });

      if (!result) {
        return interaction.editReply("🔧 給金幣失敗（可能 grantCoins 回傳 null）");
      }

      const after = result.doc?.totalCoins ?? "?";
      const verb = amount >= 0 ? "+" : "";
      await interaction.editReply(
        `✅ 已給 ${targetUser} **${verb}${amount}** 金幣\n・目前餘額：**${after.toLocaleString?.() ?? after}**${
          reason ? `\n・原因：${reason}` : ""
        }`,
      );
    } catch (error) {
      console.log(`[ERROR] /給金幣:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 給金幣失敗，看 console")
        .catch(() => {});
    }
  },
};
