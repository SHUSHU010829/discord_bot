require("colors");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const config = require("../../config");
const {
  extractMapUrls,
  looksLikeRecommendation,
  stripUrls,
} = require("../../utils/recommendationParser");
const {
  analyzeRecommendation,
} = require("../../services/recommendationClassifier");
const { fetchMapMetaForUrls } = require("../../services/mapMetaFetcher");
const {
  TYPES,
  TYPE_DISPLAY,
} = require("../../constants/recommendationCategories");

function buildClassifyComponents(messageId, currentType) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rec_class_select:${messageId}`)
    .setPlaceholder("重新選擇分類…")
    .addOptions(
      Object.entries(TYPES).map(([value, { label, emoji }]) => ({
        label,
        value,
        emoji,
        default: value === currentType,
      })),
    );

  const confirm = new ButtonBuilder()
    .setCustomId(`rec_class_confirm:${messageId}`)
    .setLabel("確認分類")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(confirm),
  ];
}

function buildClassifyEmbed(doc) {
  const lines = [];
  lines.push(`類別：${TYPE_DISPLAY[doc.type] || doc.type}`);
  if (doc.cuisine) lines.push(`料理：${doc.cuisine}`);
  if (doc.area) lines.push(`地區：${doc.area}`);
  if (doc.name) lines.push(`店名：${doc.name}`);
  return new EmbedBuilder()
    .setTitle("🤖 我幫你分到這個分類，對嗎？")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "點下方選單可以改分類，按「確認分類」即可保留" })
    .setColor(0x5865f2);
}

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

    const mapMetas = await fetchMapMetaForUrls(mapUrls);
    const analysis = await analyzeRecommendation(content, { mapMetas });

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
      mapMetas,
      attachments,
      messageUrl: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
      type: analysis.type,
      cuisine: analysis.cuisine,
      mealTimes: analysis.mealTimes,
      area: analysis.area,
      name: analysis.name,
      summary: analysis.summary,
      keywords: analysis.keywords,
      classifyConfirmed: false,
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

    // 在頻道公開回覆分類確認提示；PO 按下「確認」後會自動刪除
    try {
      const prompt = await message.reply({
        embeds: [buildClassifyEmbed(doc)],
        components: buildClassifyComponents(message.id, doc.type),
        allowedMentions: { repliedUser: false },
      });

      await collection.updateOne(
        { messageId: message.id },
        { $set: { classifyPromptId: prompt.id } },
      );
    } catch (promptError) {
      console.log(
        `[Recommendation] 發送分類確認提示失敗：${promptError.message}`.yellow,
      );
    }
  } catch (error) {
    console.log(`[ERROR] 推薦追蹤失敗：\n${error}`.red);
  }
};
