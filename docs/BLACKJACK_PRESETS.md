# Blackjack Rule Presets

目前 21 點規則皆 **硬編碼於 `src/features/casino/blackjack/engine.js` 與 `deck.js`**，
切換 preset 需要直接改原始碼。本檔記錄已知的規則組合，方便來回切換。

---

> **目前套用：Preset B（一般賭場 RTP）**。如需切回 Preset A 請依下方原始碼錨點還原。

## Preset A：早期規則（單副牌 / S17 / 含過五關）— *2026-05-08 前*

| 項目 | 設定 |
|---|---|
| 副牌數 | **1 副**（每局重洗） |
| 莊家 Soft 17 | **停牌（Stand on Soft 17, S17）** |
| Blackjack 賠率 | **3:2** |
| 一般勝賠率 | 1:1 |
| 平手 | 退本金（push） |
| 過五關（Five-Card Charlie） | **玩家** 持 5 張未爆 → 自動勝，賠率 **2:1** |
| 莊家過五關 | 莊家持 5 張未爆 → 莊家勝（玩家 BJ / 過五關優先） |
| 分牌（Split） | 起手同點數可分；最多 2 手（不可再分牌） |
| 分對 A | 各補 1 張即停，不可再要牌、不可加倍 |
| 分牌後 21 | 不算 BJ |
| 加倍（Double） | 起手兩張可加倍 |

**對應原始碼錨點：**
- `src/features/casino/blackjack/engine.js:6`（規則註解）
- `src/features/casino/blackjack/engine.js:86` → `freshShuffledDeck(1)`（1 副牌）
- `src/features/casino/blackjack/engine.js:231` → `if (ev.total >= 17) break;`（S17 停牌）
- `src/features/casino/blackjack/engine.js:261` → `Math.floor(hand.bet * 2.5)`（BJ 3:2）
- `src/features/casino/blackjack/engine.js:41-43` → 過五關門檻 5、賠率 2:1

**`src/config/casino.json` 內 blackjack 區塊：**
```json
"blackjack": {
  "enabled": true,
  "minBet": 10,
  "maxBet": 1000,
  "gameTtlSeconds": 300
}
```

---

## Preset B：一般賭場 RTP（6 副牌 / H17 / 無過五關）— *2026-05-08 起套用*

| 項目 | 設定 |
|---|---|
| 副牌數 | **6 副**（`DECK_COUNT` 常數，每局重洗） |
| 莊家 Soft 17 | **補牌（Hit on Soft 17, H17）** |
| 莊家硬 17 | 停 |
| Blackjack 賠率 | **3:2** |
| 一般勝賠率 | 1:1 |
| 平手 | 退本金 |
| 過五關（Five-Card Charlie） | **已移除** |
| 分牌（Split） | 起手同點數可分；最多 2 手 |
| 分對 A | 各補 1 張即停，不可加倍 |
| 分牌後 21 | 不算 BJ |
| 加倍（Double） | 起手兩張可加倍 |

**RTP 估算（基本策略，無投降、無 DAS、無再分牌、分對 A 只補 1 張）：**
- 莊家莊家邊際（house edge）約 **0.7%–0.8%** → **RTP ≈ 99.2%–99.3%**
- 本機 mimic-dealer 模擬（玩家跟莊家一樣 <17 必補）約 ~93% RTP，
  屬於對玩家最差打法的對照值。

**切回 Preset A 的還原步驟：**
1. `engine.js`：`DECK_COUNT = 6` → `1`
2. `engine.js` `playDealer`：條件改回 `if (ev.total >= 17) break;`（S17）
3. 重新加回 `FIVE_CARD_THRESHOLD` 常數與相關分支：
   - `hit` 內：補牌後若達 5 張未爆 → `done = true`
   - `playDealer`：莊家拿到 5 張即停止抽牌
   - `settleHand`：玩家 5 張未爆 → `result: 'fivecard'`、莊家 5 張 → `dealerfivecard`
   - `RESULT_RANK` 補上 `fivecard` / `dealerfivecard`
   - 匯出 `FIVE_CARD_THRESHOLD` / `FIVE_CARD_PAYOUT_MULTIPLIER`
4. `renderer.js` / `generateBlackjackCard.js`：
   恢復 `fivecard` / `dealerfivecard` 文案、徽章、五關提示。

> ⚠️ 還原時請一併把 git log 中本次 commit revert，比手動修改更穩。
