require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("有什麼能吃")
    .setDescription("查看現在食物列表... 📚"),

  run: async (client, interaction) => {
     const collection = client.collection;
     await interaction.reply({
       content: "查看現在食物列表... 📚",
       fetchReply: true,
     });

      try {
        const foodList = await collection.find({}).toArray();
        if (foodList.length > 0) {
          interaction.editReply(
            `目前有這些食物選項：${foodList
              .map((food) => food.name)
              .join(", ")}`
          );
        } else {
          interaction.editReply("目前沒有可供選擇的食物選項。");
        }
      } catch (error) {
        interaction.editReply("🔧 獲取食物清單失敗，請呼叫舒舒！");
        console.log(
          `[ERROR] An error occurred inside the food list:\n${error}`.red
        );
      }
  },
};
