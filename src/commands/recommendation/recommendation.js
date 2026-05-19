require("colors");

const { SlashCommandBuilder } = require("discord.js");

const {
  TYPE_CHOICES,
} = require("../../constants/recommendationCategories");

const listHandler = require("../../features/recommendation/handlers/list");
const searchHandler = require("../../features/recommendation/handlers/search");
const editHandler = require("../../features/recommendation/handlers/edit");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("推薦")
    .setDescription("瀏覽、搜尋或編輯伺服器的推薦（餐廳/酒吧/飲料/娛樂）📒")
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("編輯")
        .setDescription("修改推薦的分類欄位（未填的欄位不會動）")
        .addStringOption((o) =>
          o
            .setName("訊息連結")
            .setDescription(
              "推薦訊息的連結（在訊息點「分享」→「複製訊息連結」）",
            )
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("類別")
            .setDescription("頂層分類")
            .addChoices(...TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("店名").setDescription("店名／場所名稱"),
        )
        .addStringOption((o) =>
          o
            .setName("料理")
            .setDescription("料理／子類別（如：日式、火鍋）"),
        )
        .addStringOption((o) => o.setName("地區").setDescription("地區"))
        .addStringOption((o) =>
          o.setName("特色").setDescription("一句話特色（30 字內最佳）"),
        ),
    ),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "清單":
        return listHandler.run(client, interaction);
      case "搜尋":
        return searchHandler.run(client, interaction);
      case "編輯":
        return editHandler.run(client, interaction);
    }
  },
};
