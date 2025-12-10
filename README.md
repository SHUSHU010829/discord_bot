# Discord Bot

![Alt](https://repobeats.axiom.co/api/embed/07fb82330959889996315cafa478ae498f152b45.svg "Repobeats analytics image")

## 目錄

- [功能特色](#功能特色)
  - [動態語音頻道](#動態語音頻道)
  - [Ticket 與投票系統](#ticket-與投票系統)
- [設定指南](#設定指南)
  - [動態語音頻道設定](#動態語音頻道設定)
  - [投票系統設定](#投票系統設定)
- [API 資訊](#api-資訊)

## 功能特色

### 動態語音頻道

支援自由創建臨時語音頻道功能。用戶只需加入特定的語音頻道,機器人就會自動創建一個新的語音頻道。

**特性:**

- **自動創建頻道**: 當用戶加入「點選新增頻道」時,機器人會自動創建一個新的語音頻道
- **預設名稱**: 新頻道的預設名稱為「記得改名喔!」
- **創建者權限**:
  - 可以編輯頻道名稱
  - 可以調整頻道人數上限
  - 可以管理頻道設置
- **所有成員權限**: 加入頻道的所有人都可以編輯頻道狀態
- **自動清理**: 當頻道內沒有人時,該頻道會自動刪除

### Ticket 與投票系統

整合 Discord Ticket 系統與投票機制,讓成員可以透過 Ticket 申請新增或封存遊戲頻道,管理員審核後發起投票,系統會自動統計並通知結果。

**核心流程:**

```
使用者開啟 Ticket → 提交遊戲申請 → 管理員審核 → 發起投票 →
成員投票(權重計分) → 自動結算 → 通知結果 → 自動關閉 Ticket
```

**投票類型:**

#### 新增頻道投票 (Create)

- **🔥 我會玩** (權重 3 分) - 代表擁有遊戲且會活躍使用頻道
- **👍 純支持** (權重 1 分) - 代表支持但不一定會玩
- **😶 沒興趣** (不計分) - 單純表態

**通過條件 (雙重鎖):**
- 總分 ≥ 15 分
- 核心玩家 ≥ 3 人

#### 封存頻道投票 (Archive)

- **✋ 我還在玩** - 反對封存
- **📦 同意封存** - 同意封存

**通過條件:**
- 「我還在玩」的人數 < 2 人則封存通過

## 設定指南

### 動態語音頻道設定

#### 1. 創建語音頻道

在您的 Discord 伺服器中創建一個語音頻道,命名為「點選新增頻道」(或其他您喜歡的名稱)。

#### 2. 獲取頻道 ID

1. 在 Discord 中啟用開發者模式:
   - 用戶設置 > 應用設置 > 進階 > 開發者模式 (開啟)
2. 右鍵點擊您剛創建的語音頻道
3. 點擊「複製頻道 ID」

#### 3. 配置機器人

打開 `src/config.json` 文件,將複製的頻道 ID 填入 `createVoiceChannelId` 欄位:

```json
{
  "serverId": "您的伺服器ID",
  "developersId": ["開發者ID"],
  "normalChannelId": "一般頻道ID",
  "createVoiceChannelId": "您複製的頻道ID"
}
```

#### 4. 重啟機器人

保存配置文件後,重啟機器人以載入新設置。

#### 使用方法

1. 用戶加入「點選新增頻道」
2. 機器人自動創建新的語音頻道並將用戶移動到新頻道
3. 用戶可以在新頻道中自由聊天
4. 創建者可以修改頻道名稱和設置
5. 所有成員都可以編輯頻道狀態
6. 當所有人離開後,頻道會自動刪除

#### 注意事項

- 確保機器人擁有「管理頻道」和「移動成員」權限
- 新創建的頻道會放在與「點選新增頻道」相同的分類下
- 如果未設置 `createVoiceChannelId`,功能將不會啟動

#### 故障排除

**機器人沒有創建新頻道:**

1. 檢查 `src/config.json` 中的 `createVoiceChannelId` 是否正確
2. 確認機器人擁有足夠的權限
3. 查看控制台日誌是否有錯誤訊息

**無法修改頻道設置:**

確保創建者在頻道中擁有「管理頻道」權限。這個權限會在頻道創建時自動授予。

**頻道沒有自動刪除:**

確保機器人正常運行且沒有重啟。頻道資訊存儲在記憶體中,重啟後會丟失。

### 投票系統設定

#### 1. 設定 config.json

在 `src/config.json` 中設定投票頻道 ID:

```json
"voting": {
  "votingChannelId": "YOUR_VOTING_CHANNEL_ID",
  "voteDurationHours": 24,
  "passThresholds": {
    "totalScore": 15,
    "minPlayers": 3
  },
  "archiveThresholds": {
    "minActivePlayers": 2
  },
  "weights": {
    "players": 3,
    "supporters": 1
  }
}
```

**參數說明:**

- `votingChannelId`: 投票頻道 ID
- `voteDurationHours`: 投票持續時間 (小時)
- `passThresholds.totalScore`: 總分門檻
- `passThresholds.minPlayers`: 最低核心玩家數
- `archiveThresholds.minActivePlayers`: 封存提案的最低活躍玩家數
- `weights.players`: 核心玩家權重
- `weights.supporters`: 支持者權重

#### 2. 設定 Ticket 系統

使用 `/setup-ticket` 指令在申請頻道設定 Ticket 面板。

#### 使用流程

**階段一: 使用者提交申請**

1. 使用者點擊 Ticket 面板的「創建票務」按鈕
2. 系統自動建立私人票務頻道 `ticket-username`
3. 使用者在票務頻道中輸入想要申請的遊戲名稱

**階段二: 管理員發起投票**

管理員在票務頻道中使用指令:

```
/proposal start game:[遊戲名稱] type:[create/archive]
```

參數說明:
- `game`: 遊戲名稱 (例如: Monster Hunter Wilds)
- `type`: `create` (新增頻道) 或 `archive` (封存頻道)

範例:
```
/proposal start game:Monster Hunter Wilds type:create
```

**階段三: 成員投票**

系統會在投票頻道發布投票訊息,成員可以點擊按鈕進行投票。

**階段四: 自動結算**

投票時間到達後,系統會自動:

1. 統計票數並判定結果
2. 更新投票訊息 (顯示最終結果,移除按鈕)
3. 通知票務頻道
   - ✅ 通過: 顯示「恭喜!提案已通過」,列出核心玩家名單
   - ❌ 未通過: 顯示「很遺憾,未達門檻」,5 分鐘後自動關閉 Ticket

#### 投票邏輯範例

**情境 1: 核心玩家充足**
- 核心玩家: 5 人 (5 × 3 = 15 分)
- 純支持: 0 人
- **總分: 15 分**
- **結果: ✅ 通過** (有足夠的活躍玩家)

**情境 2: 純支持很多但核心玩家不足**
- 核心玩家: 1 人 (1 × 3 = 3 分)
- 純支持: 20 人 (20 × 1 = 20 分)
- **總分: 23 分**
- **結果: ❌ 未通過** (核心玩家 < 3,不滿足條件)

**情境 3: 剛好達標**
- 核心玩家: 3 人 (3 × 3 = 9 分)
- 純支持: 6 人 (6 × 1 = 6 分)
- **總分: 15 分**
- **結果: ✅ 通過** (剛好滿足兩個條件)

#### 常見問題

**Q: 如何調整通過門檻?**

A: 修改 `config.json` 中的 `voting.passThresholds`:

```json
"passThresholds": {
  "totalScore": 15,    // 調整總分門檻
  "minPlayers": 3      // 調整最低核心玩家數
}
```

**Q: 如何調整投票時間?**

A: 修改 `config.json` 中的 `voting.voteDurationHours` (單位: 小時)

**Q: 如何調整權重?**

A: 修改 `config.json` 中的 `voting.weights`:

```json
"weights": {
  "players": 3,      // 核心玩家權重
  "supporters": 1    // 支持者權重
}
```

**Q: 使用者可以改票嗎?**

A: 可以!使用者可以隨時點擊不同的按鈕來改變自己的投票,系統會自動處理互斥邏輯。

**Q: 如果 Ticket 被手動關閉怎麼辦?**

A: 投票仍會正常結算,但無法發送通知到 Ticket 頻道 (因為已被刪除)。投票結果仍會顯示在投票頻道中。

#### 權限要求

**Bot 權限:**
- `ManageChannels`: 建立和刪除票務頻道
- `SendMessages`: 發送訊息和 Embed
- `ViewChannel`: 查看頻道

**使用者權限:**
- `/proposal start` 指令需要 `ManageChannels` 權限 (通常只有管理員)
- 一般成員可以建立 Ticket 和參與投票

## API 資訊

- 加密貨幣: <https://min-api.cryptocompare.com/documentation>
- 日曆: <https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/2025.json>
- fixthreads: <https://github.com/milanmdev/fixthreads>

## 技術架構

### 資料庫結構

系統使用 MongoDB 儲存投票資料:

```javascript
{
  voteId: "unique_id",
  ticketChannelId: "999888777",
  proposerId: "user_id",
  gameName: "Monster Hunter Wilds",
  proposalType: "create",          // 或 "archive"
  status: "VOTING",                // VOTING, PASSED, FAILED
  messageId: "111222333",
  channelId: "voting_channel_id",
  guildId: "guild_id",
  votes: {
    players: ["user1", "user2"],   // 核心玩家
    supporters: ["user3", "user4"], // 支持者
    noInterest: ["user5"]          // 沒興趣
  },
  createdAt: Date,
  expiresAt: Date
}
```

### 自動結算機制

- 使用 node-cron 每 5 分鐘檢查一次過期的投票
- 自動計算分數並判定結果
- 更新投票訊息狀態
- 發送通知到原始 Ticket 頻道
- 未通過的提案會在 5 分鐘後自動關閉 Ticket

### 檔案結構

```
src/
├── commands/ticket/
│   ├── setup-ticket.js      # 設定 Ticket 面板
│   ├── close-ticket.js      # 關閉 Ticket
│   └── proposal.js          # 發起投票提案
├── events/
│   ├── ready/
│   │   ├── connectDb.js     # 資料庫連接
│   │   └── voteScheduler.js # 投票自動結算
│   └── interactionCreate/
│       └── interactionCreate.js  # 按鈕互動處理
└── config.json              # 配置文件
```

## 維護建議

1. **定期備份資料庫**: 投票資料儲存在 MongoDB 中
2. **監控 cron job**: 確保自動結算系統正常運作
3. **調整門檻**: 根據伺服器大小調整通過門檻
4. **收集反饋**: 定期詢問成員對投票系統的意見
