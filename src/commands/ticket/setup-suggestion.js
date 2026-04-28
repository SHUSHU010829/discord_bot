const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
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

function loadPanels() {
  ensureDataFile();
  const data = fs.readFileSync(PANELS_FILE, "utf8");
  return JSON.parse(data);
}

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
      const title = interaction.options.getString("title") || config.suggestion.panelTitle;
      const description = interaction.options.getString("description") || config.suggestion.panelDescription;
      const categoryId = interaction.options.getString("category_id") || config.suggestion.categoryId;
      const supportRole = interaction.options.getRole("support_role");
      const supportRoleId = supportRole ? supportRole.id : config.suggestion.supportRoleId;

      // 驗證類別 ID（如果提供）
      if (categoryId && categoryId !== "YOUR_CATEGORY_ID") {
        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== 4) {
          return interaction.reply({
            content: "❌ 提供的類別 ID 無效！請確認類別存在並正確。",
            ephemeral: true,
          });
        }
      }

      // 建立類型摘要：把 config.suggestion.types 轉成多行 markdown
      const typeEntries = Object.entries(config.suggestion.types);
      const typesSummary = typeEntries
        .map(([, type]) => `${type.emoji} **${type.label}**`)
        .join("　");

      const selectMenuOptions = typeEntries.map(([key, type]) => ({
        label: type.label,
        value: key,
        emoji: type.emoji,
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("suggestion_select")
        .setPlaceholder(config.suggestion.selectPlaceholder)
        .addOptions(selectMenuOptions);

      const container = new ContainerBuilder()
        .setAccentColor(0xffd700)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`# ${title}\n${description}`),
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**📋 可申請類型**\n${typesSummary}`,
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            "👇 從下方選單挑一個類型開始申請",
          ),
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(selectMenu),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# ${interaction.guild.name}・<t:${Math.floor(Date.now() / 1000)}:R> 設置`,
          ),
        );

      await interaction.reply({
        content: "✅ 建議系統面板已設置！",
        ephemeral: true,
      });

      const message = await interaction.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ 設置建議面板時發生錯誤！",
          ephemeral: true,
        });
      }
    }
  },
};
