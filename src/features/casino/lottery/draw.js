// 開獎號碼產生器(純函數)。

const { pickRandomNumbers, getLotteryConfig } = require("./numbers");

/**
 * 為指定玩法抽出開獎號碼。
 */
function generateWinningNumbers(lotteryType) {
  const cfg = getLotteryConfig(lotteryType);
  if (!cfg) throw new Error(`unknown lotteryType: ${lotteryType}`);
  return pickRandomNumbers(cfg.pickCount, cfg.range);
}

/**
 * 產生 drawId 字串(以週日日期為 key,符合每週開一期的設計)。
 * @param {Date} scheduledAt 開獎時間
 * @param {string} lotteryType
 * @param {string} dateStr YYYYMMDD,Asia/Taipei
 */
function buildDrawId(dateStr, lotteryType) {
  return `${dateStr}-${lotteryType}`;
}

module.exports = {
  generateWinningNumbers,
  buildDrawId,
};
