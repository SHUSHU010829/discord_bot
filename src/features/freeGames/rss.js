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
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'");
};

const pickTagText = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : "";
};

const pickAttr = (block, tag, attr) => {
  const m = block.match(
    new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"`, "i")
  );
  return m ? decodeXml(m[1]) : "";
};

// Steam URL: https://store.steampowered.com/app/220/
// Epic URL: https://store.epicgames.com/p/<slug> (no numeric id)
const extractAppId = (link) => {
  if (!link) return null;
  const m = link.match(/\/app\/(\d+)/);
  return m ? Number(m[1]) : null;
};

// LootScraper Atom title 格式:"<Source> (<Type>[, <Duration>]) - <Game Title>"
// e.g. "Steam (Game) - Half-Life 2"
//      "Epic Games (Game, Always Free) - Foo"
//      "Steam (Loot) - Foo: bar bonus pack"
const parseTitle = (title) => {
  if (!title) return { name: null, isDlc: false, duration: null };
  const m = title.match(/^[^(]+\(([^)]*)\)\s*-\s*(.+)$/);
  if (!m) return { name: title.trim(), isDlc: false, duration: null };
  const tagPart = m[1];
  const name = m[2].trim();
  const tags = tagPart.split(",").map((t) => t.trim());
  const isDlc = tags.some((t) => /loot/i.test(t));
  // 第二個 tag (若有) 是 duration,例如 "Always Free" / "Temporary" / "Permanent after Claim"
  const duration = tags[1] || null;
  return { name, isDlc, duration };
};

// content xhtml 內含 <img src="..."/> 與 <li><b>Offer valid to:</b> yyyy-MM-dd HH:mm</li>
const extractImage = (content) => {
  const m = content.match(/<img\s+[^>]*src="([^"]+)"/i);
  return m ? m[1] : null;
};

// 從 content 抓 <li><b>Label:</b> value</li> 形式
const extractLi = (content, label) => {
  const re = new RegExp(
    `<b>${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:</b>\\s*([\\s\\S]*?)</li>`,
    "i"
  );
  const m = content.match(re);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
};

// LootScraper 把 valid_to 用 ISO toFormat("yyyy-MM-dd HH:mm") 輸出,落地時區資訊不見了。
// 經驗值:server 跑 UTC,所以這裡也當 UTC 解。
const parseEndTime = (content) => {
  const text = extractLi(content, "Offer valid to");
  if (!text) return null;
  const dt = DateTime.fromFormat(text, "yyyy-MM-dd HH:mm", { zone: "utc" });
  return dt.isValid ? Math.trunc(dt.toSeconds()) : null;
};

const parseScore = (content) => {
  // "Ratings: Steam 95% (9/10, 12345 recommendations)" 之類
  const ratings = extractLi(content, "Ratings");
  if (!ratings) return null;
  const m = ratings.match(/Steam\s+(\d+(?:\.\d+)?)%/i);
  if (m) return Number(m[1]) / 10; // 對齊舊欄位 0~10 區間
  const meta = ratings.match(/Metacritic\s+(\d+(?:\.\d+)?)/i);
  if (meta) return Number(meta[1]) / 10;
  return null;
};

const parseOriginalPrice = (content) => {
  const text = extractLi(content, "Recommended price \\(Steam\\)");
  if (!text) return null;
  const m = text.match(/([\d.,]+)\s*EUR/i);
  return m ? `€${m[1]}` : text;
};

const parseDescription = (content) => extractLi(content, "Description");

/**
 * 抓 LootScraper Atom feed (https://feed.eikowagenknecht.com/lootscraper_*.xml)。
 * platform 必須是 'epic' | 'steam'。
 *
 * 回傳 [{ platform, appid, name, image, score, originalPrice, chineseSupport,
 *   endTime, isDlc, parentName, description, link, duration }]
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
      Accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  const xml = typeof response.data === "string" ? response.data : "";
  if (!xml) {
    throw new Error(`[freeGames-rss] empty body from ${feedUrl}`);
  }

  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/g) || [];
  return entryBlocks
    .map((block) => {
      const title = pickTagText(block, "title");
      const link = pickAttr(block, "link", "href");
      const content = pickTagText(block, "content");

      if (!title || (!link && !content)) return null;

      const { name, isDlc, duration } = parseTitle(title);
      const appid = extractAppId(link);

      return {
        platform,
        appid,
        name,
        image: extractImage(content),
        score: parseScore(content),
        originalPrice: parseOriginalPrice(content),
        chineseSupport: null, // LootScraper feed 沒這個欄位
        endTime: parseEndTime(content),
        isDlc,
        parentName: null,
        description: parseDescription(content),
        link: link || null,
        duration,
      };
    })
    .filter(Boolean);
};

module.exports = { fetchFreeGamesList };
