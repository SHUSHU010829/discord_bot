// 射龍門核心引擎（單人版）：純函數，不接觸 DB / Discord。
//
// 規則：
//   - 2 副 104 張，每局重洗
//   - 入場費 ante（預設 50）開局即扣，做為房費，不論結果一律不退
//   - 莊家翻兩張柱；若「對柱」或「連柱」則紀錄並從同副牌堆繼續重抽，
//     直到取得「有效柱」（兩柱點數不同且不相鄰）為止
//   - 取得有效柱後玩家抉擇：
//       不補 (fold) → 直接結束，僅損失 ante
//       要補 (bet)  → 玩家指定下注金額 X ∈ [minBet, maxBet]，
//                      鎖倉 2X 後開第三張
//   - 第三張：
//       中間 → 退回 2X + X × 倍率（淨贏 X × 倍率）
//       外面 → 退回 X（淨輸 X，外加 ante）
//       碰柱 → 退回 0（淨輸 2X，外加 ante）
//
// 倍率計算（同原本，依柱牌後剩餘牌堆）：
//   p_b·m − p_o − 2·p_h = −houseEdge
//     ⇒ m = (p_o + 2·p_h − houseEdge) / p_b
//   floor 至兩位小數，最低 1.01。
//
// State：
//   {
//     ante,                           // 入場費（已從玩家餘額扣除）
//     bet, lock,                      // 補注時設定；lock = 2 × bet
//     status: "awaitingChoice"|"settled",
//     deck: string[],                 // 剩餘牌堆
//     gateLow, gateHigh,              // 最終有效柱（依點數小→大）
//     pushHistory: Array<{gateLow,gateHigh,reason:"tie"|"adjacent"}>,
//     thirdCard: string|null,
//     houseEdge,
//     multiplier,                     // 中間命中倍率（淨贏倍數）
//     result: "fold"|"between"|"outside"|"hitGate"|null,
//     payout,                         // 玩家最終取回的金額（不含 ante）
//   }

const { freshShuffledDeck, drawOne, rankOf } = require("../blackjack/deck");

const RANK_VALUE = {
  A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13,
};

const DEFAULT_HOUSE_EDGE = 0.05;
const DEFAULT_ANTE = 50;
const MAX_REDRAWS = 50;

function valueOf(card) {
  return RANK_VALUE[rankOf(card)];
}

function isTie(g1, g2) {
  return valueOf(g1) === valueOf(g2);
}

function isAdjacent(g1, g2) {
  const v1 = valueOf(g1);
  const v2 = valueOf(g2);
  if (Math.abs(v1 - v2) === 1) return true;
  // A 與 K 視為連柱：A 在規則上可當 1 或 14，與 K(13) 相鄰。
  // 否則 A+K 會讓「中間」涵蓋 2~Q 幾乎全部，造成倍率被 floor 到 1.01 而對玩家極度有利。
  const set = new Set([rankOf(g1), rankOf(g2)]);
  if (set.has("A") && set.has("K")) return true;
  return false;
}

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

function calcMultiplier(gateLow, gateHigh, deck, houseEdge = DEFAULT_HOUSE_EDGE) {
  const { between, outside, hit, total } = classifyDeck(gateLow, gateHigh, deck);
  if (total <= 0 || between <= 0) return 0;
  const pB = between / total;
  const pO = outside / total;
  const pH = hit / total;
  const edge = Math.max(0, Math.min(0.5, houseEdge));
  const m = (pO + 2 * pH - edge) / pB;
  if (!Number.isFinite(m)) return 0;
  const floored = Math.floor(m * 100) / 100;
  return Math.max(1.01, floored);
}

function startGame({ ante = DEFAULT_ANTE, houseEdge = DEFAULT_HOUSE_EDGE } = {}) {
  let deck = freshShuffledDeck(2);
  const pushHistory = [];

  let g1;
  let g2;
  let attempts = 0;
  // 重抽直到取得有效柱（非對柱、非連柱）。
  // 理論上 2 副牌 + 12/13 點不衝突的機率夠高，幾乎不會逼近上限。
  // 為了保險仍加上 MAX_REDRAWS 與 deck 長度檢查。
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (deck.length < 3) break;
    ({ card: g1, deck } = drawOne(deck));
    ({ card: g2, deck } = drawOne(deck));
    if (!isTie(g1, g2) && !isAdjacent(g1, g2)) break;
    pushHistory.push({
      gateLow: valueOf(g1) <= valueOf(g2) ? g1 : g2,
      gateHigh: valueOf(g1) <= valueOf(g2) ? g2 : g1,
      reason: isTie(g1, g2) ? "tie" : "adjacent",
    });
    attempts += 1;
    if (attempts >= MAX_REDRAWS) break;
  }

  const [gateLow, gateHigh] =
    valueOf(g1) <= valueOf(g2) ? [g1, g2] : [g2, g1];

  const multiplier = calcMultiplier(gateLow, gateHigh, deck, houseEdge);

  return {
    ante,
    bet: 0,
    lock: 0,
    status: "awaitingChoice",
    deck,
    gateLow,
    gateHigh,
    pushHistory,
    thirdCard: null,
    houseEdge,
    multiplier,
    result: null,
    payout: 0,
  };
}

// 玩家「不補」：棄權，僅損失 ante。
function fold(state) {
  if (state.status !== "awaitingChoice") return state;
  return { ...state, status: "settled", result: "fold", payout: 0 };
}

// 玩家「補」：下注 bet 並開第三張結算。
function shoot(state, bet) {
  if (state.status !== "awaitingChoice") return state;
  if (!Number.isInteger(bet) || bet <= 0) {
    throw new Error("shoot: bet must be a positive integer");
  }

  const { card: drawn, deck } = drawOne(state.deck);
  const lo = Math.min(valueOf(state.gateLow), valueOf(state.gateHigh));
  const hi = Math.max(valueOf(state.gateLow), valueOf(state.gateHigh));
  const v = valueOf(drawn);
  const lock = bet * 2;

  let result;
  let payout;
  if (v === lo || v === hi) {
    result = "hitGate";
    payout = 0;
  } else if (v > lo && v < hi) {
    result = "between";
    const winnings = Math.floor(bet * state.multiplier + 1e-9);
    payout = lock + winnings;
  } else {
    result = "outside";
    payout = bet;
  }

  return {
    ...state,
    bet,
    lock,
    deck,
    thirdCard: drawn,
    status: "settled",
    result,
    payout,
  };
}

module.exports = {
  startGame,
  fold,
  shoot,
  classifyDeck,
  calcMultiplier,
  isTie,
  isAdjacent,
  valueOf,
  RANK_VALUE,
  DEFAULT_HOUSE_EDGE,
  DEFAULT_ANTE,
};
