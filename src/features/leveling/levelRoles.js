require("colors");
const { levelSystem } = require("../../config.json");

/**
 * 根據新等級同步 member 的等級身分組。
 * 規則：給「目前等級可以拿到的最高那個 role」，移除其他等級 role。
 * 設定來自 config.json: levelSystem.levelRoles = [{ level, roleId }]
 */
module.exports = async (client, member, newLevel) => {
  const mapping = (levelSystem?.levelRoles || []).filter(
    (m) => m.roleId && m.level != null
  );
  if (mapping.length === 0) return;
  if (!member?.guild) return;

  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) {
    console.log(
      `[WARNING] levelRoles: bot 沒有 ManageRoles 權限，跳過`.yellow
    );
    return;
  }

  // 找出該等級對應的最高 role（level <= newLevel 中 level 最高那個）
  const eligible = mapping
    .filter((m) => newLevel >= m.level)
    .sort((a, b) => b.level - a.level);

  const targetRoleId = eligible[0]?.roleId || null;
  const allLevelRoleIds = mapping.map((m) => m.roleId);

  // 移除其他等級 role
  for (const rid of allLevelRoleIds) {
    if (rid === targetRoleId) continue;
    if (member.roles.cache.has(rid)) {
      await member.roles.remove(rid).catch((e) => {
        console.log(`[WARNING] levelRoles remove ${rid}: ${e.message}`.yellow);
      });
    }
  }

  // 加目標 role
  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId).catch((e) => {
      console.log(`[WARNING] levelRoles add ${targetRoleId}: ${e.message}`.yellow);
    });
  }
};
