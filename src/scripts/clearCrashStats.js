// 一次性：清掉 CoinTransactions 中 meta.game=crash 的 bet/payout 紀錄
// 用途：火箭調過 RTP 後想讓 /casino-stats 從零開始計算
//
// 使用：node ./src/scripts/clearCrashStats.js [--dry-run]
//   預設會實際刪除；加 --dry-run 只印筆數不刪。

require("dotenv").config();
require("colors");
const { MongoClient } = require("mongodb");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!process.env.MONGO_PASSWORD) {
    console.log("[ERROR] MONGO_PASSWORD 環境變數沒設".red);
    process.exit(1);
  }

  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const coll = client.db("MorningBot").collection("CoinTransactions");

    const filter = { "meta.game": "crash" };
    const count = await coll.countDocuments(filter);
    console.log(`[INFO] meta.game=crash 共 ${count} 筆`.cyan);

    if (count === 0) {
      console.log("[INFO] 沒東西要清，結束".green);
      return;
    }

    if (dryRun) {
      console.log("[DRY-RUN] 預覽結束，沒實際刪除".yellow);
      return;
    }

    const res = await coll.deleteMany(filter);
    console.log(`[DONE] 刪除 ${res.deletedCount} 筆`.green);
  } catch (err) {
    console.log(`[ERROR] ${err.message}`.red);
    console.log(err.stack);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
