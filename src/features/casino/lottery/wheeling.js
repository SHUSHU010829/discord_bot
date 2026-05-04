// 包牌:把 N 個 base 號碼展開成所有 C(N, k) 組票券。

const { generateCombinations, combinationCount, getLotteryConfig } = require("./numbers");

/**
 * 計算包牌總票價與組合數。
 */
function calculateWheelingCost(baseNumberCount, lotteryType, ticketPrice) {
  const cfg = getLotteryConfig(lotteryType);
  if (!cfg) throw new Error(`unknown lotteryType: ${lotteryType}`);
  const combinations = combinationCount(baseNumberCount, cfg.pickCount);
  return {
    combinations,
    totalCost: combinations * ticketPrice,
  };
}

/**
 * 展開包牌號碼,回傳所有組合。
 */
function expandWheel(baseNumbers, lotteryType) {
  const cfg = getLotteryConfig(lotteryType);
  if (!cfg) throw new Error(`unknown lotteryType: ${lotteryType}`);
  return generateCombinations(baseNumbers, cfg.pickCount);
}

module.exports = {
  calculateWheelingCost,
  expandWheel,
};
