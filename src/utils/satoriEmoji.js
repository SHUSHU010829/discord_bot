const axios = require("axios");

/**
 * Satori 不會 render emoji glyph（NotoSansTC / SpaceMono 都沒有），
 * 用 satori 的 loadAdditionalAsset hook 從 twemoji jsDelivr CDN 抓 SVG 補上。
 *
 * 結果在記憶體 LRU 風格快取，同一個 emoji 不會重複下載。
 */

const CACHE = new Map();
const MAX_CACHE = 256;

function toCodePoint(emoji) {
  // 規範化：去掉 VS-16 (FE0F) 與 ZWJ 序列裡的 FE0F，避免找不到檔
  const codes = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue;
    codes.push(cp.toString(16));
  }
  return codes.join("-");
}

async function fetchTwemojiSvg(emoji) {
  if (CACHE.has(emoji)) return CACHE.get(emoji);

  const code = toCodePoint(emoji);
  if (!code) return null;

  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${code}.svg`;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 5000,
    });
    const svg = Buffer.from(res.data).toString("utf8");
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

    if (CACHE.size >= MAX_CACHE) {
      const firstKey = CACHE.keys().next().value;
      CACHE.delete(firstKey);
    }
    CACHE.set(emoji, dataUri);
    return dataUri;
  } catch (e) {
    return null;
  }
}

/**
 * 直接傳給 satori options.loadAdditionalAsset。
 * Satori 把 emoji segment 抓出來餵給這個 callback，回傳 data URI 它就會 render。
 */
async function loadAdditionalAsset(code, segment) {
  if (code === "emoji") {
    return (await fetchTwemojiSvg(segment)) || segment;
  }
  return segment;
}

module.exports = { loadAdditionalAsset, fetchTwemojiSvg };
