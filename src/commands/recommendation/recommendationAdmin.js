require("colors");

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require("discord.js");

const {
  TYPE_CHOICES,
} = require("../../constants/recommendationCategories");

const editHandler = require("../../features/recommendation/handlers/edit");
const deleteHandler = require("../../features/recommendation/handlers/delete");
const reanalyzeHandler = require("../../features/recommendation/handlers/reanalyze");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recommendation-admin")
    .setDescription("[ADMIN] 推薦資料管理（edit / delete / reanalyze）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("修改推薦的分類欄位（未填的欄位不會動）")
        .addStringOption((o) =>
          o
            .setName("message_id")
            .setDescription("推薦訊息的 Discord message ID")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("頂層分類")
            .addChoices(...TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("name").setDescription("店名／場所名稱"),
        )
        .addStringOption((o) =>
          o
            .setName("cuisine")
            .setDescription("料理／子類別（如：日式、火鍋）"),
        )
        .addStringOption((o) => o.setName("area").setDescription("地區"))
        .addStringOption((o) =>
          o.setName("summary").setDescription("一句話特色（30 字內最佳）"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("刪除一筆推薦紀錄")
        .addStringOption((o) =>
          o
            .setName("message_id")
            .setDescription("推薦訊息的 Discord message ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reanalyze")
        .setDescription("重新跑 AI 分析（如果原本分類錯了）")
        .addStringOption((o) =>
          o
            .setName("message_id")
            .setDescription("推薦訊息的 Discord message ID")
            .setRequired(true),
        ),
    ),

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case "edit":
        return editHandler.run(client, interaction);
      case "delete":
        return deleteHandler.run(client, interaction);
      case "reanalyze":
        return reanalyzeHandler.run(client, interaction);
    }
  },
};
