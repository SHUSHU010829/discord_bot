require("colors");

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

const CATEGORY_DISPLAY = {
  breakfast: "🌅 早餐",
  lunch: "🌞 午餐",
  dinner: "🌙 晚餐",
  snack: "🌃 宵夜",
  beverage: "🥤 飲料",
};

// Discord 限制常數
const MAX_FIELD_LENGTH = 1024; // Discord embed field value 最大長度
const MAX_MESSAGE_LENGTH = 2000; // Discord 訊息最大長度

/**
 * 截斷文字並添加省略提示
 */
function truncateText(text, maxLength, suffix = "") {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.substring(0, maxLength - suffix.length - 20);
  const lastComma = truncated.lastIndexOf(",");
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = Math.max(lastComma, lastNewline);

  if (cutPoint > 0) {
    return text.substring(0, cutPoint) + suffix;
  }
  return truncated + suffix;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("有什麼能吃")
    .setDescription("查看現在食物列表... 📚")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇要查看的食物類別（不選則顯示所有）")
        .addChoices(
          { name: "🌅 早餐", value: "breakfast" },
          { name: "🌞 午餐", value: "lunch" },
          { name: "🌙 晚餐", value: "dinner" },
          { name: "🌃 宵夜", value: "snack" },
          { name: "🥤 飲料", value: "beverage" }
        )
    ),

  run: async (client, interaction) => {
    const collection = client.collection;
    const category = interaction.options.getString("類別");

    await interaction.reply({
      content: "查看現在食物列表... 📚",
      fetchReply: true,
    });

    try {
      let query = {};
      if (category) {
        query.category = category;
      }

      const foodList = await collection.find(query).toArray();

      if (foodList.length > 0) {
        if (category) {
          // 顯示單一類別
          let replyMsg = `**${CATEGORY_DISPLAY[category]}** 選項：\n\n`;

          if (category === "beverage") {
            // 飲料按店家分組
            const beveragesByStore = {};
            foodList.forEach((food) => {
              const store = food.beverageStore || "其他";
              if (!beveragesByStore[store]) {
                beveragesByStore[store] = [];
              }
              beveragesByStore[store].push(food.name);
            });

            for (const [store, items] of Object.entries(beveragesByStore)) {
              replyMsg += `**${store}**：${items.join(", ")}\n`;
            }
          } else {
            // 一般食物直接列出
            replyMsg += foodList.map((food) => food.name).join(", ");
          }

          // 檢查訊息長度，超過限制則截斷
          if (replyMsg.length > MAX_MESSAGE_LENGTH) {
            const suffix = `\n\n⚠️ 清單過長，僅顯示部分內容（共 ${foodList.length} 項）`;
            replyMsg = truncateText(replyMsg, MAX_MESSAGE_LENGTH, suffix);
          }

          interaction.editReply(replyMsg);
        } else {
          // 顯示所有類別（使用 Embed）
          const embed = new EmbedBuilder()
            .setTitle("📚 食物清單")
            .setColor(0x00ae86);

          // 按類別分組
          const categorizedFood = {
            breakfast: [],
            lunch: [],
            dinner: [],
            snack: [],
            beverage: [],
            uncategorized: [], // 未分類（舊資料）
          };

          foodList.forEach((food) => {
            if (food.category && categorizedFood[food.category]) {
              categorizedFood[food.category].push(food);
            } else if (!food.category) {
              // 沒有 category 的舊資料
              categorizedFood.uncategorized.push(food);
            }
          });

          // 為每個類別添加欄位
          for (const [cat, foods] of Object.entries(categorizedFood)) {
            if (foods.length > 0) {
              let fieldValue = "";

              if (cat === "beverage") {
                // 飲料按店家分組
                const beveragesByStore = {};
                foods.forEach((food) => {
                  const store = food.beverageStore || "其他";
                  if (!beveragesByStore[store]) {
                    beveragesByStore[store] = [];
                  }
                  beveragesByStore[store].push(food.name);
                });

                for (const [store, items] of Object.entries(beveragesByStore)) {
                  fieldValue += `**${store}**：${items.join(", ")}\n`;
                }
              } else {
                fieldValue = foods.map((food) => food.name).join(", ");
              }

              // 檢查 field value 長度，超過 Discord 限制則截斷
              if (fieldValue.length > MAX_FIELD_LENGTH) {
                const suffix = `\n... 等 ${foods.length} 項（使用 /有什麼能吃 並選擇「${CATEGORY_DISPLAY[cat] || cat}」查看完整清單）`;
                fieldValue = truncateText(fieldValue, MAX_FIELD_LENGTH, suffix);
              }

              // 設定欄位名稱
              let fieldName = CATEGORY_DISPLAY[cat] || cat;
              if (cat === "uncategorized") {
                fieldName = "⚠️ 未分類（舊資料）";
              }

              embed.addFields({
                name: fieldName,
                value: fieldValue || "無",
                inline: false,
              });
            }
          }

          // 如果有未分類的資料，添加提示
          if (categorizedFood.uncategorized.length > 0) {
            embed.setFooter({
              text: `發現 ${categorizedFood.uncategorized.length} 筆未分類的舊資料，請執行遷移腳本：node scripts/migrateFoodData.js`,
            });
          }

          interaction.editReply({ content: "", embeds: [embed] });
        }
      } else {
        if (category) {
          interaction.editReply(
            `目前沒有${CATEGORY_DISPLAY[category]}選項。`
          );
        } else {
          interaction.editReply("目前沒有可供選擇的食物選項。");
        }
      }
    } catch (error) {
      interaction.editReply("🔧 獲取食物清單失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the food list:\n${error}`.red
      );
    }
  },
};
