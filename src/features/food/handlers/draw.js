require("colors");

const { commandEmojis, commandMessages } = require("../../../config");
const { CATEGORY_LABEL } = require("../../../constants/foodCategories");

async function run(client, interaction) {
  const collection = client.collection;
  const category = interaction.options.getString("類別");

  await interaction.deferReply();

  try {
    let query = {};

    if (category) {
      query.category = category;
    } else {
      query.category = { $ne: "beverage" };
    }

    const foodList = await collection.find(query).toArray();

    if (foodList.length > 0) {
      const randomFood = foodList[Math.floor(Math.random() * foodList.length)];

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
}

module.exports = { run };
