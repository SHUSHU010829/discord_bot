// 處理樂透訂閱取消按鈕。

require("colors");

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
        ephemeral: true,
      });
    }
    if (sub.userId !== interaction.user.id) {
      return interaction.reply({
        content: "🚫 這不是你的訂閱。",
        ephemeral: true,
      });
    }
    if (sub.status !== "active" && sub.status !== "insufficient") {
      return interaction.reply({
        content: "這筆訂閱已不在進行中。",
        ephemeral: true,
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
      ephemeral: true,
    });
  } catch (err) {
    console.log(`[ERROR] handleLotteryCancelSubscription:\n${err}\n${err.stack}`.red);
  }
};
