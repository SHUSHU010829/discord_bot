// 賽馬遊戲核心引擎：純函數，不接觸 DB / Discord。
//
// 規則：
//   - 6 匹馬，每匹有獨立勝率與賠率（包含本金的總倍率）
//   - 玩家挑一匹馬下注，馬獲勝即按該馬賠率拿 bet × payout（含本金）
//   - 系統依各馬勝率「先決定贏家」，再倒推每幀位置動畫
//   - 動畫 = 一連串 frame，每個 frame 是 6 匹馬目前位置（0..TRACK_LENGTH）
//   - 贏家最後一格 == TRACK_LENGTH，其它馬至多停在 TRACK_LENGTH-1
//
// 賠率設計（總倍率，含本金；約 ~10% 房費）：
//   閃電 30%×3.0=0.90 ・ 黑風 22%×4.0=0.88 ・ 金箭 17%×5.5=0.935
//   銀月 13%×7.0=0.91 ・ 紅炎 10%×9.0=0.90 ・ 夜影  8%×11.0=0.88

const HORSES = [
  { id: 1, name: "閃電", emoji: "🐎", prob: 0.30, payout: 3.0 },
  { id: 2, name: "黑風", emoji: "🐴", prob: 0.22, payout: 4.0 },
  { id: 3, name: "金箭", emoji: "🦄", prob: 0.17, payout: 5.5 },
  { id: 4, name: "銀月", emoji: "🦌", prob: 0.13, payout: 7.0 },
  { id: 5, name: "紅炎", emoji: "🐂", prob: 0.10, payout: 9.0 },
  { id: 6, name: "夜影", emoji: "🦓", prob: 0.08, payout: 11.0 },
];

const TRACK_LENGTH = 18;
const MAX_FRAMES = 12;

function getHorse(id) {
  return HORSES.find((h) => h.id === id) || null;
}

function pickWinnerWeighted() {
  const total = HORSES.reduce((s, h) => s + h.prob, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const h of HORSES) {
    acc += h.prob;
    if (r < acc) return h.id;
  }
  return HORSES[HORSES.length - 1].id;
}

// 模擬整場比賽，回傳 frames 與最終排名。
// frames: number[][]，每個 frame 是 6 個位置
// rankings: horseId[]，依抵達終點先後排序（贏家在 [0]）
function simulateRace(winnerId) {
  const positions = HORSES.map(() => 0);
  const finishOrder = [];
  const winnerIdx = HORSES.findIndex((h) => h.id === winnerId);
  if (winnerIdx < 0) {
    throw new Error(`unknown horse id: ${winnerId}`);
  }

  const frames = [positions.slice()];
  let safety = 0;

  while (positions[winnerIdx] < TRACK_LENGTH && safety < 60) {
    safety += 1;

    for (let i = 0; i < positions.length; i++) {
      if (positions[i] >= TRACK_LENGTH) continue;
      let step = Math.floor(Math.random() * 4); // 0..3

      if (i === winnerIdx) {
        // 贏家：落後時自動補一步，避免被拋離永遠追不上
        const maxOther = Math.max(
          ...positions.filter((_, j) => j !== i),
        );
        if (positions[i] < maxOther) step += 1;
        // 仍 0 步時保底前進，避免站著不動
        if (step <= 0) step = 1;
      }

      positions[i] = Math.min(TRACK_LENGTH, positions[i] + step);
    }

    // 防止非贏家提前抵達：若非贏家觸線而贏家還沒到，壓在 TRACK_LENGTH-1
    for (let i = 0; i < positions.length; i++) {
      if (
        i !== winnerIdx &&
        positions[i] >= TRACK_LENGTH &&
        positions[winnerIdx] < TRACK_LENGTH
      ) {
        positions[i] = TRACK_LENGTH - 1;
      }
    }

    frames.push(positions.slice());
  }

  // 補最後一幀：贏家剛好踏線
  positions[winnerIdx] = TRACK_LENGTH;
  finishOrder.push(HORSES[winnerIdx].id);

  // 其它馬依當前進度由近到遠排序
  const others = positions
    .map((p, i) => ({ p, id: HORSES[i].id }))
    .filter((x) => x.id !== HORSES[winnerIdx].id)
    .sort((a, b) => b.p - a.p);
  for (const o of others) finishOrder.push(o.id);

  // 確保最後一幀有更新到
  if (
    frames[frames.length - 1].toString() !== positions.toString()
  ) {
    frames.push(positions.slice());
  }

  // 太多幀的話均勻採樣，避免 Discord 編輯次數過多
  const sampled = sampleFrames(frames, MAX_FRAMES);

  return { frames: sampled, rankings: finishOrder };
}

function sampleFrames(frames, maxFrames) {
  if (frames.length <= maxFrames) return frames;
  const out = [frames[0]];
  // 中段均勻取樣
  const innerCount = maxFrames - 2;
  for (let k = 1; k <= innerCount; k++) {
    const idx = Math.floor((k * (frames.length - 1)) / (innerCount + 1));
    out.push(frames[idx]);
  }
  out.push(frames[frames.length - 1]);
  return out;
}

// bet × multiplier 易踩浮點誤差，加 epsilon 後 floor
function calcPayout(bet, payout) {
  return Math.floor(bet * payout + 1e-9);
}

module.exports = {
  HORSES,
  TRACK_LENGTH,
  MAX_FRAMES,
  getHorse,
  pickWinnerWeighted,
  simulateRace,
  calcPayout,
};
