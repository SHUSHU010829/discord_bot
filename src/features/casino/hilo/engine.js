// HI-LO 核心引擎：純函數，不接觸 DB / Discord。
//
// 規則：
//   - 1 副 52 張，每局重洗
//   - 莊家先翻一張底牌；玩家猜下一張會比底牌「大 (HI)」「小 (LO)」或「相同 (SAME)」
//   - rank 排序：A=1, 2..10, J=11, Q=12, K=13（花色不影響大小）
//   - 猜對 → 賭金累積倍率，新底牌 = 剛翻出的牌，可繼續猜或 Cash Out
//   - 猜錯 → 整局失敗，先前累積全沒
//   - Cash Out → 帶走當前 bet × 累積倍率（含本金）
//   - 至少猜對 1 把才能 Cash Out（避免無風險套利）
//   - 達 maxRounds 後強制結算為 cashout
//
// 倍率計算：
//   依剩餘牌堆中符合「HI / LO / SAME」的數量算公平賠率，
//   再扣 houseEdge 的房費 → 顯示 2 位小數。
//   payout = floor(bet × Π(roundMultipliers))
//
// State：
//   {
//     bet, status: "playing"|"settled",
//     deck: string[],            // 剩下還沒翻的牌
//     baseCard: string,          // 當前底牌
//     history: [{baseCard, guess, drawn, correct, multiplier}],
//     accMultiplier: number,     // 當前累積倍率
//     wins: number,              // 連勝次數（= history.filter(correct).length）
//     houseEdge: number,
//     maxRounds: number,
//     result: "win"|"lose"|"cashout"|null,
//     payout: number,            // 最終派彩（含本金）；輸 = 0
//   }

const { freshShuffledDeck, drawOne, rankOf } = require("../blackjack/deck");

const RANK_VALUE = {
  A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13,
};

const DEFAULT_HOUSE_EDGE = 0.05;
const DEFAULT_MAX_ROUNDS = 10;

function valueOf(card) {
  return RANK_VALUE[rankOf(card)];
}

// 計算下一張牌相對於 baseCard 的三種猜法倍率。
// deck 是剩餘可抽的牌堆（不含 baseCard）。
function calcOdds(baseCard, deck, houseEdge = DEFAULT_HOUSE_EDGE) {
  const baseVal = valueOf(baseCard);
  let hi = 0;
  let lo = 0;
  let same = 0;
  for (const c of deck) {
    const v = valueOf(c);
    if (v > baseVal) hi += 1;
    else if (v < baseVal) lo += 1;
    else same += 1;
  }
  const total = deck.length;
  const edge = Math.max(0, Math.min(0.5, houseEdge));

  function mulFor(count) {
    if (count <= 0 || total <= 0) return 0;
    const fair = total / count;
    const m = fair * (1 - edge);
    // 至少 1.01 才有意義；不到 1 就直接 0（不開放此選項）
    if (m < 1.01) return 0;
    return Math.floor(m * 100) / 100;
  }

  return {
    counts: { hi, lo, same, total },
    multipliers: {
      hi: mulFor(hi),
      lo: mulFor(lo),
      same: mulFor(same),
    },
  };
}

function startGame({
  bet,
  houseEdge = DEFAULT_HOUSE_EDGE,
  maxRounds = DEFAULT_MAX_ROUNDS,
}) {
  let deck = freshShuffledDeck(1);
  let baseCard;
  ({ card: baseCard, deck } = drawOne(deck));
  return {
    bet,
    status: "playing",
    deck,
    baseCard,
    history: [],
    accMultiplier: 1,
    wins: 0,
    houseEdge,
    maxRounds,
    result: null,
    payout: 0,
  };
}

function isCorrect(guess, baseCard, drawn) {
  const a = valueOf(baseCard);
  const b = valueOf(drawn);
  if (guess === "hi") return b > a;
  if (guess === "lo") return b < a;
  if (guess === "same") return b === a;
  return false;
}

// 玩家猜一把
function guess(state, choice) {
  if (state.status !== "playing") return state;
  if (!["hi", "lo", "same"].includes(choice)) return state;

  const odds = calcOdds(state.baseCard, state.deck, state.houseEdge);
  const mul = odds.multipliers[choice];
  // 此選項根本沒倍率（例如 K 還猜 HI、A 還猜 LO）→ 視為猜錯直接結算
  if (mul <= 0) {
    return finalize(
      {
        ...state,
        history: [
          ...state.history,
          {
            baseCard: state.baseCard,
            guess: choice,
            drawn: null,
            correct: false,
            multiplier: 0,
          },
        ],
      },
      "lose",
      0
    );
  }

  const { card: drawn, deck } = drawOne(state.deck);
  const correct = isCorrect(choice, state.baseCard, drawn);
  const entry = {
    baseCard: state.baseCard,
    guess: choice,
    drawn,
    correct,
    multiplier: correct ? mul : 0,
  };

  if (!correct) {
    return finalize(
      {
        ...state,
        deck,
        history: [...state.history, entry],
      },
      "lose",
      0
    );
  }

  const nextAcc = round2(state.accMultiplier * mul);
  const wins = state.wins + 1;
  const next = {
    ...state,
    deck,
    baseCard: drawn,
    history: [...state.history, entry],
    accMultiplier: nextAcc,
    wins,
  };

  // 達到上限 → 強制 cashout
  if (wins >= state.maxRounds) {
    const payout = floorPayout(state.bet, nextAcc);
    return finalize(next, "cashout", payout);
  }

  return next;
}

// 玩家收手
function cashOut(state) {
  if (state.status !== "playing") return state;
  if (state.wins <= 0) return state; // 沒贏過不能收
  const payout = floorPayout(state.bet, state.accMultiplier);
  return finalize(state, "cashout", payout);
}

// bet × multiplier 容易踩浮點誤差（例如 100 × 2.01 = 200.9999…）
// 加 1e-9 epsilon 後 floor，避免少派 1 credit。
function floorPayout(bet, multiplier) {
  return Math.floor(bet * multiplier + 1e-9);
}

function finalize(state, result, payout) {
  return {
    ...state,
    status: "settled",
    result,
    payout,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  startGame,
  guess,
  cashOut,
  calcOdds,
  valueOf,
  RANK_VALUE,
  DEFAULT_HOUSE_EDGE,
  DEFAULT_MAX_ROUNDS,
};
