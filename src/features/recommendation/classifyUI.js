const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const {
  TYPES,
  TYPE_DISPLAY,
} = require("../../constants/recommendationCategories");

function buildClassifyComponents(messageId, currentType, disabled = false) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`rec_class_select:${messageId}`)
    .setPlaceholder("重新選擇分類…")
    .setDisabled(disabled)
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
    .setLabel(disabled ? "已確認" : "確認分類")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  const edit = new ButtonBuilder()
    .setCustomId(`rec_class_edit:${messageId}`)
    .setLabel("編輯資訊")
    .setEmoji("✏️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(confirm, edit),
  ];
}

function buildClassifyEmbed(doc) {
  const lines = [];
  lines.push(`類別：${TYPE_DISPLAY[doc.type] || doc.type}`);
  if (doc.cuisine) lines.push(`料理：${doc.cuisine}`);
  if (doc.area) lines.push(`地區：${doc.area}`);
  if (doc.name) lines.push(`店名：${doc.name}`);
  if (doc.summary) lines.push(`特色：${doc.summary}`);
  return new EmbedBuilder()
    .setTitle("🤖 我幫你分到這個分類，對嗎？")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "點選單可改分類、按「編輯資訊」可修改店名／料理／地區／特色，按「確認分類」即可保留",
    })
    .setColor(0x5865f2);
}

function buildConfirmedEmbed(doc) {
  const lines = [];
  lines.push(`類別：${TYPE_DISPLAY[doc.type] || doc.type}`);
  if (doc.cuisine) lines.push(`料理：${doc.cuisine}`);
  if (doc.area) lines.push(`地區：${doc.area}`);
  if (doc.name) lines.push(`店名：${doc.name}`);
  if (doc.summary) lines.push(`特色：${doc.summary}`);
  return new EmbedBuilder()
    .setTitle("✅ 分類已確認")
    .setDescription(lines.join("\n"))
    .setColor(0x57f287);
}

module.exports = {
  buildClassifyComponents,
  buildClassifyEmbed,
  buildConfirmedEmbed,
};
