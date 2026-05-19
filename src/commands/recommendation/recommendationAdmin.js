require("colors");

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} = require("discord.js");

const deleteHandler = require("../../features/recommendation/handlers/delete");
const reanalyzeHandler = require("../../features/recommendation/handlers/reanalyze");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recommendation-admin")
    .setDescription("[ADMIN] 推薦資料管理（delete / reanalyze）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
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
      case "delete":
        return deleteHandler.run(client, interaction);
      case "reanalyze":
        return reanalyzeHandler.run(client, interaction);
    }
  },
};
