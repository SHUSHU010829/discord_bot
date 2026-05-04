require("colors");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const grantCoins = require("../../features/economy/grantCoins");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("give-coins")
    .setDescription("[ADMIN] Grant coins to a member (use a negative amount to deduct)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("Member receiving the coins")
        .setRequired(true),
    )
    .addIntegerOption((opt) =>
      opt
        .setName("amount")
        .setDescription("Amount of coins to grant (negative to deduct)")
        .setMinValue(-1000000)
        .setMaxValue(1000000)
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason (logged in the transaction history)")
        .setRequired(false),
    )
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],

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
      console.log(`[ERROR] /give-coins:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 給金幣失敗，看 console")
        .catch(() => {});
    }
  },
};
