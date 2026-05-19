require("colors");

const config = require("../../config");
const {
  extractMapUrls,
  looksLikeRecommendation,
  stripUrls,
} = require("../../utils/recommendationParser");
const {
  analyzeRecommendation,
} = require("../../services/recommendationClassifier");

module.exports = async (client, message) => {
  if (message.author?.bot) return;
  if (!message.guild) return;

  const channelId = config.recommendation?.channelId;
  if (!channelId || message.channel.id !== channelId) return;

  const minTextLength = config.recommendation?.minTextLength ?? 2;
  const content = message.content || "";
  if (!looksLikeRecommendation(content, minTextLength)) return;

  const collection = client.recommendationsCollection;
  if (!collection) return;

  try {
    const mapUrls = extractMapUrls(content);
    const cleanText = stripUrls(content);

    const analysis = await analyzeRecommendation(content);

    const attachments = Array.from(message.attachments?.values?.() || [])
      .map((a) => a.url)
      .filter(Boolean);

    const doc = {
      messageId: message.id,
      channelId: message.channel.id,
      guildId: message.guild.id,
      authorId: message.author.id,
      authorName: message.author.username,
      authorTag: message.author.tag || message.author.username,
      content,
      cleanText,
      mapUrls,
      attachments,
      messageUrl: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
      type: analysis.type,
      cuisine: analysis.cuisine,
      mealTimes: analysis.mealTimes,
      area: analysis.area,
      name: analysis.name,
      summary: analysis.summary,
      keywords: analysis.keywords,
      createdAt: message.createdAt || new Date(),
      updatedAt: new Date(),
    };

    await collection.updateOne(
      { messageId: message.id },
      { $set: doc },
      { upsert: true },
    );

    console.log(
      `[Recommendation] 記錄推薦：${doc.name || "(無名)"} [${doc.type}] by ${doc.authorName}`
        .cyan,
    );
  } catch (error) {
    console.log(`[ERROR] 推薦追蹤失敗：\n${error}`.red);
  }
};
