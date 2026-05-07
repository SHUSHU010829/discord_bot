// 賽馬流程：售票 → 開賽 → 動畫 → 結算。被 /賽馬 setTimeout、按鈕、cron 共用。
//
// 防重靠 atomic findOneAndUpdate（status: "betting" → "running"）：
// 同一場若 setTimeout 跟 cron 同時觸發、或主機剛重啟 cron 又抓到一次，
// 只有第一個拿到 "betting" 狀態的呼叫者會繼續跑動畫，其它直接 no-op。

require("colors");

const { AttachmentBuilder } = require("discord.js");

const grantCoins = require("../../economy/grantCoins");
const { casino } = require("../../../config");
const {
  HORSES,
  TRACK_LENGTH,
  pickWinnerWeighted,
  simulateRace,
  calcPayout,
} = require("./engine");
const {
  renderRaceFrame,
  renderSettledPhase,
  renderCancelled,
} = require("./renderer");
const generateHorseRaceResultCard = require("../../../utils/generateHorseRaceResultCard");

function getCfg() {
  return casino?.horseRacing || {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMessage(client, state) {
  if (!state?.channelId || !state?.messageId) return null;
  try {
    const channel = await client.channels.fetch(state.channelId);
    if (!channel?.isTextBased?.()) return null;
    return await channel.messages.fetch(state.messageId);
  } catch (_) {
    return null;
  }
}

// 把 betting 狀態的局推進到結束（開賽 / 取消）
// 0 人下注 → 取消；有下注 → 跑賽 + 結算
async function startRaceIfDue(client, gameId) {
  const coll = client.horseRaceGamesCollection;
  if (!coll) return;

  const current = await coll.findOne({ gameId });
  if (!current) return;
  if (current.status !== "betting") return;

  // 0 人下注：原子轉成 cancelled
  if (!current.bets || current.bets.length === 0) {
    const cancelled = await coll.findOneAndUpdate(
      { gameId, status: "betting" },
      {
        $set: {
          status: "cancelled",
          cancelReason: "no_bets",
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    const doc = cancelled?.value || cancelled;
    if (doc) {
      const message = await fetchMessage(client, doc);
      if (message) {
        await message
          .edit(renderCancelled(doc, "0 人購票，自動取消"))
          .catch(() => {});
      }
    }
    return;
  }

  // 原子轉成 running，搶到才繼續
  const running = await coll.findOneAndUpdate(
    { gameId, status: "betting" },
    { $set: { status: "running", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  const state = running?.value || running;
  if (!state) return;

  await runRaceAnimation(client, state);
}

async function runRaceAnimation(client, state) {
  const coll = client.horseRaceGamesCollection;
  const cfg = getCfg();
  const frameDelayMs = cfg.frameDelayMs ?? 1200;

  const winnerId = pickWinnerWeighted();
  const { frames, rankings } = simulateRace(winnerId);
  const finalPositions = frames[frames.length - 1];

  // 先把預計結果寫進 DB，這樣即使動畫掛掉，cron 也能用 finalPositions / rankings 結算
  await coll.updateOne(
    { gameId: state.gameId },
    {
      $set: {
        winnerId,
        rankings,
        finalPositions,
        updatedAt: new Date(),
      },
    },
  );

  const message = await fetchMessage(client, state);

  // 動畫：能拿到 message 就逐幀更新；不能就直接跳結算
  if (message) {
    for (let i = 0; i < frames.length - 1; i++) {
      const payload = renderRaceFrame(state, frames[i]);
      await message.edit(payload).catch(() => {});
      await sleep(frameDelayMs);
    }
  }

  // 結算：派彩給押中贏家的玩家
  const winnerHorse = HORSES.find((h) => h.id === winnerId);
  const settles = [];
  for (const bet of state.bets) {
    const won = bet.horseId === winnerId;
    const payout = won ? calcPayout(bet.amount, winnerHorse.payout) : 0;

    if (payout > 0) {
      await grantCoins(client, {
        userId: bet.userId,
        guildId: state.guildId,
        username: bet.username,
        amount: payout,
        source: "payout",
        meta: {
          game: "horseRacing",
          gameId: state.gameId,
          horseId: bet.horseId,
          winnerId,
          multiplier: winnerHorse.payout,
          bet: bet.amount,
        },
      }).catch((e) =>
        console.log(`[HORSE] payout failed for ${bet.userId}: ${e}`.red),
      );
    }

    settles.push({
      userId: bet.userId,
      username: bet.username,
      horseId: bet.horseId,
      amount: bet.amount,
      payout,
      won,
    });
  }

  await coll.updateOne(
    { gameId: state.gameId },
    {
      $set: {
        status: "settled",
        settles,
        updatedAt: new Date(),
      },
    },
  );

  const finalState = {
    ...state,
    winnerId,
    rankings,
    finalPositions,
    settles,
    status: "settled",
  };

  const settledPayload = renderSettledPhase(finalState);
  const totalPool = (state.bets || []).reduce((s, b) => s + b.amount, 0);
  const totalPaid = settles.reduce((s, x) => s + (x.payout || 0), 0);

  let attachments = [];
  try {
    const buf = await generateHorseRaceResultCard({
      gameId: state.gameId,
      drawnAtLabel: new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", " "),
      horses: HORSES,
      rankings,
      finalPositions,
      trackLength: TRACK_LENGTH,
      pool: totalPool,
      paid: totalPaid,
      betsCount: (state.bets || []).length,
    });
    attachments = [
      new AttachmentBuilder(buf, { name: `race-${state.gameId}.png` }),
    ];
  } catch (err) {
    console.log(`[HORSE] result card render failed: ${err}`.yellow);
  }

  const finalPayload = { ...settledPayload, files: attachments };

  if (message) {
    await message.edit(finalPayload).catch(() => {});
  } else {
    // 沒辦法 edit 原訊息：丟一筆訊息到頻道（若可達）
    try {
      const channel = await client.channels.fetch(state.channelId);
      if (channel?.isTextBased?.()) {
        await channel.send(finalPayload).catch(() => {});
      }
    } catch (_) { /* noop */ }
  }
}

// 把 betting 局原子取消（開盤者按取消鍵）
async function cancelRace(client, gameId, reason = "host_cancelled") {
  const coll = client.horseRaceGamesCollection;
  if (!coll) return null;

  const cancelled = await coll.findOneAndUpdate(
    { gameId, status: "betting" },
    {
      $set: {
        status: "cancelled",
        cancelReason: reason,
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  const doc = cancelled?.value || cancelled;
  if (!doc) return null;

  // 退款
  for (const bet of doc.bets || []) {
    await grantCoins(client, {
      userId: bet.userId,
      guildId: doc.guildId,
      username: bet.username,
      amount: bet.amount,
      source: "payout", // 走 payout 通道避免被視作非賭場進帳
      meta: {
        game: "horseRacing",
        gameId: doc.gameId,
        kind: "refund",
        reason,
        horseId: bet.horseId,
      },
    }).catch((e) =>
      console.log(`[HORSE] refund failed for ${bet.userId}: ${e}`.red),
    );
  }

  const message = await fetchMessage(client, doc);
  if (message) {
    await message
      .edit(renderCancelled(doc, reason === "host_cancelled" ? "開盤者取消" : "已取消"))
      .catch(() => {});
  }
  return doc;
}

// 卡住的 running 局退款（例如 bot 在動畫中段崩潰）
async function abandonStaleRace(client, gameId) {
  const coll = client.horseRaceGamesCollection;
  if (!coll) return null;

  const abandoned = await coll.findOneAndUpdate(
    { gameId, status: "running" },
    {
      $set: {
        status: "abandoned",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
  const doc = abandoned?.value || abandoned;
  if (!doc) return null;

  for (const bet of doc.bets || []) {
    await grantCoins(client, {
      userId: bet.userId,
      guildId: doc.guildId,
      username: bet.username,
      amount: bet.amount,
      source: "payout",
      meta: {
        game: "horseRacing",
        gameId: doc.gameId,
        kind: "refund",
        reason: "abandoned",
        horseId: bet.horseId,
      },
    }).catch(() => {});
  }

  const message = await fetchMessage(client, doc);
  if (message) {
    await message
      .edit(renderCancelled(doc, "比賽中斷，已自動退款"))
      .catch(() => {});
  }
  return doc;
}

module.exports = {
  startRaceIfDue,
  cancelRace,
  abandonStaleRace,
};
