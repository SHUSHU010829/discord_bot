require("colors");
const { SlashCommandBuilder } = require("discord.js");

const { casino } = require("../../config");
const { createTable } = require("../../features/casino/poker/service");

function getCfg() {
  return casino?.poker || {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("德州撲克")
    .setDescription("開一桌德州撲克 🃏（會自動建立執行緒，桌面在裡面跑）")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("開桌")
        .setDescription("建立新牌桌並自動開執行緒")
        .addIntegerOption((opt) =>
          opt
            .setName("max_players")
            .setDescription("最多玩家人數")
            .setRequired(true)
            .setMinValue(getCfg().minPlayers ?? 2)
            .setMaxValue(getCfg().maxPlayers ?? 8)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("blind")
            .setDescription("大盲注金額（小盲為一半）")
            .setRequired(true)
            .setMinValue(getCfg().minBlind ?? 10)
        )
    )
    .toJSON(),

  run: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });
    try {
      const sub = interaction.options.getSubcommand();
      if (sub !== "開桌") {
        return interaction.editReply("未知子指令。");
      }
      const maxPlayers = interaction.options.getInteger("max_players");
      const blind = interaction.options.getInteger("blind");

      const result = await createTable(client, interaction, { maxPlayers, blind });
      if (result.error) return interaction.editReply(result.error);

      const buyIn = result.doc.buyIn.toLocaleString();
      return interaction.editReply(
        `🃏 牌桌已建立 → ${result.thread}\n進桌費 **${buyIn}** credits 已扣，其他人到 ${result.thread} 用 \`/撲克 加入\` 入座。`
      );
    } catch (err) {
      console.log(`[ERROR] /德州撲克 開桌:\n${err}\n${err.stack}`.red);
      await interaction
        .editReply("🔧 開桌失敗，請呼叫舒舒！")
        .catch(() => {});
    }
  },
};
