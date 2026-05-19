require("colors");

const { SlashCommandBuilder } = require("discord.js");

const {
  TYPE_CHOICES,
} = require("../../constants/recommendationCategories");

const searchHandler = require("../../features/recommendation/handlers/search");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("推薦搜尋")
    .setDescription("以關鍵字搜尋推薦的店家或場所 🔍")
    .addStringOption((option) =>
      option
        .setName("關鍵字")
        .setDescription("店名、料理、地區、特色...都可以")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("限制在某個類別內搜尋")
        .addChoices(...TYPE_CHOICES),
    ),

  run: async (client, interaction) => searchHandler.run(client, interaction),
};
