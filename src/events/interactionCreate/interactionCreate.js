require("colors");
const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js");
const config = require("../../config.json");
const fs = require("fs");
const { getDataFile } = require("../../utils/dataPaths");

// 票務面板數據文件路徑
const PANELS_FILE = getDataFile("ticket-panels.json");

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

    // 處理投票按鈕（新格式：vote_{template}_{button}）
    if (interaction.customId.startsWith("vote_")) {
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
    const customId = interaction.customId;

    // 解析按鈕 ID：vote_{template}_{button}
    const parts = customId.split("_");
    if (parts.length < 3) {
      return interaction.reply({
        content: "❌ 無效的按鈕 ID！",
        ephemeral: true,
      });
    }

    const templateKey = parts[1];
    const buttonId = parts.slice(2).join("_");

    // 獲取模板配置
    const template = config.voting.templates[templateKey];
    if (!template) {
      return interaction.reply({
        content: "❌ 找不到對應的投票模板！",
        ephemeral: true,
      });
    }

    // 找到對應的按鈕配置
    const buttonConfig = template.buttons.find(btn => btn.id === buttonId);
    if (!buttonConfig) {
      return interaction.reply({
        content: "❌ 找不到對應的按鈕配置！",
        ephemeral: true,
      });
    }

    // 步驟 1：從所有按鈕類別中移除用戶（互斥邏輯）
    const pullUpdate = {};
    for (const btn of template.buttons) {
      pullUpdate[`votes.${btn.id}`] = userId;
    }

    await client.votingProposalsCollection.updateOne(
      { _id: proposal._id },
      { $pull: pullUpdate }
    );

    // 步驟 2：將用戶添加到目標類別
    await client.votingProposalsCollection.updateOne(
      { _id: proposal._id },
      { $addToSet: { [`votes.${buttonId}`]: userId } }
    );

    // 回覆用戶
    await interaction.reply({
      content: `${buttonConfig.emoji} 已將您的票更改為【${buttonConfig.label}】`,
      ephemeral: true,
    });

    // 更新投票訊息顯示當前票數
    await updateVoteMessage(client, interaction, proposal);

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

async function updateVoteMessage(client, interaction, proposal) {
  try {
    // 重新獲取最新的投票數據
    const updatedProposal = await client.votingProposalsCollection.findOne({
      _id: proposal._id
    });

    if (!updatedProposal) return;

    // 獲取模板配置
    const template = config.voting.templates[updatedProposal.templateKey];
    if (!template) {
      console.log(`[ERROR] 找不到模板：${updatedProposal.templateKey}`.red);
      return;
    }

    const originalEmbed = interaction.message.embeds[0];
    const { EmbedBuilder } = require("discord.js");

    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    // 清除舊的投票統計欄位（保留前3個：類型、時間、截止）
    updatedEmbed.spliceFields(3, updatedEmbed.data.fields?.length - 3 || 0);

    // 添加新的投票統計
    const voteCounts = {};
    let totalScore = 0;

    for (const btn of template.buttons) {
      const count = updatedProposal.votes[btn.id]?.length || 0;
      voteCounts[btn.id] = count;
      totalScore += count * btn.weight;

      updatedEmbed.addFields({
        name: `${btn.emoji} ${btn.label}`,
        value: `${count} 人`,
        inline: true
      });
    }

    // 根據通過條件類型添加門檻說明
    const passCondition = template.passCondition;
    let thresholdText = "";

    switch (passCondition.type) {
      case "weighted":
        updatedEmbed.addFields({
          name: "📊 總分",
          value: `${totalScore} 分`,
          inline: true
        });
        thresholdText = `總分 ≥ ${passCondition.minTotalScore} 且 高意願 ≥ ${passCondition.minHighInterest} 人`;
        break;

      case "reverse":
        thresholdText = `如果活躍人數 < ${passCondition.maxStillActive + 1} 人，則通過`;
        break;

      case "majority":
        const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);
        updatedEmbed.addFields({
          name: "📊 總投票數",
          value: `${totalVotes} 票`,
          inline: true
        });
        thresholdText = `總票數 ≥ ${passCondition.minTotalVotes} 且 贊成票 > 反對票`;
        break;

      case "simple":
        thresholdText = `支持票 ≥ ${passCondition.minSupport} 票`;
        break;
    }

    if (thresholdText) {
      updatedEmbed.addFields({
        name: "✅ 通過門檻",
        value: thresholdText,
        inline: false
      });
    }

    await interaction.message.edit({ embeds: [updatedEmbed] });

  } catch (error) {
    console.log(`[ERROR] 更新投票訊息時出錯：\n${error}`.red);
  }
}
