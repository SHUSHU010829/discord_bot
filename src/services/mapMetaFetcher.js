// 抓取 Google Maps 連結的 metadata（店名、座標、地址、描述、圖片）。
// 短網址（maps.app.goo.gl / goo.gl/maps）會自動 follow redirect 到完整網址。
// 失敗時回傳 null，不擋住主流程。
//
// 不使用 Google Places API（不需要金鑰），靠 og:title / og:description
// 以及 URL 上的 /maps/place/<name>/@lat,lng 和 !3d/!4d data 區段。

require("colors");

const axios = require("axios");
const cheerio = require("cheerio");

const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscordBot/1.0; +https://discord.com/) Chrome/120 Safari/537.36";

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function parseUrlPlace(url) {
  if (!url) return {};
  const out = {};

  // /maps/place/<name>/@lat,lng,zoom
  const placeMatch = url.match(/\/maps\/place\/([^/?#]+)/);
  if (placeMatch) {
    out.placeName = safeDecode(placeMatch[1]).trim();
  }
  const atMatch = url.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    out.lat = parseFloat(atMatch[1]);
    out.lng = parseFloat(atMatch[2]);
  }

  // data=!3d<lat>!4d<lng> 通常比 @lat,lng 更準（為地點本身的座標而非地圖中心）
  const dataMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dataMatch) {
    out.lat = parseFloat(dataMatch[1]);
    out.lng = parseFloat(dataMatch[2]);
  }

  // q=<query> 或 query=<query>
  const queryMatch = url.match(/[?&](?:q|query)=([^&]+)/);
  if (queryMatch && !out.placeName) {
    out.placeName = safeDecode(queryMatch[1]).trim();
  }

  return out;
}

async function fetchMapMeta(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      // 接受 2xx 與 3xx（理論上 axios 已 follow）
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const finalUrl =
      response.request?.res?.responseUrl || response.config?.url || url;
    const html = typeof response.data === "string" ? response.data : "";

    const fromUrl = parseUrlPlace(finalUrl);
    let ogTitle = null;
    let ogDescription = null;
    let ogImage = null;

    if (html) {
      const $ = cheerio.load(html);
      ogTitle =
        $('meta[property="og:title"]').attr("content") ||
        $('meta[name="og:title"]').attr("content") ||
        $('meta[name="title"]').attr("content") ||
        $("title").first().text() ||
        null;
      ogDescription =
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        null;
      ogImage =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="og:image"]').attr("content") ||
        null;
    }

    const placeName =
      (typeof ogTitle === "string" && ogTitle.trim()) ||
      fromUrl.placeName ||
      null;

    const meta = {
      sourceUrl: url,
      finalUrl,
      placeName: placeName ? String(placeName).trim().slice(0, 120) : null,
      description: ogDescription
        ? String(ogDescription).trim().slice(0, 500)
        : null,
      image: ogImage || null,
      lat: Number.isFinite(fromUrl.lat) ? fromUrl.lat : null,
      lng: Number.isFinite(fromUrl.lng) ? fromUrl.lng : null,
      fetchedAt: new Date(),
    };

    if (!meta.placeName && !meta.description && meta.lat == null) {
      return null;
    }
    return meta;
  } catch (error) {
    const detail = error.response?.status
      ? `HTTP ${error.response.status}`
      : error.code || error.message;
    console.log(`[MapMeta] 抓取失敗 ${url} → ${detail}`.yellow);
    return null;
  }
}

async function fetchMapMetaForUrls(urls, options = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const { delayMs = 200 } = options;
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const meta = await fetchMapMeta(urls[i]);
    if (meta) results.push(meta);
    if (i < urls.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

function formatMapContextForPrompt(metas) {
  if (!Array.isArray(metas) || metas.length === 0) return "";
  const blocks = metas
    .map((m) => {
      const lines = [];
      if (m.placeName) lines.push(`店名：${m.placeName}`);
      if (m.description) lines.push(`描述：${m.description}`);
      if (m.lat != null && m.lng != null) {
        lines.push(`座標：${m.lat},${m.lng}`);
      }
      return lines.join("\n");
    })
    .filter((b) => b.length > 0);
  return blocks.join("\n---\n");
}

module.exports = {
  fetchMapMeta,
  fetchMapMetaForUrls,
  formatMapContextForPrompt,
  parseUrlPlace,
};
