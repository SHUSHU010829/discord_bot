const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// 建議面板數據文件路徑
const PANELS_FILE = path.join(__dirname, "../../data/suggestion-panels.json");

// 確保數據目錄和文件存在
function ensureDataFile() {
  const dataDir = path.dirname(PANELS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(PANELS_FILE)) {
    fs.writeFileSync(PANELS_FILE, JSON.stringify({ panels: {}, pendingDeletions: {} }, null, 2));
  }
}

// 讀取面板數據
function loadPanels() {
  ensureDataFile();
  const data = fs.readFileSync(PANELS_FILE, "utf8");
  return JSON.parse(data);
}

// 保存面板數據
function savePanels(data) {
  ensureDataFile();
  fs.writeFileSync(PANELS_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-suggestion")
    .setDescription("💡 設置建議系統面板")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("建議面板標題（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("建議面板描述（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("category_id")
        .setDescription("建議類別 ID（留空使用預設）")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("support_role")
        .setDescription("支援團隊身份組（留空使用預設）")
        .setRequired(false)
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      // 獲取自定義選項或使用預設值
      const title = interaction.options.getString("title") || config.suggestion.panelTitle;
      const description = interaction.options.getString("description") || config.suggestion.panelDescription;
      const categoryId = interaction.options.getString("category_id") || config.suggestion.categoryId;
      const supportRole = interaction.options.getRole("support_role");
      const supportRoleId = supportRole ? supportRole.id : config.suggestion.supportRoleId;

      // 驗證類別 ID（如果提供）
      if (categoryId && categoryId !== "YOUR_CATEGORY_ID") {
        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== 4) { // 4 = GuildCategory
          return interaction.reply({
            content: "❌ 提供的類別 ID 無效！請確認類別存在並正確。",
            ephemeral: true,
          });
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: interaction.guild.name });

      // 創建下拉選單選項
      const selectMenuOptions = Object.entries(config.suggestion.types).map(([key, type]) => ({
        label: type.label,
        value: key,
        emoji: type.emoji,
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("suggestion_select")
        .setPlaceholder(config.suggestion.selectPlaceholder)
        .addOptions(selectMenuOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: "✅ 建議系統面板已設置！",
        ephemeral: true,
      });

      const message = await interaction.channel.send({
        embeds: [embed],
        components: [row],
      });

      // 保存此頻道的面板配置
      const panels = loadPanels();
      panels.panels[interaction.channel.id] = {
        messageId: message.id,
        channelId: interaction.channel.id,
        guildId: interaction.guild.id,
        title,
        description,
        categoryId,
        supportRoleId,
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id,
      };
      savePanels(panels);

    } catch (error) {
      console.log(`[ERROR] 設置建議面板時出錯：\n${error}`.red);
      await interaction.reply({
        content: "❌ 設置建議面板時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};
