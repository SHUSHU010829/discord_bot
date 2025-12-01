const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// 票務面板數據文件路徑
const PANELS_FILE = path.join(__dirname, "../../data/ticket-panels.json");

// 確保數據目錄和文件存在
function ensureDataFile() {
  const dataDir = path.dirname(PANELS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(PANELS_FILE)) {
    fs.writeFileSync(PANELS_FILE, JSON.stringify({ panels: {} }, null, 2));
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
    .setName("setup-ticket")
    .setDescription("🎫 設置票務系統面板")
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("票務面板標題（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("票務面板描述（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("button_label")
        .setDescription("按鈕標籤（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("button_emoji")
        .setDescription("按鈕 emoji（留空使用預設）")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("category_id")
        .setDescription("票務類別 ID（留空使用預設）")
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
      const title = interaction.options.getString("title") || config.ticket.panelTitle;
      const description = interaction.options.getString("description") || config.ticket.panelDescription;
      const buttonLabel = interaction.options.getString("button_label") || config.ticket.buttonLabel;
      const buttonEmoji = interaction.options.getString("button_emoji") || config.ticket.buttonEmoji;
      const categoryId = interaction.options.getString("category_id") || config.ticket.categoryId;
      const supportRole = interaction.options.getRole("support_role");
      const supportRoleId = supportRole ? supportRole.id : config.ticket.supportRoleId;

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
        .setColor("#0099ff")
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: interaction.guild.name });

      const button = new ButtonBuilder()
        .setCustomId("create_ticket")
        .setLabel(buttonLabel)
        .setEmoji(buttonEmoji)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.reply({
        content: "✅ 票務面板已設置！",
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
        buttonLabel,
        buttonEmoji,
        categoryId,
        supportRoleId,
        createdAt: new Date().toISOString(),
        createdBy: interaction.user.id,
      };
      savePanels(panels);

    } catch (error) {
      console.log(`[ERROR] 設置票務面板時出錯：\n${error}`.red);
      await interaction.reply({
        content: "❌ 設置票務面板時發生錯誤！",
        ephemeral: true,
      });
    }
  },
};
