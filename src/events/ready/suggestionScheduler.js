require("colors");
const fs = require("fs");
const { getDataFile } = require("../../utils/dataPaths");

const SUGGESTION_PANELS_FILE = getDataFile("suggestion-panels.json");

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
  // 啟動時先跑一次，把 stale 條目清掉，不必等 60 秒
  try {
    await processScheduledDeletions(client);
  } catch (error) {
    console.log(`[ERROR] 啟動時處理建議頻道刪除出錯：\n${error}`.red);
  }

  // 之後每分鐘檢查一次待刪除的建議頻道
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

    let deletedCount = 0;
    let cleanedOrphans = 0;

    for (const { channelId, deletion } of channelsToDelete) {
      try {
        const result = await deleteSuggestionChannel(client, channelId, deletion);
        if (result === "missing") cleanedOrphans++;
        else if (result === "deleting") deletedCount++;

        // 不論是真的刪除、還是頻道已不存在，都從 pendingDeletions 移除
        delete data.pendingDeletions[channelId];
      } catch (error) {
        console.log(`[ERROR] 刪除建議頻道 ${channelId} 時出錯：\n${error}`.red);
      }
    }

    // 保存更新後的數據
    saveSuggestionPanels(data);

    if (deletedCount > 0) {
      console.log(
        `[SUGGESTION] 已排程刪除 ${deletedCount} 個建議頻道`.cyan,
      );
    }
    if (cleanedOrphans > 0) {
      console.log(
        `[SUGGESTION] 清理 ${cleanedOrphans} 個已不存在的建議頻道紀錄`.gray,
      );
    }
  } catch (error) {
    console.log(`[ERROR] 查詢待刪除建議頻道時出錯：\n${error}`.red);
  }
}

async function deleteSuggestionChannel(client, channelId, deletion) {
  // 獲取 guild
  const guild = await client.guilds.fetch(deletion.guildId).catch(() => null);
  if (!guild) {
    console.log(`[ERROR] 找不到 guild ${deletion.guildId}`.red);
    return "missing";
  }

  // 獲取頻道
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    // 頻道已被手動刪除是預期狀態，靜默清理即可
    return "missing";
  }

  // 發送最後通知
  const { EmbedBuilder } = require("discord.js");
  const finalEmbed = new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle("🗑️ 建議頻道即將刪除")
    .setDescription("此建議頻道將在 5 秒後自動刪除。")
    .setTimestamp();

  await channel.send({ embeds: [finalEmbed] }).catch(() => null);

  // 等待 5 秒後刪除
  setTimeout(async () => {
    try {
      await channel.delete("建議頻道自動刪除 - 關閉後 24 小時");
      console.log(`[SUGGESTION] 已刪除建議頻道：${channel.name}`.cyan);
    } catch (error) {
      console.log(`[ERROR] 刪除建議頻道時出錯：\n${error}`.red);
    }
  }, 5000);

  return "deleting";
}
