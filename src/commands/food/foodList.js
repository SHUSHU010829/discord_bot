require("colors");

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
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
const ITEMS_PER_PAGE = 50; // 每頁顯示的項目數（單一類別）
const PAGINATION_TIMEOUT = 300000; // 5 分鐘

/**
 * 將陣列分頁
 */
function paginateArray(array, itemsPerPage) {
  const pages = [];
  for (let i = 0; i < array.length; i += itemsPerPage) {
    pages.push(array.slice(i, i + itemsPerPage));
  }
  return pages;
}

/**
 * 創建分頁按鈕
 */
function createPaginationButtons(currentPage, totalPages) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("first")
      .setLabel("⏮️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("page_info")
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1),
    new ButtonBuilder()
      .setCustomId("last")
      .setLabel("⏭️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );

  return row;
}

/**
 * 為單一類別創建分頁內容
 */
function createCategoryPages(category, foodList) {
  const pages = [];

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

    // 將店家分頁（每頁最多顯示幾家店）
    const storeEntries = Object.entries(beveragesByStore);
    let currentPage = "";
    let currentPageLength = 0;
    const headerLength = `**${CATEGORY_DISPLAY[category]}** 選項：\n\n`.length;

    for (const [store, items] of storeEntries) {
      const storeText = `**${store}**：${items.join(", ")}\n`;

      // 如果加上這個店家會超過限制，先保存當前頁面
      if (currentPageLength + storeText.length + headerLength > MAX_MESSAGE_LENGTH - 100) {
        if (currentPage) {
          pages.push(`**${CATEGORY_DISPLAY[category]}** 選項：\n\n${currentPage}`);
          currentPage = "";
          currentPageLength = 0;
        }
      }

      currentPage += storeText;
      currentPageLength += storeText.length;
    }

    // 添加最後一頁
    if (currentPage) {
      pages.push(`**${CATEGORY_DISPLAY[category]}** 選項：\n\n${currentPage}`);
    }
  } else {
    // 一般食物分頁
    const itemPages = paginateArray(foodList, ITEMS_PER_PAGE);
    itemPages.forEach((pageItems) => {
      const itemNames = pageItems.map((food) => food.name).join(", ");
      pages.push(`**${CATEGORY_DISPLAY[category]}** 選項：\n\n${itemNames}`);
    });
  }

  return pages.length > 0 ? pages : [`**${CATEGORY_DISPLAY[category]}** 選項：\n\n（無資料）`];
}

/**
 * 為所有類別創建分頁 Embed
 */
function createAllCategoriesPages(categorizedFood) {
  const pages = [];
  const categories = ["breakfast", "lunch", "dinner", "snack", "beverage", "uncategorized"];

  // 每個類別單獨檢查，如果太長就分頁
  let currentEmbed = new EmbedBuilder()
    .setTitle("📚 食物清單")
    .setColor(0x00ae86);

  let currentEmbedSize = 0;
  let hasFields = false;

  for (const cat of categories) {
    const foods = categorizedFood[cat];
    if (!foods || foods.length === 0) continue;

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

    // 如果單個 field 太長，截斷並提示使用類別篩選
    if (fieldValue.length > MAX_FIELD_LENGTH) {
      const suffix = `\n... 等 ${foods.length} 項\n💡 使用 /有什麼能吃 選擇「${CATEGORY_DISPLAY[cat] || cat}」查看完整清單`;
      fieldValue = fieldValue.substring(0, MAX_FIELD_LENGTH - suffix.length) + suffix;
    }

    const fieldName = cat === "uncategorized"
      ? "⚠️ 未分類（舊資料）"
      : (CATEGORY_DISPLAY[cat] || cat);

    // 檢查添加這個 field 會不會讓整個 embed 太大（粗略估計）
    const estimatedFieldSize = fieldName.length + fieldValue.length;

    if (currentEmbedSize + estimatedFieldSize > 5000 && hasFields) {
      // 當前 embed 太大，保存並創建新的
      pages.push(currentEmbed);
      currentEmbed = new EmbedBuilder()
        .setTitle("📚 食物清單")
        .setColor(0x00ae86);
      currentEmbedSize = 0;
      hasFields = false;
    }

    currentEmbed.addFields({
      name: fieldName,
      value: fieldValue || "無",
      inline: false,
    });

    currentEmbedSize += estimatedFieldSize;
    hasFields = true;
  }

  // 添加最後一個 embed
  if (hasFields) {
    // 如果有未分類的資料，在最後一頁添加提示
    if (categorizedFood.uncategorized && categorizedFood.uncategorized.length > 0) {
      currentEmbed.setFooter({
        text: `發現 ${categorizedFood.uncategorized.length} 筆未分類的舊資料，請執行遷移腳本：node scripts/migrateFoodData.js`,
      });
    }
    pages.push(currentEmbed);
  }

  return pages.length > 0 ? pages : [
    new EmbedBuilder()
      .setTitle("📚 食物清單")
      .setColor(0x00ae86)
      .setDescription("目前沒有可供選擇的食物選項。")
  ];
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

      if (foodList.length === 0) {
        if (category) {
          interaction.editReply(
            `目前沒有${CATEGORY_DISPLAY[category]}選項。`
          );
        } else {
          interaction.editReply("目前沒有可供選擇的食物選項。");
        }
        return;
      }

      if (category) {
        // === 單一類別顯示（帶分頁） ===
        const pages = createCategoryPages(category, foodList);

        if (pages.length === 1) {
          // 只有一頁，直接顯示
          await interaction.editReply(pages[0]);
        } else {
          // 多頁，顯示分頁按鈕
          let currentPage = 0;

          const message = await interaction.editReply({
            content: pages[currentPage],
            components: [createPaginationButtons(currentPage, pages.length)],
          });

          // 創建按鈕收集器
          const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: PAGINATION_TIMEOUT,
          });

          collector.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
              return btnInteraction.reply({
                content: "這不是你的清單！請使用 /有什麼能吃 查看你自己的清單。",
                ephemeral: true,
              });
            }

            switch (btnInteraction.customId) {
              case "first":
                currentPage = 0;
                break;
              case "prev":
                currentPage = Math.max(0, currentPage - 1);
                break;
              case "next":
                currentPage = Math.min(pages.length - 1, currentPage + 1);
                break;
              case "last":
                currentPage = pages.length - 1;
                break;
            }

            await btnInteraction.update({
              content: pages[currentPage],
              components: [createPaginationButtons(currentPage, pages.length)],
            });
          });

          collector.on("end", () => {
            // 時間到後移除按鈕
            interaction.editReply({
              content: pages[currentPage],
              components: [],
            }).catch(() => {});
          });
        }
      } else {
        // === 顯示所有類別（帶分頁） ===
        const categorizedFood = {
          breakfast: [],
          lunch: [],
          dinner: [],
          snack: [],
          beverage: [],
          uncategorized: [],
        };

        foodList.forEach((food) => {
          if (food.category && categorizedFood[food.category]) {
            categorizedFood[food.category].push(food);
          } else if (!food.category) {
            categorizedFood.uncategorized.push(food);
          }
        });

        const pages = createAllCategoriesPages(categorizedFood);

        if (pages.length === 1) {
          // 只有一頁，直接顯示
          await interaction.editReply({ content: "", embeds: [pages[0]] });
        } else {
          // 多頁，顯示分頁按鈕
          let currentPage = 0;

          const message = await interaction.editReply({
            content: "",
            embeds: [pages[currentPage]],
            components: [createPaginationButtons(currentPage, pages.length)],
          });

          const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: PAGINATION_TIMEOUT,
          });

          collector.on("collect", async (btnInteraction) => {
            if (btnInteraction.user.id !== interaction.user.id) {
              return btnInteraction.reply({
                content: "這不是你的清單！請使用 /有什麼能吃 查看你自己的清單。",
                ephemeral: true,
              });
            }

            switch (btnInteraction.customId) {
              case "first":
                currentPage = 0;
                break;
              case "prev":
                currentPage = Math.max(0, currentPage - 1);
                break;
              case "next":
                currentPage = Math.min(pages.length - 1, currentPage + 1);
                break;
              case "last":
                currentPage = pages.length - 1;
                break;
            }

            await btnInteraction.update({
              embeds: [pages[currentPage]],
              components: [createPaginationButtons(currentPage, pages.length)],
            });
          });

          collector.on("end", () => {
            // 時間到後移除按鈕
            interaction.editReply({
              embeds: [pages[currentPage]],
              components: [],
            }).catch(() => {});
          });
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
