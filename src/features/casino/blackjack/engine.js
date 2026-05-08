// 21 點核心引擎：純函數，不接觸 DB / Discord。
//
// 規則（一般賭場 RTP / Preset B）：
//   - 6 副 52 張，每局重洗
//   - 玩家可 hit / stand / double / split
//   - 莊家 ≤16 必補；硬 17 停、軟 17 補（Hit on Soft 17, H17）
//   - Blackjack（兩張 A+10/J/Q/K）賠率 3:2，一般贏 1:1，平手退本金
//   - 分牌（Split）：起手兩張同點數可分牌，需追加一筆等額注；
//     分牌後的 21 不算 BJ；分對 A 只能各補一張且不能再要牌、不能加倍；
//     不支援再分牌（最多兩手）
//
// State 結構：
//   {
//     bet: number,            // 每手原始下注
//     doubled: boolean,       // legacy / 未分牌時的 active hand 是否 double
//     status: "playing"|"settled",
//     deck: string[],         // 剩餘牌堆
//     playerHand: string[],   // 目前 active hand 的牌（=hands[activeIndex].cards）
//     dealerHand: string[],   // 結算前 dealerHand[1] 視為暗牌
//     hands: Array<{
//       cards: string[],
//       bet: number,
//       doubled: boolean,
//       done: boolean,        // 玩家動作已結束（stand/bust/21/double/splitAce）
//       result: string|null,  // 結算後填入：blackjack/win/push/lose
//       payout: number,       // 此手拿回的總額
//       fromSplitAces: boolean,
//     }>,
//     activeIndex: number,    // 目前操作的手序號
//     isSplit: boolean,
//     result: string|null,    // 整局 headline 結果（多手時取最佳）
//     payout: number,         // 全部手加總拿回的總額
//   }

const { freshShuffledDeck, drawOne, rankOf } = require("./deck");
const { evaluateHand, rankValue } = require("./hand");

// 一副牌張數（決定本局共用幾副；6 副為一般賭場標準）
const DECK_COUNT = 6;

// 把舊版（沒有 hands 欄位）的 state/doc 補成新結構，方便升級當下還在進行的局正常 resume。
function ensureHandsShape(state) {
  if (Array.isArray(state.hands) && state.hands.length > 0) return state;
  const hand = {
    cards: state.playerHand,
    bet: state.bet,
    doubled: !!state.doubled,
    done: false,
    result: null,
    payout: 0,
    fromSplitAces: false,
  };
  return {
    ...state,
    hands: [hand],
    activeIndex: 0,
    isSplit: false,
  };
}

function makeHand(cards, bet, fromSplitAces = false) {
  return {
    cards,
    bet,
    doubled: false,
    done: false,
    result: null,
    payout: 0,
    fromSplitAces,
  };
}

function syncActive(state) {
  return {
    ...state,
    playerHand: state.hands[state.activeIndex].cards,
    doubled: state.isSplit ? state.doubled : state.hands[0].doubled,
  };
}

function startGame({ bet }) {
  let deck = freshShuffledDeck(DECK_COUNT);
  const playerHand = [];
  const dealerHand = [];

  // 標準發牌順序：玩家、莊家、玩家、莊家
  ({ card: playerHand[0], deck } = drawOne(deck));
  ({ card: dealerHand[0], deck } = drawOne(deck));
  ({ card: playerHand[1], deck } = drawOne(deck));
  ({ card: dealerHand[1], deck } = drawOne(deck));

  const state = {
    bet,
    doubled: false,
    status: "playing",
    deck,
    playerHand,
    dealerHand,
    hands: [makeHand(playerHand, bet)],
    activeIndex: 0,
    isSplit: false,
    result: null,
    payout: 0,
  };

  // 起手就有 BJ 直接結算
  const playerEval = evaluateHand(playerHand);
  const dealerEval = evaluateHand(dealerHand);
  if (playerEval.isBlackjack || dealerEval.isBlackjack) {
    return settle(state);
  }

  return state;
}

function canSplit(state) {
  if (state.status !== "playing") return false;
  if (state.isSplit) return false;
  if (state.hands.length !== 1) return false;
  const cur = state.hands[0];
  if (cur.cards.length !== 2) return false;
  return rankValue(rankOf(cur.cards[0])) === rankValue(rankOf(cur.cards[1]));
}

function hit(state) {
  if (state.status !== "playing") return state;
  const idx = state.activeIndex;
  const cur = state.hands[idx];
  if (cur.done) return state;
  if (cur.fromSplitAces) return state; // 分對 A 不可再要牌

  const { card, deck } = drawOne(state.deck);
  const newCards = [...cur.cards, card];
  const ev = evaluateHand(newCards);
  const newCur = { ...cur, cards: newCards };
  if (ev.isBust) {
    newCur.done = true;
  } else if (ev.total === 21) {
    newCur.done = true;
  }
  const newHands = state.hands.map((h, i) => (i === idx ? newCur : h));
  return advanceOrSettle({ ...state, deck, hands: newHands });
}

function stand(state) {
  if (state.status !== "playing") return state;
  const idx = state.activeIndex;
  const cur = state.hands[idx];
  if (cur.done) return state;
  const newCur = { ...cur, done: true };
  const newHands = state.hands.map((h, i) => (i === idx ? newCur : h));
  return advanceOrSettle({ ...state, hands: newHands });
}

// double：把玩家加倍下注的責任交給呼叫端（要先扣第二筆 bet）。
// 標記該手 doubled=true，發一張、該手結束。
function doubleDown(state) {
  if (state.status !== "playing") return state;
  const idx = state.activeIndex;
  const cur = state.hands[idx];
  if (cur.done) return state;
  if (cur.cards.length !== 2) return state;
  if (cur.doubled) return state;
  if (cur.fromSplitAces) return state;

  const { card, deck } = drawOne(state.deck);
  const newCards = [...cur.cards, card];
  const newCur = { ...cur, cards: newCards, doubled: true, done: true };
  const newHands = state.hands.map((h, i) => (i === idx ? newCur : h));
  return advanceOrSettle({ ...state, deck, hands: newHands });
}

// split：把第一手拆成兩手，每手各補一張。需要呼叫端先扣第二筆 bet。
function split(state) {
  if (!canSplit(state)) return state;
  const cur = state.hands[0];
  const isAces = rankOf(cur.cards[0]) === "A" && rankOf(cur.cards[1]) === "A";
  const [c1, c2] = cur.cards;

  let deck = state.deck;
  let drawA;
  let drawB;
  ({ card: drawA, deck } = drawOne(deck));
  ({ card: drawB, deck } = drawOne(deck));

  const handA = makeHand([c1, drawA], state.bet, isAces);
  const handB = makeHand([c2, drawB], state.bet, isAces);
  if (isAces) {
    // 分對 A：每手只補一張，自動結束
    handA.done = true;
    handB.done = true;
  } else {
    // 補完牌就 21 → 自動結束該手（同 hit 邏輯）
    if (evaluateHand(handA.cards).total === 21) handA.done = true;
    if (evaluateHand(handB.cards).total === 21) handB.done = true;
  }

  const next = {
    ...state,
    deck,
    isSplit: true,
    hands: [handA, handB],
    activeIndex: 0,
  };
  return advanceOrSettle(next);
}

// 把 active 推進到下一手未完成的牌；若沒有就跑莊家結算。
function advanceOrSettle(state) {
  let idx = state.activeIndex;
  while (idx < state.hands.length && state.hands[idx].done) idx += 1;
  if (idx >= state.hands.length) {
    return settle({ ...state, activeIndex: state.hands.length - 1 });
  }
  return syncActive({ ...state, activeIndex: idx });
}

// 跑莊家流程：硬 17 停、軟 17 補（Hit on Soft 17, H17）。
function playDealer(state) {
  let deck = state.deck;
  let dealerHand = [...state.dealerHand];
  while (true) {
    const ev = evaluateHand(dealerHand);
    if (ev.isBust) break;
    if (ev.total > 17) break;
    if (ev.total === 17 && !ev.isSoft) break;
    const drawn = drawOne(deck);
    deck = drawn.deck;
    dealerHand = [...dealerHand, drawn.card];
  }
  return { ...state, deck, dealerHand };
}

// 對單手（含 BJ / 比點）給出結果與 payout。
function settleHand(hand, dealerEval, isSplit) {
  const ev = evaluateHand(hand.cards);
  const stake = hand.bet * (hand.doubled ? 2 : 1);

  // 玩家爆牌
  if (ev.isBust) {
    return { ...hand, result: "lose", payout: 0 };
  }
  // BJ 只算在「未分牌」且第一手原始兩張就 21 的情況
  const isHandBJ =
    !isSplit && !hand.fromSplitAces && ev.isBlackjack && hand.cards.length === 2;

  if (isHandBJ && dealerEval.isBlackjack) {
    return { ...hand, result: "push", payout: stake };
  }
  if (isHandBJ) {
    return { ...hand, result: "blackjack", payout: Math.floor(hand.bet * 2.5) };
  }
  if (dealerEval.isBlackjack) {
    return { ...hand, result: "lose", payout: 0 };
  }
  if (dealerEval.isBust) {
    return { ...hand, result: "win", payout: stake * 2 };
  }
  if (ev.total > dealerEval.total) {
    return { ...hand, result: "win", payout: stake * 2 };
  }
  if (ev.total < dealerEval.total) {
    return { ...hand, result: "lose", payout: 0 };
  }
  return { ...hand, result: "push", payout: stake };
}

// 多手結算的 headline：依「最佳結果」優先排序，方便畫面顯示一句話總結。
const RESULT_RANK = {
  blackjack: 4,
  win: 3,
  push: 2,
  lose: 1,
};
function pickHeadline(hands) {
  let best = null;
  for (const h of hands) {
    if (!h.result) continue;
    if (!best || (RESULT_RANK[h.result] || 0) > (RESULT_RANK[best] || 0)) {
      best = h.result;
    }
  }
  return best;
}

function settle(state) {
  // 全部手都爆了就不必再讓莊家抽（畫面也直接揭曉暗牌）
  const allBust = state.hands.every((h) => evaluateHand(h.cards).isBust);

  const afterDealer = allBust ? state : playDealer(state);
  const dealerEval = evaluateHand(afterDealer.dealerHand);

  const settledHands = afterDealer.hands.map((h) =>
    settleHand(h, dealerEval, state.isSplit)
  );
  const totalPayout = settledHands.reduce((s, h) => s + h.payout, 0);
  const headline = pickHeadline(settledHands) || "lose";

  const lastIdx = settledHands.length - 1;
  return {
    ...afterDealer,
    hands: settledHands,
    activeIndex: lastIdx,
    playerHand: settledHands[lastIdx].cards,
    doubled: state.isSplit ? state.doubled : settledHands[0].doubled,
    status: "settled",
    result: headline,
    payout: totalPayout,
  };
}

module.exports = {
  startGame,
  hit,
  stand,
  doubleDown,
  split,
  canSplit,
  ensureHandsShape,
  DECK_COUNT,
  // exposed for testing
  settle,
  playDealer,
  settleHand,
};
