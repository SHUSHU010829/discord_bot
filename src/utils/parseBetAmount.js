// 把使用者輸入的下注字串轉成整數金額。
//
// 支援：
//   - 純數字     "100", "1500"
//   - 千 / 萬倍  "1.5k" (=1500), "2m" (=2_000_000)
//   - 全押       "all", "梭哈", "all-in"
//   - 百分比     "10%", "50%"  → 以目前餘額為基準
//
// 回傳 { ok: true, amount, mode } 或 { ok: false, reason }
//   mode ∈ "exact" | "all" | "percent" | "suffix"

const MULTIPLIERS = {
  k: 1_000,
  K: 1_000,
  m: 1_000_000,
  M: 1_000_000,
};

const ALL_KEYWORDS = new Set([
  "all", "ALL", "All",
  "allin", "all-in", "ALLIN", "ALL-IN",
  "梭哈", "全押", "全部",
]);

function parseBetAmount(raw, balance) {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { ok: false, reason: "金額需為正數" };
    }
    return { ok: true, amount: Math.floor(raw), mode: "exact" };
  }
  if (typeof raw !== "string") {
    return { ok: false, reason: "請輸入下注金額" };
  }

  const s = raw.trim();
  if (s.length === 0) return { ok: false, reason: "請輸入下注金額" };

  if (ALL_KEYWORDS.has(s)) {
    if (!Number.isFinite(balance) || balance <= 0) {
      return { ok: false, reason: "餘額不足，無法全押" };
    }
    return { ok: true, amount: Math.floor(balance), mode: "all" };
  }

  // 百分比："10%" / "50％"
  const pct = s.match(/^(\d+(?:\.\d+)?)\s*[%％]$/);
  if (pct) {
    const p = parseFloat(pct[1]);
    if (!Number.isFinite(p) || p <= 0 || p > 100) {
      return { ok: false, reason: "百分比需介於 1% ~ 100%" };
    }
    if (!Number.isFinite(balance) || balance <= 0) {
      return { ok: false, reason: "餘額不足" };
    }
    const amt = Math.floor((balance * p) / 100);
    if (amt <= 0) return { ok: false, reason: "百分比換算後金額為 0" };
    return { ok: true, amount: amt, mode: "percent" };
  }

  // 千 / 萬倍："1.5k" / "2m"
  const suf = s.match(/^(\d+(?:\.\d+)?)\s*([kKmM])$/);
  if (suf) {
    const num = parseFloat(suf[1]);
    const mul = MULTIPLIERS[suf[2]];
    if (!Number.isFinite(num) || num <= 0 || !mul) {
      return { ok: false, reason: "格式錯誤" };
    }
    const amt = Math.floor(num * mul);
    if (amt <= 0) return { ok: false, reason: "金額需為正數" };
    return { ok: true, amount: amt, mode: "suffix" };
  }

  // 純數字（可含 .）：取整
  const num = s.match(/^\d+(?:\.\d+)?$/);
  if (num) {
    const n = Math.floor(parseFloat(s));
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, reason: "金額需為正數" };
    }
    return { ok: true, amount: n, mode: "exact" };
  }

  return {
    ok: false,
    reason: "看不懂的金額格式（可用 100、1.5k、10%、all）",
  };
}

module.exports = parseBetAmount;
