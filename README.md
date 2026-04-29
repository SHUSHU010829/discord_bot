# 逼逼機器人 (Discord Bot)

![Repobeats](https://repobeats.axiom.co/api/embed/07fb82330959889996315cafa478ae498f152b45.svg "Repobeats analytics image")

一隻為單一 Discord 社群量身打造的多功能機器人，整合社群治理（票務 / 投票 / 動態語音 / 身份組）、生活娛樂（早安卡、抽籤、食物/飲料管理、星座運勢）與外部資訊推播（Steam 特價、喜加一、加密貨幣、匯率、天氣）。

---

## 目錄

- [設計目的](#設計目的)
- [使用技術](#使用技術)
- [專案結構](#專案結構)
- [安裝與部署](#安裝與部署)
- [核心功能與操作流程](#核心功能與操作流程)
  - [動態語音頻道](#1-動態語音頻道)
  - [Ticket 與遊戲頻道投票](#2-ticket-與遊戲頻道投票)
  - [身份組自助領取](#3-身份組自助領取)
  - [建議 / 投票面板](#4-建議--投票面板)
  - [Steam 特價推播](#5-steam-特價推播)
  - [喜加一（限時免費）推播](#6-喜加一限時免費推播)
  - [每日早安卡 / 今日報告](#7-每日早安卡--今日報告)
  - [食物與飲料系統](#8-食物與飲料系統)
  - [加密貨幣 / 匯率 / 天氣](#9-加密貨幣--匯率--天氣)
  - [抽籤、統計與其他指令](#10-抽籤統計與其他指令)
  - [Twitter / Threads 連結修正](#11-twitter--threads-連結修正)
- [維運腳本](#維運腳本)
- [外部 API](#外部-api)
- [維護建議](#維護建議)

---

## 設計目的

- **集中化社群治理**：以「申請 → 審核 → 投票 → 自動結算」流程規範遊戲頻道的開設與封存，避免管理員主觀決策。
- **降低管理員負擔**：動態語音頻道、Ticket、身份組、建議蒐集等流程全部交由 bot 自動化處理。
- **內容主動觸達**：將 Steam 特價、限時免費遊戲、每日早安、星座運勢等資訊在固定時間推播到指定頻道，提升社群活躍度。
- **單一伺服器最佳化**：所有設定集中在 `src/config.json`，搭配 `.env` 即可快速複製到其他伺服器使用。

---

## 使用技術

| 類別 | 技術 |
| --- | --- |
| 執行環境 | Node.js 22.x |
| Discord SDK | [discord.js](https://discord.js.org/) v14（Slash Command、Buttons、Modal、Embed） |
| 資料庫 | MongoDB Atlas（透過官方 `mongodb` driver） |
| 排程 | [`node-cron`](https://www.npmjs.com/package/node-cron) |
| 圖片產生 | `satori` + `satori-html` + `@resvg/resvg-js`（早安卡、運勢卡） |
| 時間處理 | `luxon`、`tyme4ts`（農民曆 / 節氣） |
| 中文轉換 | `opencc-js`（簡繁轉換） |
| HTTP | `axios` |
| 部署 | Dockerfile（`node:22-slim`） |
| 開發工具 | `nodemon`、`dotenv` |

機器人在 `src/index.js` 啟動，建立 Discord Client 後委派給 `src/handlers/eventHandler.js` 動態載入 `src/events/**` 中所有事件處理器與 `src/commands/**` 中的 Slash Command。

---

## 專案結構

```
src/
├── index.js                # 進入點
├── config.json             # 主要設定檔（頻道 ID、權重、推播排程…）
├── messageConfig.json      # 訊息文案
├── handlers/eventHandler.js
├── commands/               # Slash Commands（按功能分子目錄）
│   ├── ask/                # 詢問星座運勢、占卜
│   ├── currency/           # 加密貨幣、匯率
│   ├── draw/               # 抽籤、樂透、抽一個
│   ├── food/               # 食物/飲料 CRUD、抽食物、抽飲料
│   ├── general/            # /help、/today-report
│   ├── misc/               # /ping
│   ├── post/               # 整人小工具（瓦斯燈）
│   ├── roles/              # /setup-roles
│   ├── stats/              # /stats、/leaderboard
│   ├── ticket/             # /setup-ticket、/proposal、/close-ticket、/setup-suggestion
│   └── weather/            # /weather
├── events/
│   ├── ready/              # bot 啟動時要做的事（載入 DB、註冊指令、起 cron…）
│   ├── interactionCreate/  # 按鈕、Select Menu 互動
│   ├── messageCreate/      # 訊息統計、Twitter/Threads 連結修正
│   ├── voiceStateUpdate/   # 動態語音、語音時長統計
│   ├── guildMemberAdd/Remove
│   └── validations/        # Slash Command 前置驗證、Autocomplete
├── features/
│   ├── steamDeals/         # 小黑盒 RSS → Steam API → Embed → 推播
│   └── freeGames/          # 喜加一抓取與發送
├── utils/                  # 共用函式（卡片產生、農民曆、autocomplete…）
├── data/                   # 持久化 JSON（身份組、建議、票務面板）
├── constants/              # 食物分類等靜態常數
├── scripts/                # 行事曆轉換、驗證
└── tool/                   # 部署 / 刪除 Slash Command 用的維運腳本
```

---

## 安裝與部署

### 1. 取得程式碼與安裝套件

```bash
git clone https://github.com/shushu010829/discord_bot.git
cd discord_bot
npm install
```

### 2. 建立 `.env`

複製 `.env.example` 為 `.env` 並填入：

| 變數 | 說明 |
| --- | --- |
| `BOT_TOKEN` | Discord Developer Portal 取得的 Bot Token |
| `MONGO_PASSWORD` | MongoDB Atlas 密碼 |
| `DISCORD_DEALS_CHANNEL_ID` | Steam 特價推播頻道（留空則用 `config.json`） |
| `STEAM_DEALS_*` | 排程、暫停、Dry-run、首啟即跑 |
| `DISCORD_FREE_GAMES_CHANNEL_ID`、`FREE_GAMES_*` | 喜加一推播控制 |

### 3. 設定 `src/config.json`

至少填入以下欄位（其他依需要）：

- `serverId`、`developersId`
- `normalChannelId`、`createVoiceChannelId`、`memberCountChannelId`
- `ticket.categoryId`、`ticket.supportRoleId`
- `voting.votingChannelId`
- `roles[]`（提供身份組面板選項）

### 4. 部署 Slash Command

```bash
node src/tool/deploy-commands.js   # 註冊指令
node src/tool/get-commands.js      # 列出已註冊指令
node src/tool/delete-commands.js   # 清除指令
```

### 5. 啟動

```bash
# 開發模式（nodemon 熱重載）
npm run start:dev

# 直接啟動
node src/index.js
```

### 6. Docker 部署

```bash
docker build -t discord-bot .
docker run -d --env-file .env --name bibi-bot discord-bot
```

---

## 核心功能與操作流程

### 1. 動態語音頻道

**目的**：讓成員自由建立 / 銷毀臨時語音頻道，無需打擾管理員。

**操作流程**：

```
使用者加入「點選新增頻道」
   ↓ voiceStateUpdate 觸發
bot 自動建立同分類下的新頻道（預設名稱「記得改名喔！」）
   ↓
將使用者移動進新頻道，並授予建立者「管理頻道」權限
   ↓
所有成員離開 → bot 自動刪除頻道
```

**設定**：將語音頻道 ID 填入 `config.json` 的 `createVoiceChannelId` 即可。

> Bot 必須擁有 **管理頻道** 與 **移動成員** 權限。頻道狀態僅存在記憶體中，重啟會遺失。

---

### 2. Ticket 與遊戲頻道投票

**目的**：把「想開新遊戲頻道 / 想封存舊頻道」的決策權交給社群投票。

**完整流程**：

```
使用者點 Ticket 面板「創建票務」
   ↓ 自動建立 ticket-{username} 私人頻道
管理員在票務頻道輸入 /proposal start
   ↓ bot 在投票頻道發布投票訊息
成員按按鈕投票（可改票、有互斥邏輯）
   ↓ node-cron 每 5 分鐘檢查過期投票
自動結算 → 更新訊息 → 通知 Ticket
   未通過：5 分鐘後自動關閉 Ticket
```

**指令**：

| 指令 | 權限 | 說明 |
| --- | --- | --- |
| `/setup-ticket` | 管理員 | 在當前頻道部署 Ticket 面板 |
| `/proposal start game:<名稱> type:<create\|archive>` | `ManageChannels` | 在 Ticket 頻道發起投票 |
| `/close-ticket` | Ticket 開啟者 / 管理員 | 立即關閉 Ticket |

**新增頻道 (create) 投票機制**：

| 選項 | 權重 | 意義 |
| --- | --- | --- |
| 🔥 我會玩 | 3 | 擁有遊戲、會活躍使用 |
| 👍 純支持 | 1 | 支持但不一定會玩 |
| 😶 沒興趣 | 0 | 純表態 |

**通過條件（雙重鎖）**：總分 ≥ `passThresholds.totalScore`（預設 15）**且** 核心玩家 ≥ `passThresholds.minPlayers`（預設 3）。

**封存頻道 (archive) 投票**：

- ✋ 我還在玩 / 📦 同意封存
- 「我還在玩」< `archiveThresholds.minActivePlayers`（預設 2）即通過封存。

**MongoDB 資料結構**：

```javascript
{
  voteId, ticketChannelId, proposerId, gameName,
  proposalType,                       // create | archive
  status,                             // VOTING | PASSED | FAILED
  messageId, channelId, guildId,
  votes: { players: [], supporters: [], noInterest: [] },
  createdAt, expiresAt
}
```

---

### 3. 身份組自助領取

**目的**：讓成員自行勾選想接收通知的身份組，免人工指派。

**流程**：

1. 管理員在通知頻道執行 `/setup-roles`
2. bot 依 `config.json` 的 `roles[]` 產生 Select Menu 面板
3. 成員選擇後由 `events/interactionCreate/handleRoleSelect.js` 增/刪身份組
4. 面板狀態會持久化到 `src/data/role-panels.json`，重啟後仍可運作

---

### 4. 建議 / 投票面板

**指令**：`/setup-suggestion`

提供讓成員提案、其他人投票（贊成 / 反對）的輕量級面板，資料存於 `src/data/suggestion-panels.json`，並由 `suggestionScheduler.js` 進行定期維護。

---

### 5. Steam 特價推播

**目的**：自動把台灣區 Steam 史低 / 高折扣遊戲推送到指定頻道。

**處理鏈**（`src/features/steamDeals/`）：

```
小黑盒 RSS (xiaoheihe.js)
   ↓ 抓回特價清單
Steam Store API (steam.js)
   ↓ 補上台幣價格、是否史低
filter.js
   ↓ 過濾掉非台區、不符條件
dedupe.js
   ↓ 同一遊戲不重複推
embed.js → 發送 Embed
```

**控制變數**（`.env` 覆寫 `config.json`）：

- `STEAM_DEALS_ENABLED`：開關
- `STEAM_DEALS_CRON`：排程（預設每 2 小時）
- `STEAM_DEALS_DRY_RUN`：只 log 不發送
- `STEAM_DEALS_RUN_ON_START`：啟動立即跑一次（驗證用）
- `activeHours.startHour / endHour`：只在指定時段內推播

---

### 6. 喜加一（限時免費）推播

**目的**：彙整 Epic / Steam / GOG 的限時免費遊戲。

**設定**位於 `config.json` 的 `freeGames`，可單獨開關各平台與設定 RSS 來源；同樣支援 Dry-run、首啟即跑。

排程預設 `30 */6 * * *`（與 Steam 特價錯開），實作於 `src/features/freeGames/` 與 `events/ready/freeGamesScheduler.js`。

---

### 7. 每日早安卡 / 今日報告

- **早安卡**：`events/ready/sendMorningMessage.js` 依 `morningMessage.cronSchedule`（預設每天早上 8 點）發送，使用 `satori` 動態繪製含日期、星期、節氣、農民曆、詩詞、運勢的 PNG 卡片。
- **`/today-report`**：成員可隨時手動取得今日資訊（日期、運勢、節日）。
- **資料來源**：本地 `src/data/calender.json`（透過 `scripts/updateCalendar.js` 從 TaiwanCalendar 更新）、`utils/getLunarInfo.js`（農民曆）、`utils/getPoem.js`（詩詞）。

---

### 8. 食物與飲料系統

為了解決「今天吃什麼？」的萬年難題：

| 指令 | 用途 |
| --- | --- |
| `/increase-food` | 新增餐廳 / 食物 |
| `/batch-add-food` | 批次匯入 |
| `/delete-food` | 刪除 |
| `/food-list` | 查看目前清單 |
| `/food-ranking` | 依抽中次數排名 |
| `/draw-lot` | 抽今天吃什麼 |
| `/drink-lot` | 抽今天喝什麼 |
| `/beverage-stores`、`/import-beverage-menu` | 飲料店與菜單管理 |

資料存於 MongoDB；指令內含 Autocomplete（`utils/autocompleteFoodName.js`、`autocompleteBeverageStore.js`）。

---

### 9. 加密貨幣 / 匯率 / 天氣

- `/cryptocurrency`：透過 [cryptocompare](https://min-api.cryptocompare.com/documentation) 查即時幣價。
- `/exchange-rate`：查台幣對外幣匯率。
- `/weather city:<城市>`、`/weather all`：查台灣縣市天氣。

---

### 10. 抽籤、統計與其他指令

| 指令 | 說明 |
| --- | --- |
| `/choose-one` | 在多個選項中隨機抽一個 |
| `/lotto` | 模擬樂透開獎 |
| `/straws` | 抽籤（吉凶） |
| `/ask` | 占卜 / 星座運勢 |
| `/stats`、`/leaderboard` | 訊息與語音時長統計（由 `messageStats.js`、`voiceStats.js` 累積） |
| `/gaslight`、`/increase-gaslight` | 整人小工具 |
| `/help` | 查看指令說明 |
| `/ping` | 測試延遲 |

---

### 11. Twitter / Threads 連結修正

`events/messageCreate/threadsLinkHandler.js` 會自動偵測訊息中的 Twitter / Threads 連結，回覆可正確顯示嵌入內容的 fxtwitter / fixthreads 版本，方便手機瀏覽。

---

## 維運腳本

```bash
npm run update-calendar    # 從 TaiwanCalendar 抓最新行事曆
npm run verify-calendar    # 驗證行事曆 JSON 完整性
npm run convert-calendar   # 行事曆格式轉換

node src/tool/deploy-commands.js   # 註冊 / 更新 Slash Command
node src/tool/get-commands.js      # 列出已註冊指令
node src/tool/delete-commands.js   # 清空所有指令（謹慎使用）
```

---

## 外部 API

| 用途 | URL |
| --- | --- |
| 加密貨幣 | <https://min-api.cryptocompare.com/documentation> |
| 台灣行事曆 | <https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/2025.json> |
| Steam 特價來源 | 小黑盒 RSS（`https://discord-news.zeabur.app/xiaoheihe/...`） |
| Steam 商品資訊 | Steam Store API |
| Threads 連結修正 | <https://github.com/milanmdev/fixthreads> |

---

## 維護建議

1. **定期備份 MongoDB**：投票、食物、訊息統計等資料皆存於此。
2. **監控 cron**：投票結算、Steam 特價、喜加一、早安卡都仰賴 `node-cron`，bot 重啟後排程會重建。
3. **依社群規模調整門檻**：`voting.passThresholds`、`voting.weights`、`activeHours` 都可在不重啟程式的情況下用 PR / 重新部署修改。
4. **Slash Command 變更後執行 `deploy-commands`**：否則 Discord 端不會看到新指令。
5. **動態語音頻道資料僅在記憶體**：若有計畫長時間維運，可考慮持久化到 MongoDB 以便在重啟時恢復。
