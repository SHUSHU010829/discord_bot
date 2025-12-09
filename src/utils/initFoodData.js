require("colors");

/**
 * 初始化食物資料庫
 * 這個腳本會：
 * 1. 清空現有食物資料（可選）
 * 2. 插入預設的食物選項
 * 3. 包含各種分類的食物和趣味選項
 */

const initialFoodData = [
  // === 早餐 ===
  { name: "蛋餅", category: "breakfast" },
  { name: "三明治", category: "breakfast" },
  { name: "漢堡", category: "breakfast" },
  { name: "飯糰", category: "breakfast" },
  { name: "包子", category: "breakfast" },
  { name: "饅頭", category: "breakfast" },
  { name: "燒餅油條", category: "breakfast" },
  { name: "蔥抓餅", category: "breakfast" },
  { name: "蛋餅加蛋", category: "breakfast" },
  { name: "吐司", category: "breakfast" },
  { name: "鐵板麵", category: "breakfast" },
  { name: "蘿蔔糕", category: "breakfast" },
  { name: "粥", category: "breakfast" },
  { name: "我", category: "breakfast" },
  { name: "藥", category: "breakfast" },

  // === 午餐 ===
  { name: "便當", category: "lunch" },
  { name: "滷肉飯", category: "lunch" },
  { name: "雞腿飯", category: "lunch" },
  { name: "排骨飯", category: "lunch" },
  { name: "牛肉麵", category: "lunch" },
  { name: "拉麵", category: "lunch" },
  { name: "義大利麵", category: "lunch" },
  { name: "炒飯", category: "lunch" },
  { name: "炒麵", category: "lunch" },
  { name: "水餃", category: "lunch" },
  { name: "鍋貼", category: "lunch" },
  { name: "壽司", category: "lunch" },
  { name: "丼飯", category: "lunch" },
  { name: "咖哩飯", category: "lunch" },
  { name: "燴飯", category: "lunch" },
  { name: "麵線", category: "lunch" },
  { name: "米粉湯", category: "lunch" },
  { name: "羊肉爐", category: "lunch" },
  { name: "火鍋", category: "lunch" },
  { name: "韓式料理", category: "lunch" },
  { name: "泰式料理", category: "lunch" },
  { name: "越南河粉", category: "lunch" },
  { name: "披薩", category: "lunch" },
  { name: "我", category: "lunch" },
  { name: "藥", category: "lunch" },

  // === 晚餐 ===
  { name: "便當", category: "dinner" },
  { name: "滷肉飯", category: "dinner" },
  { name: "雞腿飯", category: "dinner" },
  { name: "排骨飯", category: "dinner" },
  { name: "牛肉麵", category: "dinner" },
  { name: "拉麵", category: "dinner" },
  { name: "義大利麵", category: "dinner" },
  { name: "炒飯", category: "dinner" },
  { name: "炒麵", category: "dinner" },
  { name: "水餃", category: "dinner" },
  { name: "鍋貼", category: "dinner" },
  { name: "壽司", category: "dinner" },
  { name: "丼飯", category: "dinner" },
  { name: "咖哩飯", category: "dinner" },
  { name: "燴飯", category: "dinner" },
  { name: "火鍋", category: "dinner" },
  { name: "韓式料理", category: "dinner" },
  { name: "泰式料理", category: "dinner" },
  { name: "越南河粉", category: "dinner" },
  { name: "披薩", category: "dinner" },
  { name: "燒烤", category: "dinner" },
  { name: "熱炒", category: "dinner" },
  { name: "牛排", category: "dinner" },
  { name: "我", category: "dinner" },
  { name: "藥", category: "dinner" },

  // === 宵夜 ===
  { name: "雞排", category: "snack" },
  { name: "鹹酥雞", category: "snack" },
  { name: "滷味", category: "snack" },
  { name: "麻辣燙", category: "snack" },
  { name: "泡麵", category: "snack" },
  { name: "炸物", category: "snack" },
  { name: "燒烤", category: "snack" },
  { name: "熱炒", category: "snack" },
  { name: "麵線", category: "snack" },
  { name: "肉粽", category: "snack" },
  { name: "臭豆腐", category: "snack" },
  { name: "蚵仔煎", category: "snack" },
  { name: "大腸包小腸", category: "snack" },
  { name: "烤玉米", category: "snack" },
  { name: "地瓜球", category: "snack" },
  { name: "我", category: "snack" },
  { name: "藥", category: "snack" },

  // === 飲料 - 可不可紅茶 ===
  { name: "熟成紅茶", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "熟成冷露", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "熟成綠茶", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "雪花冰茶", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "白玉歐蕾", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "胭脂紅茶", category: "beverage", beverageStore: "可不可紅茶" },
  { name: "寶格麗紅茶", category: "beverage", beverageStore: "可不可紅茶" },

  // === 飲料 - 清心福全 ===
  { name: "珍珠奶茶", category: "beverage", beverageStore: "清心福全" },
  { name: "檸檬綠茶", category: "beverage", beverageStore: "清心福全" },
  { name: "百香雙響炮", category: "beverage", beverageStore: "清心福全" },
  { name: "冬瓜檸檬", category: "beverage", beverageStore: "清心福全" },
  { name: "養樂多綠茶", category: "beverage", beverageStore: "清心福全" },
  { name: "蜂蜜檸檬蘆薈", category: "beverage", beverageStore: "清心福全" },

  // === 飲料 - 50嵐 ===
  { name: "波霸奶茶", category: "beverage", beverageStore: "50嵐" },
  { name: "珍珠奶茶", category: "beverage", beverageStore: "50嵐" },
  { name: "四季春茶", category: "beverage", beverageStore: "50嵐" },
  { name: "茉莉綠茶", category: "beverage", beverageStore: "50嵐" },
  { name: "檸檬綠茶", category: "beverage", beverageStore: "50嵐" },
  { name: "養樂多綠茶", category: "beverage", beverageStore: "50嵐" },
  { name: "布丁奶茶", category: "beverage", beverageStore: "50嵐" },

  // === 飲料 - 迷客夏 ===
  { name: "珍珠鮮奶茶", category: "beverage", beverageStore: "迷客夏" },
  { name: "烏龍鮮奶茶", category: "beverage", beverageStore: "迷客夏" },
  { name: "紅茶鮮奶", category: "beverage", beverageStore: "迷客夏" },
  { name: "金萱鮮奶茶", category: "beverage", beverageStore: "迷客夏" },
  { name: "大甲芋頭鮮奶", category: "beverage", beverageStore: "迷客夏" },
  { name: "珍珠可可鮮奶", category: "beverage", beverageStore: "迷客夏" },

  // === 飲料 - CoCo都可 ===
  { name: "珍珠奶茶", category: "beverage", beverageStore: "CoCo都可" },
  { name: "雙響炮", category: "beverage", beverageStore: "CoCo都可" },
  { name: "百香果綠茶", category: "beverage", beverageStore: "CoCo都可" },
  { name: "三兄弟", category: "beverage", beverageStore: "CoCo都可" },
  { name: "檸檬霸", category: "beverage", beverageStore: "CoCo都可" },
  { name: "芝芝奶蓋", category: "beverage", beverageStore: "CoCo都可" },

  // === 飲料 - 一芳水果茶 ===
  { name: "水果茶", category: "beverage", beverageStore: "一芳水果茶" },
  { name: "芒果綠茶", category: "beverage", beverageStore: "一芳水果茶" },
  { name: "檸檬紅茶", category: "beverage", beverageStore: "一芳水果茶" },
  { name: "葡萄柚綠茶", category: "beverage", beverageStore: "一芳水果茶" },
  { name: "百香果茉莉綠茶", category: "beverage", beverageStore: "一芳水果茶" },

  // === 飲料 - 趣味選項 ===
  { name: "我", category: "beverage", beverageStore: "其他" },
  { name: "藥", category: "beverage", beverageStore: "其他" },
  { name: "白開水", category: "beverage", beverageStore: "其他" },
];

async function initializeFoodData(collection, clearExisting = false) {
  try {
    console.log("[INFO] Starting food data initialization...".cyan);

    // 清空現有資料（可選）
    if (clearExisting) {
      const deleteResult = await collection.deleteMany({});
      console.log(
        `[INFO] Cleared ${deleteResult.deletedCount} existing food items`.yellow
      );
    }

    // 為每個食物項目添加 drawCount: 0
    const foodDataWithCount = initialFoodData.map((food) => ({
      ...food,
      drawCount: 0,
    }));

    // 插入新資料
    const insertResult = await collection.insertMany(foodDataWithCount);
    console.log(
      `[SUCCESS] Inserted ${insertResult.insertedCount} food items!`.green
    );

    // 顯示統計資訊
    const stats = {
      breakfast: await collection.countDocuments({ category: "breakfast" }),
      lunch: await collection.countDocuments({ category: "lunch" }),
      dinner: await collection.countDocuments({ category: "dinner" }),
      snack: await collection.countDocuments({ category: "snack" }),
      beverage: await collection.countDocuments({ category: "beverage" }),
    };

    console.log("\n[STATS] Food items by category:".cyan);
    console.log(`  🌅 早餐: ${stats.breakfast} items`.white);
    console.log(`  🌞 午餐: ${stats.lunch} items`.white);
    console.log(`  🌙 晚餐: ${stats.dinner} items`.white);
    console.log(`  🌃 宵夜: ${stats.snack} items`.white);
    console.log(`  🥤 飲料: ${stats.beverage} items`.white);

    // 顯示飲料店統計
    const beverageStores = await collection.distinct("beverageStore", {
      category: "beverage",
    });
    console.log(`\n[STATS] Beverage stores: ${beverageStores.length}`.cyan);
    for (const store of beverageStores) {
      const count = await collection.countDocuments({
        category: "beverage",
        beverageStore: store,
      });
      console.log(`  ${store}: ${count} items`.white);
    }

    console.log("\n[SUCCESS] Food data initialization completed!".green);
    return true;
  } catch (error) {
    console.log(
      `[ERROR] Failed to initialize food data:\n${error}`.red
    );
    return false;
  }
}

module.exports = { initializeFoodData, initialFoodData };
