require("colors");
const {
  SlashCommandBuilder,
  MessageFlags,
  InteractionContextType,
} = require("discord.js");

const { coinSystem } = require("../../config");
const {
  createQuiz,
  KIND_QUIZ,
  MODE_SPLIT,
  MODE_SOLO,
  MIN_MINUTES,
  MAX_MINUTES,
  MAX_QUESTION_LEN,
  MAX_OPTION_LEN,
} = require("../../features/quiz/quizGame");

const ANSWER_CHOICES = [
  { name: "A", value: "A" },
  { name: "B", value: "B" },
  { name: "C", value: "C" },
  { name: "D", value: "D" },
];

const MODE_CHOICES = [
  { name: "平分獎金（答對者平分）", value: MODE_SPLIT },
  { name: "搶答獨佔（首位答對者獨得）", value: MODE_SOLO },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("問答")
    .setDescription("發布一題有獎問答，可選擇平分獎金或搶答獨佔模式 🎯")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("題目")
        .setDescription("問題內容")
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
        .setName("正確答案")
        .setDescription("哪一個選項是正確答案")
        .setRequired(true)
        .addChoices(...ANSWER_CHOICES)
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
        .setDescription(`答題時間（${MIN_MINUTES} ~ ${MAX_MINUTES} 分鐘，預設 1）`)
        .setRequired(false)
        .setMinValue(MIN_MINUTES)
        .setMaxValue(MAX_MINUTES)
    )
    .addStringOption((o) =>
      o
        .setName("模式")
        .setDescription("獎金分配方式（預設：平分獎金）")
        .setRequired(false)
        .addChoices(...MODE_CHOICES)
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!coinSystem?.enabled) {
        return interaction.editReply("🔧 金幣系統尚未啟動！");
      }
      if (!client.userCoinsCollection || !client.quizGamesCollection) {
        return interaction.editReply("🔧 問答系統尚未啟動，請聯絡舒舒！");
      }

      const question = interaction.options.getString("題目").trim();
      const prizePool = interaction.options.getInteger("獎金");
      const correctKey = interaction.options.getString("正確答案");
      const optA = interaction.options.getString("選項a").trim();
      const optB = interaction.options.getString("選項b").trim();
      const optC = interaction.options.getString("選項c")?.trim() || null;
      const optD = interaction.options.getString("選項d")?.trim() || null;
      const minutes = interaction.options.getInteger("分鐘") ?? 1;
      const mode = interaction.options.getString("模式") || MODE_SPLIT;

      const options = [
        { key: "A", text: optA },
        { key: "B", text: optB },
      ];
      if (optC) options.push({ key: "C", text: optC });
      if (optD) options.push({ key: "D", text: optD });

      if (correctKey === "C" && !optC) {
        return interaction.editReply("❌ 你選擇正確答案是 C，但沒有提供選項 C。");
      }
      if (correctKey === "D" && !optD) {
        return interaction.editReply("❌ 你選擇正確答案是 D，但沒有提供選項 D。");
      }

      const { quizDoc, message } = await createQuiz(client, {
        guild: interaction.guild,
        host: interaction.user,
        member: interaction.member,
        question,
        options,
        correctKey,
        prizePool,
        minutes,
        kind: KIND_QUIZ,
        mode,
      });

      const modeLine =
        mode === MODE_SOLO
          ? `⚡ 模式：搶答獨佔（首位答對者獨得全部獎金）\n`
          : `🤝 模式：平分獎金（答對者平分獎金池）\n`;

      await interaction.editReply(
        `✅ 問答已發布！已鎖定 **${prizePool.toLocaleString()}** credits 作為獎金池。\n` +
          modeLine +
          `📢 問答訊息：${message.url}\n` +
          `⏰ ${minutes} 分鐘後自動公布答案並結算（也可以隨時按「立即公布答案並發獎金」提早結算）。\n` +
          `問答 ID：\`${quizDoc.quizId}\``
      );
    } catch (error) {
      const msg = error?.message || String(error);
      const isUserError =
        msg.includes("餘額不足") ||
        msg.includes("題目") ||
        msg.includes("選項") ||
        msg.includes("正確答案") ||
        msg.includes("獎金") ||
        msg.includes("時間") ||
        msg.includes("模式") ||
        msg.includes("問答發布頻道");
      if (!isUserError) {
        console.log(`[ERROR] /問答 開設:\n${error}\n${error.stack || ""}`.red);
      }
      await interaction.editReply(`❌ ${msg}`).catch(() => {});
    }
  },
};
