// src/features/casino/roulette/numbers.js

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK_NUMS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

const WHEEL_ORDER = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,
  24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26,
];

const COL1 = new Set([1,4,7,10,13,16,19,22,25,28,31,34]);
const COL2 = new Set([2,5,8,11,14,17,20,23,26,29,32,35]);
const COL3 = new Set([3,6,9,12,15,18,21,24,27,30,33,36]);

const BET_TYPES = {
  // 外圍 1:1
  outside_red:   { label: '紅色',   payout: 1, numbers: [...RED_NUMS] },
  outside_black: { label: '黑色',   payout: 1, numbers: [...BLACK_NUMS] },
  outside_odd:   { label: '奇數',   payout: 1, numbers: [1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35] },
  outside_even:  { label: '偶數',   payout: 1, numbers: [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36] },
  outside_low:   { label: '1–18',  payout: 1, numbers: Array.from({length:18}, (_,i) => i+1) },
  outside_high:  { label: '19–36', payout: 1, numbers: Array.from({length:18}, (_,i) => i+19) },
  // 外圍 2:1
  outside_dozen1: { label: '第一打', payout: 2, numbers: Array.from({length:12}, (_,i) => i+1) },
  outside_dozen2: { label: '第二打', payout: 2, numbers: Array.from({length:12}, (_,i) => i+13) },
  outside_dozen3: { label: '第三打', payout: 2, numbers: Array.from({length:12}, (_,i) => i+25) },
  outside_col1:   { label: '第一列', payout: 2, numbers: [...COL1] },
  outside_col2:   { label: '第二列', payout: 2, numbers: [...COL2] },
  outside_col3:   { label: '第三列', payout: 2, numbers: [...COL3] },
  // 內圍（numbers 由玩家輸入後動態計算）
  straight: { label: '單號', payout: 35, needsInput: true },
  split:    { label: '雙號', payout: 17, needsInput: true },
  street:   { label: '街押', payout: 11, needsInput: true },
  corner:   { label: '角押', payout: 8,  needsInput: true },
  line:     { label: '雙街', payout: 5,  needsInput: true },
  basket:   { label: '零街', payout: 8,  numbers: [0,1,2,3] },
};

function isOutside(type) {
  return type.startsWith('outside_');
}

/**
 * 驗證內圍押法的號碼組合是否合法。
 * 回傳 { ok, numbers, error }
 */
function validateInsideBet(type, rawInput) {
  const nums = rawInput
    .split(/[\s,，]+/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  const inRange = nums.every(n => n >= 0 && n <= 36);
  if (!inRange) return { ok: false, error: '號碼必須在 0–36 之間' };

  switch (type) {
    case 'straight': {
      if (nums.length !== 1) return { ok: false, error: '單號只需填一個號碼' };
      return { ok: true, numbers: nums };
    }
    case 'split': {
      if (nums.length !== 2) return { ok: false, error: '雙號需填兩個相鄰號碼' };
      if (!isAdjacent(nums[0], nums[1])) return { ok: false, error: `${nums[0]} 和 ${nums[1]} 不相鄰` };
      return { ok: true, numbers: nums };
    }
    case 'street': {
      if (nums.length !== 1) return { ok: false, error: '街押填入橫排起始號（如：1 代表 1,2,3）' };
      const start = nums[0];
      if (start < 1 || start > 34 || (start - 1) % 3 !== 0) {
        return { ok: false, error: '街押起始號必須是 1, 4, 7, ..., 34' };
      }
      return { ok: true, numbers: [start, start+1, start+2] };
    }
    case 'corner': {
      if (nums.length !== 1) return { ok: false, error: '角押填入左上角號碼' };
      const expanded = getCornerNumbers(nums[0]);
      if (!expanded) return { ok: false, error: `${nums[0]} 無法形成四角押` };
      return { ok: true, numbers: expanded };
    }
    case 'line': {
      if (nums.length !== 1) return { ok: false, error: '雙街填入起始號（如：1 代表 1–6）' };
      const start = nums[0];
      if (start < 1 || start > 31 || (start - 1) % 3 !== 0) {
        return { ok: false, error: '雙街起始號必須是 1, 4, 7, ..., 31' };
      }
      return { ok: true, numbers: [start, start+1, start+2, start+3, start+4, start+5] };
    }
    default:
      return { ok: false, error: '未知押法' };
  }
}

/** 判斷兩個號碼是否相鄰（左右或上下） */
function isAdjacent(a, b) {
  if (a === 0 || b === 0) return [1,2,3].includes(a===0 ? b : a);
  const diff = Math.abs(a - b);
  if (diff === 1) {
    // 同一橫排才算左右相鄰（避免 3 和 4 被誤判）
    return Math.ceil(a / 3) === Math.ceil(b / 3);
  }
  if (diff === 3) return true;
  return false;
}

/** 取角押的四個號碼（左上角為基準），不合法回傳 null */
function getCornerNumbers(topLeft) {
  if (topLeft < 1 || topLeft > 32) return null;
  if (topLeft % 3 === 0) return null; // 第三列沒有右鄰
  return [topLeft, topLeft+1, topLeft+3, topLeft+4];
}

module.exports = {
  RED_NUMS, BLACK_NUMS, WHEEL_ORDER,
  BET_TYPES, isOutside,
  validateInsideBet, isAdjacent, getCornerNumbers,
};
