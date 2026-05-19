require("colors");

const { SlashCommandBuilder } = require("discord.js");

const {
  TYPE_CHOICES,
} = require("../../constants/recommendationCategories");

const listHandler = require("../../features/recommendation/handlers/list");
const searchHandler = require("../../features/recommendation/handlers/search");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("推薦")
    .setDescription("瀏覽或搜尋伺服器的推薦（餐廳/酒吧/飲料/娛樂）📒")
    .addSubcommand((sub) =>
      sub
        .setName("清單")
        .setDescription("瀏覽推薦清單")
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("搜尋")
        .setDescription("以關鍵字搜尋推薦")
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
    ),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "清單":
        return listHandler.run(client, interaction);
      case "搜尋":
        return searchHandler.run(client, interaction);
    }
  },
};
