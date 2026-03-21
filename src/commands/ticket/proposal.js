const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config.json");
const { randomUUID } = require("crypto");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("proposal")
    .setDescription("🗳️ 管理遊戲頻道提案投票")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("發起新遊戲頻道提案投票")
        .addStringOption((option) =>
          option
            .setName("game")
            .setDescription("遊戲名稱")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("提案類型")
            .setRequired(true)
            .addChoices(
              { name: "新增頻道 (Create)", value: "create" },
              { name: "封存頻道 (Archive)", value: "archive" }
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("end")
        .setDescription("⏭️ 提早結束進行中的投票（管理員）")
        .addStringOption((option) =>
          option
            .setName("message_url")
            .setDescription("投票訊息的網址")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("🗑️ 取消進行中的投票（管理員）")
        .addStringOption((option) =>
          option
            .setName("message_url")
            .setDescription("投票訊息的網址")
            .setRequired(true)
        )
    )
    .setDMPermission(false)
    .toJSON(),

  userPermissions: [PermissionFlagsBits.Administrator],
  botPermissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],

  run: async (client, interaction) => {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "start") {
        await handleProposalStart(client, interaction);
      } else if (subcommand === "end") {
        await handleProposalEndCommand(client, interaction);
      } else if (subcommand === "cancel") {
        await handleProposalCancelCommand(client, interaction);
      }
    } catch (error) {
      console.log(`[ERROR] proposal 指令執行時出錯：\n${error}\n${error.stack}`.red);

      // 根據 interaction 狀態選擇回應方式
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ 執行指令時發生錯誤！",
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "❌ 執行指令時發生錯誤！",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};

async function handleProposalStart(client, interaction) {
  try {
    // 先 defer reply，避免超時
    await interaction.deferReply({ ephemeral: true });

    const gameName = interaction.options.getString("game");
    const proposalType = interaction.options.getString("type");

    // 使用執行指令的人作為提案人
    const proposerId = interaction.user.id;

    // 檢查投票頻道是否已設置
    const votingChannelId = config.voting.votingChannelId;
    if (!votingChannelId || votingChannelId === "YOUR_VOTING_CHANNEL_ID") {
      return interaction.editReply({
        content: "❌ 投票頻道尚未設置！請在 config.json 中設置 voting.votingChannelId。",
      });
    }

    const votingChannel = await interaction.guild.channels.fetch(votingChannelId);
    if (!votingChannel) {
      return interaction.editReply({
        content: "❌ 找不到投票頻道！請檢查配置。",
      });
    }

    // 建立投票 Embed
    const proposer = await interaction.guild.members.fetch(proposerId);
    const embedColor = proposalType === "create" ? "#00ff00" : "#ff9900";
    const embedTitle = proposalType === "create"
      ? `📊 提案：新增【${gameName}】專區`
      : `📊 提案：封存【${gameName}】專區`;

    let description = `由 ${proposer} 提出\n\n`;

    if (proposalType === "create") {
      description += "為了確保新頻道能維持活躍，我們需要統計「實際玩家」數量。\n請根據您的實際情況點擊下方按鈕：";
    } else {
      description += "如果您仍在遊玩此遊戲，請點擊下方按鈕反對封存。\n如果沒有足夠的活躍玩家，此頻道將被封存。";
    }

    const votingEmbed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle(embedTitle)
      .setDescription(description)
      .addFields(
        {
          name: "⏰ 投票時間",
          value: `${config.voting.voteDurationHours} 小時`,
          inline: true
        },
        {
          name: "📅 截止時間",
          value: `<t:${Math.floor(Date.now() / 1000) + (config.voting.voteDurationHours * 3600)}:R>`,
          inline: true
        }
      )
      .setTimestamp()
      .setFooter({ text: `提案人：${proposer.user.tag}` });

    // 生成唯一 ID（需要在建立按鈕前生成）
    const voteId = randomUUID();

    // 建立按鈕
    const buttons = new ActionRowBuilder();

    if (proposalType === "create") {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId("vote_player")
          .setLabel("我會玩")
          .setEmoji("🔥")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("vote_support")
          .setLabel("純支持")
          .setEmoji("👍")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("vote_no_interest")
          .setLabel("沒興趣")
          .setEmoji("😶")
          .setStyle(ButtonStyle.Danger)
      );
    } else {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId("vote_still_playing")
          .setLabel("我還在玩")
          .setEmoji("✋")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("vote_archive_ok")
          .setLabel("同意封存")
          .setEmoji("📦")
          .setStyle(ButtonStyle.Secondary)
      );
    }

    // 建立管理員專用按鈕
    const adminButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_end_${voteId}`)
        .setLabel("提早結束投票")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`vote_cancel_${voteId}`)
        .setLabel("取消此次投票")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger)
    );

    // 發送投票訊息
    const voteMessage = await votingChannel.send({
      embeds: [votingEmbed],
      components: [buttons, adminButtons],
    });

    // 儲存投票資料到資料庫
    const expiresAt = new Date(Date.now() + config.voting.voteDurationHours * 60 * 60 * 1000);

    const proposalData = {
      voteId,
      ticketChannelId: interaction.channel.id,
      proposerId,
      gameName,
      proposalType,
      status: "VOTING",
      messageId: voteMessage.id,
      channelId: votingChannel.id,
      guildId: interaction.guild.id,
      votes: proposalType === "create"
        ? { players: [], supporters: [], noInterest: [] }
        : { stillPlaying: [], archiveOk: [] },
      createdAt: new Date(),
      expiresAt,
    };

    await client.votingProposalsCollection.insertOne(proposalData);

    // 在票務頻道回覆
    await interaction.editReply({
      content: `✅ 投票已發起！\n\n🗳️ 投票連結：${voteMessage.url}\n⏰ 投票將在 ${config.voting.voteDurationHours} 小時後結束`,
    });

    // 在票務頻道發送通知
    const ticketEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("📢 投票已發起")
      .setDescription(
        `${proposer}，您的提案已進入投票階段！\n\n` +
        `**遊戲名稱：** ${gameName}\n` +
        `**提案類型：** ${proposalType === "create" ? "新增頻道" : "封存頻道"}\n\n` +
        `[點擊此處前往投票](${voteMessage.url})`
      )
      .setTimestamp();

    await interaction.channel.send({ embeds: [ticketEmbed] });

  } catch (error) {
    console.log(`[ERROR] 發起投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

async function handleProposalEndCommand(client, interaction) {
  try {
    // 驗證管理員權限
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ 只有管理員才能使用此功能！",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const messageUrl = interaction.options.getString("message_url");
    const messageId = extractMessageId(messageUrl);

    if (!messageId) {
      return interaction.editReply({
        content: "❌ 無效的訊息網址！請提供正確的 Discord 訊息連結。",
      });
    }

    // 查找投票
    const proposal = await client.votingProposalsCollection.findOne({
      messageId,
      status: "VOTING",
    });

    if (!proposal) {
      return interaction.editReply({
        content: "❌ 找不到進行中的投票！請確認訊息網址是否正確，或投票是否已結束。",
      });
    }

    // 提早結束投票
    await endVoteNow(client, interaction, proposal);

  } catch (error) {
    console.log(`[ERROR] 執行提早結束投票指令時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

async function handleProposalCancelCommand(client, interaction) {
  try {
    // 驗證管理員權限
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ 只有管理員才能使用此功能！",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const messageUrl = interaction.options.getString("message_url");
    const messageId = extractMessageId(messageUrl);

    if (!messageId) {
      return interaction.editReply({
        content: "❌ 無效的訊息網址！請提供正確的 Discord 訊息連結。",
      });
    }

    // 查找投票
    const proposal = await client.votingProposalsCollection.findOne({
      messageId,
      status: "VOTING",
    });

    if (!proposal) {
      return interaction.editReply({
        content: "❌ 找不到進行中的投票！請確認訊息網址是否正確，或投票是否已結束。",
      });
    }

    // 取消投票
    await cancelVoteNow(client, interaction, proposal);

  } catch (error) {
    console.log(`[ERROR] 執行取消投票指令時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

// 從 Discord 訊息 URL 中提取 messageId
function extractMessageId(url) {
  try {
    // Discord 訊息 URL 格式: https://discord.com/channels/{guildId}/{channelId}/{messageId}
    const match = url.match(/\/channels\/\d+\/\d+\/(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    return null;
  }
}

// 提早結束投票並進行結算
async function endVoteNow(client, interaction, proposal) {
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

      resultEmbed = new EmbedBuilder()
        .setTitle(`${passed ? "✅ 提案通過" : "❌ 提案未通過"}：【${proposal.gameName}】`)
        .setColor(passed ? "#00ff00" : "#ff0000")
        .setDescription(`此提案已於 <t:${Math.floor(Date.now() / 1000)}:F> 被管理員提早結束`)
        .addFields(
          { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
          { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
          { name: "😶 沒興趣", value: `${noInterestCount} 人`, inline: true },
          { name: "📊 總分", value: `${totalScore} 分`, inline: true },
          {
            name: "📋 結算結果",
            value: passed
              ? `✅ **通過！**\n總分 ${totalScore} ≥ ${config.voting.passThresholds.totalScore}，且核心玩家 ${playersCount} ≥ ${config.voting.passThresholds.minPlayers}`
              : `❌ **未通過**\n需要：總分 ≥ ${config.voting.passThresholds.totalScore} 且 核心玩家 ≥ ${config.voting.passThresholds.minPlayers}`,
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "投票系統 · 管理員提早結束" });
    } else if (proposal.proposalType === "archive") {
      const stillPlayingCount = proposal.votes.stillPlaying?.length || 0;
      const archiveOkCount = proposal.votes.archiveOk?.length || 0;

      passed = stillPlayingCount < config.voting.archiveThresholds.minActivePlayers;

      resultEmbed = new EmbedBuilder()
        .setTitle(`${passed ? "✅ 封存通過" : "❌ 封存駁回"}：【${proposal.gameName}】`)
        .setColor(passed ? "#ff9900" : "#00ff00")
        .setDescription(`此提案已於 <t:${Math.floor(Date.now() / 1000)}:F> 被管理員提早結束`)
        .addFields(
          { name: "✋ 我還在玩", value: `${stillPlayingCount} 人`, inline: true },
          { name: "📦 同意封存", value: `${archiveOkCount} 人`, inline: true },
          {
            name: "📋 結算結果",
            value: passed
              ? `✅ **封存通過**\n活躍玩家不足 (${stillPlayingCount} < ${config.voting.archiveThresholds.minActivePlayers})，頻道將被封存`
              : `❌ **封存駁回**\n仍有 ${stillPlayingCount} 位玩家活躍，頻道將保留`,
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "投票系統 · 管理員提早結束" });
    }

    // 獲取並更新投票訊息
    const votingChannel = await interaction.guild.channels.fetch(proposal.channelId);
    const voteMessage = await votingChannel.messages.fetch(proposal.messageId);

    await voteMessage.edit({
      embeds: [resultEmbed],
      components: [], // 移除所有按鈕
    });

    // 通知票務頻道
    const ticketChannel = await interaction.guild.channels
      .fetch(proposal.ticketChannelId)
      .catch(() => null);

    if (ticketChannel) {
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
              `**結果：** ✅ 通過（管理員提早結束）`
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
        }
      } else {
        notificationEmbed = new EmbedBuilder()
          .setColor("#ff0000")
          .setTitle("😔 很遺憾，您的提案未通過")
          .setDescription(
            `${proposerMention}，您的提案【${proposal.gameName}】未達到通過門檻。\n\n` +
              `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
              `**結果：** ❌ 未通過（管理員提早結束）\n\n` +
              `此票務將在 5 分鐘後自動關閉。`
          );
      }

      notificationEmbed.setTimestamp();
      await ticketChannel.send({ embeds: [notificationEmbed] });

      // 如果未通過，5 分鐘後自動關閉
      if (!passed) {
        setTimeout(async () => {
          try {
            const channelExists = await ticketChannel.guild.channels
              .fetch(ticketChannel.id)
              .catch(() => null);
            if (channelExists) {
              await ticketChannel.delete();
            }
          } catch (error) {
            console.log(`[ERROR] 自動關閉票務時出錯：\n${error}`.red);
          }
        }, 5 * 60 * 1000);
      }
    }

    // 如果通過，通知結果頻道
    if (passed) {
      const resultChannelId = "1181144417277595669";
      const resultChannel = await interaction.guild.channels
        .fetch(resultChannelId)
        .catch(() => null);

      if (resultChannel) {
        const resultNotifyEmbed = new EmbedBuilder()
          .setColor("#00ff00")
          .setTitle("✅ 投票通過通知（提早結束）")
          .setDescription(
            `**遊戲名稱：** ${proposal.gameName}\n` +
              `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
              `**操作者：** ${interaction.user.tag}`
          );

        if (proposal.proposalType === "create") {
          const players = proposal.votes.players || [];
          const supporters = proposal.votes.supporters || [];
          const playersCount = players.length;
          const supportersCount = supporters.length;
          const totalScore =
            playersCount * config.voting.weights.players +
            supportersCount * config.voting.weights.supporters;

          resultNotifyEmbed.addFields(
            { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
            { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
            { name: "📊 總分", value: `${totalScore} 分`, inline: true }
          );
        }

        resultNotifyEmbed.addFields({
          name: "📢 下一步",
          value: proposal.proposalType === "create" ? "請管理員為該遊戲建立專屬頻道。" : "請管理員進行頻道封存作業。",
          inline: false,
        });

        resultNotifyEmbed.setTimestamp().setFooter({ text: `投票 ID：${proposal.voteId}` });

        await resultChannel.send({ embeds: [resultNotifyEmbed] });
      }
    }

    // 更新資料庫
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
      content: `✅ 投票已提早結束！\n**遊戲名稱：** ${proposal.gameName}\n**結果：** ${passed ? "✅ 通過" : "❌ 未通過"}`,
    });

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 被 ${interaction.user.tag} 透過指令提早結束：${passed ? "通過 ✅" : "未通過 ❌"}`
        .cyan
    );
  } catch (error) {
    console.log(`[ERROR] 提早結束投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}

// 取消投票
async function cancelVoteNow(client, interaction, proposal) {
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

    // 獲取並更新投票訊息
    const votingChannel = await interaction.guild.channels.fetch(proposal.channelId);
    const voteMessage = await votingChannel.messages.fetch(proposal.messageId);

    await voteMessage.edit({
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
            await ticketChannel.delete();
          }
        } catch (error) {
          console.log(`[ERROR] 自動關閉票務時出錯：\n${error}`.red);
        }
      }, 5 * 60 * 1000);
    }

    // 更新資料庫
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
      content: `✅ 投票已取消！\n**遊戲名稱：** ${proposal.gameName}`,
    });

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 被 ${interaction.user.tag} 透過指令取消`.yellow
    );
  } catch (error) {
    console.log(`[ERROR] 取消投票時出錯：\n${error}\n${error.stack}`.red);
    throw error;
  }
}
