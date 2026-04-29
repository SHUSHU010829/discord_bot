require("colors");
const axios = require("axios");
const { DateTime } = require("luxon");

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

// link 對 Steam 是 store URL,對 Epic/GOG 是 xiaoheihe share API,兩者都帶 appid 數字
const extractAppId = (link) => {
  const m = link.match(/(?:\/app\/|appid=)(\d+)/);
  return m ? Number(m[1]) : null;
};

// title: "[DLC]中文/English" 或 "中文/English"
const parseTitle = (title) => {
  if (!title) return { name: null, isDlc: false };
  const isDlc = title.startsWith("[DLC]");
  const stripped = isDlc ? title.slice(5) : title;
  const name = stripped.split("/")[0].trim() || null;
  return { name, isDlc };
};

const extractImage = (description) => {
  const m = description.match(/<img\s+src="([^"]+)"/i);
  return m ? m[1] : null;
};

const extractField = (description, label) => {
  // 例如 label="评分",description 含 "评分: 9.6<br/>"
  const re = new RegExp(`${label}[:：]\\s*([^<\\n]+?)<`);
  const m = description.match(re);
  return m ? m[1].trim() : null;
};

const extractScore = (description) => {
  const v = extractField(description, "评分");
  return v ? Number(v) : null;
};

const extractOriginalPrice = (description) => extractField(description, "原价");

const extractChineseSupport = (description) => {
  const v = extractField(description, "支持中文");
  if (!v) return null;
  return v.includes("是");
};

const extractParentName = (description) => extractField(description, "本体");

// 截止時間優先用 RSS pubDate (RSSHub 把 end_time 放這),fallback 解 description
const extractEndTime = (block, description) => {
  const pubDate = pickTag(block, "pubDate");
  if (pubDate) {
    const dt = DateTime.fromHTTP(pubDate);
    if (dt.isValid) return Math.trunc(dt.toSeconds());
  }
  const text = extractField(description, "截止时间");
  if (text) {
    const dt = DateTime.fromFormat(text, "yyyy/M/d ah:mm:ss", {
      zone: "Asia/Shanghai",
      locale: "zh-CN",
    });
    if (dt.isValid) return Math.trunc(dt.toSeconds());
  }
  return null;
};

/**
 * 抓「喜加一」RSS。platform 必須是 'epic' | 'steam' | 'gog'。
 * 回傳 [{ platform, appid, name, image, score, originalPrice, chineseSupport,
 *   endTime, isDlc, parentName }]
 */
const fetchFreeGamesList = async ({
  feedUrl,
  platform,
  fetcher = axios.get,
}) => {
  if (!feedUrl) throw new Error("[freeGames-rss] feedUrl is required");

  const response = await fetcher(feedUrl, {
    timeout: 15000,
    responseType: "text",
    transformResponse: [(d) => d],
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  const xml = typeof response.data === "string" ? response.data : "";
  if (!xml) {
    throw new Error(`[freeGames-rss] empty body from ${feedUrl}`);
  }

  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return itemBlocks
    .map((block) => {
      const title = pickTag(block, "title");
      const link = pickTag(block, "link");
      const description = pickTag(block, "description");

      // 「最近沒有喜加一」這種 placeholder item 沒有 link
      if (!link && !description) return null;
      if (/最近没有喜加一/.test(title)) return null;

      const { name, isDlc } = parseTitle(title);
      const appid = extractAppId(link);

      return {
        platform,
        appid,
        name,
        image: extractImage(description),
        score: extractScore(description),
        originalPrice: extractOriginalPrice(description),
        chineseSupport: extractChineseSupport(description),
        endTime: extractEndTime(block, description),
        isDlc,
        parentName: extractParentName(description),
      };
    })
    .filter(Boolean);
};

module.exports = { fetchFreeGamesList };
