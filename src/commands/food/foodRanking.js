require("colors");

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require("discord.js");

const {
  CATEGORY_DISPLAY,
  CATEGORY_CHOICES,
} = require("../../constants/foodCategories");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("食物排行")
    .setDescription("查看最受歡迎的食物排行榜 🏆")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("選擇要查看的食物類別（不選則顯示總排行）")
        .addChoices(...CATEGORY_CHOICES)
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

    await interaction.deferReply();

    try {
      const query = { drawCount: { $gt: 0 } };
      if (category) query.category = category;

      const topFoods = await collection
        .find(query)
        .sort({ drawCount: -1 })
        .limit(limit)
        .toArray();

      if (topFoods.length === 0) {
        const msg = category
          ? `目前還沒有 ${CATEGORY_DISPLAY[category]} 被抽選的記錄。\n快使用 \`/吃什麼\` 來抽選吧！`
          : "目前還沒有食物被抽選的記錄。\n快使用 `/吃什麼` 來抽選吧！";
        await interaction.editReply(msg);
        return;
      }

      const totalDraws = topFoods.reduce(
        (sum, f) => sum + (f.drawCount || 0),
        0
      );
      const medals = ["🥇", "🥈", "🥉"];

      // 將前三名與其他分成兩段，視覺上有層次
      const renderRow = (food, index) => {
        const rank = index + 1;
        const medal = medals[index] || `**${rank}.**`;
        const drawCount = food.drawCount || 0;
        const percentage = ((drawCount / totalDraws) * 100).toFixed(1);
        let foodDisplay =
          food.category === "beverage" && food.beverageStore
            ? `${food.beverageStore} - ${food.name}`
            : food.name;
        let categoryTag = "";
        if (!category && food.category) {
          const icon = (CATEGORY_DISPLAY[food.category] || "").split(" ")[0];
          if (icon) categoryTag = ` ${icon}`;
        }
        return `${medal} **${foodDisplay}**${categoryTag}\n　└ ${drawCount} 次（${percentage}%）`;
      };

      const top3 = topFoods.slice(0, 3).map(renderRow).join("\n\n");
      const rest = topFoods.slice(3).map(renderRow).join("\n");

      const titleText = category
        ? `# 🏆 ${CATEGORY_DISPLAY[category]} 熱門排行榜 Top ${topFoods.length}`
        : `# 🏆 食物熱門排行榜 Top ${topFoods.length}`;

      const container = new ContainerBuilder()
        .setAccentColor(0xffd700)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleText))
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large),
        );

      if (top3) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(top3),
        );
      }

      if (rest) {
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(rest));
      }

      // 統計腳註
      let footerText = `-# 共抽選了 **${totalDraws}** 次`;
      if (category) {
        const categoryTotal = await collection.countDocuments({ category });
        footerText += ` ・ 此分類共 **${categoryTotal}** 項食物`;
      }
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footerText));

      await interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      await interaction.editReply("🔧 獲取排行榜失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the food ranking:\n${error}`.red
      );
    }
  },
};
