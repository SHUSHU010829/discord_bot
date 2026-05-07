// 賽馬訊息渲染：用文字字符組出每幀「跑道」，含 odds 表與結果說明。

const { HORSES, TRACK_LENGTH } = require("./engine");

function renderTrack(pos) {
  const reached = pos >= TRACK_LENGTH;
  const left = "━".repeat(Math.min(pos, TRACK_LENGTH));
  const right = "·".repeat(Math.max(0, TRACK_LENGTH - pos));
  return reached ? `${left}🏁` : `${left}${right}🏁`;
}

function renderRow(horse, pos, opts = {}) {
  const { isPlayerPick, finishedRank } = opts;
  const marker = isPlayerPick ? "👉" : "  ";
  const rank = finishedRank ? ` ${rankBadge(finishedRank)}` : "";
  return `${marker}${horse.id} ${horse.emoji} ${renderTrack(pos)} ${horse.name}${rank}`;
}

function rankBadge(n) {
  if (n === 1) return "🥇";
  if (n === 2) return "🥈";
  if (n === 3) return "🥉";
  return `#${n}`;
}

function buildOddsTable(playerHorseId) {
  return HORSES.map((h) => {
    const tag = h.id === playerHorseId ? "👉" : "・";
    return `${tag}${h.id} ${h.emoji} **${h.name}** — ×${h.payout.toFixed(1)}`;
  }).join("\n");
}

// 比賽進行中的某一幀
function renderFrame({
  positions,
  username,
  bet,
  horse,
  rankings = null,
  status = "running", // running | finished
}) {
  const handle = username ? `@${username}` : "";
  const rankMap = new Map();
  if (rankings) {
    rankings.forEach((id, i) => rankMap.set(id, i + 1));
  }

  const lines = [
    `🐎 **賽馬大賽** ・ Bet: **${bet.toLocaleString()}** ・ 押 ${horse.emoji} **${horse.name}** (×${horse.payout.toFixed(1)})${handle ? ` ・ ${handle}` : ""}`,
    "─────────────────────",
  ];

  for (let i = 0; i < HORSES.length; i++) {
    const h = HORSES[i];
    lines.push(
      renderRow(h, positions[i], {
        isPlayerPick: h.id === horse.id,
        finishedRank: rankMap.get(h.id),
      }),
    );
  }

  if (status === "running") {
    lines.push("─────────────────────");
    lines.push("-# 🏇 比賽進行中…");
  }

  return lines.join("\n");
}

function renderSettleHeadline({ won, payout, bet, winnerHorse, playerHorse }) {
  if (won) {
    const profit = payout - bet;
    return `🏆 **${winnerHorse.emoji} ${winnerHorse.name} 第一！** 你押對了，拿走 **${payout.toLocaleString()}** credits（淨賺 +${profit.toLocaleString()}）`;
  }
  return `💸 **${winnerHorse.emoji} ${winnerHorse.name} 跑第一！** 你押的 ${playerHorse.emoji} ${playerHorse.name} 沒中，−${bet.toLocaleString()} credits`;
}

function renderFinalMessage({
  positions,
  username,
  bet,
  horse: playerHorse,
  rankings,
  won,
  payout,
  balance,
}) {
  const winnerHorse = HORSES.find((h) => h.id === rankings[0]);
  const handle = username ? `@${username}` : "";

  const rankMap = new Map();
  rankings.forEach((id, i) => rankMap.set(id, i + 1));

  const lines = [
    `🐎 **賽馬大賽** ・ Bet: **${bet.toLocaleString()}** ・ 押 ${playerHorse.emoji} **${playerHorse.name}** (×${playerHorse.payout.toFixed(1)})${handle ? ` ・ ${handle}` : ""}`,
    "─────────────────────",
  ];

  for (let i = 0; i < HORSES.length; i++) {
    const h = HORSES[i];
    lines.push(
      renderRow(h, positions[i], {
        isPlayerPick: h.id === playerHorse.id,
        finishedRank: rankMap.get(h.id),
      }),
    );
  }

  lines.push("─────────────────────");
  lines.push(
    renderSettleHeadline({
      won,
      payout,
      bet,
      winnerHorse,
      playerHorse,
    }),
  );
  if (typeof balance === "number") {
    lines.push(`餘額：**${balance.toLocaleString()}** credits`);
  }

  return lines.join("\n");
}

module.exports = {
  renderFrame,
  renderFinalMessage,
  buildOddsTable,
  rankBadge,
};
