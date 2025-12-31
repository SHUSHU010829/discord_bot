const fs = require('fs');
const https = require('https');
const path = require('path');

/**
 * 自動更新台灣行事曆資料
 * 從 https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/{year}.json 下載資料
 * 並儲存到 src/data/calender.json
 */

// 獲取當前年份和下一年
const currentYear = new Date().getFullYear();
const nextYear = currentYear + 1;

// 資料來源 URL
const CALENDAR_URL = 'https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data';
const OUTPUT_PATH = path.join(__dirname, '../data/calender.json');

/**
 * 從指定年份的 URL 下載 JSON 資料
 */
function fetchCalendarData(year) {
  return new Promise((resolve, reject) => {
    const url = `${CALENDAR_URL}/${year}.json`;
    console.log(`正在下載 ${year} 年的行事曆資料...`);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: 無法下載 ${year} 年的資料`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log(`✓ 成功下載 ${year} 年的資料 (共 ${jsonData.length} 筆)`);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`解析 ${year} 年的 JSON 資料時發生錯誤: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`下載 ${year} 年的資料時發生錯誤: ${error.message}`));
    });
  });
}

/**
 * 合併多年的行事曆資料
 */
async function updateCalendarData() {
  try {
    console.log('開始更新行事曆資料...\n');

    // 下載當前年份和下一年的資料
    const currentYearData = await fetchCalendarData(currentYear);
    const nextYearData = await fetchCalendarData(nextYear);

    // 合併資料
    const mergedData = [...currentYearData, ...nextYearData];

    // 備份現有檔案
    if (fs.existsSync(OUTPUT_PATH)) {
      const backupPath = OUTPUT_PATH.replace('.json', `.backup_${Date.now()}.json`);
      fs.copyFileSync(OUTPUT_PATH, backupPath);
      console.log(`\n✓ 已備份現有檔案至: ${path.basename(backupPath)}`);
    }

    // 寫入新資料
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mergedData, null, 2), 'utf8');
    console.log(`✓ 成功更新行事曆資料至: ${OUTPUT_PATH}`);
    console.log(`✓ 總共 ${mergedData.length} 筆資料 (${currentYear}: ${currentYearData.length} 筆, ${nextYear}: ${nextYearData.length} 筆)`);
    console.log('\n更新完成！');
  } catch (error) {
    console.error(`\n✗ 更新失敗: ${error.message}`);
    process.exit(1);
  }
}

// 執行更新
updateCalendarData();
