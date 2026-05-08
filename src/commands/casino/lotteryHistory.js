// /樂透歷史 — 查看自己最近的樂透票券與開獎結果。

require("colors");
const {
  SlashCommandBuilder,
  MessageFlags,
  InteractionContextType,
} = require("discord.js");

const { getLotteryConfig } = require("../../features/casino/lottery/numbers");

const PRIZE_LABEL = {
  jackpot: "🎉 頭獎",
  second: "💎 二獎",
  third: "🥉 三獎",
  fourth: "🎯 四獎",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("樂透歷史")
    .setDescription("查看自己最近的樂透紀錄 📚")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o
        .setName("筆數")
        .setDescription("最多筆數(預設 15)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!client.lotteryTicketsCollection) {
        return interaction.editReply("🔧 樂透系統尚未啟動。");
      }
      const limit = interaction.options.getInteger("筆數") || 15;

      const tickets = await client.lotteryTicketsCollection
        .find({
          userId: interaction.user.id,
          guildId: interaction.guildId,
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      if (tickets.length === 0) {
        return interaction.editReply("你還沒買過任何樂透票!");
      }

      // 拉相關 draws 的資訊
      const drawIds = [...new Set(tickets.map((t) => t.drawId))];
      const draws = await client.lotteryDrawsCollection
        .find({ drawId: { $in: drawIds } })
        .toArray();
      const drawById = new Map(draws.map((d) => [d.drawId, d]));

      let totalSpent = 0;
      let totalWon = 0;

      const lines = tickets.map((t) => {
        totalSpent += t.pricePaid || 0;
        totalWon += t.payoutAmount || 0;
        const cfg = getLotteryConfig(t.lotteryType);
        const draw = drawById.get(t.drawId);
        const numStr = t.numbers.join(" ・ ");
        const status = draw?.status === "settled"
          ? t.prize
            ? `${PRIZE_LABEL[t.prize] || t.prize} +${(t.payoutAmount || 0).toLocaleString()}`
            : `沒中(中 ${t.matched || 0})`
          : "等開獎";
        const sourceTag = {
          manual: "手買",
          subscription: "訂閱",
          wheeling: "包牌",
          auto: "自動",
        }[t.source] || t.source;
        return `\`${draw?.drawNumber ?? "?"}\` ${cfg?.emoji || "🎟"} ${numStr} ・ ${sourceTag} ・ ${status}`;
      });

      await interaction.editReply(
        `📚 **最近 ${tickets.length} 筆**\n\n${lines.join("\n")}\n\n` +
          `總花費:${totalSpent.toLocaleString()} ・ 總獎金:${totalWon.toLocaleString()} ・ 淨值:${(totalWon - totalSpent).toLocaleString()}`
      );
    } catch (err) {
      console.log(`[ERROR] /樂透歷史:\n${err}\n${err.stack}`.red);
      await interaction.editReply("🔧 查詢失敗。").catch(() => {});
    }
  },
};
