require("colors");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const {
  TYPES,
  TYPE_DISPLAY,
} = require("../../constants/recommendationCategories");

const PREFIX = "rec_class_";

function parseCustomId(customId) {
  if (!customId || !customId.startsWith(PREFIX)) return null;
  const rest = customId.slice(PREFIX.length);
  const colonIdx = rest.indexOf(":");
  if (colonIdx < 0) return null;
  return {
    action: rest.slice(0, colonIdx),
    messageId: rest.slice(colonIdx + 1),
  };
}

function buildComponents(messageId, currentType, disabled = false) {
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

  return [
    new ActionRowBuilder().addComponents(select),
    new ActionRowBuilder().addComponents(confirm),
  ];
}

function buildEmbed(doc) {
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

function buildConfirmedEmbed(doc) {
  const lines = [];
  lines.push(`類別：${TYPE_DISPLAY[doc.type] || doc.type}`);
  if (doc.cuisine) lines.push(`料理：${doc.cuisine}`);
  if (doc.area) lines.push(`地區：${doc.area}`);
  if (doc.name) lines.push(`店名：${doc.name}`);
  return new EmbedBuilder()
    .setTitle("✅ 分類已確認")
    .setDescription(lines.join("\n"))
    .setColor(0x57f287);
}

module.exports = async (client, interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  const collection = client.recommendationsCollection;
  if (!collection) {
    await interaction
      .reply({
        content: "🔧 推薦資料庫尚未就緒，請稍後再試。",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
    return;
  }

  const { action, messageId } = parsed;

  try {
    const doc = await collection.findOne({ messageId });
    if (!doc) {
      await interaction
        .reply({
          content: "找不到對應的推薦紀錄，可能已被刪除。",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    if (interaction.user.id !== doc.authorId) {
      await interaction
        .reply({
          content: "只有原 PO 可以調整這則推薦的分類喔。",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }

    if (action === "select" && interaction.isStringSelectMenu()) {
      const newType = interaction.values?.[0];
      if (!newType || !TYPES[newType]) {
        await interaction
          .reply({
            content: "無效的分類選項。",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
        return;
      }

      const update = {
        type: newType,
        updatedAt: new Date(),
      };
      // 從餐廳改成非餐廳時，清掉 cuisine 比較合理
      if (newType !== "restaurant") update.cuisine = null;

      await collection.updateOne({ messageId }, { $set: update });
      const updatedDoc = { ...doc, ...update };

      await interaction.update({
        embeds: [buildEmbed(updatedDoc)],
        components: buildComponents(messageId, newType, false),
      });
      console.log(
        `[Recommendation] ${interaction.user.username} 改分類 ${doc.type} → ${newType} (${messageId})`
          .cyan,
      );
      return;
    }

    if (action === "confirm" && interaction.isButton()) {
      await collection.updateOne(
        { messageId },
        {
          $set: {
            classifyConfirmed: true,
            classifyConfirmedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: { classifyPromptId: "" },
        },
      );

      // 確認後刪除提示訊息，保持頻道整潔
      try {
        await interaction.message.delete();
      } catch (deleteError) {
        // 刪不掉就退回 update 顯示已確認
        await interaction
          .update({
            embeds: [buildConfirmedEmbed(doc)],
            components: buildComponents(messageId, doc.type, true),
          })
          .catch(() => {});
      }
      console.log(
        `[Recommendation] ${interaction.user.username} 確認分類 [${doc.type}] (${messageId})`
          .cyan,
      );
      return;
    }
  } catch (error) {
    console.log(`[ERROR] 推薦分類互動失敗：\n${error}`.red);
    try {
      const payload = {
        content: "🔧 處理分類時發生錯誤，請稍後再試。",
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    } catch (_) {
      /* noop */
    }
  }
};
