require("colors");

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");

const autocompleteBeverageStore = require("../../utils/autocompleteBeverageStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("匯入飲料店菜單")
    .setDescription("快速匯入整個飲料店的菜單（支援大量品項）🥤")
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("飲料店名稱（例如：可不可紅茶）")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("菜單")
        .setDescription("每行一個品項，或用逗號/分號分隔")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("覆蓋現有")
        .setDescription("是否刪除該店現有菜單後重新匯入（預設：否）")
    ),

  autocomplete: autocompleteBeverageStore,

  run: async (client, interaction) => {
    const { options } = interaction;
    const beverageStore = options.getString("飲料店")?.trim();
    const menuText = options.getString("菜單");
    const shouldOverwrite = options.getBoolean("覆蓋現有") || false;

    const collection = client.collection;

    await interaction.reply({
      content: "正在匯入菜單... 🥤",
      fetchReply: true,
    });

    try {
      if (!beverageStore) {
        interaction.editReply("❌ 飲料店名稱不能為空白！");
        return;
      }

      // 解析菜單文字
      // 支援多種分隔符：換行、逗號、分號
      let items = [];

      // 先按換行分割
      let lines = menuText.split(/\n+/);

      // 對每一行，再按逗號或分號分割
      lines.forEach((line) => {
        const lineItems = line
          .split(/[,;，；]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        items.push(...lineItems);
      });

      // 去除重複項目
      items = [...new Set(items)];

      if (items.length === 0) {
        interaction.editReply("❌ 沒有找到有效的品項！請檢查格式。");
        return;
      }

      // 如果選擇覆蓋，先刪除該店現有菜單
      if (shouldOverwrite) {
        const deleteResult = await collection.deleteMany({
          category: "beverage",
          beverageStore: beverageStore,
        });
        console.log(
          `[INFO] Deleted ${deleteResult.deletedCount} existing items from ${beverageStore}`.yellow
        );
      }

      // 一次查出已存在的品項（覆蓋模式時剛清空，這查詢會返回空陣列）
      const existingDocs = await collection
        .find(
          {
            name: { $in: items },
            category: "beverage",
            beverageStore: beverageStore,
          },
          { projection: { name: 1 } }
        )
        .toArray();
      const existingNames = new Set(existingDocs.map((doc) => doc.name));

      const skippedItems = [...existingNames];
      const toInsert = items
        .filter((name) => !existingNames.has(name))
        .map((name) => ({
          name,
          category: "beverage",
          beverageStore: beverageStore,
          drawCount: 0,
        }));

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

      // 構建詳細的回覆訊息
      const embed = new EmbedBuilder()
        .setTitle(`✅ ${beverageStore} 菜單匯入完成`)
        .setColor(0x00ae86)
        .setTimestamp();

      let description = "";
      if (shouldOverwrite) {
        description += `🗑️ 已清空現有菜單\n\n`;
      }

      description += `📊 **匯入統計**\n`;
      description += `✅ 成功新增：${addedCount} 項\n`;
      description += `⏭️ 已存在跳過：${skippedCount} 項\n`;
      description += `📝 總共處理：${items.length} 項\n`;

      embed.setDescription(description);

      // 顯示新增的品項（限制數量避免訊息過長）
      if (addedCount > 0) {
        const addedItems = items.filter(
          (item) => !skippedItems.includes(item)
        );
        const displayItems =
          addedItems.length > 20
            ? addedItems.slice(0, 20).join(", ") + ` ... 等 ${addedItems.length} 項`
            : addedItems.join(", ");

        embed.addFields({
          name: "新增的品項",
          value: displayItems,
          inline: false,
        });
      }

      // 如果有跳過的項目且數量不多，也顯示出來
      if (skippedCount > 0 && skippedCount <= 10) {
        embed.addFields({
          name: "已存在的品項",
          value: skippedItems.join(", "),
          inline: false,
        });
      }

      // 查詢該店現在的總品項數
      const totalItems = await collection.countDocuments({
        category: "beverage",
        beverageStore: beverageStore,
      });

      embed.setFooter({
        text: `${beverageStore} 目前共有 ${totalItems} 項飲品`,
      });

      interaction.editReply({ content: "", embeds: [embed] });

      console.log(
        `[SUCCESS] Imported ${addedCount} items for ${beverageStore}`.green
      );
    } catch (error) {
      interaction.editReply("❌ 匯入失敗，請檢查格式或呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside import beverage menu:\n${error}`.red
      );
    }
  },
};
