// 德州撲克手牌評估：7 張取 5 張最佳。
// 評分結構：[category, ...tiebreakers]，element-wise 比大小即可。
// category 越大越好。
//
// 9 STRAIGHT_FLUSH    [9, topRank]
// 8 FOUR_OF_A_KIND    [8, quadRank, kicker]
// 7 FULL_HOUSE        [7, tripRank, pairRank]
// 6 FLUSH             [6, r1, r2, r3, r4, r5]
// 5 STRAIGHT          [5, topRank]
// 4 THREE_OF_A_KIND   [4, tripRank, k1, k2]
// 3 TWO_PAIR          [3, hiPairRank, loPairRank, kicker]
// 2 ONE_PAIR          [2, pairRank, k1, k2, k3]
// 1 HIGH_CARD         [1, r1, r2, r3, r4, r5]

const { rankOf, suitOf } = require("./deck");

const RANK_VALUE = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const CATEGORY_LABEL = {
  9: "同花順",
  8: "四條",
  7: "葫蘆",
  6: "同花",
  5: "順子",
  4: "三條",
  3: "兩對",
  2: "一對",
  1: "高牌",
};

function valueOf(card) {
  return RANK_VALUE[rankOf(card)];
}

// 從 ranks（已排序、已去重、由大至小）裡找最大連續 5 張的最高點。回傳 topRank 或 null。
function findStraightTop(rankSetDesc) {
  // rankSetDesc 是 number[] desc，已 unique
  // 處理輪 (A-2-3-4-5)：若有 A(=14)，再補一張 1
  const arr = rankSetDesc.includes(14) ? [...rankSetDesc, 1] : rankSetDesc;
  let run = 1;
  for (let i = 1; i < arr.length; i += 1) {
    if (arr[i] === arr[i - 1] - 1) {
      run += 1;
      if (run >= 5) return arr[i - 4];
    } else if (arr[i] === arr[i - 1]) {
      // 不該發生（已 unique），保險
      continue;
    } else {
      run = 1;
    }
  }
  return null;
}

function evaluate7(cards) {
  if (!cards || cards.length < 5) {
    throw new Error("poker: evaluate7 needs >=5 cards");
  }

  const values = cards.map(valueOf);
  const suits = cards.map((c) => suitOf(c));

  // 依 suit 分組找 flush
  const bySuit = { S: [], H: [], D: [], C: [] };
  for (let i = 0; i < cards.length; i += 1) {
    bySuit[suits[i]].push(values[i]);
  }
  let flushSuit = null;
  for (const s of Object.keys(bySuit)) {
    if (bySuit[s].length >= 5) {
      flushSuit = s;
      break;
    }
  }

  // 依 rank 分組計次
  const countByRank = new Map();
  for (const v of values) {
    countByRank.set(v, (countByRank.get(v) || 0) + 1);
  }
  // [rank, count] 由 (count desc, rank desc) 排序
  const groups = [...countByRank.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const uniqDesc = [...countByRank.keys()].sort((a, b) => b - a);

  // 同花順
  if (flushSuit) {
    const flushVals = [...new Set(bySuit[flushSuit])].sort((a, b) => b - a);
    const sfTop = findStraightTop(flushVals);
    if (sfTop !== null) {
      return [9, sfTop];
    }
  }

  // 四條
  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = uniqDesc.find((v) => v !== quad);
    return [8, quad, kicker];
  }

  // 葫蘆（含三條+對 / 三條+三條 取較大三條）
  if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) {
    return [7, groups[0][0], groups[1][0]];
  }

  // 同花
  if (flushSuit) {
    const top5 = [...bySuit[flushSuit]].sort((a, b) => b - a).slice(0, 5);
    return [6, ...top5];
  }

  // 順子
  const stTop = findStraightTop(uniqDesc);
  if (stTop !== null) {
    return [5, stTop];
  }

  // 三條
  if (groups[0][1] === 3) {
    const trip = groups[0][0];
    const kickers = uniqDesc.filter((v) => v !== trip).slice(0, 2);
    return [4, trip, ...kickers];
  }

  // 兩對
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const hi = groups[0][0];
    const lo = groups[1][0];
    const kicker = uniqDesc.find((v) => v !== hi && v !== lo);
    return [3, hi, lo, kicker];
  }

  // 一對
  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = uniqDesc.filter((v) => v !== pair).slice(0, 3);
    return [2, pair, ...kickers];
  }

  // 高牌
  return [1, ...uniqDesc.slice(0, 5)];
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function categoryLabel(score) {
  return CATEGORY_LABEL[score?.[0]] || "?";
}

module.exports = {
  evaluate7,
  compareScores,
  categoryLabel,
  RANK_VALUE,
  CATEGORY_LABEL,
};
