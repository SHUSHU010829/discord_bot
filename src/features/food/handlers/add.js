require("colors");

const autocompleteBeverageStore = require("../../../utils/autocompleteBeverageStore");
const { CATEGORY_LABEL } = require("../../../constants/foodCategories");

async function run(client, interaction) {
  const { options } = interaction;
  const newFood = options.getString("食物名稱")?.trim();
  const category = options.getString("類別");
  const beverageStore = options.getString("飲料店")?.trim() || null;

  const collection = client.collection;

  if (!newFood) {
    await interaction.reply({
      content: "❌ 食物名稱不能為空白！",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const foodData = {
      name: newFood,
      category: category,
      drawCount: 0,
    };

    if (category === "beverage" && beverageStore) {
      foodData.beverageStore = beverageStore;
    }

    let checkQuery = { name: newFood, category: category };
    if (category === "beverage" && beverageStore) {
      checkQuery.beverageStore = beverageStore;
    }

    const existingFood = await collection.findOne(checkQuery);
    if (existingFood) {
      let msg = `這項已經在${CATEGORY_LABEL[category]}清單內了：${newFood}`;
      if (beverageStore) {
        msg += `（${beverageStore}）`;
      }
      interaction.editReply(msg);
    } else {
      await collection.insertOne(foodData);
      let msg = `已新增${CATEGORY_LABEL[category]}選項：${newFood}`;
      if (beverageStore) {
        msg += `（${beverageStore}）`;
      }
      interaction.editReply(msg);
    }
  } catch (error) {
    if (error?.code === 11000) {
      let msg = `這項已經在${CATEGORY_LABEL[category]}清單內了：${newFood}`;
      if (beverageStore) {
        msg += `（${beverageStore}）`;
      }
      interaction.editReply(msg);
      return;
    }
    interaction.editReply("新增食物失敗，是不是太難吃了 :(");
    console.log(
      `[ERROR] An error occurred inside the increase food:\n${error}`.red
    );
  }
}

module.exports = { run, autocomplete: autocompleteBeverageStore };
