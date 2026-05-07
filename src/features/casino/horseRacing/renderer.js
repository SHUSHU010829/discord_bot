// 賽馬訊息渲染：售票期 / 比賽中 / 結算 三種狀態。

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { HORSES, TRACK_LENGTH } = require("./engine");

// ── 跑道字符 ──
function renderTrack(pos) {
  const reached = pos >= TRACK_LENGTH;
  const left = "━".repeat(Math.min(pos, TRACK_LENGTH));
  const right = "·".repeat(Math.max(0, TRACK_LENGTH - pos));
  return reached ? `${left}🏁` : `${left}${right}🏁`;
}

function rankBadge(n) {
  if (n === 1) return "🥇";
  if (n === 2) return "🥈";
  if (n === 3) return "🥉";
  return `#${n}`;
}

function aggregateBetsByHorse(bets = []) {
  const map = new Map();
  for (const h of HORSES) map.set(h.id, { totalAmount: 0, betters: 0 });
  for (const b of bets) {
    const e = map.get(b.horseId);
    if (!e) continue;
    e.totalAmount += b.amount;
    e.betters += 1;
  }
  return map;
}

// ── 售票期：訊息內容 + 按鈕 ──
function buildBettingButtons(gameId) {
  const row1 = new ActionRowBuilder().addComponents(
    ...HORSES.slice(0, 3).map((h) =>
      new ButtonBuilder()
        .setCustomId(`hr_pick_${h.id}_${gameId}`)
        .setLabel(`${h.id}.${h.name} ×${h.payout.toFixed(1)}`)
        .setEmoji(h.emoji)
        .setStyle(ButtonStyle.Primary),
    ),
  );
  const row2 = new ActionRowBuilder().addComponents(
    ...HORSES.slice(3, 6).map((h) =>
      new ButtonBuilder()
        .setCustomId(`hr_pick_${h.id}_${gameId}`)
        .setLabel(`${h.id}.${h.name} ×${h.payout.toFixed(1)}`)
        .setEmoji(h.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hr_start_${gameId}`)
      .setLabel("🚀 提早開賽（開盤者）")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`hr_cancel_${gameId}`)
      .setLabel("❌ 取消（開盤者）")
      .setStyle(ButtonStyle.Danger),
  );
  return [row1, row2, row3];
}

function renderBettingPhase(state) {
  const expiresAtTs = Math.floor(new Date(state.expiresAt).getTime() / 1000);
  const totalPool = (state.bets || []).reduce((s, b) => s + b.amount, 0);
  const byHorse = aggregateBetsByHorse(state.bets || []);

  const lines = [
    `🐎 **賽馬大賽開盤！** 由 <@${state.hostUserId}> 發起`,
    `🎫 售票截止：<t:${expiresAtTs}:R>（<t:${expiresAtTs}:T>）・每人可押多匹`,
    "─────────────────────",
    "**馬匹賠率（總倍率，含本金）**",
  ];

  for (const h of HORSES) {
    const agg = byHorse.get(h.id);
    const tag =
      agg.betters > 0
        ? ` ・ 已押 ${agg.totalAmount.toLocaleString()}（${agg.betters} 人）`
        : "";
    lines.push(
      `${h.id} ${h.emoji} **${h.name}** ×${h.payout.toFixed(1)}${tag}`,
    );
  }

  lines.push("─────────────────────");
  lines.push(`💰 目前總彩池：**${totalPool.toLocaleString()}** credits`);
  if ((state.bets || []).length === 0) {
    lines.push("-# 尚無人下注 ・ 沒人買票就會自動取消，不會跑賽");
  } else {
    lines.push(`-# ${state.bets.length} 筆下注 ・ 點下方按鈕押你看好的馬`);
  }

  return {
    content: lines.join("\n"),
    components: buildBettingButtons(state.gameId),
  };
}

// ── 比賽中：每幀 ──
function renderRaceFrame(state, positions) {
  const winnerId = state.winnerId;
  const lines = [
    `🐎 **賽馬大賽 ・ 比賽進行中**`,
    `💰 總彩池：**${(state.bets || []).reduce((s, b) => s + b.amount, 0).toLocaleString()}** credits ・ ${(state.bets || []).length} 筆下注`,
    "─────────────────────",
  ];

  for (let i = 0; i < HORSES.length; i++) {
    const h = HORSES[i];
    lines.push(`${h.id} ${h.emoji} ${renderTrack(positions[i])} ${h.name}`);
  }

  lines.push("─────────────────────");
  lines.push(winnerId ? "-# 🏇 衝刺中…" : "-# 🏇 比賽進行中…");

  return { content: lines.join("\n"), components: [] };
}

// ── 結算 ──
function renderSettledPhase(state) {
  const positions = state.finalPositions || [];
  const rankings = state.rankings || [];
  const winnerHorse = HORSES.find((h) => h.id === rankings[0]);
  const rankMap = new Map();
  rankings.forEach((id, i) => rankMap.set(id, i + 1));

  const lines = [
    `🐎 **賽馬大賽 ・ 結果出爐**`,
    `🏆 冠軍：${winnerHorse ? `${winnerHorse.emoji} **${winnerHorse.name}** ×${winnerHorse.payout.toFixed(1)}` : "—"}`,
    "─────────────────────",
  ];

  for (let i = 0; i < HORSES.length; i++) {
    const h = HORSES[i];
    const rank = rankMap.get(h.id);
    lines.push(
      `${h.id} ${h.emoji} ${renderTrack(positions[i] ?? 0)} ${h.name} ${rank ? rankBadge(rank) : ""}`,
    );
  }

  lines.push("─────────────────────");

  const settles = state.settles || [];
  const totalPool = (state.bets || []).reduce((s, b) => s + b.amount, 0);
  const totalPaid = settles.reduce((s, x) => s + (x.payout || 0), 0);
  lines.push(
    `💰 彩池：**${totalPool.toLocaleString()}** credits ・ 派彩：**${totalPaid.toLocaleString()}**`,
  );

  // 中獎玩家
  const winners = settles.filter((s) => s.payout > 0);
  if (winners.length > 0) {
    lines.push("");
    lines.push("**🎉 中獎玩家**");
    for (const w of winners) {
      lines.push(
        `・<@${w.userId}> 押 ${HORSES.find((h) => h.id === w.horseId)?.name} ${w.amount.toLocaleString()} → +${w.payout.toLocaleString()}`,
      );
    }
  } else if (settles.length > 0) {
    lines.push("");
    lines.push("-# 🥲 本局無人押中，全部下注沒入莊家口袋。");
  }

  return { content: lines.join("\n"), components: [] };
}

function renderCancelled(state, reason = "已取消") {
  const refunds = (state.bets || []).map(
    (b) => `・<@${b.userId}> 退款 ${b.amount.toLocaleString()}`,
  );
  const lines = [
    `🐎 **賽馬大賽 ・ ${reason}**`,
    "─────────────────────",
  ];
  if (refunds.length > 0) {
    lines.push("已下注金額將全額退回：");
    lines.push(...refunds);
  } else {
    lines.push("-# 沒有任何下注，直接取消。");
  }
  return { content: lines.join("\n"), components: [] };
}

module.exports = {
  renderBettingPhase,
  renderRaceFrame,
  renderSettledPhase,
  renderCancelled,
  buildBettingButtons,
  aggregateBetsByHorse,
};
