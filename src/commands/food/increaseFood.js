require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("新增食物")
    .setDescription("擴增食物列表（項目中加入逗號為多項）")
    .addStringOption((option) =>
      option
        .setName("食物名稱")
        .setDescription("新增食物的名稱")
        .setRequired(true)
    ),

  run: async (client, interaction) => {
    const { options } = interaction;
    const newFood = options.getString("食物名稱");

    const collection = client.collection;

    await interaction.reply({
      content: "處理中... 🌭",
      fetchReply: true,
    });

     try {
       // Check if the food item already exists in the database
       const existingFood = await collection.findOne({ name: newFood });
       if (existingFood) {
         interaction.editReply(`這項已經在食物清單內了：${newFood}`);
       } else {
         // Insert the new food item into MongoDB
         await collection.insertOne({ name: newFood });
         interaction.editReply(`已新增食物選項：${newFood}`);
       }
     } catch (error) {
       interaction.editReply("新增食物失敗，是不是太難吃了 :(");
       console.log(
         `[ERROR] An error occurred inside the increase food:\n${error}`.red
       );
     }
  },
};
