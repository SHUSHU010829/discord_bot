const fs = require('fs');
const path = require('path');

/**
 * 驗證行事曆資料是否正確
 */

const CALENDAR_PATH = path.join(__dirname, '../data/calender.json');

console.log('='.repeat(60));
console.log('行事曆資料驗證工具');
console.log('='.repeat(60));

try {
  // 檢查檔案是否存在
  if (!fs.existsSync(CALENDAR_PATH)) {
    console.error('✗ 錯誤：找不到 calender.json 檔案');
    process.exit(1);
  }

  // 讀取並解析資料
  const rawData = fs.readFileSync(CALENDAR_PATH, 'utf8');
  const calendarData = JSON.parse(rawData);

  console.log('\n📊 基本資訊:');
  console.log(`  ✓ 檔案位置: ${CALENDAR_PATH}`);
  console.log(`  ✓ 總筆數: ${calendarData.length} 筆`);

  // 取得檔案修改時間
  const stats = fs.statSync(CALENDAR_PATH);
  const modifiedTime = new Date(stats.mtime);
  console.log(`  ✓ 最後更新: ${modifiedTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);

  // 檢查日期格式
  console.log('\n📅 日期格式檢查:');
  const firstDate = calendarData[0]?.date;
  const lastDate = calendarData[calendarData.length - 1]?.date;

  const isCorrectFormat = /^\d{8}$/.test(firstDate);
  console.log(`  第一筆日期: ${firstDate} ${isCorrectFormat ? '✓' : '✗ (格式錯誤)'}`);
  console.log(`  最後一筆日期: ${lastDate} ${/^\d{8}$/.test(lastDate) ? '✓' : '✗ (格式錯誤)'}`);

  // 檢查年份範圍
  const years = [...new Set(calendarData.map(item => item.date.substring(0, 4)))];
  console.log(`  涵蓋年份: ${years.join(', ')}`);

  // 檢查欄位完整性
  console.log('\n🔍 資料結構檢查:');
  const requiredFields = ['date', 'week', 'isHoliday', 'description'];
  let hasAllFields = true;

  requiredFields.forEach(field => {
    const hasMissing = calendarData.some(item => !(field in item));
    if (hasMissing) {
      console.log(`  ✗ 缺少欄位: ${field}`);
      hasAllFields = false;
    }
  });

  if (hasAllFields) {
    console.log('  ✓ 所有必要欄位都存在');
  }

  // 檢查日期格式一致性
  console.log('\n⚠️  格式一致性檢查:');
  const wrongFormatDates = calendarData.filter(item => !/^\d{8}$/.test(item.date));
  if (wrongFormatDates.length > 0) {
    console.log(`  ✗ 發現 ${wrongFormatDates.length} 筆日期格式錯誤:`);
    wrongFormatDates.slice(0, 5).forEach(item => {
      console.log(`    - ${item.date} (應為 YYYYMMDD 格式)`);
    });
    if (wrongFormatDates.length > 5) {
      console.log(`    ... 還有 ${wrongFormatDates.length - 5} 筆`);
    }
  } else {
    console.log('  ✓ 所有日期格式正確 (YYYYMMDD)');
  }

  // 統計假日數量
  console.log('\n📈 統計資訊:');
  const holidayCount = calendarData.filter(item => item.isHoliday === true).length;
  const workdayCount = calendarData.length - holidayCount;
  console.log(`  假日: ${holidayCount} 天`);
  console.log(`  工作日: ${workdayCount} 天`);

  // 顯示最近的節日
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const upcomingHolidays = calendarData
    .filter(item => item.date >= today && item.isHoliday && item.description)
    .slice(0, 5);

  if (upcomingHolidays.length > 0) {
    console.log('\n🎉 即將到來的節日:');
    upcomingHolidays.forEach(item => {
      const year = item.date.substring(0, 4);
      const month = item.date.substring(4, 6);
      const day = item.date.substring(6, 8);
      console.log(`  • ${year}/${month}/${day} (${item.week}) - ${item.description}`);
    });
  }

  // 檢查範例資料
  console.log('\n📝 資料範例 (前 3 筆):');
  calendarData.slice(0, 3).forEach((item, index) => {
    console.log(`  ${index + 1}. ${JSON.stringify(item, null, 2).split('\n').join('\n     ')}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✓ 驗證完成！資料格式正確');
  console.log('='.repeat(60));

} catch (error) {
  console.error('\n✗ 驗證失敗:', error.message);
  process.exit(1);
}
