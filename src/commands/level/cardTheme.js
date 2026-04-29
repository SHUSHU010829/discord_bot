require("colors");
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const { CARD_THEMES, THEME_KEYS } = require("../../utils/cardThemes");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("等級卡主題")
    .setDescription("設定你的等級卡顏色主題 🎨")
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName("主題")
        .setDescription("選擇主題")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .toJSON(),

  autocomplete: async (client, interaction) => {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name !== "主題") return interaction.respond([]);
      const q = (focused.value || "").toLowerCase();
      const opts = THEME_KEYS.filter(
        (k) =>
          !q ||
          k.toLowerCase().includes(q) ||
          CARD_THEMES[k].label.toLowerCase().includes(q)
      )
        .slice(0, 25)
        .map((k) => ({ name: `${k} — ${CARD_THEMES[k].label}`, value: k }));
      await interaction.respond(opts);
    } catch (error) {
      console.log(`[ERROR] /等級卡主題 autocomplete: ${error}`.red);
      try {
        await interaction.respond([]);
      } catch {}
    }
  },

  run: async (client, interaction) => {
    try {
      if (!client.userLevelsCollection) {
        return interaction.reply({
          content: "🔧 等級系統尚未啟動",
          flags: MessageFlags.Ephemeral,
        });
      }

      const themeKey = interaction.options.getString("主題");
      if (!CARD_THEMES[themeKey]) {
        return interaction.reply({
          content: `❌ 找不到主題 \`${themeKey}\`。可用：${THEME_KEYS.join("、")}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await client.userLevelsCollection.updateOne(
        { userId: interaction.user.id, guildId: interaction.guildId },
        {
          $set: { cardAccent: themeKey, updatedAt: new Date() },
          $setOnInsert: {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      await interaction.reply({
        content: `✅ 已將等級卡主題設為 **${themeKey}**（${CARD_THEMES[themeKey].label}）。下次 \`/等級卡\` 就會看到新顏色！`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.log(`[ERROR] /等級卡主題:\n${error}\n${error.stack}`.red);
      const reply = { content: "🔧 設定失敗，請呼叫舒舒！", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
