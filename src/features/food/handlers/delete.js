require("colors");

const autocompleteBeverageStore = require("../../../utils/autocompleteBeverageStore");
const autocompleteFoodName = require("../../../utils/autocompleteFoodName");
const { CATEGORY_LABEL } = require("../../../constants/foodCategories");

async function autocomplete(client, interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "飲料店") {
    return autocompleteBeverageStore(client, interaction);
  }
  if (focused.name === "食物名稱") {
    return autocompleteFoodName(client, interaction);
  }
  return interaction.respond([]).catch(() => {});
}

async function run(client, interaction) {
  const { options } = interaction;
  const foodToDelete = options.getString("食物名稱")?.trim();
  const category = options.getString("類別");
  const beverageStore = options.getString("飲料店")?.trim() || null;

  const collection = client.collection;

  await interaction.deferReply();

  try {
    let deleteQuery = { name: foodToDelete };

    if (category) {
      deleteQuery.category = category;
    }

    if (category === "beverage" && beverageStore) {
      deleteQuery.beverageStore = beverageStore;
    }

    const matchingItems = await collection.find({ name: foodToDelete }).toArray();

    if (matchingItems.length > 1 && !category) {
      let msg = `找到多個「${foodToDelete}」選項，請指定類別：\n`;
      matchingItems.forEach((item) => {
        let itemDesc = `- ${CATEGORY_LABEL[item.category]}`;
        if (item.beverageStore) {
          itemDesc += `（${item.beverageStore}）`;
        }
        msg += itemDesc + "\n";
      });
      interaction.editReply(msg);
      return;
    }

    const deleteResult = await collection.deleteOne(deleteQuery);

    if (deleteResult.deletedCount === 1) {
      let msg = `已刪除食物選項：${foodToDelete}`;
      if (category) {
        msg += `（${CATEGORY_LABEL[category]}`;
        if (beverageStore) {
          msg += ` - ${beverageStore}`;
        }
        msg += "）";
      }
      interaction.editReply(msg);
      console.log(`Deleted food: ${foodToDelete}`.yellow);
    } else {
      let msg = `找不到要刪除的食物選項：${foodToDelete}`;
      if (category) {
        msg += `（${CATEGORY_LABEL[category]}`;
        if (beverageStore) {
          msg += ` - ${beverageStore}`;
        }
        msg += "）";
      }
      interaction.editReply(msg);
    }
  } catch (error) {
    interaction.editReply("🔧 刪除食物失敗，請呼叫舒舒！");
    console.log(
      `[ERROR] An error occurred inside the delete food:\n${error}`.red
    );
  }
}

module.exports = { run, autocomplete };
