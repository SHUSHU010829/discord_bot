const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
require("colors");

const PANELS_FILE = path.join(__dirname, "../../data/role-panels.json");
const ITEMS_PER_MENU = 25; // Discord StringSelectMenu 每頁最多 25 個選項

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

function buildPersonalizedRows(allRoles, currentRoleIdSet) {
  const rows = [];
  const totalPages = Math.max(1, Math.ceil(allRoles.length / ITEMS_PER_MENU));

  for (let page = 0; page < totalPages; page++) {
    const start = page * ITEMS_PER_MENU;
    const end = Math.min(start + ITEMS_PER_MENU, allRoles.length);
    const pageRoles = allRoles.slice(start, end);

    if (pageRoles.length === 0) continue;

    const options = pageRoles.map((role) => {
      const option = {
        label: role.name,
        value: role.roleId,
        default: currentRoleIdSet.has(role.roleId),
      };
      if (role.emoji) {
        option.emoji = role.emoji;
      }
      return option;
    });

    const placeholder =
      totalPages > 1
        ? `選擇你想要的遊戲身份組（第 ${page + 1}/${totalPages} 頁）`
        : "選擇你想要的遊戲身份組";

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`role_select_${page}`)
      .setPlaceholder(placeholder)
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(options);

    rows.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  return rows;
}

async function ensureMember(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ 此功能只能在伺服器中使用。",
      flags: 64,
    });
    return null;
  }

  let member = interaction.member;
  if (!member) {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch (error) {
      console.log(`[ERROR] 無法獲取 member：${error.message}`.red);
      await interaction.reply({
        content: "❌ 無法獲取你的身份組資訊，請稍後再試。",
        flags: 64,
      });
      return null;
    }
  }

  if (!member.roles || !member.roles.cache) {
    await interaction.reply({
      content: "❌ 無法獲取你的身份組資訊，請稍後再試。",
      flags: 64,
    });
    return null;
  }

  return member;
}

async function handleOpenPanel(interaction) {
  try {
    const member = await ensureMember(interaction);
    if (!member) return;

    const data = loadPanels();
    if (!data.roles || data.roles.length === 0) {
      return await interaction.reply({
        content: "❌ 目前沒有任何遊戲身份組可供選擇，請聯絡管理員設定。",
        flags: 64,
      });
    }

    const menuRoleIdSet = new Set(data.roles.map((r) => r.roleId));
    const currentRoleIdSet = new Set();
    member.roles.cache.forEach((role) => {
      if (menuRoleIdSet.has(role.id)) {
        currentRoleIdSet.add(role.id);
      }
    });

    const rows = buildPersonalizedRows(data.roles, currentRoleIdSet);

    const embed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎮 你的遊戲身份組")
      .setDescription(
        [
          "下方選單已自動勾選你目前擁有的身份組。",
          "想新增或移除哪些就直接調整勾選狀態，按下 Enter / 點空白處送出即可。",
          "未變更的身份組會保留，不會被清除。",
        ].join("\n"),
      );

    await interaction.reply({
      embeds: [embed],
      components: rows,
      flags: 64,
    });
  } catch (error) {
    console.log(`[ERROR] 開啟角色選單時出錯：${error}\n${error.stack}`.red);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 開啟身份組選單時發生錯誤！請聯絡管理員。",
          flags: 64,
        });
      } catch (replyError) {
        console.log(`[ERROR] 回覆錯誤訊息時出錯：${replyError}`.red);
      }
    }
  }
}

async function handleRoleSubmit(interaction) {
  try {
    const member = await ensureMember(interaction);
    if (!member) return;

    if (!interaction.values || !Array.isArray(interaction.values)) {
      console.log(`[ERROR] interaction.values 不存在或不是陣列`.red);
      return await interaction.reply({
        content: "❌ 無法讀取你的選擇，請重試。",
        flags: 64,
      });
    }

    // 只針對本次選單實際顯示的角色做加減 — 避免分頁時 A 頁提交誤刪 B 頁的角色，
    // 也讓個人化選單的「未勾選」只代表「想取消這頁的這幾個」。
    const menuOptionRoleIds = (interaction.component?.options || []).map(
      (opt) => opt.value,
    );

    if (menuOptionRoleIds.length === 0) {
      console.log(`[WARNING] 無法從 interaction.component 取得選項`.yellow);
      return await interaction.reply({
        content: "❌ 無法讀取選單資訊，請重試。",
        flags: 64,
      });
    }

    const menuOptionRoleIdSet = new Set(menuOptionRoleIds);
    const selectedRoleIdSet = new Set(interaction.values);

    const currentRoleIdSet = new Set();
    member.roles.cache.forEach((role) => {
      if (menuOptionRoleIdSet.has(role.id)) {
        currentRoleIdSet.add(role.id);
      }
    });

    const toAdd = [...selectedRoleIdSet].filter(
      (id) => !currentRoleIdSet.has(id),
    );
    const toRemove = [...currentRoleIdSet].filter(
      (id) => !selectedRoleIdSet.has(id),
    );

    const addedRoles = [];
    const removedRoles = [];
    const failedRoles = [];

    await Promise.all([
      ...toAdd.map(async (roleId) => {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          failedRoles.push(roleId);
          console.log(`[WARNING] 找不到角色：${roleId}`.yellow);
          return;
        }
        try {
          await member.roles.add(role);
          addedRoles.push(role.name);
        } catch (error) {
          failedRoles.push(roleId);
          console.log(
            `[ERROR] 新增角色 ${roleId} 時出錯：${error.message}`.red,
          );
        }
      }),
      ...toRemove.map(async (roleId) => {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          console.log(`[WARNING] 找不到角色：${roleId}`.yellow);
          return;
        }
        try {
          await member.roles.remove(role);
          removedRoles.push(role.name);
        } catch (error) {
          console.log(
            `[ERROR] 移除角色 ${roleId} 時出錯：${error.message}`.red,
          );
        }
      }),
    ]);

    let message = "";

    if (addedRoles.length > 0) {
      message += `✅ **已新增身份組：**\n${addedRoles.map((name) => `• ${name}`).join("\n")}\n\n`;
    }

    if (removedRoles.length > 0) {
      message += `🗑️ **已移除身份組：**\n${removedRoles.map((name) => `• ${name}`).join("\n")}\n\n`;
    }

    if (addedRoles.length === 0 && removedRoles.length === 0) {
      message = "ℹ️ 你的身份組沒有變更。";
    }

    if (failedRoles.length > 0) {
      message += `⚠️ 部分角色處理失敗，請聯絡管理員。`;
    }

    await interaction.reply({
      content: message.trim(),
      flags: 64, // MessageFlags.Ephemeral
    });
  } catch (error) {
    console.log(`[ERROR] 處理角色選單互動時出錯：${error}\n${error.stack}`.red);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 處理身份組時發生錯誤！請聯絡管理員。",
          flags: 64,
        });
      } catch (replyError) {
        console.log(`[ERROR] 回覆錯誤訊息時出錯：${replyError}`.red);
      }
    } else {
      console.log(`[WARNING] Interaction 已經被回覆，無法發送錯誤訊息`.yellow);
    }
  }
}

module.exports = async (client, interaction) => {
  // 處理「打開個人化選單」按鈕
  if (interaction.isButton() && interaction.customId === "role_panel_open") {
    return handleOpenPanel(interaction);
  }

  // 處理身份組選單提交
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId &&
    interaction.customId.startsWith("role_select_")
  ) {
    return handleRoleSubmit(interaction);
  }
};
