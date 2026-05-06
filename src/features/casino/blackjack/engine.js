// 21 點核心引擎：純函數，不接觸 DB / Discord。
//
// 設計簡化版規則（無 split、無 insurance、無 surrender）：
//   - 1 副 52 張，每局重洗
//   - 玩家可 hit / stand / double
//   - 莊家 ≥17 必停（含 soft 17，不 hit S17）
//   - Blackjack（兩張 A+10/J/Q/K）賠率 3:2，一般贏 1:1，平手退本金
//   - 過五關（Five-Card Charlie）：玩家持有 5 張未爆牌自動獲勝，賠率 2:1
//   - 莊家過五關：莊家拿到 5 張未爆牌則莊家勝（玩家 BJ / 玩家過五關優先結算，不受影響）
//
// State 結構：
//   {
//     bet: number,            // 原始下注（double 後 doubled=true，但 bet 不變）
//     doubled: boolean,
//     status: "playing"|"settled",
//     deck: string[],         // 剩餘牌堆
//     playerHand: string[],
//     dealerHand: string[],   // 結算前 dealerHand[1] 視為暗牌
//     result: "blackjack"|"fivecard"|"dealerfivecard"|"win"|"push"|"lose"|null,
//     payout: number,         // 拿回的總額（含本金）；輸 = 0
//   }

const { freshShuffledDeck, drawOne } = require("./deck");
const { evaluateHand } = require("./hand");

// 過五關門檻：抽到第 N 張未爆牌即自動結算為過五關
const FIVE_CARD_THRESHOLD = 5;
// 過五關賠率倍數（拿回的總額 = 注額 × 此倍數）。3 = 2:1 賠率（本金 + 2 倍贏額）
const FIVE_CARD_PAYOUT_MULTIPLIER = 3;

function startGame({ bet, deckCount = 1 }) {
  let deck = freshShuffledDeck(deckCount);
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
    deckCount: Math.max(1, Math.floor(deckCount)),
    status: "playing",
    deck,
    playerHand,
    dealerHand,
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

function hit(state) {
  if (state.status !== "playing") return state;
  const { card, deck } = drawOne(state.deck);
  const playerHand = [...state.playerHand, card];
  const next = { ...state, deck, playerHand };
  const ev = evaluateHand(playerHand);
  if (ev.isBust) {
    return settle(next);
  }
  // 過五關：抽到第 5 張未爆牌，自動獲勝
  if (playerHand.length >= FIVE_CARD_THRESHOLD) {
    return settle(next);
  }
  // 玩家湊到 21 自動 stand（不可能再 hit 出更好結果）
  if (ev.total === 21) {
    return settle(next);
  }
  return next;
}

function stand(state) {
  if (state.status !== "playing") return state;
  return settle(state);
}

// double：把玩家加倍下注的責任交給呼叫端（要先扣第二筆 bet）。
// 這裡只標記 doubled=true，發一張、自動結算。
function doubleDown(state) {
  if (state.status !== "playing") return state;
  if (state.playerHand.length !== 2) return state;
  const { card, deck } = drawOne(state.deck);
  const playerHand = [...state.playerHand, card];
  const next = {
    ...state,
    deck,
    playerHand,
    doubled: true,
  };
  return settle(next);
}

// 跑莊家流程：≥17 停、否則繼續抽（含 soft 17 也停 = stand on all 17）。
function playDealer(state) {
  let deck = state.deck;
  let dealerHand = [...state.dealerHand];
  while (true) {
    const ev = evaluateHand(dealerHand);
    if (ev.isBust) break;
    if (ev.total >= 17) break;
    if (dealerHand.length >= FIVE_CARD_THRESHOLD) break;
    const drawn = drawOne(deck);
    deck = drawn.deck;
    dealerHand = [...dealerHand, drawn.card];
  }
  return { ...state, deck, dealerHand };
}

function settle(state) {
  const playerEval = evaluateHand(state.playerHand);

  // 玩家爆牌：直接輸（不看莊家）
  if (playerEval.isBust) {
    return finalize(state, "lose", 0);
  }

  const totalStake = state.bet * (state.doubled ? 2 : 1);

  // 過五關：玩家持有 5 張以上未爆牌 → 自動獲勝，不比莊家點數
  // 仍把莊家牌跑完讓畫面看得到完整對局，但結果固定
  if (state.playerHand.length >= FIVE_CARD_THRESHOLD) {
    const afterDealer = playDealer(state);
    return finalize(
      afterDealer,
      "fivecard",
      totalStake * FIVE_CARD_PAYOUT_MULTIPLIER
    );
  }

  // 跑莊家
  const afterDealer = playDealer(state);
  const dealerEval = evaluateHand(afterDealer.dealerHand);

  // BJ 對撞 → push
  if (playerEval.isBlackjack && dealerEval.isBlackjack) {
    return finalize(afterDealer, "push", totalStake);
  }
  // 玩家 BJ → 3:2（payout = bet × 2.5），double 過的話不會走到這（doubled 後手牌一定 ≥3 張）
  if (playerEval.isBlackjack) {
    return finalize(afterDealer, "blackjack", Math.floor(state.bet * 2.5));
  }
  // 莊家 BJ → 玩家輸
  if (dealerEval.isBlackjack) {
    return finalize(afterDealer, "lose", 0);
  }
  // 莊家爆 → 玩家贏
  if (dealerEval.isBust) {
    return finalize(afterDealer, "win", totalStake * 2);
  }
  // 莊家過五關：莊家持有 5 張未爆牌 → 莊家獲勝
  if (afterDealer.dealerHand.length >= FIVE_CARD_THRESHOLD) {
    return finalize(afterDealer, "dealerfivecard", 0);
  }
  // 比點數
  if (playerEval.total > dealerEval.total) {
    return finalize(afterDealer, "win", totalStake * 2);
  }
  if (playerEval.total < dealerEval.total) {
    return finalize(afterDealer, "lose", 0);
  }
  return finalize(afterDealer, "push", totalStake);
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
  hit,
  stand,
  doubleDown,
  FIVE_CARD_THRESHOLD,
  FIVE_CARD_PAYOUT_MULTIPLIER,
  // exposed for testing
  settle,
  playDealer,
};
