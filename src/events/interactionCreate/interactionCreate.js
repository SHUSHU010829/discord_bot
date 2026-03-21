require("colors");
const {
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// 票務面板數據文件路徑
const PANELS_FILE = path.join(__dirname, "../../data/ticket-panels.json");
const SUGGESTION_PANELS_FILE = path.join(
  __dirname,
  "../../data/suggestion-panels.json",
);

// 讀取面板數據
function loadPanels() {
  try {
    if (fs.existsSync(PANELS_FILE)) {
      const data = fs.readFileSync(PANELS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log(`[ERROR] 讀取面板數據時出錯：\n${error}`.red);
  }
  return { panels: {} };
}

// 讀取建議面板數據
function loadSuggestionPanels() {
  try {
    if (fs.existsSync(SUGGESTION_PANELS_FILE)) {
      const data = fs.readFileSync(SUGGESTION_PANELS_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.log(`[ERROR] 讀取建議面板數據時出錯：\n${error}`.red);
  }
  return { panels: {}, pendingDeletions: {} };
}

// 保存建議面板數據
function saveSuggestionPanels(data) {
  try {
    fs.writeFileSync(SUGGESTION_PANELS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`[ERROR] 保存建議面板數據時出錯：\n${error}`.red);
  }
}

// 用於追蹤已處理的互動，防止重複處理
const processedInteractions = new Set();

// 每 5 分鐘清理一次舊的互動 ID
setInterval(
  () => {
    processedInteractions.clear();
  },
  5 * 60 * 1000,
);

module.exports = async (client, interaction) => {
  try {
    // handleRoleSelect.js 會自動處理 StringSelectMenu，這裡不需要再調用

    if (!interaction.isButton()) return;

    // 檢查是否已經處理過這個互動
    if (processedInteractions.has(interaction.id)) {
      console.log(
        `[WARNING] 互動 ${interaction.id} 已被處理過，跳過重複處理`.yellow,
      );
      return;
    }

    // 標記這個互動為已處理
    processedInteractions.add(interaction.id);

    // 處理票務按鈕
    if (interaction.customId === "create_ticket") {
      await handleTicketCreation(client, interaction);
      return;
    }

    // 處理建議按鈕
    if (interaction.customId === "close_suggestion") {
      await handleCloseSuggestion(client, interaction);
      return;
    }

    if (interaction.customId === "cancel_close_suggestion") {
      await handleCancelCloseSuggestion(client, interaction);
      return;
    }

    // 處理投票按鈕
    const voteButtons = [
      "vote_player",
      "vote_support",
      "vote_no_interest",
      "vote_still_playing",
      "vote_archive_ok",
    ];

    if (voteButtons.includes(interaction.customId)) {
      await handleVoteButton(client, interaction);
      return;
    }

    // 處理管理員投票控制按鈕
    if (interaction.customId.startsWith("vote_end_") || interaction.customId.startsWith("vote_cancel_")) {
      await handleAdminVoteControl(client, interaction);
      return;
    }

    // 處理身份組按鈕
    // 先檢查是否是系統按鈕（避免誤處理）
    const systemButtons = [
      "create_ticket",
      "close_suggestion",
      "cancel_close_suggestion",
      "vote_player",
      "vote_support",
      "vote_no_interest",
      "vote_still_playing",
      "vote_archive_ok",
    ];

    // 如果是系統按鈕或互動已被回應，則不處理
    if (systemButtons.includes(interaction.customId) || interaction.replied) {
      return;
    }

    const role = interaction.guild.roles.cache.get(interaction.customId);
    if (!role) {
      return interaction.reply({
        content: "無法找到該身份組！",
        ephemeral: true,
      });
    }

    const hasRole = interaction.member.roles.cache.has(role.id);
    if (hasRole) {
      await interaction.member.roles.remove(role);
      return interaction.reply({
        content: `已經移除了身份組：${role.name}`,
        ephemeral: true,
      });
    } else {
      await interaction.member.roles.add(role);
      return interaction.reply({
        content: `已經成功給予身份組：${role.name}`,
        ephemeral: true,
      });
    }
  } catch (error) {
    console.log(`[ERROR] 處理互動時出錯：\n${error}`.red);
  }
};

async function handleTicketCreation(client, interaction) {
  try {
    // 獲取此頻道的面板配置（如果存在）
    const panels = loadPanels();
    const panelConfig = panels.panels[interaction.channel.id];

    // 使用頻道特定配置或預設配置
    const ticketConfig = panelConfig
      ? {
          categoryId: panelConfig.categoryId,
          supportRoleId: panelConfig.supportRoleId,
          ticketNameFormat: config.ticket.ticketNameFormat,
          welcomeMessage: config.ticket.welcomeMessage,
          alreadyHasTicket: config.ticket.alreadyHasTicket,
          ticketCreating: config.ticket.ticketCreating,
          ticketCreated: config.ticket.ticketCreated,
        }
      : config.ticket;

    // 檢查用戶是否已經有票務
    const existingTicket = interaction.guild.channels.cache.find(
      (channel) =>
        channel.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        channel.type === ChannelType.GuildText,
    );

    if (existingTicket) {
      return interaction.reply({
        content: ticketConfig.alreadyHasTicket,
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: ticketConfig.ticketCreating,
      ephemeral: true,
    });

    // 驗證並獲取父類別
    let parentCategory = null;
    if (
      ticketConfig.categoryId &&
      ticketConfig.categoryId !== "YOUR_CATEGORY_ID"
    ) {
      const category = interaction.guild.channels.cache.get(
        ticketConfig.categoryId,
      );
      if (category && category.type === ChannelType.GuildCategory) {
        parentCategory = ticketConfig.categoryId;
      } else {
        console.log(
          `[WARNING] 票務類別 ID ${ticketConfig.categoryId} 無效或不存在，將在沒有類別的情況下創建頻道`
            .yellow,
        );
      }
    }

    // 創建票務頻道
    const ticketChannel = await interaction.guild.channels.create({
      name: ticketConfig.ticketNameFormat.replace(
        "{username}",
        interaction.user.username.toLowerCase(),
      ),
      type: ChannelType.GuildText,
      parent: parentCategory,
      topic: `票務創建者：${interaction.user.id}`,
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
      ticketConfig.supportRoleId &&
      ticketConfig.supportRoleId !== "YOUR_SUPPORT_ROLE_ID"
    ) {
      const supportRole = interaction.guild.roles.cache.get(
        ticketConfig.supportRoleId,
      );
      if (supportRole) {
        await ticketChannel.permissionOverwrites.create(
          ticketConfig.supportRoleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          },
        );
      } else {
        console.log(
          `[WARNING] 支援團隊身份組 ID ${ticketConfig.supportRoleId} 無效或不存在`
            .yellow,
        );
      }
    }

    // 發送歡迎訊息
    const welcomeEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎫 票務已創建")
      .setDescription(
        ticketConfig.welcomeMessage.replace(
          "{user}",
          interaction.user.toString(),
        ),
      )
      .setTimestamp();

    await ticketChannel.send({
      content: `${interaction.user}`,
      embeds: [welcomeEmbed],
    });

    await interaction.editReply({
      content: ticketConfig.ticketCreated.replace(
        "{channel}",
        ticketChannel.toString(),
      ),
      ephemeral: true,
    });
  } catch (error) {
    console.log(`[ERROR] 創建票務時出錯：\n${error}\n${error.stack}`.red);
    try {
      await interaction.editReply({
        content: "❌ 創建票務時發生錯誤！請聯絡管理員。",
        ephemeral: true,
      });
    } catch (replyError) {
      console.log(`[ERROR] 回覆錯誤訊息時出錯：\n${replyError}`.red);
    }
  }
}

async function handleVoteButton(client, interaction) {
  try {
    // 查找對應的投票提案
    const proposal = await client.votingProposalsCollection.findOne({
      messageId: interaction.message.id,
      status: "VOTING",
    });

    if (!proposal) {
      return interaction.reply({
        content: "❌ 找不到對應的投票或投票已結束！",
        ephemeral: true,
      });
    }

    const userId = interaction.user.id;
    const buttonType = interaction.customId;

    // 處理不同類型的投票
    if (proposal.proposalType === "create") {
      await handleCreateVote(client, interaction, proposal, userId, buttonType);
    } else if (proposal.proposalType === "archive") {
      await handleArchiveVote(
        client,
        interaction,
        proposal,
        userId,
        buttonType,
      );
    }
  } catch (error) {
    console.log(`[ERROR] 處理投票按鈕時出錯：\n${error}\n${error.stack}`.red);
    try {
      await interaction.reply({
        content: "❌ 處理投票時發生錯誤！",
        ephemeral: true,
      });
    } catch (replyError) {
      console.log(`[ERROR] 回覆錯誤訊息時出錯：\n${replyError}`.red);
    }
  }
}

async function handleCreateVote(
  client,
  interaction,
  proposal,
  userId,
  buttonType,
) {
  // 移除用戶在所有類別中的投票（互斥邏輯）
  const updates = {
    $pull: {
      "votes.players": userId,
      "votes.supporters": userId,
      "votes.noInterest": userId,
    },
  };

  // 根據按鈕類型添加新投票
  let voteTypeText = "";
  let voteEmoji = "";

  switch (buttonType) {
    case "vote_player":
      updates.$addToSet = { "votes.players": userId };
      voteTypeText = "核心玩家 (🔥 我會玩)";
      voteEmoji = "🔥";
      break;
    case "vote_support":
      updates.$addToSet = { "votes.supporters": userId };
      voteTypeText = "純支持 (👍 純支持)";
      voteEmoji = "👍";
      break;
    case "vote_no_interest":
      updates.$addToSet = { "votes.noInterest": userId };
      voteTypeText = "沒興趣 (😶 沒興趣)";
      voteEmoji = "😶";
      break;
  }

  // 更新資料庫
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    updates,
  );

  // 回覆用戶
  await interaction.reply({
    content: `${voteEmoji} 已將您的票更改為【${voteTypeText}】`,
    ephemeral: true,
  });

  // 更新投票訊息顯示當前票數
  await updateVoteMessage(client, interaction, proposal);
}

async function handleArchiveVote(
  client,
  interaction,
  proposal,
  userId,
  buttonType,
) {
  // 移除用戶在所有類別中的投票（互斥邏輯）
  const updates = {
    $pull: {
      "votes.stillPlaying": userId,
      "votes.archiveOk": userId,
    },
  };

  // 根據按鈕類型添加新投票
  let voteTypeText = "";
  let voteEmoji = "";

  switch (buttonType) {
    case "vote_still_playing":
      updates.$addToSet = { "votes.stillPlaying": userId };
      voteTypeText = "我還在玩 (✋ 反對封存)";
      voteEmoji = "✋";
      break;
    case "vote_archive_ok":
      updates.$addToSet = { "votes.archiveOk": userId };
      voteTypeText = "同意封存 (📦 同意封存)";
      voteEmoji = "📦";
      break;
  }

  // 更新資料庫
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    updates,
  );

  // 回覆用戶
  await interaction.reply({
    content: `${voteEmoji} 已將您的票更改為【${voteTypeText}】`,
    ephemeral: true,
  });

  // 更新投票訊息顯示當前票數
  await updateVoteMessage(client, interaction, proposal);
}

async function updateVoteMessage(client, interaction, proposal) {
  try {
    // 重新獲取最新的投票數據
    const updatedProposal = await client.votingProposalsCollection.findOne({
      _id: proposal._id,
    });

    if (!updatedProposal) return;

    const originalEmbed = interaction.message.embeds[0];
    const { EmbedBuilder } = require("discord.js");

    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    // 清除舊的投票統計欄位
    updatedEmbed.spliceFields(2, updatedEmbed.data.fields?.length - 2 || 0);

    // 添加新的投票統計
    if (updatedProposal.proposalType === "create") {
      const playersCount = updatedProposal.votes.players?.length || 0;
      const supportersCount = updatedProposal.votes.supporters?.length || 0;
      const noInterestCount = updatedProposal.votes.noInterest?.length || 0;
      const totalScore =
        playersCount * config.voting.weights.players +
        supportersCount * config.voting.weights.supporters;

      updatedEmbed.addFields(
        { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
        { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
        { name: "😶 沒興趣", value: `${noInterestCount} 人`, inline: true },
        { name: "📊 總分", value: `${totalScore} 分`, inline: true },
        {
          name: "✅ 通過門檻",
          value: `總分 ≥ ${config.voting.passThresholds.totalScore} 且 核心玩家 ≥ ${config.voting.passThresholds.minPlayers}`,
          inline: false,
        },
      );
    } else {
      const stillPlayingCount = updatedProposal.votes.stillPlaying?.length || 0;
      const archiveOkCount = updatedProposal.votes.archiveOk?.length || 0;

      updatedEmbed.addFields(
        { name: "✋ 我還在玩", value: `${stillPlayingCount} 人`, inline: true },
        { name: "📦 同意封存", value: `${archiveOkCount} 人`, inline: true },
        {
          name: "📌 封存條件",
          value: `如果「我還在玩」< ${config.voting.archiveThresholds.minActivePlayers} 人，則封存頻道`,
          inline: false,
        },
      );
    }

    await interaction.message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    console.log(`[ERROR] 更新投票訊息時出錯：\n${error}`.red);
  }
}

async function handleCloseSuggestion(client, interaction) {
  try {
    // 檢查互動是否已被回應
    if (interaction.replied || interaction.deferred) {
      console.log(`[WARNING] 互動已被回應，跳過處理關閉建議`.yellow);
      return;
    }

    console.log(
      `[SUGGESTION] 開始處理關閉建議，互動 ID: ${interaction.id}`.cyan,
    );

    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");

    // 計算刪除時間（24小時後）
    const deleteTime = new Date();
    deleteTime.setHours(
      deleteTime.getHours() + config.suggestion.closeDelayHours,
    );
    const deleteTimestamp = Math.floor(deleteTime.getTime() / 1000);

    // 更新訊息，顯示關閉狀態和取消按鈕
    const closeEmbed = new EmbedBuilder()
      .setColor("#ff9900")
      .setTitle("🔒 建議已關閉")
      .setDescription(
        `此建議頻道已被 ${interaction.user} 關閉。\n\n` +
          `⏰ 頻道將在 <t:${deleteTimestamp}:R>（<t:${deleteTimestamp}:F>）自動刪除。\n\n` +
          `如需取消刪除，請點擊下方按鈕。`,
      )
      .setTimestamp();

    const cancelButton = new ButtonBuilder()
      .setCustomId("cancel_close_suggestion")
      .setLabel("取消關閉")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(cancelButton);

    // 直接編輯訊息，不使用 interaction 方法
    await interaction.message.edit({
      embeds: [closeEmbed],
      components: [row],
    });

    // 最後才確認互動（避免阻塞）
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      }
    } catch (err) {
      // 忽略互動確認錯誤
      console.log(`[DEBUG] 互動確認失敗（已忽略）: ${err.message}`.gray);
    }

    // 記錄待刪除的頻道
    const data = loadSuggestionPanels();
    data.pendingDeletions[interaction.channel.id] = {
      channelId: interaction.channel.id,
      guildId: interaction.guild.id,
      deleteAt: deleteTime.toISOString(),
      closedBy: interaction.user.id,
      closedAt: new Date().toISOString(),
    };
    saveSuggestionPanels(data);

    console.log(
      `[SUGGESTION] 建議頻道 ${interaction.channel.name} 已標記為將於 ${deleteTime.toISOString()} 刪除`
        .yellow,
    );
  } catch (error) {
    console.log(`[ERROR] 處理關閉票務時出錯：\n${error}\n${error.stack}`.red);

    // 只有在互動尚未被回應時才嘗試回覆
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 關閉票務時發生錯誤！",
          ephemeral: true,
        });
      } catch (replyError) {
        console.log(`[ERROR] 回覆錯誤訊息時出錯：\n${replyError}`.red);
      }
    }
  }
}

async function handleCancelCloseSuggestion(client, interaction) {
  try {
    // 檢查互動是否已被回應
    if (interaction.replied || interaction.deferred) {
      console.log(`[WARNING] 互動已被回應，跳過處理取消關閉建議`.yellow);
      return;
    }

    console.log(
      `[SUGGESTION] 開始處理取消關閉，互動 ID: ${interaction.id}`.cyan,
    );

    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
    } = require("discord.js");

    // 從待刪除列表中移除
    const data = loadSuggestionPanels();
    if (data.pendingDeletions[interaction.channel.id]) {
      delete data.pendingDeletions[interaction.channel.id];
      saveSuggestionPanels(data);
    }

    // 恢復原始關閉按鈕
    const cancelEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("✅ 已取消關閉")
      .setDescription(
        `${interaction.user} 已取消關閉此建議頻道。\n\n` +
          `如需關閉，請點擊下方按鈕。`,
      )
      .setTimestamp();

    const closeButton = new ButtonBuilder()
      .setCustomId("close_suggestion")
      .setLabel("關閉票務")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(closeButton);

    // 直接編輯訊息，不使用 interaction 方法
    await interaction.message.edit({
      embeds: [cancelEmbed],
      components: [row],
    });

    // 最後才確認互動（避免阻塞）
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferUpdate();
      }
    } catch (err) {
      // 忽略互動確認錯誤
      console.log(`[DEBUG] 互動確認失敗（已忽略）: ${err.message}`.gray);
    }

    console.log(
      `[SUGGESTION] 建議頻道 ${interaction.channel.name} 的刪除已取消`.green,
    );
  } catch (error) {
    console.log(
      `[ERROR] 處理取消關閉票務時出錯：\n${error}\n${error.stack}`.red,
    );

    // 只有在互動尚未被回應時才嘗試回覆
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ 取消關閉時發生錯誤！",
          ephemeral: true,
        });
      } catch (replyError) {
        console.log(`[ERROR] 回覆錯誤訊息時出錯：\n${replyError}`.red);
      }
    }
  }
}

async function handleAdminVoteControl(client, interaction) {
  try {
    // 驗證是否為管理員
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ 只有管理員才能使用此功能！",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // 從 customId 中提取 voteId
    const isEndAction = interaction.customId.startsWith("vote_end_");
    const voteId = interaction.customId.replace(/^vote_(end|cancel)_/, "");

    // 查找投票
    const proposal = await client.votingProposalsCollection.findOne({
      voteId,
      status: "VOTING",
    });

    if (!proposal) {
      return interaction.editReply({
        content: "❌ 找不到進行中的投票，或投票已結束！",
      });
    }

    if (isEndAction) {
      // 提早結束投票
      await handleVoteEnd(client, interaction, proposal);
    } else {
      // 取消投票
      await handleVoteCancel(client, interaction, proposal);
    }
  } catch (error) {
    console.log(`[ERROR] 處理管理員投票控制時出錯：\n${error}\n${error.stack}`.red);
    try {
      const replyContent = "❌ 執行操作時發生錯誤！";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: replyContent });
      } else {
        await interaction.reply({ content: replyContent, ephemeral: true });
      }
    } catch (replyError) {
      console.log(`[ERROR] 回覆錯誤訊息時出錯：\n${replyError}`.red);
    }
  }
}

async function handleVoteEnd(client, interaction, proposal) {
  try {
    // 計算投票結果
    let passed = false;
    let resultEmbed;

    if (proposal.proposalType === "create") {
      const playersCount = proposal.votes.players?.length || 0;
      const supportersCount = proposal.votes.supporters?.length || 0;
      const noInterestCount = proposal.votes.noInterest?.length || 0;

      const totalScore =
        playersCount * config.voting.weights.players +
        supportersCount * config.voting.weights.supporters;

      passed =
        totalScore >= config.voting.passThresholds.totalScore &&
        playersCount >= config.voting.passThresholds.minPlayers;

      const result = {
        playersCount,
        supportersCount,
        noInterestCount,
        totalScore,
        passed,
      };

      resultEmbed = createResultEmbed(proposal, result, passed);
    } else if (proposal.proposalType === "archive") {
      const stillPlayingCount = proposal.votes.stillPlaying?.length || 0;
      const archiveOkCount = proposal.votes.archiveOk?.length || 0;

      passed = stillPlayingCount < config.voting.archiveThresholds.minActivePlayers;

      const result = {
        stillPlayingCount,
        archiveOkCount,
        passed,
      };

      resultEmbed = createArchiveResultEmbed(proposal, result, passed);
    }

    // 更新投票訊息
    await interaction.message.edit({
      embeds: [resultEmbed],
      components: [], // 移除所有按鈕
    });

    // 通知票務頻道
    const ticketChannel = await interaction.guild.channels
      .fetch(proposal.ticketChannelId)
      .catch(() => null);

    if (ticketChannel) {
      await notifyTicketChannel(client, ticketChannel, proposal, passed);
    }

    // 如果投票通過，發送通知到指定頻道
    if (passed) {
      const resultChannelId = "1181144417277595669";
      const resultChannel = await interaction.guild.channels
        .fetch(resultChannelId)
        .catch(() => null);

      if (resultChannel) {
        await notifyResultChannel(client, resultChannel, proposal);
      }
    }

    // 更新提案狀態
    await client.votingProposalsCollection.updateOne(
      { _id: proposal._id },
      {
        $set: {
          status: passed ? "PASSED" : "FAILED",
          finalizedAt: new Date(),
          endedBy: interaction.user.id,
          endedEarly: true,
        },
      }
    );

    await interaction.editReply({
      content: `✅ 投票已提早結束！\n結果：${passed ? "✅ 通過" : "❌ 未通過"}`,
    });

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 被 ${interaction.user.tag} 提早結束：${passed ? "通過 ✅" : "未通過 ❌"}`
        .cyan
    );
  } catch (error) {
    console.log(`[ERROR] 提早結束投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

async function handleVoteCancel(client, interaction, proposal) {
  try {
    // 建立取消通知 Embed
    const cancelEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle(`🗑️ 投票已取消：【${proposal.gameName}】`)
      .setDescription(
        `此投票已被管理員 ${interaction.user} 取消。\n\n` +
          `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
          `**取消時間：** <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setTimestamp()
      .setFooter({ text: "投票系統" });

    // 更新投票訊息
    await interaction.message.edit({
      embeds: [cancelEmbed],
      components: [], // 移除所有按鈕
    });

    // 通知票務頻道
    const ticketChannel = await interaction.guild.channels
      .fetch(proposal.ticketChannelId)
      .catch(() => null);

    if (ticketChannel) {
      const notificationEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("🗑️ 投票已被取消")
        .setDescription(
          `<@${proposal.proposerId}>，您的提案【${proposal.gameName}】投票已被管理員取消。\n\n` +
            `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
            `**取消原因：** 管理員手動取消\n\n` +
            `此票務將在 5 分鐘後自動關閉。`
        )
        .setTimestamp();

      await ticketChannel.send({ embeds: [notificationEmbed] });

      // 5 分鐘後自動關閉票務
      setTimeout(async () => {
        try {
          const channelExists = await ticketChannel.guild.channels
            .fetch(ticketChannel.id)
            .catch(() => null);
          if (channelExists) {
            const closeEmbed = new EmbedBuilder()
              .setColor("#ff0000")
              .setTitle("🔒 票務自動關閉")
              .setDescription("此票務因投票被取消而自動關閉。\n頻道將在 5 秒後刪除。")
              .setTimestamp();

            await ticketChannel.send({ embeds: [closeEmbed] });

            setTimeout(async () => {
              try {
                await ticketChannel.delete();
              } catch (error) {
                console.log(`[ERROR] 刪除票務頻道時出錯：\n${error}`.red);
              }
            }, 5000);
          }
        } catch (error) {
          console.log(`[ERROR] 自動關閉票務時出錯：\n${error}`.red);
        }
      }, 5 * 60 * 1000);
    }

    // 更新提案狀態
    await client.votingProposalsCollection.updateOne(
      { _id: proposal._id },
      {
        $set: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledBy: interaction.user.id,
        },
      }
    );

    await interaction.editReply({
      content: `✅ 投票已取消！投票訊息已更新。`,
    });

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 被 ${interaction.user.tag} 取消`.yellow
    );
  } catch (error) {
    console.log(`[ERROR] 取消投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

// 輔助函數：建立新增頻道投票結果 Embed
function createResultEmbed(proposal, result, passed) {
  const embed = new EmbedBuilder()
    .setTitle(`${passed ? "✅ 提案通過" : "❌ 提案未通過"}：【${proposal.gameName}】`)
    .setColor(passed ? "#00ff00" : "#ff0000")
    .setDescription(`此提案已於 <t:${Math.floor(Date.now() / 1000)}:F> 結束投票`)
    .addFields(
      { name: "🔥 核心玩家", value: `${result.playersCount} 人`, inline: true },
      { name: "👍 純支持", value: `${result.supportersCount} 人`, inline: true },
      { name: "😶 沒興趣", value: `${result.noInterestCount} 人`, inline: true },
      { name: "📊 總分", value: `${result.totalScore} 分`, inline: true },
      {
        name: "📋 結算結果",
        value: passed
          ? `✅ **通過！**\n總分 ${result.totalScore} ≥ ${config.voting.passThresholds.totalScore}，且核心玩家 ${result.playersCount} ≥ ${config.voting.passThresholds.minPlayers}`
          : `❌ **未通過**\n需要：總分 ≥ ${config.voting.passThresholds.totalScore} 且 核心玩家 ≥ ${config.voting.passThresholds.minPlayers}`,
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({ text: "投票系統" });

  return embed;
}

// 輔助函數：建立封存頻道投票結果 Embed
function createArchiveResultEmbed(proposal, result, passed) {
  const embed = new EmbedBuilder()
    .setTitle(`${passed ? "✅ 封存通過" : "❌ 封存駁回"}：【${proposal.gameName}】`)
    .setColor(passed ? "#ff9900" : "#00ff00")
    .setDescription(`此提案已於 <t:${Math.floor(Date.now() / 1000)}:F> 結束投票`)
    .addFields(
      { name: "✋ 我還在玩", value: `${result.stillPlayingCount} 人`, inline: true },
      { name: "📦 同意封存", value: `${result.archiveOkCount} 人`, inline: true },
      {
        name: "📋 結算結果",
        value: passed
          ? `✅ **封存通過**\n活躍玩家不足 (${result.stillPlayingCount} < ${config.voting.archiveThresholds.minActivePlayers})，頻道將被封存`
          : `❌ **封存駁回**\n仍有 ${result.stillPlayingCount} 位玩家活躍，頻道將保留`,
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({ text: "投票系統" });

  return embed;
}

// 輔助函數：通知票務頻道
async function notifyTicketChannel(client, ticketChannel, proposal, passed) {
  try {
    const proposer = await client.users.fetch(proposal.proposerId).catch(() => null);
    const proposerMention = proposer ? `<@${proposal.proposerId}>` : "提案人";

    let notificationEmbed;

    if (passed) {
      notificationEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("🎉 恭喜！您的提案已通過")
        .setDescription(
          `${proposerMention}，您的提案【${proposal.gameName}】已獲得通過！\n\n` +
            `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
            `**結果：** ✅ 通過`
        );

      if (proposal.proposalType === "create") {
        const players = proposal.votes.players || [];
        if (players.length > 0) {
          const playerMentions = players.map((id) => `<@${id}>`).join(", ");
          notificationEmbed.addFields({
            name: "🔥 核心玩家名單",
            value: playerMentions,
            inline: false,
          });
        }

        notificationEmbed.addFields({
          name: "📢 下一步",
          value: "管理員將為您建立遊戲頻道。建立完成後，此票務將自動關閉。",
          inline: false,
        });
      } else {
        notificationEmbed.addFields({
          name: "📢 下一步",
          value: "管理員將進行頻道封存作業。完成後，此票務將自動關閉。",
          inline: false,
        });
      }
    } else {
      notificationEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("😔 很遺憾，您的提案未通過")
        .setDescription(
          `${proposerMention}，您的提案【${proposal.gameName}】未達到通過門檻。\n\n` +
            `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
            `**結果：** ❌ 未通過\n\n` +
            `此票務將在 5 分鐘後自動關閉。`
        );
    }

    notificationEmbed.setTimestamp();

    await ticketChannel.send({ embeds: [notificationEmbed] });

    // 如果未通過，5 分鐘後自動關閉票務
    if (!passed) {
      setTimeout(async () => {
        try {
          const channelExists = await ticketChannel.guild.channels
            .fetch(ticketChannel.id)
            .catch(() => null);
          if (channelExists) {
            const closeEmbed = new EmbedBuilder()
              .setColor("#ff0000")
              .setTitle("🔒 票務自動關閉")
              .setDescription("此票務因提案未通過而自動關閉。\n頻道將在 5 秒後刪除。")
              .setTimestamp();

            await ticketChannel.send({ embeds: [closeEmbed] });

            setTimeout(async () => {
              try {
                await ticketChannel.delete();
              } catch (error) {
                console.log(`[ERROR] 刪除票務頻道時出錯：\n${error}`.red);
              }
            }, 5000);
          }
        } catch (error) {
          console.log(`[ERROR] 自動關閉票務時出錯：\n${error}`.red);
        }
      }, 5 * 60 * 1000);
    }
  } catch (error) {
    console.log(`[ERROR] 發送通知到票務頻道時出錯：\n${error}`.red);
    throw error;
  }
}

// 輔助函數：通知結果頻道
async function notifyResultChannel(client, resultChannel, proposal) {
  try {
    const proposer = await client.users.fetch(proposal.proposerId).catch(() => null);
    const proposerTag = proposer ? proposer.tag : "未知用戶";

    const resultEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("✅ 投票通過通知")
      .setDescription(
        `**遊戲名稱：** ${proposal.gameName}\n` +
          `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}`
      );

    if (proposal.proposalType === "create") {
      const players = proposal.votes.players || [];
      const supporters = proposal.votes.supporters || [];
      const playersCount = players.length;
      const supportersCount = supporters.length;
      const totalScore =
        playersCount * config.voting.weights.players +
        supportersCount * config.voting.weights.supporters;

      resultEmbed.addFields(
        { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
        { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
        { name: "📊 總分", value: `${totalScore} 分`, inline: true }
      );

      resultEmbed.addFields({
        name: "📢 下一步",
        value: "請管理員為該遊戲建立專屬頻道。",
        inline: false,
      });
    } else {
      const stillPlayingCount = proposal.votes.stillPlaying?.length || 0;
      const archiveOkCount = proposal.votes.archiveOk?.length || 0;

      resultEmbed.addFields(
        { name: "✋ 我還在玩", value: `${stillPlayingCount} 人`, inline: true },
        { name: "📦 同意封存", value: `${archiveOkCount} 人`, inline: true },
        {
          name: "📢 下一步",
          value: "請管理員進行頻道封存作業。",
          inline: false,
        }
      );
    }

    resultEmbed.setTimestamp().setFooter({ text: `投票 ID：${proposal.voteId}` });

    await resultChannel.send({ embeds: [resultEmbed] });

    console.log(`[VOTE] 已發送通過通知到結果頻道：${resultChannel.name}`.green);
    console.log(`[VOTE] 提案人：${proposerTag} (${proposal.proposerId})`.cyan);
    console.log(`[VOTE] 遊戲名稱：${proposal.gameName}`.cyan);
  } catch (error) {
    console.log(`[ERROR] 發送通知到結果頻道時出錯：\n${error}`.red);
    throw error;
  }
}
