require("colors");

const autocompleteBeverageStore = require("../../../utils/autocompleteBeverageStore");
const { CATEGORY_LABEL } = require("../../../constants/foodCategories");

async function run(client, interaction) {
  const { options } = interaction;
  const foodListStr = options.getString("食物清單");
  const category = options.getString("類別");
  const beverageStore = options.getString("飲料店")?.trim() || null;

  const collection = client.collection;

  await interaction.deferReply();

  try {
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
        addedCount = insertError.result?.insertedCount ?? 0;
        const failedNames = (insertError.writeErrors || [])
          .map((e) => e.err?.op?.name)
          .filter(Boolean);
        skippedItems.push(...failedNames);
      }
    }
    const skippedCount = skippedItems.length;

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
}

module.exports = { run, autocomplete: autocompleteBeverageStore };
