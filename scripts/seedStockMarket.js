require("colors");
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { stockSystem, serverId } = require("../src/config");

/**
 * 種入逼逼股市的初始股票池。
 *
 * 用法：
 *   node scripts/seedStockMarket.js                  # dry run，列出計畫
 *   node scripts/seedStockMarket.js seed             # 執行 seed（僅補上缺少的，不覆蓋）
 *   node scripts/seedStockMarket.js seed --force     # 強制覆蓋現有 currentPrice/openPrice 回到初始值
 *   node scripts/seedStockMarket.js seed --guild=<guildId>  # 指定 guildId（預設讀 config.serverId）
 */

async function main() {
  const args = process.argv.slice(2);
  const shouldSeed = args.includes("seed");
  const force = args.includes("--force");
  const guildArg = args.find((a) => a.startsWith("--guild="));
  const guildId = guildArg ? guildArg.split("=")[1] : serverId;

  if (!guildId) {
    console.log(`[SEED] 找不到 guildId（請傳 --guild=... 或在 config.server.json 設 serverId）`.red);
    process.exit(1);
  }

  const pool = stockSystem?.pool || [];
  if (pool.length === 0) {
    console.log(`[SEED] config.stocks.json 的 stockSystem.pool 是空的，無法 seed`.red);
    process.exit(1);
  }

  if (!process.env.MONGO_PASSWORD) {
    console.log(`[SEED] MONGO_PASSWORD env 未設`.red);
    process.exit(1);
  }
  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();
    const db = mongoClient.db("MorningBot");
    const stockMarket = db.collection("StockMarket");
    const stockPrices = db.collection("StockPrices");

    console.log(`[SEED] guildId=${guildId}, mode=${shouldSeed ? (force ? "seed+force" : "seed") : "dry-run"}`.cyan);
    console.log(`[SEED] 股票池共 ${pool.length} 支：${pool.map((s) => s.symbol).join(", ")}`.cyan);

    const now = new Date();
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const s of pool) {
      const existing = await stockMarket.findOne({ guildId, symbol: s.symbol });
      const baseDoc = {
        guildId,
        symbol: s.symbol,
        name: s.name,
        sigma: s.sigma,
        floor: s.floor,
        type: s.type,
        marketSentiment: stockSystem.defaultMarketSentiment || "sideways",
        maxSharesPerUser: stockSystem.maxSharesPerUser ?? 500,
        enabled: true,
        updatedAt: now,
      };
      if (!existing) {
        if (!shouldSeed) {
          console.log(`  + 將新增 ${s.symbol} ${s.name} @ ${s.initialPrice}`.green);
          continue;
        }
        await stockMarket.insertOne({
          ...baseDoc,
          currentPrice: s.initialPrice,
          openPrice: s.initialPrice,
          createdAt: now,
        });
        await stockPrices.insertOne({
          guildId,
          symbol: s.symbol,
          price: s.initialPrice,
          timestamp: now,
          source: "seed",
        });
        added += 1;
        console.log(`  ✓ 已新增 ${s.symbol} ${s.name} @ ${s.initialPrice}`.green);
      } else if (force) {
        if (!shouldSeed) {
          console.log(`  ~ 將重設 ${s.symbol} → ${s.initialPrice}`.yellow);
          continue;
        }
        await stockMarket.updateOne(
          { _id: existing._id },
          {
            $set: {
              ...baseDoc,
              currentPrice: s.initialPrice,
              openPrice: s.initialPrice,
            },
          }
        );
        await stockPrices.insertOne({
          guildId,
          symbol: s.symbol,
          price: s.initialPrice,
          timestamp: now,
          source: "seed",
        });
        updated += 1;
        console.log(`  ✓ 已重設 ${s.symbol} → ${s.initialPrice}`.yellow);
      } else {
        // 已存在且非 force → 只補上缺少的靜態欄位（sigma/floor/name），不動價格
        await stockMarket.updateOne(
          { _id: existing._id },
          { $set: { ...baseDoc } }
        );
        skipped += 1;
        console.log(`  · 已存在 ${s.symbol}（價格保留：${existing.currentPrice}）`.gray);
      }
    }

    console.log(`[SEED] 完成：新增 ${added}、覆蓋 ${updated}、保留 ${skipped}`.cyan);
  } catch (e) {
    console.log(`[SEED] 失敗：${e?.stack || e}`.red);
    process.exit(1);
  } finally {
    await mongoClient.close();
  }
}

main();
