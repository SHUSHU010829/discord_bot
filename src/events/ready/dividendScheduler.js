require("colors");

const cron = require("node-cron");
const { stockSystem } = require("../../config");
const { payoutAll, announce, sendDmNotifications } = require("../../features/stock/dividendService");

let task = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

async function listGuildIdsWithMarket(client) {
  if (!client.stockMarketCollection) return [];
  return client.stockMarketCollection.distinct("guildId", { enabled: { $ne: false } });
}

async function runPayout(client) {
  const guildIds = await listGuildIdsWithMarket(client);
  for (const guildId of guildIds) {
    try {
      const summaries = await payoutAll(client, guildId);
      if (summaries.length === 0) {
        console.log(`[DIV] guild=${guildId} 本週無人受惠（沒有持股或殖利率全為 0）`.gray);
        continue;
      }
      const total = summaries.reduce((a, b) => a + b.totalPaid, 0);
      const hits = summaries.reduce((a, b) => a + b.recipients, 0);
      console.log(`[DIV] guild=${guildId} 本週配息完成：${total.toLocaleString()} credits, ${hits} 筆派息, ${summaries.length} 支股票`.cyan);
      await announce(client, guildId, summaries);
      await sendDmNotifications(client, summaries);
    } catch (e) {
      console.log(`[DIV] guild=${guildId} 配息失敗：${e?.stack || e?.message || e}`.red);
      throw e;
    }
  }
}

module.exports = async (client) => {
  if (task) return;
  if (!stockSystem?.enabled) {
    console.log(`[DIV] 股市系統未啟用，跳過配息排程`.gray);
    return;
  }
  const cfg = stockSystem?.dividend;
  if (!cfg?.enabled) {
    console.log(`[DIV] 配息未啟用，跳過排程`.gray);
    return;
  }
  if (!client.stockMarketCollection || !client.userPortfolioCollection) {
    console.log(`[DIV] DB 未連線，跳過配息排程`.yellow);
    return;
  }

  const schedule = cfg.cronSchedule || "0 9 * * 1";
  const tz = cfg.timezone || stockSystem.timezone || "Asia/Taipei";

  task = cron.schedule(
    schedule,
    async () => {
      try {
        await runPayout(client);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors += 1;
        console.log(
          `[ERROR] dividendScheduler failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):\n${err?.stack || err}`.red
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.log(`[ERROR] 連續錯誤過多，停止配息 cron`.red);
          task.stop();
        }
      }
    },
    { timezone: tz }
  );

  console.log(`[DIV] 配息排程已啟動：${schedule} (${tz})`.cyan);
};

module.exports.runPayout = runPayout;
