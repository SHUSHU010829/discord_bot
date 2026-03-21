require("colors");
const fs = require("fs");
const path = require("path");

const SUGGESTION_PANELS_FILE = path.join(__dirname, "../../data/suggestion-panels.json");

// 讀取建議面板數據
function loadSuggestionPanels() {
  try {
    if (fs.existsSync(SUGGESTION_PANELS_FILE)) {
      const data = fs.readFileSync(SUGGESTION_PANELS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log(`[ERROR] 讀取建議面板數據時出錯：${error}`.red);
  }
  return { panels: {}, pendingDeletions: {} };
}

// 保存建議面板數據
function saveSuggestionPanels(data) {
  try {
    fs.writeFileSync(SUGGESTION_PANELS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`[ERROR] 保存建議面板數據時出錯：${error}`.red);
  }
}

module.exports = async (client) => {
  // 每分鐘檢查一次待刪除的建議頻道
  setInterval(async () => {
    try {
      await processScheduledDeletions(client);
    } catch (error) {
      console.log(`[ERROR] 處理建議頻道刪除時出錯：\n${error}`.red);
    }
  }, 60000); // 每 60 秒檢查一次

  console.log(`[SYSTEM] 建議頻道自動刪除系統已啟動！`.green);
};

async function processScheduledDeletions(client) {
  try {
    const data = loadSuggestionPanels();
    const now = new Date();
    const channelsToDelete = [];

    // 查找所有應該刪除的頻道
    for (const [channelId, deletion] of Object.entries(data.pendingDeletions)) {
      const deleteTime = new Date(deletion.deleteAt);
      if (now >= deleteTime) {
        channelsToDelete.push({ channelId, deletion });
      }
    }

    if (channelsToDelete.length === 0) return;

    console.log(`[SUGGESTION] 發現 ${channelsToDelete.length} 個待刪除的建議頻道，開始處理...`.yellow);

    for (const { channelId, deletion } of channelsToDelete) {
      try {
        await deleteSuggestionChannel(client, channelId, deletion);

        // 從待刪除列表中移除
        delete data.pendingDeletions[channelId];
      } catch (error) {
        console.log(`[ERROR] 刪除建議頻道 ${channelId} 時出錯：\n${error}`.red);
      }
    }

    // 保存更新後的數據
    saveSuggestionPanels(data);

  } catch (error) {
    console.log(`[ERROR] 查詢待刪除建議頻道時出錯：\n${error}`.red);
  }
}

async function deleteSuggestionChannel(client, channelId, deletion) {
  try {
    // 獲取 guild
    const guild = await client.guilds.fetch(deletion.guildId);
    if (!guild) {
      console.log(`[ERROR] 找不到 guild ${deletion.guildId}`.red);
      return;
    }

    // 獲取頻道
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.log(`[WARNING] 頻道 ${channelId} 不存在，可能已被手動刪除`.yellow);
      return;
    }

    // 發送最後通知
    const { EmbedBuilder } = require("discord.js");
    const finalEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🗑️ 建議頻道即將刪除")
      .setDescription("此建議頻道將在 5 秒後自動刪除。")
      .setTimestamp();

    await channel.send({ embeds: [finalEmbed] });

    // 等待 5 秒後刪除
    setTimeout(async () => {
      try {
        await channel.delete("建議頻道自動刪除 - 關閉後 24 小時");
        console.log(`[SUGGESTION] 已刪除建議頻道：${channel.name}`.cyan);
      } catch (error) {
        console.log(`[ERROR] 刪除建議頻道時出錯：\n${error}`.red);
      }
    }, 5000);

  } catch (error) {
    console.log(`[ERROR] 處理建議頻道刪除時出錯：\n${error}`.red);
    throw error;
  }
}
