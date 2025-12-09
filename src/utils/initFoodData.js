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
  { name: "蛋餅加蛋", category: "breakfast" },
  { name: "起司蛋餅", category: "breakfast" },
  { name: "玉米蛋餅", category: "breakfast" },
  { name: "培根蛋餅", category: "breakfast" },
  { name: "三明治", category: "breakfast" },
  { name: "火腿蛋三明治", category: "breakfast" },
  { name: "鮪魚三明治", category: "breakfast" },
  { name: "總匯三明治", category: "breakfast" },
  { name: "漢堡", category: "breakfast" },
  { name: "豬肉漢堡", category: "breakfast" },
  { name: "雞肉漢堡", category: "breakfast" },
  { name: "飯糰", category: "breakfast" },
  { name: "鮪魚飯糰", category: "breakfast" },
  { name: "肉鬆飯糰", category: "breakfast" },
  { name: "包子", category: "breakfast" },
  { name: "肉包", category: "breakfast" },
  { name: "菜包", category: "breakfast" },
  { name: "饅頭", category: "breakfast" },
  { name: "燒餅油條", category: "breakfast" },
  { name: "蔥抓餅", category: "breakfast" },
  { name: "蔥油餅", category: "breakfast" },
  { name: "手抓餅", category: "breakfast" },
  { name: "吐司", category: "breakfast" },
  { name: "厚片吐司", category: "breakfast" },
  { name: "法國吐司", category: "breakfast" },
  { name: "鐵板麵", category: "breakfast" },
  { name: "蘿蔔糕", category: "breakfast" },
  { name: "粥", category: "breakfast" },
  { name: "皮蛋瘦肉粥", category: "breakfast" },
  { name: "鹹粥", category: "breakfast" },
  { name: "豆漿", category: "breakfast" },
  { name: "米漿", category: "breakfast" },
  { name: "蛋糕", category: "breakfast" },
  { name: "麵包", category: "breakfast" },
  { name: "可頌", category: "breakfast" },
  { name: "貝果", category: "breakfast" },
  { name: "鬆餅", category: "breakfast" },
  { name: "煎餃", category: "breakfast" },
  { name: "我", category: "breakfast" },
  { name: "藥", category: "breakfast" },

  // === 午餐 ===
  { name: "便當", category: "lunch" },
  { name: "雞腿便當", category: "lunch" },
  { name: "排骨便當", category: "lunch" },
  { name: "魚便當", category: "lunch" },
  { name: "滷肉飯", category: "lunch" },
  { name: "雞腿飯", category: "lunch" },
  { name: "排骨飯", category: "lunch" },
  { name: "爌肉飯", category: "lunch" },
  { name: "焢肉飯", category: "lunch" },
  { name: "控肉飯", category: "lunch" },
  { name: "牛肉麵", category: "lunch" },
  { name: "紅燒牛肉麵", category: "lunch" },
  { name: "清燉牛肉麵", category: "lunch" },
  { name: "番茄牛肉麵", category: "lunch" },
  { name: "拉麵", category: "lunch" },
  { name: "豚骨拉麵", category: "lunch" },
  { name: "味噌拉麵", category: "lunch" },
  { name: "叉燒拉麵", category: "lunch" },
  { name: "義大利麵", category: "lunch" },
  { name: "番茄義大利麵", category: "lunch" },
  { name: "奶油義大利麵", category: "lunch" },
  { name: "青醬義大利麵", category: "lunch" },
  { name: "炒飯", category: "lunch" },
  { name: "蛋炒飯", category: "lunch" },
  { name: "海鮮炒飯", category: "lunch" },
  { name: "泰式炒飯", category: "lunch" },
  { name: "炒麵", category: "lunch" },
  { name: "炒烏龍麵", category: "lunch" },
  { name: "炒米粉", category: "lunch" },
  { name: "水餃", category: "lunch" },
  { name: "鍋貼", category: "lunch" },
  { name: "小籠包", category: "lunch" },
  { name: "壽司", category: "lunch" },
  { name: "握壽司", category: "lunch" },
  { name: "花壽司", category: "lunch" },
  { name: "丼飯", category: "lunch" },
  { name: "親子丼", category: "lunch" },
  { name: "牛丼", category: "lunch" },
  { name: "豬排丼", category: "lunch" },
  { name: "天丼", category: "lunch" },
  { name: "咖哩飯", category: "lunch" },
  { name: "咖哩雞飯", category: "lunch" },
  { name: "咖哩豬排飯", category: "lunch" },
  { name: "燴飯", category: "lunch" },
  { name: "麵線", category: "lunch" },
  { name: "大腸麵線", category: "lunch" },
  { name: "蚵仔麵線", category: "lunch" },
  { name: "米粉湯", category: "lunch" },
  { name: "米粉", category: "lunch" },
  { name: "板條", category: "lunch" },
  { name: "粄條", category: "lunch" },
  { name: "河粉", category: "lunch" },
  { name: "越南河粉", category: "lunch" },
  { name: "越南法國麵包", category: "lunch" },
  { name: "羊肉爐", category: "lunch" },
  { name: "薑母鴨", category: "lunch" },
  { name: "火鍋", category: "lunch" },
  { name: "麻辣鍋", category: "lunch" },
  { name: "涮涮鍋", category: "lunch" },
  { name: "石頭火鍋", category: "lunch" },
  { name: "韓式料理", category: "lunch" },
  { name: "韓式烤肉", category: "lunch" },
  { name: "石鍋拌飯", category: "lunch" },
  { name: "部隊鍋", category: "lunch" },
  { name: "泰式料理", category: "lunch" },
  { name: "打拋豬", category: "lunch" },
  { name: "綠咖哩", category: "lunch" },
  { name: "月亮蝦餅", category: "lunch" },
  { name: "披薩", category: "lunch" },
  { name: "夏威夷披薩", category: "lunch" },
  { name: "海鮮披薩", category: "lunch" },
  { name: "義式披薩", category: "lunch" },
  { name: "漢堡", category: "lunch" },
  { name: "牛肉堡", category: "lunch" },
  { name: "雞肉堡", category: "lunch" },
  { name: "潛艇堡", category: "lunch" },
  { name: "三明治", category: "lunch" },
  { name: "麥當勞", category: "lunch" },
  { name: "肯德基", category: "lunch" },
  { name: "摩斯漢堡", category: "lunch" },
  { name: "Subway", category: "lunch" },
  { name: "我", category: "lunch" },
  { name: "藥", category: "lunch" },

  // === 晚餐 ===
  { name: "便當", category: "dinner" },
  { name: "雞腿便當", category: "dinner" },
  { name: "排骨便當", category: "dinner" },
  { name: "魚便當", category: "dinner" },
  { name: "滷肉飯", category: "dinner" },
  { name: "雞腿飯", category: "dinner" },
  { name: "排骨飯", category: "dinner" },
  { name: "爌肉飯", category: "dinner" },
  { name: "牛肉麵", category: "dinner" },
  { name: "紅燒牛肉麵", category: "dinner" },
  { name: "清燉牛肉麵", category: "dinner" },
  { name: "拉麵", category: "dinner" },
  { name: "豚骨拉麵", category: "dinner" },
  { name: "味噌拉麵", category: "dinner" },
  { name: "義大利麵", category: "dinner" },
  { name: "番茄義大利麵", category: "dinner" },
  { name: "奶油義大利麵", category: "dinner" },
  { name: "炒飯", category: "dinner" },
  { name: "蛋炒飯", category: "dinner" },
  { name: "海鮮炒飯", category: "dinner" },
  { name: "炒麵", category: "dinner" },
  { name: "炒米粉", category: "dinner" },
  { name: "水餃", category: "dinner" },
  { name: "鍋貼", category: "dinner" },
  { name: "壽司", category: "dinner" },
  { name: "丼飯", category: "dinner" },
  { name: "親子丼", category: "dinner" },
  { name: "牛丼", category: "dinner" },
  { name: "豬排丼", category: "dinner" },
  { name: "咖哩飯", category: "dinner" },
  { name: "咖哩雞飯", category: "dinner" },
  { name: "咖哩豬排飯", category: "dinner" },
  { name: "燴飯", category: "dinner" },
  { name: "麵線", category: "dinner" },
  { name: "大腸麵線", category: "dinner" },
  { name: "火鍋", category: "dinner" },
  { name: "麻辣鍋", category: "dinner" },
  { name: "涮涮鍋", category: "dinner" },
  { name: "石頭火鍋", category: "dinner" },
  { name: "壽喜燒", category: "dinner" },
  { name: "韓式料理", category: "dinner" },
  { name: "韓式烤肉", category: "dinner" },
  { name: "石鍋拌飯", category: "dinner" },
  { name: "部隊鍋", category: "dinner" },
  { name: "泰式料理", category: "dinner" },
  { name: "打拋豬", category: "dinner" },
  { name: "綠咖哩", category: "dinner" },
  { name: "越南河粉", category: "dinner" },
  { name: "越南法國麵包", category: "dinner" },
  { name: "披薩", category: "dinner" },
  { name: "夏威夷披薩", category: "dinner" },
  { name: "海鮮披薩", category: "dinner" },
  { name: "燒烤", category: "dinner" },
  { name: "燒肉", category: "dinner" },
  { name: "烤肉", category: "dinner" },
  { name: "熱炒", category: "dinner" },
  { name: "快炒", category: "dinner" },
  { name: "牛排", category: "dinner" },
  { name: "菲力牛排", category: "dinner" },
  { name: "沙朗牛排", category: "dinner" },
  { name: "肋眼牛排", category: "dinner" },
  { name: "豬排", category: "dinner" },
  { name: "雞排", category: "dinner" },
  { name: "炸雞", category: "dinner" },
  { name: "漢堡", category: "dinner" },
  { name: "麥當勞", category: "dinner" },
  { name: "肯德基", category: "dinner" },
  { name: "摩斯漢堡", category: "dinner" },
  { name: "羊肉爐", category: "dinner" },
  { name: "薑母鴨", category: "dinner" },
  { name: "我", category: "dinner" },
  { name: "藥", category: "dinner" },

  // === 宵夜 ===
  { name: "雞排", category: "snack" },
  { name: "豪大雞排", category: "snack" },
  { name: "炸雞", category: "snack" },
  { name: "鹹酥雞", category: "snack" },
  { name: "雞米花", category: "snack" },
  { name: "雞塊", category: "snack" },
  { name: "炸薯條", category: "snack" },
  { name: "地瓜球", category: "snack" },
  { name: "QQ球", category: "snack" },
  { name: "炸魷魚", category: "snack" },
  { name: "炸花枝", category: "snack" },
  { name: "滷味", category: "snack" },
  { name: "麻辣燙", category: "snack" },
  { name: "泡麵", category: "snack" },
  { name: "韓式泡麵", category: "snack" },
  { name: "炸物", category: "snack" },
  { name: "炸豆腐", category: "snack" },
  { name: "炸杏鮑菇", category: "snack" },
  { name: "燒烤", category: "snack" },
  { name: "烤肉串", category: "snack" },
  { name: "烤香腸", category: "snack" },
  { name: "烤玉米", category: "snack" },
  { name: "烤魷魚", category: "snack" },
  { name: "熱炒", category: "snack" },
  { name: "快炒", category: "snack" },
  { name: "麵線", category: "snack" },
  { name: "大腸麵線", category: "snack" },
  { name: "蚵仔麵線", category: "snack" },
  { name: "肉粽", category: "snack" },
  { name: "粽子", category: "snack" },
  { name: "臭豆腐", category: "snack" },
  { name: "炸臭豆腐", category: "snack" },
  { name: "蚵仔煎", category: "snack" },
  { name: "蛋煎", category: "snack" },
  { name: "大腸包小腸", category: "snack" },
  { name: "米血糕", category: "snack" },
  { name: "豬血糕", category: "snack" },
  { name: "烤魚", category: "snack" },
  { name: "鹽酥雞", category: "snack" },
  { name: "炸銀絲卷", category: "snack" },
  { name: "春捲", category: "snack" },
  { name: "潤餅", category: "snack" },
  { name: "蔥油餅", category: "snack" },
  { name: "車輪餅", category: "snack" },
  { name: "紅豆餅", category: "snack" },
  { name: "蔥抓餅", category: "snack" },
  { name: "鹽水雞", category: "snack" },
  { name: "涼麵", category: "snack" },
  { name: "涼拌小黃瓜", category: "snack" },
  { name: "滷蛋", category: "snack" },
  { name: "茶葉蛋", category: "snack" },
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
