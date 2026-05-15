// Crash / 火箭 核心引擎：純函數，不接觸 DB / Discord。
//
// 規則：
//   - 玩家下注 bet，並可指定自動收手倍率 autocashout (≥ 1.01)
//   - 系統用 provably-fair 風格的分布抽出當局 bust 倍率：
//       r ~ Uniform(0, 1)
//       若 r < houseEdge → bust = 1.00x（莊家通吃，代表房費）
//       否則 bust = (1 - houseEdge) / (1 - r)，再 floor 至兩位小數
//     在此分布下，玩家以倍率 m 收手的中獎機率 = (1-edge)/m，
//     期望淨值 = bet × m × (1-edge)/m − bet = −bet × edge。
//
//   - 若 autocashout < bust  → 玩家成功收手，payout = floor(bet × autocashout)
//     若 autocashout ≥ bust  → 火箭先爆炸，payout = 0
//
// State：
//   {
//     bet, autocashout, houseEdge,
//     bust,                              // 當局爆炸倍率（≥ 1.00）
//     cashoutAt,                         // 玩家最後收手的倍率（贏時 = autocashout、輸時 = null）
//     status: "settled",
//     result: "cashout" | "crashed",
//     payout,                            // 最終派彩（含本金）；輸 = 0
//   }

const DEFAULT_HOUSE_EDGE = 0.01;
const DEFAULT_AUTOCASHOUT = 2.0;
const MIN_AUTOCASHOUT = 1.01;
const MAX_AUTOCASHOUT = 1_000_000; // 任意上限；實際幾乎打不到

function round2(n) {
  return Math.round(n * 100) / 100;
}

function floor2(n) {
  return Math.floor(n * 100) / 100;
}

// 抽出當局 bust 倍率。可注入 rng 方便測試。
function drawBust({ houseEdge = DEFAULT_HOUSE_EDGE, rng = Math.random } = {}) {
  const edge = Math.max(0, Math.min(0.5, houseEdge));
  // r 不能恰好 0（避免 div by 0）
  let r = rng();
  if (!Number.isFinite(r) || r <= 0) r = 1e-12;
  if (r >= 1) r = 1 - 1e-12;

  if (r < edge) return 1.0; // 直接爆炸（莊家通吃）
  const raw = (1 - edge) / (1 - r);
  // floor 到 2 位小數，最低 1.00
  return Math.max(1.0, floor2(raw));
}

function resolveGame({
  bet,
  autocashout = DEFAULT_AUTOCASHOUT,
  houseEdge = DEFAULT_HOUSE_EDGE,
  rng,
}) {
  const target = clampAutocashout(autocashout);
  const bust = drawBust({ houseEdge, rng });

  // autocashout ≤ bust 算贏。bust 已 floor 到兩位小數，
  // 用 ≤ 才能讓 EV = -bet × houseEdge 對齊（嚴格 < 會額外吃半個 tick 的房費）。
  const won = target <= bust;
  const cashoutAt = won ? target : null;
  const payout = won ? Math.floor(bet * target + 1e-9) : 0;

  return {
    bet,
    autocashout: target,
    houseEdge,
    bust,
    cashoutAt,
    status: "settled",
    result: won ? "cashout" : "crashed",
    payout,
  };
}

function clampAutocashout(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return DEFAULT_AUTOCASHOUT;
  if (x < MIN_AUTOCASHOUT) return MIN_AUTOCASHOUT;
  if (x > MAX_AUTOCASHOUT) return MAX_AUTOCASHOUT;
  return round2(x);
}

module.exports = {
  drawBust,
  resolveGame,
  clampAutocashout,
  round2,
  floor2,
  DEFAULT_HOUSE_EDGE,
  DEFAULT_AUTOCASHOUT,
  MIN_AUTOCASHOUT,
  MAX_AUTOCASHOUT,
};
