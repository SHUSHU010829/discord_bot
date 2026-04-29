require("colors");
const { SlashCommandBuilder } = require("discord.js");
const { BADGES, BADGE_BY_ID } = require("../../features/leveling/badgeDefinitions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("稱號")
    .setDescription("管理你的等級卡稱號 ✨")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("設定")
        .setDescription("從已解鎖徽章中選一個當稱號")
        .addStringOption((opt) =>
          opt
            .setName("徽章")
            .setDescription("選擇徽章")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("清除").setDescription("清掉目前的稱號（恢復成 tier 預設）")
    )
    .toJSON(),

  autocomplete: async (client, interaction) => {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== "徽章") return interaction.respond([]);

      const doc = await client.userLevelsCollection?.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      const owned = new Set(doc?.badges || []);

      const query = (focused.value || "").toLowerCase();
      const opts = BADGES.filter((b) => owned.has(b.id))
        .filter(
          (b) =>
            !query ||
            b.name.toLowerCase().includes(query) ||
            b.id.toLowerCase().includes(query)
        )
        .slice(0, 25)
        .map((b) => ({ name: `${b.emoji} ${b.name}`, value: b.id }));

      await interaction.respond(opts);
    } catch (error) {
      console.log(`[ERROR] /稱號 autocomplete: ${error}`.red);
      try {
        await interaction.respond([]);
      } catch {}
    }
  },

  run: async (client, interaction) => {
    const sub = interaction.options.getSubcommand();

    try {
      if (!client.userLevelsCollection) {
        return interaction.reply({
          content: "🔧 等級系統尚未啟動",
          ephemeral: true,
        });
      }

      if (sub === "清除") {
        await client.userLevelsCollection.updateOne(
          { userId: interaction.user.id, guildId: interaction.guildId },
          { $set: { title: null, updatedAt: new Date() } }
        );
        return interaction.reply({
          content: "✅ 稱號已清除（等級卡會顯示 tier 預設稱號）",
          ephemeral: true,
        });
      }

      const badgeId = interaction.options.getString("徽章");
      const badge = BADGE_BY_ID.get(badgeId);
      if (!badge) {
        return interaction.reply({
          content: "❌ 找不到該徽章",
          ephemeral: true,
        });
      }

      const doc = await client.userLevelsCollection.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId,
      });
      if (!doc?.badges?.includes(badgeId)) {
        return interaction.reply({
          content: `❌ 你還沒解鎖 ${badge.emoji} **${badge.name}**`,
          ephemeral: true,
        });
      }

      await client.userLevelsCollection.updateOne(
        { _id: doc._id },
        {
          $set: {
            title: `${badge.emoji} ${badge.name}`,
            updatedAt: new Date(),
          },
        }
      );

      await interaction.reply({
        content: `✅ 稱號已設定為 **${badge.emoji} ${badge.name}**`,
        ephemeral: true,
      });
    } catch (error) {
      console.log(`[ERROR] /稱號 ${sub}:\n${error}\n${error.stack}`.red);
      const reply = { content: "🔧 操作失敗，請呼叫舒舒！", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
