require("colors");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");

const { coinSystem } = require("../../config");
const generateWalletCard = require("../../utils/generateWalletCard");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("錢包")
    .setDescription("查看你的金幣錢包 💰")
    .setDMPermission(false),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!client.userCoinsCollection || !client.coinTransactionsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const userId = interaction.user.id;
      const guildId = interaction.guildId;

      const doc =
        (await client.userCoinsCollection.findOne({ userId, guildId })) || {};

      // 今日已獲得（全來源加總）
      const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
      const today = DateTime.now().setZone(tz).toISODate();
      const todayAgg = await client.coinTransactionsCollection
        .aggregate([
          { $match: { userId, guildId, date: today } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();
      const earnedToday = Math.max(0, todayAgg[0]?.total || 0);

      const lifetime = doc.lifetimeCoins || 0;
      const tier =
        lifetime >= 20000 ? "platinum" : lifetime >= 5000 ? "premium" : "standard";

      const buf = await generateWalletCard({
        userId,
        guildId,
        username:
          interaction.member?.displayName || interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({
          extension: "png",
          size: 256,
        }),
        totalCoins: doc.totalCoins || 0,
        lifetimeCoins: lifetime,
        earnedToday,
        tier,
      });

      const attachment = new AttachmentBuilder(buf, {
        name: `wallet-${userId}.png`,
      });

      await interaction.editReply({
        content: `💰 **目前金幣：${(doc.totalCoins || 0).toLocaleString()}**`,
        files: [attachment],
      });
    } catch (error) {
      console.log(`[ERROR] /錢包:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 錢包讀取失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
