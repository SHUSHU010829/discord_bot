require("colors");
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const giveRoleXpHandler = require("../../features/level/handlers/giveRoleXp");
const levelRolesHandler = require("../../features/level/handlers/levelRoles");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("level-admin")
    .setDescription("[ADMIN] 等級系統管理（XP 發放、等級身分組）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("give-xp")
        .setDescription("為某個身分組所有成員統一加 XP")
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("要加分的身分組")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("每位成員要加的 XP")
            .setMinValue(1)
            .setMaxValue(1000000)
            .setRequired(true)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("include_bots")
            .setDescription("是否也對機器人加分（預設否）")
            .setRequired(false)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName("roles")
        .setDescription("Manage the level → role mapping table")
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set the role granted at a level (overwrites if exists)")
            .addIntegerOption((opt) =>
              opt
                .setName("level")
                .setDescription("Target level")
                .setMinValue(1)
                .setMaxValue(999)
                .setRequired(true)
            )
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("Role to grant")
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove the mapping for a level")
            .addIntegerOption((opt) =>
              opt
                .setName("level")
                .setDescription("Level to remove")
                .setMinValue(1)
                .setMaxValue(999)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("List the current level → role mappings")
        )
        .addSubcommand((sub) =>
          sub
            .setName("apply")
            .setDescription("Re-sync every member's level roles based on the current table (may take a few seconds)")
        )
    ),

  run: async (client, interaction) => {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (!group && sub === "give-xp") {
      return giveRoleXpHandler.run(client, interaction);
    }
    if (group === "roles") {
      return levelRolesHandler.run(client, interaction);
    }
  },
};
