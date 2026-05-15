require("colors");

const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { DateTime } = require("luxon");

const { stockSystem } = require("../../config");
const { nextPrice, calcMarketDrift } = require("../../features/stock/priceEngine");
const { rollRandomEvent } = require("../../features/stock/eventEngine");
const { isMarketOpen } = require("../../features/stock/tradeService");

let tickTask = null;
let openTask = null;
let closeTask = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

async function listGuildIdsWithMarket(client) {
  if (!client.stockMarketCollection) return [];
  return client.stockMarketCollection.distinct("guildId", { enabled: { $ne: false } });
}

async function tickOnce(client) {
  if (!isMarketOpen()) {
    console.log(`[STOCK] market closed, skip tick`.gray);
    return;
  }
  const guildIds = await listGuildIdsWithMarket(client);
  for (const guildId of guildIds) {
    const stocks = await client.stockMarketCollection
      .find({ guildId, enabled: { $ne: false } })
      .toArray();
    for (const s of stocks) {
      const drift = calcMarketDrift(s.marketSentiment || stockSystem?.defaultMarketSentiment || "sideways");
      const next = nextPrice(s.currentPrice, s.sigma, drift, s.floor);
      await client.stockMarketCollection.updateOne(
        { _id: s._id },
        { $set: { currentPrice: next, updatedAt: new Date() } }
      );
      await client.stockPricesCollection.insertOne({
        guildId,
        symbol: s.symbol,
        price: next,
        timestamp: new Date(),
        source: "tick",
      }).catch(() => {});
    }
    // 每個 guild 5% 機率觸發隨機事件
    await rollRandomEvent(client, guildId).catch((e) =>
      console.log(`[STOCK] rollRandomEvent failed guild=${guildId}: ${e?.message || e}`.yellow)
    );
  }
  console.log(`[STOCK] tick done for ${guildIds.length} guild(s)`.cyan);
}

async function runOpen(client) {
  const guildIds = await listGuildIdsWithMarket(client);
  for (const guildId of guildIds) {
    // 把現價寫入今日 openPrice
    const stocks = await client.stockMarketCollection.find({ guildId, enabled: { $ne: false } }).toArray();
    for (const s of stocks) {
      await client.stockMarketCollection.updateOne(
        { _id: s._id },
        { $set: { openPrice: s.currentPrice, openedAt: new Date() } }
      );
    }
    await postOpenReport(client, guildId, stocks).catch(() => {});
  }
}

async function postOpenReport(client, guildId, stocks) {
  const channelId = stockSystem?.reportChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const lines = stocks.map(
    (s) => `\`${s.symbol}\` ${s.name}：開盤 **${(s.currentPrice).toFixed(1)}**`
  );
  const embed = new EmbedBuilder()
    .setTitle("🔔 逼逼股市｜今日開盤")
    .setColor(0x3498db)
    .setDescription(lines.join("\n") || "（無上市股票）")
    .setTimestamp(new Date());
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function runClose(client) {
  const guildIds = await listGuildIdsWithMarket(client);
  for (const guildId of guildIds) {
    await postCloseReport(client, guildId).catch((e) =>
      console.log(`[STOCK] close report failed guild=${guildId}: ${e?.message || e}`.yellow)
    );
  }
}

async function postCloseReport(client, guildId) {
  const channelId = stockSystem?.reportChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const stocks = await client.stockMarketCollection
    .find({ guildId, enabled: { $ne: false } })
    .toArray();
  const rows = stocks.map((s) => {
    const open = s.openPrice || s.currentPrice;
    const change = open > 0 ? ((s.currentPrice - open) / open) * 100 : 0;
    return {
      symbol: s.symbol,
      name: s.name,
      current: s.currentPrice,
      open,
      change,
    };
  });

  const sortedDesc = [...rows].sort((a, b) => b.change - a.change);
  const gainers = sortedDesc.slice(0, 3).filter((r) => r.change > 0);
  const losers = sortedDesc.slice(-3).reverse().filter((r) => r.change < 0);

  // 成交量統計（今日 stock_buy + stock_sell 筆數，依 symbol 分組）
  const today = DateTime.now().setZone(stockSystem?.timezone || "Asia/Taipei").toISODate();
  const startOfDay = DateTime.fromISO(today, { zone: stockSystem?.timezone || "Asia/Taipei" }).toJSDate();
  let topVolumeLine = "—";
  if (client.stockTransactionsCollection) {
    const volAgg = await client.stockTransactionsCollection
      .aggregate([
        { $match: { guildId, timestamp: { $gte: startOfDay } } },
        { $group: { _id: "$symbol", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ])
      .toArray();
    if (volAgg[0]) {
      topVolumeLine = `${volAgg[0]._id}（${volAgg[0].count} 筆）`;
    }
  }

  // 今日事件
  let eventLine = "（無）";
  if (client.stockEventsCollection) {
    const events = await client.stockEventsCollection
      .find({ guildId, timestamp: { $gte: startOfDay } })
      .sort({ timestamp: -1 })
      .limit(3)
      .toArray();
    if (events.length > 0) {
      eventLine = events
        .map((e) => `${e.name}（${e.effect >= 0 ? "+" : ""}${(e.effect * 100).toFixed(1)}%）`)
        .join("、");
    }
  }

  const fmtList = (list) =>
    list
      .map((r, i) => `${i + 1}. \`${r.symbol}\` ${r.change >= 0 ? "+" : ""}${r.change.toFixed(2)}%`)
      .join("\n") || "—";

  const embed = new EmbedBuilder()
    .setTitle("📊 逼逼股市｜今日收盤報告")
    .setColor(0xf1c40f)
    .addFields(
      { name: "漲幅榜", value: fmtList(gainers), inline: true },
      { name: "跌幅榜", value: fmtList(losers), inline: true },
      { name: "成交量最高", value: topVolumeLine, inline: false },
      { name: "今日事件", value: eventLine, inline: false }
    )
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = async (client) => {
  if (tickTask) return;
  if (!stockSystem?.enabled) {
    console.log(`[STOCK] 股市系統未啟用，跳過排程`.gray);
    return;
  }
  if (!client.stockMarketCollection) {
    console.log(`[STOCK] DB 未連線，跳過排程`.yellow);
    return;
  }

  const tz = stockSystem.timezone || "Asia/Taipei";
  const tickSchedule = stockSystem.tickCronSchedule || "*/15 * * * *";
  const openSchedule = stockSystem.openCronSchedule || "0 9 * * *";
  const closeSchedule = stockSystem.closeCronSchedule || "0 21 * * *";

  tickTask = cron.schedule(
    tickSchedule,
    async () => {
      try {
        await tickOnce(client);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        console.log(
          `[ERROR] marketScheduler tick failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err?.stack || err}`.red
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`[ERROR] 連續錯誤過多，停止股市 tick cron`.red);
          tickTask.stop();
          await alertSchedulerStopped(client).catch(() => {});
        }
      }
    },
    { timezone: tz }
  );

  openTask = cron.schedule(
    openSchedule,
    async () => {
      try {
        await runOpen(client);
      } catch (err) {
        console.log(`[ERROR] marketScheduler open failed:\n${err?.stack || err}`.red);
      }
    },
    { timezone: tz }
  );

  closeTask = cron.schedule(
    closeSchedule,
    async () => {
      try {
        await runClose(client);
      } catch (err) {
        console.log(`[ERROR] marketScheduler close failed:\n${err?.stack || err}`.red);
      }
    },
    { timezone: tz }
  );

  console.log(
    `[STOCK] 股市排程已啟動：tick=${tickSchedule}, open=${openSchedule}, close=${closeSchedule} (${tz})`.cyan
  );
};

async function alertSchedulerStopped(client) {
  const channelId = stockSystem?.reportChannelId;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel
    .send({
      content: `🚨 股市 tick 連續 ${MAX_CONSECUTIVE_ERRORS} 次失敗，已自動停止。請聯絡舒舒檢查。`,
    })
    .catch(() => {});
}

module.exports.tickOnce = tickOnce;
module.exports.runOpen = runOpen;
module.exports.runClose = runClose;
