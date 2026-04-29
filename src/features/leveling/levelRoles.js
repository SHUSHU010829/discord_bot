require("colors");
const { levelSystem } = require("../../config.json");

/**
 * 拿某 guild 的等級 role 對應表。
 * 優先從 DB (LevelRoles collection) 讀；DB 沒有就 fallback 到 config.json levelSystem.levelRoles。
 */
async function getMappingForGuild(client, guildId) {
  let mapping = [];
  try {
    if (client.levelRolesCollection) {
      const docs = await client.levelRolesCollection
        .find({ guildId })
        .toArray();
      mapping = docs
        .filter((d) => d.roleId && d.level != null)
        .map((d) => ({ level: d.level, roleId: d.roleId }));
    }
  } catch (e) {
    console.log(`[WARNING] levelRoles DB read: ${e.message}`.yellow);
  }

  if (mapping.length === 0) {
    mapping = (levelSystem?.levelRoles || []).filter(
      (m) => m.roleId && m.level != null
    );
  }

  return mapping;
}

/**
 * 根據 newLevel 同步 member 的等級身分組。
 * 規則：給「目前等級可拿到的最高那個 role」，移除其他等級 role。
 */
async function syncLevelRoles(client, member, newLevel) {
  if (!member?.guild) return;

  const mapping = await getMappingForGuild(client, member.guild.id);
  if (mapping.length === 0) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) {
    console.log(
      `[WARNING] levelRoles: bot 沒有 ManageRoles 權限，跳過`.yellow
    );
    return;
  }

  const eligible = mapping
    .filter((m) => newLevel >= m.level)
    .sort((a, b) => b.level - a.level);

  const targetRoleId = eligible[0]?.roleId || null;
  const allLevelRoleIds = mapping.map((m) => m.roleId);

  for (const rid of allLevelRoleIds) {
    if (rid === targetRoleId) continue;
    if (member.roles.cache.has(rid)) {
      await member.roles.remove(rid).catch((e) => {
        console.log(`[WARNING] levelRoles remove ${rid}: ${e.message}`.yellow);
      });
    }
  }

  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId).catch((e) => {
      console.log(`[WARNING] levelRoles add ${targetRoleId}: ${e.message}`.yellow);
    });
  }
}

module.exports = syncLevelRoles;
module.exports.getMappingForGuild = getMappingForGuild;
