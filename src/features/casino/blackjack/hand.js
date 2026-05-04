// 計算 21 點手牌點數，自動處理 A 軟硬。
//
// 演算法：先把所有 A 都當 1 加總，再嘗試把其中一張 A 升成 11
// 只要不會爆牌就升，這樣就能正確處理多 A 的情況（例如 A+A = 12 軟、A+A+9 = 21 軟）。

const { rankOf } = require("./deck");

function rankValue(rank) {
  if (rank === "A") return 1;
  if (rank === "T" || rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

function evaluateHand(cards) {
  if (!cards || cards.length === 0) {
    return { total: 0, isSoft: false, isBust: false, isBlackjack: false };
  }

  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    total += rankValue(r);
    if (r === "A") aces += 1;
  }

  // 嘗試把一張 A 升成 11（+10），不爆牌就升。最多升一張，因為再升一張就是 +20 必爆。
  let isSoft = false;
  if (aces > 0 && total + 10 <= 21) {
    total += 10;
    isSoft = true;
  }

  const isBust = total > 21;
  const isBlackjack = cards.length === 2 && total === 21;

  return { total, isSoft, isBust, isBlackjack };
}

module.exports = { evaluateHand, rankValue };
