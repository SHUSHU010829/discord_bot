require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const { commandEmojis, commandMessages } = require("../../config.json");
const autocompleteBeverageStore = require("../../utils/autocompleteBeverageStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("喝什麼")
    .setDescription("飲料選擇器！讓逼逼機器人幫你決定喝什麼... 🥤")
    .addStringOption((option) =>
      option
        .setName("飲料店")
        .setDescription("選擇飲料店（不選則隨機所有飲料店）")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  autocomplete: autocompleteBeverageStore,

  run: async (client, interaction) => {
    const collection = client.collection;
    const beverageStore = interaction.options.getString("飲料店");

    await interaction.reply({
      content: "抽選中... 🥤",
      fetchReply: true,
    });

    try {
      // 構建查詢條件 - 只查詢飲料
      let query = { category: "beverage" };

      // 如果指定了飲料店
      if (beverageStore) {
        query.beverageStore = beverageStore;
      }

      const beverageList = await collection.find(query).toArray();

      if (beverageList.length > 0) {
        const randomBeverage = beverageList[Math.floor(Math.random() * beverageList.length)];

        // 更新抽選次數（drawCount +1）
        await collection.updateOne(
          { _id: randomBeverage._id },
          { $inc: { drawCount: 1 } }
        );

        let replyMessage = `逼逼機器人推薦你可以喝... `;

        // 如果有店名，顯示店名
        if (randomBeverage.beverageStore) {
          replyMessage += `**${randomBeverage.beverageStore}** 的 **${randomBeverage.name}**！ ${commandEmojis.hiiiiii}`;
        } else {
          replyMessage += `**${randomBeverage.name}**！ ${commandEmojis.hiiiiii}`;
        }

        interaction.editReply(replyMessage);
      } else {
        let noBeverageMsg = "目前沒有可供選擇的飲料";
        if (beverageStore) {
          noBeverageMsg += `（${beverageStore}）`;
        }
        noBeverageMsg += "選項。";
        interaction.editReply(noBeverageMsg);
      }
    } catch (error) {
      interaction.editReply("🔧 獲取飲料清單失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the drink selector:\n${error}`.red
      );
    }
  },
};
