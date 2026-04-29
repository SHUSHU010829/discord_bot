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
    // 獲取模板配置
    const template = config.voting.templates[proposal.templateKey];
    if (!template) {
      console.log(`[ERROR] 找不到模板：${proposal.templateKey}`.red);
      return;
    }

    // 獲取 guild 和頻道
    const guild = await client.guilds.fetch(proposal.guildId);
    if (!guild) {
      console.log(`[ERROR] 找不到 guild ${proposal.guildId}`.red);
      return;
    }

    const votingChannel = await guild.channels.fetch(proposal.channelId);
    const ticketChannel = proposal.ticketChannelId ?
      await guild.channels.fetch(proposal.ticketChannelId).catch(() => null) : null;

    // 計算投票結果
    const result = calculateVoteResult(proposal, template);
    const passed = result.passed;
    const resultEmbed = createResultEmbed(proposal, template, result, passed);

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
        await notifyTicketChannel(client, ticketChannel, proposal, template, result, passed);
      } catch (error) {
        console.log(`[ERROR] 通知票務頻道時出錯：\n${error}`.red);
      }
    }

    // 更新提案狀態
    await client.votingProposalsCollection.updateOne(
      { _id: proposal._id },
      {
        $set: {
          status: passed ? "PASSED" : "FAILED",
          finalizedAt: new Date(),
          finalResult: result
        }
      }
    );

    console.log(
      `[VOTE] 投票 ${proposal.voteId} 已結算：${passed ? "通過 ✅" : "未通過 ❌"}`.cyan
    );

  } catch (error) {
    console.log(`[ERROR] 結算投票時出錯：\n${error}`.red);
    throw error;
  }
}

function calculateVoteResult(proposal, template) {
  const passCondition = template.passCondition;
  const voteCounts = {};
  let totalScore = 0;
  let totalVotes = 0;

  // 統計各選項的票數
  for (const btn of template.buttons) {
    const count = proposal.votes[btn.id]?.length || 0;
    voteCounts[btn.id] = count;
    totalScore += count * btn.weight;
    totalVotes += count;
  }

  let passed = false;
  let reason = "";

  switch (passCondition.type) {
    case "weighted":
      // 權重投票：總分 + 高意願人數
      const highInterestBtn = template.buttons.find(btn => btn.weight === Math.max(...template.buttons.map(b => b.weight)));
      const highInterestCount = highInterestBtn ? voteCounts[highInterestBtn.id] : 0;

      passed = totalScore >= passCondition.minTotalScore &&
               highInterestCount >= passCondition.minHighInterest;

      reason = passed
        ? `總分 ${totalScore} ≥ ${passCondition.minTotalScore}，且高意願 ${highInterestCount} ≥ ${passCondition.minHighInterest}`
        : `需要：總分 ≥ ${passCondition.minTotalScore} 且 高意願 ≥ ${passCondition.minHighInterest}`;
      break;

    case "reverse":
      // 反向邏輯：活躍人數少於門檻則通過
      const stillActiveBtn = template.buttons[0];
      const stillActiveCount = voteCounts[stillActiveBtn.id] || 0;

      passed = stillActiveCount <= passCondition.maxStillActive;
      reason = passed
        ? `活躍人數 ${stillActiveCount} ≤ ${passCondition.maxStillActive}，頻道將被封存`
        : `仍有 ${stillActiveCount} 位玩家活躍，頻道將保留`;
      break;

    case "majority":
      // 簡單多數決：贊成票 > 反對票
      const approveBtn = template.buttons.find(btn => btn.id === "approve");
      const rejectBtn = template.buttons.find(btn => btn.id === "reject");
      const approveCount = approveBtn ? voteCounts[approveBtn.id] : 0;
      const rejectCount = rejectBtn ? voteCounts[rejectBtn.id] : 0;

      passed = totalVotes >= passCondition.minTotalVotes &&
               approveCount > rejectCount;

      reason = passed
        ? `總票數 ${totalVotes} ≥ ${passCondition.minTotalVotes}，且贊成 ${approveCount} > 反對 ${rejectCount}`
        : `需要：總票數 ≥ ${passCondition.minTotalVotes} 且 贊成 > 反對`;
      break;

    case "simple":
      // 簡單支持票
      const supportBtn = template.buttons.find(btn => btn.id === "support");
      const supportCount = supportBtn ? voteCounts[supportBtn.id] : 0;

      passed = supportCount >= passCondition.minSupport;
      reason = passed
        ? `支持票 ${supportCount} ≥ ${passCondition.minSupport}`
        : `需要：支持票 ≥ ${passCondition.minSupport}`;
      break;
  }

  return {
    passed,
    reason,
    voteCounts,
    totalScore,
    totalVotes
  };
}

function createResultEmbed(proposal, template, result, passed) {
  const embed = new EmbedBuilder()
    .setTitle(`${passed ? "✅ 提案通過" : "❌ 提案未通過"}：${proposal.title}`)
    .setColor(passed ? "#00ff00" : "#ff0000")
    .setDescription(`此提案已於 <t:${Math.floor(Date.now() / 1000)}:F> 結束投票`)
    .addFields({
      name: "📋 投票類型",
      value: template.name,
      inline: true
    });

  // 添加各選項的票數
  for (const btn of template.buttons) {
    embed.addFields({
      name: `${btn.emoji} ${btn.label}`,
      value: `${result.voteCounts[btn.id] || 0} 人`,
      inline: true
    });
  }

  // 添加總計（如果有）
  if (result.totalScore > 0) {
    embed.addFields({
      name: "📊 總分",
      value: `${result.totalScore} 分`,
      inline: true
    });
  }

  // 添加結算結果
  embed.addFields({
    name: "📋 結算結果",
    value: passed ? `✅ **通過！**\n${result.reason}` : `❌ **未通過**\n${result.reason}`,
    inline: false
  });

  embed.setTimestamp().setFooter({ text: "投票系統" });

  return embed;
}

async function notifyTicketChannel(client, ticketChannel, proposal, template, result, passed) {
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
          `${proposerMention}，您的提案【${proposal.title}】已獲得通過！\n\n` +
          `**投票類型：** ${template.name}\n` +
          `**結果：** ✅ 通過\n` +
          `**原因：** ${result.reason}`
        );

      // 如果是權重投票，列出高意願者
      const highInterestBtn = template.buttons.find(btn => btn.weight === Math.max(...template.buttons.map(b => b.weight)));
      if (highInterestBtn && proposal.votes[highInterestBtn.id]?.length > 0) {
        const participantMentions = proposal.votes[highInterestBtn.id].map(id => `<@${id}>`).join(", ");
        notificationEmbed.addFields({
          name: `${highInterestBtn.emoji} ${highInterestBtn.label}名單`,
          value: participantMentions,
          inline: false
        });
      }

      notificationEmbed.addFields({
        name: "📢 下一步",
        value: "管理員將根據提案類型進行後續處理。",
        inline: false
      });
    } else {
      // 投票未通過
      notificationEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("😔 很遺憾，您的提案未通過")
        .setDescription(
          `${proposerMention}，您的提案【${proposal.title}】未達到通過門檻。\n\n` +
          `**投票類型：** ${template.name}\n` +
          `**結果：** ❌ 未通過\n` +
          `**原因：** ${result.reason}\n\n` +
          `此票務將在 5 分鐘後自動關閉。`
        );
    }

    notificationEmbed.setTimestamp();

    await ticketChannel.send({ embeds: [notificationEmbed] });

    // 如果未通過，5 分鐘後自動關閉票務
    if (!passed) {
      setTimeout(async () => {
        try {
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
      }, 5 * 60 * 1000);
    }

  } catch (error) {
    console.log(`[ERROR] 發送通知到票務頻道時出錯：\n${error}`.red);
    throw error;
  }
}
