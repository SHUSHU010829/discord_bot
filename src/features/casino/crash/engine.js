// Crash / 火箭 核心引擎：純函數，不接觸 DB / Discord。
//
// 互動式版本：
//   - 玩家下注後遊戲進入 "playing" 狀態，倍率隨時間上升直到 bust。
//   - 玩家可隨時按「收手」鎖定當前倍率派彩；按晚了就跟著爆炸。
//   - 也可預設自動收手倍率，達到後系統自動結算。
//
// Bust 抽法（provably-fair 風格）：
//   r ~ Uniform(0, 1)
//   若 r < houseEdge → bust = 1.00x（直接爆炸）
//   否則 bust = (1 - houseEdge) / (1 - r)，再 floor 至兩位小數
//
// 倍率成長函數：
//   遊戲前 WARMUP_MS 是暖機期，倍率固定 1.00x，避免玩家秒按白賺。
//   暖機期結束後 m(t) = exp(growthRate × (t - warmup)_sec)，直到時間到 bust。
//   不同 bust 對應不同遊戲時長（短局 ~3s、長局 ~22s），用 log 平滑映射。

const DEFAULT_HOUSE_EDGE = 0.05;
const MIN_AUTOCASHOUT = 1.1;
const MAX_AUTOCASHOUT = 1_000_000;

// 真的有飛起來的局（bust > 1）：3 秒 hard floor，留玩家反應時間，避免高倍率局秒爆。
const MIN_DURATION_MS = 3_000;
const MAX_DURATION_MS = 22_000;

// 暖機期：剛升空時倍率固定 1.00x，這段時間秒按收手只能拿回本，不會白賺。
// 注意：MIN_DURATION_MS 中前 WARMUP_MS 屬於暖機，剩下的才會開始爬升到 bust。
const WARMUP_MS = 1_000;

// 抽到 bust=1.00 的「直接爆炸」局，會在 0~INSTANT_BUST_MAX_MS 之間隨機爆掉。
// 不套用 MIN_DURATION_MS，這樣連暖機期內秒按收手也有機率輸錢。
const INSTANT_BUST_MAX_MS = 1_500;

function round2(n) {
  return Math.round(n * 100) / 100;
}
function floor2(n) {
  return Math.floor(n * 100) / 100;
}

function drawBust({ houseEdge = DEFAULT_HOUSE_EDGE, rng = Math.random } = {}) {
  const edge = Math.max(0, Math.min(0.5, houseEdge));
  let r = rng();
  if (!Number.isFinite(r) || r <= 0) r = 1e-12;
  if (r >= 1) r = 1 - 1e-12;
  if (r < edge) return 1.0;
  const raw = (1 - edge) / (1 - r);
  return Math.max(1.0, floor2(raw));
}

// bust 越大遊戲越久；但要避免低 bust 一閃而過、高 bust 拖太久。
function bustDurationMs(bust) {
  const safeBust = Math.max(1.01, bust);
  const sec = 3 * Math.log2(safeBust + 1); // bust=1.01→~3s, 2→4.75s, 10→10.4s, 100→20s
  const ms = Math.round(sec * 1000);
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, ms));
}

function growthRateFor(bust, durationMs) {
  if (bust <= 1) return 0;
  // 暖機期不算進爬升時間，所以分母要扣掉 WARMUP_MS。
  const climbMs = Math.max(1, durationMs - WARMUP_MS);
  return Math.log(bust) / (climbMs / 1000);
}

function clampAutocashout(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (x < MIN_AUTOCASHOUT) return MIN_AUTOCASHOUT;
  if (x > MAX_AUTOCASHOUT) return MAX_AUTOCASHOUT;
  return round2(x);
}

function startGame({
  bet,
  autocashout = null,
  houseEdge = DEFAULT_HOUSE_EDGE,
  rng = Math.random,
  now = Date.now(),
}) {
  const target = autocashout != null ? clampAutocashout(autocashout) : null;
  const bust = drawBust({ houseEdge, rng });
  // bust=1 的直接爆炸局走短隨機窗，其它局照常吃 MIN_DURATION_MS。
  const durationMs =
    bust <= 1
      ? Math.floor(rng() * INSTANT_BUST_MAX_MS)
      : bustDurationMs(bust);
  const k = growthRateFor(bust, durationMs);
  const autocashoutAt =
    target != null && k > 0
      ? Math.min(
          now + durationMs,
          now + WARMUP_MS + Math.ceil((Math.log(target) / k) * 1000),
        )
      : null;
  return {
    bet,
    autocashout: target,
    houseEdge,
    bust,
    durationMs,
    growthRate: k,
    startedAt: now,
    bustAt: now + durationMs,
    autocashoutAt,
    status: "playing",
    cashoutAt: null,
    result: null,
    payout: 0,
  };
}

// 在 `now` 時間點玩家手上看到的倍率（floor 至兩位小數）。
function multiplierAt(state, now = Date.now()) {
  const elapsedMs = Math.max(0, now - state.startedAt);
  if (state.growthRate <= 0) return 1.0;
  // 暖機期內倍率固定 1.00x
  if (elapsedMs < WARMUP_MS) return 1.0;
  const climbSec = (elapsedMs - WARMUP_MS) / 1000;
  const m = Math.exp(state.growthRate * climbSec);
  // 飛行中倍率不能超過 bust（時間還沒到的話）
  const capped = Math.min(m, state.bust);
  return Math.max(1.0, floor2(capped));
}

// 嘗試手動收手。若已過 bust 時間則 null（call site 用 DB CAS 才是真正的鎖定）。
function settleCashout(state, now = Date.now()) {
  if (state.status !== "playing") return null;
  if (now >= state.bustAt) return null;
  const m = multiplierAt(state, now);
  return {
    ...state,
    status: "settled",
    result: "cashout",
    cashoutAt: m,
    payout: Math.floor(state.bet * m + 1e-9),
  };
}

// 自動收手結算（系統定時 / 重啟修復都用同一條路徑）。
function settleAutoCashout(state) {
  if (state.status !== "playing") return null;
  if (state.autocashout == null) return null;
  const m = round2(state.autocashout);
  return {
    ...state,
    status: "settled",
    result: "cashout",
    cashoutAt: m,
    payout: Math.floor(state.bet * m + 1e-9),
  };
}

function settleCrashed(state) {
  return {
    ...state,
    status: "settled",
    result: "crashed",
    cashoutAt: null,
    payout: 0,
  };
}

// 給離線重啟用：以遊戲時間軸跑完一輪後該得到的結果。
//   有 autocashout 且 autocashoutAt < bustAt → 視為自動收手成功
//   否則 → 視為爆炸
function settleRetroactive(state) {
  if (
    state.autocashout != null &&
    state.autocashoutAt != null &&
    state.autocashoutAt < state.bustAt
  ) {
    return settleAutoCashout(state);
  }
  return settleCrashed(state);
}

module.exports = {
  drawBust,
  startGame,
  settleCashout,
  settleAutoCashout,
  settleCrashed,
  settleRetroactive,
  multiplierAt,
  clampAutocashout,
  bustDurationMs,
  growthRateFor,
  round2,
  floor2,
  DEFAULT_HOUSE_EDGE,
  MIN_AUTOCASHOUT,
  MAX_AUTOCASHOUT,
  WARMUP_MS,
  INSTANT_BUST_MAX_MS,
};
