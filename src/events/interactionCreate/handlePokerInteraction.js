require("colors");
const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const {
  findActiveGameInChannel,
  joinTable,
  leaveDuringWaiting,
  startNextHand,
  closeTable,
  refreshTableMessage,
  resendTableMessage,
  applyPlayerAction,
  persistEngineState,
  announceHandStart,
  postThreadAnnouncement,
} = require("../../features/casino/poker/service");
const engine = require("../../features/casino/poker/engine");
const { renderEphemeralHand } = require("../../features/casino/poker/renderer");

// 抑制未使用警告
void findActiveGameInChannel;

function parseId(customId, prefix) {
  if (!customId.startsWith(prefix)) return null;
  const rest = customId.slice(prefix.length);
  const splitIdx = rest.indexOf("_");
  if (splitIdx < 0) return null;
  return { action: rest.slice(0, splitIdx), gameId: rest.slice(splitIdx + 1) };
}

async function fetchByGameId(client, gameId) {
  return client.pokerGamesCollection.findOne({ gameId });
}

async function handleButton(client, interaction) {
  if (!interaction.customId?.startsWith("pk_")) return false;
  if (!client.pokerGamesCollection) return true;

  const parsed = parseId(interaction.customId, "pk_");
  if (!parsed) return true;
  const { action, gameId } = parsed;

  const doc = await fetchByGameId(client, gameId);
  if (!doc) {
    await interaction.reply({ content: "🃏 找不到這張桌（可能已結束）。", ephemeral: true });
    return true;
  }

  // 查看手牌：所有狀態都允許
  if (action === "hand") {
    return interaction.reply(renderEphemeralHand(doc, interaction.user.id));
  }

  // 重貼桌面：把舊訊息刪掉重發一張
  if (action === "resend") {
    await interaction.deferReply({ ephemeral: true });
    const msg = await resendTableMessage(client, doc);
    if (!msg) return interaction.editReply("🔧 重貼失敗，可能執行緒被封存或權限不足。");
    return interaction.editReply("🔄 桌面已重貼，往下找新訊息。");
  }

  // 加入：waiting 才行
  if (action === "join") {
    await interaction.deferReply({ ephemeral: true });
    const r = await joinTable(client, interaction);
    if (r.error) return interaction.editReply(r.error);
    const username =
      interaction.member?.displayName || interaction.user.username;
    await postThreadAnnouncement(
      client,
      r.doc,
      `🪑 **${username}** 入座了（${r.doc.players.length}/${r.doc.maxPlayers} 人）`,
      []
    );
    return interaction.editReply(
      `🪑 已入座，已扣進桌費 **${r.doc.buyIn.toLocaleString()}** credits。`
    );
  }

  // 開始下一局（waiting → preflop）
  if (action === "start") {
    console.log(
      `[POKER] start clicked by user=${interaction.user.id} gameId=${gameId} status=${doc.status} players=${doc.players.length}/${doc.minPlayers}`.cyan
    );
    if (doc.creatorId !== interaction.user.id) {
      return interaction.reply({ content: "🚫 只有開桌者能開局。", ephemeral: true });
    }
    if (doc.status !== "waiting") {
      return interaction.reply({ content: "現在不能開新局。", ephemeral: true });
    }
    if (doc.players.length < doc.minPlayers) {
      await interaction.reply({
        content: `🚫 人數不足，至少需 ${doc.minPlayers} 人，目前 ${doc.players.length} 人。請先邀請其他人按「🪑 加入」入座。`,
        ephemeral: false,
      });
      return true;
    }
    await interaction.deferUpdate();
    const next = engine.startHand(doc);
    await persistEngineState(client, doc, next);
    const updated = await fetchByGameId(client, gameId);
    console.log(
      `[POKER] hand started gameId=${gameId} hand=${updated.handNumber} phase=${updated.phase} toAct=${updated.toActIdx}`.cyan
    );
    await refreshTableMessage(client, updated);
    await announceHandStart(client, updated);
    return true;
  }

  // 下一局（settled → preflop）
  if (action === "next") {
    if (doc.creatorId !== interaction.user.id) {
      return interaction.reply({ content: "🚫 只有開桌者能開新局。", ephemeral: true });
    }
    if (doc.status !== "settled") {
      return interaction.reply({ content: "牌局尚未結束。", ephemeral: true });
    }
    await interaction.deferUpdate();
    const r = await startNextHand(client, doc);
    if (r.closed) {
      await closeTable(client, doc, { reason: "underpopulated" });
      return true;
    }
    const updated = await fetchByGameId(client, gameId);
    await refreshTableMessage(client, updated);
    await announceHandStart(client, updated);
    return true;
  }

  // 解散
  if (action === "close") {
    if (doc.creatorId !== interaction.user.id) {
      return interaction.reply({ content: "🚫 只有開桌者能解散。", ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await closeTable(client, doc, { reason: "creator_close" });
    return interaction.editReply("🛑 牌桌已解散，籌碼已退回各位錢包。");
  }

  // 離桌
  if (action === "leave") {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    const me = doc.players.find((p) => p.userId === userId);
    if (!me) return interaction.editReply("你不在這張桌上。");
    if (doc.status === "waiting") {
      const r = await leaveDuringWaiting(client, doc, userId);
      if (r.error) return interaction.editReply(r.error);
      if (r.closed) {
        await closeTable(client, doc, { reason: "everyone_left" });
        return interaction.editReply("👋 已退回進桌費，牌桌已解散。");
      }
      await refreshTableMessage(client, r.doc);
      return interaction.editReply(
        `👋 已退回進桌費 **${doc.buyIn.toLocaleString()}** credits。`
      );
    }
    // playing/settled：標 leaving，等結算才退
    await client.pokerGamesCollection.updateOne(
      { _id: doc._id, "players.userId": userId },
      { $set: { "players.$.leaving": true, updatedAt: new Date() } }
    );
    if (doc.status === "playing" && !me.folded) {
      const idx = doc.players.findIndex((p) => p.userId === userId);
      if (doc.toActIdx === idx) {
        const r = engine.applyAction(doc, idx, "fold");
        if (!r.error) await persistEngineState(client, doc, r.state);
      } else {
        await client.pokerGamesCollection.updateOne(
          { _id: doc._id, "players.userId": userId },
          {
            $set: {
              "players.$.folded": true,
              "players.$.hasActed": true,
              updatedAt: new Date(),
            },
          }
        );
      }
      const refreshed = await fetchByGameId(client, gameId);
      await refreshTableMessage(client, refreshed);
    }
    return interaction.editReply("👋 已標記離桌，本局結束後退回剩餘籌碼。");
  }

  // 行動：fold / callcheck / allin / raise(modal)
  if (["fold", "callcheck", "allin", "raise"].includes(action)) {
    if (doc.status !== "playing") {
      return interaction.reply({ content: "現在不需要行動。", ephemeral: true });
    }
    const idx = doc.players.findIndex((p) => p.userId === interaction.user.id);
    if (idx < 0) {
      return interaction.reply({ content: "你不在這桌上。", ephemeral: true });
    }
    if (doc.toActIdx !== idx) {
      return interaction.reply({ content: "🕒 還沒輪到你。", ephemeral: true });
    }

    if (action === "raise") {
      // 開 modal 收金額
      const me = doc.players[idx];
      const minRaiseTo = Math.max(
        doc.currentBet + doc.minRaise,
        doc.bigBlind
      );
      const maxRaiseTo = me.bet + me.chips;
      const modal = new ModalBuilder()
        .setCustomId(`pk_raisemodal_${gameId}`)
        .setTitle("加注金額");
      const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel(`下注到（總額，含已下） ${minRaiseTo}–${maxRaiseTo}`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(String(minRaiseTo))
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return true;
    }

    await interaction.deferUpdate();
    let actEngine;
    if (action === "fold") actEngine = "fold";
    else if (action === "allin") actEngine = "allin";
    else {
      // callcheck
      const me = doc.players[idx];
      actEngine = me.bet >= doc.currentBet ? "check" : "call";
    }
    const r = await applyPlayerAction(client, doc, interaction.user.id, actEngine);
    if (r.error) {
      try {
        await interaction.followUp({ content: r.error, ephemeral: true });
      } catch (_) {}
      return true;
    }
    const updated = await fetchByGameId(client, gameId);
    if (updated.status === "settled") {
      await onSettled(client, updated);
    }
    await refreshTableMessage(client, updated);
    return true;
  }

  return true;
}

async function handleModal(client, interaction) {
  if (!interaction.customId?.startsWith("pk_raisemodal_")) return false;
  if (!client.pokerGamesCollection) return true;
  const gameId = interaction.customId.slice("pk_raisemodal_".length);
  const doc = await fetchByGameId(client, gameId);
  if (!doc) {
    await interaction.reply({ content: "🃏 找不到這張桌。", ephemeral: true });
    return true;
  }
  const idx = doc.players.findIndex((p) => p.userId === interaction.user.id);
  if (idx < 0 || doc.toActIdx !== idx) {
    await interaction.reply({ content: "🕒 還沒輪到你。", ephemeral: true });
    return true;
  }
  const raw = interaction.fields.getTextInputValue("amount");
  const raiseTo = parseInt(raw, 10);
  if (!Number.isFinite(raiseTo) || raiseTo <= 0) {
    await interaction.reply({ content: "❌ 請輸入正整數。", ephemeral: true });
    return true;
  }
  await interaction.deferUpdate();
  const r = await applyPlayerAction(client, doc, interaction.user.id, "raise", { raiseTo });
  if (r.error) {
    try {
      await interaction.followUp({
        content: `❌ 加注失敗：${r.error}`,
        ephemeral: true,
      });
    } catch (_) {}
    return true;
  }
  const updated = await fetchByGameId(client, gameId);
  if (updated.status === "settled") {
    await onSettled(client, updated);
  }
  await refreshTableMessage(client, updated);
  return true;
}

// 攤牌結算後處理：把 leaving 玩家在下一局開始前就退完？這裡不處理，留給 startNextHand。
async function onSettled(client, doc) {
  // hook: 之後可加自動下一局倒數、busted 玩家自動退款等。MVP 不做。
  void client;
  void doc;
}

module.exports = async (client, interaction) => {
  try {
    if (interaction.isButton()) {
      if (!interaction.customId?.startsWith("pk_")) return;
      await handleButton(client, interaction);
      return;
    }
    if (interaction.isModalSubmit?.()) {
      if (!interaction.customId?.startsWith("pk_raisemodal_")) return;
      await handleModal(client, interaction);
      return;
    }
  } catch (error) {
    console.log(`[ERROR] handlePokerInteraction:\n${error}\n${error.stack}`.red);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "🔧 撲克處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "🔧 撲克處理失敗，請呼叫舒舒！",
          ephemeral: true,
        });
      }
    } catch (_) {
      /* noop */
    }
  }
};
