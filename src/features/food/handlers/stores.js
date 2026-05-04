require("colors");

const { EmbedBuilder } = require("discord.js");

async function run(client, interaction) {
  const collection = client.collection;

  await interaction.deferReply();

  try {
    const beverageStores = await collection.distinct("beverageStore", {
      category: "beverage",
    });

    if (beverageStores.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle("🥤 飲料店清單")
        .setDescription("使用 `/food drink` 指令時可以選擇以下飲料店：")
        .setColor(0x00ae86);

      let storeList = "";
      for (const store of beverageStores) {
        const count = await collection.countDocuments({
          category: "beverage",
          beverageStore: store,
        });
        storeList += `**${store}** - ${count} 項飲品\n`;
      }

      embed.addFields({
        name: `共 ${beverageStores.length} 家飲料店`,
        value: storeList,
        inline: false,
      });

      embed.setFooter({
        text: "使用「/food drink」指令，在飲料店選項中輸入店名即可看到下拉選單",
      });

      interaction.editReply({ content: "", embeds: [embed] });
    } else {
      interaction.editReply("目前沒有任何飲料店資料。");
    }
  } catch (error) {
    interaction.editReply("🔧 獲取飲料店清單失敗，請呼叫舒舒！");
    console.log(
      `[ERROR] An error occurred inside the beverage stores:\n${error}`.red
    );
  }
}

module.exports = { run };
