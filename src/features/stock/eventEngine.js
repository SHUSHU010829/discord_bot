require("colors");
const { EmbedBuilder } = require("discord.js");
const { stockSystem, stockEventConfig } = require("../../config");
const { applyEvent } = require("./priceEngine");

function getEventDefs() {
  return stockEventConfig?.events || [];
}

function findEventById(eventId) {
  return getEventDefs().find((e) => e.id === eventId) || null;
}

async function isOnCooldown(client, guildId, eventId) {
  if (!client.stockEventsCollection) return false;
  const cooldownHours = stockEventConfig?.cooldownHours ?? 4;
  const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
  const recent = await client.stockEventsCollection.findOne({
    guildId,
    eventId,
    timestamp: { $gte: cutoff },
  });
  return !!recent;
}

// 隨機抽事件並嘗試觸發；回傳 applied 事件或 null
async function rollRandomEvent(client, guildId) {
  const chance = stockEventConfig?.randomEventChance ?? 0.05;
  if (Math.random() >= chance) return null;
  const events = getEventDefs();
  if (events.length === 0) return null;

  // 隨機抽一個還沒在 cooldown 中的
  const shuffled = [...events].sort(() => Math.random() - 0.5);
  for (const ev of shuffled) {
    if (await isOnCooldown(client, guildId, ev.id)) continue;
    return fireEvent(client, guildId, ev.id, { force: false });
  }
  return null;
}

async function applyEffectToStocks(client, guildId, targetSymbol, effect) {
  const filter = { guildId, enabled: { $ne: false } };
  if (targetSymbol && targetSymbol !== "ALL") filter.symbol = targetSymbol;

  const stocks = await client.stockMarketCollection.find(filter).toArray();
  const changes = [];
  for (const s of stocks) {
    const before = s.currentPrice;
    const after = applyEvent(before, effect, s.floor);
    if (after === before) continue;
    await client.stockMarketCollection.updateOne(
      { _id: s._id },
      { $set: { currentPrice: after, updatedAt: new Date() } }
    );
    // 寫入歷史報價
    if (client.stockPricesCollection) {
      await client.stockPricesCollection.insertOne({
        guildId,
        symbol: s.symbol,
        price: after,
        timestamp: new Date(),
        source: "event",
      }).catch(() => {});
    }
    changes.push({ symbol: s.symbol, name: s.name, before, after });
  }
  return changes;
}

async function fireEvent(client, guildId, eventId, opts = {}) {
  const def = findEventById(eventId);
  if (!def) return null;
  if (!opts.force && (await isOnCooldown(client, guildId, eventId))) return null;

  const changes = await applyEffectToStocks(client, guildId, def.stock, def.effect);
  if (changes.length === 0) return null;

  await client.stockEventsCollection.insertOne({
    guildId,
    eventId: def.id,
    name: def.name,
    effect: def.effect,
    stock: def.stock,
    dir: def.dir,
    forced: !!opts.force,
    triggeredBy: opts.triggeredBy || "system",
    changes,
    timestamp: new Date(),
  }).catch(() => {});

  await announceEvent(client, def, changes).catch((e) =>
    console.log(`[STOCK-EVENT] 推播失敗：${e?.message || e}`.yellow)
  );

  return { def, changes };
}

async function announceEvent(client, def, changes) {
  const channelId = stockSystem?.announceChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const arrow = def.dir === "up" ? "📈" : "📉";
  const pct = (def.effect * 100).toFixed(1);
  const sign = def.effect >= 0 ? "+" : "";
  const title = def.stock === "ALL" ? `${arrow} 突發新聞｜全市場` : `${arrow} 突發新聞｜${changes[0]?.name || def.stock}`;
  const lines = changes
    .slice(0, 6)
    .map((c) => `\`${c.symbol}\` ${c.name}：${c.before.toFixed(1)} → **${c.after.toFixed(1)}**`);
  if (changes.length > 6) lines.push(`…還有 ${changes.length - 6} 支`);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(def.dir === "up" ? 0x2ecc71 : 0xe74c3c)
    .setDescription(`**${def.name}** 影響股價 ${sign}${pct}%`)
    .addFields({ name: "成交價變動", value: lines.join("\n") || "（無）" })
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
  rollRandomEvent,
  fireEvent,
  findEventById,
  isOnCooldown,
};
