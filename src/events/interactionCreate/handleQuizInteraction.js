require("colors");
const { MessageFlags } = require("discord.js");

const {
  setAnswer,
  lockQuiz,
  settleQuiz,
  cancelQuiz,
  OPTION_EMOJIS,
} = require("../../features/quiz/quizGame");
const { consume } = require("../../utils/rateLimiter");

function isQuizInteraction(customId) {
  return (
    typeof customId === "string" &&
    (customId.startsWith("quiz_ans_") ||
      customId.startsWith("quiz_lock_") ||
      customId.startsWith("quiz_reveal_") ||
      customId.startsWith("quiz_end_") ||
      customId.startsWith("quiz_cancel_"))
  );
}

async function loadQuiz(client, quizId) {
  return client.quizGamesCollection.findOne({ quizId });
}

async function handleAnswerButton(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // customId: quiz_ans_{quizId}_{key}
  const rest = interaction.customId.slice("quiz_ans_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  const quizId = rest.slice(0, lastUnderscore);
  const key = rest.slice(lastUnderscore + 1);

  const doc = await loadQuiz(client, quizId);
  if (!doc) {
    return interaction.editReply("❌ 找不到這場問答。");
  }
  if (doc.status === "LOCKED") {
    return interaction.editReply("🔒 作答已截止，等待主辦人公布答案。");
  }
  if (doc.status !== "ACTIVE") {
    return interaction.editReply("❌ 問答已結束。");
  }
  if (interaction.user.id === doc.hostId) {
    return interaction.editReply("❌ 主辦人不能參加自己的問答。");
  }
  if (new Date(doc.endsAt).getTime() <= Date.now()) {
    return interaction.editReply("⏰ 答題時間已截止。");
  }

  const previous = doc.answers?.[interaction.user.id]?.key || null;

  const result = await setAnswer(
    client,
    doc,
    interaction.user.id,
    key,
    interaction.member?.displayName || interaction.user.username
  );

  if (result.action === "closed") {
    return interaction.editReply("❌ 問答已結束，無法作答。");
  }
  if (result.action === "invalid") {
    return interaction.editReply("❌ 這個選項不存在。");
  }

  const emoji = OPTION_EMOJIS[key] || "";
  if (previous && previous !== key) {
    return interaction.editReply(
      `✏️ 已將你的答案從 **${previous}** 改成 ${emoji} **${key}**。（時間到自動結算）`
    );
  }
  if (previous === key) {
    return interaction.editReply(`👍 你已經選了 ${emoji} **${key}**。`);
  }
  return interaction.editReply(
    `✅ 你的答案是 ${emoji} **${key}**。時間到或主辦人結束後公布結果。`
  );
}

async function handleLockButton(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const quizId = interaction.customId.slice("quiz_lock_".length);
  const doc = await loadQuiz(client, quizId);
  if (!doc) return interaction.editReply("❌ 找不到問答。");
  if (interaction.user.id !== doc.hostId) {
    return interaction.editReply("❌ 只有主辦人能截止作答。");
  }
  if (doc.status === "LOCKED") {
    return interaction.editReply("ℹ️ 作答已經截止了，按「公布答案並發獎金」就會結算。");
  }
  if (doc.status !== "ACTIVE") {
    return interaction.editReply("❌ 問答已結束。");
  }

  try {
    await lockQuiz(client, doc, "manual");
    await interaction.editReply(
      `🔒 已截止作答。準備好就按「公布答案並發獎金」公布結果。`
    );
  } catch (err) {
    console.log(`[ERROR] quiz lock: ${err}\n${err.stack || ""}`.red);
    await interaction.editReply(`❌ ${err.message || err}`).catch(() => {});
  }
}

async function handleRevealButton(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 支援舊版 quiz_end_ 與新版 quiz_reveal_
  const prefix = interaction.customId.startsWith("quiz_reveal_")
    ? "quiz_reveal_"
    : "quiz_end_";
  const quizId = interaction.customId.slice(prefix.length);
  const doc = await loadQuiz(client, quizId);
  if (!doc) return interaction.editReply("❌ 找不到問答。");
  if (interaction.user.id !== doc.hostId) {
    return interaction.editReply("❌ 只有主辦人能公布答案。");
  }
  if (doc.status === "ACTIVE") {
    return interaction.editReply(
      "ℹ️ 還在作答中，請先按「提早截止作答」再公布答案，或等時間到自動截止。"
    );
  }
  if (doc.status !== "LOCKED") {
    return interaction.editReply("❌ 問答已結束。");
  }

  try {
    const settled = await settleQuiz(client, doc, "manual");
    const winners = settled.winners?.length || 0;
    if (winners === 0) {
      await interaction.editReply(
        `🏁 結算完成。沒有人答對，獎金 ${settled.prizePool.toLocaleString()} 已退還給你。`
      );
    } else {
      await interaction.editReply(
        `🏁 結算完成！${winners} 人答對，每人 ${settled.perWinnerPrize.toLocaleString()} credits。`
      );
    }
  } catch (err) {
    console.log(`[ERROR] quiz reveal: ${err}\n${err.stack || ""}`.red);
    await interaction.editReply(`❌ ${err.message || err}`).catch(() => {});
  }
}

async function handleCancelButton(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const quizId = interaction.customId.slice("quiz_cancel_".length);
  const doc = await loadQuiz(client, quizId);
  if (!doc) return interaction.editReply("❌ 找不到問答。");
  if (interaction.user.id !== doc.hostId) {
    return interaction.editReply("❌ 只有主辦人能取消問答。");
  }
  if (doc.status !== "ACTIVE") {
    return interaction.editReply("❌ 問答已結束，無法取消。");
  }

  try {
    const cancelled = await cancelQuiz(client, doc, interaction.user);
    await interaction.editReply(
      `🚫 問答已取消，獎金 ${cancelled.prizePool.toLocaleString()} credits 已退還。`
    );
  } catch (err) {
    console.log(`[ERROR] quiz cancel: ${err}\n${err.stack || ""}`.red);
    await interaction.editReply(`❌ ${err.message || err}`).catch(() => {});
  }
}

module.exports = async (client, interaction) => {
  const customId = interaction.customId;
  if (!customId || !isQuizInteraction(customId)) return;
  if (!interaction.isButton()) return;
  if (!client.quizGamesCollection) return;

  const rl = consume(interaction.user.id, "btn:quiz", { windowMs: 1500, max: 1 });
  if (!rl.allowed) {
    try {
      await interaction.reply({
        content: `⏳ 操作太頻繁，請 ${Math.ceil(rl.retryAfterMs / 1000)} 秒後再試。`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (_) {
      /* noop */
    }
    return;
  }

  try {
    if (customId.startsWith("quiz_ans_")) return handleAnswerButton(client, interaction);
    if (customId.startsWith("quiz_lock_")) return handleLockButton(client, interaction);
    if (customId.startsWith("quiz_reveal_")) return handleRevealButton(client, interaction);
    if (customId.startsWith("quiz_end_")) return handleRevealButton(client, interaction);
    if (customId.startsWith("quiz_cancel_")) return handleCancelButton(client, interaction);
  } catch (error) {
    console.log(`[ERROR] handleQuizInteraction (${customId}): ${error}\n${error.stack || ""}`.red);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ 處理問答互動時發生錯誤。" });
      } else {
        await interaction.reply({
          content: "❌ 處理問答互動時發生錯誤。",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
