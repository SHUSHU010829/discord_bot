require("colors");
const { EmbedBuilder } = require("discord.js");
const config = require("../../config");
const {
  calculateVoteResult,
  createResultEmbed,
} = require("./calculateResult");

const TICKET_AUTOCLOSE_MS = 5 * 60 * 1000;
const RESULT_CHANNEL_ID = "1181144417277595669";

// 統一的投票結算入口：給定 proposal 和原因，更新訊息、通知 ticket、寫 DB、排程關 ticket。
// reason: "expired" | "manual_end" | "cancelled"
async function finalizeProposal(client, proposal, opts = {}) {
  const reason = opts.reason || "expired";
  const endedBy = opts.endedBy || null;

  const template = config.voting.templates[proposal.templateKey];
  if (!template) {
    console.log(
      `[ERROR] finalizeProposal 找不到模板：${proposal.templateKey}（voteId=${proposal.voteId}）`
        .red,
    );
    return null;
  }

  const guild = await client.guilds.fetch(proposal.guildId).catch(() => null);
  if (!guild) {
    console.log(`[ERROR] 找不到 guild ${proposal.guildId}`.red);
    return null;
  }

  const result =
    reason === "cancelled"
      ? { passed: false, reason: "已取消", voteCounts: {}, totalScore: 0, totalVotes: 0 }
      : calculateVoteResult(proposal, template);

  const passed = reason === "cancelled" ? false : result.passed;
  const resultEmbed = createResultEmbed(proposal, template, result, { reason });

  // 更新投票訊息
  const votingChannel = await guild.channels
    .fetch(proposal.channelId)
    .catch(() => null);
  if (votingChannel) {
    try {
      const voteMessage = await votingChannel.messages.fetch(proposal.messageId);
      await voteMessage.edit({ embeds: [resultEmbed], components: [] });
    } catch (error) {
      console.log(`[ERROR] 更新投票訊息時出錯：\n${error}`.red);
    }
  }

  // 通知票務頻道
  const ticketChannel = proposal.ticketChannelId
    ? await guild.channels
        .fetch(proposal.ticketChannelId)
        .catch(() => null)
    : null;

  if (ticketChannel) {
    try {
      await notifyTicketChannel(client, ticketChannel, proposal, template, result, {
        reason,
        passed,
      });

      // 未通過或被取消 → 5 分鐘後自動關閉
      if (!passed) {
        scheduleTicketClose(ticketChannel);
      }
    } catch (error) {
      console.log(`[ERROR] 通知票務頻道時出錯：\n${error}`.red);
    }
  }

  // 通過時通知結果頻道（保留原 proposal.js 行為）
  if (reason !== "cancelled" && passed) {
    try {
      await notifyResultChannel(guild, proposal, template, result, { reason, endedBy, client });
    } catch (error) {
      console.log(`[ERROR] 通知結果頻道時出錯：\n${error}`.red);
    }
  }

  // 更新資料庫
  const update = {
    finalizedAt: new Date(),
    finalResult: result,
  };
  if (reason === "cancelled") {
    update.status = "CANCELLED";
    update.cancelledAt = new Date();
    if (endedBy) update.cancelledBy = endedBy;
  } else {
    update.status = passed ? "PASSED" : "FAILED";
    if (reason === "manual_end") {
      update.endedEarly = true;
      if (endedBy) update.endedBy = endedBy;
    }
  }

  await client.votingProposalsCollection.updateOne(
    { _id: proposal._id },
    { $set: update },
  );

  console.log(
    `[VOTE] 投票 ${proposal.voteId} 已結算（${reason}）：${
      reason === "cancelled" ? "取消" : passed ? "通過 ✅" : "未通過 ❌"
    }`.cyan,
  );

  return { passed, result };
}

async function notifyTicketChannel(client, ticketChannel, proposal, template, result, opts) {
  const { reason, passed } = opts;
  const proposer = await client.users.fetch(proposal.proposerId).catch(() => null);
  const proposerMention = proposer ? `<@${proposal.proposerId}>` : "提案人";
  const title = proposal.title || proposal.gameName || "提案";

  let notificationEmbed;

  if (reason === "cancelled") {
    notificationEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🗑️ 投票已被取消")
      .setDescription(
        `${proposerMention}，您的提案【${title}】投票已被管理員取消。\n\n` +
          `**投票類型：** ${template.name}\n` +
          `**取消原因：** 管理員手動取消\n\n` +
          `此票務將在 5 分鐘後自動關閉。`,
      );
  } else if (passed) {
    const suffix = reason === "manual_end" ? "（管理員提早結束）" : "";
    notificationEmbed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle("🎉 恭喜！您的提案已通過")
      .setDescription(
        `${proposerMention}，您的提案【${title}】已獲得通過！\n\n` +
          `**投票類型：** ${template.name}\n` +
          `**結果：** ✅ 通過${suffix}\n` +
          `**原因：** ${result.reason}`,
      );

    const maxWeight = Math.max(...template.buttons.map((b) => b.weight || 0));
    const highInterestBtn = template.buttons.find(
      (btn) => (btn.weight || 0) === maxWeight,
    );
    if (
      highInterestBtn &&
      proposal.votes?.[highInterestBtn.id]?.length > 0
    ) {
      const participantMentions = proposal.votes[highInterestBtn.id]
        .map((id) => `<@${id}>`)
        .join(", ");
      notificationEmbed.addFields({
        name: `${highInterestBtn.emoji} ${highInterestBtn.label}名單`,
        value: participantMentions,
        inline: false,
      });
    }

    notificationEmbed.addFields({
      name: "📢 下一步",
      value: "管理員將根據提案類型進行後續處理。",
      inline: false,
    });
  } else {
    const suffix = reason === "manual_end" ? "（管理員提早結束）" : "";
    notificationEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("😔 很遺憾，您的提案未通過")
      .setDescription(
        `${proposerMention}，您的提案【${title}】未達到通過門檻。\n\n` +
          `**投票類型：** ${template.name}\n` +
          `**結果：** ❌ 未通過${suffix}\n` +
          `**原因：** ${result.reason}\n\n` +
          `此票務將在 5 分鐘後自動關閉。`,
      );
  }

  notificationEmbed.setTimestamp();
  await ticketChannel.send({ embeds: [notificationEmbed] });
}

function scheduleTicketClose(ticketChannel) {
  const t = setTimeout(async () => {
    try {
      const channelExists = await ticketChannel.guild.channels
        .fetch(ticketChannel.id)
        .catch(() => null);
      if (!channelExists) return;

      const closeEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("🔒 票務自動關閉")
        .setDescription("此票務因提案結束而自動關閉。\n頻道將在 5 秒後刪除。")
        .setTimestamp();

      await ticketChannel.send({ embeds: [closeEmbed] }).catch(() => null);

      const t2 = setTimeout(async () => {
        try {
          await ticketChannel.delete();
        } catch (error) {
          console.log(`[ERROR] 刪除票務頻道時出錯：\n${error}`.red);
        }
      }, 5000);
      t2.unref?.();
    } catch (error) {
      console.log(`[ERROR] 自動關閉票務時出錯：\n${error}`.red);
    }
  }, TICKET_AUTOCLOSE_MS);
  t.unref?.();
}

async function notifyResultChannel(guild, proposal, template, result, opts) {
  const { reason, endedBy, client } = opts;
  const resultChannel = await guild.channels
    .fetch(RESULT_CHANNEL_ID)
    .catch(() => null);
  if (!resultChannel) return;

  const title = proposal.title || proposal.gameName || "提案";
  const titlePrefix =
    reason === "manual_end" ? "✅ 投票通過通知（提早結束）" : "✅ 投票通過通知";

  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(titlePrefix)
    .setDescription(
      `**提案標題：** ${title}\n` +
        `**投票類型：** ${template.name}` +
        (endedBy ? `\n**操作者：** <@${endedBy}>` : ""),
    );

  for (const btn of template.buttons) {
    embed.addFields({
      name: `${btn.emoji} ${btn.label}`,
      value: `${result.voteCounts[btn.id] || 0} 人`,
      inline: true,
    });
  }

  if (result.totalScore > 0) {
    embed.addFields({
      name: "📊 總分",
      value: `${result.totalScore} 分`,
      inline: true,
    });
  }

  embed
    .setTimestamp()
    .setFooter({ text: `投票 ID：${proposal.voteId}` });

  await resultChannel.send({ embeds: [embed] });
}

module.exports = { finalizeProposal };
