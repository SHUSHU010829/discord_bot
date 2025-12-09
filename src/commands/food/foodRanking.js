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
    .setName("食物排行")
    .setDescription("查看最受歡迎的食物排行榜 🏆")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇要查看的食物類別（不選則顯示總排行）")
        .addChoices(
          { name: "🌅 早餐", value: "breakfast" },
          { name: "🌞 午餐", value: "lunch" },
          { name: "🌙 晚餐", value: "dinner" },
          { name: "🌃 宵夜", value: "snack" },
          { name: "🥤 飲料", value: "beverage" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("數量")
        .setDescription("顯示前幾名（預設：10，最多：20）")
        .setMinValue(5)
        .setMaxValue(20)
    ),

  run: async (client, interaction) => {
    const collection = client.collection;
    const category = interaction.options.getString("類別");
    const limit = interaction.options.getInteger("數量") || 10;

    await interaction.reply({
      content: "統計排行榜中... 📊",
      fetchReply: true,
    });

    try {
      // 構建查詢條件
      let query = { drawCount: { $gt: 0 } }; // 只顯示被抽過的
      if (category) {
        query.category = category;
      }

      // 查詢並按 drawCount 降序排序
      const topFoods = await collection
        .find(query)
        .sort({ drawCount: -1 })
        .limit(limit)
        .toArray();

      if (topFoods.length > 0) {
        const embed = new EmbedBuilder()
          .setColor(0xffd700) // 金色
          .setTimestamp();

        if (category) {
          embed.setTitle(`🏆 ${CATEGORY_DISPLAY[category]} 熱門排行榜 Top ${limit}`);
        } else {
          embed.setTitle(`🏆 食物熱門排行榜 Top ${limit}`);
        }

        // 計算總抽選次數
        const totalDraws = topFoods.reduce(
          (sum, food) => sum + (food.drawCount || 0),
          0
        );

        // 構建排行榜
        let rankingText = "";
        const medals = ["🥇", "🥈", "🥉"];

        topFoods.forEach((food, index) => {
          const rank = index + 1;
          const medal = medals[index] || `**${rank}.**`;
          const drawCount = food.drawCount || 0;
          const percentage = ((drawCount / totalDraws) * 100).toFixed(1);

          let foodDisplay = food.name;

          // 如果是飲料且有店名，顯示店名
          if (food.category === "beverage" && food.beverageStore) {
            foodDisplay = `${food.beverageStore} - ${food.name}`;
          }

          // 添加分類標籤（僅在總排行時顯示）
          let categoryTag = "";
          if (!category && food.category) {
            const categoryIcon = CATEGORY_DISPLAY[food.category].split(" ")[0];
            categoryTag = ` ${categoryIcon}`;
          }

          rankingText += `${medal} **${foodDisplay}**${categoryTag}\n`;
          rankingText += `   └ ${drawCount} 次 (${percentage}%)\n\n`;
        });

        embed.setDescription(rankingText);

        // 添加統計資訊
        let footerText = `共抽選了 ${totalDraws} 次`;

        // 如果有查詢類別，顯示該類別的總數
        if (category) {
          const categoryTotal = await collection.countDocuments({
            category: category,
          });
          footerText += ` | 此分類共 ${categoryTotal} 項食物`;
        }

        embed.setFooter({ text: footerText });

        interaction.editReply({ content: "", embeds: [embed] });
      } else {
        let msg = "目前還沒有";
        if (category) {
          msg += `${CATEGORY_DISPLAY[category]}`;
        }
        msg += "被抽選的記錄。\n快使用 `/吃什麼` 來抽選吧！";
        interaction.editReply(msg);
      }
    } catch (error) {
      interaction.editReply("🔧 獲取排行榜失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the food ranking:\n${error}`.red
      );
    }
  },
};
