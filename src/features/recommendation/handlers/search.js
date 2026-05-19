require("colors");

const { MessageFlags } = require("discord.js");
const {
  TYPE_DISPLAY,
} = require("../../../constants/recommendationCategories");

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const keyword = (interaction.options.getString("關鍵字") || "").trim();
  const type = interaction.options.getString("類別");

  if (!keyword) {
    await interaction.reply({
      content: "請輸入關鍵字。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const re = new RegExp(escapeRegex(keyword), "i");
  const query = {
    guildId: interaction.guild.id,
    $or: [
      { name: re },
      { cleanText: re },
      { summary: re },
      { area: re },
      { cuisine: re },
      { keywords: keyword.toLowerCase() },
    ],
  };
  if (type) query.type = type;

  try {
    const docs = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    if (docs.length === 0) {
      await interaction.editReply(`找不到符合「${keyword}」的推薦。`);
      return;
    }

    const top = docs.slice(0, 10);
    const lines = [
      `## 🔍 搜尋結果：「${keyword}」（${docs.length} 筆，顯示前 ${top.length} 筆）`,
    ];
    for (let i = 0; i < top.length; i++) {
      const d = top[i];
      const meta = [TYPE_DISPLAY[d.type] || "📌 其他"];
      if (d.cuisine) meta.push(`🍴 ${d.cuisine}`);
      if (d.area) meta.push(`📍 ${d.area}`);
      const linkParts = [];
      if (d.mapUrls?.[0]) linkParts.push(`[🗺️ Google 地圖](${d.mapUrls[0]})`);
      if (d.messageUrl) linkParts.push(`[💬 原始訊息](${d.messageUrl})`);
      lines.push(
        `\n**${i + 1}. ${d.name || "(未命名)"}**\n${meta.join("　|　")}` +
          (d.summary ? `\n> ${d.summary}` : "") +
          (linkParts.length > 0 ? `\n${linkParts.join("　")}` : ""),
      );
    }

    await interaction.editReply({
      content: lines.join("\n"),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.log(`[ERROR] 推薦搜尋失敗：\n${error}`.red);
    await interaction.editReply("🔧 搜尋失敗，請稍後再試。").catch(() => {});
  }
}

module.exports = { run };
