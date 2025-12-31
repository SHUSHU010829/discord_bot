const { DateTime } = require("luxon");

/**
 * 測試日期格式化是否正確
 */

console.log("測試日期格式化...\n");

// 測試新格式
const newFormat = DateTime.now()
  .setZone("Asia/Taipei")
  .toFormat("yyyyMMdd");

console.log(`新格式 (yyyyMMdd): ${newFormat}`);
console.log(`格式正確: ${/^\d{8}$/.test(newFormat) ? '✓' : '✗'}`);

// 測試一些範例日期
const testDates = [
  "2025-01-01",
  "2025-12-31",
  "2026-02-14"
];

console.log("\n測試範例日期轉換:");
testDates.forEach(date => {
  const formatted = DateTime.fromISO(date).toFormat("yyyyMMdd");
  console.log(`  ${date} → ${formatted}`);
});

console.log("\n測試完成！");
