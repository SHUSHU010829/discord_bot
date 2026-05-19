require("colors");

const { MessageFlags } = require("discord.js");
const {
  TYPES,
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
  const type = interaction.options.getString("type");
  const name = interaction.options.getString("name");
  const cuisine = interaction.options.getString("cuisine");
  const area = interaction.options.getString("area");
  const summary = interaction.options.getString("summary");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const set = { updatedAt: new Date() };
  if (type) {
    if (!TYPES[type]) {
      await interaction.editReply(`類型不合法：${type}`);
      return;
    }
    set.type = type;
  }
  if (name !== null && name !== undefined) set.name = name.trim() || null;
  if (cuisine !== null && cuisine !== undefined) set.cuisine = cuisine.trim() || null;
  if (area !== null && area !== undefined) set.area = area.trim() || null;
  if (summary !== null && summary !== undefined) set.summary = summary.trim() || null;

  if (Object.keys(set).length <= 1) {
    await interaction.editReply("沒有任何要修改的欄位。");
    return;
  }

  try {
    const result = await collection.findOneAndUpdate(
      { messageId, guildId: interaction.guild.id },
      { $set: set },
      { returnDocument: "after" },
    );
    const doc = result?.value || result;
    if (!doc) {
      await interaction.editReply(`找不到 messageId=${messageId} 的推薦紀錄。`);
      return;
    }
    await interaction.editReply(
      `✅ 已更新：${doc.name || "(未命名)"}（${TYPE_LABEL[doc.type] || doc.type}）`,
    );
  } catch (error) {
    console.log(`[ERROR] 推薦編輯失敗：\n${error}`.red);
    await interaction.editReply("🔧 編輯失敗，請稍後再試。").catch(() => {});
  }
}

module.exports = { run };
