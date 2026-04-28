require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const { commandEmojis, commandMessages } = require("../../config.json");
const {
  CATEGORY_LABEL,
  CATEGORY_CHOICES,
} = require("../../constants/foodCategories");

// 抽食物不含飲料
const FOOD_CHOICES = CATEGORY_CHOICES.filter((c) => c.value !== "beverage");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃什麼")
    .setDescription("食物選擇器!讓逼逼機器人幫你決定吃什麼... 🎰")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇食物類別（不選則隨機所有類別）")
        .addChoices(...FOOD_CHOICES)
    ),

  run: async (client, interaction) => {
    const collection = client.collection;
    const category = interaction.options.getString("類別");

    await interaction.reply({
      content: commandMessages.drawingLot,
      fetchReply: true,
    });

    try {
      // 構建查詢條件 - 排除飲料
      let query = {};

      if (category) {
        query.category = category;
      } else {
        // 沒有指定類別時，排除飲料
        query.category = { $ne: "beverage" };
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
          replyMessage += `${CATEGORY_LABEL[category]}吃... `;
        } else {
          replyMessage += `吃... `;
        }

        replyMessage += `**${randomFood.name}**！ ${commandEmojis.hiiiiii}`;

        interaction.editReply(replyMessage);
      } else {
        let noFoodMsg = "目前沒有可供選擇的";
        if (category) {
          noFoodMsg += `${CATEGORY_LABEL[category]}`;
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
