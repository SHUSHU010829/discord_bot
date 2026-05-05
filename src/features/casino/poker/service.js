// 德州撲克 service：橋接 engine、Mongo、Discord，提供高階操作給 commands / handlers 共用。
//
// 命名約定：state 指 mongo doc（含 gameId / channelId / threadId / messageId），
// engine 純函數產出的純 state 不含 Discord 相關欄位。

require("colors");
const crypto = require("crypto");
const { ChannelType } = require("discord.js");

const { coinSystem, casino } = require("../../../config");
const grantCoins = require("../../economy/grantCoins");
const engine = require("./engine");
const { renderTableMessage } = require("./renderer");

function getCfg() {
  return casino?.poker || {};
}

function blindsFromBig(bb) {
  return { smallBlind: Math.max(1, Math.floor(bb / 2)), bigBlind: bb };
}

function buyInFor(bb) {
  const cfg = getCfg();
  const mult = cfg.buyInMultiplier || 50;
  return bb * mult;
}

async function findActiveGameInChannel(client, channelId) {
  return client.pokerGamesCollection.findOne({
    channelId,
    status: { $in: ["waiting", "playing", "settled"] },
  });
}

async function findUserActiveGame(client, userId) {
  return client.pokerGamesCollection.findOne({
    "players.userId": userId,
    status: { $in: ["waiting", "playing", "settled"] },
  });
}

function makeFreshPlayer({ userId, username, chips }) {
  return {
    userId,
    username,
    chips,
    bet: 0,
    totalBet: 0,
    hasActed: false,
    folded: false,
    allIn: false,
    busted: false,
    leaving: false,
    holeCards: [],
  };
}

function ttlExpiresAt() {
  const sec = getCfg().gameTtlSeconds || 900;
  return new Date(Date.now() + sec * 1000);
}

async function refreshTableMessage(client, doc, { viewerId } = {}) {
  try {
    const channel = await client.channels.fetch(doc.threadId).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(doc.messageId).catch(() => null);
    if (!msg) return;
    const payload = renderTableMessage(doc, { viewerId });
    await msg.edit(payload).catch(() => {});
  } catch (_) {
    /* noop */
  }
}

async function createTable(client, interaction, { maxPlayers, blind }) {
  if (!coinSystem?.enabled) return { error: "🔧 金幣系統尚未啟動！" };
  if (!client.pokerGamesCollection || !client.userCoinsCollection) {
    return { error: "🔧 撲克系統尚未啟動，請聯絡舒舒！" };
  }
  const cfg = getCfg();
  if (cfg.enabled === false) return { error: "🔧 德州撲克暫時關閉中！" };

  const minBlind = cfg.minBlind ?? 10;
  const maxBlind = cfg.maxBlind ?? 500;
  const minPlayers = cfg.minPlayers ?? 2;
  const maxPlayersCap = cfg.maxPlayers ?? 8;

  if (blind < minBlind || blind > maxBlind) {
    return {
      error: `盲注需介於 ${minBlind.toLocaleString()} ~ ${maxBlind.toLocaleString()}。`,
    };
  }
  if (maxPlayers < minPlayers || maxPlayers > maxPlayersCap) {
    return { error: `人數需介於 ${minPlayers} ~ ${maxPlayersCap}。` };
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return { error: "🔧 請在一般文字頻道使用此指令（會自動開執行緒）。" };
  }

  // 同人不可多桌
  const userActive = await findUserActiveGame(client, interaction.user.id);
  if (userActive) {
    return { error: "🃏 你已經在另一張撲克桌上了，先把那桌結束再開新桌！" };
  }

  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const username = interaction.member?.displayName || interaction.user.username;
  const buyIn = buyInFor(blind);

  // 餘額檢查
  const userDoc = await client.userCoinsCollection.findOne({ userId, guildId });
  const balance = userDoc?.totalCoins || 0;
  if (balance < buyIn) {
    return {
      error: `💰 餘額不足！進桌需要 **${buyIn.toLocaleString()}** credits（盲 ${blind} × ${cfg.buyInMultiplier || 50} 倍）。目前 ${balance.toLocaleString()}。`,
    };
  }

  // 扣 buy-in
  const debit = await grantCoins(client, {
    userId,
    guildId,
    username,
    avatarHash: interaction.user.avatar,
    amount: -buyIn,
    source: "bet",
    member: interaction.member,
    meta: { game: "poker", reason: "buyin" },
  });
  if (!debit) return { error: "🔧 扣款失敗，請稍後再試。" };

  // 建立 thread
  let thread;
  try {
    thread = await channel.threads.create({
      name: `🃏 德州撲克 ${blind} bb · @${username}`.slice(0, 100),
      autoArchiveDuration: 60,
      type: ChannelType.PublicThread,
      reason: "Texas Hold'em table",
    });
  } catch (e) {
    // 退錢
    await grantCoins(client, {
      userId,
      guildId,
      username,
      amount: buyIn,
      source: "payout",
      member: interaction.member,
      meta: { game: "poker", result: "thread_create_failed" },
    });
    return { error: `🔧 無法建立執行緒：${e.message}` };
  }

  const blinds = blindsFromBig(blind);
  const gameId = crypto.randomUUID();
  const now = new Date();
  const doc = {
    gameId,
    guildId,
    parentChannelId: channel.id,
    channelId: thread.id,
    threadId: thread.id,
    messageId: null,
    creatorId: userId,
    status: "waiting",
    phase: null,
    bigBlind: blinds.bigBlind,
    smallBlind: blinds.smallBlind,
    buyIn,
    minPlayers,
    maxPlayers,
    handNumber: 0,
    buttonIdx: -1,
    sbIdx: -1,
    bbIdx: -1,
    toActIdx: -1,
    currentBet: 0,
    minRaise: blinds.bigBlind,
    lastAggressorIdx: -1,
    pot: 0,
    deck: [],
    community: [],
    players: [makeFreshPlayer({ userId, username, chips: buyIn })],
    settle: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: ttlExpiresAt(),
  };

  const payload = renderTableMessage(doc);
  let msg;
  try {
    msg = await thread.send(payload);
  } catch (e) {
    // 救援：退錢、刪 thread
    await grantCoins(client, {
      userId,
      guildId,
      username,
      amount: buyIn,
      source: "payout",
      member: interaction.member,
      meta: { game: "poker", result: "thread_send_failed" },
    });
    await thread.delete().catch(() => {});
    return { error: `🔧 無法發送桌面訊息：${e.message}` };
  }
  doc.messageId = msg.id;

  await client.pokerGamesCollection.insertOne(doc);
  console.log(
    `[POKER] 開桌 user=${userId} gameId=${gameId} thread=${thread.id} blind=${blind}`.cyan
  );
  return { doc, thread };
}

async function joinTable(client, interaction) {
  if (!client.pokerGamesCollection) return { error: "🔧 撲克系統未啟動。" };
  const channelId = interaction.channelId;
  const game = await findActiveGameInChannel(client, channelId);
  if (!game) return { error: "🃏 這個執行緒沒有等候中的撲克桌。" };
  if (game.status !== "waiting") {
    return { error: "🃏 牌局已經開始，等下一局再加入。" };
  }
  const userId = interaction.user.id;
  if (game.players.find((p) => p.userId === userId)) {
    return { error: "你已經在桌上囉。" };
  }
  if (game.players.length >= game.maxPlayers) {
    return { error: "🃏 牌桌已滿。" };
  }
  // 同人不可多桌（含其他頻道）
  const userActive = await findUserActiveGame(client, userId);
  if (userActive && userActive.gameId !== game.gameId) {
    return { error: "🃏 你已經在另一張撲克桌上了。" };
  }

  const username = interaction.member?.displayName || interaction.user.username;
  const guildId = interaction.guildId;
  const buyIn = game.buyIn;

  const userDoc = await client.userCoinsCollection.findOne({ userId, guildId });
  const balance = userDoc?.totalCoins || 0;
  if (balance < buyIn) {
    return {
      error: `💰 餘額不足！進桌需 **${buyIn.toLocaleString()}** credits，目前 ${balance.toLocaleString()}。`,
    };
  }

  const debit = await grantCoins(client, {
    userId,
    guildId,
    username,
    avatarHash: interaction.user.avatar,
    amount: -buyIn,
    source: "bet",
    member: interaction.member,
    meta: { game: "poker", reason: "buyin" },
  });
  if (!debit) return { error: "🔧 扣款失敗，請稍後再試。" };

  const newPlayer = makeFreshPlayer({ userId, username, chips: buyIn });
  await client.pokerGamesCollection.updateOne(
    { _id: game._id },
    {
      $push: { players: newPlayer },
      $set: { updatedAt: new Date(), expiresAt: ttlExpiresAt() },
    }
  );
  const updated = await client.pokerGamesCollection.findOne({ _id: game._id });
  await refreshTableMessage(client, updated);
  return { doc: updated };
}

// 解散 / 玩家全離 → 退回桌上 chips、archive thread
async function closeTable(client, doc, { reason = "closed" } = {}) {
  if (!doc) return;
  const guildId = doc.guildId;
  for (const p of doc.players) {
    if (p.chips > 0) {
      await grantCoins(client, {
        userId: p.userId,
        guildId,
        username: p.username,
        amount: p.chips,
        source: "payout",
        meta: { game: "poker", result: reason, gameId: doc.gameId },
      });
    }
  }
  await client.pokerGamesCollection.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: "closed",
        players: doc.players.map((p) => ({ ...p, chips: 0 })),
        updatedAt: new Date(),
      },
    }
  );
  // archive thread
  try {
    const thread = await client.channels.fetch(doc.threadId).catch(() => null);
    if (thread && thread.isThread()) {
      await thread.send("🛑 牌桌已解散，籌碼已退回各位錢包。執行緒將封存。").catch(() => {});
      await thread.setArchived(true).catch(() => {});
    }
  } catch (_) {
    /* noop */
  }
}

// 把指定 userId 從牌桌移除（等候中），退回他桌上的 chips
async function leaveDuringWaiting(client, doc, userId) {
  const player = doc.players.find((p) => p.userId === userId);
  if (!player) return { error: "你不在這張桌上。" };
  if (player.chips > 0) {
    await grantCoins(client, {
      userId,
      guildId: doc.guildId,
      username: player.username,
      amount: player.chips,
      source: "payout",
      meta: { game: "poker", result: "cashout_waiting", gameId: doc.gameId },
    });
  }
  const remaining = doc.players.filter((p) => p.userId !== userId);
  if (remaining.length === 0) {
    // 全空 → 關桌
    await client.pokerGamesCollection.updateOne(
      { _id: doc._id },
      { $set: { status: "closed", players: [], updatedAt: new Date() } }
    );
    return { closed: true };
  }
  await client.pokerGamesCollection.updateOne(
    { _id: doc._id },
    { $set: { players: remaining, updatedAt: new Date(), expiresAt: ttlExpiresAt() } }
  );
  const updated = await client.pokerGamesCollection.findOne({ _id: doc._id });
  return { doc: updated };
}

async function startNextHand(client, doc) {
  // 從 settled 進下一局：先把 leaving 玩家帶走、busted 玩家帶走
  const guildId = doc.guildId;
  const survivors = [];
  for (const p of doc.players) {
    if (p.leaving || p.busted || p.chips <= 0) {
      if (p.chips > 0) {
        await grantCoins(client, {
          userId: p.userId,
          guildId,
          username: p.username,
          amount: p.chips,
          source: "payout",
          meta: {
            game: "poker",
            result: p.busted ? "bust_cashout" : "leave_cashout",
            gameId: doc.gameId,
          },
        });
      }
      continue;
    }
    survivors.push({ ...p, leaving: false });
  }
  if (survivors.length < doc.minPlayers) {
    // 人不夠 → 關桌、退錢
    for (const p of survivors) {
      if (p.chips > 0) {
        await grantCoins(client, {
          userId: p.userId,
          guildId,
          username: p.username,
          amount: p.chips,
          source: "payout",
          meta: { game: "poker", result: "underpopulated_cashout", gameId: doc.gameId },
        });
      }
    }
    await client.pokerGamesCollection.updateOne(
      { _id: doc._id },
      { $set: { status: "closed", players: [], updatedAt: new Date() } }
    );
    return { closed: true };
  }

  const baseState = {
    ...doc,
    players: survivors,
    buttonIdx: doc.buttonIdx,
  };
  const next = engine.startHand(baseState);
  await persistEngineState(client, doc, next);
  const updated = await client.pokerGamesCollection.findOne({ _id: doc._id });
  return { doc: updated };
}

// engine 跑完之後把所有變動欄位寫回 mongo
async function persistEngineState(client, doc, next) {
  await client.pokerGamesCollection.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: next.status,
        phase: next.phase,
        deck: next.deck || [],
        community: next.community || [],
        players: next.players,
        buttonIdx: next.buttonIdx,
        sbIdx: next.sbIdx,
        bbIdx: next.bbIdx,
        toActIdx: next.toActIdx,
        currentBet: next.currentBet || 0,
        minRaise: next.minRaise || doc.bigBlind,
        lastAggressorIdx: next.lastAggressorIdx ?? -1,
        pot: next.pot || 0,
        handNumber: next.handNumber || doc.handNumber,
        settle: next.settle || null,
        updatedAt: new Date(),
        expiresAt: ttlExpiresAt(),
      },
    }
  );
}

// 玩家行動
async function applyPlayerAction(client, doc, userId, action, opts = {}) {
  if (doc.status !== "playing") return { error: "牌局現在不需要你行動。" };
  const idx = doc.players.findIndex((p) => p.userId === userId);
  if (idx < 0) return { error: "你不在這張桌上。" };
  if (doc.toActIdx !== idx) return { error: "現在還沒輪到你。" };

  // engine 先把 doc 當作 state 處理（多餘欄位 engine 不在意）
  const result = engine.applyAction(doc, idx, action, opts);
  if (result.error) return { error: result.error };
  await persistEngineState(client, doc, result.state);
  const updated = await client.pokerGamesCollection.findOne({ _id: doc._id });
  return { doc: updated, settled: updated.status === "settled" };
}

module.exports = {
  getCfg,
  blindsFromBig,
  buyInFor,
  findActiveGameInChannel,
  findUserActiveGame,
  refreshTableMessage,
  createTable,
  joinTable,
  closeTable,
  leaveDuringWaiting,
  startNextHand,
  applyPlayerAction,
  persistEngineState,
};
