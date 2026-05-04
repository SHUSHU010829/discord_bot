require("colors");
const { SlashCommandBuilder } = require("discord.js");

const profileHandler = require("../../features/level/handlers/profile");
const rankHandler = require("../../features/level/handlers/rank");
const badgesHandler = require("../../features/level/handlers/badges");
const displayBadgesHandler = require("../../features/level/handlers/displayBadges");
const cardThemeHandler = require("../../features/level/handlers/cardTheme");
const titleHandler = require("../../features/level/handlers/title");

const { SLOT_NAMES } = displayBadgesHandler;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("等級系統：等級卡、排行榜、徽章、主題、稱號 🏅")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("profile")
        .setDescription("查看你或他人的等級卡 🏅")
        .addUserOption((option) =>
          option
            .setName("用戶")
            .setDescription("不填預設查自己")
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName("私密")
            .setDescription("只有你看得到（預設 False）")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("rank").setDescription("查看伺服器等級排行榜 🏆")
    )
    .addSubcommand((sub) =>
      sub.setName("badges").setDescription("查看你的徽章圖鑑 🏅")
    )
    .addSubcommand((sub) =>
      sub
        .setName("cardtheme")
        .setDescription("設定你的等級卡顏色主題 🎨")
        .addStringOption((opt) =>
          opt
            .setName("主題")
            .setDescription("選擇主題")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommandGroup((group) => {
      group
        .setName("displaybadges")
        .setDescription("自選等級卡下方要展示哪 5 個徽章 🏅")
        .addSubcommand((sub) => {
          sub.setName("設定").setDescription("依序選最多 5 個已解鎖徽章");
          SLOT_NAMES.forEach((slot, idx) => {
            sub.addStringOption((opt) =>
              opt
                .setName(slot)
                .setDescription(
                  idx === 0
                    ? "第 1 格徽章（必填）"
                    : `第 ${idx + 1} 格徽章（可留空）`
                )
                .setRequired(idx === 0)
                .setAutocomplete(true)
            );
          });
          return sub;
        })
        .addSubcommand((sub) =>
          sub
            .setName("重置")
            .setDescription("回到預設（依解鎖順序顯示前 5 個）")
        );
      return group;
    })
    .addSubcommandGroup((group) =>
      group
        .setName("title")
        .setDescription("管理你的等級卡稱號 ✨")
        .addSubcommand((sub) =>
          sub
            .setName("設定")
            .setDescription("從已解鎖徽章或目前等級 tier 中選一個當稱號")
            .addStringOption((opt) =>
              opt
                .setName("徽章")
                .setDescription("選擇徽章，或使用目前等級 tier")
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    ),

  autocomplete: async (client, interaction) => {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);

    if (!group) {
      if (sub === "cardtheme" && focused.name === "主題") {
        return cardThemeHandler.autocomplete(client, interaction);
      }
      return interaction.respond([]).catch(() => {});
    }

    if (group === "displaybadges") {
      return displayBadgesHandler.autocomplete(client, interaction);
    }
    if (group === "title") {
      return titleHandler.autocomplete(client, interaction);
    }
    return interaction.respond([]).catch(() => {});
  },

  run: async (client, interaction) => {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group) {
      switch (sub) {
        case "profile":
          return profileHandler.run(client, interaction);
        case "rank":
          return rankHandler.run(client, interaction);
        case "badges":
          return badgesHandler.run(client, interaction);
        case "cardtheme":
          return cardThemeHandler.run(client, interaction);
      }
      return;
    }

    if (group === "displaybadges") {
      return displayBadgesHandler.run(client, interaction);
    }
    if (group === "title") {
      return titleHandler.run(client, interaction);
    }
  },
};
