require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const CATEGORY_DISPLAY = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "宵夜",
  beverage: "飲料",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("批次新增食物")
    .setDescription("一次新增多個食物（用逗號分隔）")
    .addStringOption((option) =>
      option
        .setName("食物清單")
        .setDescription("食物名稱，用逗號分隔（例如：蛋餅,三明治,漢堡）")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇食物類別")
        .setRequired(true)
        .addChoices(
          { name: "🌅 早餐", value: "breakfast" },
          { name: "🌞 午餐", value: "lunch" },
          { name: "🌙 晚餐", value: "dinner" },
          { name: "🌃 宵夜", value: "snack" },
          { name: "🥤 飲料", value: "beverage" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("飲料店名稱（僅在類別為飲料時需要填寫）")
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const foodListStr = options.getString("食物清單");
    const category = options.getString("類別");
    const beverageStore = options.getString("飲料店");

    const collection = client.collection;

    await interaction.reply({
      content: "批次處理中... 🌭",
      fetchReply: true,
    });

    try {
      // 分割食物清單並去除空白
      const foodNames = foodListStr
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      if (foodNames.length === 0) {
        interaction.editReply("❌ 沒有有效的食物名稱！");
        return;
      }

      let addedCount = 0;
      let skippedCount = 0;
      const skippedItems = [];

      // 逐一處理每個食物項目
      for (const foodName of foodNames) {
        // 構建食物資料
        const foodData = {
          name: foodName,
          category: category,
          drawCount: 0, // 初始化抽選次數
        };

        // 如果是飲料且有填寫店名，加入店名
        if (category === "beverage" && beverageStore) {
          foodData.beverageStore = beverageStore;
        }

        // 檢查是否已存在
        let checkQuery = { name: foodName, category: category };
        if (category === "beverage" && beverageStore) {
          checkQuery.beverageStore = beverageStore;
        }

        const existingFood = await collection.findOne(checkQuery);
        if (existingFood) {
          skippedCount++;
          skippedItems.push(foodName);
        } else {
          await collection.insertOne(foodData);
          addedCount++;
        }
      }

      // 構建回覆訊息
      let replyMsg = `✅ 批次新增完成！\n\n`;
      replyMsg += `**${CATEGORY_DISPLAY[category]}**`;
      if (beverageStore) {
        replyMsg += `（${beverageStore}）`;
      }
      replyMsg += `\n\n`;
      replyMsg += `✅ 成功新增：${addedCount} 項\n`;
      replyMsg += `⏭️ 已存在跳過：${skippedCount} 項\n`;

      if (skippedItems.length > 0 && skippedItems.length <= 10) {
        replyMsg += `\n跳過的項目：${skippedItems.join(", ")}`;
      }

      interaction.editReply(replyMsg);
    } catch (error) {
      interaction.editReply("批次新增食物失敗，請檢查格式是否正確 :(");
      console.log(
        `[ERROR] An error occurred inside the batch add food:\n${error}`.red
      );
    }
  },
};
