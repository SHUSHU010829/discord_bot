// 處理樂透訂閱取消按鈕。

const logger = require("../../utils/logger");
const { trackError, trackSuccess } = require("../../utils/errorTracker");
const { MessageFlags } = require("discord.js");

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (!interaction.customId?.startsWith("lotterysub_cancel_")) return;
    if (!client.lotterySubscriptionsCollection) return;

    const subscriptionId = interaction.customId.slice("lotterysub_cancel_".length);
    const sub = await client.lotterySubscriptionsCollection.findOne({ subscriptionId });

    if (!sub) {
      return interaction.reply({
        content: "找不到這筆訂閱(可能已取消)。",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub.userId !== interaction.user.id) {
      return interaction.reply({
        content: "🚫 這不是你的訂閱。",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub.status !== "active" && sub.status !== "insufficient") {
      return interaction.reply({
        content: "這筆訂閱已不在進行中。",
        flags: MessageFlags.Ephemeral,
      });
    }

    await client.lotterySubscriptionsCollection.updateOne(
      { subscriptionId },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      }
    );

    await interaction.reply({
      content: `✅ 已取消訂閱(剩餘 ${sub.drawsRemaining} 期未扣款)。`,
      flags: MessageFlags.Ephemeral,
    });
    trackSuccess("lottery-cancel-sub");
  } catch (err) {
    logger.error(
      { source: "lottery-cancel-sub", userId: interaction.user?.id, err: err.message, stack: err.stack },
      "處理樂透訂閱取消失敗"
    );
    trackError("lottery-cancel-sub", err, { userId: interaction.user?.id });
  }
};
