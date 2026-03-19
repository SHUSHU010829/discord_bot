const fs = require("fs");
const path = require("path");
require("colors");

const PANELS_FILE = path.join(__dirname, "../../data/role-panels.json");

function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = fs.readFileSync(PANELS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log(`[ERROR] 讀取角色面板數據時出錯：${error}`.red);
  }
  return { roles: [], panels: {}, targetChannelId: "" };
}

module.exports = async (client, interaction) => {
  // 只處理 StringSelectMenu 互動
  if (!interaction.isStringSelectMenu()) {
    return; // 不是選單互動，直接返回
  }

  // 只處理角色選單
  if (!interaction.customId || !interaction.customId.startsWith("role_select_")) {
    return; // 不是角色選單，直接返回
  }

  console.log(`[DEBUG] handleRoleSelect 處理角色選單`.cyan);
  console.log(`[DEBUG] customId: ${interaction.customId}`.cyan);
  console.log(`[DEBUG] user: ${interaction.user?.username}`.cyan);

  try {
    // 確保在伺服器中執行
    if (!interaction.guild) {
      console.log(`[ERROR] interaction.guild 不存在，可能在 DM 中`.red);
      return await interaction.reply({
        content: "❌ 此功能只能在伺服器中使用。",
        flags: 64,
      });
    }

    // 確保 member 存在並獲取完整資料
    let member = interaction.member;
    if (!member) {
      console.log(`[WARNING] interaction.member 不存在，嘗試獲取...`.yellow);
      try {
        member = await interaction.guild.members.fetch(interaction.user.id);
      } catch (error) {
        console.log(`[ERROR] 無法獲取 member：${error.message}`.red);
        return await interaction.reply({
          content: "❌ 無法獲取你的身份組資訊，請稍後再試。",
          flags: 64,
        });
      }
    }

    // 確保 roles.cache 存在
    if (!member.roles || !member.roles.cache) {
      console.log(`[ERROR] member.roles.cache 不存在`.red);
      console.log(`[DEBUG] member 結構:`, Object.keys(member));
      return await interaction.reply({
        content: "❌ 無法獲取你的身份組資訊，請稍後再試。",
        flags: 64,
      });
    }

    // 確保 interaction.values 存在
    if (!interaction.values || !Array.isArray(interaction.values)) {
      console.log(`[ERROR] interaction.values 不存在或不是陣列`.red);
      console.log(`[DEBUG] interaction.customId: ${interaction.customId}`.cyan);
      console.log(`[DEBUG] interaction.values:`, interaction.values);
      return await interaction.reply({
        content: "❌ 無法讀取你的選擇，請重試。",
        flags: 64,
      });
    }

    const data = loadPanels();
    const selectedRoleIds = interaction.values; // 用戶選擇的角色 ID 陣列

    // 取得所有在選單中的角色 ID
    const allMenuRoleIds = data.roles.map(r => r.roleId);

    // 計算目前擁有的選單角色
    const currentRoleIds = [];
    member.roles.cache.forEach(role => {
      if (allMenuRoleIds.includes(role.id)) {
        currentRoleIds.push(role.id);
      }
    });

    const toAdd = selectedRoleIds.filter(id => !currentRoleIds.includes(id));
    const toRemove = currentRoleIds.filter(id => !selectedRoleIds.includes(id));

    console.log(`[DEBUG] 用戶: ${interaction.user.username}`.cyan);
    console.log(`[DEBUG] 用戶選擇: ${selectedRoleIds.join(", ") || "無"}`.cyan);
    console.log(`[DEBUG] 目前擁有: ${currentRoleIds.join(", ") || "無"}`.cyan);
    console.log(`[DEBUG] 要新增: ${toAdd.join(", ") || "無"}`.green);
    console.log(`[DEBUG] 要移除: ${toRemove.join(", ") || "無"}`.yellow);

    // 執行角色變更
    const addedRoles = [];
    const removedRoles = [];
    const failedRoles = [];

    for (const roleId of toAdd) {
      try {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          await member.roles.add(role);
          addedRoles.push(role.name);
        } else {
          failedRoles.push(roleId);
          console.log(`[WARNING] 找不到角色：${roleId}`.yellow);
        }
      } catch (error) {
        failedRoles.push(roleId);
        console.log(`[ERROR] 新增角色 ${roleId} 時出錯：${error.message}`.red);
      }
    }

    for (const roleId of toRemove) {
      try {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          await member.roles.remove(role);
          removedRoles.push(role.name);
        } else {
          console.log(`[WARNING] 找不到角色：${roleId}`.yellow);
        }
      } catch (error) {
        console.log(`[ERROR] 移除角色 ${roleId} 時出錯：${error.message}`.red);
      }
    }

    // 建立回覆訊息
    let message = "";

    if (addedRoles.length > 0) {
      message += `✅ **已新增身份組：**\n${addedRoles.map(name => `• ${name}`).join("\n")}\n\n`;
    }

    if (removedRoles.length > 0) {
      message += `🗑️ **已移除身份組：**\n${removedRoles.map(name => `• ${name}`).join("\n")}\n\n`;
    }

    if (addedRoles.length === 0 && removedRoles.length === 0) {
      message = "ℹ️ 你的身份組沒有變更。";
    }

    if (failedRoles.length > 0) {
      message += `⚠️ 部分角色處理失敗，請聯絡管理員。`;
    }

    // 回覆用戶
    await interaction.reply({
      content: message.trim(),
      flags: 64, // MessageFlags.Ephemeral
    });

  } catch (error) {
    console.log(`[ERROR] 處理角色選單互動時出錯：${error}\n${error.stack}`.red);

    // 檢查是否已經回覆過
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 處理身份組時發生錯誤！請聯絡管理員。",
          flags: 64, // MessageFlags.Ephemeral
        });
      } catch (replyError) {
        console.log(`[ERROR] 回覆錯誤訊息時出錯：${replyError}`.red);
      }
    } else {
      console.log(`[WARNING] Interaction 已經被回覆，無法發送錯誤訊息`.yellow);
    }
  }
};
