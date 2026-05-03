// 跑各種 Sic Bo 押法的 RTP 模擬，用來驗證 engine 是否符合理論值。
// 用法：node scripts/verifySicboRtp.js

const { rollThree } = require("../src/features/casino/sicbo/dice");
const { settleBet } = require("../src/features/casino/sicbo/engine");

const TRIALS = 100000;
const BET_AMOUNT = 100;

const CASES = [
  { label: "big", bet: { type: "big", amount: BET_AMOUNT }, expected: 97.22, tolerance: 1.0 },
  { label: "small", bet: { type: "small", amount: BET_AMOUNT }, expected: 97.22, tolerance: 1.0 },
  { label: "single 1", bet: { type: "single", value: 1, amount: BET_AMOUNT }, expected: 92.13, tolerance: 1.0 },
  { label: "single 4", bet: { type: "single", value: 4, amount: BET_AMOUNT }, expected: 92.13, tolerance: 1.0 },
  { label: "double 3", bet: { type: "double", value: 3, amount: BET_AMOUNT }, expected: 81.48, tolerance: 1.5 },
  { label: "triple_any", bet: { type: "triple_any", amount: BET_AMOUNT }, expected: 86.11, tolerance: 2.0 },
  { label: "triple_specific 6", bet: { type: "triple_specific", value: 6, amount: BET_AMOUNT }, expected: 83.80, tolerance: 4.0 },
  { label: "total 9", bet: { type: "total", value: 9, amount: BET_AMOUNT }, expected: 80.09, tolerance: 4.0 },
  { label: "total 10", bet: { type: "total", value: 10, amount: BET_AMOUNT }, expected: 87.50, tolerance: 4.0 },
  { label: "total 4", bet: { type: "total", value: 4, amount: BET_AMOUNT }, expected: 84.72, tolerance: 8.0 },
];

function simulate(bet, trials) {
  let bet_total = 0;
  let payout_total = 0;
  for (let i = 0; i < trials; i++) {
    const dice = rollThree();
    const r = settleBet(bet, dice);
    bet_total += bet.amount;
    payout_total += r.payout;
  }
  return (payout_total / bet_total) * 100;
}

console.log(`\n=== Sic Bo RTP Verification (${TRIALS.toLocaleString()} trials each) ===\n`);

let allPass = true;
for (const c of CASES) {
  const rtp = simulate(c.bet, TRIALS);
  const diff = Math.abs(rtp - c.expected);
  const pass = diff <= c.tolerance;
  if (!pass) allPass = false;
  const status = pass ? "✓ PASS" : "✗ FAIL";
  console.log(
    `${status}  ${c.label.padEnd(22)} RTP=${rtp.toFixed(2)}%  expected=${c.expected.toFixed(2)}% (±${c.tolerance})`
  );
}

console.log(`\n${allPass ? "✓ All cases passed." : "✗ Some cases failed."}\n`);
process.exit(allPass ? 0 : 1);
