require("colors");

// 取得（或建立）某個 hex 對應的 guild role；以 ShopRoleCache 去重
async function ensureColorRole(client, { guild, hex, roleName }) {
  if (!client.shopRoleCacheCollection) return null;
  const guildId = guild.id;

  const cached = await client.shopRoleCacheCollection
    .findOne({ guildId, hex })
    .catch(() => null);

  if (cached?.roleId) {
    const existing = guild.roles.cache.get(cached.roleId);
    if (existing) return existing;
    // 快取存在但 role 已被刪 → 後面會重建並 upsert 覆蓋
  }

  const colorInt = parseInt(hex.replace("#", ""), 16);
  const role = await guild.roles
    .create({
      name: roleName,
      color: colorInt,
      reason: "Shop role color rental",
      mentionable: false,
      hoist: false,
    })
    .catch((e) => {
      console.log(`[ERROR] create color role ${hex}: ${e}`.red);
      return null;
    });

  if (!role) return null;

  await client.shopRoleCacheCollection
    .updateOne(
      { guildId, hex },
      {
        $set: {
          guildId,
          hex,
          roleId: role.id,
          roleName,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    )
    .catch(() => {});

  return role;
}

async function assignColorRole(client, { guild, member, hex, roleName }) {
  const role = await ensureColorRole(client, { guild, hex, roleName });
  if (!role) return { ok: false, error: "建立顏色身份組失敗（檢查 bot 權限）" };
  await member.roles.add(role).catch((e) => {
    console.log(`[ERROR] add color role: ${e}`.red);
  });
  return { ok: true, role };
}

async function removeColorRole(client, { guild, member, hex }) {
  if (!client.shopRoleCacheCollection) return;
  const cached = await client.shopRoleCacheCollection
    .findOne({ guildId: guild.id, hex })
    .catch(() => null);
  if (!cached?.roleId) return;
  await member.roles.remove(cached.roleId).catch(() => {});
}

module.exports = { ensureColorRole, assignColorRole, removeColorRole };
