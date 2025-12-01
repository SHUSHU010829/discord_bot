require("colors");

const {
  SlashCommandBuilder,
} = require("discord.js");

const { commandEmojis, commandMessages } = require("../../config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("吃什麼")
    .setDescription("食物選擇器!讓逼逼機器人幫你決定吃什麼... 🎰"),

  run: async (client, interaction) => {
    const collection = client.collection;
    const msg = await interaction.reply({
      content: commandMessages.drawingLot,
      fetchReply: true,
    });
    try {
      const foodList = await collection.find({}).toArray();
      if (foodList.length > 0) {
        const randomFood =
          foodList[Math.floor(Math.random() * foodList.length)].name;
        interaction.editReply(
          `逼逼機器人推薦你可以吃... **${randomFood}**！ ${commandEmojis.hiiiiii} `
        );
      } else {
        interaction.editReply(commandMessages.noFood);
      }
    } catch (error) {
      interaction.editReply(commandMessages.getFoodError);
      console.log(
        `[ERROR] An error occurred inside the draw lot:\n${error}`.red
      );
    }
  },
};
