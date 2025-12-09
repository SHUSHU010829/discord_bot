require("colors");
require("dotenv").config();

const { MongoClient } = require("mongodb");
const { initializeFoodData } = require("../src/utils/initFoodData");

/**
 * 執行食物資料初始化腳本
 * 使用方式：
 *   node scripts/runInitFoodData.js        # 保留現有資料，僅新增
 *   node scripts/runInitFoodData.js clear  # 清空現有資料後重新初始化
 */

async function main() {
  const clearExisting = process.argv.includes("clear");

  if (clearExisting) {
    console.log("[WARNING] Will clear existing food data!".yellow);
    console.log("[WARNING] Press Ctrl+C within 5 seconds to cancel...".yellow);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();
    console.log("[SUCCESS] Connected to MongoDB!".green);

    const database = mongoClient.db("MorningBot");
    const collection = database.collection("FoodList");

    await initializeFoodData(collection, clearExisting);
  } catch (error) {
    console.log(`[ERROR] Failed to run initialization:\n${error}`.red);
    process.exit(1);
  } finally {
    await mongoClient.close();
    console.log("\n[INFO] MongoDB connection closed".cyan);
  }
}

main();
