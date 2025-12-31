# 行事曆資料自動更新說明

## 概述

本專案使用台灣政府行事曆資料來發送每日早安訊息。行事曆資料來源為 [ruyut/TaiwanCalendar](https://github.com/ruyut/TaiwanCalendar)，透過 jsDelivr CDN 提供。

## 日期格式

- **新格式**: `YYYYMMDD` (例如: `20250101`)
- **舊格式**: `YYYY-MM-DD` (例如: `2025-01-01`)

從現在開始，所有行事曆資料都使用新格式 `YYYYMMDD`。

## 資料欄位

每筆行事曆資料包含以下欄位：

```json
{
  "date": "20250101",
  "week": "三",
  "isHoliday": true,
  "description": "元旦 AKA 開國紀念日"
}
```

- `date`: 日期 (格式: YYYYMMDD)
- `week`: 星期 (一、二、三、四、五、六、日)
- `isHoliday`: 是否為假日 (boolean)
- `description`: 節日說明或備註

## 如何更新行事曆資料

### 方法一：使用 npm 腳本（推薦）

```bash
npm run update-calendar
```

這個指令會：
1. 自動下載當前年份和下一年度的行事曆資料
2. 備份現有的 `calender.json` 檔案（命名為 `calender.backup_[timestamp].json`）
3. 合併兩年的資料並更新到 `src/data/calender.json`

### 方法二：手動執行腳本

```bash
node src/scripts/updateCalendar.js
```

### 建議更新時機

- **每年 12 月中旬**: 下一年度的行事曆資料通常會在這時候發布
- **遇到補班調整**: 政府公告補班日調整時，可以重新更新

## 資料來源

- **GitHub 專案**: [ruyut/TaiwanCalendar](https://github.com/ruyut/TaiwanCalendar)
- **CDN URL 格式**: `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/{year}.json`

## 注意事項

1. 更新前會自動備份現有資料，備份檔案保存在同一目錄
2. 腳本會同時下載當前年份和下一年度的資料，確保跨年時也有資料
3. 如果遠端資料尚未發布（例如提前下載 2027 年資料），腳本會顯示錯誤
4. 自訂的節日資料（如生日等）在更新後會被覆蓋，請另外備份或手動添加

## 自訂節日資料

如果你有自訂的節日資料（例如生日、紀念日等），可以在更新後手動添加到 `calender.json` 檔案中。

例如：
```json
{
  "date": "20250421",
  "week": "一",
  "isHoliday": false,
  "description": "汐女士饅頭生日"
}
```

## 疑難排解

### 無法下載資料

如果出現網路錯誤，請檢查：
- 網路連線是否正常
- 是否能訪問 `cdn.jsdelivr.net`
- 遠端資料是否已發布（政府通常在 12 月發布下一年度資料）

### 日期格式錯誤

所有日期必須使用 `YYYYMMDD` 格式（8 位數字，無連字符）。如果出現錯誤，請檢查 `calender.json` 檔案中的日期格式。
