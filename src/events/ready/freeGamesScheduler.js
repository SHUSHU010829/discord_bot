require("colors");

const cron = require("node-cron");

const config = require("../../config.json");
const { runFreeGamesJob, ensureIndexes } = require("../../features/freeGames");

module.exports = async (client) => {
  const cfg = config.freeGames;

  if (!cfg) {
    console.log(`[WARNING] config.freeGames 不存在,喜加一推播未啟用`.yellow);
    return;
  }

  const enabledByEnv = process.env.FREE_GAMES_ENABLED !== "false";
  if (!cfg.enabled || !enabledByEnv) {
    console.log(`[INFO] 喜加一推播未啟用 (config.enabled=${cfg.enabled})`.gray);
    return;
  }

  const channelId =
    process.env.DISCORD_FREE_GAMES_CHANNEL_ID ||
    process.env.DISCORD_DEALS_CHANNEL_ID ||
    cfg.channelId;
  if (!channelId) {
    console.log(
      `[ERROR] 喜加一推播：DISCORD_FREE_GAMES_CHANNEL_ID / config.freeGames.channelId 未設定`
        .red
    );
    return;
  }

  if (client.freeGamesCollection) {
    await ensureIndexes(client.freeGamesCollection);
  }

  // 平台 → feed URL 對照,支援 env 覆寫
  const platforms = [
    {
      platform: "epic",
      enabled: cfg.platforms?.epic !== false,
      feedUrl:
        process.env.FREE_GAMES_EPIC_FEED_URL ||
        cfg.feeds?.epic ||
        "https://discord-news.zeabur.app/xiaoheihe/add2cart/epic",
    },
    {
      platform: "steam",
      enabled: cfg.platforms?.steam !== false,
      feedUrl:
        process.env.FREE_GAMES_STEAM_FEED_URL ||
        cfg.feeds?.steam ||
        "https://discord-news.zeabur.app/xiaoheihe/add2cart/steam",
    },
    {
      platform: "gog",
      enabled: cfg.platforms?.gog === true, // GOG 預設關
      feedUrl:
        process.env.FREE_GAMES_GOG_FEED_URL ||
        cfg.feeds?.gog ||
        "https://discord-news.zeabur.app/xiaoheihe/add2cart/gog",
    },
  ].filter((p) => p.enabled);

  const cronSchedule =
    process.env.FREE_GAMES_CRON || cfg.cronSchedule || "30 */6 * * *";
  const timezone = cfg.timezone || "Asia/Taipei";

  console.log(
    `[INFO] 喜加一推播已排程：${cronSchedule} (${timezone}) → channel ${channelId} (平台:${platforms
      .map((p) => p.platform)
      .join(",")})`.cyan
  );

  const runOnce = async (label) => {
    console.log(`[INFO] 喜加一推播 ${label} 觸發`.cyan);
    for (const p of platforms) {
      try {
        await runFreeGamesJob({
          client,
          channelId,
          config: cfg,
          platform: p.platform,
          feedUrl: p.feedUrl,
          dryRun: process.env.FREE_GAMES_DRY_RUN === "true",
        });
      } catch (error) {
        console.log(
          `[ERROR] 喜加一 job 例外 [${p.platform}]:\n${error.stack || error.message}`
            .red
        );
      }
    }
  };

  if (process.env.FREE_GAMES_RUN_ON_START === "true") {
    runOnce("啟動時");
  }

  cron.schedule(cronSchedule, () => runOnce("cron"), {
    scheduled: true,
    timezone,
  });
};
