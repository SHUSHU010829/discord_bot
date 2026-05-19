require("colors");

const { SlashCommandBuilder } = require("discord.js");

const {
  TYPE_CHOICES,
} = require("../../constants/recommendationCategories");

const listHandler = require("../../features/recommendation/handlers/list");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("推薦清單")
    .setDescription("瀏覽伺服器收錄的推薦（餐廳/酒吧/飲料/娛樂）📒")
    .addStringOption((option) =>
      option
        .setName("類別")
        .setDescription("依類別過濾（不選則顯示全部）")
        .addChoices(...TYPE_CHOICES),
    )
    .addStringOption((option) =>
      option
        .setName("地區")
        .setDescription("依地區過濾（支援模糊比對，例：信義、台中）"),
    ),

  run: async (client, interaction) => listHandler.run(client, interaction),
};
