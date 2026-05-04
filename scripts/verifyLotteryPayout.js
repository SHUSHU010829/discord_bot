// 驗證樂透派彩計算邏輯。
// 跑法:node scripts/verifyLotteryPayout.js

const { calculatePayout } = require("../src/features/casino/lottery/payout");

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}: ${detail || ""}`);
    failed++;
  }
}

console.log("[6/49] 沒人中頭獎 → 全部滾下期");
{
  const tickets = [
    { ticketId: "t1", matched: 0 },
    { ticketId: "t2", matched: 1 },
  ];
  const r = calculatePayout({
    lotteryType: "6_49",
    pool: 10000,
    tickets,
    config: { fourthPrizeFixed: 100 },
  });
  assert("頭獎沒人中,winnerCount = 0", r.prizes.jackpot.winnerCount === 0);
  assert("二獎沒人中", r.prizes.second.winnerCount === 0);
  assert("三獎沒人中", r.prizes.third.winnerCount === 0);
  assert(
    "rolledOver = 10000 (全部滾)",
    r.prizes.rolledOver.amount === 10000,
    `got ${r.prizes.rolledOver.amount}`
  );
}

console.log("[6/49] 一人中頭獎");
{
  const tickets = [
    { ticketId: "t1", matched: 6 },
    { ticketId: "t2", matched: 0 },
  ];
  const r = calculatePayout({
    lotteryType: "6_49",
    pool: 10000,
    tickets,
    config: { fourthPrizeFixed: 100 },
  });
  assert("頭獎 winner = 1", r.prizes.jackpot.winnerCount === 1);
  assert("頭獎 perWinner = 7000", r.prizes.jackpot.perWinner === 7000);
  assert(
    "rolledOver = 10000 - 7000 - 1500 - 1000 = 500 (5%)",
    r.prizes.rolledOver.amount === 500,
    `got ${r.prizes.rolledOver.amount}`
  );
}

console.log("[6/49] 兩人中頭獎均分");
{
  const tickets = [
    { ticketId: "t1", matched: 6 },
    { ticketId: "t2", matched: 6 },
  ];
  const r = calculatePayout({
    lotteryType: "6_49",
    pool: 10000,
    tickets,
    config: { fourthPrizeFixed: 100 },
  });
  assert("頭獎 winner = 2", r.prizes.jackpot.winnerCount === 2);
  assert("頭獎 perWinner = 3500", r.prizes.jackpot.perWinner === 3500);
}

console.log("[6/49] 四獎固定 100/張");
{
  const tickets = [
    { ticketId: "t1", matched: 3 },
    { ticketId: "t2", matched: 3 },
    { ticketId: "t3", matched: 3 },
  ];
  const r = calculatePayout({
    lotteryType: "6_49",
    pool: 10000,
    tickets,
    config: { fourthPrizeFixed: 100 },
  });
  assert("四獎 amount = 300", r.prizes.fourth.amount === 300);
  const fourth = r.ticketAssignments.find((a) => a.prize === "fourth");
  assert("四獎 ticket payoutAmount = 100", fourth?.payoutAmount === 100);
}

console.log("[3/20] 頭獎");
{
  const tickets = [
    { ticketId: "t1", matched: 3 },
    { ticketId: "t2", matched: 2 },
  ];
  const r = calculatePayout({
    lotteryType: "3_20",
    pool: 1000,
    tickets,
    config: { secondPrizeFixed: 50 },
  });
  assert("頭獎 perWinner = 800", r.prizes.jackpot.perWinner === 800);
  assert("二獎 amount = 50", r.prizes.second.amount === 50);
  assert("rolledOver = 200", r.prizes.rolledOver.amount === 200);
}

console.log("[3/20] 沒人中頭獎");
{
  const tickets = [{ ticketId: "t1", matched: 1 }];
  const r = calculatePayout({
    lotteryType: "3_20",
    pool: 1000,
    tickets,
    config: { secondPrizeFixed: 50 },
  });
  assert("rolledOver = 1000", r.prizes.rolledOver.amount === 1000);
}

console.log(`\n結果:${passed} passed / ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
