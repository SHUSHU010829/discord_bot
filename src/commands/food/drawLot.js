require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃什麼")
    .setDescription("食物選擇器!讓逼逼機器人幫你決定吃什麼... 🎰"),

  run: async (client, interaction) => {
    const collection = client.collection;
    const msg = await interaction.reply({
      content: "抽籤中... 🎰",
      fetchReply: true,
    });
    try {
      const foodList = await collection.find({}).toArray();
      if (foodList.length > 0) {
        const randomFood =
          foodList[Math.floor(Math.random() * foodList.length)].name;
        interaction.editReply(
          `逼逼機器人推薦你可以吃... **${randomFood}**！ <:hiiiiii:1191449346777038858> `
        );
      } else {
        interaction.editReply("目前沒有可供選擇的食物選項。");
      }
    } catch (error) {
      interaction.editReply("🔧 獲取食物清單失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the draw lot:\n${error}`.red
      );
    }
  },
};
