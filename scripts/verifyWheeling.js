// 驗證包牌展開與計價。

const {
  calculateWheelingCost,
  expandWheel,
} = require("../src/features/casino/lottery/wheeling");
const { combinationCount } = require("../src/features/casino/lottery/numbers");

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

console.log("[6/49 包牌] 7 個號碼");
{
  const r = calculateWheelingCost(7, "6_49", 50);
  assert("C(7,6) = 7", r.combinations === 7);
  assert("totalCost = 350", r.totalCost === 350);
}

console.log("[6/49 包牌] 10 個號碼");
{
  const r = calculateWheelingCost(10, "6_49", 50);
  assert("C(10,6) = 210", r.combinations === 210);
  assert("totalCost = 10500", r.totalCost === 10500);
}

console.log("[展開組合]");
{
  const combos = expandWheel([1, 2, 3, 4, 5, 6, 7], "6_49");
  assert("產生 7 組", combos.length === 7);
  assert("每組 6 個", combos.every((c) => c.length === 6));
  assert("無重複組合", new Set(combos.map((c) => c.join(","))).size === 7);
  assert(
    "每組都已排序",
    combos.every((c) => {
      for (let i = 1; i < c.length; i++) if (c[i] <= c[i - 1]) return false;
      return true;
    })
  );
}

console.log("[組合數學]");
{
  assert("C(10,6)", combinationCount(10, 6) === 210);
  assert("C(49,6)", combinationCount(49, 6) === 13983816);
  assert("C(0,0)", combinationCount(0, 0) === 1);
  assert("C(5,7) = 0", combinationCount(5, 7) === 0);
}

console.log(`\n結果:${passed} passed / ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
