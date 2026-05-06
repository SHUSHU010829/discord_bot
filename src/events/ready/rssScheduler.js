require("colors");

const { startRssPoller } = require("../../cron/rssPoller");

let started = false;

module.exports = async (client) => {
  // ready 可能多次觸發 (reconnect),確保 cron 只註冊一次
  if (started) return;

  if (process.env.RSS_ENABLED === "false") {
    console.log(`[INFO] RSS 推播已停用 (RSS_ENABLED=false)`.gray);
    return;
  }

  started = true;
  startRssPoller(client);
};
