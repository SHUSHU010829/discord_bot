const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config");
const { loadPanels } = require("../../utils/suggestionPanelsStore");
const logger = require("../../utils/logger");
const { trackError, trackSuccess } = require("../../utils/errorTracker");

module.exports = async (client, interaction) => {
  // 只處理 StringSelectMenu 互動
  if (!interaction.isStringSelectMenu()) {
    return;
  }

  // 只處理建議選單
  if (interaction.customId !== "suggestion_select") {
    return;
  }

  try {
    // 確保在伺服器中執行
    if (!interaction.guild) {
      logger.warn({ source: "suggestion-select" }, "interaction.guild 不存在,可能在 DM 中");
      return await interaction.reply({
        content: "❌ 此功能只能在伺服器中使用。",
        ephemeral: true,
      });
    }

    // 確保 interaction.values 存在
    if (
      !interaction.values ||
      !Array.isArray(interaction.values) ||
      interaction.values.length === 0
    ) {
      logger.error({ source: "suggestion-select" }, "interaction.values 不存在或為空");
      trackError("suggestion-select", new Error("invalid interaction.values"));
      return await interaction.reply({
        content: "❌ 無法讀取你的選擇，請重試。",
        ephemeral: true,
      });
    }

    const selectedType = interaction.values[0];
    const suggestionType = config.suggestion.types[selectedType];

    if (!suggestionType) {
      logger.error({ source: "suggestion-select", selectedType }, "無效的建議類型");
      trackError("suggestion-select", new Error(`invalid type: ${selectedType}`));
      return await interaction.reply({
        content: "❌ 無效的建議類型！",
        ephemeral: true,
      });
    }

    // 先 defer，避免 loadPanels + 頻道建立讓 3 秒 token 過期觸發 10062
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (deferErr) {
      if (deferErr?.code === 10062) {
        logger.warn(
          { source: "suggestion-select", customId: interaction.customId },
          "互動已逾期,無法 defer"
        );
        trackError("suggestion-select", deferErr, { reason: "expired" });
        return;
      }
      throw deferErr;
    }

    // 獲取此頻道的面板配置（如果存在）
    const panels = await loadPanels(client);
    const panelConfig = panels.panels[interaction.channel.id];

    // 使用頻道特定配置或預設配置
    const suggestionConfig = panelConfig
      ? {
          categoryId: panelConfig.categoryId,
          supportRoleId: panelConfig.supportRoleId,
        }
      : {
          categoryId: config.suggestion.categoryId,
          supportRoleId: config.suggestion.supportRoleId,
        };

    // 檢查用戶是否已經有開啟的建議頻道
    const existingSuggestion = interaction.guild.channels.cache.find(
      (channel) =>
        channel.topic === `建議創建者：${interaction.user.name}` &&
        channel.type === ChannelType.GuildText,
    );

    if (existingSuggestion) {
      return interaction.editReply({
        content: `❌ 您已經有一個開啟的建議頻道了！\n請前往 ${existingSuggestion} 或先關閉現有的建議。`,
      });
    }

    await interaction.editReply({
      content: "⏳ 正在創建建議頻道...",
    });

    // 驗證並獲取父類別
    let parentCategory = null;
    if (
      suggestionConfig.categoryId &&
      suggestionConfig.categoryId !== "YOUR_CATEGORY_ID"
    ) {
      const category = interaction.guild.channels.cache.get(
        suggestionConfig.categoryId,
      );
      if (category && category.type === ChannelType.GuildCategory) {
        parentCategory = suggestionConfig.categoryId;
      } else {
        logger.warn(
          { source: "suggestion-select", categoryId: suggestionConfig.categoryId },
          "建議類別 ID 無效或不存在,改用無類別創建"
        );
      }
    }

    // 創建建議頻道
    const suggestionChannel = await interaction.guild.channels.create({
      name: `${suggestionType.channelPrefix}-${interaction.user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      parent: parentCategory,
      topic: `建議創建者：${interaction.user.name}`,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    // 如果有支援團隊身份組，添加權限
    if (
      suggestionConfig.supportRoleId &&
      suggestionConfig.supportRoleId !== "YOUR_SUPPORT_ROLE_ID"
    ) {
      const supportRole = interaction.guild.roles.cache.get(
        suggestionConfig.supportRoleId,
      );
      if (supportRole) {
        await suggestionChannel.permissionOverwrites.create(
          suggestionConfig.supportRoleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          },
        );
      } else {
        logger.warn(
          { source: "suggestion-select", supportRoleId: suggestionConfig.supportRoleId },
          "支援團隊身份組 ID 無效或不存在"
        );
      }
    }

    // 發送歡迎訊息和關閉按鈕
    const welcomeEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle(`${suggestionType.emoji} ${suggestionType.label}`)
      .setDescription(
        suggestionType.welcomeMessage.replace(
          "{user}",
          interaction.user.toString(),
        ),
      )
      .setTimestamp();

    const closeButton = new ButtonBuilder()
      .setCustomId("close_suggestion")
      .setLabel("關閉票務")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(closeButton);

    await suggestionChannel.send({
      content: `${interaction.user}`,
      embeds: [welcomeEmbed],
      components: [row],
    });

    await interaction.editReply({
      content: `✅ 建議頻道已創建！\n請前往 ${suggestionChannel}`,
      ephemeral: true,
    });
    trackSuccess("suggestion-select");
  } catch (error) {
    logger.error(
      { source: "suggestion-select", userId: interaction.user?.id, err: error.message, stack: error.stack },
      "處理建議選單互動時出錯"
    );
    trackError("suggestion-select", error, { userId: interaction.user?.id });

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 處理建議時發生錯誤！請聯絡管理員。",
          ephemeral: true,
        });
      } catch (replyError) {
        logger.error({ source: "suggestion-select", err: replyError.message }, "回覆錯誤訊息失敗");
        trackError("suggestion-select", replyError);
      }
    } else {
      try {
        await interaction.editReply({
          content: "❌ 創建建議頻道時發生錯誤！請聯絡管理員。",
          ephemeral: true,
        });
      } catch (editError) {
        logger.error({ source: "suggestion-select", err: editError.message }, "編輯回覆失敗");
        trackError("suggestion-select", editError);
      }
    }
  }
};
