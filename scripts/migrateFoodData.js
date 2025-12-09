require("colors");
require("dotenv").config();

const { MongoClient } = require("mongodb");

/**
 * 遷移舊食物資料，為沒有 category 的資料添加分類
 *
 * 執行方式：
 *   node scripts/migrateFoodData.js          # 查看需要遷移的資料
 *   node scripts/migrateFoodData.js migrate  # 執行遷移
 */

const CATEGORY_DISPLAY = {
  breakfast: "🌅 早餐",
  lunch: "🌞 午餐",
  dinner: "🌙 晚餐",
  snack: "🌃 宵夜",
  beverage: "🥤 飲料",
};

async function main() {
  const shouldMigrate = process.argv.includes("migrate");

  const uri = `mongodb+srv://SHUSHU:${process.env.MONGO_PASSWORD}@morningbot.ar55cbn.mongodb.net/?retryWrites=true&w=majority`;
  const mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();
    console.log("[SUCCESS] Connected to MongoDB!".green);

    const database = mongoClient.db("MorningBot");
    const collection = database.collection("FoodList");

    // 查詢沒有 category 的資料
    const oldFoods = await collection
      .find({
        $or: [{ category: { $exists: false } }, { category: null }],
      })
      .toArray();

    if (oldFoods.length === 0) {
      console.log("\n[INFO] 太棒了！所有食物都已經有分類了！".green);
      console.log("[INFO] 不需要進行遷移。".green);
      return;
    }

    console.log(`\n[INFO] 找到 ${oldFoods.length} 筆沒有分類的舊資料：`.yellow);
    console.log("─".repeat(60));

    oldFoods.forEach((food, index) => {
      console.log(`${index + 1}. ${food.name}`.white);
    });
    console.log("─".repeat(60));

    if (!shouldMigrate) {
      console.log("\n[INFO] 這些資料需要遷移！".cyan);
      console.log("\n[提示] 遷移選項：".cyan);
      console.log("1️⃣  自動遷移 - 使用 'node scripts/migrateFoodData.js migrate'".white);
      console.log("2️⃣  手動處理 - 使用 Discord 指令逐一新增".white);
      console.log("3️⃣  刪除舊資料 - 使用初始化腳本重建資料庫".white);
      console.log("\n[警告] 自動遷移會將所有舊資料預設分類為「午餐」".yellow);
      console.log("[建議] 如果資料不多，建議手動處理或重新初始化".yellow);
      return;
    }

    // 執行遷移
    console.log("\n[WARNING] 準備執行遷移...".yellow);
    console.log("[INFO] 所有舊資料將被設定為：".cyan);
    console.log("  • 類別：午餐 (lunch)".white);
    console.log("  • 抽選次數：0 (drawCount)".white);
    console.log("\n[WARNING] 5 秒後開始遷移，按 Ctrl+C 取消...".yellow);
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let migratedCount = 0;

    for (const food of oldFoods) {
      await collection.updateOne(
        { _id: food._id },
        {
          $set: {
            category: "lunch", // 預設設為午餐
            drawCount: food.drawCount || 0, // 如果沒有 drawCount 也補上
          },
        }
      );
      migratedCount++;
      console.log(`[✓] 已遷移：${food.name}`.green);
    }

    console.log("\n" + "=".repeat(60));
    console.log(`[SUCCESS] 遷移完成！共處理 ${migratedCount} 筆資料`.green);
    console.log("=".repeat(60));

    // 顯示遷移後的統計
    console.log("\n[統計] 遷移後的分類分布：".cyan);
    for (const [category, displayName] of Object.entries(CATEGORY_DISPLAY)) {
      const count = await collection.countDocuments({ category });
      console.log(`  ${displayName}：${count} 項`.white);
    }

    // 檢查是否還有未分類的資料
    const remainingOldFoods = await collection
      .find({
        $or: [{ category: { $exists: false } }, { category: null }],
      })
      .toArray();

    if (remainingOldFoods.length === 0) {
      console.log("\n[SUCCESS] 所有資料都已成功遷移！".green);
    } else {
      console.log(
        `\n[WARNING] 還有 ${remainingOldFoods.length} 筆資料未遷移`.yellow
      );
    }
  } catch (error) {
    console.log(`[ERROR] 遷移失敗：\n${error}`.red);
    process.exit(1);
  } finally {
    await mongoClient.close();
    console.log("\n[INFO] MongoDB 連線已關閉".cyan);
  }
}

main();
