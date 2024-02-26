require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("刪除食物")
    .setDescription("刪除現有食物")
    .addStringOption((option) =>
      option
        .setName("食物名稱")
        .setDescription(
          "刪除食物的名稱(不知道食物名稱可以用「有什麼能吃」查看)"
        )
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const foodToDelete = options.getString("食物名稱");

    const collection = client.collection;

    await interaction.reply({
      content: "處理中... 🗑️",
      fetchReply: true,
    });

    try {
      // Define the deletion query
      const deleteQuery = { name: foodToDelete };
      // Delete the matching food item from MongoDB
      const deleteResult = await collection.deleteOne(deleteQuery);
      if (deleteResult.deletedCount === 1) {
        interaction.editReply(`已刪除食物選項：${foodToDelete}`);
        console.log(`Deleted food: ${foodToDelete}`.yellow);
      } else {
        interaction.editReply(`找不到要刪除的食物選項：${foodToDelete}`);
      }
    } catch (error) {
      interaction.editReply("🔧 刪除食物失敗，請呼叫舒舒！");
      console.log(
        `[ERROR] An error occurred inside the delete food:\n${error}`.red
      );
    }
  },
};
