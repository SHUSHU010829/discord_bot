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

    let allData = [];
    let successCount = 0;

    // 下載當前年份的資料（必要）
    try {
      const currentYearData = await fetchCalendarData(currentYear);
      allData = [...allData, ...currentYearData];
      successCount++;
    } catch (error) {
      console.error(`✗ 無法下載 ${currentYear} 年的資料`);
      throw error; // 當前年份是必要的，如果失敗就終止
    }

    // 下載下一年的資料（可選）
    try {
      const nextYearData = await fetchCalendarData(nextYear);
      allData = [...allData, ...nextYearData];
      successCount++;
    } catch (error) {
      console.warn(`⚠ 無法下載 ${nextYear} 年的資料，可能尚未發布`);
      console.warn('  將只使用當前年份的資料');
    }

    if (allData.length === 0) {
      throw new Error('沒有成功下載任何資料');
    }

    // 備份現有檔案
    if (fs.existsSync(OUTPUT_PATH)) {
      const backupPath = OUTPUT_PATH.replace('.json', `.backup_${Date.now()}.json`);
      fs.copyFileSync(OUTPUT_PATH, backupPath);
      console.log(`\n✓ 已備份現有檔案至: ${path.basename(backupPath)}`);
    }

    // 寫入新資料
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allData, null, 2), 'utf8');
    console.log(`✓ 成功更新行事曆資料至: ${OUTPUT_PATH}`);
    console.log(`✓ 總共 ${allData.length} 筆資料 (成功下載 ${successCount} 個年份)`);

    // 顯示詳細資訊
    const years = [...new Set(allData.map(item => item.date.substring(0, 4)))];
    console.log(`✓ 涵蓋年份: ${years.join(', ')}`);

    console.log('\n更新完成！');
  } catch (error) {
    console.error(`\n✗ 更新失敗: ${error.message}`);
    process.exit(1);
  }
}

// 執行更新
updateCalendarData();
