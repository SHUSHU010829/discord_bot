require("colors");

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const autocompleteBeverageStore = require("../../utils/autocompleteBeverageStore");
const autocompleteFoodName = require("../../utils/autocompleteFoodName");
const {
  CATEGORY_LABEL,
  CATEGORY_CHOICES,
} = require("../../constants/foodCategories");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete-food")
    .setDescription("[ADMIN] Delete an existing food entry (admin only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("食物名稱")
        .setDescription(
          "Name of the food to delete (use 有什麼能吃 to look up names)"
        )
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("Pick a food category (specify when the name is ambiguous)")
        .addChoices(...CATEGORY_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("Beverage store name (required only when category is beverage)")
        .setAutocomplete(true)
    ),

  autocomplete: async (client, interaction) => {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "飲料店") {
      return autocompleteBeverageStore(client, interaction);
    }
    if (focused.name === "食物名稱") {
      return autocompleteFoodName(client, interaction);
    }
    return interaction.respond([]).catch(() => {});
  },

  run: async (client, interaction) => {
    const { options } = interaction;
    const foodToDelete = options.getString("食物名稱")?.trim();
    const category = options.getString("類別");
    const beverageStore = options.getString("飲料店")?.trim() || null;

    const collection = client.collection;

    await interaction.deferReply();

    try {
      // 構建刪除查詢
      let deleteQuery = { name: foodToDelete };

      if (category) {
        deleteQuery.category = category;
      }

      if (category === "beverage" && beverageStore) {
        deleteQuery.beverageStore = beverageStore;
      }

      // 先查詢是否有多個匹配項
      const matchingItems = await collection.find({ name: foodToDelete }).toArray();

      if (matchingItems.length > 1 && !category) {
        // 有多個同名項目但沒有指定類別
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

      // 刪除匹配的食物項目
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
  },
};
