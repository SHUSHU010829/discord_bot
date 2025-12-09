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
    .setName("新增食物")
    .setDescription("擴增食物列表")
    .addStringOption((option) =>
      option
        .setName("食物名稱")
        .setDescription("新增食物的名稱")
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
    const newFood = options.getString("食物名稱");
    const category = options.getString("類別");
    const beverageStore = options.getString("飲料店");

    const collection = client.collection;

    await interaction.reply({
      content: "處理中... 🌭",
      fetchReply: true,
    });

    try {
      // 構建食物資料
      const foodData = {
        name: newFood,
        category: category,
        drawCount: 0, // 初始化抽選次數
      };

      // 如果是飲料且有填寫店名，加入店名
      if (category === "beverage" && beverageStore) {
        foodData.beverageStore = beverageStore;
      }

      // 檢查是否已存在（名稱 + 類別 + 店名的組合）
      let checkQuery = { name: newFood, category: category };
      if (category === "beverage" && beverageStore) {
        checkQuery.beverageStore = beverageStore;
      }

      const existingFood = await collection.findOne(checkQuery);
      if (existingFood) {
        let msg = `這項已經在${CATEGORY_DISPLAY[category]}清單內了：${newFood}`;
        if (beverageStore) {
          msg += `（${beverageStore}）`;
        }
        interaction.editReply(msg);
      } else {
        // 插入新食物
        await collection.insertOne(foodData);
        let msg = `已新增${CATEGORY_DISPLAY[category]}選項：${newFood}`;
        if (beverageStore) {
          msg += `（${beverageStore}）`;
        }
        interaction.editReply(msg);
      }
    } catch (error) {
      interaction.editReply("新增食物失敗，是不是太難吃了 :(");
      console.log(
        `[ERROR] An error occurred inside the increase food:\n${error}`.red
      );
    }
  },
};
