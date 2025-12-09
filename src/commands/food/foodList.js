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
          };

          foodList.forEach((food) => {
            if (food.category && categorizedFood[food.category]) {
              categorizedFood[food.category].push(food);
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

              embed.addFields({
                name: CATEGORY_DISPLAY[cat],
                value: fieldValue || "無",
                inline: false,
              });
            }
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
