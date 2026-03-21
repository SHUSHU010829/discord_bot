require("colors");
const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const config = require("../../config.json");

module.exports = async (client) => {
  // 每 5 分鐘檢查一次過期的投票
  cron.schedule("*/5 * * * *", async () => {
    try {
      await processExpiredVotes(client);
    } catch (error) {
      console.log(`[ERROR] 處理過期投票時出錯：\n${error}`.red);
    }
  });

  console.log(`[SYSTEM] 投票自動結算系統已啟動！`.green);
};

async function processExpiredVotes(client) {
  try {
    // 檢查資料庫集合是否已初始化
    if (!client.votingProposalsCollection) {
      console.log(`[WARNING] 投票系統暫時無法使用：資料庫連接未建立`.yellow);
      return;
    }

    // 查找所有過期且狀態為 VOTING 的提案
    const expiredProposals = await client.votingProposalsCollection.find({
      status: "VOTING",
      expiresAt: { $lte: new Date() }
    }).toArray();

    if (expiredProposals.length === 0) return;

    console.log(`[VOTE] 發現 ${expiredProposals.length} 個過期的投票，開始處理...`.yellow);

    for (const proposal of expiredProposals) {
      try {
        await finalizeVote(client, proposal);
      } catch (error) {
        console.log(`[ERROR] 處理投票 ${proposal.voteId} 時出錯：\n${error}`.red);
      }
    }

  } catch (error) {
    console.log(`[ERROR] 查詢過期投票時出錯：\n${error}`.red);
  }
}

async function finalizeVote(client, proposal) {
  try {
    // 獲取 guild 和頻道
    const guild = await client.guilds.fetch(proposal.guildId);
    if (!guild) {
      console.log(`[ERROR] 找不到 guild ${proposal.guildId}`.red);
      return;
    }

    const votingChannel = await guild.channels.fetch(proposal.channelId);
    const ticketChannel = await guild.channels.fetch(proposal.ticketChannelId).catch(() => null);

    // 計算投票結果
    let passed = false;
    let resultEmbed;

    if (proposal.proposalType === "create") {
      const result = calculateCreateVoteResult(proposal);
      passed = result.passed;
      resultEmbed = createResultEmbed(proposal, result, passed);
    } else if (proposal.proposalType === "archive") {
      const result = calculateArchiveVoteResult(proposal);
      passed = result.passed;
      resultEmbed = createArchiveResultEmbed(proposal, result, passed);
    }

    // 更新投票訊息
    if (votingChannel) {
      try {
        const voteMessage = await votingChannel.messages.fetch(proposal.messageId);
        await voteMessage.edit({
          embeds: [resultEmbed],
          components: [] // 移除按鈕
        });
      } catch (error) {
        console.log(`[ERROR] 更新投票訊息時出錯：\n${error}`.red);
      }
    }

    // 通知票務頻道
    if (ticketChannel) {
      try {
        await notifyTicketChannel(client, ticketChannel, proposal, passed);
      } catch (error) {
        console.log(`[ERROR] 通知票務頻道時出錯：\n${error}`.red);
      }
    }

    // 如果投票通過，發送通知到指定頻道
    if (passed) {
      try {
        const resultChannelId = "1181144417277595669";
        const resultChannel = await guild.channels.fetch(resultChannelId).catch(() => null);

        if (resultChannel) {
          await notifyResultChannel(client, resultChannel, proposal);
        } else {
          console.log(`[WARNING] 找不到結果通知頻道 ${resultChannelId}`.yellow);
        }
      } catch (error) {
        console.log(`[ERROR] 發送結果通知時出錯：\n${error}`.red);
      }
    }

    // 更新提案狀態
    if (client.votingProposalsCollection) {
      await client.votingProposalsCollection.updateOne(
        { _id: proposal._id },
        {
          $set: {
            status: passed ? "PASSED" : "FAILED",
            finalizedAt: new Date()
          }
        }
      );
    }

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 已結算：${passed ? "通過 ✅" : "未通過 ❌"}`.cyan
    );

  } catch (error) {
    console.log(`[ERROR] 結算投票時出錯：\n${error}`.red);
    throw error;
  }
}

function calculateCreateVoteResult(proposal) {
  const playersCount = proposal.votes.players?.length || 0;
  const supportersCount = proposal.votes.supporters?.length || 0;
  const noInterestCount = proposal.votes.noInterest?.length || 0;

  const totalScore = (playersCount * config.voting.weights.players) +
                    (supportersCount * config.voting.weights.supporters);

  const passed = totalScore >= config.voting.passThresholds.totalScore &&
                playersCount >= config.voting.passThresholds.minPlayers;

  return {
    playersCount,
    supportersCount,
    noInterestCount,
    totalScore,
    passed
  };
}

function calculateArchiveVoteResult(proposal) {
  const stillPlayingCount = proposal.votes.stillPlaying?.length || 0;
  const archiveOkCount = proposal.votes.archiveOk?.length || 0;

  // 如果還有人在玩（>= minActivePlayers），則封存提案失敗
  const passed = stillPlayingCount < config.voting.archiveThresholds.minActivePlayers;

  return {
    stillPlayingCount,
    archiveOkCount,
    passed
  };
}

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
        inline: false
      }
    )
    .setTimestamp()
    .setFooter({ text: "投票系統" });

  return embed;
}

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
        inline: false
      }
    )
    .setTimestamp()
    .setFooter({ text: "投票系統" });

  return embed;
}

async function notifyTicketChannel(client, ticketChannel, proposal, passed) {
  try {
    const proposer = await client.users.fetch(proposal.proposerId).catch(() => null);
    const proposerMention = proposer ? `<@${proposal.proposerId}>` : "提案人";

    let notificationEmbed;

    if (passed) {
      // 投票通過
      notificationEmbed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle("🎉 恭喜！您的提案已通過")
        .setDescription(
          `${proposerMention}，您的提案【${proposal.gameName}】已獲得通過！\n\n` +
          `**提案類型：** ${proposal.proposalType === "create" ? "新增頻道" : "封存頻道"}\n` +
          `**結果：** ✅ 通過`
        );

      if (proposal.proposalType === "create") {
        // 獲取投了「我會玩」的玩家列表
        const players = proposal.votes.players || [];
        if (players.length > 0) {
          const playerMentions = players.map(id => `<@${id}>`).join(", ");
          notificationEmbed.addFields({
            name: "🔥 核心玩家名單",
            value: playerMentions,
            inline: false
          });
        }

        notificationEmbed.addFields({
          name: "📢 下一步",
          value: "管理員將為您建立遊戲頻道。建立完成後，此票務將自動關閉。",
          inline: false
        });
      } else {
        notificationEmbed.addFields({
          name: "📢 下一步",
          value: "管理員將進行頻道封存作業。完成後，此票務將自動關閉。",
          inline: false
        });
      }
    } else {
      // 投票未通過
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
          // 再次檢查頻道是否存在
          const channelExists = await ticketChannel.guild.channels.fetch(ticketChannel.id).catch(() => null);
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
      }, 5 * 60 * 1000); // 5 分鐘
    }

  } catch (error) {
    console.log(`[ERROR] 發送通知到票務頻道時出錯：\n${error}`.red);
    throw error;
  }
}

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
      // 獲取投了「我會玩」的玩家列表
      const players = proposal.votes.players || [];
      const supporters = proposal.votes.supporters || [];
      const playersCount = players.length;
      const supportersCount = supporters.length;
      const totalScore = (playersCount * config.voting.weights.players) +
                        (supportersCount * config.voting.weights.supporters);

      resultEmbed.addFields(
        { name: "🔥 核心玩家", value: `${playersCount} 人`, inline: true },
        { name: "👍 純支持", value: `${supportersCount} 人`, inline: true },
        { name: "📊 總分", value: `${totalScore} 分`, inline: true }
      );

      resultEmbed.addFields({
        name: "📢 下一步",
        value: "請管理員為該遊戲建立專屬頻道。",
        inline: false
      });

      // 後台 log 核心玩家名單
      if (players.length > 0) {
        const playerTags = await Promise.all(
          players.map(async (id) => {
            const user = await client.users.fetch(id).catch(() => null);
            return user ? user.tag : id;
          })
        );
        console.log(`[VOTE] 核心玩家名單：${playerTags.join(", ")}`.cyan);
      }
    } else {
      const stillPlayingCount = proposal.votes.stillPlaying?.length || 0;
      const archiveOkCount = proposal.votes.archiveOk?.length || 0;

      resultEmbed.addFields(
        { name: "✋ 我還在玩", value: `${stillPlayingCount} 人`, inline: true },
        { name: "📦 同意封存", value: `${archiveOkCount} 人`, inline: true },
        {
          name: "📢 下一步",
          value: "請管理員進行頻道封存作業。",
          inline: false
        }
      );
    }

    resultEmbed.setTimestamp().setFooter({ text: `投票 ID：${proposal.voteId}` });

    await resultChannel.send({ embeds: [resultEmbed] });

    // 後台 log 提案人和詳細資訊
    console.log(`[VOTE] 已發送通過通知到結果頻道：${resultChannel.name}`.green);
    console.log(`[VOTE] 提案人：${proposerTag} (${proposal.proposerId})`.cyan);
    console.log(`[VOTE] 遊戲名稱：${proposal.gameName}`.cyan);

  } catch (error) {
    console.log(`[ERROR] 發送通知到結果頻道時出錯：\n${error}`.red);
    throw error;
  }
}
