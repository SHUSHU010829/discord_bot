require("colors");
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { casino } = require("../src/config");

/**
 * 修復 Jackpot Pool seed bug：
 * 早期版本的 contribute() 在第一次 upsert 時沒有 $setOnInsert amount: seed，
 * 導致 pool 從 0 開始累積，而不是從 seedAmount (5000) 起跳。
 *
 * 此腳本針對 amount < seed 的 pool，把 amount 加上 seed 補回，
 * 完整保留已累積的貢獻金額。
 *
 * 用法：
 *   node scripts/fixJackpotPoolSeed.js          # dry run，只顯示要修哪些
 *   node scripts/fixJackpotPoolSeed.js migrate  # 實際執行修復
 */

async function main() {
  const shouldMigrate = process.argv.includes("migrate");
  const cfg = casino?.slot?.jackpotPool || {};
  const seed = cfg.seedAmount ?? 5000;

  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();
    console.log("[SUCCESS] Connected to MongoDB!".green);

    const database = mongoClient.db("MorningBot");
    const collection = database.collection("JackpotPool");

    const broken = await collection
      .find({ game: "slot", amount: { $lt: seed } })
      .toArray();

    if (broken.length === 0) {
      console.log(
        `\n[INFO] 所有 pool 的 amount 都 >= seed (${seed})，無需修復。`.green
      );
      return;
    }

    console.log(
      `\n[INFO] 找到 ${broken.length} 筆 amount < seed (${seed}) 的 pool：`.yellow
    );
    console.log("─".repeat(72));
    broken.forEach((doc, i) => {
      const before = doc.amount || 0;
      const after = before + seed;
      console.log(
        `${i + 1}. guildId=${doc.guildId}  amount: ${before} → ${after}  (totalContributed=${doc.totalContributed ?? "n/a"})`
          .white
      );
    });
    console.log("─".repeat(72));

    if (!shouldMigrate) {
      console.log("\n[INFO] 這是 dry run，沒有實際變更。".cyan);
      console.log(
        "[提示] 確認沒問題後，執行：node scripts/fixJackpotPoolSeed.js migrate".cyan
      );
      return;
    }

    console.log("\n[WARNING] 5 秒後開始修復，按 Ctrl+C 取消...".yellow);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let fixed = 0;
    for (const doc of broken) {
      const result = await collection.updateOne(
        { _id: doc._id, amount: doc.amount },
        {
          $inc: { amount: seed },
          $set: {
            seed,
            seedFixedAt: new Date(),
            seedFixedFromAmount: doc.amount || 0,
          },
        }
      );
      if (result.modifiedCount === 1) {
        fixed++;
        console.log(
          `[✓] guildId=${doc.guildId}  ${doc.amount} → ${doc.amount + seed}`
            .green
        );
      } else {
        console.log(
          `[!] guildId=${doc.guildId} 未更新（amount 已被別處改動，跳過）`.yellow
        );
      }
    }

    console.log("\n" + "=".repeat(72));
    console.log(`[SUCCESS] 修復完成，共處理 ${fixed} / ${broken.length} 筆`.green);
    console.log("=".repeat(72));
  } catch (error) {
    console.log(`[ERROR] 修復失敗：\n${error}`.red);
    process.exit(1);
  } finally {
    await mongoClient.close();
    console.log("\n[INFO] MongoDB 連線已關閉".cyan);
  }
}

main();
