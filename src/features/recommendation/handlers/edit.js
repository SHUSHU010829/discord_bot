require("colors");

const { MessageFlags } = require("discord.js");
const {
  TYPES,
  TYPE_LABEL,
} = require("../../../constants/recommendationCategories");

// 支援訊息連結（https://discord.com/channels/<guildId>/<channelId>/<messageId>）
// 或直接的 message ID（純數字 snowflake）
function parseMessageRef(input, expectedGuildId) {
  if (!input) return { error: "請提供訊息連結或訊息 ID。" };
  const trimmed = input.trim();

  const linkMatch = trimmed.match(
    /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/,
  );
  if (linkMatch) {
    const [, guildId, , messageId] = linkMatch;
    if (expectedGuildId && guildId !== expectedGuildId) {
      return { error: "這個訊息連結不是這個伺服器的訊息喔。" };
    }
    return { messageId };
  }

  if (/^\d{17,20}$/.test(trimmed)) return { messageId: trimmed };

  return {
    error:
      "看不懂這個輸入，請貼上訊息連結（在訊息上點「分享」→「複製訊息連結」），或直接貼 message ID。",
  };
}

async function run(client, interaction) {
  const collection = client.recommendationsCollection;
  if (!collection) {
    await interaction.reply({
      content: "🔧 推薦資料庫尚未就緒，請稍後再試。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const rawRef = interaction.options.getString("訊息連結");
  const type = interaction.options.getString("類別");
  const name = interaction.options.getString("店名");
  const cuisine = interaction.options.getString("料理");
  const area = interaction.options.getString("地區");
  const summary = interaction.options.getString("特色");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parsed = parseMessageRef(rawRef, interaction.guild.id);
  if (parsed.error) {
    await interaction.editReply(parsed.error);
    return;
  }
  const messageId = parsed.messageId;

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
