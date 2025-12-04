require("colors");
const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// 票務面板數據文件路徑
const PANELS_FILE = path.join(__dirname, "../../data/ticket-panels.json");

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

module.exports = async (client, interaction) => {
  try {
    if (!interaction.isButton()) return;

    // 處理票務按鈕
    if (interaction.customId === "create_ticket") {
      await handleTicketCreation(client, interaction);
      return;
    }

    // 處理投票按鈕
    const voteButtons = [
      "vote_player",
      "vote_support",
      "vote_no_interest",
      "vote_still_playing",
      "vote_archive_ok"
    ];

    if (voteButtons.includes(interaction.customId)) {
      await handleVoteButton(client, interaction);
      return;
    }

    // 處理身份組按鈕
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
    const ticketConfig = panelConfig ? {
      categoryId: panelConfig.categoryId,
      supportRoleId: panelConfig.supportRoleId,
      ticketNameFormat: config.ticket.ticketNameFormat,
      welcomeMessage: config.ticket.welcomeMessage,
      alreadyHasTicket: config.ticket.alreadyHasTicket,
      ticketCreating: config.ticket.ticketCreating,
      ticketCreated: config.ticket.ticketCreated,
    } : config.ticket;

    // 檢查用戶是否已經有票務
    const existingTicket = interaction.guild.channels.cache.find(
      (channel) =>
        channel.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        channel.type === ChannelType.GuildText
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
    if (ticketConfig.categoryId && ticketConfig.categoryId !== "YOUR_CATEGORY_ID") {
      const category = interaction.guild.channels.cache.get(ticketConfig.categoryId);
      if (category && category.type === ChannelType.GuildCategory) {
        parentCategory = ticketConfig.categoryId;
      } else {
        console.log(`[WARNING] 票務類別 ID ${ticketConfig.categoryId} 無效或不存在，將在沒有類別的情況下創建頻道`.yellow);
      }
    }

    // 創建票務頻道
    const ticketChannel = await interaction.guild.channels.create({
      name: ticketConfig.ticketNameFormat.replace(
        "{username}",
        interaction.user.username.toLowerCase()
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
    if (ticketConfig.supportRoleId && ticketConfig.supportRoleId !== "YOUR_SUPPORT_ROLE_ID") {
      const supportRole = interaction.guild.roles.cache.get(ticketConfig.supportRoleId);
      if (supportRole) {
        await ticketChannel.permissionOverwrites.create(
          ticketConfig.supportRoleId,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          }
        );
      } else {
        console.log(`[WARNING] 支援團隊身份組 ID ${ticketConfig.supportRoleId} 無效或不存在`.yellow);
      }
    }

    // 發送歡迎訊息
    const welcomeEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎫 票務已創建")
      .setDescription(
        ticketConfig.welcomeMessage.replace("{user}", interaction.user.toString())
      )
      .setTimestamp();

    await ticketChannel.send({
      content: `${interaction.user}`,
      embeds: [welcomeEmbed],
    });

    await interaction.editReply({
      content: ticketConfig.ticketCreated.replace(
        "{channel}",
        ticketChannel.toString()
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
      await handleArchiveVote(client, interaction, proposal, userId, buttonType);
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

async function handleCreateVote(client, interaction, proposal, userId, buttonType) {
  // 根據按鈕類型決定要添加的欄位
  let targetField = "";
  let voteTypeText = "";
  let voteEmoji = "";

  switch (buttonType) {
    case "vote_player":
      targetField = "votes.players";
      voteTypeText = "核心玩家 (🔥 我會玩)";
      voteEmoji = "🔥";
      break;
    case "vote_support":
      targetField = "votes.supporters";
      voteTypeText = "純支持 (👍 純支持)";
      voteEmoji = "👍";
      break;
    case "vote_no_interest":
      targetField = "votes.noInterest";
      voteTypeText = "沒興趣 (😶 沒興趣)";
      voteEmoji = "😶";
      break;
  }

  // 步驟 1：先從所有類別中移除用戶（互斥邏輯）
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    {
      $pull: {
        "votes.players": userId,
        "votes.supporters": userId,
        "votes.noInterest": userId,
      }
    }
  );

  // 步驟 2：將用戶添加到目標類別
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    {
      $addToSet: { [targetField]: userId }
    }
  );

  // 回覆用戶
  await interaction.reply({
    content: `${voteEmoji} 已將您的票更改為【${voteTypeText}】`,
    ephemeral: true,
  });

  // 更新投票訊息顯示當前票數
  await updateVoteMessage(client, interaction, proposal);
}

async function handleArchiveVote(client, interaction, proposal, userId, buttonType) {
  // 根據按鈕類型決定要添加的欄位
  let targetField = "";
  let voteTypeText = "";
  let voteEmoji = "";

  switch (buttonType) {
    case "vote_still_playing":
      targetField = "votes.stillPlaying";
      voteTypeText = "我還在玩 (✋ 反對封存)";
      voteEmoji = "✋";
      break;
    case "vote_archive_ok":
      targetField = "votes.archiveOk";
      voteTypeText = "同意封存 (📦 同意封存)";
      voteEmoji = "📦";
      break;
  }

  // 步驟 1：先從所有類別中移除用戶（互斥邏輯）
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    {
      $pull: {
        "votes.stillPlaying": userId,
        "votes.archiveOk": userId,
      }
    }
  );

  // 步驟 2：將用戶添加到目標類別
  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    {
      $addToSet: { [targetField]: userId }
    }
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
      _id: proposal._id
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
      const totalScore = (playersCount * config.voting.weights.players) +
                        (supportersCount * config.voting.weights.supporters);

      updatedEmbed.addFields(
        { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
        { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
        { name: "😶 沒興趣", value: `${noInterestCount} 人`, inline: true },
        { name: "📊 總分", value: `${totalScore} 分`, inline: true },
        {
          name: "✅ 通過門檻",
          value: `總分 ≥ ${config.voting.passThresholds.totalScore} 且 核心玩家 ≥ ${config.voting.passThresholds.minPlayers}`,
          inline: false
        }
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
          inline: false
        }
      );
    }

    await interaction.message.edit({ embeds: [updatedEmbed] });

  } catch (error) {
    console.log(`[ERROR] 更新投票訊息時出錯：\n${error}`.red);
  }
}
