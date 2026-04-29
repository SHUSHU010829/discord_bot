require("colors");
const axios = require("axios");
const { DateTime } = require("luxon");

const DEFAULT_FEED_URL =
  "https://discord-news.zeabur.app/xiaoheihe/discount/pc";

// 解 CDATA / 還原 HTML entity (RSS 通常包 CDATA 但保險處理)
const decodeXml = (str) => {
  if (!str) return "";
  const cdata = str.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  const inner = cdata ? cdata[1] : str;
  return inner
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

const pickTag = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : "";
};

const extractAppId = (link) => {
  const m = link.match(/\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
};

// description 內包含 "评分: 9.6<br/>",抽出來
const extractScore = (description) => {
  const m = description.match(/评分[:：]\s*([\d.]+)/);
  return m ? Number(m[1]) : null;
};

// description 內含 [史低] / [新史低] 文字
const detectLowest = (description) => ({
  isLowest: /\[(?:史低|新史低|超史低)\]/.test(description),
  newLowest: /\[新史低\]/.test(description),
});

// 抽 "截止时间: YYYY-MM-DD" 並轉為 unix seconds
const extractEndTime = (description) => {
  const m = description.match(/截止时间[:：]\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const dt = DateTime.fromISO(m[1], { zone: "Asia/Taipei" }).endOf("day");
  return dt.isValid ? Math.trunc(dt.toSeconds()) : null;
};

// title 是 "中文/English" 形式,只取中文段
const extractName = (title) => {
  if (!title) return null;
  return title.split("/")[0].trim() || null;
};

/**
 * 從自家 RSSHub feed 抓小黑盒折扣清單,parse 成內部統一格式。
 *
 * 回傳:
 *   [{ appid, isLowest, newLowest, score, endTime, rawName }, ...]
 */
const fetchDiscountList = async ({
  feedUrl = DEFAULT_FEED_URL,
  fetcher = axios.get,
} = {}) => {
  const response = await fetcher(feedUrl, {
    timeout: 15000,
    responseType: "text",
    transformResponse: [(data) => data],
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  const xml = typeof response.data === "string" ? response.data : "";
  if (!xml) {
    throw new Error(`[xiaoheihe-rss] empty body from ${feedUrl}`);
  }

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  if (itemBlocks.length === 0) {
    throw new Error(
      `[xiaoheihe-rss] no <item> found in feed (URL: ${feedUrl})`
    );
  }

  const games = itemBlocks
    .map((block) => {
      const title = pickTag(block, "title");
      const link = pickTag(block, "link");
      const description = pickTag(block, "description");

      const appid = extractAppId(link);
      if (!appid) return null;

      const { isLowest, newLowest } = detectLowest(description);

      return {
        appid,
        isLowest,
        newLowest,
        score: extractScore(description),
        endTime: extractEndTime(description),
        rawName: extractName(title),
      };
    })
    .filter(Boolean);

  return games;
};

module.exports = { fetchDiscountList };
