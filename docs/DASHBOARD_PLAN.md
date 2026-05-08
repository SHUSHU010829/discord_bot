# Discord Bot Dashboard 開發計畫書

> 取代用 Slash Command 查資料的麻煩流程，提供 Web Dashboard 給管理員與一般使用者使用。

## 0. 決策摘要

| 項目 | 選擇 |
|---|---|
| 前端 | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** |
| 後端 | 沿用 `src/httpServer` (Express)，新增 `/api/*` |
| 資料庫 | 既有 MongoDB（共用 Bot 連線） |
| Auth | Discord OAuth2（`identify` + `guilds`） |
| 部署 | **Dashboard 獨立部署**（Vercel），Bot 留在現有 Docker |
| 開發優先序 | **Admin 後台優先** → 一般使用者功能 |

---

## 1. 角色與權限

| 角色 | 判定方式 | 權限 |
|---|---|---|
| Public | 未登入 | 無（landing page only） |
| Member | Discord OAuth 登入 + 在 guild 內 | 看自己資料、公開排行榜、投票 |
| Admin | guild permission `ManageGuild` 或 `Administrator` | 全部 + 後台管理 |
| Owner | `process.env.OWNER_ID === user.id` | + 推播開關、env 旗標、危險操作 |

每支 API 都會跑 middleware：

```
session → fetch Discord member from cache → check permission flag → allow/deny
```

權限不額外存表，全靠 Discord guild 的 role/permission，避免雙寫造成不一致。

---

## 2. 系統架構

```
┌─────────────────┐   OAuth    ┌──────────────────────┐
│  Browser        │──────────▶│  Discord OAuth2      │
│  (Next.js SSR)  │            └──────────────────────┘
└────────┬────────┘
         │  fetch /api/*  (JWT in httpOnly cookie)
         ▼
┌──────────────────────────────────────────────────────┐
│  Bot Process (Node 22)                               │
│  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ Discord.js   │  │ Express httpServer           │  │
│  │ client       │◀─│  /health  /diagnostics       │  │
│  │              │  │  /api/v1/*  (NEW)            │  │
│  └──────┬───────┘  └──────────────┬───────────────┘  │
│         └───────── shared ────────┤                  │
│                                   ▼                  │
│                         ┌──────────────────┐         │
│                         │   MongoDB        │         │
│                         └──────────────────┘         │
└──────────────────────────────────────────────────────┘
```

**獨立部署影響**：
- Next.js 在 Vercel，Bot Express 在 VPS/雲伺服器（既有環境）
- 必須處理 **CORS**（白名單 dashboard domain）
- JWT cookie 要 `SameSite=None; Secure`，或改用 Authorization header
- OAuth callback URL 要設兩組（local + production）

---

## 3. 前置重構（W0，動工前必做）

1. **抽出 MongoDB 連線設定**
   - 目前 `src/events/ready/connectDb.js` URI 是 hardcode
   - 改成讀 `MONGODB_URI`，補進 `.env.example`
2. **整理 collection schema 文件**
   - 新增 `docs/SCHEMA.md`，列出 30+ collections 的欄位、index、寫入時機
   - 後續 API 直接對照
3. **共用 db handle**
   - 把 `getDb()` helper 抽到 `src/lib/db.js`，避免 API 重複建立連線
4. **httpServer 模組化**
   - `src/httpServer/index.js` → 拆 `routes/health.js` `routes/api/*`
   - 加上 `helmet`、`cors`、`express-rate-limit`

---

## 4. 後端 API 設計

### 4.1 路徑慣例

```
/api/v1/auth/login          → 302 redirect to Discord OAuth
/api/v1/auth/callback       → 換 token、寫 cookie、redirect
/api/v1/auth/logout         → 清 cookie
/api/v1/auth/me             → 當前 session 使用者

/api/v1/admin/economy/adjust         POST  調整 coin
/api/v1/admin/voting/proposals       GET / PATCH
/api/v1/admin/push/feeds             GET / PATCH  (steam/free-games/twitch/rss)
/api/v1/admin/shop/items             CRUD
/api/v1/admin/logs/transactions      GET (分頁、篩選)

/api/v1/me/profile                   GET
/api/v1/me/history                   GET
/api/v1/leaderboard/:type            GET (level | coin | message)
/api/v1/voting/proposals             GET
/api/v1/shop/items                   GET
```

### 4.2 安全
- JWT (httpOnly, Secure, SameSite=None) — 簽 `userId + scope + exp`
- 每支 admin API 都過 `requireAdmin(guildId)` middleware
- Rate limit：public 60/min、admin 200/min
- CSRF：使用 double-submit cookie 或交給 Next.js Server Actions
- 所有金錢操作寫稽核日誌到 `DashboardAuditLog`

---

## 5. 前端結構（Next.js App Router）

```
dashboard/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx                 # landing
│  │  └─ login/page.tsx
│  ├─ (member)/
│  │  ├─ me/page.tsx
│  │  ├─ leaderboard/[type]/page.tsx
│  │  ├─ voting/page.tsx
│  │  └─ shop/page.tsx
│  ├─ (admin)/
│  │  ├─ admin/layout.tsx         # 權限 guard
│  │  ├─ admin/economy/page.tsx
│  │  ├─ admin/voting/page.tsx
│  │  ├─ admin/push/page.tsx
│  │  ├─ admin/shop/page.tsx
│  │  └─ admin/logs/page.tsx
│  └─ api/auth/[...discord]/route.ts   # OAuth handler
├─ lib/
│  ├─ api.ts                      # fetch wrapper (帶 cookie)
│  ├─ auth.ts                     # session helpers
│  └─ permissions.ts
└─ components/ui/...               # shadcn
```

---

## 6. 開發里程碑

### W0 — 前置重構（3–5 天）
- [ ] MongoDB URI 抽 env、共用 db helper
- [ ] `docs/SCHEMA.md` 補 collection 文件
- [ ] httpServer 模組化 + CORS / helmet / rate-limit
- [ ] Next.js 專案 scaffold（獨立 repo 或 monorepo `dashboard/`）

### W1 — Auth 基礎建設
- [ ] Discord OAuth2 流程（login / callback / logout）
- [ ] JWT cookie + `requireAuth` / `requireAdmin` middleware
- [ ] `/api/v1/auth/me` + 前端 layout、登入按鈕、權限 guard

### W2–W3 — Admin 後台核心（**取代最痛的指令**）
- [ ] **經濟管理**：用 user 搜尋 → 調整 coin / 等級，自動寫 `CoinTransactions`
- [ ] **推播開關**：Steam / Free Games / Twitch / RSS 開關 + cron 預覽（取代 `.env` 旗標）
- [ ] **投票管理**：列表、改門檻、強制結算

### W4 — Admin 後台延伸
- [ ] **商店管理**：上下架、改價格、看銷售量
- [ ] **交易日誌**：CoinTransactions / ShopTransactions 查詢、匯出 CSV
- [ ] **稽核日誌頁**：誰在 dashboard 做了什麼

### W5 — 一般使用者 MVP
- [ ] `/me`：等級、coin、連勝、徽章、本月訊息/語音
- [ ] `/leaderboard`：等級、金幣、訊息榜
- [ ] `/voting`：進行中提案 + 得票進度
- [ ] `/history`：個人賭場 / coin 紀錄

### W6+ — 進階
- [ ] WebSocket realtime（Twitch 上線、樂透開獎）
- [ ] Recharts 趨勢圖
- [ ] 行動版 polish、深色模式、i18n

---

## 7. 風險與決策待辦

| 項目 | 風險 | 處理 |
|---|---|---|
| MongoDB 資料 schema 隱性 | API 跟 Bot 邏輯飄移 | W0 補 `SCHEMA.md`，PR 必更新 |
| 跨網域 cookie | OAuth 後 cookie 不帶 | `SameSite=None; Secure` + 預先測試 |
| 推播開關改成 DB 驅動 | 既有 cron 仍讀 `.env` | 第一版仍寫 env，Phase 2 改 `BotConfig` collection |
| 排行榜隱私 | 使用者不想曝光 | `UserSettings.public_profile` 開關，預設 opt-out |
| API 被惡意刷 | DB 壓力 | rate-limit + Mongo index 必檢查 |
| Bot 重啟 | API 短暫 503 | dashboard SSR fallback + 友善錯誤頁 |

---

## 8. 待你決定（之後再開工亦可）

1. **Dashboard 要不要支援多 guild**？（目前 Bot 主打單一伺服器，但程式上是支援多 guild 的）
2. **Owner 級操作要不要再加一層 2FA / 確認碼**？（例如手動加 1 萬 coin 那種）
3. **要不要曝光 Bot 的 cron 觸發紀錄頁**？（debug 推播很有用）
4. **Logo / 主色** — UI 上線前要定，可後補

---

_Last updated: 2026-05-08_
