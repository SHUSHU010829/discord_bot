require("colors");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");
const config = require("../../../config");
const {
  loadPanels,
  savePanels,
} = require("../../../utils/suggestionPanelsStore");

async function run(client, interaction) {
  try {
    const title = interaction.options.getString("title") || config.suggestion.panelTitle;
    const description = interaction.options.getString("description") || config.suggestion.panelDescription;
    const categoryId = interaction.options.getString("category_id") || config.suggestion.categoryId;
    const supportRole = interaction.options.getRole("support_role");
    const supportRoleId = supportRole ? supportRole.id : config.suggestion.supportRoleId;

    if (categoryId && categoryId !== "YOUR_CATEGORY_ID") {
      const category = interaction.guild.channels.cache.get(categoryId);
      if (!category || category.type !== 4) {
        return interaction.reply({
          content: "❌ 提供的類別 ID 無效！請確認類別存在並正確。",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

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
      flags: MessageFlags.Ephemeral,
    });

    const message = await interaction.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });

    const panels = await loadPanels(client);
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
    await savePanels(client, panels);
  } catch (error) {
    console.log(`[ERROR] 設置建議面板時出錯：\n${error}`.red);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ 設置建議面板時發生錯誤！",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

module.exports = { run };
