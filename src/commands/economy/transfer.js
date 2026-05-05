require("colors");
const {
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const { DateTime } = require("luxon");

const { coinSystem } = require("../../config");
const grantCoins = require("../../features/economy/grantCoins");

async function getTodayTransferOut(client, userId, guildId) {
  if (!client.coinTransactionsCollection) return 0;
  const tz = coinSystem?.daily?.resetTimezone || "Asia/Taipei";
  const today = DateTime.now().setZone(tz).toISODate();
  const agg = await client.coinTransactionsCollection
    .aggregate([
      {
        $match: {
          userId,
          guildId,
          source: "transfer_out",
          date: today,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])
    .toArray();
  return Math.abs(agg[0]?.total || 0);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("轉帳")
    .setDescription("把金幣轉給其他玩家 💸")
    .setDMPermission(false)
    .addUserOption((opt) =>
      opt
        .setName("對象")
        .setDescription("收款人")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("金額")
        .setDescription("轉帳金額（會收手續費）")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName("備註")
        .setDescription("給對方的備註（選填）")
        .setRequired(false)
        .setMaxLength(80)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply();

    try {
      const cfg = coinSystem?.transfer;
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!cfg?.enabled) {
        return interaction.editReply("🔧 玩家轉帳功能尚未開放。");
      }
      if (!client.userCoinsCollection || !client.coinTransactionsCollection) {
        return interaction.editReply("🔧 金幣系統尚未啟動，請聯絡舒舒！");
      }

      const target = interaction.options.getUser("對象");
      const amount = interaction.options.getInteger("金額");
      const note = (interaction.options.getString("備註") || "").trim();

      if (target.bot) {
        return interaction.editReply("❌ 不能轉給 bot 啦。");
      }
      if (target.id === interaction.user.id) {
        return interaction.editReply("❌ 不能轉給自己。");
      }

      const minAmount = cfg.minAmount ?? 10;
      const maxAmount = cfg.maxAmount ?? 50000;
      if (amount < minAmount || amount > maxAmount) {
        return interaction.editReply(
          `❌ 單筆金額需在 **${minAmount.toLocaleString()}** ~ **${maxAmount.toLocaleString()}** 之間。`
        );
      }

      const senderId = interaction.user.id;
      const guildId = interaction.guildId;
      const senderName = interaction.member?.displayName || interaction.user.username;

      const before = await client.userCoinsCollection.findOne({
        userId: senderId,
        guildId,
      });
      const balance = before?.totalCoins || 0;
      const feeRate = cfg.feeRate ?? 0.02;
      const fee = Math.floor(amount * feeRate);
      const totalDeduct = amount + fee;

      if (balance < totalDeduct) {
        return interaction.editReply(
          `💰 餘額不足！本次需要 **${totalDeduct.toLocaleString()}**（金額 ${amount.toLocaleString()} + 手續費 ${fee.toLocaleString()}），目前 ${balance.toLocaleString()}。`
        );
      }

      const dailyCap = cfg.dailyCapPerSender ?? 20000;
      const usedToday = await getTodayTransferOut(client, senderId, guildId);
      if (usedToday + amount > dailyCap) {
        const remain = Math.max(0, dailyCap - usedToday);
        return interaction.editReply(
          `📈 今日轉帳額度已達上限（防洗幣）。今日已轉 **${usedToday.toLocaleString()}** / ${dailyCap.toLocaleString()}，剩 **${remain.toLocaleString()}**。`
        );
      }

      const targetMember = await interaction.guild.members
        .fetch(target.id)
        .catch(() => null);
      if (!targetMember) {
        return interaction.editReply("❌ 找不到該成員，可能已退出伺服器。");
      }

      const transferId = `xfer-${Date.now()}-${senderId}-${target.id}`;

      // 扣款（含手續費）
      const debit = await grantCoins(client, {
        userId: senderId,
        guildId,
        username: senderName,
        avatarHash: interaction.user.avatar,
        amount: -totalDeduct,
        source: "transfer_out",
        member: interaction.member,
        meta: {
          transferId,
          counterparty: target.id,
          amount,
          fee,
          note: note || null,
        },
      });
      if (!debit) {
        return interaction.editReply("🔧 轉帳扣款失敗，請稍後再試。");
      }

      // 入款
      const credit = await grantCoins(client, {
        userId: target.id,
        guildId,
        username: target.username,
        avatarHash: target.avatar,
        amount,
        source: "transfer_in",
        member: targetMember,
        meta: {
          transferId,
          counterparty: senderId,
          amount,
          note: note || null,
        },
      });
      if (!credit) {
        // 回滾
        await grantCoins(client, {
          userId: senderId,
          guildId,
          username: senderName,
          amount: totalDeduct,
          source: "admin",
          meta: {
            reason: `transfer rollback: ${transferId}`,
            operatorId: "system",
          },
        }).catch(() => {});
        return interaction.editReply("🔧 對方入帳失敗，已退款。請稍後再試。");
      }

      const senderAfter = debit.doc?.totalCoins ?? balance - totalDeduct;
      const noteLine = note ? `\n📝 備註：${note}` : "";

      await interaction.editReply(
        `✅ 已轉帳 <@${target.id}> **${amount.toLocaleString()}** credits（手續費 ${fee.toLocaleString()}）\n` +
          `・你的餘額：**${senderAfter.toLocaleString()}**\n` +
          `・今日累計轉出：${(usedToday + amount).toLocaleString()} / ${dailyCap.toLocaleString()}` +
          noteLine
      );
    } catch (error) {
      console.log(`[ERROR] /轉帳:\n${error}\n${error.stack}`.red);
      await interaction
        .editReply("🔧 轉帳失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
