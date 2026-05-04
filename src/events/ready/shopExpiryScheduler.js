require("colors");

const cron = require("node-cron");

// 每 10 分鐘掃過期 inventory：
// - role_color: 拔掉 Discord 身份組 + 標記 inventory expired
// - 其他 type: 標記 expired
// 連續錯誤計數，超過 5 次自動關閉避免洗 log。

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;
let task = null;

async function sweepOnce(client) {
  if (!client.userInventoryCollection) return;

  const now = new Date();
  const cursor = client.userInventoryCollection.find({
    expiresAt: { $lte: now },
    expired: { $ne: true },
  });

  while (await cursor.hasNext()) {
    const inv = await cursor.next();
    try {
      if (inv.type === "role_color" && inv.equipped && inv.payload?.hex) {
        const guild = client.guilds.cache.get(inv.guildId);
        const member = guild
          ? await guild.members.fetch(inv.userId).catch(() => null)
          : null;
        if (guild && member && client.shopRoleCacheCollection) {
          const cached = await client.shopRoleCacheCollection
            .findOne({ guildId: inv.guildId, hex: inv.payload.hex })
            .catch(() => null);
          if (cached?.roleId) {
            await member.roles.remove(cached.roleId).catch(() => {});
          }
        }
      }
      if (inv.type === "custom_title" && inv.equipped) {
        if (client.userLevelsCollection) {
          await client.userLevelsCollection
            .updateOne(
              { userId: inv.userId, guildId: inv.guildId, title: { $exists: true } },
              { $set: { title: null, updatedAt: new Date() } },
            )
            .catch(() => {});
        }
      }

      await client.userInventoryCollection.updateOne(
        { _id: inv._id },
        {
          $set: {
            expired: true,
            equipped: false,
            updatedAt: new Date(),
          },
        },
      );

      console.log(
        `[SHOP] 過期道具：user=${inv.userId} item=${inv.itemId} type=${inv.type}`.gray,
      );
    } catch (e) {
      console.log(`[ERROR] shop expiry handle inv ${inv._id}: ${e}`.red);
    }
  }
}

module.exports = async (client) => {
  if (task) return;

  task = cron.schedule("*/10 * * * *", async () => {
    try {
      await sweepOnce(client);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.log(
        `[ERROR] shopExpiryScheduler sweep failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err}`.red,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[ERROR] 連續錯誤過多，停止商店過期掃描 cron`.red);
        task.stop();
      }
    }
  });

  console.log(`[SHOP] 商店道具過期掃描排程已啟動（每 10 分鐘）`.cyan);
};
