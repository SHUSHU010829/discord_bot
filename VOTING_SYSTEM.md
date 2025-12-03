# 🗳️ Ticket 與投票系統整合使用指南

## 功能概述

這個系統將 Discord Ticket 系統與投票機制整合，讓成員可以透過 Ticket 申請新增或封存遊戲頻道，管理員審核後發起投票，系統會自動統計並通知結果。

## 核心流程

```
使用者開啟 Ticket → 提交遊戲申請 → 管理員審核 → 發起投票 →
成員投票（權重計分）→ 自動結算 → 通知結果 → 自動關閉 Ticket
```

## 設定步驟

### 1. 設定 config.json

在 `src/config.json` 中設定投票頻道 ID：

```json
"voting": {
  "votingChannelId": "YOUR_VOTING_CHANNEL_ID",  // 改成你的投票頻道 ID
  "voteDurationHours": 24,  // 投票持續時間（小時）
  "passThresholds": {
    "totalScore": 15,       // 總分門檻
    "minPlayers": 3         // 最低核心玩家數
  },
  "archiveThresholds": {
    "minActivePlayers": 2   // 封存提案的最低活躍玩家數
  },
  "weights": {
    "players": 3,           // 核心玩家權重
    "supporters": 1         // 支持者權重
  }
}
```

### 2. 設定 Ticket 系統

使用 `/setup-ticket` 指令在申請頻道設定 Ticket 面板。

## 使用流程

### 階段一：使用者提交申請

1. 使用者點擊 Ticket 面板的「創建票務」按鈕
2. 系統自動建立私人票務頻道 `ticket-username`
3. 使用者在票務頻道中輸入想要申請的遊戲名稱

### 階段二：管理員發起投票

管理員在票務頻道中使用指令：

```
/proposal start game:[遊戲名稱] type:[create/archive]
```

**參數說明：**
- `game`: 遊戲名稱（例如：Monster Hunter Wilds）
- `type`:
  - `create`: 新增頻道
  - `archive`: 封存頻道

**範例：**
```
/proposal start game:Monster Hunter Wilds type:create
```

### 階段三：成員投票

#### 新增頻道投票 (Create)

系統會在投票頻道發布投票訊息，包含三個按鈕：

1. **🔥 我會玩** (權重 3 分)
   - 代表：我擁有這款遊戲，頻道開了之後我會去講話/組隊
   - 這是「核心玩家」票，權重最高

2. **👍 純支持** (權重 1 分)
   - 代表：我沒玩，但我支持伺服器拓展這個遊戲
   - 或：我未來可能會買

3. **😶 沒興趣** (不計分)
   - 單純表態沒興趣，不影響投票結果

**通過條件（雙重鎖）：**
- 條件 A：總分 ≥ 15 分
- 條件 B：核心玩家（點擊「我會玩」）≥ 3 人

**必須同時滿足兩個條件才算通過！**

#### 封存頻道投票 (Archive)

系統會在投票頻道發布投票訊息，包含兩個按鈕：

1. **✋ 我還在玩**
   - 代表：反對封存，我仍在使用這個頻道

2. **📦 同意封存**
   - 代表：同意封存此頻道

**通過條件（反向邏輯）：**
- 如果「我還在玩」的人數 < 2 人，則封存提案通過
- 只要有 2 人以上還在玩，就自動駁回封存

### 階段四：自動結算

投票時間到達後，系統會自動：

1. **統計票數並判定結果**
2. **更新投票訊息**（顯示最終結果，移除按鈕）
3. **通知票務頻道**
   - ✅ 通過：顯示「恭喜！提案已通過」，列出核心玩家名單
   - ❌ 未通過：顯示「很遺憾，未達門檻」，5 分鐘後自動關閉 Ticket

## 投票邏輯詳解

### 情境範例

#### 情境 1：核心玩家充足
- 核心玩家：5 人 (5 × 3 = 15 分)
- 純支持：0 人
- **總分：15 分**
- **結果：✅ 通過**（有足夠的活躍玩家）

#### 情境 2：純支持很多但核心玩家不足
- 核心玩家：1 人 (1 × 3 = 3 分)
- 純支持：20 人 (20 × 1 = 20 分)
- **總分：23 分**
- **結果：❌ 未通過**（核心玩家 < 3，不滿足條件 B）

#### 情境 3：剛好達標
- 核心玩家：3 人 (3 × 3 = 9 分)
- 純支持：6 人 (6 × 1 = 6 分)
- **總分：15 分**
- **結果：✅ 通過**（剛好滿足兩個條件）

### 互斥投票邏輯

使用者在同一個投票中，只能選擇一個選項。系統會自動處理：
- 如果用戶點擊「我會玩」，然後改點「純支持」，系統會自動將其從「我會玩」名單移除，加入「純支持」名單
- 即時更新顯示當前票數

## 技術實作

### 資料庫結構

系統使用 MongoDB 儲存投票資料：

```javascript
{
  voteId: "unique_id",
  ticketChannelId: "999888777",    // 關鍵：綁定 Ticket 頻道
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

## 進階功能

### 核心玩家通知

當新增頻道提案通過時，系統會：
1. 在 Ticket 中列出所有投下「我會玩」的核心玩家
2. 管理員可以直接 @ 這些玩家，通知他們新頻道已建立

### 封存保護機制

封存投票使用反向邏輯：
- 不需要「贊成票」達到門檻
- 只要有足夠的人「反對」（還在玩），就否決封存
- 避免誤封存仍有人使用的頻道

## 常見問題

### Q: 如何調整通過門檻？

A: 修改 `config.json` 中的 `voting.passThresholds`：
```json
"passThresholds": {
  "totalScore": 15,    // 調整總分門檻
  "minPlayers": 3      // 調整最低核心玩家數
}
```

### Q: 如何調整投票時間？

A: 修改 `config.json` 中的 `voting.voteDurationHours`（單位：小時）

### Q: 如何調整權重？

A: 修改 `config.json` 中的 `voting.weights`：
```json
"weights": {
  "players": 3,      // 核心玩家權重
  "supporters": 1    // 支持者權重
}
```

### Q: 使用者可以改票嗎？

A: 可以！使用者可以隨時點擊不同的按鈕來改變自己的投票，系統會自動處理互斥邏輯。

### Q: 如果 Ticket 被手動關閉怎麼辦？

A: 投票仍會正常結算，但無法發送通知到 Ticket 頻道（因為已被刪除）。投票結果仍會顯示在投票頻道中。

## 權限要求

### Bot 權限
- `ManageChannels`: 建立和刪除票務頻道
- `SendMessages`: 發送訊息和 Embed
- `ViewChannel`: 查看頻道

### 使用者權限
- `/proposal start` 指令需要 `ManageChannels` 權限（通常只有管理員）
- 一般成員可以建立 Ticket 和參與投票

## 檔案結構

```
src/
├── commands/ticket/
│   ├── setup-ticket.js      # 設定 Ticket 面板
│   ├── close-ticket.js      # 關閉 Ticket
│   └── proposal.js          # 發起投票提案 (新增)
├── events/
│   ├── ready/
│   │   ├── connectDb.js     # 資料庫連接 (已更新)
│   │   └── voteScheduler.js # 投票自動結算 (新增)
│   └── interactionCreate/
│       └── interactionCreate.js  # 按鈕互動處理 (已更新)
└── config.json              # 配置文件 (已更新)
```

## 維護建議

1. **定期備份資料庫**：投票資料儲存在 MongoDB 中
2. **監控 cron job**：確保自動結算系統正常運作
3. **調整門檻**：根據伺服器大小調整通過門檻
4. **收集反饋**：定期詢問成員對投票系統的意見

## 更新日誌

### v1.0.0 (2025-12-02)
- ✅ 初始版本發布
- ✅ 整合 Ticket 與投票系統
- ✅ 實作權重投票機制
- ✅ 自動結算與通知功能
- ✅ 支援新增與封存兩種提案類型
