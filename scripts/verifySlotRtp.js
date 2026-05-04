// 跑拉霸的 Monte Carlo 模擬，驗證 RTP 落在目標區間內。
// 用法：node scripts/verifySlotRtp.js

const { spin } = require("../src/features/casino/slot/slotMachine");

const TRIALS = 100000;
const BET = 100;
const TARGET_MIN = 82.0;
const TARGET_MAX = 86.0;

function simulate(trials, bet) {
  let totalBet = 0;
  let totalPayout = 0;
  const matchCounts = {
    jackpot: 0,
    triple: 0,
    double_cherry: 0,
    double: 0,
    none: 0,
  };
  for (let i = 0; i < trials; i++) {
    const r = spin({ bet });
    totalBet += bet;
    totalPayout += r.payout;
    matchCounts[r.matchType] = (matchCounts[r.matchType] || 0) + 1;
  }
  return {
    rtp: (totalPayout / totalBet) * 100,
    matchCounts,
    totalBet,
    totalPayout,
  };
}

console.log(
  `\n=== Slot RTP Verification (${TRIALS.toLocaleString()} trials, bet=${BET}) ===\n`
);

const { rtp, matchCounts, totalBet, totalPayout } = simulate(TRIALS, BET);
const pass = rtp >= TARGET_MIN && rtp <= TARGET_MAX;

console.log(`Total bet:    ${totalBet.toLocaleString()}`);
console.log(`Total payout: ${totalPayout.toLocaleString()}`);
console.log(
  `RTP:          ${rtp.toFixed(2)}%   (target ${TARGET_MIN}-${TARGET_MAX}%)`
);
console.log(`\nMatch distribution:`);
for (const [k, v] of Object.entries(matchCounts)) {
  const pct = ((v / TRIALS) * 100).toFixed(3);
  console.log(`  ${k.padEnd(15)} ${String(v).padStart(7)}  (${pct}%)`);
}
console.log(`\n${pass ? "✓ PASS" : "✗ FAIL"} — RTP ${pass ? "in" : "out of"} target range.\n`);

process.exit(pass ? 0 : 1);
