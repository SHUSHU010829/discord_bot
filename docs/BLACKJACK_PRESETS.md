# Blackjack Rule Presets

目前 21 點規則皆 **硬編碼於 `src/features/casino/blackjack/engine.js` 與 `deck.js`**，
切換 preset 需要直接改原始碼。本檔記錄已知的規則組合，方便來回切換。

---

## Preset A：目前線上規則（單副牌 / S17）— *截至 2026-05-08*

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

## Preset B：一般賭場 RTP（6 副牌 / H17）— *待套用*

| 項目 | 設定 |
|---|---|
| 副牌數 | **6 副** |
| 莊家 Soft 17 | **必須補牌（Hit on Soft 17, H17）** |
| Blackjack 賠率 | 3:2 |

**切換到此 preset 的最小修改：**
1. `engine.js:86` — `freshShuffledDeck(1)` → `freshShuffledDeck(6)`
   （需確認 `deck.js:freshShuffledDeck` 支援 N 副牌參數，目前固定 1 副）
2. `engine.js:231` — 莊家迴圈條件改為「硬 17 停、軟 17 補」：
   ```js
   if (ev.total > 17) break;
   if (ev.total === 17 && !ev.isSoft) break;
   ```
   （需要 `evaluateHand` 回傳 `isSoft`，目前須確認是否已有此欄位）
3. 規則註解 `engine.js:6` 同步更新為 H17。

> ⚠️ 過五關（Five-Card Charlie）非標準賭場規則，套用 Preset B 時請確認是否一併移除。
