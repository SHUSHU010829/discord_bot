// Crash / 火箭 核心引擎：純函數，不接觸 DB / Discord。
//
// 互動式版本：
//   - 玩家下注後遊戲進入 "playing" 狀態，倍率隨時間上升直到 bust。
//   - 玩家可隨時按「收手」鎖定當前倍率派彩；按晚了就跟著爆炸。
//   - 也可預設自動收手倍率，達到後系統自動結算。
//
// Bust 抽法（provably-fair 風格）：
//   r ~ Uniform(0, 1)
//   若 r < houseEdge → bust = 1.00x（直接爆炸，發射瞬間就爆）
//   否則 bust = (1 - houseEdge) / (1 - r)，再 floor 至兩位小數
//
// 倍率成長函數：
//   每一局都用同一個固定成長率 k：m(t) = exp(k × t_sec)，到 bust 時這局爆炸。
//   遊戲時長 = ln(bust) / k，所以 bust 越大局越久。但「升空速度」對所有局都
//   一模一樣，玩家沒法從「火箭爬得快不快」反推這局 bust 拿來抓低風險收手。

const DEFAULT_HOUSE_EDGE = 0.1;
const MIN_AUTOCASHOUT = 1.5;
const MAX_AUTOCASHOUT = 1_000_000;

// 固定升空速度（每秒對數倍率）。對 bust=2 約 4.6s 爆炸、bust=10 約 15.4s、
// bust=100 約 30.7s。任何 bust 看到的曲線斜率都相同，無法被「等等看升多快」破解。
const GROWTH_RATE_PER_SEC = 0.15;

// 上限只是避免極端高 bust 拖太久卡 TTL；達上限的局 k 才會被擠快一點。
const MAX_DURATION_MS = 60_000;

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

// 固定升空速度 → 局長就是 ln(bust)/k。低 bust 自然秒爆（給不出反應時間），
// 高 bust 自然撐久（給玩家慢慢看）。MAX 是安全閥，免得極端高 bust 卡 TTL。
function bustDurationMs(bust) {
  if (bust <= 1) return 0;
  const ms = Math.ceil((Math.log(bust) / GROWTH_RATE_PER_SEC) * 1000);
  return Math.min(MAX_DURATION_MS, ms);
}

// 一般情況回固定 k；只有當 durationMs 被 MAX 截斷時才需要把 k 重新算。
function growthRateFor(bust, durationMs) {
  if (bust <= 1) return 0;
  const climbMs = Math.max(1, durationMs);
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
  // bust=1 的直接爆炸局：發射瞬間就爆，玩家沒有任何反應時間。
  const durationMs = bust <= 1 ? 0 : bustDurationMs(bust);
  const k = growthRateFor(bust, durationMs);
  const autocashoutAt =
    target != null && k > 0
      ? Math.min(
          now + durationMs,
          now + Math.ceil((Math.log(target) / k) * 1000),
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
  const climbSec = elapsedMs / 1000;
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
  GROWTH_RATE_PER_SEC,
  MAX_DURATION_MS,
};
