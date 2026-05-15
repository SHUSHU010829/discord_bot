// 射龍門核心引擎：純函數，不接觸 DB / Discord。
//
// 規則：
//   - 2 副 104 張，每局重洗
//   - 莊家先翻兩張柱（gates）
//   - 若兩柱「點數相同」(對柱) 或「點數相鄰」(連柱)
//       → 直接和局退錢，本局結束（玩家不必開槍）
//   - 否則玩家可選擇「射」開第三張：
//       中間 (在兩柱點數之間)  → 派彩 = 鎖倉 (2×bet) + bet × 中間倍率
//       外面 (大於高柱或小於低柱) → 派彩 = bet  （等同輸 1× bet）
//       碰柱 (與任一柱同點) → 派彩 = 0（輸 2× bet 雙倍）
//   - 為了保證任何結果都付得起，下注時鎖 2×bet（含碰柱保證金）
//
// 賠率計算（含房費）：依剩餘牌堆即時統計
//   p_b = 中間張數 / 剩餘張數
//   p_o = 外面張數 / 剩餘張數
//   p_h = 碰柱張數 / 剩餘張數
//   m 解出 p_b·m − p_o − 2·p_h = −houseEdge
//     ⇒ m = (p_o + 2·p_h − houseEdge) / p_b
//   floor 至兩位小數，最低 1.01。
//
// State：
//   {
//     bet, lock,                 // 鎖倉 = 2 × bet
//     status: "playing"|"settled",
//     deck: string[],            // 剩餘牌堆（已扣兩柱）
//     gateLow, gateHigh,         // 兩柱（依點數小→大；對柱時 low===high）
//     thirdCard: string|null,    // 開出的第三張
//     houseEdge,
//     multiplier,                // 命中「中間」會拿到的倍率
//     result: "between"|"outside"|"hitGate"|"push"|null,
//     payout,                    // 玩家最終取回的金額（含解除鎖倉）
//   }

const { freshShuffledDeck, drawOne, rankOf } = require("../blackjack/deck");

const RANK_VALUE = {
  A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13,
};

const DEFAULT_HOUSE_EDGE = 0.05;

function valueOf(card) {
  return RANK_VALUE[rankOf(card)];
}

// 依兩柱與剩餘牌堆，回傳 {between, outside, hit, total} 數量及各情況機率。
function classifyDeck(gateLow, gateHigh, deck) {
  const lo = Math.min(valueOf(gateLow), valueOf(gateHigh));
  const hi = Math.max(valueOf(gateLow), valueOf(gateHigh));
  let between = 0;
  let outside = 0;
  let hit = 0;
  for (const c of deck) {
    const v = valueOf(c);
    if (v === lo || v === hi) hit += 1;
    else if (v > lo && v < hi) between += 1;
    else outside += 1;
  }
  return { between, outside, hit, total: deck.length };
}

// 依 EV = -houseEdge 解出「中間」應給的倍率。
function calcMultiplier(gateLow, gateHigh, deck, houseEdge = DEFAULT_HOUSE_EDGE) {
  const { between, outside, hit, total } = classifyDeck(gateLow, gateHigh, deck);
  if (total <= 0 || between <= 0) return 0;
  const pB = between / total;
  const pO = outside / total;
  const pH = hit / total;
  const edge = Math.max(0, Math.min(0.5, houseEdge));
  const m = (pO + 2 * pH - edge) / pB;
  if (!Number.isFinite(m) || m < 1.01) return 0;
  return Math.floor(m * 100) / 100;
}

// 兩柱是否相同點數（對柱）
function isTie(gateLow, gateHigh) {
  return valueOf(gateLow) === valueOf(gateHigh);
}

// 兩柱是否相鄰（差 1）
function isAdjacent(gateLow, gateHigh) {
  return Math.abs(valueOf(gateLow) - valueOf(gateHigh)) === 1;
}

function startGame({ bet, houseEdge = DEFAULT_HOUSE_EDGE }) {
  let deck = freshShuffledDeck(2);
  let g1, g2;
  ({ card: g1, deck } = drawOne(deck));
  ({ card: g2, deck } = drawOne(deck));

  // 依點數排序：低柱在左，高柱在右（純展示用；同點時誰先誰後皆可）
  const [gateLow, gateHigh] =
    valueOf(g1) <= valueOf(g2) ? [g1, g2] : [g2, g1];

  const lock = bet * 2;
  const state = {
    bet,
    lock,
    status: "playing",
    deck,
    gateLow,
    gateHigh,
    thirdCard: null,
    houseEdge,
    multiplier: 0,
    result: null,
    payout: 0,
  };

  // 對柱或連柱：直接和局退錢
  if (isTie(gateLow, gateHigh) || isAdjacent(gateLow, gateHigh)) {
    return finalize(state, "push", lock);
  }

  state.multiplier = calcMultiplier(gateLow, gateHigh, deck, houseEdge);
  // 倍率算不出來（理論上不會走到，因為對柱／連柱已先 push）→ 也視為和局
  if (state.multiplier <= 0) {
    return finalize(state, "push", lock);
  }
  return state;
}

// 玩家「射」一槍
function shoot(state) {
  if (state.status !== "playing") return state;
  const { card: drawn, deck } = drawOne(state.deck);
  const next = { ...state, deck, thirdCard: drawn };

  const lo = Math.min(valueOf(state.gateLow), valueOf(state.gateHigh));
  const hi = Math.max(valueOf(state.gateLow), valueOf(state.gateHigh));
  const v = valueOf(drawn);

  if (v === lo || v === hi) {
    // 碰柱：輸 2×bet（鎖倉全沒）
    return finalize(next, "hitGate", 0);
  }
  if (v > lo && v < hi) {
    // 中間：派彩 = 解除鎖倉 + 中間倍率獎金
    const winnings = Math.floor(state.bet * state.multiplier + 1e-9);
    return finalize(next, "between", state.lock + winnings);
  }
  // 外面：派彩 = bet（解除鎖倉一半 → 等同輸 1×bet）
  return finalize(next, "outside", state.bet);
}

function finalize(state, result, payout) {
  return {
    ...state,
    status: "settled",
    result,
    payout,
  };
}

module.exports = {
  startGame,
  shoot,
  classifyDeck,
  calcMultiplier,
  isTie,
  isAdjacent,
  valueOf,
  RANK_VALUE,
  DEFAULT_HOUSE_EDGE,
};
