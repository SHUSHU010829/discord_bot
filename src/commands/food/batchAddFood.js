require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const autocompleteBeverageStore = require("../../utils/autocompleteBeverageStore");
const {
  CATEGORY_LABEL,
  CATEGORY_CHOICES,
} = require("../../constants/foodCategories");

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
        .addChoices(...CATEGORY_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("飲料店名稱（僅在類別為飲料時需要填寫）")
        .setAutocomplete(true)
    ),

  autocomplete: autocompleteBeverageStore,

  run: async (client, interaction) => {
    const { options } = interaction;
    const foodListStr = options.getString("食物清單");
    const category = options.getString("類別");
    const beverageStore = options.getString("飲料店")?.trim() || null;

    const collection = client.collection;

    await interaction.reply({
      content: "批次處理中... 🌭",
      fetchReply: true,
    });

    try {
      // 分割食物清單、去空白、去重複
      const foodNames = [
        ...new Set(
          foodListStr
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name.length > 0)
        ),
      ];

      if (foodNames.length === 0) {
        interaction.editReply("❌ 沒有有效的食物名稱！");
        return;
      }

      // 一次查出已存在的項目
      const existingQuery = { name: { $in: foodNames }, category };
      if (category === "beverage" && beverageStore) {
        existingQuery.beverageStore = beverageStore;
      }
      const existingDocs = await collection
        .find(existingQuery, { projection: { name: 1 } })
        .toArray();
      const existingNames = new Set(existingDocs.map((doc) => doc.name));

      const skippedItems = [...existingNames];
      const toInsert = foodNames
        .filter((name) => !existingNames.has(name))
        .map((name) => {
          const doc = { name, category, drawCount: 0 };
          if (category === "beverage" && beverageStore) {
            doc.beverageStore = beverageStore;
          }
          return doc;
        });

      let addedCount = 0;
      if (toInsert.length > 0) {
        try {
          const result = await collection.insertMany(toInsert, {
            ordered: false,
          });
          addedCount = result.insertedCount ?? toInsert.length;
        } catch (insertError) {
          // 競態：可能少數項目因 unique index 衝突，剩下仍會插入
          addedCount = insertError.result?.insertedCount ?? 0;
          const failedNames = (insertError.writeErrors || [])
            .map((e) => e.err?.op?.name)
            .filter(Boolean);
          skippedItems.push(...failedNames);
        }
      }
      const skippedCount = skippedItems.length;

      // 構建回覆訊息
      let replyMsg = `✅ 批次新增完成！\n\n`;
      replyMsg += `**${CATEGORY_LABEL[category]}**`;
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
