require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const { commandEmojis, commandMessages } = require("../../config.json");

// 類別映射
const CATEGORY_MAP = {
  早餐: "breakfast",
  午餐: "lunch",
  晚餐: "dinner",
  宵夜: "snack",
  飲料: "beverage",
};

const CATEGORY_DISPLAY = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "宵夜",
  beverage: "飲料",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃什麼")
    .setDescription("食物選擇器!讓逼逼機器人幫你決定吃什麼... 🎰")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇食物類別（不選則隨機所有類別）")
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
        .setDescription("選擇飲料店（僅在類別為飲料時有效）")
    ),

  run: async (client, interaction) => {
    const collection = client.collection;
    const category = interaction.options.getString("類別");
    const beverageStore = interaction.options.getString("飲料店");

    await interaction.reply({
      content: commandMessages.drawingLot,
      fetchReply: true,
    });

    try {
      // 構建查詢條件
      let query = {};

      if (category) {
        query.category = category;

        // 如果是飲料且指定了飲料店
        if (category === "beverage" && beverageStore) {
          query.beverageStore = beverageStore;
        }
      }

      const foodList = await collection.find(query).toArray();

      if (foodList.length > 0) {
        const randomFood = foodList[Math.floor(Math.random() * foodList.length)];

        // 更新抽選次數（drawCount +1）
        await collection.updateOne(
          { _id: randomFood._id },
          { $inc: { drawCount: 1 } }
        );

        let replyMessage = `逼逼機器人推薦你可以`;

        if (category) {
          replyMessage += `${CATEGORY_DISPLAY[category]}吃... `;
        } else {
          replyMessage += `吃... `;
        }

        // 如果是飲料且有店名，顯示店名
        if (randomFood.category === "beverage" && randomFood.beverageStore) {
          replyMessage += `**${randomFood.beverageStore}** 的 **${randomFood.name}**！ ${commandEmojis.hiiiiii}`;
        } else {
          replyMessage += `**${randomFood.name}**！ ${commandEmojis.hiiiiii}`;
        }

        interaction.editReply(replyMessage);
      } else {
        let noFoodMsg = "目前沒有可供選擇的";
        if (category) {
          noFoodMsg += `${CATEGORY_DISPLAY[category]}`;
        }
        if (beverageStore) {
          noFoodMsg += `（${beverageStore}）`;
        }
        noFoodMsg += "選項。";
        interaction.editReply(noFoodMsg);
      }
    } catch (error) {
      interaction.editReply(commandMessages.getFoodError);
      console.log(
        `[ERROR] An error occurred inside the draw lot:\n${error}`.red
      );
    }
  },
};
