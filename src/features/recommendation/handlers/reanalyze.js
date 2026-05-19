require("colors");

const { MessageFlags } = require("discord.js");
const {
  analyzeRecommendation,
} = require("../../../services/recommendationClassifier");
const {
  TYPE_LABEL,
} = require("../../../constants/recommendationCategories");

async function run(client, interaction) {
  const collection = client.recommendationsCollection;
  if (!collection) {
    await interaction.reply({
      content: "🔧 推薦資料庫尚未就緒，請稍後再試。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const messageId = interaction.options.getString("message_id");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const doc = await collection.findOne({
      messageId,
      guildId: interaction.guild.id,
    });
    if (!doc) {
      await interaction.editReply(`找不到 messageId=${messageId} 的推薦紀錄。`);
      return;
    }

    const analysis = await analyzeRecommendation(
      doc.content || doc.cleanText || "",
      { mapMetas: Array.isArray(doc.mapMetas) ? doc.mapMetas : [] },
    );
    await collection.updateOne(
      { messageId },
      {
        $set: {
          type: analysis.type,
          cuisine: analysis.cuisine,
          mealTimes: analysis.mealTimes,
          area: analysis.area,
          name: analysis.name,
          summary: analysis.summary,
          keywords: analysis.keywords,
          updatedAt: new Date(),
        },
      },
    );

    await interaction.editReply(
      `🔁 已重新分析：${analysis.name || "(未命名)"} → ${TYPE_LABEL[analysis.type] || analysis.type}` +
        (analysis.cuisine ? `（${analysis.cuisine}）` : "") +
        (analysis.area ? `　📍 ${analysis.area}` : ""),
    );
  } catch (error) {
    console.log(`[ERROR] 推薦重新分析失敗：\n${error}`.red);
    await interaction.editReply("🔧 重新分析失敗，請稍後再試。").catch(() => {});
  }
}

module.exports = { run };
