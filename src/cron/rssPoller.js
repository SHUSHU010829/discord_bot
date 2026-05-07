require("colors");
const fs = require("fs");
const cron = require("node-cron");
const axios = require("axios");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

const { RSS_FEEDS } = require("../config/rssFeeds");
const { fetchFeedItems } = require("../services/rssFeedService");
const { getDataFile } = require("../utils/dataPaths");

const STATE_FILE = "rss_state.json";
const MAX_DESCRIPTION_LENGTH = 280;
// Discord 單訊息最多 10 個 embed,主 embed 一個 + 最多 9 張額外圖。
// 規格指定第 2~4 張(共 3 張)組為額外 embed。
const EXTRA_IMAGE_COUNT = 3;
// picnob/threads gateway 偶爾會重新生成 guid,只記最新一筆會在 guid 漂移時整批重推。
// 因此保留近 N 筆已處理過的識別子(guid / link 雙鍵)做 rolling dedup。
const SEEN_HISTORY_LIMIT = 50;

const readState = () => {
  const filePath = getDataFile(STATE_FILE);
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return {};
    return JSON.parse(content);
  } catch (err) {
    console.log(`[ERROR] 讀取 ${STATE_FILE} 失敗: ${err.message}`.red);
    return {};
  }
};

const writeState = (state) => {
  const filePath = getDataFile(STATE_FILE);
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.log(`[ERROR] 寫入 ${STATE_FILE} 失敗: ${err.message}`.red);
  }
};

const getSeenList = (state, feedId) => {
  const entry = state[feedId];
  if (!entry) return [];
  // 舊格式相容:state[feedId] 直接是字串 guid
  if (typeof entry === "string") return [`g:${entry}`];
  if (Array.isArray(entry)) return entry;
  if (Array.isArray(entry.seen)) return entry.seen;
  return [];
};

const itemKeys = (item) => {
  const keys = [];
  if (item.guid) keys.push(`g:${item.guid}`);
  // link 是 picnob 的 post permalink,即使 gateway 重生 guid 也應穩定
  if (item.link) keys.push(`l:${item.link}`);
  return keys;
};

const mergeSeen = (newKeys, oldKeys) => {
  const seen = new Set();
  const merged = [];
  for (const k of [...newKeys, ...oldKeys]) {
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(k);
    if (merged.length >= SEEN_HISTORY_LIMIT) break;
  }
  return merged;
};

const truncate = (text, max) => {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "...";
};

// 嘗試將圖片下載成 buffer 包成 attachment,失敗回 null 由 caller 退回直接 URL。
const downloadImageAsAttachment = async (url, filename) => {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://www.instagram.com/",
      },
      maxContentLength: 25 * 1024 * 1024,
    });
    return new AttachmentBuilder(Buffer.from(res.data), { name: filename });
  } catch (err) {
    console.log(`[WARN] RSS 圖片下載失敗 ${url}: ${err.message}`.yellow);
    return null;
  }
};

// liveking (Threads) 圖片是 IG CDN 直連,有 hotlink 保護,Discord embed 經常無法顯示
// → 改用 attachment 上傳。picnob 已是 proxy,直接用 URL 即可。
const needsAttachmentFallback = (feedType) => feedType === "threads";

const FIELD_GETTERS = {
  description: (item) => item.textContent || "",
  title: (item) => item.title || "",
  author: (item) => item.author || "",
};

// 把 feed.filter 編譯成 (item) => boolean。無效 regex 會 log 警告並跳過該條件。
const compileFilter = (filter, feedId) => {
  if (
    !filter ||
    !Array.isArray(filter.conditions) ||
    filter.conditions.length === 0
  ) {
    return () => true;
  }
  const mode = filter.match === "any" ? "any" : "all";
  const checkers = filter.conditions.map((cond) => {
    const getter = FIELD_GETTERS[cond.field] || FIELD_GETTERS.description;
    let regex = null;
    try {
      regex = new RegExp(cond.pattern, "i");
    } catch (err) {
      console.log(
        `[WARN] RSS(${feedId}) 過濾條件 regex 無效 "${cond.pattern}": ${err.message}`
          .yellow
      );
    }
    const negate = cond.op === "not_matches";
    return (item) => {
      if (!regex) return true;
      const matched = regex.test(getter(item));
      return negate ? !matched : matched;
    };
  });
  return (item) =>
    mode === "any"
      ? checkers.some((fn) => fn(item))
      : checkers.every((fn) => fn(item));
};

const buildEmbedsAndFiles = async ({ item, feed }) => {
  const embeds = [];
  const files = [];

  const description = truncate(item.textContent || "", MAX_DESCRIPTION_LENGTH);

  const main = new EmbedBuilder().setColor(0x5865f2);
  if (item.author) main.setAuthor({ name: item.author });
  if (item.link) main.setTitle(item.link).setURL(item.link);
  if (description) main.setDescription(description);
  if (item.pubDate) {
    const ts = new Date(item.pubDate);
    if (!Number.isNaN(ts.getTime())) main.setTimestamp(ts);
  }

  const useAttachment = needsAttachmentFallback(feed.type);
  const usedImages = item.images.slice(0, 1 + EXTRA_IMAGE_COUNT);

  for (let i = 0; i < usedImages.length; i++) {
    const url = usedImages[i];
    let imageRef = url;

    if (useAttachment) {
      const ext = (url.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || "jpg").toLowerCase();
      const filename = `rss_${feed.id}_${Date.now()}_${i}.${ext}`;
      const attachment = await downloadImageAsAttachment(url, filename);
      if (attachment) {
        files.push(attachment);
        imageRef = `attachment://${filename}`;
      }
    }

    if (i === 0) {
      main.setImage(imageRef);
    } else {
      const extra = new EmbedBuilder().setColor(0x5865f2).setImage(imageRef);
      // url 共用主貼文連結時,Discord 會把同 url 的多 embed 合成 gallery
      if (item.link) extra.setURL(item.link);
      embeds.push(extra);
    }
  }

  return { embeds: [main, ...embeds], files };
};

const pollFeed = async (client, feed) => {
  const channel = client.channels.cache.get(feed.channelId);
  if (!channel) {
    console.log(
      `[ERROR] RSS(${feed.id}): 找不到頻道 ${feed.channelId}`.red
    );
    return;
  }

  let items;
  try {
    items = await fetchFeedItems(feed.url);
  } catch (err) {
    console.log(`[ERROR] RSS(${feed.id}) 抓取失敗: ${err.message}`.red);
    return;
  }

  if (!items.length) {
    console.log(`[INFO] RSS(${feed.id}): 無項目`.gray);
    return;
  }

  const state = readState();
  const seenList = getSeenList(state, feed.id);
  const seenSet = new Set(seenList);

  // 首次執行:只記錄最新一筆,避免一次推幾十篇舊文洗版
  if (seenSet.size === 0) {
    state[feed.id] = { seen: itemKeys(items[0]) };
    writeState(state);
    console.log(
      `[INFO] RSS(${feed.id}): 首次執行,記錄最新 guid=${items[0].guid},不推播`.cyan
    );
    return;
  }

  // 用 guid + link 雙鍵 dedup;任一鍵命中已見集合就視為舊文。
  const newItems = items.filter(
    (it) => !itemKeys(it).some((k) => seenSet.has(k))
  );

  if (newItems.length === 0) {
    console.log(`[INFO] RSS(${feed.id}): 沒有新貼文`.gray);
    return;
  }

  // RSS 通常新→舊,推播時要舊→新
  const ordered = [...newItems].reverse();

  const filterFn = compileFilter(feed.filter, feed.id);
  const matchedCount = ordered.filter(filterFn).length;
  console.log(
    `[INFO] RSS(${feed.id}): ${ordered.length} 則新貼文,過濾後 ${matchedCount} 則`.cyan
  );

  // 處理過(包含被 filter 略過)的識別子,等回寫時合併進 seen
  const processedKeys = [];
  for (const item of ordered) {
    if (!filterFn(item)) {
      // 不符合過濾條件也要記入 seen,避免下次重複比對
      processedKeys.unshift(...itemKeys(item));
      continue;
    }
    try {
      const { embeds, files } = await buildEmbedsAndFiles({ item, feed });
      await channel.send({ embeds, files });
      processedKeys.unshift(...itemKeys(item));
    } catch (err) {
      console.log(
        `[ERROR] RSS(${feed.id}) 推播失敗 guid=${item.guid}: ${err.message}`.red
      );
      // 推播失敗就停在這邊,下次 cron 從這篇繼續嘗試,避免跳過漏推
      break;
    }
  }

  if (processedKeys.length === 0) return;

  // 重新讀 state 再寫,避免覆蓋其他 feed 期間的更新
  const latest = readState();
  const merged = mergeSeen(processedKeys, getSeenList(latest, feed.id));
  latest[feed.id] = { seen: merged };
  writeState(latest);
};

const startRssPoller = (client) => {
  const schedule = process.env.RSS_CRON || "0 */2 * * *";
  const timezone = process.env.RSS_TIMEZONE || "Asia/Taipei";

  const runOnce = async () => {
    for (const feed of RSS_FEEDS) {
      try {
        await pollFeed(client, feed);
      } catch (err) {
        console.log(
          `[ERROR] RSS(${feed.id}) 例外: ${err.stack || err.message}`.red
        );
      }
    }
  };

  cron.schedule(schedule, runOnce, { scheduled: true, timezone });

  console.log(
    `[INFO] RSS 推播已排程 ${schedule} (${timezone}), feeds=${RSS_FEEDS.map(
      (f) => f.id
    ).join(",")}`.cyan
  );

  if (process.env.RSS_RUN_ON_START === "true") {
    runOnce();
  }
};

module.exports = { startRssPoller, pollFeed };
