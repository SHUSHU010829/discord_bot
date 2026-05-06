const Parser = require("rss-parser");
const cheerio = require("cheerio");

const { parseImages } = require("../utils/parseImages");

// 部分 RSS gateway (例如 discord-news.zeabur.app) 會擋非瀏覽器 UA → 403
const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

/**
 * @typedef {Object} FeedItem
 * @property {string} guid
 * @property {string} title
 * @property {string|null} link
 * @property {string} pubDate
 * @property {string} textContent
 * @property {string[]} images
 * @property {string} author
 */

const stripHtmlToText = (html) => {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $.root().text().replace(/\s+/g, " ").trim();
};

/**
 * Fetch + parse RSS,回傳標準化的 FeedItem 陣列。
 * @param {string} url
 * @returns {Promise<FeedItem[]>}
 */
const fetchFeedItems = async (url) => {
  const feed = await parser.parseURL(url);
  const items = Array.isArray(feed.items) ? feed.items : [];

  return items.map((raw) => {
    const description =
      raw["content:encoded"] ||
      raw.content ||
      raw.contentSnippet ||
      raw.description ||
      "";

    const images = parseImages(description);
    const textContent = stripHtmlToText(description);

    const linkRaw = typeof raw.link === "string" ? raw.link.trim() : "";
    const link = linkRaw ? linkRaw : null;

    const guid = raw.guid || raw.id || raw.link || raw.title || "";

    return {
      guid: String(guid),
      title: raw.title || "",
      link,
      pubDate: raw.isoDate || raw.pubDate || "",
      textContent,
      images,
      author: raw.creator || raw.author || raw["dc:creator"] || "",
    };
  });
};

module.exports = { fetchFeedItems };
