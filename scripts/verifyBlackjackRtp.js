// Monte Carlo 驗證 21 點引擎 RTP。
// 用法：node scripts/verifyBlackjackRtp.js
//
// 模擬兩種策略：
//   - naive：玩家點數 ≤16 hit、≥17 stand，從不 double
//   - 預期 RTP 落在 95-98%（標準 BJ rules）
//
// 不需要寫完整 basic strategy table——重點是驗證引擎本身結算邏輯沒寫錯。

const { startGame, hit, stand } = require("../src/features/casino/blackjack/engine");
const { evaluateHand } = require("../src/features/casino/blackjack/hand");

const TRIALS = 100000;
const BET = 100;
const TARGET_MIN = 94.0;
const TARGET_MAX = 99.0;

function naivePlay(state) {
  let s = state;
  while (s.status === "playing") {
    const ev = evaluateHand(s.playerHand);
    if (ev.total <= 16) {
      s = hit(s);
    } else {
      s = stand(s);
    }
  }
  return s;
}

function simulate(trials, bet) {
  let totalBet = 0;
  let totalPayout = 0;
  const counts = { blackjack: 0, win: 0, push: 0, lose: 0 };
  let busts = 0;

  for (let i = 0; i < trials; i++) {
    const s0 = startGame({ bet });
    const s = s0.status === "settled" ? s0 : naivePlay(s0);
    totalBet += bet;
    totalPayout += s.payout;
    counts[s.result] = (counts[s.result] || 0) + 1;
    const pe = evaluateHand(s.playerHand);
    if (pe.isBust) busts += 1;
  }

  return {
    rtp: (totalPayout / totalBet) * 100,
    counts,
    busts,
    totalBet,
    totalPayout,
  };
}

console.log(
  `\n=== Blackjack RTP Verification (${TRIALS.toLocaleString()} trials, bet=${BET}, naive strategy) ===\n`
);

const { rtp, counts, busts, totalBet, totalPayout } = simulate(TRIALS, BET);
const pass = rtp >= TARGET_MIN && rtp <= TARGET_MAX;

console.log(`Total bet:    ${totalBet.toLocaleString()}`);
console.log(`Total payout: ${totalPayout.toLocaleString()}`);
console.log(
  `RTP:          ${rtp.toFixed(2)}%   (target ${TARGET_MIN}-${TARGET_MAX}%)`
);
console.log(`\nResult distribution:`);
for (const k of ["blackjack", "win", "push", "lose"]) {
  const v = counts[k] || 0;
  const pct = ((v / TRIALS) * 100).toFixed(3);
  console.log(`  ${k.padEnd(12)} ${String(v).padStart(7)}  (${pct}%)`);
}
console.log(`  ${"player_bust".padEnd(12)} ${String(busts).padStart(7)}  (${((busts / TRIALS) * 100).toFixed(3)}%)`);
console.log(`\n${pass ? "✓ PASS" : "✗ FAIL"} — RTP ${pass ? "in" : "out of"} target range.\n`);

process.exit(pass ? 0 : 1);
