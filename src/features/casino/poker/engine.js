// 德州撲克核心引擎 — 純函數，不接觸 DB / Discord。
// 玩家籌碼存在 state.players[i].chips（桌上籌碼），開桌 / 結算時才跟 userCoins 對接。
//
// State 結構見 README 註解（command / handler 註冊時填好 channelId, gameId 等）：
//   status: "waiting" | "playing" | "settled" | "abandoned"
//   phase: null | "preflop" | "flop" | "turn" | "river" | "showdown"
//   players: [{ userId, username, chips, bet, totalBet, hasActed, folded, allIn, busted, holeCards }]

const { freshShuffledDeck } = require("./deck");
const { evaluate7, compareScores } = require("./hand");

function activeIndices(state) {
  // 沒 fold 沒 busted 的座位（含 allIn）
  return state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.folded && !p.busted)
    .map(({ i }) => i);
}

function actableIndices(state) {
  // 可行動者（沒 fold 沒 allIn 沒 busted）
  return state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.folded && !p.busted && !p.allIn)
    .map(({ i }) => i);
}

function nextSeatFrom(state, fromIdx, predicate) {
  const n = state.players.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIdx + step) % n;
    if (predicate(state.players[idx], idx)) return idx;
  }
  return -1;
}

// 起新一局：洗牌 → 推 button → 貼盲 → 發 hole cards → 設 toAct
function startHand(state) {
  const eligible = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !p.busted && p.chips > 0);
  if (eligible.length < 2) {
    // 沒人玩：不開
    return { ...state, status: "settled", phase: null };
  }

  // button 推到下一個 eligible
  const fromButton = state.buttonIdx ?? -1;
  let buttonIdx;
  if (fromButton < 0) {
    buttonIdx = eligible[0].i;
  } else {
    buttonIdx = nextSeatFrom(
      { players: state.players },
      fromButton,
      (p, idx) => !p.busted && p.chips > 0
    );
    if (buttonIdx < 0) buttonIdx = eligible[0].i;
  }

  // 重置玩家本局狀態
  const players = state.players.map((p) => ({
    ...p,
    bet: 0,
    totalBet: 0,
    hasActed: false,
    folded: !!p.busted, // busted 視為已退出
    allIn: false,
    holeCards: [],
  }));

  let deck = freshShuffledDeck();

  // 找盲注座位
  // 兩人單挑：button = SB，另一位 = BB
  // 多人：button 後一位 = SB，再下一位 = BB
  const eligibleNow = (idx) => !players[idx].busted && players[idx].chips > 0;
  const sbIdx =
    eligible.length === 2
      ? buttonIdx
      : nextSeatFrom({ players }, buttonIdx, (p, i) => eligibleNow(i));
  const bbIdx = nextSeatFrom({ players }, sbIdx, (p, i) => eligibleNow(i));

  // 貼盲（不夠就 all-in）
  const postBlind = (idx, amount) => {
    const p = players[idx];
    const pay = Math.min(p.chips, amount);
    p.chips -= pay;
    p.bet = pay;
    p.totalBet = pay;
    if (p.chips === 0) p.allIn = true;
  };
  postBlind(sbIdx, state.smallBlind);
  postBlind(bbIdx, state.bigBlind);

  // 發 hole cards (2 張一輪一輪發)
  const order = [];
  for (let step = 1; step <= eligible.length; step += 1) {
    order.push((sbIdx + step - 1) % players.length);
  }
  // 注意 order 須限定在 eligible
  const dealOrder = order.filter((i) => eligibleNow(i));
  for (let round = 0; round < 2; round += 1) {
    for (const idx of dealOrder) {
      players[idx].holeCards.push(deck.shift());
    }
  }

  // toAct：preflop 是 BB 後一位（heads-up 是 button=SB 先動）
  let toActIdx;
  if (eligible.length === 2) {
    toActIdx = buttonIdx; // = SB
  } else {
    toActIdx = nextSeatFrom({ players }, bbIdx, (p, i) => eligibleNow(i) && !players[i].allIn);
    if (toActIdx < 0) toActIdx = bbIdx;
  }

  return {
    ...state,
    status: "playing",
    phase: "preflop",
    deck,
    community: [],
    players,
    buttonIdx,
    sbIdx,
    bbIdx,
    toActIdx,
    currentBet: state.bigBlind,
    minRaise: state.bigBlind,
    lastAggressorIdx: bbIdx, // preflop 沒人 raise 時 BB 為「上次加注者」
    pot: 0, // pot 採「結算時計算」（用 totalBet）。這裡保留即時顯示用
    handNumber: (state.handNumber || 0) + 1,
    settle: null,
  };
}

function totalPot(state) {
  return state.players.reduce((sum, p) => sum + (p.totalBet || 0), 0);
}

function legalActions(state, idx) {
  const p = state.players[idx];
  if (!p || p.folded || p.busted || p.allIn) return [];
  if (state.status !== "playing") return [];
  if (state.phase === "showdown") return [];
  if (idx !== state.toActIdx) return [];

  const toCall = Math.max(0, state.currentBet - p.bet);
  const acts = ["fold"];
  if (toCall === 0) acts.push("check");
  else acts.push("call");
  // bet/raise 按鈕統一叫 raise（沒 currentBet 時 = 開分）
  if (p.chips > toCall) acts.push("raise");
  if (p.chips > 0) acts.push("allin");
  return acts;
}

// raiseTo: 玩家想把本輪 bet 拉到的「總額」（不是加多少）。
// 合法性：raiseTo - currentBet >= minRaise，且 raiseTo - p.bet <= p.chips（含等於 = all-in）。
// 不合法時回傳 { error }。
function applyAction(state, idx, action, { raiseTo } = {}) {
  if (!legalActions(state, idx).includes(action)) {
    return { error: "ILLEGAL_ACTION" };
  }
  const players = state.players.map((p) => ({ ...p }));
  const p = players[idx];
  let { currentBet, minRaise, lastAggressorIdx } = state;

  if (action === "fold") {
    p.folded = true;
    p.hasActed = true;
  } else if (action === "check") {
    p.hasActed = true;
  } else if (action === "call") {
    const toCall = Math.max(0, currentBet - p.bet);
    const pay = Math.min(p.chips, toCall);
    p.chips -= pay;
    p.bet += pay;
    p.totalBet += pay;
    if (p.chips === 0) p.allIn = true;
    p.hasActed = true;
  } else if (action === "raise") {
    if (typeof raiseTo !== "number" || !Number.isFinite(raiseTo)) {
      return { error: "INVALID_RAISE" };
    }
    raiseTo = Math.floor(raiseTo);
    const maxTo = p.bet + p.chips; // all-in raiseTo 上限
    if (raiseTo > maxTo) return { error: "RAISE_OVER_STACK" };
    const isAllIn = raiseTo === maxTo;
    const incremental = raiseTo - currentBet;
    if (!isAllIn && incremental < minRaise) {
      return { error: "RAISE_BELOW_MIN" };
    }
    if (raiseTo <= currentBet && !(currentBet === 0 && raiseTo > 0)) {
      // 沒人開分時，raiseTo 必須 > 0
      return { error: "RAISE_TOO_LOW" };
    }
    const pay = raiseTo - p.bet;
    p.chips -= pay;
    p.bet = raiseTo;
    p.totalBet += pay;
    if (p.chips === 0) p.allIn = true;
    p.hasActed = true;

    // 只有「足額」加注才更新 minRaise 並重置其他人 hasActed
    if (incremental >= minRaise) {
      minRaise = incremental;
      for (let i = 0; i < players.length; i += 1) {
        if (i !== idx && !players[i].folded && !players[i].busted && !players[i].allIn) {
          players[i].hasActed = false;
        }
      }
      lastAggressorIdx = idx;
    }
    currentBet = raiseTo;
  } else if (action === "allin") {
    const pay = p.chips;
    if (pay <= 0) return { error: "NO_CHIPS" };
    const newBet = p.bet + pay;
    p.chips = 0;
    p.bet = newBet;
    p.totalBet += pay;
    p.allIn = true;
    p.hasActed = true;

    if (newBet > currentBet) {
      const incremental = newBet - currentBet;
      if (incremental >= minRaise) {
        minRaise = incremental;
        for (let i = 0; i < players.length; i += 1) {
          if (i !== idx && !players[i].folded && !players[i].busted && !players[i].allIn) {
            players[i].hasActed = false;
          }
        }
        lastAggressorIdx = idx;
      }
      currentBet = newBet;
    }
  }

  let next = { ...state, players, currentBet, minRaise, lastAggressorIdx };

  // 如果只剩一個未 fold 玩家 → 立刻結算
  const stillIn = next.players.filter((pp) => !pp.folded && !pp.busted);
  if (stillIn.length === 1) {
    return { state: settleHand(next), result: "ended-folds" };
  }

  // 是否本輪結束
  if (isRoundClosed(next)) {
    next = advanceStreet(next);
  } else {
    // 換下一個可行動者
    const nIdx = nextSeatFrom(next, idx, (pp, i) => !pp.folded && !pp.busted && !pp.allIn);
    next = { ...next, toActIdx: nIdx };
  }

  return { state: next };
}

function isRoundClosed(state) {
  const acts = actableIndices(state);
  if (acts.length === 0) return true;
  for (const i of acts) {
    const p = state.players[i];
    if (!p.hasActed) return false;
    if (p.bet !== state.currentBet) return false;
  }
  return true;
}

// 推進到下一條街；如果只剩 ≤1 可動者且還有街，自動發完所有公共牌再進攤牌。
function advanceStreet(state) {
  // 先把本輪 bet 收入 pot 概念（我們以 totalBet 為準，所以實際上 pot 就是 sum(totalBet)）
  let next = { ...state };
  next.players = next.players.map((p) => ({ ...p, bet: 0, hasActed: false }));
  next.currentBet = 0;
  next.minRaise = state.bigBlind;

  // 還能行動的人 ≤ 1：直接快速發完剩餘公共牌然後進攤牌
  const fastForward = actableIndices(next).length <= 1;

  const dealCommunity = (n) => {
    for (let i = 0; i < n; i += 1) {
      next.deck.shift(); // burn
      next.community.push(next.deck.shift());
    }
  };

  const goNextPhase = () => {
    if (next.phase === "preflop") {
      next.phase = "flop";
      dealCommunity(3);
    } else if (next.phase === "flop") {
      next.phase = "turn";
      dealCommunity(1);
    } else if (next.phase === "turn") {
      next.phase = "river";
      dealCommunity(1);
    } else if (next.phase === "river") {
      next.phase = "showdown";
    }
  };

  goNextPhase();

  if (fastForward && next.phase !== "showdown") {
    while (next.phase !== "showdown") {
      goNextPhase();
    }
  }

  if (next.phase === "showdown") {
    return settleHand(next);
  }

  // 設下一個行動者：button 後第一個 actable
  const start = state.buttonIdx;
  const nextIdx = nextSeatFrom(
    next,
    start,
    (pp, i) => !pp.folded && !pp.busted && !pp.allIn
  );
  next.toActIdx = nextIdx;
  // 沒人能動（全 all-in，但不是 fastForward 已處理）：再推進
  if (nextIdx < 0) {
    return advanceStreet(next);
  }
  // lastAggressorIdx 重置：本街尚無加注時，由 toActIdx 之前那位「視為」上次加注者
  // 這裡其實只在 isRoundClosed 上比 hasActed/currentBet，所以不用更新也 OK
  return next;
}

// 計算邊池（side pots）：依 totalBet 切層
function computeSidePots(players) {
  const contributors = players
    .map((p) => ({ userId: p.userId, totalBet: p.totalBet || 0, folded: !!p.folded }))
    .filter((p) => p.totalBet > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((p) => p.totalBet))].sort((a, b) => a - b);

  const pots = [];
  let prev = 0;
  for (const lvl of levels) {
    let chips = 0;
    for (const p of contributors) {
      if (p.totalBet > prev) {
        chips += Math.min(p.totalBet, lvl) - prev;
      }
    }
    const eligible = contributors
      .filter((p) => !p.folded && p.totalBet >= lvl)
      .map((p) => p.userId);
    if (chips > 0) {
      if (eligible.length === 0) {
        // 沒贏家：合併到前一個池（或新建一個無人贏的池待併入）
        if (pots.length) pots[pots.length - 1].amount += chips;
        else pots.push({ amount: chips, eligible: [] });
      } else {
        pots.push({ amount: chips, eligible });
      }
    }
    prev = lvl;
  }
  return pots;
}

// 攤牌或棄牌結算
function settleHand(state) {
  const stillIn = state.players.filter((p) => !p.folded && !p.busted);
  const sidePots = computeSidePots(state.players);

  // 對所有 stillIn 玩家評分
  const scores = new Map();
  if (stillIn.length > 1 && state.community.length === 5) {
    for (const p of stillIn) {
      scores.set(p.userId, evaluate7([...p.holeCards, ...state.community]));
    }
  }

  // 派彩
  const players = state.players.map((p) => ({ ...p }));
  const winnersByPot = [];
  for (const pot of sidePots) {
    if (pot.eligible.length === 0) continue;
    let potWinners;
    if (stillIn.length === 1) {
      potWinners = pot.eligible.includes(stillIn[0].userId) ? [stillIn[0].userId] : pot.eligible;
    } else if (state.community.length < 5) {
      // 異常：未到 river 但已要結算（不該到這）
      potWinners = pot.eligible;
    } else {
      // 取 pot.eligible 中分數最高者（可能多人平手）
      let best = null;
      let winners = [];
      for (const uid of pot.eligible) {
        const sc = scores.get(uid);
        if (!sc) continue;
        if (best === null || compareScores(sc, best) > 0) {
          best = sc;
          winners = [uid];
        } else if (compareScores(sc, best) === 0) {
          winners.push(uid);
        }
      }
      potWinners = winners.length ? winners : pot.eligible;
    }

    // 平分，餘數從 button 後第一位起發
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;
    const seatOrder = [];
    for (let step = 1; step <= players.length; step += 1) {
      const i = (state.buttonIdx + step) % players.length;
      seatOrder.push(players[i].userId);
    }
    const orderedWinners = seatOrder.filter((uid) => potWinners.includes(uid));

    const splits = orderedWinners.map((uid) => {
      let amt = share;
      if (remainder > 0) {
        amt += 1;
        remainder -= 1;
      }
      const target = players.find((pp) => pp.userId === uid);
      if (target) target.chips += amt;
      return { userId: uid, amount: amt };
    });
    winnersByPot.push({ amount: pot.amount, splits });
  }

  // busted 標記
  for (const p of players) {
    if (!p.busted && p.chips <= 0) p.busted = true;
  }

  return {
    ...state,
    status: "settled",
    phase: "showdown",
    players,
    toActIdx: -1,
    settle: {
      showdown: stillIn.length > 1 && state.community.length === 5,
      community: state.community,
      winners: winnersByPot,
      scores: stillIn.map((p) => ({
        userId: p.userId,
        score: scores.get(p.userId) || null,
        holeCards: p.holeCards,
      })),
    },
  };
}

module.exports = {
  startHand,
  applyAction,
  legalActions,
  isRoundClosed,
  advanceStreet,
  settleHand,
  computeSidePots,
  totalPot,
  activeIndices,
  actableIndices,
  nextSeatFrom,
};
