require("colors");

const { MessageFlags } = require("discord.js");

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
    const result = await collection.findOneAndDelete({
      messageId,
      guildId: interaction.guild.id,
    });
    const doc = result?.value || result;
    if (!doc) {
      await interaction.editReply(`找不到 messageId=${messageId} 的推薦紀錄。`);
      return;
    }
    await interaction.editReply(`🗑️ 已刪除：${doc.name || "(未命名)"}`);
  } catch (error) {
    console.log(`[ERROR] 推薦刪除失敗：\n${error}`.red);
    await interaction.editReply("🔧 刪除失敗，請稍後再試。").catch(() => {});
  }
}

module.exports = { run };
