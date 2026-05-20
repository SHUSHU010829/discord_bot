require("colors");
const {
  SlashCommandBuilder,
  MessageFlags,
  InteractionContextType,
} = require("discord.js");

const { coinSystem } = require("../../config");
const {
  createQuiz,
  KIND_PREDICTION,
  MIN_MINUTES,
  MAX_MINUTES,
  MAX_QUESTION_LEN,
  MAX_OPTION_LEN,
} = require("../../features/quiz/quizGame");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("預測")
    .setDescription("發布一題有獎預測，作答結束後再由主辦人公布正確答案 🔮")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("題目")
        .setDescription("預測問題內容")
        .setRequired(true)
        .setMaxLength(MAX_QUESTION_LEN)
    )
    .addIntegerOption((o) =>
      o
        .setName("獎金")
        .setDescription("獎金池總額（會立即從你的錢包扣除並鎖定）")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((o) =>
      o
        .setName("選項a")
        .setDescription("選項 A 的內容")
        .setRequired(true)
        .setMaxLength(MAX_OPTION_LEN)
    )
    .addStringOption((o) =>
      o
        .setName("選項b")
        .setDescription("選項 B 的內容")
        .setRequired(true)
        .setMaxLength(MAX_OPTION_LEN)
    )
    .addStringOption((o) =>
      o
        .setName("選項c")
        .setDescription("選項 C 的內容（選填）")
        .setRequired(false)
        .setMaxLength(MAX_OPTION_LEN)
    )
    .addStringOption((o) =>
      o
        .setName("選項d")
        .setDescription("選項 D 的內容（選填）")
        .setRequired(false)
        .setMaxLength(MAX_OPTION_LEN)
    )
    .addIntegerOption((o) =>
      o
        .setName("分鐘")
        .setDescription(`作答時間（${MIN_MINUTES} ~ ${MAX_MINUTES} 分鐘，預設 1）`)
        .setRequired(false)
        .setMinValue(MIN_MINUTES)
        .setMaxValue(MAX_MINUTES)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!client.userCoinsCollection || !client.quizGamesCollection) {
        return interaction.editReply("🔧 預測系統尚未啟動，請聯絡舒舒！");
      }

      const question = interaction.options.getString("題目").trim();
      const prizePool = interaction.options.getInteger("獎金");
      const optA = interaction.options.getString("選項a").trim();
      const optB = interaction.options.getString("選項b").trim();
      const optC = interaction.options.getString("選項c")?.trim() || null;
      const optD = interaction.options.getString("選項d")?.trim() || null;
      const minutes = interaction.options.getInteger("分鐘") ?? 1;

      const options = [
        { key: "A", text: optA },
        { key: "B", text: optB },
      ];
      if (optC) options.push({ key: "C", text: optC });
      if (optD) options.push({ key: "D", text: optD });

      const { quizDoc, message } = await createQuiz(client, {
        guild: interaction.guild,
        host: interaction.user,
        member: interaction.member,
        question,
        options,
        correctKey: null,
        prizePool,
        minutes,
        kind: KIND_PREDICTION,
      });

      await interaction.editReply(
        `✅ 預測已發布！已鎖定 **${prizePool.toLocaleString()}** credits 作為獎金池。\n` +
          `📢 預測訊息：${message.url}\n` +
          `⏰ ${minutes} 分鐘後自動截止作答，**作答截止後**請按「公布 A/B/C/D」其中一個來宣告正確答案並結算。\n` +
          `（也可以隨時按「提早截止作答」提前鎖住票數）\n` +
          `預測 ID：\`${quizDoc.quizId}\``
      );
    } catch (error) {
      const msg = error?.message || String(error);
      const isUserError =
        msg.includes("餘額不足") ||
        msg.includes("題目") ||
        msg.includes("選項") ||
        msg.includes("獎金") ||
        msg.includes("時間") ||
        msg.includes("發布頻道");
      if (!isUserError) {
        console.log(`[ERROR] /預測 開設:\n${error}\n${error.stack || ""}`.red);
      }
      await interaction.editReply(`❌ ${msg}`).catch(() => {});
    }
  },
};
