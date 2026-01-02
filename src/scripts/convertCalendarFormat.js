const fs = require('fs');
const path = require('path');

/**
 * 將行事曆資料從舊格式 (YYYY-MM-DD) 轉換成新格式 (YYYYMMDD)
 */

const CALENDAR_PATH = path.join(__dirname, '../data/calender.json');

console.log('開始轉換行事曆日期格式...\n');

try {
  // 讀取現有資料
  const rawData = fs.readFileSync(CALENDAR_PATH, 'utf8');
  const calendarData = JSON.parse(rawData);

  console.log(`讀取到 ${calendarData.length} 筆資料`);

  // 檢查是否需要轉換
  const needsConversion = calendarData.some(item => item.date.includes('-'));

  if (!needsConversion) {
    console.log('✓ 資料已經是新格式 (YYYYMMDD)，無需轉換');
    process.exit(0);
  }

  // 備份原始檔案
  const backupPath = CALENDAR_PATH.replace('.json', `.backup_${Date.now()}.json`);
  fs.copyFileSync(CALENDAR_PATH, backupPath);
  console.log(`✓ 已備份原始檔案至: ${path.basename(backupPath)}`);

  // 轉換日期格式
  const convertedData = calendarData.map(item => {
    // 如果日期包含連字符，移除它們
    if (item.date.includes('-')) {
      return {
        ...item,
        date: item.date.replace(/-/g, '')
      };
    }
    return item;
  });

  // 驗證轉換結果
  const allCorrect = convertedData.every(item => /^\d{8}$/.test(item.date));
  if (!allCorrect) {
    throw new Error('轉換後的日期格式驗證失敗');
  }

  // 寫入新資料
  fs.writeFileSync(CALENDAR_PATH, JSON.stringify(convertedData, null, 2), 'utf8');
  console.log(`✓ 成功轉換 ${convertedData.length} 筆資料`);

  // 顯示轉換範例
  console.log('\n轉換範例:');
  const samples = calendarData.slice(0, 3);
  samples.forEach((oldItem, index) => {
    const newItem = convertedData[index];
    console.log(`  ${oldItem.date} → ${newItem.date}`);
  });

  console.log('\n✓ 轉換完成！');
  console.log('\n執行以下指令來驗證轉換結果:');
  console.log('  npm run verify-calendar');

} catch (error) {
  console.error(`\n✗ 轉換失敗: ${error.message}`);
  process.exit(1);
}
