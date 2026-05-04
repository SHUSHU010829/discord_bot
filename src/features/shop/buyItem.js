require("colors");
const grantCoins = require("../economy/grantCoins");
const { getItem } = require("./catalog");
const { addBuff } = require("./activeBuff");

// 處理一筆購買：扣款 → 寫入 inventory → 對特殊 type 立即生效（buff/casino_token）
async function buyItem(client, { userId, guildId, username, member, itemId }) {
  const item = getItem(itemId);
  if (!item) return { ok: false, error: "找不到商品" };

  if (!client.userCoinsCollection || !client.userInventoryCollection) {
    return { ok: false, error: "商店系統尚未就緒" };
  }

  const balance = await client.userCoinsCollection
    .findOne({ userId, guildId }, { projection: { totalCoins: 1 } })
    .catch(() => null);
  const totalCoins = balance?.totalCoins || 0;
  if (totalCoins < item.price) {
    return {
      ok: false,
      error: `金幣不足！需要 ${item.price.toLocaleString()}，你只有 ${totalCoins.toLocaleString()}`,
    };
  }

  // 一次性主題：已擁有就拒絕重買
  if (item.type === "wallet_theme") {
    const owned = await client.userInventoryCollection
      .findOne({ userId, guildId, itemId, type: "wallet_theme" })
      .catch(() => null);
    if (owned) return { ok: false, error: "你已經擁有這個主題了" };
  }

  // 扣款（admin source 會跳過倍率，這裡用 shop_buy 為負值）
  const grant = await grantCoins(client, {
    userId,
    guildId,
    username,
    amount: -item.price,
    source: "shop_buy",
    member,
    meta: { itemId, name: item.name },
  });
  if (!grant) {
    return { ok: false, error: "扣款失敗" };
  }

  const now = new Date();
  const expiresAt =
    item.durationDays && item.durationDays > 0
      ? new Date(now.getTime() + item.durationDays * 24 * 60 * 60 * 1000)
      : null;

  // 寫入背包（buff 類型不需要 inventory，直接生效）
  let inventoryDoc = null;
  if (item.type === "xp_boost" || item.type === "coin_boost") {
    await addBuff(client, {
      userId,
      guildId,
      type: item.type,
      multiplier: item.payload?.multiplier || 1,
      durationMinutes: item.payload?.durationMinutes || 60,
      source: itemId,
    });
  } else if (item.type === "casino_token") {
    // 賭場道具：累計到背包數量
    const tokenName = item.payload?.token;
    const qty = item.payload?.qty || 1;
    inventoryDoc = await client.userInventoryCollection.findOneAndUpdate(
      { userId, guildId, itemId, type: "casino_token", token: tokenName },
      {
        $inc: { qty },
        $set: { updatedAt: now },
        $setOnInsert: {
          userId,
          guildId,
          itemId,
          name: item.name,
          type: "casino_token",
          token: tokenName,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  } else {
    // role_color / wallet_theme / custom_title：個別建一筆
    inventoryDoc = await client.userInventoryCollection.insertOne({
      userId,
      guildId,
      itemId,
      name: item.name,
      type: item.type,
      payload: item.payload || {},
      equipped: false,
      expiresAt,
      acquiredAt: now,
      updatedAt: now,
    });
  }

  // 交易紀錄
  if (client.shopTransactionsCollection) {
    client.shopTransactionsCollection
      .insertOne({
        userId,
        guildId,
        itemId,
        name: item.name,
        type: item.type,
        price: item.price,
        balanceAfter: grant.doc?.totalCoins || 0,
        createdAt: now,
      })
      .catch((e) => console.log(`[ERROR] insert shop tx: ${e}`.red));
  }

  console.log(
    `[SHOP] ${username || userId} bought ${item.name} (${itemId}) for ${item.price}`.cyan,
  );

  return {
    ok: true,
    item,
    balanceAfter: grant.doc?.totalCoins || 0,
    expiresAt,
    inventoryDoc,
  };
}

module.exports = buyItem;
