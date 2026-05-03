// 總點數賠率表（4-17，3 / 18 與圍骰重複所以不開放）
const TOTAL_PAYOUTS = {
  4: 60,
  5: 30,
  6: 17,
  7: 12,
  8: 8,
  9: 6,
  10: 6,
  11: 6,
  12: 6,
  13: 8,
  14: 12,
  15: 17,
  16: 30,
  17: 60,
};

const BET_TYPES = {
  big: { label: "大", payout: 1 },
  small: { label: "小", payout: 1 },
  single: { label: "單骰", payout: null },
  total: { label: "總點數", payout: null },
  double: { label: "對子", payout: 10 },
  triple_specific: { label: "圍骰", payout: 180 },
  triple_any: { label: "任意圍骰", payout: 30 },
};

const NEEDS_VALUE = ["single", "total", "double", "triple_specific"];

function isValidBet(type, value) {
  if (!BET_TYPES[type]) return false;
  if (!NEEDS_VALUE.includes(type)) return true;
  if (value === null || value === undefined) return false;
  if (type === "single" || type === "double" || type === "triple_specific") {
    return Number.isInteger(value) && value >= 1 && value <= 6;
  }
  if (type === "total") {
    return Number.isInteger(value) && value >= 4 && value <= 17;
  }
  return false;
}

function describeBet(type, value) {
  const meta = BET_TYPES[type];
  if (!meta) return "未知";
  const hasValue = value !== null && value !== undefined;
  switch (type) {
    case "big":
      return "大 (11-17)";
    case "small":
      return "小 (4-10)";
    case "single":
      return hasValue ? `單骰 ${value}` : "單骰";
    case "total":
      return hasValue ? `總點數 ${value}` : "總點數";
    case "double":
      return hasValue ? `對子 ${value}` : "對子";
    case "triple_specific":
      return hasValue ? `圍骰 ${value}` : "圍骰";
    case "triple_any":
      return "任意圍骰";
    default:
      return meta.label;
  }
}

module.exports = {
  TOTAL_PAYOUTS,
  BET_TYPES,
  NEEDS_VALUE,
  isValidBet,
  describeBet,
};
