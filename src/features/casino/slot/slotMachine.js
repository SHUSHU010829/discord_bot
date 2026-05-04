const {
  SYMBOLS,
  TOTAL_WEIGHT,
  TRIPLE_PAYOUTS,
  JACKPOT_SYMBOL,
  TWO_MATCH_MULTIPLIER,
  TWO_CHERRY_BONUS,
} = require("./paytable");

function pickSymbol() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) {
    roll -= sym.weight;
    if (roll < 0) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

function spinReels() {
  return [pickSymbol(), pickSymbol(), pickSymbol()];
}

// 判定中獎類型與倍率（純獎金倍率，不含本金）
function evaluate(reels) {
  const [a, b, c] = reels;
  const allSame = a.id === b.id && b.id === c.id;

  if (allSame) {
    const mult = TRIPLE_PAYOUTS[a.id] ?? 0;
    return {
      matchType: a.id === JACKPOT_SYMBOL ? "jackpot" : "triple",
      multiplier: mult,
      matchKey: `${a.id}-${a.id}-${a.id}`,
      matchedSymbol: a.id,
    };
  }

  // 任兩格相同（左中、中右、左右）
  let matchedSymbol = null;
  if (a.id === b.id || a.id === c.id) matchedSymbol = a.id;
  else if (b.id === c.id) matchedSymbol = b.id;

  if (matchedSymbol) {
    let multiplier = TWO_MATCH_MULTIPLIER;
    let matchType = "double";
    if (matchedSymbol === "cherry") {
      multiplier += TWO_CHERRY_BONUS;
      matchType = "double_cherry";
    }
    return {
      matchType,
      multiplier,
      matchKey: `${matchedSymbol}-${matchedSymbol}-x`,
      matchedSymbol,
    };
  }

  return {
    matchType: "none",
    multiplier: 0,
    matchKey: "none",
    matchedSymbol: null,
  };
}

/**
 * 跑一次抽獎。
 * @param {{ bet: number }} opts
 * @returns {{
 *   reels: Array<{id: string, emoji: string}>,
 *   matchType: "jackpot"|"triple"|"double_cherry"|"double"|"none",
 *   multiplier: number,
 *   payout: number,
 *   matchKey: string,
 *   matchedSymbol: string|null,
 * }}
 */
function spin({ bet }) {
  const reels = spinReels();
  const result = evaluate(reels);
  const payout = result.multiplier > 0 ? Math.floor(bet * result.multiplier) : 0;
  return {
    reels: reels.map((s) => ({ id: s.id, emoji: s.emoji })),
    matchType: result.matchType,
    multiplier: result.multiplier,
    payout,
    matchKey: result.matchKey,
    matchedSymbol: result.matchedSymbol,
  };
}

module.exports = { spin, evaluate, spinReels, pickSymbol };
