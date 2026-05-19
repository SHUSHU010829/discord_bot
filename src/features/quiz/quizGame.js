require("colors");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const grantCoins = require("../economy/grantCoins");
const { hostedEvents: hostedEventsConfig } = require("../../config");

const QUIZ_CHANNEL_ID = hostedEventsConfig?.publishChannelId || "1174352640210124877";
const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;
const MAX_QUESTION_LEN = 250;
const MAX_OPTION_LEN = 100;
const OPTION_KEYS = ["A", "B", "C", "D"];
const OPTION_EMOJIS = { A: "🇦", B: "🇧", C: "🇨", D: "🇩" };

const COLOR_ACTIVE = 0x5865f2;
const COLOR_SETTLED = 0xfee75c;
const COLOR_CANCELLED = 0xed4245;

function newQuizId(hostId) {
  return `qz-${Date.now().toString(36)}-${hostId.slice(-5)}`;
}

function formatEndsAt(endsAt) {
  const ts = Math.floor(new Date(endsAt).getTime() / 1000);
  return `<t:${ts}:R>（<t:${ts}:T>）`;
}

function buildActiveEmbed(quizDoc) {
  const { question, options, prizePool, hostId, endsAt, answers = {} } = quizDoc;
  const answerCount = Object.keys(answers).length;

  const optionLines = options
    .map((o) => `${OPTION_EMOJIS[o.key]} **${o.key}.** ${o.text}`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(COLOR_ACTIVE)
    .setTitle(`❓ ${question}`)
    .setDescription(optionLines)
    .addFields(
      { name: "主辦人", value: `<@${hostId}>`, inline: true },
      { name: "獎金池", value: `${prizePool.toLocaleString()} credits`, inline: true },
      { name: "已作答人數", value: `${answerCount} 人`, inline: true },
      { name: "結束時間", value: formatEndsAt(endsAt), inline: false }
    )
    .setFooter({ text: `問答 ID：${quizDoc.quizId}　提示：答對者平分獎金池` })
    .setTimestamp(quizDoc.createdAt);
}

function buildSettledEmbed(quizDoc) {
  const {
    question,
    options,
    correctKey,
    prizePool,
    hostId,
    answers = {},
    winners = [],
    perWinnerPrize = 0,
    totalPaid = 0,
  } = quizDoc;

  const refunded = prizePool - totalPaid;
  const correctOpt = options.find((o) => o.key === correctKey);

  const tally = {};
  for (const k of OPTION_KEYS) tally[k] = 0;
  for (const ans of Object.values(answers)) {
    if (tally[ans.key] !== undefined) tally[ans.key] += 1;
  }
  const optionLines = options
    .map((o) => {
      const mark = o.key === correctKey ? "✅" : "▫️";
      return `${mark} **${o.key}.** ${o.text} — ${tally[o.key] || 0} 票`;
    })
    .join("\n");

  const winnersField = winners.length
    ? winners
        .map((w) => `🎉 <@${w.userId}> — ${w.prize.toLocaleString()} credits`)
        .join("\n")
        .slice(0, 1024)
    : "（無人答對，獎金已退回主辦人）";

  const embed = new EmbedBuilder()
    .setColor(COLOR_SETTLED)
    .setTitle(`🏁 ${question}`)
    .setDescription(optionLines)
    .addFields(
      { name: "主辦人", value: `<@${hostId}>`, inline: true },
      { name: "原始獎金池", value: `${prizePool.toLocaleString()} credits`, inline: true },
      {
        name: "正確答案",
        value: `${OPTION_EMOJIS[correctKey]} **${correctKey}.** ${correctOpt?.text || ""}`,
        inline: false,
      },
      {
        name: `得獎者（每人 ${perWinnerPrize.toLocaleString()} credits）`,
        value: winnersField,
        inline: false,
      }
    )
    .setFooter({ text: `問答 ID：${quizDoc.quizId}` })
    .setTimestamp(quizDoc.settledAt || new Date());

  if (refunded > 0) {
    embed.addFields({
      name: "退回主辦人",
      value: `${refunded.toLocaleString()} credits`,
      inline: false,
    });
  }
  return embed;
}

function buildCancelledEmbed(quizDoc) {
  return new EmbedBuilder()
    .setColor(COLOR_CANCELLED)
    .setTitle(`🚫 ${quizDoc.question}（已取消）`)
    .addFields(
      { name: "主辦人", value: `<@${quizDoc.hostId}>`, inline: true },
      {
        name: "獎金已退還",
        value: `${quizDoc.prizePool.toLocaleString()} credits`,
        inline: true,
      }
    )
    .setFooter({ text: `問答 ID：${quizDoc.quizId}` })
    .setTimestamp(quizDoc.cancelledAt || new Date());
}

function buildActionRow(quizDoc, opts = {}) {
  const { disabled = false } = opts;
  const answerRow = new ActionRowBuilder();
  for (const opt of quizDoc.options) {
    answerRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_ans_${quizDoc.quizId}_${opt.key}`)
        .setLabel(opt.key)
        .setEmoji(OPTION_EMOJIS[opt.key])
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  }
  const ctrlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quiz_end_${quizDoc.quizId}`)
      .setLabel("結束並公布答案（限主辦人）")
      .setEmoji("🏁")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`quiz_cancel_${quizDoc.quizId}`)
      .setLabel("取消問答")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
  return [answerRow, ctrlRow];
}

function validateInputs({
  question,
  options,
  correctKey,
  prizePool,
  minutes,
}) {
  if (!question || question.length > MAX_QUESTION_LEN) {
    throw new Error(`題目長度需為 1 ~ ${MAX_QUESTION_LEN} 字。`);
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
    throw new Error("選項數量需為 2 ~ 4 個。");
  }
  for (const o of options) {
    if (!o.text || o.text.length > MAX_OPTION_LEN) {
      throw new Error(`選項 ${o.key} 內容需為 1 ~ ${MAX_OPTION_LEN} 字。`);
    }
  }
  if (!options.some((o) => o.key === correctKey)) {
    throw new Error(`正確答案 ${correctKey} 不在提供的選項中。`);
  }
  if (!Number.isInteger(prizePool) || prizePool < 1) {
    throw new Error("獎金池需為 ≥ 1 的整數。");
  }
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    throw new Error(`時間需為 ${MIN_MINUTES} ~ ${MAX_MINUTES} 分鐘。`);
  }
}

async function createQuiz(client, opts) {
  const {
    guild,
    host,
    member,
    question,
    options,
    correctKey,
    prizePool,
    minutes,
  } = opts;

  if (!client.quizGamesCollection) {
    throw new Error("問答系統尚未啟動（資料庫未連線）");
  }

  validateInputs({ question, options, correctKey, prizePool, minutes });

  const before = await client.userCoinsCollection.findOne({
    userId: host.id,
    guildId: guild.id,
  });
  const balance = before?.totalCoins || 0;
  if (balance < prizePool) {
    throw new Error(
      `餘額不足！問答需鎖定 ${prizePool.toLocaleString()} credits，目前 ${balance.toLocaleString()}。`
    );
  }

  const channel = await guild.channels.fetch(QUIZ_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    throw new Error(`找不到問答發布頻道（${QUIZ_CHANNEL_ID}），請聯絡舒舒。`);
  }

  const quizId = newQuizId(host.id);
  const endsAt = new Date(Date.now() + minutes * 60 * 1000);

  const debit = await grantCoins(client, {
    userId: host.id,
    guildId: guild.id,
    username: member?.displayName || host.username,
    avatarHash: host.avatar,
    amount: -prizePool,
    source: "event_host_lock",
    member,
    meta: { quizId, question },
  });
  if (!debit) {
    throw new Error("扣款失敗，問答未建立。");
  }

  const quizDoc = {
    quizId,
    guildId: guild.id,
    channelId: channel.id,
    messageId: null,
    hostId: host.id,
    hostName: member?.displayName || host.username,
    question,
    options,
    correctKey,
    prizePool,
    endsAt,
    status: "ACTIVE",
    answers: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const msg = await channel.send({
      content: `📣 新問答！答對者平分 **${prizePool.toLocaleString()}** credits 獎金池。`,
      embeds: [buildActiveEmbed(quizDoc)],
      components: buildActionRow(quizDoc),
    });
    quizDoc.messageId = msg.id;
    await client.quizGamesCollection.insertOne(quizDoc);
    return { quizDoc, channel, message: msg };
  } catch (err) {
    await grantCoins(client, {
      userId: host.id,
      guildId: guild.id,
      amount: prizePool,
      source: "event_refund",
      meta: { quizId, reason: "create_rollback" },
    }).catch(() => {});
    throw err;
  }
}

function unwrap(res) {
  if (!res) return null;
  return res.value !== undefined ? res.value : res;
}

async function refreshQuizMessage(client, quizDoc, opts = {}) {
  const channel = await client.channels.fetch(quizDoc.channelId).catch(() => null);
  if (!channel) return null;
  const msg = await channel.messages.fetch(quizDoc.messageId).catch(() => null);
  if (!msg) return null;

  let embed;
  let components;
  if (quizDoc.status === "ACTIVE") {
    embed = buildActiveEmbed(quizDoc);
    components = buildActionRow(quizDoc, { disabled: !!opts.disabled });
  } else if (quizDoc.status === "SETTLED") {
    embed = buildSettledEmbed(quizDoc);
    components = [];
  } else {
    embed = buildCancelledEmbed(quizDoc);
    components = [];
  }

  await msg.edit({ embeds: [embed], components }).catch(() => {});
  return msg;
}

async function setAnswer(client, quizDoc, userId, key, displayName) {
  if (quizDoc.status !== "ACTIVE") {
    return { action: "closed", doc: quizDoc };
  }
  if (!quizDoc.options.some((o) => o.key === key)) {
    return { action: "invalid", doc: quizDoc };
  }
  const ans = { key, name: displayName || null, ts: new Date() };
  const updated = await client.quizGamesCollection.findOneAndUpdate(
    { _id: quizDoc._id, status: "ACTIVE" },
    { $set: { [`answers.${userId}`]: ans, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  const doc = unwrap(updated);
  if (!doc) return { action: "closed", doc: quizDoc };
  return { action: "ok", doc };
}

async function settleQuiz(client, quizDoc, reason = "manual") {
  if (quizDoc.status !== "ACTIVE") {
    throw new Error("問答已不在進行中。");
  }

  const answers = quizDoc.answers || {};
  const winnerIds = Object.entries(answers)
    .filter(([, a]) => a.key === quizDoc.correctKey)
    .map(([uid]) => uid);

  const winnerCount = winnerIds.length;
  const perWinnerPrize = winnerCount > 0 ? Math.floor(quizDoc.prizePool / winnerCount) : 0;
  const totalPaid = perWinnerPrize * winnerCount;
  const refund = quizDoc.prizePool - totalPaid;
  const winners = winnerIds.map((uid) => ({ userId: uid, prize: perWinnerPrize }));

  const updated = await client.quizGamesCollection.findOneAndUpdate(
    { _id: quizDoc._id, status: "ACTIVE" },
    {
      $set: {
        status: "SETTLED",
        settledAt: new Date(),
        updatedAt: new Date(),
        winners,
        perWinnerPrize,
        totalPaid,
        settleReason: reason,
      },
    },
    { returnDocument: "after" }
  );
  const doc = unwrap(updated);
  if (!doc) {
    throw new Error("問答狀態已改變，無法結算。");
  }

  for (const w of winners) {
    await grantCoins(client, {
      userId: w.userId,
      guildId: quizDoc.guildId,
      amount: w.prize,
      source: "event_prize",
      meta: { quizId: quizDoc.quizId, hostId: quizDoc.hostId, kind: "quiz" },
    }).catch((e) => {
      console.log(
        `[ERROR] quiz prize payout failed (${quizDoc.quizId} user ${w.userId}): ${e}`.red
      );
    });
  }

  if (refund > 0) {
    await grantCoins(client, {
      userId: quizDoc.hostId,
      guildId: quizDoc.guildId,
      amount: refund,
      source: "event_refund",
      meta: { quizId: quizDoc.quizId, reason: winnerCount === 0 ? "no_winner" : "leftover" },
    }).catch((e) => {
      console.log(`[ERROR] quiz refund failed: ${e}`.red);
    });
  }

  const msg = await refreshQuizMessage(client, doc);

  if (msg) {
    let summary;
    if (winnerCount === 0) {
      summary =
        `🏁 問答「${doc.question}」結束\n` +
        `正確答案：**${doc.correctKey}**\n` +
        `沒有人答對，獎金 ${doc.prizePool.toLocaleString()} credits 已退還主辦人 <@${doc.hostId}>。`;
      await msg.reply({ content: summary }).catch(() => {});
    } else {
      const mentions = winnerIds.map((id) => `<@${id}>`).join(" ");
      summary =
        `🎉 問答「${doc.question}」結束！正確答案：**${doc.correctKey}**\n` +
        `${winnerCount} 人答對，每人獲得 **${perWinnerPrize.toLocaleString()}** credits\n${mentions}` +
        (refund > 0 ? `\n（餘數 ${refund.toLocaleString()} 已退回主辦人）` : "");
      await msg
        .reply({
          content: summary,
          allowedMentions: { users: winnerIds },
        })
        .catch(() => {});
    }
  }

  return doc;
}

async function cancelQuiz(client, quizDoc, actor) {
  const updated = await client.quizGamesCollection.findOneAndUpdate(
    { _id: quizDoc._id, status: "ACTIVE" },
    {
      $set: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        updatedAt: new Date(),
        cancelledBy: actor.id,
      },
    },
    { returnDocument: "after" }
  );
  const doc = unwrap(updated);
  if (!doc) {
    throw new Error("問答已不在進行中，無法取消。");
  }

  await grantCoins(client, {
    userId: quizDoc.hostId,
    guildId: quizDoc.guildId,
    amount: quizDoc.prizePool,
    source: "event_refund",
    meta: { quizId: quizDoc.quizId, reason: "host_cancelled" },
  }).catch((e) => {
    console.log(`[ERROR] quiz cancel refund failed: ${e}`.red);
  });

  const msg = await refreshQuizMessage(client, doc);
  if (msg) {
    await msg
      .reply({
        content: `🚫 問答「${doc.question}」已由主辦人取消，獎金已退還。`,
      })
      .catch(() => {});
  }
  return doc;
}

module.exports = {
  QUIZ_CHANNEL_ID,
  MIN_MINUTES,
  MAX_MINUTES,
  MAX_QUESTION_LEN,
  MAX_OPTION_LEN,
  OPTION_KEYS,
  OPTION_EMOJIS,
  createQuiz,
  setAnswer,
  settleQuiz,
  cancelQuiz,
  refreshQuizMessage,
  buildActiveEmbed,
  buildSettledEmbed,
  buildCancelledEmbed,
  buildActionRow,
};
