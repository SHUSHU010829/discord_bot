require("colors");
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const pLimit = require("p-limit");

const syncLevelRoles = require("../../features/leveling/levelRoles");
const { getLevelProgress } = require("../../utils/levelMath");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("levelroles")
    .setDescription("[ADMIN] 管理等級身分組對應表")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("設定某等級對應的身分組（已存在會覆蓋）")
        .addIntegerOption((opt) =>
          opt
            .setName("level")
            .setDescription("達到的等級")
            .setMinValue(1)
            .setMaxValue(999)
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("role")
            .setDescription("要給的身分組")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("移除某等級的對應")
        .addIntegerOption((opt) =>
          opt
            .setName("level")
            .setDescription("要移除的等級")
            .setMinValue(1)
            .setMaxValue(999)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("查看目前所有等級身分組對應")
    )
    .addSubcommand((sub) =>
      sub
        .setName("apply")
        .setDescription("依目前對應表重新同步所有成員的等級身分組（可能需數秒）")
    )
    .toJSON(),

  run: async (client, interaction) => {
    if (!client.levelRolesCollection) {
      return interaction.reply({
        content: "🔧 等級系統尚未啟動",
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "set") return runSet(client, interaction);
    if (sub === "remove") return runRemove(client, interaction);
    if (sub === "list") return runList(client, interaction);
    if (sub === "apply") return runApply(client, interaction);
  },
};

async function runSet(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const level = interaction.options.getInteger("level");
    const role = interaction.options.getRole("role");

    // 確認 bot 自己 role 比目標 role 高（不然加不上）
    const me = interaction.guild.members.me;
    if (me.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.editReply(
        `⚠️ Bot 的最高身分組必須在 ${role} 之上才能管理這個 role，請到伺服器設定調整 role 順序。`
      );
    }

    await client.levelRolesCollection.updateOne(
      { guildId: interaction.guildId, level },
      {
        $set: {
          guildId: interaction.guildId,
          level,
          roleId: role.id,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    await interaction.editReply(
      `✅ 已設定 **Lv.${level}** → ${role}\n` +
        `-# 既有成員的身分組不會自動套用，要全部同步請用 \`/levelroles apply\``
    );
  } catch (error) {
    console.log(`[ERROR] /levelroles set:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 設定失敗，看 console").catch(() => {});
  }
}

async function runRemove(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const level = interaction.options.getInteger("level");
    const result = await client.levelRolesCollection.deleteOne({
      guildId: interaction.guildId,
      level,
    });

    if (result.deletedCount === 0) {
      return interaction.editReply(`Lv.${level} 沒有對應，沒事可做`);
    }

    await interaction.editReply(
      `🗑️ 已移除 Lv.${level} 的對應\n` +
        `-# 既有持有該 role 的成員身分組沒有被動掉，要清掉請手動或下次升級時 sync`
    );
  } catch (error) {
    console.log(`[ERROR] /levelroles remove:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 移除失敗，看 console").catch(() => {});
  }
}

async function runList(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const docs = await client.levelRolesCollection
      .find({ guildId: interaction.guildId })
      .sort({ level: 1 })
      .toArray();

    if (docs.length === 0) {
      return interaction.editReply(
        "目前沒有任何等級身分組對應。\n" +
          "用 `/levelroles set level:5 role:@xxx` 開始設定。"
      );
    }

    const lines = docs.map((d) => {
      const role = interaction.guild.roles.cache.get(d.roleId);
      const roleStr = role ? `${role}` : `\`<未知 role: ${d.roleId}>\``;
      return `**Lv.${d.level}** → ${roleStr}`;
    });

    await interaction.editReply(
      `## 🏷️ 等級身分組對應表\n${lines.join("\n")}\n\n` +
        `-# 共 ${docs.length} 筆 ・ 升級到對應等級時自動套用，舊成員可用 \`/levelroles apply\` 補上`
    );
  } catch (error) {
    console.log(`[ERROR] /levelroles list:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 載入失敗，看 console").catch(() => {});
  }
}

async function runApply(client, interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    if (!client.userLevelsCollection) {
      return interaction.editReply("🔧 等級系統尚未啟動");
    }

    // 先驗證所有 mapping role 的位階都在 bot 之下
    const mappingDocs = await client.levelRolesCollection
      .find({ guildId: interaction.guildId })
      .sort({ level: 1 })
      .toArray();
    const me = interaction.guild.members.me;
    const tooHigh = [];
    for (const m of mappingDocs) {
      const role = interaction.guild.roles.cache.get(m.roleId);
      if (!role) continue;
      if (me.roles.highest.comparePositionTo(role) <= 0) {
        tooHigh.push(`${role} (Lv.${m.level})`);
      }
    }
    if (tooHigh.length > 0) {
      return interaction.editReply(
        `⚠️ 以下 role 高於 bot，請先調整位階：${tooHigh.join("、")}`
      );
    }

    const docs = await client.userLevelsCollection
      .find({ guildId: interaction.guildId })
      .toArray();

    if (docs.length === 0) {
      return interaction.editReply("沒有任何用戶等級資料，跳過");
    }

    const total = docs.length;
    let synced = 0;
    let skipped = 0;
    let processed = 0;
    let lastProgressEdit = 0;

    await interaction.editReply(`🔄 同步中... 0/${total}`);

    const limit = pLimit(5);
    await Promise.all(
      docs.map((doc) =>
        limit(async () => {
          const member = await interaction.guild.members
            .fetch(doc.userId)
            .catch(() => null);
          if (!member) {
            skipped += 1;
          } else {
            const level = doc.level ?? getLevelProgress(doc.totalXp).level;
            try {
              await syncLevelRoles(client, member, level);
              synced += 1;
            } catch (_e) {
              skipped += 1;
            }
          }
          processed += 1;

          // 節流：每 10 人或處理完才 update（避免 rate limit）
          const now = Date.now();
          if (
            (processed % 10 === 0 || processed === total) &&
            now - lastProgressEdit > 1500
          ) {
            lastProgressEdit = now;
            interaction
              .editReply(`🔄 同步中... ${processed}/${total}`)
              .catch(() => {});
          }
        })
      )
    );

    await interaction.editReply(
      `✅ 同步完成\n` +
        `處理：**${synced}** 位成員\n` +
        `跳過（已離開伺服器或失敗）：${skipped} 位`
    );
  } catch (error) {
    console.log(`[ERROR] /levelroles apply:\n${error}\n${error.stack}`.red);
    await interaction.editReply("🔧 同步失敗，看 console").catch(() => {});
  }
}
